# 2026-06-28 add_comment 在表格/演示编辑器崩溃修复

## 现象

Excel 里 agent 调 add_comment 报 `Asc.asc_CCommentDataWord is not a constructor`，反复刷错。

## 原因

`add_comment` 工具写死了 Word 专用的评论构造器 `Asc.asc_CCommentDataWord`，而**表格/演示编辑器没有它**（它们用 `Asc.asc_CCommentData`）。

## 修复

- `editor-bridge.ts` `EditorAsc`：`asc_CCommentDataWord` 改可选，新增可选 `asc_CCommentData`。
- `tools.ts` add_comment：`const CommentCtor = Asc.asc_CCommentDataWord ?? Asc.asc_CCommentData;` 选可用的；都没有则抛"本编辑器不支持"。

tsc + 237 单测通过（add_comment 测试 mock 仍命中 Word 构造器）。

## 关于"输出错乱"（另一现象，非本次代码 bug）

助手把工具调用当文本输出 `[{"arguments":...,"name":"add_comment"}]` —— 本地 Hermes 模型时不时不按 `<tool_call>` 结构吐，WebLLM 没解析成结构化 tool_calls 就当文本显示了。属本地小模型格式不稳，代码难稳修。可靠工具调用建议用云端（Claude/OpenAI/Gemini）。

## 提交

lib/agent-plugin（tools/editor-bridge）。pnpm-workspace/lock 仍暂缓。
