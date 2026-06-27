# 2026-06-23 Agent：barrel 分层入口 + Ollama provider

按 `docs/superpowers/plans/2026-06-23-agent-next-phase.md` 推进第 1、2 步。

## 1. Barrel（组合入口，不拆包）

拆包评估结论是「现在不拆，分层 + barrel」。本次加三个 barrel，把各层公共 API 显式聚合：

- `lib/agent-plugin/llm/index.ts` —— LLM 层(types / factory / keys / prompt / 各 provider)
- `lib/agent-plugin/ui/index.ts` —— UI 层(controller / panel)
- `lib/agent-plugin/index.ts` —— 顶层:editor-bridge + tools + runtime + 转出 llm/ui

应用入口由 `import('./lib/agent-plugin/ui/panel')` 改为 `import('./lib/agent-plugin')`，仍是动态 import(`?agent=1` 行为不变、仍单独成 chunk)。

**约定**：barrel 只给外部消费者用；内部模块继续直接 import 兄弟文件，避免经 barrel 产生循环引用。

## 2. Ollama provider（验证 provider 抽象）

Ollama 暴露 OpenAI 兼容的 `http://localhost:11434/v1/chat/completions`，所以新 `llm/ollama.ts` **整段复用 `openai-format` 转换器**，与 `OpenAIProvider` 的差异只有三点：

- 本地服务、**无需 API Key**(`isReady()` 恒 true；可选 key 仅用于远程/反代部署)
- 默认 baseURL 指向 localhost、默认模型 `llama3.2`
- 这次新增正好证明 provider 抽象是对的——**只加一个文件 + factory 一行**

接线：

- `factory.ts`：`ProviderId` 加 `'ollama'`，`ProviderOptions` 并入 `OllamaProviderOptions`，switch 加分支
- `ui/panel.ts`：provider 下拉加 Ollama；新增本地模型名输入框(存 localStorage `agent_ollama_model`)；Ollama 不需 key，`buildController` 对 ollama 直接构建(永不因缺 key 返回 null)
- `i18n.ts`：`agentProviderOllama` / `agentOllamaModelPlaceholder` / `agentOllamaHint`(中英)

## 验证

- tsc / oxlint / prettier：通过
- 单测：**211 通过**(+5，新增 `agent-llm-ollama.test.ts`：就绪态、无 auth 默认请求、带 key 远程 auth、自定义 baseURL、非 2xx 报错)
- Ollama 实跑需本地起 `ollama serve` + 拉模型，属运行时依赖，未在单测内联(用注入的 fetch 验证请求形状)

## 下一步

流式输出 → Gemini provider → 对话持久化(见 plan 文档)。
