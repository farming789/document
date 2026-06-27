# 2026-06-23 Agent Phase 1.2：LLM 接入层(Provider 接口 + Anthropic 云端)

Phase 1 工具层完成后,接入 LLM。本增量做 provider 无关的接口 + 第一个 provider(Anthropic 云端,浏览器直调)。

## 设计:能力层与传输层解耦(延续既定方向)

agent 运行时只跟 `LLMProvider` 接口对话,绝不直接碰厂商 SDK。消息/工具用中性 shape(贴近 Anthropic 的 block 模型),各 provider 自己翻译。这样同一套运行时和工具定义能驱动 Anthropic / OpenAI 兼容云端 / 离线 WebLLM,互不影响。

```
lib/agent-plugin/llm/
  types.ts      # LLMProvider 接口 + LLMMessage/LLMContent/LLMToolDef/LLMToolCall/LLMResponse
  keys.ts       # API key 存 localStorage(agent_api_key_<provider>),不进全局 store
  prompt.ts     # 默认系统 prompt(provider 无关)
  anthropic.ts  # Anthropic provider(官方 @anthropic-ai/sdk,浏览器 Direct Mode)
```

## 关键决策

- **用官方 `@anthropic-ai/sdk`**(claude-api 技能要求:Claude 调用必须走官方 SDK,不能 raw fetch、不能 OpenAI shim)。已加依赖 `@anthropic-ai/sdk@0.106.0`。
- **模型 `claude-opus-4-8`**(技能默认),`max_tokens` 16000(非流式默认)。
- **浏览器直调**:`new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`,请求从浏览器直发 Anthropic,key 存 localStorage,不过任何自有服务器——契合项目"纯本地、无服务器"定位。
- **中性 shape ≈ Anthropic block 模型**,翻译很薄:`LLMToolDef` → `{name, description, input_schema}`;`tool_result` → `{tool_use_id, content, is_error}`。
- **可测性**:转换函数(`toAnthropicTool`/`toAnthropicMessage`/`parseAnthropicResponse`)是纯函数,单独导出;`AnthropicProvider` 支持注入 client,测试用 mock,不需真 key。

## 验证

- tsc / oxlint / prettier:通过
- 单测:158 通过(LLM 部分 15);`lib/agent-plugin/llm` 覆盖率 95%(未覆盖的 128-129 行是真实 `new Anthropic()` 构造,需真 SDK,合理)

## 下一步

- Phase 1.2 续:WebLLM 离线 provider(同一 `LLMProvider` 接口)、provider 选择逻辑(检测 WebGPU)
- Phase 1.3:Agent 运行时 tool-use 循环(把 `agentTools` 转成 `LLMToolDef`,跑 chat → 执行工具 → 回灌 tool_result → 循环)
