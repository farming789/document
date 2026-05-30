# OnlyOffice Web

<p align="center">
  <a href="https://github.com/ranuts/document/actions/workflows/ci.yml">
    <img src="https://github.com/ranuts/document/actions/workflows/ci.yml/badge.svg" alt="CI Status">
  </a>
  <a href="https://github.com/ranuts/document/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/ranuts/document" alt="License">
  </a>
  <a href="https://github.com/ranuts/document/releases">
    <img src="https://img.shields.io/github/v/release/ranuts/document" alt="Version">
  </a>
  <a href="https://ranuts.github.io/document/">
    <img src="https://img.shields.io/badge/Live-Demo-brightgreen" alt="Live Demo">
  </a>
</p>

<p align="center">
  <b>English</b> | <a href="readme.zh.md">中文</a>
</p>

A local web-based document editor based on OnlyOffice, allowing you to edit documents directly in your browser without server-side processing, ensuring your privacy and security.

## ✨ Key Features

- 🔒 **Privacy-First**: All document processing happens locally in your browser, with no uploads to any server
- 📝 **Multi-Format Support**: Supports DOCX, XLSX, PPTX, CSV, and many other document formats
- ⚡ **Real-Time Editing**: Provides smooth real-time document editing experience
- 🚀 **No Server Required**: Pure frontend implementation with no server-side processing needed
- 🎯 **Ready to Use**: Start editing documents immediately by opening the webpage
- 🌐 **Open from URL**: Load documents directly from remote URLs via URL parameters
- 🌍 **Multi-Language**: Supports multiple languages (English, Chinese) with easy switching

## 📖 Usage

### Basic Usage

1. Visit the [Online Editor](https://ranuts.github.io/document/)
2. Upload your document files or open from URL
3. Edit directly in your browser
4. Download the edited documents

### Offline Usage (PWA)

This application supports offline usage via PWA (Progressive Web App) technology.

1. Visit the editor using a supported browser (Chrome, Edge, etc.) over **HTTPS** (or localhost).
2. Click the **Install** icon in the address bar to install the app.
3. Once installed, the editor can be launched from your application menu and will work without an internet connection.

**Note**: Due to browser security restrictions, Service Workers (required for offline support) do not work when opening `index.html` directly from the filesystem (`file://` protocol). You must use a local server or the installed PWA.

### URL Parameters

| Parameter | Description                                  | Values/Type | Priority |
| --------- | -------------------------------------------- | ----------- | -------- |
| `locale`  | Set interface language                       | `en`, `zh`  | -        |
| `src`     | Open document from URL (recommended)         | URL string  | Low      |
| `file`    | Open document from URL (backward compatible) | URL string  | High     |

**Examples:**

```bash
# Set language
?locale=zh

# Open document from URL
?src=https://example.com/document.docx

# Combine parameters
?locale=zh&src=https://example.com/doc.docx
```

**Note**: When both `file` and `src` are provided, `file` takes priority. Remote URLs must support CORS.

### As a Component Library

This project provides foundational services for document preview components in the [@ranui/preview](https://www.npmjs.com/package/@ranui/preview) WebComponent library.

📚 **Preview Component Documentation**: [https://chaxus.github.io/ran/src/ranui/preview/](https://chaxus.github.io/ran/src/ranui/preview/)

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
<iframe
  id="documentEditor"
  src="http://127.0.0.1:8082/?embed=1"
  style="width: 100%; height: 720px; border: 0"
></iframe>
```

如果需要限制只接收指定父页面来源，可以增加 `embedOrigin`：

```html
<iframe
  id="documentEditor"
  src="http://127.0.0.1:8082/?embed=1&embedOrigin=https://your-system.example.com"
></iframe>
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
  readonly: false,
  fetchOptions: {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
});
```

通过本地文件对话框打开：

```js
const input = document.createElement('input');
input.type = 'file';
input.accept = '.xlsx,.xls,.csv,.docx,.doc,.pptx,.ppt';
input.onchange = () => {
  const file = input.files[0];
  sendEditorCommand('document:open-file', {
    file,
    readonly: false,
  });
};
input.click();
```

通过父系统授权请求后打开二进制数据：

```js
const response = await fetch('/api/files/1', {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

const buffer = await response.arrayBuffer();

sendEditorCommand('document:open-buffer', {
  fileName: 'demo.xlsx',
  buffer,
  readonly: false,
});
```

### 4. 设置只读

打开文档时可以直接设置：

```js
sendEditorCommand('document:open-buffer', {
  fileName: 'demo.xlsx',
  buffer,
  readonly: true,
});
```

文档打开后也可以切换：

```js
sendEditorCommand('document:set-readonly', {
  readonly: true,
});
```

只读模式下编辑权限会关闭，保存命令会返回 `document:error`。

### 5. 保存并上传到服务端

保存命令会触发编辑器导出当前正在编辑的内容，并通过 `document:saved` 返回一个新的 `File` 对象。默认保存为 `XLSX`，也可以传入其他格式，例如 `DOCX`、`PPTX`、`CSV`。

```js
sendEditorCommand('document:save', {
  targetExt: 'XLSX',
});
```

默认情况下，保存命令必须等到编辑器返回当前编辑后的文件数据；如果超时会返回 `document:error`，避免误把原始文件上传到服务端。如果你的业务确实希望“没有修改时也回传原文件”，可以显式开启：

```js
sendEditorCommand('document:save', {
  targetExt: 'XLSX',
  returnOriginalOnTimeout: true,
});
```

父页面拿到文件后自行上传：

```js
window.addEventListener('message', async (event) => {
  if (event.origin !== editorOrigin) return;

  const { type, payload } = event.data || {};
  if (type !== 'document:saved') return;

  await fetch('/api/files/1', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: payload.file,
  });
});
```

注意：不要只用 `size` 判断文件是否变化，`xlsx` 是压缩包格式，轻微编辑后文件大小可能刚好不变。建议在调试时对返回的 `File` 计算 hash，项目内置的 `/embed-demo.html` 已经会在保存日志里打印 `sha256`。

### 6. 支持的消息

| 方向 | 类型 | 说明 |
| ---- | ---- | ---- |
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

## 🛠️ Technical Architecture

- **OnlyOffice SDK**: Provides powerful document editing capabilities
- **WebAssembly**: Implements document format conversion through x2t-wasm
- **Pure Frontend Architecture**: All functionality runs in the browser

## 🚀 Deployment

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

#### Advanced Configuration

```yaml
name: document
services:
  document:
    image: ghcr.io/ranuts/document:latest
    container_name: document
    ports:
      - 8080:80
    # Advanced Configuration
    volumes:
      # Add certificates
      - certificate_path:/ssl
    environment:
      # Set account
      # Format username:password, password must be encoded using BCrypt hash function.
      # To get BCrypt encryption result, replace $ in the encrypted result with $$ for escaping.
      SERVER_BASIC_AUTH: 'username:BCrypt_encrypted_password'
      # Use certificate
      SERVER_HTTP2_TLS: true
      SERVER_HTTP2_TLS_CERT: certificate_path
      SERVER_HTTP2_TLS_KEY: private_key_path
```

### Important Notes

- **CORS**: Remote servers must support CORS when using `src` or `file` parameters
- **File Size**: Large files may take longer to load

## 🔧 Local Development

```bash
git clone https://github.com/ranuts/document.git
cd document
npm install
npm run dev
```

## 🔤 Font Management

### Font Files in This Project

This project is designed as an open-source solution, and therefore does not include proprietary font files such as **Arial**, **Times New Roman**, **Microsoft YaHei**, **SimSun**, and other Windows system fonts that are subject to copyright restrictions. These font references remain in the configuration files for compatibility with existing documents, but the actual font files have been removed to ensure compliance with open-source licensing requirements.

### Adding Fonts

To add fonts that are already configured in the project (such as Arial, Times New Roman, etc.), simply place the font files in the `public/fonts/` directory and rename them to match their corresponding index in the `__fonts_files` array in `public/sdkjs/common/AllFonts.js`.

**Example: Adding Arial Font**

If you want to add the Arial font to the project:

1. Check `AllFonts.js` and find that Arial regular font uses index `223` in the `__fonts_files` array
2. Place your Arial font file in `public/fonts/` and rename it to `223` (no extension needed)
3. The font file should be located at `public/fonts/223`
4. When the application references index `223`, it will automatically load the font file from `public/fonts/223`

Similarly, for other Arial variants:

- Arial Bold uses index `226` → place font file as `public/fonts/226`
- Arial Italic uses index `224` → place font file as `public/fonts/224`
- Arial Bold Italic uses index `225` → place font file as `public/fonts/225`

You can find the index for any font by checking the `__fonts_infos` array in `AllFonts.js`, where each font entry specifies the indices for its regular, bold, italic, and bold-italic variants.

**Note**: Only use open-source fonts or fonts for which you have proper licensing rights. Ensure compliance with font licensing terms before adding any font files.

## 📚 References

- [onlyoffice-x2t-wasm](https://github.com/cryptpad/onlyoffice-x2t-wasm) - WebAssembly-based document converter
- [se-office](https://github.com/Qihoo360/se-office) - Secure document editor
- [web-apps](https://github.com/ONLYOFFICE/web-apps) - OnlyOffice web applications
- [sdkjs](https://github.com/ONLYOFFICE/sdkjs) - OnlyOffice JavaScript SDK
- [onlyoffice-web-local](https://github.com/sweetwisdom/onlyoffice-web-local) - Local web-based OnlyOffice implementation

## 🤝 Contributing

Issues and Pull Requests are welcome to help improve this project!

## 📄 License

See the [LICENSE](LICENSE) file for details.
