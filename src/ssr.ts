// src/ssr.ts - Server-Side Rendering exports

export type { SafeHtml } from "./safe-html";
export { isSafeHtml, unsafeHtml } from "./safe-html";
export type { SafeUrl } from "./safe-url";
// --- SEC-B: política de URLs (início do bloco; manter no fim do arquivo) ---
export { isSafeUrl, unsafeUrl } from "./safe-url";
export {
  htmlString,
  renderToStream,
  renderToString,
  serializeStateForScript,
} from "./server-render";
// Tipos SSR
export type {
  LoaderContext,
  LoaderFunction,
  RenderMode,
  StreamChunk,
  UniversalRenderOptions,
} from "./types";
export {
  createLoader,
  deserializeLoaderData,
  hydrateLoaderCache,
  invalidateLoader,
  isServer,
  serializeLoaderData,
} from "./universal-loader";
export { BLOCKED_URL, sanitizeUrl } from "./utils/url-policy";
// --- SEC-B (fim do bloco) ---
