import { addCleanup, destroyNode } from "../lifecycle/cleanup";
import type { Child, Reactive } from "../types";
import { isReactive } from "../utils/guards";
import { toStr } from "../utils/helpers";

export function appendReactiveChild(parent: Node, sig: Reactive<unknown>): void {
  const start = document.createComment("sig:start");
  const end = document.createComment("sig:end");
  parent.appendChild(start);
  parent.appendChild(end);

  const renderBetween = (value: unknown): void => {
    // Limpa nós atuais entre start e end
    let n = start.nextSibling;
    while (n && n !== end) {
      const next = n.nextSibling;
      destroyNode(n);
      parent.removeChild(n);
      n = next;
    }

    // Insere novo conteúdo antes do marcador 'end'
    const frag = document.createDocumentFragment();
    if (value == null || value === false) {
      // nada a inserir
    } else if (Array.isArray(value)) {
      for (const v of value) appendChildSmart(frag, v as Child);
    } else if (value instanceof Node) {
      appendNodeSafe(frag, value);
    } else {
      frag.appendChild(document.createTextNode(toStr(value)));
    }
    parent.insertBefore(frag, end);
  };

  renderBetween(sig.get());
  const unsub = sig.subscribe(renderBetween);
  addCleanup(start, unsub);
}

export function appendNodeSafe(parent: Node, node: Node): void {
  // Fragment: NÃO precisa clonar, fragments são consumidos no append
  // e seus filhos são transferidos diretamente (preservando event listeners)
  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    parent.appendChild(node);
    return;
  }
  // Node já está em outro parent? Remover do parent anterior antes de mover
  // Isso preserva event listeners (ao contrário de cloneNode)
  if (node.parentNode && node.parentNode !== parent) {
    node.parentNode.removeChild(node);
  }
  parent.appendChild(node);
}

export function appendChildSmart(parent: Node, child: Child): void {
  if (child == null || child === false) return;

  if (isReactive(child)) {
    appendReactiveChild(parent, child);
    return;
  }

  // Funções como children não são mais suportadas - use Reactive<T> direto
  if (typeof child === "function") {
    throw new Error(
      "[slash] Function children are no longer supported. Use state.property (Reactive<T>) instead.",
    );
  }

  if (Array.isArray(child)) {
    for (const c of child) appendChildSmart(parent, c as Child);
    return;
  }

  if (child instanceof Node) {
    appendNodeSafe(parent, child);
    return;
  }

  appendNodeSafe(parent, document.createTextNode(toStr(child)));
}
