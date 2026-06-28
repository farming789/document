# 2026-06-28 抽离 @ranuts/shared 与 @ranuts/converter

延续 [chat-ui](2026-06-28-extract-chat-ui-package.md) / [agent-core](2026-06-28-extract-agent-core-package.md)，把剩余两个叶子按 [monorepo 规划](../superpowers/plans/2026-06-28-monorepo-v7-v9-split.md) 抽出。

## 依赖分析（决定边界与顺序）

- `document-types`：无依赖（纯类型）。
- `document-utils`：ranuts(getMime) + document-types。
- `i18n`：ranuts。
- `store`：ranuts(createSignal)。
- `document-converter`：ranuts + ranui/message + i18n(t) + document-types + document-utils + docx-zip。
- `docx-zip`：无依赖。

→ converter 依赖 shared，所以**先 shared 后 converter**。

## @ranuts/shared（内部包）

- `git mv`：`document-types` / `document-utils` / `i18n` 进 `packages/shared/src/`，`store/index.ts` → `packages/shared/src/store.ts`。
- 子路径导出：`./document-utils` `./document-types` `./i18n` `./store` + barrel。依赖 ranuts。
- 全仓引用重写为 `@ranuts/shared/*`：lib 编辑器核心（onlyoffice-editor/converter/document/embed-api/events/ui）、agent-plugin/ui、index.ts、测试。
- 测试里的 `vi.mock('../../lib/i18n' | '../../lib/document-utils' | '../../store')` 同步改为 `@ranuts/shared/*`（perl 只改 import，mock 需单独改）。

## @ranuts/converter

- `git mv`：`document-converter.ts` + `docx-zip.ts` 进 `packages/converter/src/`。
- 依赖 `@ranuts/shared` + ranuts + ranui。x2t WASM 仍走 `window.Module`（host 加载；内部包无需注入，注入留待真要发布/跨 v7/v9 时再做）。
- 修掉预存在的 `window.message` 类型错误（`ranui/message` 注册的全局 toast，加类型 cast）——否则包 `prepare` 的 tsc 会失败。
- `lib/converter.ts` 的 `./document-converter` → `@ranuts/converter`。

## 验证

- `tsc --noEmit`：仅剩 `ranui/builder` 一个预存在错误（ranui 本地 link 的类型缺失）；`window.message` 错误已消。
- `pnpm test`：237/237。
- chrome-devtools：新建 PPT 经 @ranuts/converter 正确转换 + 渲染（字体正常），右栏 AI 正常，零报错。

## 当前 packages/ 全貌

```
packages/
  chat-ui/      通用聊天 UI（零依赖，可发布）
  agent-core/   LLM + runtime（编辑器无关）
  shared/       document-utils / types / i18n / store（内部）
  converter/    x2t 转换 + docx-zip（依赖 shared）
```
`lib/` 现在剩：编辑器核心（onlyoffice-editor/converter/document/ui/embed-api/events/loading/file-types/empty_bin）+ agent-plugin 的编辑器部分（tools/editor-bridge/ui）。这些是版本相关的"应用核心"，按规划归 v7/v9 各自的 editor 包，暂留本地。

## 提交

同前：只提交代码 + 包，`pnpm-workspace.yaml` + `lock` 暂缓（ranui 本地 link 纠缠，待发版补）。
