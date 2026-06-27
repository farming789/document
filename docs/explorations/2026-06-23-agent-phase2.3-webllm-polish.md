# 2026-06-23 Agent：WebLLM 离线 provider + 面板打磨

补两块:无 key 的离线推理(WebLLM),以及面板的停止/清空/修订模式/provider 切换。

## WebLLM 离线 provider

`lib/agent-plugin/llm/webllm.ts` —— 同一 `LLMProvider` 接口,在浏览器内跑量化模型(WebGPU),无需 key、模型缓存后离线可用。

- WebLLM 用 **OpenAI chat-completions 格式**,所以做了和 anthropic.ts 对称的转换:`toOpenAITools`(→ `{type:'function', function:{...}}`)、`toOpenAIMessages`(系统 prompt 前置;assistant 文本+tool_use → `tool_calls`;tool_result → `role:'tool'` 消息)、`parseOpenAIResponse`(解析 `tool_calls`,arguments JSON 解析,坏 JSON 回退 `{}`)。
- **`@mlc-ai/web-llm` 动态 import**(在 engine 创建里),重运行时只在真正用离线模式时才加载,不进主 bundle。engine 可注入,转换逻辑纯函数,无需 WebGPU/模型即可单测。
- 默认模型 `Phi-3.5-mini-instruct-q4f16_1-MLC`(~1.8GB,支持 tool calling)。

`llm/factory.ts`:`createProvider(id, opts)` + `defaultProviderId()`(有 WebGPU 默认离线,否则云端)。

## 面板打磨(Phase 3)

- **provider 选择器**:Claude 云端 / 本地离线;切换时重建 controller,云端显示 key 输入、离线显示下载提示(无 WebGPU 则提示不支持)。
- **停止按钮**:运行时「发送」变「停止」。runtime 加 `signal?: AbortSignal`,迭代间检查 abort;controller 持 `AbortController`,`stop()` 触发,结果 `aborted` → turn「已停止。」。
- **清空对话**:`controller.reset()` + 清 DOM。
- **修订模式开关**:直接读/写编辑器 `asc_IsTrackRevisions`/`asc_SetTrackRevisions`(editor-bridge),编辑器未就绪时禁用。

## 验证

- tsc / oxlint / prettier:通过
- 单测:188 通过(WebLLM 12 + 工厂 + abort/stop 各 1);转换逻辑、provider、工厂、abort 全覆盖
- chrome-devtools 冒烟:provider 切换正确联动 key 显隐与提示;headless Chrome 有 WebGPU 故默认离线、显示下载提示;清空/停止/修订控件就位

## 现状

云端(Claude)+ 离线(WebLLM)双 provider,同一接口、同一运行时、同一工具集,面板可切换。无 key 也能用离线模式(需 WebGPU + 首次下载模型)。agent 协同从后端到 UI、从云端到离线全部打通。
