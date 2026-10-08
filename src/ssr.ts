// src/ssr.ts - Server-Side Rendering exports

export { htmlString, renderToStream, renderToString } from "./server-render";
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
