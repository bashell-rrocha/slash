import htm from "htm";
import type { Child, HTMModule, HTMTemplate, Props } from "./types";

export type { HydrateContext } from "./hydration/context";
export { getHydrateContext, setHydrateContext } from "./hydration/context";
// Re-exports de módulos extraídos
export { destroyNode } from "./lifecycle/cleanup";
export type { RenderContainer, RootView } from "./rendering/render";
export { render } from "./rendering/render";

import { getHydrateContext } from "./hydration/context";
import { hHydrate } from "./hydration/walker";
// Imports internos
import { h as hElement } from "./rendering/element";

/* -------------------------------------------------------------
 * h() + html (HTM)
 * ----------------------------------------------------------- */

export function h(tag: unknown, props: Props, ...children: Child[]): Node {
  // MODO HYDRATE: Reutilizar DOM existente
  if (getHydrateContext()) {
    return hHydrate(tag, props, ...children);
  }

  // MODO NORMAL: Usar elemento factory extraído
  return hElement(tag, props, ...children);
}

export const html: HTMTemplate = (htm as unknown as HTMModule).bind(h);
