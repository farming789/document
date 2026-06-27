# 2026-06-23 Agent：Excel 工具 + 字体乱码排查

回应:实现 Excel 工具、排查 PPT 字体乱码。全程 chrome-devtools 实测。

## 字体乱码：定位为 PPT 占位符局部问题，非全局 bug

- 网络请求确认所有字体（LiberationSans 拉丁、NotoSansSC 中文、ASC.ttf 图标）**全部 200/304 加载成功,无 404**,字体 patch 工作正常。
- **Excel 渲染完全正常**(截图确认 "PasteTextVal" / "Normal" / "Neutral" / "Arial" 等全清晰),Word 之前也正常。
- 乱码**只出现在新建 PPT 的占位符文字**(主题字体 DengXian Light 替换)。
- 结论:这是 PPT 主题字体替换的局部问题,很可能是自动化测试 Chrome 的字体环境特有,**不是全局字体 bug**。字体系统在本仓库调过很多次,不应基于一个未确认影响真实用户的现象去改全局字体映射。**建议在真实部署站点确认是否复现,再决定是否处理。**

## Excel 工具:实测后实现

实测 cell 编辑器(关键发现见 cross-editor 那篇:Excel 的 api 在 `Asc.editor`,bridge 已修):

| 能力                  | 验证结果                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------- |
| 读选区                | `pluginMethod_GetSelectedText` ✓                                                          |
| 写活动单元格          | `PasteHtml`/`PasteText` ✓(首次焦点未就绪会瞬态读空,实际已写入,截图确认 A1="PasteTextVal") |
| **按地址定位+写**     | `asc_findCell('C3')` + `PasteText` ✓(截图确认 C3="CellC3Value",A1 不受影响)               |
| 读指定单元格          | `asc_findCell` + `asc_getCellInfo().asc_getText()` ✓                                      |
| `asc_setCellValue`    | ✗ 抛错(需单元格编辑态),不用                                                               |
| `asc_RemoveSelection` | ✗ Excel 里 undefined(Word 专用)                                                           |

### 新增工具

- `set_cell({ cell, value })`:`asc_findCell` 定位 + `pluginMethod_PasteText` 写入。Excel 专用,非表格编辑器抛友好错误。
- `get_cell({ cell })`:定位 + 读 `asc_getCellInfo().asc_getText()`。

### 修复

- `get_document_text` 改为 `asc_RemoveSelection?.()`(Excel 没有此方法,原会抛错——已被 runtime catch,但现在更干净)。

### 现状:6 通用工具 + 2 Excel 专用

通用工具(insert/get_selection/replace/comment/review)经 cross-editor 修复后在 Word/Excel/PPT 都作用于当前选区/活动单元格;Excel 另有按地址读写的 set_cell/get_cell。系统 prompt 已说明。

## 验证

- tsc / oxlint / prettier:通过
- 单测:205 通过(set_cell/get_cell/get_document_text 健壮性 共 8 个新用例)
- chrome-devtools:Excel 写单元格、按地址定位、字体渲染逐一截图确认
