import htm from "htm";
import { isSafeHtml } from "./safe-html";
import type { Child, HTMModule, HTMTemplate, Props } from "./types";
import { markDynamic, unmark } from "./utils/dynamic-text";
import { securityWarn } from "./utils/security-warn";

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

// Same rule as the SSR (hString): inside <script>/<style> only static template text and
// SafeHtml survive; dynamic strings (and anything that could carry one) are dropped.
const RAW_TEXT_TAGS = new Set(["script", "style"]);

// Static template text (plain string), numbers and SafeHtml survive. A marked dynamic string is a
// DynamicText object, so it fails this test, as does anything that could carry a string
// (functions, reactives, arrays, nodes).
const keepRawTextChild = (c: unknown): boolean =>
  c == null || c === false || typeof c === "string" || typeof c === "number" || isSafeHtml(c);

// h() as seen by the html template: dynamic strings arrive wrapped in DynamicText
function hTemplate(tag: unknown, props: Props, ...children: Child[]): Node {
  const realTag = unmark(tag);
  const plainProps = props ? (Object.fromEntries(Object.entries(props).map(([k, v]) => [k, unmark(v)])) as Props) : props;
  let kids: unknown[] = children.map(unmark);
  if (typeof realTag === "string" && RAW_TEXT_TAGS.has(realTag.toLowerCase())) {
    const kept = children.filter(keepRawTextChild);
    if (kept.length !== children.length && process.env.NODE_ENV !== "production") {
      securityWarn(
        "A dynamic value inside <script>/<style> was dropped (strings are data, not code). For trusted content use unsafeHtml() (never with user input).",
        "raw-text-child",
      );
    }
    kids = kept;
  }
  return h(realTag, plainProps, ...(kids as Child[]));
}

const boundHtm = (htm as unknown as HTMModule).bind(hTemplate);

export const html: HTMTemplate = ((strings: TemplateStringsArray, ...values: unknown[]) =>
  boundHtm(strings, ...values.map(markDynamic))) as HTMTemplate;
