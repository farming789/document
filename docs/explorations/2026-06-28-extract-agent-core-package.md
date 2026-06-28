# 2026-06-28 抽离 @ranuts/agent-core 包（LLM + runtime，零编辑器耦合）

## 目标

把 Agent 的"LLM 提供方层 + tool-use 运行时 + 工具类型"抽成编辑器无关、可发布的 `@ranuts/agent-core`。延续 [chat-ui 抽包](2026-06-28-extract-chat-ui-package.md) 的做法，是 [monorepo 规划](../superpowers/plans/2026-06-28-monorepo-v7-v9-split.md) 里第二个叶子包。

## 移动内容

`git mv`（保留 history）：

- `lib/agent-plugin/runtime.ts` → `packages/agent-core/src/runtime.ts`
- `lib/agent-plugin/types.ts` → `packages/agent-core/src/types.ts`
- `lib/agent-plugin/llm/*` → `packages/agent-core/src/llm/*`

留在 `lib/agent-plugin`（编辑器相关）：`tools.ts`、`editor-bridge.ts`、`ui/*`。

## 解耦改动

1. **runtime.ts 去掉唯一的编辑器耦合**：删 `import { agentTools as defaultTools } from './tools'`，`tools` 默认改为 `{}`（调用方自带工具注册表）。
2. **keys.ts 去掉 ranuts 依赖**：localStorage 改为原生封装（带 try/catch + SSR 守卫），使 agent-core 运行时仅依赖两个 SDK。
3. agent-core 依赖：`@anthropic-ai/sdk`（anthropic）、`@mlc-ai/web-llm`（webllm）；devDep typescript + `prepare` 脚本（install 时自动构建 dist，dist 仍 gitignore）。

## 包导出（子路径）

`@ranuts/agent-core`（barrel）、`/runtime`、`/types`、`/llm`、`/llm/*`。子路径让 lib 与测试按原结构对接，改动最小。

## 消费侧改动

- `lib/agent-plugin/index.ts`：`./types`/`./runtime`/`./llm` 的 re-export 改为从 `@ranuts/agent-core/*`（保持向后兼容）。
- `tools.ts`：`AgentTool` 类型从 `@ranuts/agent-core/types` 导入。
- `ui/controller.ts`、`ui/storage.ts`、`ui/panel.ts`：runtime / llm / types 导入改为 `@ranuts/agent-core/*`。
- **panel.ts 显式传工具**：runtime 不再默认编辑器工具，controllerOptions 增加 `tools: agentTools`。
- 测试（`test/unit/agent-*.test.ts`）：`../../lib/agent-plugin/{runtime,types,llm/*}` → `@ranuts/agent-core/*`。

## 验证

- `tsc --noEmit` 通过（仅余 ranui/builder、document-converter window.message 两个预存在错误）。
- `pnpm test` 237/237 通过（测试从 @ranuts/agent-core 导入并通过 → 包可用）。
- chrome-devtools：新建 PPT + 开面板，面板/聊天/Provider 选择器正常，**零报错**（Vite 真实解析子路径）。

## 提交

同 chat-ui：只提交代码 + 包，`pnpm-workspace.yaml`（packages glob）与 `pnpm-lock.yaml` 暂缓（与 ranui 本地 link 纠缠，待 ranui 发版后连干净 lock 一起补）。

## 后续可继续抽的叶子

`shared`（document-utils / i18n / types / store）、`converter`（注入 x2t WASM、去 ranui/message），见 monorepo 规划。
