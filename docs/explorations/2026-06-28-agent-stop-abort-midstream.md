# 2026-06-28 修复 Stop（暂停）中途无效 + 本地小模型输出垃圾说明

## 现象

1. 本地 WebLLM（Hermes-2-Pro-Mistral-7B）对 "hello" 输出一大段工具 schema JSON 并陷入数字重复（退化循环）。
2. **暂停按钮点了没反应**——生成停不下来。

## Stop 无效的原因 + 修复

runtime 只在**迭代之间**检查 `signal`，正在进行的 `provider.chat/chatStream` 调用不受影响；WebLLM 还需主动 `interruptGenerate()` 才会停。

修复（贯穿 abort signal）：
- `LLMProvider.chat/chatStream` 增加可选 `signal?: AbortSignal`。
- `runtime` 把 `options.signal` 透传给 provider。
- `accumulateOpenAIStream(chunks, onDelta, signal?)`：循环里 `signal.aborted` 即 break。
- `webllm` chat/chatStream：监听 abort → `engine.interruptGenerate()`（接口补该方法），停止引擎生成；累积器也收到 signal 退出。

云端/Ollama provider 暂未传 signal（仍可迭代间中断；mid-stream 中断作为后续）。

## 垃圾输出的原因（非代码 bug）

Hermes-2-Pro-Mistral-7B 是 7B 小模型，agentic 工具调用能力弱；加上 Hermes+tools 禁止自定义 system prompt（我们已去掉），缺少任务引导，容易把工具 schema 当文本回吐并退化重复。**这是模型质量问题，代码修不了。**

建议：
- 真要可靠的工具调用，用**云端 Provider（Claude / OpenAI / Gemini）**。
- 本地坚持用的话，换更强的 **Hermes-3-Llama-3.1-8B**（设置里可选），或后续把简短引导**折叠进首条 user 消息**（user 角色不受 Hermes 限制）试图改善。

## 验证

tsc 零错误 + 237 单测（含更新的 webllm 断言）。Stop 现在会调 interruptGenerate 中断生成。

## 后续：把本地做到最好（用户选择继续用本地）

三招提升本地工具调用质量：
1. **默认换最强模型**：`DEFAULT_WEBLLM_MODEL` = Hermes-3-Llama-3.1-8B（列表首位、标"推荐"）；Mistral-7B 降为"最小"备选。
2. **折叠引导进首条 user 消息**：Hermes+tools 禁 system prompt，于是 `buildMessages()` 在有 tools 时把 `DEFAULT_SYSTEM_PROMPT` 拼到第一条 user 消息前（user 角色不受限），给小模型框架。
3. **生成参数**：`temperature: 0.3` + `max_tokens: 1024`，降低退化跑飞、限制 run-away。

更新 webllm 单测：有 tools 时首条 user 消息包含原文（引导已折叠）。

## 提交

agent-core（types/runtime/openai-format/webllm）。pnpm-workspace/lock 仍暂缓。
