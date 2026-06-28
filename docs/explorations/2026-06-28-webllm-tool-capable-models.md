# 2026-06-28 修复本地模型不支持工具调用 + 自动加载改缓存命中

## 现象

WebLLM 本地模式发消息报错：
`Phi-3.5-mini-instruct-q4f16_1-MLC is not supported for ChatCompletionRequest.tools.`

## 原因

Agent 每次请求都带 `tools`（要调用编辑器工具）。但 **WebLLM 只在 Hermes 系列模型上支持 function calling**（Hermes-2-Pro-Llama-3-8B / Hermes-2-Pro-Mistral-7B / Hermes-3-Llama-3.1-8B）。而我们的 `WEBLLM_MODELS` 全是 Llama-3.2 / Qwen2.5 / Phi-3.5 这些**不支持工具**的小模型（注释还误写成 "all tool-calling capable"）。所以本地 agent 工具调用从来跑不通。

## 修复

- `packages/agent-core/src/llm/webllm.ts`：`WEBLLM_MODELS` 换成 3 个支持工具的 Hermes 模型，`DEFAULT_WEBLLM_MODEL` = Hermes-2-Pro-Mistral-7B（最小）。代价：tool-capable 本地模型是 7–8B，下载 ~4 GB+。
- 连锁影响：之前"打开面板自动加载"会变成自动下 ~4GB。改为 **仅当模型已缓存才自动加载**（`isModelCached` 判断）；未缓存则只显示首次下载提示，由用户点 Load。避免惊吓式 4GB 下载。

## 验证（chrome-devtools）

设置里模型为 3 个 Hermes（~4.0/4.7GB）；未缓存时 note 显示"首次下载 ~4.0GB"、不自动下载；tsc 零错误 + 237 单测。

## 后续：Hermes + tools 禁止自定义 system prompt

换 Hermes 后又报：`When using Hermes-2-Pro function calling via ChatCompletionRequest.tools, cannot specify customized system prompt.`

原因：WebLLM 的 Hermes function calling 会**自注入工具调用的 system prompt**，不允许我们再传自定义的。而我们的 WebLLM provider 一直带 `DEFAULT_SYSTEM_PROMPT`。

修复：
- `openai-format.ts` `toOpenAIMessages(messages, systemPrompt?)`：`systemPrompt` 改为可选，**为空时不加 system 消息**（之前即使空串也会塞一条）。
- `webllm.ts` chat/chatStream：**有 tools 时传 `undefined`**（不带 system prompt）；无 tools 时仍带。
- 更新 webllm 单测：传 tools 时断言无 system 消息。

代价：本地模式丢失自定义系统指引（persona / "用用户语言回复"）。实践中工具描述 + 用户消息语种基本能兜底；需要时可改为把指引折叠进首条 user 消息。云端 Provider 不受影响（仍带 system prompt）。

## 备注

WebLLM 目前没有更小的工具能力模型，本地 agent 最低 ~4GB 是现状。云端 Provider（Claude/OpenAI/Gemini）不受影响。
