# 2026-06-23 Agent：重新打开 + 引用选区 + 跨编辑器（Word/Excel/PPT）

回应三个诉求:面板关了怎么再打开、能不能选中文字提问、Excel/PPT 能不能用。

## 1. 关闭后重新打开

面板关闭原来只是隐藏、无法再开。新增悬浮启动按钮（右下角圆形「AI」）:关闭→显示启动按钮,点击→重新打开。`setOpen(bool)` 同步面板与启动按钮的显隐。

## 2. 引用选区提问

工具栏加「引用选区」按钮:读 `pluginMethod_GetSelectedText()`,把选中文字以引用块插入输入框,用户接着提问即可。空选区给出提示。

## 3. 跨编辑器（关键 bug 修复）

chrome-devtools 实测 Word / Excel / PPT 三种编辑器:

| 编辑器    | `window.editor` | `Asc.editor` | pluginMethod\_\* / asc_addComment |
| --------- | --------------- | ------------ | --------------------------------- |
| Word      | ✓               | ✓            | ✓                                 |
| **Excel** | ✗ **undefined** | ✓            | ✓                                 |
| PPT       | ✓               | ✓            | ✓                                 |

**发现真 bug**:Excel（spreadsheet 编辑器）里 `window.editor` 是 undefined,api 只在 `window.Asc.editor` 上。原 `editor-bridge` 只找 `win.editor`,**在 Excel 完全失效**。

**修复**:`editor-bridge` 新增 `resolveApi(win) = win.editor ?? win.Asc.editor`,`getEditorApi` / `getEditorContext` / `findEditorWindow` 全部改用它。

**结果**:6 个工具 + get_selection + 引用选区 + 修订模式在 **Word / Excel / PPT 三种编辑器都能用**——它们作用于当前的文本/单元格/形状选区。系统 prompt 也更新说明这点。

## 关于编辑器专属功能（Excel 公式 / PPT 加幻灯片）

实测发现这些通用 `pluginMethod_*` 已覆盖"读选区 / 插入 / 替换 / 批注"跨编辑器需求。更细的专属能力（`asc_setCellValue` 需单元格编辑态、PPT 没有干净的 add-slide 插件方法）需要更谨慎的验证,本轮先不做,留作后续——通用工具已能让 agent 往当前单元格/形状插改文字。

## 验证

- tsc / oxlint / prettier:通过
- 单测:197 通过(editor-bridge 新增 Excel `Asc.editor` 回退用例 2 个,100% 行)
- chrome-devtools 实测:Word/Excel/PPT 三编辑器的 api 定位与 pluginMethod 可用性逐一确认
