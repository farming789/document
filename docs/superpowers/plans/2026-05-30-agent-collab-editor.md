# Agent 协同编辑实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 OnlyOffice 本地编辑器中内置 Agent 协同编辑能力。用户无需本地部署，打开浏览器即可完成：文档编辑、Agent 辅助生成、评论协作、修订确认等全流程。所有推理和 API 调用均在浏览器内完成，无中间服务器，符合项目"纯本地、零服务器"定位。

**Architecture:** OnlyOffice Plugin API 作为工具层，WebLLM（离线模式）或 pi agent Direct Mode（云端模式）作为 LLM 推理层，OnlyOffice 修订/评论模式作为人机协作界面，现有 `embed-api.ts` / `onlyoffice-editor.ts` 保持不变作为底层。

**Tech Stack:** OnlyOffice Plugin API (`window.Asc.plugin`), WebLLM (`@mlc-ai/web-llm`), pi agent (`@earendil-works/pi-web-ui`), TypeScript, Vite, WebGPU, Cache API（模型缓存）, localStorage（配置）。

**前置说明：** 整个方案成立的关键前置条件是 **阶段零：验证 Plugin API**。若离线版 OnlyOffice Web Apps 的 Plugin API 不完整，后续阶段需切换到 OnlyOffice Docs Server 方案，工作量会显著增加。

---

## LLM 推理层选型

本方案支持两种推理模式，用户可在设置中切换：

### 模式 A：离线模式（WebLLM）

**完全在浏览器内推理，零网络请求，无需 API Key。**

| 推荐模型 | 量化大小 | Tool calling | 推理速度（典型 GPU） |
|---|---|---|---|
| `Phi-3.5-mini-instruct` | ~1.8 GB | ✅ 原生支持 | ~71 tokens/s |
| `Llama-3.2-3B-Instruct` | ~1.8 GB | ✅ 原生支持 | ~60 tokens/s |
| `Llama-3.2-1B-Instruct` | ~0.6 GB | ⚠️ 质量较低 | ~120 tokens/s |

- **首次使用**：需下载模型（1.8 GB），之后缓存在浏览器 Cache API / IndexedDB 中，下次秒开
- **硬件要求**：WebGPU 支持（Chrome 113+、Edge、Firefox 119+、Safari 18+）；独立 GPU 体验最佳，集成 GPU 速度约慢 2–5 倍
- **隐私**：推理完全本地，无任何数据离开设备

**实现方式：**
```typescript
import { CreateMLCEngine } from '@mlc-ai/web-llm';

const engine = await CreateMLCEngine('Phi-3.5-mini-instruct', {
  initProgressCallback: (progress) => updateLoadingUI(progress),
});

const response = await engine.chat.completions.create({
  messages: [{ role: 'user', content: userPrompt }],
  tools: agentTools,      // 与 OpenAI tool-use 格式兼容
  tool_choice: 'auto',
});
```

### 模式 B：云端模式（pi agent Direct Mode）

**LLM 调用直接从浏览器发往外部 Provider，不经过本项目服务器。**

- 支持 Anthropic Claude、OpenAI、Gemini、Ollama（本地）
- API Key 存储在 localStorage，不离开用户设备
- 无需下载模型，响应质量更高（GPT-4 / Claude 级别）
- 适合对速度和质量要求更高的用户

### 模式选择策略

```
用户首次访问
  ├─ WebGPU 可用？
  │   ├─ 是 → 推荐离线模式，提示"首次需下载 1.8 GB 模型"
  │   └─ 否 → 自动降级到云端模式，提示输入 API Key
  └─ 用户可随时在设置中切换
```

---

## 阶段零：验证 Plugin API 可用性

> 预估时间：1 天。决定后续所有工作量上限，必须优先完成。

- [ ] 在 `public/plugins/agent-probe/` 下新建最小插件，包含 `pluginCode.js` 和 `config.json`：

```json
// config.json
{
  "name": "agent-probe",
  "guid": "asc.{00000000-0000-0000-0000-000000000001}",
  "version": "1.0.0",
  "variations": [{
    "description": "API probe",
    "url": "index.html",
    "initDataType": "none",
    "isViewer": false,
    "editorsSupport": ["word", "cell", "slide"]
  }]
}
```

```javascript
// pluginCode.js
window.Asc.plugin.init = function () {
  // 测试 PasteHtml
  this.callCommand(function () {
    const doc = Api.GetDocument();
    const para = Api.CreateParagraph();
    para.AddText('[PROBE] Plugin API works');
    doc.InsertContent([para], 0);
  }, true);
};
window.Asc.plugin.button = function () {};
```

- [ ] 在 `lib/onlyoffice-editor.ts` 的 `createEditorInstance` 配置中启用插件加载，指向 `./plugins/agent-probe/config.json`
- [ ] 本地运行 `pnpm dev`，打开文档后验证：
  - `window.Asc.plugin` 对象存在
  - `callCommand` / `PasteHtml` 可执行
  - `AddComment` API 可调用（单独测试）
  - Review（修订）模式可通过 API 开启

- [ ] 记录结论到本文件末尾的"验证结果"章节

**若 Plugin API 不可用：** 评估升级路径（OnlyOffice Docs Server Docker 部署），更新本计划。

---

## 阶段一：Agent 工具层

> 预估时间：3 天。依赖阶段零通过。

新建 `lib/agent-plugin/`，包含三个文件：

### 1.1 工具定义（`tools.ts`）

- [ ] 定义工具类型接口：

```typescript
export type AgentTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
};
```

- [ ] 实现以下工具，每个工具通过 `window.Asc.plugin.callCommand` 调用编辑器 API：

| 工具名 | 功能 | OnlyOffice API |
|---|---|---|
| `insert_text` | 在光标处插入文本/HTML | `Api.CreateParagraph()` + `PasteHtml()` |
| `get_selection` | 获取当前选区文本 | `Api.GetDocument().GetCurrentSelection()` |
| `get_document_text` | 获取全文纯文本（截断到 8000 字） | `doc.GetAllParagraphs()` 遍历 |
| `add_comment` | 在选区添加评论 | `AddComment(text, author)` |
| `set_review_mode` | 开启/关闭修订模式 | `Api.StartTrackRevisions()` / `StopTrackRevisions()` |
| `replace_selection` | 替换选中文本（修订模式下自动记录） | `selection.SetText()` |

- [ ] 每个工具加入 `readOnlyHint` 标注（`get_*` 工具为只读，其余为写操作）
- [ ] 为每个工具编写单元测试（mock `window.Asc.plugin.callCommand`）

### 1.2 LLM 接入层（`llm.ts`）

- [ ] 定义统一的 LLM Provider 接口，屏蔽离线/云端差异：

```typescript
export interface LLMProvider {
  name: string;
  chat(messages: Message[], tools: Tool[]): Promise<LLMResponse>;
  isReady(): boolean;
}
```

- [ ] 实现 **WebLLM Provider**（离线模式）：
  - 使用 `@mlc-ai/web-llm` 的 `CreateMLCEngine`
  - 检测 WebGPU 可用性（`navigator.gpu`）
  - 首次加载时显示进度条（`initProgressCallback`）
  - 模型列表：`Phi-3.5-mini-instruct`（默认）、`Llama-3.2-3B-Instruct`（可选）
  - Tool calling 格式与 OpenAI 兼容，直接传入 `tools` 数组

- [ ] 实现 **Cloud Provider**（云端模式，基于 pi agent Direct Mode）：
  - 支持 Anthropic Claude（推荐 `claude-sonnet-4-6`）、OpenAI、Google Gemini、Ollama
  - API Key 存储在 `localStorage`，key 格式：`agent_api_key_{provider}`
  - 读写封装到 `getApiKey(provider)` / `setApiKey(provider, key)`
  - 不写入 `store/index.ts`（敏感数据不进全局状态）

- [ ] 实现 Provider 选择逻辑：
  - 自动检测 WebGPU → 默认离线模式
  - 用户可在设置中强制切换
  - 当前选择持久化到 `localStorage`

- [ ] 系统 Prompt 模板（支持注入文档上下文）：

```
你是一个专业的文档编辑助手，正在协助用户编辑文档。
当前文档：{fileName}
可用工具：insert_text, get_selection, add_comment, set_review_mode, replace_selection

规则：
- 所有写操作默认在修订模式下执行，用户可逐条接受/拒绝
- 引用原文时使用 add_comment，不直接修改
- 生成的内容使用规范的文档格式（标题层级、段落间距）
```

### 1.3 Agent 运行时（`runtime.ts`）

- [ ] 实现单轮 tool-use 循环：接收用户指令 → 调用 LLM → 解析 tool_use → 执行工具 → 返回结果
- [ ] 实现多轮对话：维护 `messages[]` 历史，支持上下文连续
- [ ] 错误处理：工具执行失败时向 LLM 返回 error result，允许重试一次
- [ ] 超时保护：单次 LLM 调用 30s 超时，工具执行 10s 超时

---

## 阶段二：Agent 面板 UI

> 预估时间：3 天。依赖阶段一完成。

### 2.1 面板结构（在 `lib/ui.ts` 中扩展）

- [ ] 新增 `createAgentPanel()` 函数，复用现有 `createControlPanel` 的显示/隐藏模式
- [ ] 面板布局（固定在编辑器右侧，可折叠）：

```
┌─────────────────────────┐
│ Agent 助手          [×] │
├─────────────────────────┤
│ Provider: [Claude  ▼]   │
│ API Key:  [••••••] [改] │
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ 对话历史            │ │
│ │ 用户: 帮我润色第二段│ │
│ │ Agent: 已在修订模式 │ │
│ │ 下完成修改，请审阅  │ │
│ └─────────────────────┘ │
├─────────────────────────┤
│ [输入指令...      ] [→] │
│ [清空] [撤销上次操作]   │
└─────────────────────────┘
```

- [ ] 使用现有 `ranui` 组件库（`ranui/button` 等），保持 UI 风格一致
- [ ] 面板开关绑定到 FAB 按钮或菜单项（扩展 `createFixedActionButton`）

### 2.2 状态管理（扩展 `store/index.ts`）

- [ ] 新增 Agent 相关信号：

```typescript
export const [getAgentMessages, setAgentMessages] = createSignal<Message[]>([]);
export const [getAgentRunning, setAgentRunning] = createSignal(false);
export const [getAgentProvider, setAgentProvider] = createSignal<Provider>('anthropic');
```

### 2.3 操作反馈

- [ ] Agent 执行中：面板显示 loading 状态，输入框禁用
- [ ] 工具调用时：在对话流中展示"正在调用：`insert_text`..."
- [ ] 完成后：若有修订，提示用户"已在修订模式下完成，请在编辑器中审阅"
- [ ] 错误时：显示错误信息 + "重试"按钮

---

## 阶段三：人机协作流程打磨

> 预估时间：2 天。依赖阶段二完成。

### 3.1 修订模式集成

- [ ] Agent 执行写操作前自动调用 `set_review_mode({ enabled: true })`
- [ ] 操作完成后不自动关闭修订模式（由用户决定何时关闭）
- [ ] 在面板中显示"当前处于修订模式"提示 + "关闭修订模式"快捷按钮

### 3.2 评论协作模式

- [ ] 新增"仅评论"模式：Agent 不直接修改文档，只添加带建议的评论
- [ ] 评论格式标准化：`[Agent] {建议内容}`，方便用户识别

### 3.3 撤销支持

- [ ] 面板中的"撤销上次操作"按钮调用 `Api.Undo()` 回滚 Agent 的上一次写操作
- [ ] 记录每次工具调用前的文档状态哈希，用于检测意外变更

### 3.4 上下文感知

- [ ] 用户发送指令时自动附带：当前文件名、当前选区内容（若有）、文档字数
- [ ] 支持"@选区"指令：用户选中文本后发送指令，Agent 自动以选区为操作目标

---

## 阶段四：配置与分发

> 预估时间：1 天。

- [ ] Agent 面板默认隐藏，通过 URL 参数 `?agent=1` 或设置项开启
- [ ] 设置项持久化到 `localStorage`：provider 选择、面板开关状态、系统 prompt 自定义
- [ ] 更新 `readme.md` 说明 Agent 功能的使用方式
- [ ] 更新 `embed-api.ts`，新增 `document:agent-run` 消息类型，允许外部页面触发 Agent 执行

---

## 文件变更清单

```
新增：
  lib/agent-plugin/
    tools.ts          # 工具定义与执行（OnlyOffice Plugin API 封装）
    llm.ts            # LLM Provider 接口 + WebLLM / Cloud 双实现
    runtime.ts        # Agent 运行时（tool-use 循环）
  public/plugins/
    agent-probe/      # 阶段零验证插件
  test/unit/
    agent-tools.test.ts
    agent-runtime.test.ts
    agent-llm.test.ts # mock WebGPU / fetch，测试 Provider 切换逻辑

修改：
  lib/ui.ts           # 新增 createAgentPanel()（含模型加载进度条）
  lib/onlyoffice-editor.ts  # 启用插件加载配置
  store/index.ts      # 新增 Agent 状态信号
  lib/embed-api.ts    # 新增 document:agent-run 消息类型
  index.ts            # 初始化 Agent 面板
  package.json        # 新增 @mlc-ai/web-llm 依赖
```

---

## 风险与依赖

| 风险 | 概率 | 应对 |
|---|---|---|
| 离线版 Plugin API 不完整 | 中 | 阶段零提前验证；备选方案：OnlyOffice Docs Server |
| WebGPU 在集成 GPU / 低端设备上过慢 | 中 | 自动降级到云端模式；提示用户预期速度（~20 tokens/s） |
| 模型首次下载体验差（1.8 GB） | 高 | 显示详细进度条 + 预估剩余时间；下载后永久缓存；提供"跳过，使用云端"选项 |
| Safari 激进存储清理导致模型被驱逐 | 中 | 检测缓存是否有效，失效时提示重新下载；Safari 用户优先推荐云端模式 |
| WebLLM tool calling 质量不稳定（当前 WIP） | 中 | Phi-3.5-mini / Llama-3.2-3B 均经过验证；兜底方案：解析纯文本输出提取工具调用 |
| pi agent 浏览器包依赖 Node.js 专属 API | 中 | 仅使用 Direct Mode 部分；若不可用，手动实现轻量 tool-use 循环（约 100 行） |
| LLM API 跨域限制（CORS） | 低 | Anthropic / OpenAI 均支持浏览器直调；Ollama 本地需用户配置 CORS |
| 大文档超出 LLM context 窗口 | 中 | `get_document_text` 工具截断到 8000 字；建议用户选区操作 |

---

## 验证结果

> 阶段零完成后填写。

- Plugin API 可用性：待测
- 可用的 API 列表：待测
- 已知限制：待测
- 是否需要切换到 Docs Server：待定
