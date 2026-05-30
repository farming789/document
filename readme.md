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

## 🧩 Embedding via iframe

This project supports embedding into other systems via iframe. The recommended architecture is: **the parent system handles authentication, file fetching, and upload; the iframe handles document editing only**. This keeps tokens, cookies, and business APIs inside the parent system — the editor never needs to know about your auth details.

A built-in demo page is included:

```text
http://127.0.0.1:8082/embed-demo.html
```

### 1. Embed the editor

```html
<iframe id=”documentEditor” src=”http://127.0.0.1:8082/?embed=1” style=”width: 100%; height: 720px; border: 0”></iframe>
```

To restrict messages to a specific parent origin, add `embedOrigin`:

```html
<iframe id=”documentEditor” src=”http://127.0.0.1:8082/?embed=1&embedOrigin=https://your-system.example.com”></iframe>
```

### 2. Send commands

Include an `id` on each command so you can match it to the response:

```js
const iframe = document.getElementById('documentEditor');
const editorOrigin = 'http://127.0.0.1:8082';

function sendEditorCommand(type, payload = {}) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  iframe.contentWindow.postMessage({ id, type, payload }, editorOrigin);
  return id;
}
```

Listen for responses:

```js
window.addEventListener('message', (event) => {
  if (event.origin !== editorOrigin) return;

  const { id, type, payload } = event.data || {};
  if (!type || !type.startsWith('document:')) return;

  if (type === 'document:ready') console.log('Editor ready');
  if (type === 'document:opened') console.log('Document opened', id, payload);
  if (type === 'document:saved') console.log('Saved', payload.fileName, payload.file);
  if (type === 'document:error') console.error('Error', payload.message);
});
```

### 3. Open a document

From URL:

```js
sendEditorCommand('document:open-url', {
  url: 'https://example.com/files/demo.xlsx',
  fileName: 'demo.xlsx',
  readonly: false,
});
```

If the URL requires auth headers, pass `fetchOptions` — though it's preferable to have the parent system fetch the file and pass it as a buffer:

```js
sendEditorCommand('document:open-url', {
  url: 'https://example.com/api/files/1',
  fileName: 'demo.xlsx',
  fetchOptions: { headers: { Authorization: `Bearer ${token}` } },
});
```

From a local file picker:

```js
const input = document.createElement('input');
input.type = 'file';
input.accept = '.xlsx,.xls,.csv,.docx,.doc,.pptx,.ppt';
input.onchange = () => {
  sendEditorCommand('document:open-file', { file: input.files[0], readonly: false });
};
input.click();
```

From an authenticated fetch (recommended for protected files):

```js
const response = await fetch('/api/files/1', {
  headers: { Authorization: `Bearer ${token}` },
});
const buffer = await response.arrayBuffer();
sendEditorCommand('document:open-buffer', { fileName: 'demo.xlsx', buffer, readonly: false });
```

### 4. Read-only mode

Set at open time, or toggle afterwards:

```js
sendEditorCommand('document:set-readonly', { readonly: true });
```

In read-only mode editing is disabled and `document:save` returns `document:error`.

### 5. Save and upload

The save command exports the current document and returns a `File` via `document:saved`. Default format is `XLSX`; pass `targetExt` to change it (`DOCX`, `PPTX`, `CSV`).

```js
sendEditorCommand('document:save', { targetExt: 'XLSX' });
```

By default the command waits for the editor to return the edited file — if it times out, `document:error` is returned instead of silently uploading the original. To opt in to returning the original on timeout:

```js
sendEditorCommand('document:save', { targetExt: 'XLSX', returnOriginalOnTimeout: true });
```

Upload the returned file from the parent:

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

> **Note:** Do not rely on `file.size` alone to detect changes — `.xlsx` files are zip archives and a minor edit may produce the same byte count. The built-in `/embed-demo.html` prints a `sha256` hash in the save log for debugging.

### 6. Message reference

| Direction       | Type                        | Description                              |
| --------------- | --------------------------- | ---------------------------------------- |
| parent → iframe | `document:open-url`         | Open document from URL                   |
| parent → iframe | `document:open-file`        | Open document from `File` / `Blob`       |
| parent → iframe | `document:open-buffer`      | Open document from `ArrayBuffer` / `Uint8Array` |
| parent → iframe | `document:set-readonly`     | Set read-only or editable                |
| parent → iframe | `document:save`             | Save and return `File`                   |
| parent → iframe | `document:get-state`        | Query current state                      |
| iframe → parent | `document:ready`            | Editor initialised                       |
| iframe → parent | `document:opened`           | Document opened                          |
| iframe → parent | `document:readonly-changed` | Read-only state changed                  |
| iframe → parent | `document:saved`            | Save complete, file returned             |
| iframe → parent | `document:state`            | Current state response                   |
| iframe → parent | `document:error`            | Operation failed                         |

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
pnpm install
pnpm run dev
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
