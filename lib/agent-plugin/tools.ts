/**
 * Agent tool definitions. Each tool wraps a verified editor capability
 * (see editor-bridge.ts) behind a typed `execute` + JSON Schema.
 *
 * All over editor methods verified live against the v7.5 SDK (Word/Excel/PPT):
 * insert_text, get_selection, replace_selection, set_review_mode,
 * get_document_text, add_comment, plus spreadsheet-only set_cell / get_cell.
 */
import { escapeHtml } from 'ranuts/utils';
import { requireEditorApi, requireEditorContext } from './editor-bridge';
import type { AgentTool } from '@ranuts/agent-core/types';

/**
 * Convert plain text into the minimal HTML `pluginMethod_PasteHtml` expects.
 * Escapes HTML-significant characters (via ranuts `escapeHtml`) and maps newlines
 * to `<br />` so the inserted text keeps its line breaks without injecting markup.
 */
export function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\r\n|\r|\n/g, '<br />');
}

export interface InsertTextParams {
  /** The plain text to insert at the cursor. */
  text: string;
}

export const insertTextTool: AgentTool<InsertTextParams, { inserted: true; length: number }> = {
  name: 'insert_text',
  description:
    'Insert plain text at the current cursor position in the document. ' +
    'Newlines are preserved as line breaks. Replaces the current selection if any text is selected.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The plain text to insert at the cursor.' },
    },
    required: ['text'],
    additionalProperties: false,
  },
  readOnlyHint: false,
  execute: async ({ text }) => {
    if (typeof text !== 'string') {
      throw new TypeError('insert_text requires a string "text" parameter');
    }
    const api = requireEditorApi();
    api.pluginMethod_PasteHtml(textToHtml(text));
    return { inserted: true, length: text.length };
  },
};

export const getSelectionTool: AgentTool<Record<string, never>, { type: string; text: string }> = {
  name: 'get_selection',
  description:
    'Read the current selection in the document. Returns the selection type ' +
    '("none" when nothing is selected) and the selected plain text.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  readOnlyHint: true,
  execute: async () => {
    const api = requireEditorApi();
    const type = api.pluginMethod_GetSelectionType();
    // The SDK returns CRLF-separated text; normalise to \n for the model.
    const text = api.pluginMethod_GetSelectedText().replace(/\r\n/g, '\n');
    return { type, text };
  },
};

export interface ReplaceSelectionParams {
  /** The replacement text. Newlines are sent as separate lines to the editor. */
  text: string;
}

export const replaceSelectionTool: AgentTool<ReplaceSelectionParams, { replaced: true; length: number }> = {
  name: 'replace_selection',
  description:
    'Replace the currently selected text with new text. Does nothing useful if ' +
    'no text is selected — check get_selection first. In review mode the change ' +
    'is recorded as a tracked revision.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The replacement text.' },
    },
    required: ['text'],
    additionalProperties: false,
  },
  readOnlyHint: false,
  execute: async ({ text }) => {
    if (typeof text !== 'string') {
      throw new TypeError('replace_selection requires a string "text" parameter');
    }
    const api = requireEditorApi();
    api.pluginMethod_ReplaceTextSmart(text.split(/\r\n|\r|\n/));
    return { replaced: true, length: text.length };
  },
};

export interface SetReviewModeParams {
  /** True to turn track-changes on, false to turn it off. */
  enabled: boolean;
}

export const setReviewModeTool: AgentTool<SetReviewModeParams, { enabled: boolean }> = {
  name: 'set_review_mode',
  description:
    "Word documents only. Turn the document's track-changes (review) mode on or " +
    'off. When on, every edit is recorded as a revision the user can accept or ' +
    'reject. Not available in spreadsheets or presentations.',
  inputSchema: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', description: 'True to enable review mode, false to disable.' },
    },
    required: ['enabled'],
    additionalProperties: false,
  },
  readOnlyHint: false,
  execute: async ({ enabled }) => {
    if (typeof enabled !== 'boolean') {
      throw new TypeError('set_review_mode requires a boolean "enabled" parameter');
    }
    const api = requireEditorApi();
    // Track-changes is a Word-only API; the spreadsheet/presentation editors have
    // no asc_SetTrackRevisions, so guard instead of throwing "not a function".
    if (typeof api.asc_SetTrackRevisions !== 'function' || typeof api.asc_IsTrackRevisions !== 'function') {
      throw new Error('set_review_mode is only available in the Word editor');
    }
    api.asc_SetTrackRevisions(enabled);
    return { enabled: api.asc_IsTrackRevisions() };
  },
};

export interface GetDocumentTextParams {
  /** Maximum characters to return (default 8000). Long documents are truncated. */
  maxChars?: number;
}

const DEFAULT_MAX_CHARS = 8000;

export const getDocumentTextTool: AgentTool<GetDocumentTextParams, { text: string; truncated: boolean }> = {
  name: 'get_document_text',
  description:
    'Read the full plain text of the document. Long documents are truncated ' +
    '(default 8000 characters). Side effect: this clears the current selection ' +
    'and moves the cursor — call it before editing, not mid-edit.',
  inputSchema: {
    type: 'object',
    properties: {
      maxChars: { type: 'number', description: 'Maximum characters to return (default 8000).' },
    },
    additionalProperties: false,
  },
  readOnlyHint: true,
  execute: async ({ maxChars = DEFAULT_MAX_CHARS } = {}) => {
    const api = requireEditorApi();
    // No non-destructive full-text read exists on the offline SDK, so select
    // all → read → clear. GetSelectedText returns CRLF; normalise to \n.
    api.asc_EditSelectAll();
    const full = api.pluginMethod_GetSelectedText().replace(/\r\n/g, '\n');
    // asc_RemoveSelection exists in Word/Slide but not the spreadsheet editor.
    api.asc_RemoveSelection?.();
    const truncated = full.length > maxChars;
    return { text: truncated ? full.slice(0, maxChars) : full, truncated };
  },
};

export interface AddCommentParams {
  /** The comment text. */
  text: string;
  /** Comment author name (default "Agent"). */
  author?: string;
}

export const addCommentTool: AgentTool<AddCommentParams, { added: true }> = {
  name: 'add_comment',
  description:
    'Add a comment anchored to the current selection. Select the text to ' +
    'annotate first (see get_selection). Prefer this over editing when you want ' +
    'to suggest a change without altering the document text.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The comment text.' },
      author: { type: 'string', description: 'Comment author name (default "Agent").' },
    },
    required: ['text'],
    additionalProperties: false,
  },
  readOnlyHint: false,
  execute: async ({ text, author = 'Agent' }) => {
    if (typeof text !== 'string') {
      throw new TypeError('add_comment requires a string "text" parameter');
    }
    const { api, Asc } = requireEditorContext();
    // Word uses asc_CCommentDataWord; the spreadsheet/presentation editors use
    // asc_CCommentData. Pick whichever this editor exposes.
    const CommentCtor = Asc.asc_CCommentDataWord ?? Asc.asc_CCommentData;
    if (typeof CommentCtor !== 'function') {
      throw new Error('add_comment is not supported in this editor');
    }
    const data = new CommentCtor();
    data.asc_putText(text);
    data.asc_putUserName(author);
    api.asc_addComment(data);
    return { added: true };
  },
};

export interface SetCellParams {
  /** Cell address, e.g. "A1" or "B2". */
  cell: string;
  /** Value to write. */
  value: string;
}

export const setCellTool: AgentTool<SetCellParams, { cell: string; value: string }> = {
  name: 'set_cell',
  description:
    'Spreadsheet (Excel) only. Write a value to a cell by address (e.g. "B2"). ' +
    'Moves the selection to that cell and sets its value. Use this instead of ' +
    'insert_text when you need to target a specific cell.',
  inputSchema: {
    type: 'object',
    properties: {
      cell: { type: 'string', description: 'Cell address, e.g. "A1".' },
      value: { type: 'string', description: 'The value to write.' },
    },
    required: ['cell', 'value'],
    additionalProperties: false,
  },
  readOnlyHint: false,
  execute: async ({ cell, value }) => {
    if (typeof cell !== 'string' || typeof value !== 'string') {
      throw new TypeError('set_cell requires string "cell" and "value" parameters');
    }
    const api = requireEditorApi();
    if (typeof api.asc_findCell !== 'function' || typeof api.pluginMethod_PasteText !== 'function') {
      throw new Error('set_cell is only available in the spreadsheet (Excel) editor');
    }
    api.asc_findCell(cell);
    api.pluginMethod_PasteText(value);
    return { cell, value };
  },
};

export interface GetCellParams {
  /** Cell address, e.g. "A1". */
  cell: string;
}

export const getCellTool: AgentTool<GetCellParams, { cell: string; text: string }> = {
  name: 'get_cell',
  description: 'Spreadsheet (Excel) only. Read the text of a cell by address (e.g. "B2").',
  inputSchema: {
    type: 'object',
    properties: {
      cell: { type: 'string', description: 'Cell address, e.g. "A1".' },
    },
    required: ['cell'],
    additionalProperties: false,
  },
  readOnlyHint: true,
  execute: async ({ cell }) => {
    if (typeof cell !== 'string') {
      throw new TypeError('get_cell requires a string "cell" parameter');
    }
    const api = requireEditorApi();
    if (typeof api.asc_findCell !== 'function' || typeof api.asc_getCellInfo !== 'function') {
      throw new Error('get_cell is only available in the spreadsheet (Excel) editor');
    }
    api.asc_findCell(cell);
    const info = api.asc_getCellInfo();
    return { cell, text: info?.asc_getText() ?? '' };
  },
};

/** All registered agent tools, keyed by name for lookup by the runtime. */
export const agentTools: Record<string, AgentTool> = {
  [insertTextTool.name]: insertTextTool as unknown as AgentTool,
  [getSelectionTool.name]: getSelectionTool as unknown as AgentTool,
  [replaceSelectionTool.name]: replaceSelectionTool as unknown as AgentTool,
  [setReviewModeTool.name]: setReviewModeTool as unknown as AgentTool,
  [getDocumentTextTool.name]: getDocumentTextTool as unknown as AgentTool,
  [addCommentTool.name]: addCommentTool as unknown as AgentTool,
  [setCellTool.name]: setCellTool as unknown as AgentTool,
  [getCellTool.name]: getCellTool as unknown as AgentTool,
};
