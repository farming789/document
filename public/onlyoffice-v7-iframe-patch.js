/**
 * OnlyOffice v7 iframe patch — injected into each editor iframe before SDK scripts.
 *
 * v7 SDK works without AscDesktopEditor (checks presence before using it), so we only
 * need one thing: rewrite font XHR requests to /fonts/<mapped>.
 *
 * v7 cell SDK requests fonts via two schemes observed in the wild:
 *   1. ascdesktop://fonts/<file>   — Desktop protocol (expected browser fallback)
 *   2. c:\Windows\Fonts\<file>    — Windows absolute path (when SDK detects non-Mac UA)
 *
 * Without this patch, both schemes silently fail in the browser, causing CJK characters
 * (dates, Chinese text, etc.) to render as blank or garbled glyphs (#62, #64).
 *
 * Paths are computed relative to this script's own URL so the patch works regardless
 * of the deployment base path (e.g. /document/ on GitHub Pages vs / locally).
 */
(function () {
  // Polyfill requestIdleCallback / cancelIdleCallback for Safari (#84).
  // The v7 SDK calls requestIdleCallback() bare (unprefixed) in several places
  // (word/cell/slide sdk-all-min.js). Older Safari has no such global, throwing
  // "ReferenceError: Can't find variable: requestIdleCallback" during init.
  // This runs in the iframe window before the SDK scripts load.
  if (typeof window.requestIdleCallback !== 'function') {
    window.requestIdleCallback = function (cb) {
      var start = Date.now();
      return window.setTimeout(function () {
        cb({
          didTimeout: false,
          timeRemaining: function () {
            return Math.max(0, 50 - (Date.now() - start));
          },
        });
      }, 1);
    };
    window.cancelIdleCallback = function (id) {
      window.clearTimeout(id);
    };
  }

  // Derive deployment root from this script's URL.
  // Script lives at <root>/onlyoffice-v7-iframe-patch.js, so strip the filename.
  var _base =
    document.currentScript && document.currentScript.src ? document.currentScript.src.replace(/[^/]+$/, '') : '/';

  // Fetch font map early — resolves well before SDK requests any fonts.
  var fontMap = {};
  fetch(_base + 'font-map.json')
    .then(function (r) {
      return r.json();
    })
    .then(function (m) {
      delete m._comment;
      fontMap = m;
    })
    .catch(function () {});

  var FALLBACK = 'NotoSansSC-VF.ttf';

  // Font remap is only needed in the SPREADSHEET (cell) editor, where v7's cell
  // SDK requests CJK fonts via ascdesktop:// / Windows paths that fail in the
  // browser (#62, #64). The Word and slide editors render text by glyph-ID
  // against the served font's glyph table; substituting a different TTF shifts
  // every glyph (Calibri style names / "Click to add title" → garbled). Letting
  // the request fail there makes the engine use its built-in glyph data, which is
  // correct. So: enable remap ONLY in the spreadsheet editor.
  var DISABLE_FONT_REMAP = window.location.pathname.indexOf('spreadsheeteditor') === -1;

  function extractFilename(path) {
    // Extract bare filename from any path (forward slash, backslash, or mixed)
    return path.split(/[/\\]/).pop().toLowerCase();
  }

  var origOpen = window.XMLHttpRequest.prototype.open;
  window.XMLHttpRequest.prototype.open = function (method, url) {
    if (!DISABLE_FONT_REMAP && typeof url === 'string') {
      var fn;
      if (url.indexOf('ascdesktop://fonts/') === 0) {
        // Scheme 1: ascdesktop://fonts/<file> or ascdesktop://fonts/C:\Windows\Fonts\<file>
        fn = extractFilename(url.slice(19));
        arguments[1] = _base + 'fonts/' + (fontMap[fn] || FALLBACK);
      } else if (/^[a-zA-Z]:[/\\]/.test(url)) {
        // Scheme 2: Windows absolute path like c:\Windows\Fonts\arial.ttf
        fn = extractFilename(url);
        arguments[1] = _base + 'fonts/' + (fontMap[fn] || FALLBACK);
      } else if (url.indexOf('/fonts/') !== -1) {
        // Remap already-relative /fonts/<file> requests via font-map
        fn = url.slice(url.lastIndexOf('/fonts/') + 7).toLowerCase();
        if (fontMap[fn]) arguments[1] = _base + 'fonts/' + fontMap[fn];
      }
    }
    return origOpen.apply(this, arguments);
  };

  // ── AI button in OnlyOffice's left menu ───────────────────────────────────
  // The editor's left rail (#left-menu) is rendered at runtime by app.js with
  // icon buttons of class .btn-category (search, navigation, comments, ...).
  // We add a matching "AI" button there. It can't reach the agent panel (that
  // lives in the parent window), so clicking it posts `agent:toggle` upward.
  function injectAiButton() {
    if (document.getElementById('btn-ai')) return;
    // Put the AI button in the RIGHT menu — the same side the panel docks on, so
    // the trigger sits next to what it opens. Right-menu buttons are .btn-category
    // (with an `arrow-left` modifier + content-target) inside #right-menu.
    var sample = document.querySelector('#right-menu .btn-category');
    if (!sample || !sample.parentNode) return; // right menu not rendered yet
    var container = sample.parentNode;

    var btn = document.createElement(sample.tagName);
    btn.id = 'btn-ai';
    // Reuse the native button's classes for sizing/hover, minus transient state
    // and the arrow-left marker (those belong to OnlyOffice's own panel toggles).
    btn.className = sample.className
      .replace(/\b(active|disabled|arrow-left)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    btn.title = 'AI';
    btn.innerHTML = '<span class="agent-ai-label">AI</span>';
    btn.addEventListener('click', function () {
      // The agent panel lives in the top page. Same-origin: call its toggle
      // directly; fall back to postMessage if that's blocked.
      var top = window.top || window.parent;
      try {
        if (top && top.__toggleAgentPanel) {
          top.__toggleAgentPanel();
          return;
        }
      } catch (e) {
        /* cross-origin or not ready — fall through to postMessage */
      }
      top.postMessage({ type: 'agent:toggle' }, '*');
    });

    // Place it at the top of the right rail, above the first settings button.
    container.insertBefore(btn, sample);
  }

  function ensureAiButtonStyles() {
    if (document.getElementById('agent-ai-style')) return;
    var style = document.createElement('style');
    style.id = 'agent-ai-style';
    style.textContent =
      '#btn-ai{cursor:pointer;display:flex;align-items:center;justify-content:center;}' +
      '#btn-ai .agent-ai-label{font-weight:700;font-size:12px;letter-spacing:.5px;color:#444;}';
    (document.head || document.documentElement).appendChild(style);
  }

  // The AI button is opt-in: it only appears when the top page enabled the agent
  // feature (via ?agent=1). The top page (same-origin) exposes `__agentEnabled`;
  // if we can't read it (cross-origin embed) default to hidden.
  function agentEnabled() {
    try {
      var w = window.top || window.parent;
      return !!(w && w.__agentEnabled);
    } catch (e) {
      return false;
    }
  }

  function startAiButtonInjection() {
    if (!agentEnabled()) return; // no ?agent=1 → don't inject the AI button
    ensureAiButtonStyles();
    injectAiButton();
    // The left menu renders asynchronously and may re-render; keep the button
    // present by re-checking on DOM mutations.
    var obs = new MutationObserver(function () {
      injectAiButton();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  // Reflect the panel's open/closed state on the AI button (the panel lives in
  // the top page and posts `agent:state` whenever it toggles).
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'agent:state') return;
    var btn = document.getElementById('btn-ai');
    if (btn) btn.classList.toggle('active', !!event.data.open);
  });

  // ── Search / scroll-to-paragraph handler ────────────────────────────────
  // Accepts { type: 'document:execute-command', payload: { action: 'search', text: '...', direction: 'next'|'prev' } }
  window.addEventListener('message', function (event) {
    var d = event.data;
    if (!d || d.type !== 'document:execute-command') return;
    var p = d.payload || {};
    if (p.action !== 'search') return;
    var text = p.text;
    if (!text) return;
    var isForward = p.direction !== 'prev';

    function doSearch() {
      var ed = window.Asc && window.Asc.editor;
      if (!ed) { console.warn('[SearchPatch] Asc.editor not ready'); return; }

      try {
        // Enable search result highlighting
        if (typeof ed.asc_selectSearchingResults === 'function') {
          ed.asc_selectSearchingResults(true);
        }
        var result = 0;
        var AscCommon = window.AscCommon;
        if (AscCommon && typeof AscCommon.CSearchSettings === 'function' && typeof ed.asc_findText === 'function') {
          var s = new AscCommon.CSearchSettings();
          s.put_Text(text);
          result = ed.asc_findText(s, isForward);
        } else if (typeof ed.asc_findText === 'function') {
          result = ed.asc_findText(text, isForward);
        }
        console.log('[SearchPatch] asc_findText result count:', result);
        // Try to scroll to the found selection
        if (result > 0 && ed.ma && typeof ed.ma.oee === 'function') {
          try { ed.ma.oee(); } catch(e2) {}
        }
      } catch (e) {
        console.error('[SearchPatch] search error:', e);
      }
    }

    // If editor not ready yet, retry a few times
    if (window.Asc && window.Asc.editor) {
      doSearch();
    } else {
      var retries = 0;
      var timer = setInterval(function () {
        retries++;
        if (window.Asc && window.Asc.editor) {
          clearInterval(timer);
          doSearch();
        } else if (retries >= 30) {
          clearInterval(timer);
          console.warn('[SearchPatch] Asc.editor not ready after 15s');
        }
      }, 500);
    }
  });

  // ── Revision accept handler ───────────────────────────────────────────
  // Accepts { type: 'document:apply-revision', payload: { oldText: '...', newText: '...' } }
  // Formats old text as red strikethrough, appends new text with light-blue background.
  window.addEventListener('message', function (event) {
    var d = event.data;
    if (!d || d.type !== 'document:apply-revision') return;
    var p = d.payload || {};
    var targetOldText = String(p.oldText || '').trim();
    var targetNewText = String(p.newText || '').trim();
    if (!targetOldText) return;

    function escapeHtml(text) {
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function doApplyRevision() {
      var ed = window.Asc && window.Asc.editor;
      if (!ed) { console.warn('[RevisionPatch] Asc.editor not ready'); return; }

      try {
        var AscCommon = window.AscCommon;

        // ── Step 1: Detect font from a small MIDDLE substring ──────────────
        // Instead of trying to read font from the full (possibly mixed-font)
        // selection, we first select a ~10-char slice from the middle — almost
        // certainly single-font — then re-select the full old text for PasteHtml.
        var fontStyle = '';
        try {
          if (typeof ed.Uze === 'function') {
            // Pick a probe: short text → use whole; long text → ~10 chars from middle
            var probeText;
            if (targetOldText.length <= 15) {
              probeText = targetOldText;
            } else {
              var midStart = Math.max(0, Math.floor(targetOldText.length / 2) - 5);
              probeText = targetOldText.substring(midStart, midStart + 10);
            }

            if (probeText.length >= 2 && typeof ed.asc_findText === 'function') {
              // Select the probe substring
              if (AscCommon && typeof AscCommon.CSearchSettings === 'function') {
                var probeSearch = new AscCommon.CSearchSettings();
                probeSearch.put_Text(probeText);
                ed.asc_findText(probeSearch, true);
              } else {
                ed.asc_findText(probeText, true);
              }

              // Read font from this single-font probe selection
              var uz = ed.Uze();
              if (uz && uz.ab) {
                var ab = uz.ab;
                var fontName = (ab.gf && ab.gf.Aa) || 'SimSun';
                var fontSize = ab.Eb || 0;
                if (fontSize) fontStyle += 'font-size:' + fontSize + 'pt;';
                fontStyle += 'font-family:\'' + fontName + '\';';
              }
            }
          }
        } catch (_) {}
        if (!fontStyle) fontStyle = 'font-family:\'SimSun\';'; // ultimate fallback

        // ── Step 2: Select the FULL old text for PasteHtml replacement ────
        if (AscCommon && typeof AscCommon.CSearchSettings === 'function' && typeof ed.asc_findText === 'function') {
          var s = new AscCommon.CSearchSettings();
          s.put_Text(targetOldText);
          ed.asc_findText(s, true);
        } else if (typeof ed.asc_findText === 'function') {
          ed.asc_findText(targetOldText, true);
        }

        // ── Step 3: Replace selection with formatted HTML ──────────────────
        // font-family is explicitly set (detected above or SimSun fallback).
        // background-color deliberately omitted (use SetHighlight instead).
        if (typeof ed.pluginMethod_PasteHtml === 'function') {
          var escapedOld = escapeHtml(targetOldText).replace(/\r\n|\r|\n/g, '<br/>');
          var escapedNew = escapeHtml(targetNewText).replace(/\r\n|\r|\n/g, '<br/>');
          var html =
            '<div style="' + fontStyle + '">' +
            '<span style="color:#FF0000;text-decoration:line-through">' + escapedOld + '</span>' +
            '<span>&nbsp;&nbsp;</span>' +
            '<span>' + escapedNew + '</span>' +
            '</div>';
          ed.pluginMethod_PasteHtml(html);
          console.log('[RevisionPatch] revision applied, old:', targetOldText.length, 'new:', targetNewText.length);
        }

        // ── Step 4: Highlight new text with native SetHighlight ────────────
        if (targetNewText && typeof ed.SetHighlight === 'function') {
          setTimeout(function () {
            try {
              if (AscCommon && typeof AscCommon.CSearchSettings === 'function' && typeof ed.asc_findText === 'function') {
                var ss2 = new AscCommon.CSearchSettings();
                ss2.put_Text(targetNewText);
                ed.asc_findText(ss2, true);
              } else if (typeof ed.asc_findText === 'function') {
                ed.asc_findText(targetNewText, true);
              }
              ed.SetHighlight('cyan');
            } catch (e2) {
              console.warn('[RevisionPatch] SetHighlight failed:', e2);
            }
          }, 100);
        }
      } catch (e) {
        console.error('[RevisionPatch] apply revision error:', e);
      }
    }

    if (window.Asc && window.Asc.editor) {
      doApplyRevision();
    } else {
      var retries = 0;
      var timer = setInterval(function () {
        retries++;
        if (window.Asc && window.Asc.editor) {
          clearInterval(timer);
          doApplyRevision();
        } else if (retries >= 30) {
          clearInterval(timer);
          console.warn('[RevisionPatch] Asc.editor not ready after 15s');
        }
      }, 500);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startAiButtonInjection);
  } else {
    startAiButtonInjection();
  }
})();
