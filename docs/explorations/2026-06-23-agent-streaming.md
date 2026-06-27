# 2026-06-23 Agent：流式输出

plan 第 3 步。让助手回复逐字显示，而非整段等待。

## 架构：可选 `chatStream` + 自动回退

`LLMProvider` 新增**可选**方法：

```ts
chatStream?(messages, tools, onDelta: (textDelta: string) => void): Promise<LLMResponse>;
```

- 实现了就流式：`onDelta` 逐块吐文本，最终 resolve 的 `LLMResponse` 与 `chat()` 形状完全一致。
- 没实现的 provider，runtime 自动退回 `chat()` —— 零侵入。

`runtime.ts`：循环里若 `provider.chatStream` 存在则用它，`onDelta` 转成 `{ type: 'assistant_delta', text }` 事件；该轮结束发 `{ type: 'assistant', text, streamed: true }`。非流式路径不变(`streamed: false`)。

## 控制器 / 面板

- `AgentChatControllerOptions` 加 `onAgentDelta` / `onAgentStreamEnd`。
- controller 收到 `assistant_delta` → `onAgentDelta`；收到 `assistant` 且 `streamed` 且**已接 delta 回调** → `onAgentStreamEnd`(关闭实时气泡，不再重复发整段)；否则照旧发 agent turn(**保证没接 delta 回调的消费者文本不丢**)。
- `panel.ts`：维护一个 `liveBubble`，首个 delta 建气泡、后续追加文本、流结束清空；提交新消息/清空对话时复位。`appendTurn` 改为返回 body 元素以复用。

## 各 provider 实现

| Provider        | 流式    | 方式                                                                                                                             |
| --------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Anthropic       | ✅      | SDK `messages.stream()` 的 `.on('text')` + `finalMessage()`，复用 `parseAnthropicResponse`；client 不支持 stream 时回退 `chat()` |
| WebLLM          | ✅      | `create({stream:true})` 返回 OpenAI 格式异步块，新 `accumulateOpenAIStream` 折叠回 completion 再走 `parseOpenAIResponse`         |
| OpenAI / Ollama | ⏳ 回退 | 裸 fetch 的 SSE 字节解析较脆，本轮走非流式；后续复用 `accumulateOpenAIStream` + 一个 SSE reader 即可补上(架构已就绪)             |

**两个默认 provider(云端 Anthropic、离线 WebLLM)都已流式。**

`accumulateOpenAIStream`(在 `openai-format.ts`)：累加 `delta.content` 文本(逐块 `onDelta`)，按 `index` 重组 `tool_calls` 分片(id + name + 拼接 arguments)，产出标准 completion——流式与非流式共用同一 parse 路径。

## 验证

- tsc / oxlint / prettier：通过
- 单测：**220 通过**(+9)
  - `accumulateOpenAIStream`：文本拼接、分片 tool_call 按 index 重组、多 tool_call 排序
  - WebLLM `chatStream`：请求带 `stream:true`、deltas、全文
  - Anthropic `chatStream`：转发 deltas + 解析 finalMessage、无 stream 时回退 chat
  - runtime：有 chatStream 时走流式、发 assistant_delta、assistant 带 streamed=true、不调 chat
  - controller：onAgentDelta 转发 + streamed 不重复发 agent turn、无 delta 回调时回退整段

## 下一步

Gemini provider → 对话持久化。
