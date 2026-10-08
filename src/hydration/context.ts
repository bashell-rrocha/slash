import type { Reactive } from "../types";

export type HydrateContext = {
  cursor: Node | null;
  root: Element;
  signals: Map<string, Reactive<unknown>>;
};

let hydrateContext: HydrateContext | null = null;

export function setHydrateContext(ctx: HydrateContext | null): void {
  hydrateContext = ctx;
}

export function getHydrateContext(): HydrateContext | null {
  return hydrateContext;
}
