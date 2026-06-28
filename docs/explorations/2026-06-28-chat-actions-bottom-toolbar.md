# 2026-06-28 修订/引用移到底部（IM 风格 compose 工具条）

## 目标

把 Review mode / Quote selection（连带 Clear chat）从面板顶部移到**输入框上方**，更符合 agent IM 的设计（compose 区工具条）。

## 改动

- `@ranuts/chat-ui` ChatView 新增 **`actionsEl`**：输入框上方的宿主可填充操作槽（`.cui-actions`，`:empty` 时折叠）。通用能力，不绑业务。
- panel.ts：去掉顶部 `agent-panel-toolbar`，把 reviewLabel/quoteBtn/clearBtn 追加到 `chat.actionsEl`。
- base.css：删除死样式 `.agent-panel-toolbar`。
- chat-ui README/CLAUDE.md 补 `actionsEl` 说明。

## 验证（chrome-devtools）

actionsEl 含 Review/Quote/Clear、位于输入框上方、顶部旧工具栏移除；tsc 零错误 + 237 单测。

## 提交

代码 + 文档；pnpm-workspace/lock 仍暂缓。
