# 字体管理

## 为什么不包含字体文件

本项目不包含 Arial、Times New Roman、微软雅黑、宋体等受版权保护的字体文件。这些字体名称的引用保留在配置文件中以确保文档兼容性，但实际字体文件已移除，以符合开源许可要求。

## 添加字体

字体文件放在 `public/fonts/` 目录下，文件名为 `public/sdkjs/common/AllFonts.js` 中 `__fonts_files` 数组的对应数字索引（无需扩展名）。

**示例：添加 Arial 字体**

1. 打开 `AllFonts.js`，找到 Arial 常规字体的索引 — 是 `223`
2. 将字体文件放置为 `public/fonts/223`
3. 应用程序引用索引 `223` 时会自动加载该文件

Arial 其他变体：

| 变体   | 索引 | 路径               |
| ------ | ---- | ------------------ |
| 常规   | 223  | `public/fonts/223` |
| 斜体   | 224  | `public/fonts/224` |
| 粗体   | 226  | `public/fonts/226` |
| 粗斜体 | 225  | `public/fonts/225` |

查找任意字体的索引，请查阅 `AllFonts.js` 中的 `__fonts_infos` 数组。

> 请仅使用开源字体或拥有合法授权的字体。
