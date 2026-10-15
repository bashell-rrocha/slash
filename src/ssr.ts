// src/ssr.ts - Server-Side Rendering exports
// biome-ignore-all assist/source/organizeImports: o bloco SEC-B (política de URLs) fica no fim do arquivo

export type { SafeHtml } from "./safe-html";
export { isSafeHtml, unsafeHtml } from "./safe-html";
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

// --- SEC-B: política de URLs (início do bloco; manter no fim do arquivo) ---
export type { SafeUrl } from "./safe-url";
export { isSafeUrl, unsafeUrl } from "./safe-url";
export { BLOCKED_URL, sanitizeUrl } from "./utils/url-policy";
// --- SEC-B (fim do bloco) ---
