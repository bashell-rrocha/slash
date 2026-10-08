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
