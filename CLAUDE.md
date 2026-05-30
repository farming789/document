# CLAUDE.md — document 项目指南

## 项目概述

基于 OnlyOffice 的本地 Web 文档编辑器，所有处理在浏览器端完成，无需服务器，保护用户隐私。支持 docx、xlsx、pptx、csv 等格式。

- **线上地址**：https://ranuts.github.io/document/
- **GitHub**：https://github.com/ranuts/document
- **技术栈**：TypeScript + Vite + Tailwind CSS + OnlyOffice Web Apps

---

## 开发命令

```bash
pnpm install --frozen-lockfile   # 安装依赖
pnpm run dev                     # 启动开发服务器（含热更新）
pnpm run build                   # 生产构建（执行 bin/build.sh）
pnpm run build:single            # 打包为单个 HTML 文件
pnpm run lint:ts                 # oxlint + tsc --noEmit（CI 必跑）
pnpm run format:check            # prettier 格式检查（CI 必跑）
pnpm run test                    # 单元测试（Vitest）
pnpm run test:coverage           # 带覆盖率的单元测试
pnpm run test:e2e                # E2E 测试（Playwright，需先 build）
pnpm run lint                    # lint:ts + lint:docker
```

---

## 目录结构

```
lib/                  # 核心业务逻辑（纯 TypeScript）
  converter.ts          # 加载 OnlyOffice API / x2t 转换器
  document.ts           # 文件打开、新建、URL 加载
  document-converter.ts # 格式转换（docx/xlsx/pptx/csv 互转）
  document-types.ts     # 共享类型定义
  document-utils.ts     # 纯工具函数（类型判断、MIME、路径）
  embed-api.ts          # iframe 嵌入 API（postMessage 协议）
  events.ts             # MessageCodec 事件处理（桌面端集成）
  file-types.ts         # OnlyOffice 文件类型常量映射
  i18n.ts               # 国际化（中/英/日/韩/德/法/西/葡/俄）
  loading.ts            # 加载状态 UI
  onlyoffice-editor.ts  # 编辑器实例生命周期、保存、只读模式
  ui.ts                 # 控制面板、菜单、FAB 等 UI 组件
  empty_bin.ts          # 新建文档时使用的空文档二进制数据
store/
  index.ts              # 全局状态（当前文档对象），基于 ranuts/utils createSignal
types/
  editor.d.ts           # OnlyOffice DocEditor 类型声明
  assets.d.ts           # CSS 模块类型声明（declare module '*.css'）
styles/
  base.css              # 全局样式（含 embed-mode 布局）
index.ts              # 应用入口（初始化事件、UI、PWA）
index.html            # HTML 入口
```

---

## 核心模块说明

### embed-api.ts — iframe 嵌入 API

允许父页面通过 `postMessage` 控制编辑器。触发条件：
- URL 含 `?embed=`、`?embed=1`、`?embed=true`、`?embedded=1` 等参数
- 或页面被嵌入 iframe（`window.parent !== window`）

支持的消息类型：

| 消息类型 | 说明 |
|---|---|
| `document:open` / `document:open-url` / `document:open-file` / `document:open-buffer` | 打开文档（支持 url / File / Blob / ArrayBuffer / Uint8Array） |
| `document:set-readonly` | 切换只读模式 |
| `document:save` | 触发保存，父页面收到带 File 的 `document:saved` 响应 |
| `document:get-state` | 查询当前状态（readonly、hasDocument） |

使用 `?embedOrigin=https://example.com` 可限制消息来源。

### onlyoffice-editor.ts — 编辑器生命周期

- `createEditorInstance(config)` — 创建/重建编辑器，内部有操作队列防并发
- `setReadonlyMode(bool)` / `getReadonlyMode()` — 只读模式
- `requestSaveDocument(targetExt, options)` — 触发编辑器保存并返回 File，60s 超时
- `setConverterCallbacks(...)` — 注入转换器（解耦循环依赖）

### store/index.ts — 全局状态

```ts
const [getDocmentObj, setDocmentObj] = createSignal<{
  fileName: string;
  file?: File;
  url?: string | URL;
}>({ fileName: '' });
```

---

## 测试体系

### 单元测试（Vitest + jsdom）

配置文件：`vitest.config.ts`

```
test/unit/
  vitest-smoke.test.ts        # 基础冒烟
  document-utils.test.ts      # lib/document-utils.ts
  i18n.test.ts                # lib/i18n.ts
  embed-api.test.ts           # lib/embed-api.ts（initEmbedApi、消息路由、来源过滤）
  onlyoffice-editor.test.ts   # lib/onlyoffice-editor.ts（只读模式、requestSaveDocument）
test/setup/vitest.ts          # 全局 mock：matchMedia、URL.createObjectURL、localStorage
```

**当前覆盖率（coverage include 范围内）：**

| 文件 | 语句 | 分支 | 函数 |
|---|---|---|---|
| document-utils.ts | 89% | 87% | 100% |
| embed-api.ts | 75% | 56% | 85% |
| i18n.ts | 92% | 65% | 93% |
| onlyoffice-editor.ts | 22% | 16% | 31% |

覆盖率阈值（全局）：语句 35%、分支 25%、函数 35%、行 35%。

**注意事项：**
- `embed-api.ts` 有模块级 `initialized` 单例，测试需用 `vi.resetModules()` + 动态 `import()` 获取新实例
- 旧模块实例的 `window.message` 监听器在 `resetModules` 后仍残留，**不要用 `toHaveBeenCalledTimes` 断言次数**，改用 `toHaveBeenCalledWith` 匹配消息内容或用唯一 ID 定向检索
- `requestSaveDocument` 有内部超时状态，测试需配合 `vi.useFakeTimers()` + `vi.runAllTimers()` 清理

### E2E 测试（Playwright）

配置文件：`playwright.config.ts`，使用 Chromium，baseURL `http://127.0.0.1:4173`。

```
test/e2e/
  app-smoke.spec.ts   # 应用加载、PWA manifest 冒烟测试
```

E2E 在 CI 中依赖 `lint` job 成功后才运行（`needs: lint`）。本地运行前需先 `pnpm run build`。

---

## CI 流程（.github/workflows/ci.yml）

两个 job，触发条件：push/PR 到 main/master。

**lint job（串行步骤）：**
1. `pnpm/action-setup@v6 version: latest` — 不锁定 pnpm 版本
2. `actions/setup-node@v6 node-version: lts/*` — 不锁定 Node 版本
3. `pnpm install --frozen-lockfile`
4. `pnpm run format:check`
5. `pnpm run lint:ts`
6. `pnpm run test:coverage`
7. `docker compose config --quiet`（验证 Docker Compose 文件）
8. `hadolint/hadolint-action@v3.3.0`（Dockerfile 检查）

**e2e job（需 lint 通过）：**
1. 同上安装步骤
2. `playwright install --with-deps chromium`
3. `pnpm run test:e2e`
4. 失败时上传 `playwright-report/` artifact

---

## 代码规范

- **Lint**：oxlint（规则见 `.oxlintrc.json`）+ TypeScript 6 严格模式
- **格式化**：prettier（配置见 `.prettierrc.json`）
- **TypeScript**：`strict: true`，`noImplicitAny: true`，目标 ESNext，模块解析 bundler
- `baseUrl` 已移除（TypeScript 6 废弃），路径别名使用 `paths` + `@/*` 前缀
- CSS 副作用导入需在 `types/assets.d.ts` 中有 `declare module '*.css' {}`

---

## 重要约定

1. **不锁定工具版本**：CI 中 pnpm 用 `latest`，Node 用 `lts/*`，保持自动跟随最新
2. **循环依赖处理**：`onlyoffice-editor.ts` 与 `converter.ts` 之间通过回调注入（`setConverterCallbacks`）解耦；`ui.ts` 与 `document.ts` 之间通过 `setUICallbacks` 解耦
3. **编辑器操作队列**：`createEditorInstance` 内部有 `editorOperationQueue`，防止并发创建/销毁编辑器
4. **.claude/ 目录**：已加入 `.gitignore`，不提交本地 Claude Code 配置

---

## 测试覆盖说明

### 当前覆盖率（coverage include 范围内）

| 文件 | 语句 | 分支 | 函数 | 备注 |
|---|---|---|---|---|
| `embed-api.ts` | 97% | 91% | 100% | 接近完整覆盖 |
| `document-utils.ts` | 89% | 87% | 100% | 接近完整覆盖 |
| `i18n.ts` | 92% | 65% | 93% | 未覆盖部分语言的特定翻译键 |
| `onlyoffice-editor.ts` | ~28% | ~25% | ~41% | 见下方说明 |

### 为什么 onlyoffice-editor.ts 覆盖率低

这是预期行为，**不需要强行提升**。该文件 542 行中约 400 行是 OnlyOffice 编辑器的事件回调，必须有真实编辑器运行才能触发：

| 函数 | 无法单测的原因 |
|---|---|
| `createEditorInstance` (~120 行) | 依赖 `window.DocsAPI`，该对象由外部脚本动态注入，jsdom 不执行外部脚本 |
| `handleSaveDocument` (~55 行) | 由编辑器 `onSave` 事件触发，需真实编辑器实例 |
| `handleWriteFile` (~75 行) | 由编辑器 `writeFile` 事件触发（粘贴图片时） |
| `handleDownloadAs` (~35 行) | 由编辑器 `onDownloadAs` 事件触发 |
| `queueEditorOperation` (~40 行) | `createEditorInstance` 内部队列，连带未覆盖 |
| `loadEditorApi` (~20 行) | 动态创建 `<script>` 标签加载外部 JS，jsdom 不执行 |

这些函数理论上可以通过 E2E 覆盖，但需要 OnlyOffice WebAssembly 完整加载并打开真实文档（耗时 10–30 秒，稳定性差）。强行用单测 mock 覆盖反而会让测试代码比被测代码更复杂，没有实际价值。

**已覆盖的可测部分**（纯函数 + 状态管理）：
- `getSavedFileMimeType` / `getNormalizedFile` / `toUint8Array` — 纯计算逻辑
- `setReadonlyMode` / `getReadonlyMode` — 状态读写
- `requestSaveDocument` — 所有拒绝路径（无编辑器、只读、并发、超时、不支持 downloadAs）
