// src/core.ts - Core minimal da biblioteca (hyper + state)
// biome-ignore-all assist/source/organizeImports: o bloco SEC-B (política de URLs) fica no fim do arquivo

export { batch } from "./batch";
export * from "./components";
// Developer Experience - Warnings & Error Messages (optional)
export {
  isDevMode,
  isWarningsEnabled,
  setDevMode,
  setErrorsThrow,
  setWarningsEnabled,
} from "./dev-warnings";
export {
  catchAsync,
  ErrorBoundary,
  safeRender,
  setupGlobalErrorHandler,
} from "./error-boundary";
export { destroyNode, h, html, html as tsx, html as jsx, render } from "./hyper";
export type { SafeHtml } from "./safe-html";
export { isSafeHtml, unsafeHtml } from "./safe-html";
export type { State } from "./state";
export { createState } from "./state";
// Tipos core
export type {
  Child,
  Elementish,
  ErrorBoundaryProps,
  EventHandler,
  EventOptions,
  EventTuple,
  HTMModule,
  HTMTemplate,
  Key,
  Props,
  Reactive,
  Renderer,
} from "./types";

// --- SEC-B: política de URLs (início do bloco; manter no fim do arquivo) ---
export type { SafeUrl } from "./safe-url";
export { isSafeUrl, unsafeUrl } from "./safe-url";
export { BLOCKED_URL, sanitizeUrl } from "./utils/url-policy";
// --- SEC-B (fim do bloco) ---
