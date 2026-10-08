import { destroyNode } from "../lifecycle/cleanup";
import type { Child } from "../types";
import { appendChildSmart } from "./children";

export type RootView = Child | (() => Child);
export type RenderContainer = Element | string | null | undefined;

const isDev = typeof process !== "undefined" && process?.env?.NODE_ENV !== "production";

function callerInfo(): string | undefined {
  try {
    const stack = new Error().stack?.split("\n").slice(3);
    if (!stack?.length) return undefined;
    const frame = stack.find((line) => /\.(ts|tsx|js)/.test(line));
    if (!frame) return undefined;
    const match = frame.match(/at\s+(?:.*\()?([^():]+):(\d+):\d+\)?/);
    if (!match) return undefined;
    return `${match[1]}:${match[2]}`;
  } catch {
    return undefined;
  }
}

function resolveContainer(target: RenderContainer): Element {
  if (typeof target === "string") {
    const el = document.querySelector(target);
    if (!el) {
      const hint = isDev ? callerInfo() : undefined;
      const extra = hint ? ` (called from ${hint})` : "";
      throw new Error(
        `[slash] render(): selector "${target}" not found — ensure the element exists before calling render()${extra}`,
      );
    }
    return el;
  }
  if (target instanceof Element) return target;
  const hint = isDev ? callerInfo() : undefined;
  const extra = hint ? ` (called from ${hint})` : "";
  throw new Error(
    `[slash] render(): container Element is required (received null/undefined)${extra}`,
  );
}

function hydrateInternal(
  view: RootView,
  container: Element,
  state: Record<string, unknown>,
): Node | Node[] {
  container.innerHTML = "";

  const out = typeof view === "function" ? view() : view;
  const parts = Array.isArray(out) ? out : [out];

  for (const p of parts) {
    appendChildSmart(container, p);
  }

  const nodes = Array.from(container.childNodes) as Node[];
  return nodes.length === 1 ? nodes[0]! : nodes;
}

export function render(view: RootView, container: RenderContainer): Node | Node[] {
  const resolved = resolveContainer(container);

  const stateScript =
    typeof document !== "undefined" ? document.getElementById("__SLASH_STATE__") : null;

  if (resolved.childNodes.length > 0 && stateScript) {
    const state = JSON.parse(stateScript.textContent || "{}");
    stateScript.remove();
    return hydrateInternal(view, resolved, state);
  }

  const prevNodes = Array.from(resolved.childNodes) as Node[];
  for (const node of prevNodes) destroyNode(node);
  resolved.textContent = "";

  const out = typeof view === "function" ? (view as () => Child)() : view;
  const parts = Array.isArray(out) ? out : [out];

  for (const p of parts) appendChildSmart(resolved, p);

  const inserted = Array.from(resolved.childNodes) as Node[];
  return inserted.length === 1 ? inserted[0]! : inserted;
}
