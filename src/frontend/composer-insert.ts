// Вставка расшифровки в поле композера BB в позицию каретки.
// Черновик и живой редактор должны получать один и тот же кусок текста.

export const COMPOSER_EDITOR_SELECTOR =
  '[data-promptbox] .tiptap.ProseMirror, [data-promptbox] textarea, [data-promptbox] [contenteditable="true"]';

const EDITOR_IN_BOX_SELECTOR = '.tiptap.ProseMirror, textarea, [contenteditable="true"]';

let rememberedCaret: number | null = null;
// Editor dono da posição lembrada: no split ela não vale para o composer do outro painel.
let rememberedCaretOwner: HTMLElement | null = null;
// Último composer em que o usuário clicou ou digitou.
let activePromptBox: HTMLElement | null = null;

export function rememberComposerCaret(offset: number | null, owner: HTMLElement | null = null): void {
  if (offset === null || offset < 0) return;
  rememberedCaret = offset;
  rememberedCaretOwner = owner;
}

export function resetRememberedComposerCaret(): void {
  rememberedCaret = null;
  rememberedCaretOwner = null;
}

export function rememberActiveComposer(from: EventTarget | null): void {
  const box = (from as Element | null)?.closest?.("[data-promptbox]");
  if (box) activePromptBox = box as HTMLElement;
}

export function getRememberedComposerCaret(): number | null {
  return rememberedCaret;
}

export function insertIntoDraftText(
  existing: string,
  transcript: string,
  offset: number,
): { text: string; piece: string; offset: number } {
  const insert = transcript.trim();
  const clamped = Math.max(0, Math.min(offset, existing.length));
  if (!insert) {
    return { text: existing, piece: "", offset: clamped };
  }

  const before = existing.slice(0, clamped);
  const after = existing.slice(clamped);
  let piece = insert;
  if (before && !/\s$/.test(before) && !/^\s/.test(piece)) {
    piece = ` ${piece}`;
  }
  if (after && !/^\s/.test(after) && !/\s$/.test(piece)) {
    piece = `${piece} `;
  }

  return { text: before + piece + after, piece, offset: clamped };
}

function isTextField(editor: HTMLElement): editor is HTMLTextAreaElement | HTMLInputElement {
  return editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement;
}

// Com split há um composer por painel. Vale o do foco, depois o do último clique;
// o primeiro do DOM só entra quando nenhum painel foi tocado.
export function findComposerEditor(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const focusedBox = (document.activeElement as Element | null)?.closest?.("[data-promptbox]") as HTMLElement | null;
  const box = focusedBox ?? (activePromptBox?.isConnected ? activePromptBox : null);
  const own = box?.querySelector<HTMLElement>(EDITOR_IN_BOX_SELECTOR);
  return own ?? document.querySelector<HTMLElement>(COMPOSER_EDITOR_SELECTOR);
}

export function getComposerPlainText(editor: HTMLElement): string {
  if (isTextField(editor)) {
    return editor.value;
  }
  const range = document.createRange();
  range.selectNodeContents(editor);
  return range.toString();
}

export function getComposerCaretOffset(editor: HTMLElement): number | null {
  if (isTextField(editor)) {
    if (typeof editor.selectionStart === "number") {
      return editor.selectionStart;
    }
    return null;
  }
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(editor);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

export function rememberComposerCaretFromDocument(): void {
  const editor = findComposerEditor();
  if (!editor) return;
  const offset = getComposerCaretOffset(editor);
  rememberComposerCaret(offset, editor);
}

export function resolveComposerInsertOffset(
  existingLength: number,
  editor: HTMLElement | null = findComposerEditor(),
): number {
  const live = editor ? getComposerCaretOffset(editor) : null;
  if (live !== null) return Math.max(0, Math.min(live, existingLength));
  const rememberedHere = rememberedCaretOwner === null || rememberedCaretOwner === editor;
  if (rememberedCaret !== null && rememberedHere) return Math.max(0, Math.min(rememberedCaret, existingLength));
  return existingLength;
}

export function setComposerCaretOffset(editor: HTMLElement, offset: number): void {
  const clamped = Math.max(0, offset);
  if (isTextField(editor)) {
    editor.focus();
    const pos = Math.min(clamped, editor.value.length);
    editor.setSelectionRange(pos, pos);
    return;
  }

  editor.focus();
  const sel = window.getSelection();
  if (!sel) return;

  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let remaining = clamped;
  let lastText: Text | null = null;
  let node: Node | null = walker.nextNode();
  while (node) {
    lastText = node as Text;
    const len = lastText.length;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(lastText, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
    node = walker.nextNode();
  }

  const range = document.createRange();
  if (lastText) {
    range.setStart(lastText, lastText.length);
    range.collapse(true);
  } else {
    range.selectNodeContents(editor);
    range.collapse(true);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

export function insertTranscriptAtCaret(editor: HTMLElement, transcript: string, offset: number): {
  text: string;
  piece: string;
} {
  const existing = getComposerPlainText(editor);
  const planned = insertIntoDraftText(existing, transcript, offset);
  if (!planned.piece) {
    return { text: existing, piece: "" };
  }

  setComposerCaretOffset(editor, planned.offset);
  try {
    document.execCommand("insertText", false, planned.piece);
  } catch {}

  rememberComposerCaret(planned.offset + planned.piece.length, editor);
  return { text: planned.text, piece: planned.piece };
}
