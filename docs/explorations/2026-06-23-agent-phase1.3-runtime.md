# 2026-06-23 Agent Phase 1.3：运行时(tool-use 循环)

把工具层(tools.ts)和 LLM 层(llm/)串起来,做出真正能跑的 agent 循环。

## 设计

`lib/agent-plugin/runtime.ts`:

- `toLLMToolDefs(registry)`:把 `AgentTool` 注册表转成 provider 用的 `LLMToolDef[]`(name/description/inputSchema)。
- `runAgent(provider, userMessage, options)`:核心 tool-use 循环
  1. `provider.chat(messages, toolDefs)`
  2. 无 tool_use → 返回文本(正常结束)
  3. 有 tool_use → 逐个执行 `tools[name].execute(input)`,把结果(或错误)包成 `tool_result` 回灌,再 chat
  4. 直到模型停止调工具,或到 `maxIterations`(默认 8)上限

返回 `{ text, messages, toolCallCount, stoppedOnLimit }`,`onEvent` 回调供 UI 展示 assistant 文本 / 工具调用 / 工具结果。

## 关键点

- **provider 无关、editor 无关**:运行时只认 `LLMProvider` 接口和 `AgentTool` 注册表,完全可单测(scripted provider + mock 工具)。
- **错误不中断循环**:未知工具 → `tool_result` 标 `isError`;工具抛错 → 捕获 message 回灌。让模型能看到错误并重试/调整(符合 claude-api tool-use 最佳实践)。
- **工具结果序列化**:`JSON.stringify(output ?? null)`,防 undefined 破坏类型。

## 测试中踩的坑

scripted provider 的 mock 用 `chat.mock.calls[n][0]` 拿到的是 messages 数组的**引用**,而运行时持续 push 该数组,断言时已被后续消息污染。改为每次 chat 调用时 `snapshots.push([...messages])` 快照。

## 验证

- tsc / oxlint / prettier:通过
- 单测:166 通过(运行时部分 8);`lib/agent-plugin` 覆盖率 99% 语句 / 100% 行,`runtime.ts` 100% 行

## 现状:闭环已通

工具层(6 工具)+ LLM 层(Anthropic provider)+ 运行时(tool-use 循环)三者已串通。给定 `AnthropicProvider` 和一句用户指令,`runAgent` 就能驱动 Claude 读写当前文档。剩下的是 UI 面板(Phase 2)和 WebLLM 离线 provider(Phase 1.2 续)。
