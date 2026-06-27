# 2026-06-23 Agent Phase 1（续）：只读/写工具 + bridge 选择器修正

承接 `2026-06-23-agent-phase1-editor-bridge.md`，补齐第一批工具，并修复上一版 bridge 的一个真 bug。

## 关键修复：editor-bridge 选择器错误

上一版 `getEditorApi()` 用 `document.getElementById('iframe')` 定位编辑器。运行时实测发现：**OnlyOffice 的 `DocsAPI.DocEditor('iframe', ...)` 会把占位 `<div id="iframe">` 整个替换成 `<iframe name="frameEditor">`（挂在 `#app` 下）**，挂载后 `#iframe` 元素已不存在。上一版能在 Phase 0 探针里"工作"只是因为探针里有 `|| document.querySelector('iframe')` 兜底。

修正：`getEditorApi()` 改为优先 `iframe[name="frameEditor"]`，再回退到扫描所有 iframe 找带 `contentWindow.editor` 的那个。

## 运行时验证（chrome-devtools，v7.5 离线版）

| 机制                                                | 结论                                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `pluginMethod_GetSelectedText` / `GetSelectionType` | 同步返回，选区文本用 `\r\n` 分隔                                                                    |
| `pluginMethod_ReplaceTextSmart`                     | 签名 `(e,o,s)`，`e` 是**字符串数组**（按行）；实测 `ReplaceTextSmart(['x'])` 成功替换全选内容       |
| `asc_SetTrackRevisions` / `asc_IsTrackRevisions`    | set(true)→getter 返回 true，set(false)→false，可用                                                  |
| `asc_EditSelectAll`                                 | 全选可用（但取全文需全选→破坏光标，非破坏式取全文需 callCommand，未验证）                           |
| `asc_addComment(t)`                                 | 收一个 comment 数据对象；构造器**不在** `Asc.asc_CCommentData` / `AscCommon.CCommentData`，位置待查 |

## 本次新增工具（全部基于已验证机制）

- `get_selection`（只读）→ `GetSelectionType` + `GetSelectedText`，`\r\n` 归一化为 `\n`
- `replace_selection`（写）→ `ReplaceTextSmart(text.split(换行))`，修订模式下自动记录为 change
- `set_review_mode`（写）→ `asc_SetTrackRevisions` + 回读 `asc_IsTrackRevisions`

## 本轮不做（机制未确认，避免写无效代码）

- `get_document_text`：需非破坏式取全文机制（疑似 `asc_pluginRun` + callCommand），待验证
- `add_comment`：需先找到 comment 数据类的构造器与 setter

## 验证

- tsc / oxlint / prettier：通过
- 单测：130 通过（agent 部分 26，+12）；`lib/agent-plugin` 覆盖率 98% 语句 / 100% 行
