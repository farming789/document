# OnlyOffice Web

<p align="center">
  <a href="https://github.com/ranuts/document/actions/workflows/ci.yml">
    <img src="https://github.com/ranuts/document/actions/workflows/ci.yml/badge.svg" alt="CI Status">
  </a>
  <a href="https://github.com/ranuts/document/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/ranuts/document" alt="授权许可">
  </a>
  <a href="https://github.com/ranuts/document/releases">
    <img src="https://img.shields.io/github/v/release/ranuts/document" alt="版本">
  </a>
  <a href="https://ranuts.github.io/document/">
    <img src="https://img.shields.io/badge/在线-体验-brightgreen" alt="在线体验">
  </a>
</p>

<p align="center">
  <a href="readme.md">English</a> | <b>中文</b>
</p>

基于 OnlyOffice 的本地网页文档编辑器，让您直接在浏览器中编辑文档，无需服务器端处理，保护您的隐私安全。

## ✨ 主要特性

- 🔒 **隐私优先**: 所有文档处理都在浏览器本地进行，不上传到任何服务器
- 📝 **多格式支持**: 支持 DOCX、XLSX、PPTX、CSV 等多种文档格式
- ⚡ **实时编辑**: 提供流畅的实时文档编辑体验
- 🚀 **无需部署**: 纯前端实现，无需服务器端处理
- 🎯 **即开即用**: 打开网页即可开始编辑文档
- 🌐 **URL 打开**: 通过 URL 参数直接从远程地址加载文档
- 🌍 **多语言支持**: 支持多种语言（英文、中文），轻松切换界面语言

## 📖 使用方法

### 基本使用

1. 访问 [在线编辑器](https://ranuts.github.io/document/)
2. 上传您的文档文件或从 URL 打开文档
3. 直接在浏览器中编辑
4. 下载编辑后的文档

### 离线使用 (PWA)

本应用通过 PWA（渐进式 Web 应用）技术支持离线使用。

1. 使用支持的浏览器（Chrome、Edge 等）通过 **HTTPS**（或 localhost）访问编辑器。
2. 点击地址栏中的**安装**图标进行安装。
3. 安装后，可以从应用程序菜单启动编辑器，且在断网状态下也能正常工作。

**注意**：由于浏览器安全限制，Service Worker（离线支持所需）在直接从文件系统打开 `index.html`（`file://` 协议）时无法工作。您必须使用本地服务器或已安装的 PWA。

### URL 参数

| 参数     | 说明                        | 值/类型    | 优先级 |
| -------- | --------------------------- | ---------- | ------ |
| `locale` | 设置界面语言                | `en`, `zh` | -      |
| `src`    | 从 URL 打开文档（推荐）     | URL 字符串 | 低     |
| `file`   | 从 URL 打开文档（向后兼容） | URL 字符串 | 高     |

**示例：**

```bash
# 设置语言
?locale=zh

# 从 URL 打开文档
?src=https://example.com/document.docx

# 组合使用
?locale=zh&src=https://example.com/doc.docx
```

**注意**: 当同时提供 `file` 和 `src` 参数时，`file` 参数优先。远程 URL 必须支持 CORS。

### 作为组件库使用

本项目为 [@ranui/preview](https://www.npmjs.com/package/@ranui/preview) WebComponent 组件库提供文档预览组件的基础服务支持。

📚 **预览组件文档**: [https://chaxus.github.io/ran/src/ranui/preview/](https://chaxus.github.io/ran/src/ranui/preview/)

## 🧩 iframe 嵌入使用方式

本项目支持通过 iframe 嵌入到其他业务系统中。推荐架构是：**父系统负责鉴权、下载文件和上传保存结果；iframe 只负责文档编辑**。这样 token、cookie、业务接口都留在父系统内，编辑器不需要知道业务系统的授权细节。

项目内置了一个示例页面：

```text
/embed-demo.html
```

本地启动后可以访问：

```text
http://127.0.0.1:8082/embed-demo.html
```

### 1. 嵌入编辑器

```html
<iframe id="documentEditor" src="http://127.0.0.1:8082/?embed=1" style="width: 100%; height: 720px; border: 0"></iframe>
```

如果需要限制只接收指定父页面来源，可以增加 `embedOrigin`：

```html
<iframe id="documentEditor" src="http://127.0.0.1:8082/?embed=1&embedOrigin=https://your-system.example.com"></iframe>
```

### 2. 发送命令

建议每条命令带上 `id`，便于父页面匹配响应：

```js
const iframe = document.getElementById('documentEditor');
const editorOrigin = 'http://127.0.0.1:8082';

function sendEditorCommand(type, payload = {}) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  iframe.contentWindow.postMessage({ id, type, payload }, editorOrigin);
  return id;
}
```

监听 iframe 响应：

```js
window.addEventListener('message', (event) => {
  if (event.origin !== editorOrigin) return;

  const { id, type, payload } = event.data || {};
  if (!type || !type.startsWith('document:')) return;

  if (type === 'document:ready') {
    console.log('编辑器已就绪');
  }

  if (type === 'document:opened') {
    console.log('文档已打开', id, payload);
  }

  if (type === 'document:saved') {
    console.log('保存完成', payload.fileName, payload.file);
  }

  if (type === 'document:error') {
    console.error('编辑器错误', payload.message);
  }
});
```

### 3. 打开文档

通过 URL 打开：

```js
sendEditorCommand('document:open-url', {
  url: 'https://example.com/files/demo.xlsx',
  fileName: 'demo.xlsx',
  readonly: false,
});
```

如果 URL 接口需要授权，可以传 `fetchOptions`，但更推荐由父系统自己 `fetch` 后传入文件对象：

```js
sendEditorCommand('document:open-url', {
  url: 'https://example.com/api/files/1',
  fileName: 'demo.xlsx',
  fetchOptions: { headers: { Authorization: `Bearer ${token}` } },
});
```

通过本地文件对话框打开：

```js
const input = document.createElement('input');
input.type = 'file';
input.accept = '.xlsx,.xls,.csv,.docx,.doc,.pptx,.ppt';
input.onchange = () => {
  const file = input.files[0];
  sendEditorCommand('document:open-file', { file, readonly: false });
};
input.click();
```

通过父系统授权请求后传入二进制数据：

```js
const response = await fetch('/api/files/1', {
  headers: { Authorization: `Bearer ${token}` },
});
const buffer = await response.arrayBuffer();
sendEditorCommand('document:open-buffer', {
  fileName: 'demo.xlsx',
  buffer,
  readonly: false,
});
```

### 4. 设置只读

```js
sendEditorCommand('document:set-readonly', { readonly: true });
```

### 5. 保存并上传到服务端

保存命令会触发编辑器导出当前正在编辑的内容，并通过 `document:saved` 返回一个新的 `File` 对象。默认保存为 `XLSX`，也可以传入其他格式，例如 `DOCX`、`PPTX`、`CSV`。

```js
sendEditorCommand('document:save', { targetExt: 'XLSX' });
```

默认情况下，保存命令必须等到编辑器返回当前编辑后的文件数据；如果超时会返回 `document:error`，避免误把原始文件上传到服务端。如果业务确实希望"没有修改时也回传原文件"，可以显式开启：

```js
sendEditorCommand('document:save', { targetExt: 'XLSX', returnOriginalOnTimeout: true });
```

父页面拿到文件后自行上传：

```js
window.addEventListener('message', async (event) => {
  if (event.origin !== editorOrigin) return;
  const { type, payload } = event.data || {};
  if (type !== 'document:saved') return;

  await fetch('/api/files/1', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: payload.file,
  });
});
```

> **注意：** 不要只用 `size` 判断文件是否变化，`xlsx` 是压缩包格式，轻微编辑后文件大小可能刚好不变。建议在调试时对返回的 `File` 计算 hash，项目内置的 `/embed-demo.html` 已经会在保存日志里打印 `sha256`。
```

### 6. 支持的消息

| 方向 | 类型 | 说明 |
| --- | --- | --- |
| 父页面 → iframe | `document:open-url` | 通过 URL 打开文档 |
| 父页面 → iframe | `document:open-file` | 通过 `File` / `Blob` 打开文档 |
| 父页面 → iframe | `document:open-buffer` | 通过 `ArrayBuffer` / `Uint8Array` 打开文档 |
| 父页面 → iframe | `document:set-readonly` | 设置只读或可编辑 |
| 父页面 → iframe | `document:save` | 保存并返回 `File` |
| 父页面 → iframe | `document:get-state` | 获取当前状态 |
| iframe → 父页面 | `document:ready` | iframe 初始化完成 |
| iframe → 父页面 | `document:opened` | 文档打开完成 |
| iframe → 父页面 | `document:readonly-changed` | 只读状态已切换 |
| iframe → 父页面 | `document:saved` | 保存完成，返回文件 |
| iframe → 父页面 | `document:state` | 返回当前状态 |
| iframe → 父页面 | `document:error` | 操作失败 |

## 🛠️ 技术架构

- **OnlyOffice SDK**: 提供强大的文档编辑能力
- **WebAssembly**: 通过 x2t-wasm 实现文档格式转换
- **纯前端架构**: 所有功能都在浏览器中运行

## 🚀 部署说明

### Docker

```bash
# docker run
docker run -d --name document -p 8080:80 ghcr.io/ranuts/document:latest

# docker compose
services:
  document:
    image: ghcr.io/ranuts/document:latest
    container_name: document
    ports:
      - 8080:80
```

#### 进阶配置

```yaml
name: document
services:
  document:
    image: ghcr.io/ranuts/document:latest
    container_name: document
    ports:
      - 8080:80
    # 进阶配置
    volumes:
      # 添加证书
      - 证书路径:/ssl
    environment:
      # 设置账号
      # 格式用户名:密码，必须使用 BCrypt 密码哈希函数对密码进行编码。
      # 获取 BCrypt 加密的结果，把加密结果中的$替换成$$转义。
      SERVER_BASIC_AUTH: '用户名:BCrypt 加密密码'
      # 使用证书
      SERVER_HTTP2_TLS: true
      SERVER_HTTP2_TLS_CERT: 证书路径
      SERVER_HTTP2_TLS_KEY: 私钥路径
```

### 重要提示

- **CORS**: 使用 `src` 或 `file` 参数时，远程服务器必须支持 CORS
- **文件大小**: 大文件可能需要较长时间加载

## 🔧 本地开发

```bash
git clone https://github.com/ranuts/document.git
cd document
pnpm install
pnpm run dev
```

## 🔤 字体管理

### 项目中的字体文件

本项目作为开源项目，为了符合开源许可要求，**不包含**受版权保护的字体文件，如 **Arial**、**Times New Roman**、**微软雅黑**、**宋体** 等 Windows 系统字体。这些字体的名称引用仍保留在配置文件中，以确保与现有文档的兼容性，但实际的字体文件已被移除，以符合开源许可要求。

### 添加字体

要为项目中已配置的字体（如 Arial、Times New Roman 等）添加字体文件，只需将字体文件放置在 `public/fonts/` 目录下，并重命名为对应的数字索引。该索引对应 `public/sdkjs/common/AllFonts.js` 文件中 `__fonts_files` 数组的索引位置。

**示例：添加 Arial 字体**

如果您想为项目添加 Arial 字体：

1. 查看 `AllFonts.js` 文件，找到 Arial 常规字体在 `__fonts_files` 数组中使用的索引是 `223`
2. 将您的 Arial 字体文件放置在 `public/fonts/` 目录下，并重命名为 `223`（无需扩展名）
3. 字体文件应位于 `public/fonts/223`
4. 当应用程序引用索引 `223` 时，会自动从 `public/fonts/223` 加载该字体文件

其他 Arial 字体变体同样处理：

- Arial 粗体使用索引 `226` → 将字体文件放置为 `public/fonts/226`
- Arial 斜体使用索引 `224` → 将字体文件放置为 `public/fonts/224`
- Arial 粗斜体使用索引 `225` → 将字体文件放置为 `public/fonts/225`

您可以通过查看 `AllFonts.js` 文件中的 `__fonts_infos` 数组来查找任何字体的索引，每个字体条目都指定了其常规、粗体、斜体和粗斜体变体的索引。

**注意**：请仅使用开源字体或您拥有合法使用许可的字体。在添加任何字体文件之前，请确保符合字体许可条款。

## 📚 参考资料

- [onlyoffice-x2t-wasm](https://github.com/cryptpad/onlyoffice-x2t-wasm) - 基于 WebAssembly 的文档转换器
- [se-office](https://github.com/Qihoo360/se-office) - 安全文档编辑器
- [web-apps](https://github.com/ONLYOFFICE/web-apps) - OnlyOffice 网页应用
- [sdkjs](https://github.com/ONLYOFFICE/sdkjs) - OnlyOffice JavaScript SDK
- [onlyoffice-web-local](https://github.com/sweetwisdom/onlyoffice-web-local) - 本地网页版 OnlyOffice 实现

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来帮助改进这个项目！

## 📄 许可证

详情请参阅 [LICENSE](LICENSE) 文件。
