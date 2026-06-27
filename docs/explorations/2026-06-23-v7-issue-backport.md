# 2026-06-23 release/v0.0.4 issue 核对与补充修复

针对 GitHub issues 在 `release/v0.0.4` 分支逐个核对，并补上之前 backport 漏掉的可靠修复。

## 核对结论

### 已在分支修复（commit 117ac00 backport）

| #     | 问题                   | 依据                                                  |
| ----- | ---------------------- | ----------------------------------------------------- |
| 62    | Excel 输入日期不显示   | 字体 XHR patch + font-map（CJK / Windows 路径重映射） |
| 64    | Excel 右对齐文字不显示 | 同上，同一字体根因                                    |
| 28    | 另存 PDF 空白/无字     | `loadFontsForPdf()` 注入字体到 WASM FS                |
| 19    | 导出本地图片丢失       | media Blob 正确 MIME                                  |
| 94-1  | PPTX GIF 动画被转 PNG  | ZIP 预提取 + 合并保留原 GIF                           |
| 20    | 缺 SmartArts.bin       | 文件已补（7.7MB 有效二进制）                          |
| 13    | CSV 打开报错           | CSV→cell 编辑器映射 + 保存格式                        |
| 37/32 | 默认中文 UI / 切换语言 | i18n 默认 en，按 locale/cookie/navigator 检测         |

### 本次新增修复

| #        | 问题                                        | 修复                                                                                        |
| -------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 84       | Safari `requestIdleCallback` ReferenceError | v7 patch 顶部加 `requestIdleCallback`/`cancelIdleCallback` polyfill                         |
| 25/85/87 | 纯预览模式                                  | 接线 `?readonly=true` URL 参数；editor config 加默认 Guest user 规避 `getInitials` 空名崩溃 |

### 确认无法/不应在本分支修复

| #        | 问题                    | 原因                                                                                                                                                                                             |
| -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 12/15/92 | 光标位置 / HiDPI 模糊   | v7 SDK 的 `GetSupportedScaleValues` 受 `AscDesktopEditor` 存在性门控；v7 浏览器模式无 `AscDesktopEditor`，走原生 `devicePixelRatio`。v9 的 shim 搬过来会装上假桌面路径，**有害无益**，故保持不动 |
| 94-2     | PPTX 动画序列合并成一次 | x2t WASM 限制，JS 层不可修                                                                                                                                                                       |
| 49       | 预览 .doc 报 code:88    | 旧 .doc 二进制格式 x2t 限制                                                                                                                                                                      |
| 72       | 粘贴图片保存报错        | 通用 MIME 改善有帮助，但无针对性修复                                                                                                                                                             |

其余（#6/#21/#22/#27/#34/#50/#53 等）为功能请求，不属于"修复"范畴。

## 关键技术点

### #84 — requestIdleCallback polyfill

v7 SDK（word/cell/slide `sdk-all-min.js`）多处**裸调用** `requestIdleCallback(...)`，旧版 Safari 无此全局，init 阶段抛 `ReferenceError`。polyfill 放在 `public/onlyoffice-v7-iframe-patch.js` 的 IIFE 顶部——该 patch 在 SDK 脚本之前注入每个编辑器 iframe，运行在 iframe window 上下文，定义 `window.requestIdleCallback` 即可覆盖裸引用。主页面与 ranuts/ranui 依赖均不使用该 API，无需另外 polyfill。

### #25/#85/#87 — 纯预览模式

`openDocumentFromUrl` 早已支持 `readonly` 选项并透传至 `handleDocumentOperation`，只是 `index.ts` 没解析 URL 参数。补上 `?readonly=true`（兼容 `?readonly=1`、裸 `?readonly`）。

`getInitials` 崩溃：SDK 对空 user name 调 `getInitials('')` 抛错，是预览模式常见崩溃源。与其手改 minified `app.js`（脆弱、低置信），不如在 `editorConfig` 提供默认 `user: { id: 'guest', name: 'Guest' }`，从源头保证当前用户有非空 name。

### #12/#15/#92 — 为何不动

v7 与 v9 的 HiDPI 根因不同。v9 是 `AscDesktopEditor` 存在但 `GetSupportedScaleValues` 返回 `[]` 关闭了 DPR；v7 浏览器模式**根本没有** `AscDesktopEditor`，SDK 的 `AscDesktopEditor && t.AscDesktopEditor.GetSupportedScaleValues` 门控直接跳过，走原生 `devicePixelRatio`。给 v7 patch 加同款 shim 反而引入假桌面路径。先实测根因再决定，验证结论为"不加"。
