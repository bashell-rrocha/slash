import { setProp } from "../rendering/props";
import type { Child, Elementish, Props } from "../types";
import { isReactive } from "../utils/guards";
import { getHydrateContext } from "./context";

/**
 * Pula marcadores de signal (reactive-start/reactive-end) durante hidratação
 */
export function skipReactiveMarkers(): void {
  const hydrateContext = getHydrateContext();
  if (!hydrateContext) return;

  let current = hydrateContext.cursor;

  // Se o cursor atual não é um comentário reactive-start, não faz nada
  if (!current || current.nodeType !== Node.COMMENT_NODE) return;
  const startText = (current as Comment).textContent;
  if (!startText?.startsWith("reactive-start:")) return;

  // Começamos com depth 1 pois já estamos no reactive-start
  let depth = 1;
  current = current.nextSibling;

  while (current) {
    if (current.nodeType === Node.COMMENT_NODE) {
      const text = (current as Comment).textContent;
      if (text?.startsWith("reactive-start:")) {
        depth++;
      } else if (text?.startsWith("reactive-end:")) {
        depth--;
        if (depth === 0) {
          hydrateContext.cursor = current.nextSibling;
          return;
        }
      }
    }
    current = current.nextSibling;
  }
}

/**
 * Hidrata um child durante o processo de hidratação
 */
export function hydrateChild(child: Child): void {
  const hydrateContext = getHydrateContext();
  if (!hydrateContext) return;

  if (child == null || child === false) {
    return;
  }

  if (Array.isArray(child)) {
    for (const c of child) hydrateChild(c);
    return;
  }

  if (isReactive(child)) {
    skipReactiveMarkers();
    return;
  }

  if (child instanceof Node) {
    return;
  }

  if (hydrateContext.cursor?.nodeType === Node.TEXT_NODE) {
    hydrateContext.cursor = hydrateContext.cursor.nextSibling;
  }
}

/**
 * Função h() no modo de hidratação - reutiliza DOM existente
 */
export function hHydrate(tag: unknown, props: Props, ...children: Child[]): Node {
  const hydrateContext = getHydrateContext();
  if (!hydrateContext) throw new Error("[slash] hHydrate called without context");

  if (typeof tag === "function") {
    const out = (tag as (p: Record<string, unknown>) => Node | Child)({
      ...(props || {}),
      children,
    });
    return out instanceof Node ? out : document.createTextNode(String(out));
  }

  const existingNode = hydrateContext.cursor;

  if (!existingNode || existingNode.nodeType !== Node.ELEMENT_NODE) {
    // Fallback: criar novo elemento
    const { h } = require("../hyper");
    const savedCtx = getHydrateContext();
    const { setHydrateContext } = require("./context");
    setHydrateContext(null);
    const el = h(tag, props, ...children);
    setHydrateContext(savedCtx);
    return el;
  }

  const el = existingNode as Element;

  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith("on") && k[2] === k[2]?.toUpperCase()) {
        setProp(el as Elementish, k, v);
      }
    }
  }

  const oldCursor = hydrateContext.cursor;
  hydrateContext.cursor = el.firstChild;

  for (const child of children) {
    hydrateChild(child);
  }

  hydrateContext.cursor = oldCursor?.nextSibling || null;

  return el;
}
