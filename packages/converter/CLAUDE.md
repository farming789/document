# @ranuts/converter — AI usage guide

In-browser Office conversion via OnlyOffice **x2t** (WASM): docx / xlsx / pptx /
csv / pdf + media extraction. No server.

## When to use

Converting documents client-side, or reading media/preprocessing before handing a
file to the editor. Not for editing/rendering (that's the OnlyOffice editor).

## Import

```ts
import { X2TConverter, extractDocxMediaUrls, preprocessXlsxLineBreaks, preprocessPptx } from '@ranuts/converter';
```

## Usage

```ts
const converter = new X2TConverter();
await converter.init();                 // loads x2t WASM (idempotent)
const result = await converter.convert(file, 'pdf');
```

## Hard requirements (read these)

- **x2t WASM is NOT bundled here.** The host must load it and expose it on
  `window.Module`; this package wraps that global. If `window.Module` is absent,
  conversion fails.
- Browser-only: uses `window`, `fetch`, `Blob`, and the File System Access API for saving.
- PDF fonts are fetched from `${BASE_PATH}fonts/` (BASE_PATH from `@ranuts/shared`)
  into the WASM FS; without them, PDF text renders blank.
- Save-success toast uses ranui's global `window.message` (optional-chained; safe if absent).

## Gotchas

- `init()` once per session before `convert()`; calling convert before init throws.
- Media merge for PPTX prefers the original ZIP's GIFs over x2t output (preserves animation).
- Depends on `@ranuts/shared` (types/utils/i18n), `ranuts`, `ranui`.

## Note for the v7/v9 monorepo plan

x2t WASM differs per OnlyOffice version. Today this reads a single `window.Module`.
To share one converter across v7 and v9, switch to **injecting** the x2t module
(`new X2TConverter({ x2tModule })`) instead of the global — deferred until needed.
