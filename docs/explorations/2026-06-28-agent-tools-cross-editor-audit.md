# Agent 工具跨编辑器能力审计（2026-06-28）

用 chrome-devtools 实测三个编辑器（Word/Excel/PPT）的 `window.editor` / `Asc`，核对每个工具用到的方法是否存在。

## 能力矩阵（✓=存在）

| 工具 / 方法 | Word | Excel | PPT |
|---|---|---|---|
| insert_text · `pluginMethod_PasteHtml` | ✓ | ✓ | ✓ |
| get_selection · `pluginMethod_GetSelectionType/GetSelectedText` | ✓ | ✓ | ✓ |
| replace_selection · `pluginMethod_ReplaceTextSmart` | ✓ | ✓ | ✓ |
| get_document_text · `asc_EditSelectAll` | ✓ | ✓ | ✓ |
| （get_document_text 清选区）`asc_RemoveSelection` | ✓ | ✗ | ✗ |
| add_comment · `asc_addComment` | ✓ | ✓ | ✓ |
| add_comment 构造器 `asc_CCommentDataWord` | ✓ | ✗ | ✗ |
| add_comment 构造器 `asc_CCommentData` | ✗ | ✓ | ✓ |
| **set_review_mode · `asc_SetTrackRevisions/IsTrackRevisions`** | ✓ | **✗** | **✗** |
| set_cell/get_cell · `asc_findCell/getCellInfo` | ✗ | ✓ | ✗ |

## 发现的问题与处理

1. **add_comment 在 Excel/PPT 崩**（`asc_CCommentDataWord` 是 Word 专用）→ 已修：`asc_CCommentDataWord ?? asc_CCommentData` 选可用构造器。（见 add-comment-spreadsheet-ctor）
2. **set_review_mode 在 Excel/PPT 崩**（`asc_SetTrackRevisions` 不存在）→ 已修：工具内 `typeof` guard，不存在则抛"仅 Word 可用"；描述也标注 Word-only。
3. `asc_RemoveSelection` 仅 Word/（部分）存在 → 工具已用可选链 `asc_RemoveSelection?.()`，安全。
4. set_cell/get_cell 已有 Excel-only 运行时 guard，安全。

## 结论

文本类工具（insert/get_selection/replace/get_document_text）三编辑器通用。**带特性差异的工具（comment / review / cell）必须运行时特性检测**，不能假设方法存在——这是离线 v7.5 跨编辑器的通用教训。修复后全部工具要么可用、要么抛清晰的"本编辑器不支持"错误（被 runtime 捕获回灌给模型）。
