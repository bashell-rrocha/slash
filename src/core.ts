// src/core.ts - Core minimal da biblioteca (hyper + state)

export * from "./components";
export {
  ErrorBoundary,
  safeRender,
  setupGlobalErrorHandler,
  catchAsync,
} from "./error-boundary";
export { destroyNode, h, html, html as tsx, html as jsx, render } from "./hyper";
export { createState } from "./state";
export type { State } from "./state";
export { batch } from "./batch";

// Developer Experience - Warnings & Error Messages (optional)
export {
  setDevMode,
  setWarningsEnabled,
  setErrorsThrow,
  isDevMode,
  isWarningsEnabled,
} from "./dev-warnings";

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
