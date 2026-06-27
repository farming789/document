# 2026-06-23 Agent：多 provider（Claude / OpenAI / 本地模型选择）

按需求扩展:无 key 时可选性价比本地模型并单独加载;有 key 时可选 Claude 或 OpenAI。

## 改动

### 共享 OpenAI 格式

抽出 `llm/openai-format.ts`（`toOpenAITools` / `toOpenAIMessages` / `parseOpenAIResponse` + OpenAI 类型），WebLLM 和 OpenAI 云端都复用（两者都是 OpenAI chat-completions 格式）。webllm.ts 瘦身,改为 import。

### OpenAI 云端 provider

`llm/openai.ts` —— `OpenAIProvider`,浏览器直调 `https://api.openai.com/v1/chat/completions`,key 存 localStorage（`agent_api_key_openai`）,默认模型 `gpt-4o-mini`（性价比）。用 `fetch`（可注入测试）而非再加一个 SDK 依赖,请求 shape 小且稳定。

### 本地模型选择

`llm/webllm.ts`:

- `WEBLLM_MODELS` 精选列表（Llama-3.2-1B 最快 / Qwen2.5-1.5B 轻量 / Phi-3.5-mini 均衡推荐 / Llama-3.2-3B 更强）+ `DEFAULT_WEBLLM_MODEL`
- `preload()` 方法:单独下载/加载模型,不阻塞首条消息
- 暴露 `model` 字段

### factory

`ProviderId = 'anthropic' | 'openai' | 'webllm'`,`createProvider` 三路分发。

### 面板

provider 选择器三选一:

- **Claude / OpenAI（云端）**:显示 key 输入,按 provider 切换占位符（`sk-ant-...` / `sk-...`）和读写对应 key
- **本地离线（WebLLM）**:显示模型下拉 + 「加载模型」按钮（调 `preload()`,进度写入提示）+ 下载说明

## 验证

- tsc / oxlint / prettier:通过
- 单测:195 通过（OpenAI provider 5 + 格式 6 + WebLLM/工厂 重组）
- chrome-devtools 冒烟:三 provider 切换正确联动 key 输入 / 模型行 / 占位符;本地模式 4 个模型 + 加载按钮就位;截图确认

## 现状

| 模式        | 需要               | 说明                        |
| ----------- | ------------------ | --------------------------- |
| Claude 云端 | Claude API Key     | `claude-opus-4-8`,官方 SDK  |
| OpenAI 云端 | OpenAI API Key     | `gpt-4o-mini`,fetch 直调    |
| 本地离线    | WebGPU（无需 key） | 4 个性价比模型可选,可预加载 |

三种模式同一 `LLMProvider` 接口、同一运行时、同一工具集,面板自由切换。无 key 也能用本地模型。
