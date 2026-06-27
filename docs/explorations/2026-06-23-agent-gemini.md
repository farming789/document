# 2026-06-23 Agent：Gemini provider

plan 第 4 步。新增 Google Gemini 云端 provider。

## 为什么比 OpenAI/Ollama 复杂

Gemini 用自有 REST 格式(`generateContent`)，而且**按函数名匹配工具结果，不用 id**——这与中性消息模型(Anthropic 风格、带 id)有结构性差异：

- `toGeminiContents` 先扫一遍所有 assistant 的 `tool_use` 块，建 **id→name 映射**；再把每个 `tool_result` 的 `toolUseId` 解析回函数名，转成 `functionResponse`。
- `parseGeminiResponse` 给每个 `functionCall` **合成稳定 id**(`${name}-${partIndex}`)，让 runtime 能配对 tool_result；回写 Gemini 时只需名字(已由上面映射恢复)。
- 工具结果字符串 → `functionResponse.response` 对象：能 JSON.parse 成对象就直接用，否则包成 `{ result: <值> }`。
- 角色映射：`assistant → model`，`user → user`；system prompt 走 `systemInstruction`。
- Gemini 拒绝「object 但无 properties」的参数 schema，故 `toGeminiTools` 仅在有 `properties` 时才带 `parameters`；工具列表为空时整个 `tools` 字段省略。

## 接线

- `factory.ts`：`ProviderId` 加 `'gemini'`，`ProviderOptions` 并入 `GeminiProviderOptions`，switch 加分支
- `ui/panel.ts`：下拉加 Gemini；引入 `CLOUD_PROVIDERS` 集合(anthropic/openai/gemini)替换原先散落的 `id === 'anthropic' || id === 'openai'` 判断；key 占位符 `AIza...`；key 存 localStorage `agent_api_key_gemini`
- `i18n.ts`：`agentProviderGemini`(中英)
- key 通过 `x-goog-api-key` 头发送，浏览器 Direct Mode，不经任何自有服务器

流式：本轮 Gemini 走非流式(`chat`)，与 OpenAI/Ollama 一致(后续可补 `streamGenerateContent` SSE)。

## 验证

- tsc / oxlint / prettier：通过
- 单测：**229 通过**(+9，新增 `agent-llm-gemini.test.ts`)
  - 转换：functionDeclarations(省略空参数)、空工具、角色映射 + tool_result 名字解析、非对象结果包装、functionCall 解析 + 合成 id
  - provider：就绪态/读 storage、generateContent 请求头与解析、无 key 报错、非 2xx 报错

## Provider 全景(本轮后)

| Provider   | 类型 | key      | 流式 |
| ---------- | ---- | -------- | ---- |
| Anthropic  | 云端 | ✅       | ✅   |
| OpenAI     | 云端 | ✅       | 回退 |
| **Gemini** | 云端 | ✅       | 回退 |
| WebLLM     | 本地 | ❌       | ✅   |
| Ollama     | 本地 | ❌(可选) | 回退 |

## 下一步

对话持久化(plan 第 5 步，最后一项)。
