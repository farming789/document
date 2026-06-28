# 2026-06-28 Word 样式库乱码 → 字体改写改为仅 Excel 启用

## 现象

Word 顶部样式库（Normal / Heading / Heading 1-5 …）的 Calibri 文字乱码（"Fc_bg"…），和之前 PPT 占位符乱码同一根因。

## 原因

字体改写 patch（`onlyoffice-v7-iframe-patch.js`）此前只在 **presentation** 编辑器禁用、**Word 仍开启**。Word 把 Calibri 字体请求改写成替换 TTF（LiberationSans），引擎按 glyph-ID 渲染 → 字形错位。

字体改写当初是为 **Excel(cell) 的 CJK #62/#64** 加的；Word/PPT 并不需要它。

## 修复

`DISABLE_FONT_REMAP` 由"presentation 才禁用"改为**"仅 spreadsheet 启用"**：

```js
var DISABLE_FONT_REMAP = window.location.pathname.indexOf('spreadsheeteditor') === -1;
```

即 Word + PPT 都不改写（走引擎内置 cmap 字形，正确），只有 Excel 保留改写（修 CJK）。

## 验证（chrome-devtools，Word）

- 样式库恢复可读：Normal / No spacing / Heading / Heading 2-5。
- 插入 `中文测试 Heading 标题 正常` —— **中英文均正常渲染**（Word 的 CJK 由引擎内置回退处理，无需改写）。
- Excel 改写保持开启、未改动，CJK 不受影响。

## 教训

字体改写是 **cell 编辑器专属** workaround，绝不能全局套用——Word/PPT 用 glyph-ID 渲染，套替换字体必乱。
