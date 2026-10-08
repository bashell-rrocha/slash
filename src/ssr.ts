// src/ssr.ts - Server-Side Rendering exports

export { htmlString, renderToStream, renderToString, serializeStateForScript } from "./server-render";
export { isSafeHtml, unsafeHtml } from "./safe-html";
export type { SafeHtml } from "./safe-html";
export {
  createLoader,
  deserializeLoaderData,
  hydrateLoaderCache,
  invalidateLoader,
  isServer,
  serializeLoaderData,
} from "./universal-loader";

// Tipos SSR
export type {
  LoaderContext,
  LoaderFunction,
  RenderMode,
  StreamChunk,
  UniversalRenderOptions,
} from "./types";

// --- SEC-B: política de URLs (início do bloco; manter no fim do arquivo) ---
export { isSafeUrl, unsafeUrl } from "./safe-url";
export type { SafeUrl } from "./safe-url";
export { BLOCKED_URL, sanitizeUrl } from "./utils/url-policy";
// --- SEC-B (fim do bloco) ---
