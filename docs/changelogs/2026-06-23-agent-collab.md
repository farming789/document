# Changelog — AI Agent 协同编辑（feat/agent-collab）

日期：2026-06-23 · 分支：`feat/agent-collab`（从 `release/v0.0.4` 切出，扁平结构，OnlyOffice v7.5 离线版）

在浏览器内为本地文档编辑器加入 AI 协同编辑：通过 `?agent=1` 打开侧边栏，让 LLM 读写当前文档。云端（Claude / OpenAI）与本地离线（WebLLM）三种推理后端任选，纯本地、无中间服务器。

## 新增功能

### 入口

- `?agent=1`（也接受 `?agent=true` / 裸 `?agent`）开启 AI 助手侧边栏；默认不加载，零成本。

### 三种推理后端（同一接口可切换）

| 模式        | 需要                              | 默认模型                                  |
| ----------- | --------------------------------- | ----------------------------------------- |
| Claude 云端 | Claude API Key（存 localStorage） | `claude-opus-4-8`（官方 SDK，浏览器直调） |
| OpenAI 云端 | OpenAI API Key（存 localStorage） | `gpt-4o-mini`（fetch 直调）               |
| 本地离线    | WebGPU，**无需 Key**              | 4 个性价比模型可选，Phi-3.5-mini 默认     |

- 本地模型可选：Llama-3.2-1B（最快）/ Qwen2.5-1.5B（轻量）/ Phi-3.5-mini（均衡，推荐）/ Llama-3.2-3B（更强）。
- 「加载模型」按钮预下载；模型权重持久缓存于浏览器，**刷新页面不再重新下载**，面板按缓存状态给出对应提示。

### Agent 能用的文档工具（6 个）

`insert_text`、`get_selection`、`replace_selection`、`get_document_text`、`add_comment`、`set_review_mode` —— 全部经实测验证，直接驱动编辑器命令 API。

### 面板交互

- 发送 / 停止（可中断运行）、清空对话、修订模式开关（直读写编辑器 track-changes）。

## 技术要点

- **Phase 0 实测结论**：v7.5 离线版裁掉了标准插件加载基建，但插件命令 API 全部编译进 SDK，挂在同源编辑器 iframe 的 `window.editor`（`pluginMethod_*` / `asc_*`）上，可直接调用——无需 Docs Server。
- **能力层 / 传输层解耦**：工具层（`AgentTool`）和 LLM 层（`LLMProvider`）都与传输无关，运行时 tool-use 循环把两者串起来；同一套定义复用于云端与离线。
- **纯本地**：所有 Key 存 localStorage、请求从浏览器直发，不过任何自有服务器。

## 模块清单（`lib/agent-plugin/`）

```
editor-bridge.ts        同源访问编辑器命令 API
types.ts / tools.ts     AgentTool 接口 + 6 个工具
runtime.ts              tool-use 循环（支持中断）
llm/types.ts            LLMProvider 接口 + 中性消息/工具类型
llm/anthropic.ts        Claude 云端（官方 SDK）
llm/openai.ts           OpenAI 云端（fetch）
llm/openai-format.ts    OpenAI chat-completions 格式转换（WebLLM/OpenAI 共用）
llm/webllm.ts           本地离线（WebLLM）+ 模型列表 + 缓存检测
llm/factory.ts          provider 工厂 + 默认选择
llm/keys.ts             API Key 存取（localStorage）
ui/controller.ts        对话状态 + 驱动运行时（可测核心）
ui/panel.ts             侧边栏 DOM 视图
```

## 质量

- 单测：94 → **195**（agent 核心模块覆盖 ~99%）。
- tsc / oxlint / prettier 全绿。
- 全程 chrome-devtools 实测验证（Plugin API、PasteHtml 插入、面板各模式）。
- 新增依赖：`@anthropic-ai/sdk`、`@mlc-ai/web-llm`。

## 提交

```
9648f42 Phase 0 验证（plugin API 可用）
5493bc6 Phase 1 editor-bridge + insert_text
7961fd4 get_selection/replace_selection/set_review_mode + 修 iframe 定位
f36612b get_document_text + add_comment（工具层完成）
84659ab Phase 1.2 LLM 层 + Anthropic 云端
e8fc596 Phase 1.3 运行时 tool-use 循环
c4be99c Phase 2 UI 面板（?agent=1）
563412f WebLLM 离线 provider + 面板打磨
7d5e0ba 多 provider（Claude/OpenAI + 本地模型选择）
1483757 本地模型缓存感知提示
```

> 逐次实现细节见 `docs/explorations/2026-06-23-agent-*.md`。
