import { addCleanup } from "../lifecycle/cleanup";
import type { Reactive } from "../types";
import { processClassValue } from "../utils/helpers";

/**
 * Hidrata atributos reativos (data-reactive-*) de um elemento
 */
export function hydrateReactiveAttributes(
  element: Element,
  reactives: Map<string, Reactive<unknown>>,
): void {
  const attrs = Array.from(element.attributes);

  for (const attr of attrs) {
    if (!attr.name.startsWith("data-reactive-")) continue;

    const prop = attr.name.replace("data-reactive-", "");
    const reactiveId = attr.value;
    const reactive = reactives.get(reactiveId);

    if (!reactive) continue;

    const unsub = reactive.subscribe((value) => {
      if (prop === "value") {
        (element as HTMLInputElement).value = String(value ?? "");
      } else if (prop === "checked") {
        (element as HTMLInputElement).checked = Boolean(value);
      } else if (prop === "class") {
        element.className = processClassValue(value);
      } else {
        element.setAttribute(prop, String(value ?? ""));
      }
    });

    addCleanup(element, unsub);
    element.removeAttribute(attr.name);
  }
}

/**
 * Hidrata nós de texto reativos (marcados com comentários reactive-start/reactive-end)
 */
export function hydrateReactiveNodes(container: Node, reactives: Map<string, Reactive<unknown>>): void {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);

  const reactiveNodes: Array<{
    start: Comment;
    end: Comment;
    id: string;
  }> = [];

  let node: Comment | null;
  while ((node = walker.nextNode() as Comment | null)) {
    const match = node.textContent?.match(/^reactive-start:(.+)$/);
    if (match) {
      const id = match[1];
      let current: Node | null = node.nextSibling;

      while (current) {
        if (
          current.nodeType === Node.COMMENT_NODE &&
          (current as Comment).textContent === `reactive-end:${id}`
        ) {
          reactiveNodes.push({ start: node, end: current as Comment, id });
          break;
        }
        current = current.nextSibling;
      }
    }
  }

  for (const { start, end, id } of reactiveNodes) {
    const reactive = reactives.get(id);
    if (!reactive) continue;

    const unsub = reactive.subscribe((value) => {
      let current = start.nextSibling;
      while (current && current !== end) {
        const next = current.nextSibling;
        current.parentNode?.removeChild(current);
        current = next;
      }

      const parent = start.parentNode;
      if (!parent) return;

      if (value == null || value === false) {
        // Nada
      } else if (Array.isArray(value)) {
        const frag = document.createDocumentFragment();
        for (const item of value) {
          if (item instanceof Node) {
            frag.appendChild(item.cloneNode(true));
          } else {
            frag.appendChild(document.createTextNode(String(item ?? "")));
          }
        }
        parent.insertBefore(frag, end);
      } else if (value instanceof Node) {
        parent.insertBefore(value.cloneNode(true), end);
      } else {
        parent.insertBefore(document.createTextNode(String(value)), end);
      }
    });

    addCleanup(start, unsub);
  }
}

/**
 * Percorre a árvore de nós e hidrata todos os atributos reativos
 */
export function walkAndHydrateReactiveAttributes(
  node: Node,
  reactives: Map<string, Reactive<unknown>>,
): void {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    hydrateReactiveAttributes(element, reactives);

    for (const child of Array.from(element.childNodes)) {
      walkAndHydrateReactiveAttributes(child, reactives);
    }
  }
}
