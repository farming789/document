# 2026-06-23 Agent：对话持久化

plan 第 5 步(最后一项)。刷新页面后对话不丢、上下文延续。

## 设计

新建 `lib/agent-plugin/ui/storage.ts`：

- `createHistoryStorage(sessionKey='default')` → `{ load, save, clear }`，把模型侧历史 `LLMMessage[]` 序列化进 localStorage(`agent_history_<session>`)。`save` best-effort(吞 quota/序列化异常)，`load` 容错(坏数据返回 `[]`)。
- `historyToTurns(messages)` → `ChatTurn[]`：把存的消息历史还原成**显示用的气泡**，复用 controller 实时事件→turn 的同一套约定(assistant text→agent、tool_use→tool、报错的 tool_result→error、user 字符串→user)。这样刷新后既恢复上下文、又恢复可见对话。

## 接线

- `controller.ts`：`AgentChatControllerOptions` 加 `storage?`。构造时 `history = storage.load()`(provider 切换重建 controller 也能续上)；每轮 `send` 成功后 `storage.save(history)`；`reset()` 同时 `storage.clear()`。
- `panel.ts`：建 `historyStorage`，传入 `controllerOptions`；**面板加载时**用 `historyToTurns(load())` 把旧对话渲染回来；「清空对话」即使还没建 controller 也直接 `historyStorage.clear()`。
- `ui/index.ts` barrel 导出 storage API。

## 为什么存 LLMMessage 而非 ChatTurn

模型续接需要完整的 `LLMMessage[]`(含 tool_use/tool_result 块)。显示用的 `ChatTurn` 是其投影，可由 `historyToTurns` 派生——只存一份、单一事实源，避免两套存储不一致。

## 会话维度

当前用单一 `'default'` 会话(跨文档滚动的一条对话)。`createHistoryStorage` 已支持 `sessionKey`，将来要按文档隔离，传文档 id 即可。

## 验证

- tsc / oxlint / prettier：通过
- 单测：**237 通过**(+8)
  - storage：round-trip、clear、坏数据返回 []、按 sessionKey 命名空间隔离
  - historyToTurns：四类块映射、跳过成功的 tool_result 与空文本
  - controller：send 后写入 storage、reset 清空、构造时从 storage 恢复(模型看到的历史含旧对话)

## plan 收尾

第 1~5 步(barrel / Ollama / 流式 / Gemini / 持久化)全部完成。Provider：Anthropic、OpenAI、Gemini、WebLLM、Ollama 五家；Anthropic+WebLLM 流式；全程多语言；对话持久化。
