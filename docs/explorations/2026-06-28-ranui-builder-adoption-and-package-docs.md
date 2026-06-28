# 2026-06-28 ranui 类型修复后：builder 改造 + 去重 + 四包文档

## 背景：ranui 类型问题已修

ranui 重建后 `dist/` 产出 179 个 `.d.ts`（含 `builder.d.ts`），具名导入终于有类型。之前的 `TS7016`（ranui/builder 无声明）消失。配合本会话早先修掉的 `window.message` 类型错误，**项目首次 tsc 零错误**（不再需要过滤）。临时加的 `types/ranui.d.ts` shim 已删除（改用 ranui 自带类型）。

> 仍是本地 link `1.0.0-beta-0`（未发布），版本与 package.json 声明不一致——发布后再收尾。

## 去重（用 ranuts/ranui 替换手写）

全仓扫描后，真正"手写了库已有功能"的只有一处：

- `lib/agent-plugin/tools.ts` 的 `textToHtml` 手写 HTML 转义 → 改用 ranuts `escapeHtml`（多转引号，更安全；测试用例不含引号，断言不变）。

其余想替换的（`URLSearchParams`、`classList.add`、`new Promise(setTimeout)`）是**标准原生写法、非重复**，刻意不换。store/i18n/loading/converter 早已在用 ranuts/ranui。

## ui.ts 改用 ranui builder

`lib/ui.ts` 的手写 `document.createElement` 全部改为 ranui `builder` 的链式工厂：`Div() / ButtonBuilder() / View('r-button')` + `.id().class().text().attr().on().children().build()`。

- FAB 菜单、控制面板、菜单引导提示全部重写，**逐行保留**原有 hover/动画/时序逻辑。
- 事件用 builder 的 `.on(type, handler)`；hover 内改 `this.style` 用 `function` 监听器（`this` 即元素）。
- 把控制面板的"新建文档"按钮抽成 `newDocButton(id,label,ext)` 收敛重复。

验证（chrome-devtools）：控制面板 4 按钮、FAB hover 弹菜单(display:flex)、5 个菜单项、点 "New PowerPoint"(builder 绑定的 click)→ 编辑器加载，零报错。

## 四个包的文档（仿 ranui/ranuts）

每个包补齐 `README.md` + **`CLAUDE.md`（AI 使用说明）**：

- README：功能、安装、用法、API 表。
- CLAUDE.md：用途、何时用、import map、API + 示例、**gotchas/约束**、测试要点。
- chat-ui/agent-core 已有 README → 补 CLAUDE.md；shared/converter → README + CLAUDE.md 都补。

要点写进文档的硬约束，例如：chat-ui 零依赖勿引 ranui；agent-core runtime 不默认工具、必须传 tools；converter 的 x2t 走 `window.Module`、需 host 加载；shared 的 `t()` 加键要补全 9 种语言。

## 验证

tsc 零错误、`pnpm test` 237/237、chrome-devtools 端到端通过。

## 提交

同前：代码 + 文档提交，`pnpm-workspace.yaml` + `lock` 暂缓（ranui 本地 link，待发版补）。
