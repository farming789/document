# 2026-06-28 Agent 面板:ranui signal 响应式 + 修双边框 + 文档反思

承接面板改用 ranui 组件。两件事 + 一个反思。

## 1. 反思:该先读 ranui 的文档,而不是直接啃源码

ranui **本来就有面向 AI 的完整文档**,我一上来直接 grep 源码是走了弯路:

- `CLAUDE.md` —— 明确写「read before building or changing any UI」,指向 `docs/DESIGN.md` 可执行设计规范,并列出 builder / router / i18n / theme / theme token 等能力。
- `README.md` —— 样式系统说明(CSS Token + `::part()` + `sheet` 属性)、按组件导入。
- `docs/`：`DESIGN.md`、`style-override.md`(四种样式覆盖方式)、`style-tokens-parts.md` / `style-tokens-public.md`(自动生成的 token/part 清单)、`architecture.md`、`STYLE_SYSTEM.md`。

**结论:ranui 对 AI 是友好的**(设计/样式/主题文档齐全),问题在我没先读。

**但有一个真实缺口**:没有「每个组件的属性 / 事件」API 参考。`change` 事件的 detail 形状、`r-checkbox.checked` getter 返回字符串、`r-select` 选项用 `r-option` 子元素——这些只能读源码。这是 ranui 可补的一类文档(可由 `observedAttributes` + `dispatchEvent` 自动生成,类似已有的 style-tokens 自动文档)。已向用户提出。

## 2. 修双边框(上一版 ranui 改造的视觉回归)

`styles/base.css` 里这些类原本是给**原生元素**写的 `border/background/padding`。换成 ranui 组件后,组件 shadow DOM 自带边框 → 和 host 的 border 叠成两层。

按 `docs/style-override.md` 的原则(组件自身负责视觉,外部只做布局/用 token/`::part()` 定制),把 host 上多余的视觉样式删掉,**只留布局**:

- `.agent-panel-key-input` / `.agent-panel-ollama-model`(r-input):只留 `width/box-sizing`,去掉 border/padding。
- `.agent-panel-provider` / `.agent-panel-model`(r-select):只留 `width` / `flex+min-width`。
- `.agent-panel-send` / `.agent-panel-clear` / `.agent-panel-quote` / `.agent-panel-load`(r-button):去掉 border/bg/padding,只留必要布局(`align-self`/`flex-shrink`)。
- `.agent-panel-input`(原生 textarea)保留自身样式。

Send 的蓝色强调改用 ranui 自己的 `type="primary"`(`sendBtn.setAttribute('type','primary')`),而不是 host 上手写蓝底。

浏览器验证:host 元素 `border-top-width: 0px`,单层边框来自组件内部,Send 为 primary 蓝色。

## 3. ranui signal 响应式(builder 的价值点)

`builder` 的精华是信号系统(`signal`/`createEffect`,Solid 风格)。用它替掉面板里手写的 i18n 重译:

- `const [lang, setLang] = signal(getLanguage())`;`languagechange` 时 `setLang(getLanguage())`。
- 一个 `createEffect` 读 `lang()` 后(re)设置全部可翻译标签 —— 取代原来的 `applyLabels` 函数 + 手动监听。effect 创建时自动跑一次(初始)+ 语言变化时自动重跑。
- `const [running, setRunning] = signal(false)`;另一个 effect 读 `running()` + `lang()` 设置 Send/Stop 文案与 textarea 禁用 —— 消除了原先 send 按钮文案在 `setRunning` 和 `applyLabels` 两处重复设置的问题。

**评估(回答「builder/router 是不是更好」):**

- **signal:值得用**。把"语言/运行态变了要手动刷 UI"变成声明式,删了一个 `applyLabels` 函数和重复逻辑。
- **ElementBuilder(链式构建)**:比 `createElement` 干净,但全量重写已验证可用的面板收益不抵风险,暂不做。
- **router**:单面板无路由,不适用。
- **对话气泡**:`r-message` 是 toast、`r-card` 是 title+description 卡片,套在密集聊天流上偏重且 per-role 配色映射不上 —— 保持轻量 div 才对(已向用户说明,没硬塞组件)。

## 验证

- tsc / oxlint / prettier:通过;单测:237 通过(panel 无单测,tsc + 浏览器冒烟)
- 浏览器(`?agent=1`):双边框消除、Send primary 蓝、provider 切换→key 框、signal 国际化整面板一致(中文渲染)、无控制台报错
