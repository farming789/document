/**
 * Agent sidebar panel — a thin DOM view over {@link AgentChatController}.
 *
 * Header (title + close), a settings row (provider selector + Claude API key /
 * WebLLM progress), a toolbar (review-mode toggle + clear), a scrolling
 * conversation list, and an input box whose button toggles between Send and Stop
 * while a run is active. All orchestration lives in the controller and the LLM
 * factory; this file only builds DOM and forwards events. Loaded behind
 * `?agent=1`.
 */
import { getEditorApi } from '../editor-bridge';
import { createProvider, defaultProviderId, type ProviderId } from '../llm/factory';
import { getApiKey, setApiKey } from '../llm/keys';
import { isWebGPUAvailable } from '../llm/webllm';
import { AgentChatController, type ChatTurn } from './controller';

const TURN_LABEL: Record<ChatTurn['role'], string> = {
  user: '你',
  agent: 'Agent',
  tool: '工具',
  error: '错误',
};

/** Build the Agent panel, append it to the body, and return its root element. */
export function createAgentPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'agent-panel';

  // ── Header ──────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'agent-panel-header';
  const title = document.createElement('span');
  title.className = 'agent-panel-title';
  title.textContent = 'AI 助手';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'agent-panel-close';
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => panel.classList.add('agent-panel-hidden'));
  header.append(title, closeBtn);

  // ── Settings: provider + key / progress ─────────────────────────────────
  const settings = document.createElement('div');
  settings.className = 'agent-panel-settings';

  const providerSelect = document.createElement('select');
  providerSelect.className = 'agent-panel-provider';
  for (const [value, label] of [
    ['anthropic', 'Claude（云端，需 API Key）'],
    ['webllm', '本地离线（WebLLM，需 WebGPU）'],
  ]) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    providerSelect.append(opt);
  }
  providerSelect.value = defaultProviderId();

  const keyInput = document.createElement('input');
  keyInput.className = 'agent-panel-key-input';
  keyInput.type = 'password';
  keyInput.placeholder = 'sk-ant-...';
  keyInput.value = getApiKey('anthropic') ?? '';
  keyInput.addEventListener('change', () => setApiKey('anthropic', keyInput.value.trim()));

  const note = document.createElement('div');
  note.className = 'agent-panel-note';

  settings.append(providerSelect, keyInput, note);

  // ── Toolbar: review-mode toggle + clear ─────────────────────────────────
  const toolbar = document.createElement('div');
  toolbar.className = 'agent-panel-toolbar';
  const reviewLabel = document.createElement('label');
  reviewLabel.className = 'agent-panel-review';
  const reviewCheck = document.createElement('input');
  reviewCheck.type = 'checkbox';
  reviewLabel.append(reviewCheck, document.createTextNode(' 修订模式'));
  const clearBtn = document.createElement('button');
  clearBtn.className = 'agent-panel-clear';
  clearBtn.type = 'button';
  clearBtn.textContent = '清空对话';
  toolbar.append(reviewLabel, clearBtn);

  // ── Conversation ────────────────────────────────────────────────────────
  const conversation = document.createElement('div');
  conversation.className = 'agent-panel-conversation';
  const appendTurn = (turn: ChatTurn): void => {
    const row = document.createElement('div');
    row.className = `agent-turn agent-turn-${turn.role}`;
    const who = document.createElement('span');
    who.className = 'agent-turn-role';
    who.textContent = TURN_LABEL[turn.role];
    const body = document.createElement('div');
    body.className = 'agent-turn-text';
    body.textContent = turn.text;
    row.append(who, body);
    conversation.append(row);
    conversation.scrollTop = conversation.scrollHeight;
  };

  // ── Input ───────────────────────────────────────────────────────────────
  const inputRow = document.createElement('div');
  inputRow.className = 'agent-panel-input-row';
  const textarea = document.createElement('textarea');
  textarea.className = 'agent-panel-input';
  textarea.rows = 2;
  textarea.placeholder = '让 AI 帮你编辑文档…（Enter 发送，Shift+Enter 换行）';
  const sendBtn = document.createElement('button');
  sendBtn.className = 'agent-panel-send';
  sendBtn.type = 'button';
  sendBtn.textContent = '发送';
  inputRow.append(textarea, sendBtn);

  // ── Controller wiring ───────────────────────────────────────────────────
  let controller: AgentChatController | null = null;
  let controllerKind = '';

  const syncProviderUi = (): void => {
    const offline = providerSelect.value === 'webllm';
    keyInput.style.display = offline ? 'none' : '';
    note.textContent = offline
      ? isWebGPUAvailable()
        ? '首次使用需下载模型（约 1.8 GB），之后浏览器缓存。'
        : '当前浏览器不支持 WebGPU，无法使用本地模式。'
      : '';
  };
  providerSelect.addEventListener('change', () => {
    controller = null; // force rebuild on the new provider
    syncProviderUi();
  });
  syncProviderUi();

  const getController = (): AgentChatController | null => {
    const id = providerSelect.value as ProviderId;
    if (id === 'anthropic') {
      const key = keyInput.value.trim();
      if (!key) return null;
      const kind = `anthropic:${key}`;
      if (!controller || controllerKind !== kind) {
        controller = new AgentChatController(createProvider('anthropic', { apiKey: key }), appendTurn);
        controllerKind = kind;
      }
    } else {
      if (!isWebGPUAvailable()) return null;
      if (!controller || controllerKind !== 'webllm') {
        controller = new AgentChatController(
          createProvider('webllm', { onProgress: (p) => (note.textContent = p.text) }),
          appendTurn,
        );
        controllerKind = 'webllm';
      }
    }
    return controller;
  };

  let running = false;
  const setRunning = (value: boolean): void => {
    running = value;
    sendBtn.textContent = value ? '停止' : '发送';
    textarea.disabled = value;
  };

  const submit = async (): Promise<void> => {
    const text = textarea.value.trim();
    if (!text) return;
    const ctl = getController();
    if (!ctl) {
      appendTurn({
        role: 'error',
        text: providerSelect.value === 'webllm' ? '当前浏览器不支持 WebGPU。' : '请先填写 Claude API Key。',
      });
      return;
    }
    textarea.value = '';
    setRunning(true);
    try {
      await ctl.send(text);
    } finally {
      setRunning(false);
      textarea.focus();
    }
  };

  sendBtn.addEventListener('click', () => {
    if (running) controller?.stop();
    else void submit();
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  });

  clearBtn.addEventListener('click', () => {
    controller?.reset();
    conversation.replaceChildren();
  });

  // Review-mode toggle reads/sets track-changes directly on the editor.
  const refreshReview = (): void => {
    const api = getEditorApi();
    reviewCheck.disabled = !api;
    if (api) reviewCheck.checked = !!api.asc_IsTrackRevisions();
  };
  reviewCheck.addEventListener('change', () => {
    const api = getEditorApi();
    if (!api) return;
    api.asc_SetTrackRevisions(reviewCheck.checked);
  });
  refreshReview();

  panel.append(header, settings, toolbar, conversation, inputRow);
  document.body.appendChild(panel);
  return panel;
}
