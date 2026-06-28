/**
 * Agent sidebar panel — a thin DOM view over {@link AgentChatController}.
 *
 * Header (title + close), a settings block (provider selector → cloud API key
 * for Claude/OpenAI/Gemini, or a local model picker + load button for WebLLM, or
 * a model-name input for Ollama), a toolbar (review-mode toggle + clear), a
 * conversation list, and an input box whose button toggles between Send and Stop
 * while a run is active. The form controls are ranui Web Components (r-select,
 * r-input, r-button, r-checkbox) — importing each registers its custom element.
 * All orchestration lives in the controller and the LLM factory; this file only
 * builds DOM and forwards events. Loaded behind `?agent=1`.
 */
import 'ranui/button';
import 'ranui/input';
import 'ranui/select';
import 'ranui/checkbox';
import { createEffect, signal } from 'ranui/builder';
import { localStorageGetItem, localStorageSetItem } from 'ranuts/utils';
import { getLanguage, type I18nMessages, t } from '@ranuts/shared/i18n';
import { getEditorApi } from '../editor-bridge';
import { agentTools } from '../tools';
import { createProvider, defaultProviderId, type ProviderId } from '@ranuts/agent-core/llm/factory';
import { getApiKey, setApiKey } from '@ranuts/agent-core/llm/keys';
import { DEFAULT_WEBLLM_MODEL, isModelCached, isWebGPUAvailable, WEBLLM_MODELS, WebLLMProvider } from '@ranuts/agent-core/llm/webllm';
import { ChatView, type ChatViewLabels } from '@ranuts/chat-ui';
import { AgentChatController, type ChatTurn } from './controller';
import { createHistoryStorage, historyToTurns } from './storage';

/** ranui custom elements expose a `value` accessor (r-select / r-input). */
type ValueEl = HTMLElement & { value: string };
type InputEl = ValueEl & { placeholder: string };

/** The r-checkbox `change` event detail (a real boolean). */
type CheckedDetail = CustomEvent<{ checked: boolean }>;

const TURN_LABEL_KEY: Record<ChatTurn['role'], keyof I18nMessages | null> = {
  user: 'agentRoleUser',
  agent: null, // "Agent" — same in every language
  tool: 'agentRoleTool',
  error: 'agentRoleError',
};
const turnLabel = (role: ChatTurn['role']): string => {
  const key = TURN_LABEL_KEY[role];
  return key ? t(key) : 'Agent';
};

const PROVIDER_LABEL_KEY: Record<ProviderId, keyof I18nMessages> = {
  anthropic: 'agentProviderClaude',
  openai: 'agentProviderOpenAI',
  gemini: 'agentProviderGemini',
  webllm: 'agentProviderLocal',
  ollama: 'agentProviderOllama',
};
const PROVIDER_IDS: ProviderId[] = ['anthropic', 'openai', 'gemini', 'webllm', 'ollama'];

const OLLAMA_MODEL_STORAGE_KEY = 'agent_ollama_model';

/** Providers configured with a cloud API key (vs. local WebLLM/Ollama). */
const CLOUD_PROVIDERS: ReadonlySet<ProviderId> = new Set<ProviderId>(['anthropic', 'openai', 'gemini']);

const KEY_PLACEHOLDER: Partial<Record<ProviderId, string>> = {
  anthropic: 'sk-ant-...',
  openai: 'sk-...',
  gemini: 'AIza...',
};

/** Create an r-button with a label and class. */
function ranButton(text: string, className: string): HTMLElement {
  const btn = document.createElement('r-button');
  btn.className = className;
  btn.textContent = text;
  return btn;
}

/** Create an r-select with r-option children and an initial value. */
function ranSelect(className: string, options: Array<{ value: string; label: string }>, value: string): ValueEl {
  const select = document.createElement('r-select') as ValueEl;
  select.className = className;
  for (const option of options) {
    const opt = document.createElement('r-option');
    opt.setAttribute('value', option.value);
    opt.textContent = option.label;
    select.append(opt);
  }
  select.setAttribute('value', value);
  return select;
}

/** Create an r-input of the given type. */
function ranInput(className: string, type: string): InputEl {
  const input = document.createElement('r-input') as InputEl;
  input.className = className;
  input.setAttribute('type', type);
  return input;
}

/** Build the Agent panel, append it to the body, and return its root element. */
/**
 * Singleton handle to the live panel, so external triggers (the AI button
 * injected into OnlyOffice's left menu, posting `agent:toggle`) can open/close
 * it without building a second panel. Set on first {@link createAgentPanel}.
 */
let panelHandle: { setOpen: (open: boolean) => void; isOpen: () => boolean } | null = null;

/** Open the panel (creating it on first use), close it, or flip it. */
export function toggleAgentPanel(): void {
  if (panelHandle) panelHandle.setOpen(!panelHandle.isOpen());
  else createAgentPanel(); // first call creates the panel already open
}

export function createAgentPanel(): HTMLElement {
  // Idempotent: a second call just reveals the existing panel.
  const existing = document.querySelector('.agent-panel');
  if (existing) {
    panelHandle?.setOpen(true);
    return existing as HTMLElement;
  }

  const panel = document.createElement('div');
  panel.className = 'agent-panel';

  // Floating launcher — shown when the panel is closed, reopens it on click.
  const launcher = document.createElement('button');
  launcher.className = 'agent-launcher agent-launcher-hidden';
  launcher.type = 'button';
  launcher.textContent = 'AI';
  launcher.title = t('agentOpenTip');
  let open = true;
  const setOpen = (next: boolean): void => {
    open = next;
    panel.classList.toggle('agent-panel-hidden', !next);
    launcher.classList.toggle('agent-launcher-hidden', next);
    // Dock mode: shrink the editor so the panel takes layout space instead of
    // overlaying the document. CSS keys off this body class.
    document.body.classList.toggle('agent-docked', next);
    // Tell the editor iframe so the injected AI button can show active state.
    // DocsAPI replaces the placeholder with an iframe (name="frameEditor") in #app.
    const frame = document.querySelector<HTMLIFrameElement>('#app iframe');
    frame?.contentWindow?.postMessage({ type: 'agent:state', open: next }, '*');
  };
  panelHandle = { setOpen, isOpen: () => open };
  launcher.addEventListener('click', () => setOpen(true));

  // ── Header ──────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'agent-panel-header';
  const title = document.createElement('span');
  title.className = 'agent-panel-title';
  title.textContent = t('agentTitle');
  const closeBtn = document.createElement('button');
  closeBtn.className = 'agent-panel-close';
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => setOpen(false));
  header.append(title, closeBtn);

  // ── Settings ────────────────────────────────────────────────────────────
  const settings = document.createElement('div');
  settings.className = 'agent-panel-settings';

  const providerSelect = ranSelect(
    'agent-panel-provider',
    PROVIDER_IDS.map((id) => ({ value: id, label: t(PROVIDER_LABEL_KEY[id]) })),
    defaultProviderId(),
  );

  // Cloud: API key input
  const keyInput = ranInput('agent-panel-key-input', 'password');

  // Ollama: local model name input (no key needed)
  const ollamaModelInput = ranInput('agent-panel-ollama-model', 'text');
  ollamaModelInput.value = localStorageGetItem(OLLAMA_MODEL_STORAGE_KEY) || '';
  ollamaModelInput.addEventListener('change', () => {
    controller = null; // different model → rebuild
    localStorageSetItem(OLLAMA_MODEL_STORAGE_KEY, ollamaModelInput.value.trim());
  });

  // Local: model picker + load button
  const modelRow = document.createElement('div');
  modelRow.className = 'agent-panel-model-row';
  const modelSelect = ranSelect(
    'agent-panel-model',
    WEBLLM_MODELS.map((model) => ({ value: model.id, label: `${model.label}（${model.size}）` })),
    DEFAULT_WEBLLM_MODEL,
  );
  const loadBtn = ranButton(t('agentLoadModel'), 'agent-panel-load');
  modelRow.append(modelSelect, loadBtn);

  const note = document.createElement('div');
  note.className = 'agent-panel-note';

  settings.append(providerSelect, keyInput, ollamaModelInput, modelRow, note);

  // ── Toolbar ─────────────────────────────────────────────────────────────
  const toolbar = document.createElement('div');
  toolbar.className = 'agent-panel-toolbar';
  const reviewLabel = document.createElement('label');
  reviewLabel.className = 'agent-panel-review';
  const reviewCheck = document.createElement('r-checkbox');
  const reviewText = document.createElement('span');
  reviewText.textContent = t('agentReviewMode');
  reviewLabel.append(reviewCheck, reviewText);
  const quoteBtn = ranButton(t('agentQuote'), 'agent-panel-quote');
  quoteBtn.title = t('agentQuoteTip');
  const clearBtn = ranButton(t('agentClear'), 'agent-panel-clear');
  toolbar.append(reviewLabel, quoteBtn, clearBtn);

  // ── Conversation + input (reusable chat UI) ──────────────────────────────
  // The message list, streaming, and input box are the framework-free
  // @ranuts/chat-ui ChatView. This panel only wires it to the agent controller.
  const chatLabels = (): ChatViewLabels => ({
    send: t('agentSend'),
    stop: t('agentStop'),
    placeholder: t('agentInputPlaceholder'),
    empty: t('agentInputPlaceholder'),
    role: (role) => turnLabel(role),
  });
  const chat = new ChatView({
    onSend: (text) => void submit(text),
    onStop: () => controller?.stop(),
    labels: chatLabels(),
  });
  const appendTurn = (turn: ChatTurn): void => {
    chat.append(turn);
  };

  // Persist the conversation so a reload keeps it (model context + display).
  const historyStorage = createHistoryStorage();

  // Streaming: ChatView owns the live bubble; just forward deltas and the end.
  // The editor tools must be passed explicitly now that the (editor-agnostic)
  // runtime no longer defaults to them.
  const controllerOptions = {
    tools: agentTools,
    onAgentDelta: (delta: string): void => chat.appendDelta(delta),
    onAgentStreamEnd: (): void => chat.endStream(),
    storage: historyStorage,
  };

  // Restore a previous conversation into the view on load.
  for (const turn of historyToTurns(historyStorage.load())) chat.append(turn);

  // ── Controller wiring ───────────────────────────────────────────────────
  const currentProvider = (): ProviderId => providerSelect.value as ProviderId;

  let controller: AgentChatController | null = null;
  let controllerKind = '';
  let webllmProvider: WebLLMProvider | null = null;

  // Reflect whether the selected local model is already cached (no re-download).
  const updateLocalHint = async (): Promise<void> => {
    if (currentProvider() !== 'webllm') return;
    if (!isWebGPUAvailable()) {
      note.textContent = t('agentNoWebGPU');
      return;
    }
    const model = WEBLLM_MODELS.find((m) => m.id === modelSelect.value);
    const size = model?.size ?? '';
    const id = modelSelect.value;
    note.textContent = t('agentCheckingCache');
    const cached = await isModelCached(id);
    if (currentProvider() !== 'webllm' || modelSelect.value !== id) return; // changed meanwhile
    note.textContent = cached ? t('agentModelCached') : t('agentModelFirstDownload').replace('{size}', size);
  };

  const syncProviderUi = (): void => {
    const id = currentProvider();
    const isCloud = CLOUD_PROVIDERS.has(id);
    keyInput.style.display = isCloud ? '' : 'none';
    modelRow.style.display = id === 'webllm' ? '' : 'none';
    ollamaModelInput.style.display = id === 'ollama' ? '' : 'none';
    if (isCloud) {
      keyInput.placeholder = KEY_PLACEHOLDER[id] ?? '';
      keyInput.value = getApiKey(id) ?? '';
      note.textContent = '';
    } else if (id === 'ollama') {
      ollamaModelInput.placeholder = t('agentOllamaModelPlaceholder');
      note.textContent = t('agentOllamaHint');
    } else {
      void updateLocalHint();
    }
  };
  providerSelect.addEventListener('change', () => {
    controller = null;
    syncProviderUi();
  });
  modelSelect.addEventListener('change', () => {
    controller = null; // different model → rebuild
    void updateLocalHint();
  });
  keyInput.addEventListener('change', () => {
    const id = currentProvider();
    if (CLOUD_PROVIDERS.has(id)) setApiKey(id, keyInput.value.trim());
  });
  syncProviderUi();

  const buildController = (): AgentChatController | null => {
    const id = currentProvider();
    if (id === 'webllm') {
      if (!isWebGPUAvailable()) return null;
      const kind = `webllm:${modelSelect.value}`;
      if (!controller || controllerKind !== kind) {
        webllmProvider = new WebLLMProvider({
          model: modelSelect.value,
          onProgress: (p) => (note.textContent = p.text),
        });
        controller = new AgentChatController(webllmProvider, appendTurn, controllerOptions);
        controllerKind = kind;
      }
      return controller;
    }
    if (id === 'ollama') {
      const model = ollamaModelInput.value.trim() || undefined;
      const kind = `ollama:${model ?? ''}`;
      if (!controller || controllerKind !== kind) {
        controller = new AgentChatController(
          createProvider('ollama', { ollamaModel: model }),
          appendTurn,
          controllerOptions,
        );
        controllerKind = kind;
        webllmProvider = null;
      }
      return controller;
    }
    const key = keyInput.value.trim();
    if (!key) return null;
    const kind = `${id}:${key}`;
    if (!controller || controllerKind !== kind) {
      controller = new AgentChatController(createProvider(id, { apiKey: key }), appendTurn, controllerOptions);
      controllerKind = kind;
      webllmProvider = null;
    }
    return controller;
  };

  loadBtn.addEventListener('click', async () => {
    if (!isWebGPUAvailable()) {
      note.textContent = t('agentNoWebGPU');
      return;
    }
    buildController();
    loadBtn.setAttribute('disabled', '');
    try {
      await webllmProvider?.preload();
      note.textContent = t('agentModelLoaded');
    } catch (error) {
      appendTurn({ role: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      loadBtn.removeAttribute('disabled');
    }
  });

  // ChatView owns the Send/Stop button, Enter-to-send, and the input lock; this
  // just runs a turn. `submit` is passed to ChatView's onSend above.
  const submit = async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const ctl = buildController();
    if (!ctl) {
      chat.append({
        role: 'error',
        text: currentProvider() === 'webllm' ? t('agentNoWebGPU') : t('agentNeedKey'),
      });
      return;
    }
    chat.setRunning(true);
    try {
      await ctl.send(trimmed);
    } finally {
      chat.setRunning(false);
      chat.focus();
    }
  };
  clearBtn.addEventListener('click', () => {
    controller?.reset();
    historyStorage.clear(); // also clear when no controller has been built yet
    chat.clear();
  });

  // Quote the current selection (Word text / Excel cells / PPT shape text) into
  // the input so the user can ask about it. Works across editor types because
  // pluginMethod_GetSelectedText is part of the shared plugin command API.
  quoteBtn.addEventListener('click', () => {
    const selected = getEditorApi()?.pluginMethod_GetSelectedText() ?? '';
    if (!selected.trim()) {
      appendTurn({ role: 'error', text: t('agentNoSelection') });
      return;
    }
    const quoted = `${t('agentQuotePrefix')}\n"""\n${selected.replace(/\r\n/g, '\n')}\n"""\n\n`;
    chat.setInput(quoted + chat.getInput());
    chat.focus();
  });

  // Review-mode toggle reads/sets track-changes directly on the editor. r-checkbox
  // reports the new state via the change event's detail (a real boolean), and its
  // initial state is set through the `checked` attribute.
  const api = getEditorApi();
  // Track-changes is a Word/Spreadsheet API; the presentation editor has no
  // asc_IsTrackRevisions, so feature-detect before using it (calling a missing
  // method would otherwise abort the whole panel build).
  const canReview = !!api && typeof api.asc_IsTrackRevisions === 'function';
  if (!canReview) reviewCheck.setAttribute('disabled', '');
  if (canReview) reviewCheck.setAttribute('checked', String(!!api!.asc_IsTrackRevisions()));
  reviewCheck.addEventListener('change', (e: Event) => {
    getEditorApi()?.asc_SetTrackRevisions?.((e as CheckedDetail).detail.checked);
  });

  // Reactive labels: a `lang` signal bumped on languagechange drives one effect
  // that re-applies every translatable label — replacing a manual re-render pass.
  const [lang, setLang] = signal(getLanguage());
  window.addEventListener('languagechange', () => setLang(getLanguage()));
  createEffect(() => {
    lang(); // subscribe: re-run whenever the language changes
    launcher.title = t('agentOpenTip');
    title.textContent = t('agentTitle');
    const selected = providerSelect.value;
    for (const opt of providerSelect.querySelectorAll('r-option')) {
      opt.textContent = t(PROVIDER_LABEL_KEY[(opt.getAttribute('value') as ProviderId) ?? 'anthropic']);
    }
    providerSelect.setAttribute('value', selected); // nudge the closed label to retranslate
    loadBtn.textContent = t('agentLoadModel');
    reviewText.textContent = t('agentReviewMode');
    quoteBtn.textContent = t('agentQuote');
    quoteBtn.title = t('agentQuoteTip');
    clearBtn.textContent = t('agentClear');
    chat.setLabels(chatLabels()); // Send/Stop/placeholder/empty + role chips
    syncProviderUi(); // refresh key placeholder / model hint in the new language
  });

  panel.append(header, settings, toolbar, chat.el);
  document.body.append(panel, launcher);
  setOpen(true); // start open + docked
  return panel;
}
