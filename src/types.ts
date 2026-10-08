// src/types.ts
export type Key = string | number | symbol;

export type Elementish = HTMLElement | SVGElement;

// Reactive (duck type para objetos reativos - renomeado de SignalLike)
export type Reactive<T = unknown> = {
  get(): T;
  subscribe(fn: (v: T) => void): () => void;
};

export type Child =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | Reactive<unknown>
  | Child[]
  | readonly Child[];

export type Props = Record<string, unknown> | null;

export type EventOptions = boolean | AddEventListenerOptions;
export type EventHandler = EventListenerOrEventListenerObject;
export type EventTuple = readonly [EventHandler, EventOptions?];

export type Renderer<T> = (item: T, index: number) => Child;

// HTM
export type HTMTemplate = (strings: TemplateStringsArray, ...values: unknown[]) => Child;
export type HTMModule = {
  bind(h: (tag: unknown, props: Props, ...children: Child[]) => Node): HTMTemplate;
};

// Abstração para renderer de listas (injeção)
export type ListRenderer = <T>(
  list: Reactive<T[]>,
  keyOf: (item: T) => Key,
  render: (item: T) => Child,
) => Node;

// Universal Rendering Types
export type RenderMode = "client" | "server" | "hydrate";

export type UniversalRenderOptions = {
  mode?: RenderMode;
  state?: Record<string, unknown>;
};

export type StreamChunk = string;

export type LoaderContext = {
  params: Record<string, string>;
  request?: Request;
  isServer: boolean;
};

export type LoaderFunction<T = unknown> = (ctx: LoaderContext) => T | Promise<T>;

export type ErrorBoundaryProps = {
  fallback: (error: Error) => Child;
  onError?: (error: Error, errorInfo: { componentStack?: string }) => void;
  children: Child;
};

export type Component<P = any> = (props: P) => Child;
