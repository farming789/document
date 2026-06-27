# 2026-06-23 Agent Phase 1（完）：get_document_text + add_comment

补齐上一篇 `2026-06-23-agent-phase1-tools.md` 中标记"待验证"的两个工具，Phase 1 工具层收尾。

## 运行时验证（chrome-devtools，v7.5 离线版）

| 机制       | 结论                                                                                                                                                                                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 取全文     | 无非破坏式 API：原型上没有 `GetSelectionState`/`SetSelectionState`，`WordControl`/logic document 在 minified 构建里不可达。可行链路：`asc_EditSelectAll()` → `pluginMethod_GetSelectedText()` → `asc_RemoveSelection()`。实测取到 "Alpha line.\nBeta line.\n\n"，清除后选区归 none。**代价：光标位置被重置（不可恢复）。** |
| 评论构造器 | `Asc.asc_CCommentDataWord`（Word 专用，**不是** `asc_CCommentData`）。`new` 出对象后 setter：`asc_putText` / `asc_putUserName` / `asc_putUserId` / `asc_putTime` 等。实测 `asc_addComment(cd)` 成功，`asc_GetCommentsReportByAuthors()` 返回 `["Agent"]`。                                                                 |

## 实现

### editor-bridge 扩展

`asc_CCommentDataWord` 在**编辑器 iframe 的 `Asc`** 上，构造的对象必须传给同 frame 的 `asc_addComment`（跨 realm 不匹配）。所以新增：

- `getEditorContext()` / `requireEditorContext()` → 返回 `{ api, Asc }`，让需要构造 SDK 对象的工具拿到编辑器 frame 的 `Asc`。
- 内部抽出 `findEditorWindow()`，`getEditorApi` 与 `getEditorContext` 共用同一套 iframe 定位逻辑。
- `EditorApi` 接口补 `asc_EditSelectAll` / `asc_RemoveSelection` / `asc_addComment`；新增 `CommentData` / `EditorAsc` / `EditorContext` 类型。

### 新工具

- `get_document_text`（只读）→ 全选+取文本+清除选区，`maxChars` 默认 8000 截断，描述里明确"会重置光标"。
- `add_comment`（写）→ `new Asc.asc_CCommentDataWord()` + `asc_putText`/`asc_putUserName` + `asc_addComment`，`author` 默认 "Agent"。

## 验证

- tsc / oxlint / prettier：通过
- 单测：143 通过（agent 部分增至 43）；`lib/agent-plugin` 覆盖率 98.7% 语句 / 100% 行/函数

## Phase 1 工具层完成

6 个工具全部基于实测机制：`insert_text`、`get_selection`、`replace_selection`、`set_review_mode`、`get_document_text`、`add_comment`。下一步 Phase 1.2：LLM 接入层。
