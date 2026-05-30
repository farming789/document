# Font Management

## Why fonts are not included

This project does not ship proprietary font files such as Arial, Times New Roman, Microsoft YaHei, or SimSun. These fonts are subject to copyright restrictions. Font name references remain in the configuration for document compatibility, but the actual files have been removed to comply with open-source licensing.

## Adding fonts

Font files go in `public/fonts/` and must be named by their numeric index in the `__fonts_files` array in `public/sdkjs/common/AllFonts.js`.

**Example: Adding Arial**

1. Open `AllFonts.js` and find the index for Arial regular — it is `223`
2. Place your font file at `public/fonts/223` (no extension)
3. The app loads it automatically when index `223` is requested

Other Arial variants:

| Variant     | Index | Path               |
| ----------- | ----- | ------------------ |
| Regular     | 223   | `public/fonts/223` |
| Italic      | 224   | `public/fonts/224` |
| Bold        | 226   | `public/fonts/226` |
| Bold Italic | 225   | `public/fonts/225` |

To find the index for any font, look up its entry in the `__fonts_infos` array in `AllFonts.js`.

> Only use open-source fonts or fonts you have a valid license for.
