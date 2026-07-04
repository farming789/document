# WebLLM 加「纯聊天档」——消除本地 agent 报错体验（2026-07-04）

## 背景

调研结论已定死（见 [本地 vs 云端](2026-06-28-local-vs-cloud-models-conclusion.md)）：本地
7–8B 小模型不适合当 agent 的「工具执行大脑」——只有 Hermes 系列支持 function
calling，且格式不稳、会退化。runtime 每次请求都带 `tools`，所以 WebLLM 一直在
「勉强调工具」的状态，容易报错或把 tool_call 当 JSON 文本吐出来，用户体感就是
「完全不可用」。

本次不再和小模型的工具能力较劲，直接把 WebLLM **降级为纯聊天助手**：能问答、能改写
选中文字，但不挂工具、不编辑文档。工具驱动的编辑交给云端 / Ollama。

## 改动

1. **`packages/agent-core/src/llm/webllm.ts`** — `WebLLMProviderOptions` 新增
   `chatOnly?: boolean`（默认 false，保持库中立）。
   - 新增 `activeTools()`：chatOnly 时返回 `[]`，把整个工具注册表丢掉。
   - 新增 `requestBody()`：统一构造请求体，**仅当有工具时**才附 `tools` /
     `tool_choice`（无工具就彻底不带这两个字段，走 system-prompt 路径）。
   - `chat` / `chatStream` 改用 `requestBody()`，逻辑收敛、去重。
   - 副作用红利：chatOnly 下没有工具 → Hermes 的「禁自定义 system prompt」限制解除，
     真正的系统提示（persona / 语言指引）又能带上了。

2. **`lib/agent-plugin/ui/panel.ts`** — 面板构造 WebLLM 时传 `chatOnly: true`。
   这是「消掉报错体验」的默认值：本地模型从此不会因工具格式崩溃。

3. **i18n + UI 提示** — 新增 `agentLocalChatOnly` 键（ZH/EN），在本地模型缓存状态下
   追加一行「本地模型仅问答/改写，不编辑文档；要 AI 编辑请用云端或 Ollama」。
   `styles/base.css` 给 `.agent-panel-note` 加 `white-space: pre-line`，让两行提示
   正常换行。

## 验证

- `pnpm run lint:ts`：零错误（改 src 后需 `pnpm -F @ranuts/shared build` +
  `pnpm -F @ranuts/agent-core build`，消费方按 dist 解析类型）。
- 新增单测 `chatOnly drops tools`：断言 chatOnly 时 body 无 `tools`/`tool_choice`，
  且**有** system 消息（与非 chatOnly 用例互为对照）。webllm 测试 10/10 通过。
- 全量单测 234/238。4 个失败全在 `iframe-patch.test.ts`（v7 字体改写仅 Excel 启用后的
  测试预期未更新），已 stash 我的改动在干净树复现，确认与本次无关，属既有失败。

## 追加：chat-only 专属"顾问"系统提示（修一个误导 bug）

上面的 chat-only 落地后发现一个隐患：chat-only 仍复用共享的
`DEFAULT_SYSTEM_PROMPT`，而那段提示**明确告诉模型"你可以用 insert_text /
add_comment / set_review_mode 等工具读写文档"**——但 chat-only 根本没把工具传给
模型。结果模型被误导，会跟用户说"好的我帮你插入了"，实则什么都没发生，比报错更糊弄。

修法：`packages/agent-core/src/llm/prompt.ts` 新增 `CHAT_ONLY_SYSTEM_PROMPT`，把
模型重定义为**编辑器内的顾问**：

- 诚实声明：本模式下**没有工具、不能直接改文档**，不许假装已插入/批注/改单元格。
- 改为：产出可直接复制粘贴的内容（改写/大纲/表格/公式）+ 教用户用编辑器 UI 一步步操作
  + 提示用户可用「引用选区」按钮把选中文字带进对话。
- 想要 AI 自动执行（插入/批注/修订/改单元格）→ 引导去 ⚙ 设置切云端 / Ollama。

`webllm.ts` 构造函数：chatOnly 且未显式传 `systemPrompt` 时，默认用
`CHAT_ONLY_SYSTEM_PROMPT`（显式 override 仍优先）。面板无需改动（它已传
`chatOnly: true`、不传 systemPrompt，自动命中顾问提示）。

新增单测：chatOnly 时 system 消息为 `CHAT_ONLY_SYSTEM_PROMPT`（且 ≠ 默认工具提示）；
显式 systemPrompt 可覆盖。webllm 测试 11/11 通过。

## 追加：面板里「切换到云端」可点击引导

把「本地仅问答」这句从 `note` 里拆出来，做成独立元素 `chatOnlyHint`（`lib/agent-plugin/ui/panel.ts`），
末尾挂一个可点击链接 `agentSwitchCloud`（"切换到云端 →"）：

- 独立于 `note`，避免 `note` 的下载进度/缓存状态文本把链接冲掉。
- 仅当 `provider === 'webllm' && WebGPU 可用` 时显示（`syncChatOnlyHint`，并入 `syncProviderUi`）。
- 点击 `switchToCloud`：provider 置为 `anthropic`（同时 `.value` + `setAttribute('value')` 反映到
  r-select UI）、清空旧 controller、**展开设置块**露出 API Key 输入框，再 `syncProviderUi`。
- 无障碍：链接带 `role=button` / `tabindex=0`，支持 Enter/Space 触发。
- i18n 新增 `agentSwitchCloud`（ZH/EN）；CSS 新增 `.agent-panel-link` 链接样式。

一句话：本地模型说"我做不了"的同时，给出**一键切到能做的模式**的路径，闭环。

## 现有能力集（回答"有什么能力"）

工具层 [tools.ts](../../lib/agent-plugin/tools.ts) 已验证可用（v7.5 SDK，Word/Excel/PPT）：
`get_selection` / `get_document_text`（读）、`insert_text` / `replace_selection`（写）、
`add_comment`（批注）、`set_review_mode`（修订模式）、`set_cell` / `get_cell`（表格单元格）。
这些工具**只在带工具的 provider（云端 / Ollama）上生效**；WebLLM chat-only 不挂工具，
只做顾问式指导。

## 对实际业务的价值（诚实评估）

- **主要价值是「去负体验」而非「加能力」**：核心业务是「人 + Agent 协同编辑文档」，
  纯聊天档**不能**编辑文档，所以对协同编辑主流程没有直接功能增益。
- **它买到的是**：① 本地模式不再报错/跑飞，从「完全不可用」变成「稳定可用的本地问答/
  改写助手」；② 零安装、纯隐私的轻量入口（问「这段怎么改更好」，模型给文本，用户自己
  贴回）；③ 明确的产品分层——本地=聊天、云端/Ollama=编辑，用户预期对齐。
- **真正的本地编辑能力**要靠 Ollama（原生跑 Qwen2.5-32B / Llama-3.3-70B 这类能稳定
  工具调用的大模型），那是下一步该做的档位，不是 WebLLM 能补的。

## 相关

- [本地 vs 云端模型选型结论](2026-06-28-local-vs-cloud-models-conclusion.md)
- [WebLLM 工具模型 + system prompt 限制](2026-06-28-webllm-tool-capable-models.md)
