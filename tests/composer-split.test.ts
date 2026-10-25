// Regressão: com dois painéis em split há dois composers ([data-promptbox]) na página.
// A transcrição tem que cair no composer do painel em uso, nunca no primeiro do DOM.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  findComposerEditor,
  rememberActiveComposer,
  rememberComposerCaret,
  resetRememberedComposerCaret,
  resolveComposerInsertOffset,
} from "../src/frontend/composer-insert.ts";

class El {
  isConnected = true;
  parent: El | null = null;
  kids: El[] = [];
  attrs: Record<string, string>;
  constructor(attrs: Record<string, string> = {}) {
    this.attrs = attrs;
  }
  add(child: El): El {
    child.parent = this;
    this.kids.push(child);
    return child;
  }
  closest(selector: string): El | null {
    const attr = selector.slice(1, -1);
    for (let cur: El | null = this; cur; cur = cur.parent) if (attr in cur.attrs) return cur;
    return null;
  }
  // O mock só tem um tipo de editor: o primeiro descendente marcado como editor.
  querySelector(): El | null {
    for (const kid of this.kids) {
      if (kid.attrs.role === "editor") return kid;
      const deep = kid.querySelector();
      if (deep) return deep;
    }
    return null;
  }
}

function pane() {
  const box = new El({ "data-promptbox": "" });
  const editor = box.add(new El({ role: "editor" }));
  const mic = box.add(new El({ role: "mic" }));
  return { box, editor, mic };
}

let a: ReturnType<typeof pane>;
let b: ReturnType<typeof pane>;
let activeElement: El | null;

beforeEach(() => {
  a = pane();
  b = pane();
  activeElement = null;
  const g = globalThis as Record<string, unknown>;
  g.HTMLTextAreaElement = class {};
  g.HTMLInputElement = class {};
  g.window = { getSelection: () => null };
  g.document = {
    get activeElement() {
      return activeElement;
    },
    // document.querySelector devolve o primeiro editor do DOM, como o seletor real.
    querySelector: () => a.editor,
  };
  resetRememberedComposerCaret();
});

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  for (const key of ["HTMLTextAreaElement", "HTMLInputElement", "window", "document"]) delete g[key];
});

test("split: com o foco no painel B, o editor encontrado é o do painel B (bug: sempre o primeiro do DOM)", () => {
  activeElement = b.editor;
  assert.equal(findComposerEditor() as unknown, b.editor);
});

test("split: o botão de microfone do painel B também aponta para o painel B", () => {
  activeElement = b.mic;
  assert.equal(findComposerEditor() as unknown, b.editor);
});

test("split: sem foco, vale o último painel em que o usuário clicou", () => {
  rememberActiveComposer(b.mic as unknown as EventTarget);
  assert.equal(findComposerEditor() as unknown, b.editor);
});

test("split: painel clicado que saiu da tela cai de volta no primeiro composer", () => {
  rememberActiveComposer(b.mic as unknown as EventTarget);
  b.box.isConnected = false;
  assert.equal(findComposerEditor() as unknown, a.editor);
});

test("clique fora de qualquer composer não troca o painel ativo", () => {
  rememberActiveComposer(b.mic as unknown as EventTarget);
  rememberActiveComposer(new El() as unknown as EventTarget);
  assert.equal(findComposerEditor() as unknown, b.editor);
});

test("split: a posição do cursor lembrada no painel A não vale para o painel B", () => {
  rememberComposerCaret(5, a.editor as unknown as HTMLElement);
  // painel B sem cursor vivo: insere no fim do texto de B, não na posição 5 de A
  assert.equal(resolveComposerInsertOffset(12, b.editor as unknown as HTMLElement), 12);
  // no painel A a posição lembrada continua valendo
  assert.equal(resolveComposerInsertOffset(12, a.editor as unknown as HTMLElement), 5);
});
