// src/server-render.ts
import htm from "htm";
import { isDevMode, isWarningsEnabled } from "./dev-warnings";
import { isSafeHtml, SafeHtml } from "./safe-html";
import { markDynamic, unmark } from "./utils/dynamic-text";
import type { Child, Props, Reactive } from "./types";
import { isForbiddenStyleKey, isSafeCssDeclaration, sanitizeStyleString, styleKeyToCssName, styleObjectTooLong } from "./utils/css-policy";
import { isEventHandler, isEventTuple, isReactive } from "./utils/guards";
import { escapeJsonForScript } from "./utils/script-json";
import { isSafeUrl } from "./safe-url";
import { isSsrElement } from "./ssr-element";
import { evaluateMetaRefresh, isRefreshHttpEquiv, isUrlAttribute, sanitizeUrl } from "./utils/url-policy";

// Flag global para indicar modo SSR
declare global {
  var __SLASH_SSR__: boolean | undefined;
  var __SLASH_TRACK_STATE__: ((state: Reactive) => void) | undefined;
  var __SLASH_TRACK_ACCESS__: ((state: Reactive, prop: string | symbol, value: unknown) => void) | undefined;
}

// Contexto de UM render: registry de reativos, contador de ids e valores lidos via
// state.get(). Nada disto é global: dois renders (ou streams intercalados) nunca
// compartilham estado.
type AccessKey = { state: Reactive; prop: string | symbol };
type RenderContext = {
  registry: Map<string, unknown>;
  counter: number;
  accessedValues: Map<unknown, AccessKey>;
};

function createContext(): RenderContext {
  return { registry: new Map(), counter: 0, accessedValues: new Map() };
}

// Contexto do render SÍNCRONO em andamento. O htm chama hString direto (sem como
// passar o contexto como argumento), então o render síncrono o publica aqui e o
// restaura no finally. Nunca fica definido durante um yield do stream.
let activeContext: RenderContext | null = null;

// Void elements que não têm tag de fechamento
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

// Helpers
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Avisos de dev: uma vez por mensagem (mensagens fixas, sem dados do usuário).
// Todo ponto de chamada é escrito com `if (process.env.NODE_ENV !== "production")` inline:
// o bundler só elimina os textos quando a expressão aparece por extenso (uma constante
// intermediária não é dobrada), e scripts/bundle-size.test.ts garante que sumiram.
const warned = new Set<string>();

// Origin of SafeHtml values. Everything hString/htmlString builds (elements, normalised strings,
// component output) is NOT trusted as raw text: it may carry escaped user data. Only values
// that never pass through here (unsafeHtml) are accepted inside <script>/<style>.
// Module-private WeakSet: it cannot be forged from outside, and JSON cannot carry it.
const GENERATED = new WeakSet<SafeHtml>();

function generated(html: string): SafeHtml {
  const out = new SafeHtml(html);
  GENERATED.add(out);
  return out;
}

const RAW_TEXT_DROPPED = "A dynamic value inside <script>/<style> was dropped (strings are data, not code). For JSON use unsafeHtml(serializeStateForScript(x))";

function warnOnce(message: string): void {
  if (!isDevMode() || !isWarningsEnabled() || warned.has(message)) return;
  warned.add(message);
  console.warn(`[slash] SSR: ${message}`);
}

/** @internal só para testes */
export function resetSsrWarningsForTests(): void {
  warned.clear();
}

const LOOKS_LIKE_MARKUP = /^\s*<[a-zA-Z!/]/;
const TAG_NAME = /^[A-Za-z][A-Za-z0-9:-]*$/;
// Attribute-name grammar, identical to the client's (props-core.ts ATTRIBUTE_NAME): ASCII, fail closed
const ATTR_NAME = /^[A-Za-z_:][A-Za-z0-9_:.-]*$/;
const PROTOTYPE_ATTRS = new Set(["__proto__", "constructor", "prototype"]);
const EVENT_ATTR = /^on/i;
const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);
const RESERVED_ATTR_PREFIX = "data-reactive-";
const BOOLEAN_ATTRS = new Set(["checked", "selected", "disabled", "readonly"]);

function captureSignal(ctx: RenderContext, signal: Reactive): string {
  const id = `s${ctx.counter++}`;
  ctx.registry.set(id, toSerializable(signal.get()));
  return id;
}

// Markup e URL confiáveis vão para o estado serializado como string (o brand se perde: falha fechado)
function toSerializable(value: unknown): unknown {
  if (isSafeHtml(value)) return value.value;
  // O brand não atravessa JSON: SafeUrl vai como a string, que no cliente segue a política normal
  if (isSafeUrl(value)) return value.value;
  if (Array.isArray(value)) return value.map(toSerializable);
  return value;
}

// Helper para capturar um valor que foi acessado via state.get()
function captureAccessedValue(ctx: RenderContext, value: unknown): string | undefined {
  if (ctx.accessedValues.has(value)) {
    const id = `s${ctx.counter++}`;
    ctx.registry.set(id, toSerializable(value));
    return id;
  }
  return undefined;
}

function processClass(val: unknown): string {
  if (val == null || val === false) return "";
  if (typeof val === "string") return val;

  if (Array.isArray(val)) {
    return val.filter(Boolean).map(String).join(" ");
  }

  if (typeof val === "object") {
    return Object.entries(val as Record<string, unknown>)
      .filter(([, on]) => Boolean(on))
      .map(([k]) => k)
      .join(" ");
  }

  return String(val);
}

// ---- style (SEC-09): política de nome e valor compartilhada com o cliente (utils/css-policy) ----

function styleObjectToString(style: Record<string, unknown>): string {
  if (styleObjectTooLong(style)) {
    if (process.env.NODE_ENV !== "production") warnOnce("style declaration rejected (unsafe CSS name or value)");
    return "";
  }
  const decls: string[] = [];
  for (const [k, v] of Object.entries(style)) {
    if (v == null || v === false) continue;
    if (isForbiddenStyleKey(k)) {
      if (process.env.NODE_ENV !== "production") warnOnce("style declaration rejected (unsafe CSS name or value)");
      continue;
    }
    const name = styleKeyToCssName(k);
    const value = String(v).trim();
    if (!isSafeCssDeclaration(name, value)) {
      if (process.env.NODE_ENV !== "production") warnOnce("style declaration rejected (unsafe CSS name or value)");
      continue;
    }
    decls.push(`${name}: ${value}`);
  }
  return decls.join("; ");
}

function styleStringToString(style: string): string {
  const { value, rejected } = sanitizeStyleString(style);
  if (rejected && process.env.NODE_ENV !== "production") {
    warnOnce("style declaration rejected (unsafe CSS name or value)");
  }
  return value;
}

// ---- atributos ----

// Atributo genérico `key="valor"`: política de URL e srcdoc antes de escapar
function genericAttr(tag: string, key: string, value: unknown, metaRefresh = false): string {
  const lower = key.toLowerCase();

  if (lower === "srcdoc") {
    if (isSafeHtml(value)) return ` ${key}="${escapeHtml(value.value)}"`;
    if (process.env.NODE_ENV !== "production") warnOnce("srcdoc only accepts SafeHtml; use srcdoc=${unsafeHtml(html)} (never with user input)");
    return "";
  }

  let str = String(value);
  // SafeUrl (unsafeUrl) é isento da política; qualquer outro valor segue a mesma regra do cliente.
  // O tag é SEMPRE passado: sem ele data:image falha fechado.
  if (isSafeUrl(value)) {
    str = value.value;
  } else if (isUrlAttribute(lower, tag)) {
    str = sanitizeUrl(lower, str, tag);
  } else if (lower === "content" && metaRefresh) {
    const result = evaluateMetaRefresh(str);
    str = result.value;
    if (result.blocked && process.env.NODE_ENV !== "production") warnOnce("meta refresh: blocked URL in content");
  } else if (lower === "style") {
    str = styleStringToString(str);
    // Sem nenhuma declaração segura: o atributo style some (mesma regra do cliente)
    if (str === "") return "";
  }
  return ` ${key}="${escapeHtml(str)}"`;
}

// <meta http-equiv="refresh">: lido do objeto de props inteiro (a ordem das chaves não importa)
function hasRefreshHttpEquiv(props: NonNullable<Props>): boolean {
  for (const [k, v] of Object.entries(props)) {
    const lower = k.toLowerCase();
    if ((lower === "http-equiv" || lower === "httpequiv") && isRefreshHttpEquiv(unmark(v))) return true;
  }
  return false;
}

// unsafeUrl()/SafeUrl só isenta atributos de URL (e o content de um meta refresh); em qualquer
// outro atributo vale como a string, que segue as regras do atributo (mesma regra do cliente)
function demoteSafeUrl(tag: string, key: string, value: unknown, metaRefresh: boolean): unknown {
  if (!isSafeUrl(value)) return value;
  const lower = key.toLowerCase();
  if (isUrlAttribute(lower, tag) || (metaRefresh && lower === "content")) return value;
  if (process.env.NODE_ENV !== "production") warnOnce("unsafeUrl() only applies to URL attributes; treated as the plain string");
  return value.value;
}

// Atributos de um elemento nativo
function propsToAttrs(ctx: RenderContext, tag: string, props: Props | null): string {
  if (!props) return "";
  let attrs = "";
  const metaRefresh = tag.toLowerCase() === "meta" && hasRefreshHttpEquiv(props);

  for (const [key, rawVal] of Object.entries(props)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "children") continue;
    const val = unmark(rawVal);

    if (!ATTR_NAME.test(key)) {
      if (process.env.NODE_ENV !== "production") warnOnce("invalid attribute name dropped");
      continue;
    }

    // Prefixo reservado aos marcadores de hidratação emitidos pelo próprio SSR
    // Same block as the client: names that would alter the prototype/identity
    if (PROTOTYPE_ATTRS.has(lowerKey)) {
      if (process.env.NODE_ENV !== "production") warnOnce(`${lowerKey} cannot be a prop`);
      continue;
    }

    if (key.toLowerCase().startsWith(RESERVED_ATTR_PREFIX)) {
      if (process.env.NODE_ENV !== "production") warnOnce("data-reactive-* attributes are reserved for hydration and were dropped");
      continue;
    }

    // Handlers nunca vão para o HTML (SSR não serializa funções, e string seria JS).
    // Mesma regra do cliente: todo /^on/i é evento; sem função/handleEvent/tupla, avisa
    if (EVENT_ATTR.test(key)) {
      if (!isEventHandler(val) && !isEventTuple(val) && val != null && val !== false) {
        if (process.env.NODE_ENV !== "production") {
          warnOnce('on* attribute dropped; use onClick=${fn} (handlers only exist on the client); a plain attribute needs the data- prefix');
        }
      }
      continue;
    }

    // Valor lido via state.get() (destructuring) ou reativo direto
    const accessedId = captureAccessedValue(ctx, val);
    const reactive = !accessedId && isReactive(val);
    const marker = accessedId ?? (reactive ? captureSignal(ctx, val as Reactive) : undefined);
    const value = demoteSafeUrl(tag, key, reactive ? (val as Reactive).get() : val, metaRefresh);

    if (marker) {
      if (lowerKey === "class" || lowerKey === "classname") {
        const className = processClass(value);
        if (className) attrs += ` class="${escapeHtml(className)}" data-reactive-class="${marker}"`;
      } else if (lowerKey === "value") {
        attrs += ` value="${escapeHtml(String(value ?? ""))}" data-reactive-value="${marker}"`;
      } else if (lowerKey === "checked") {
        if (value) attrs += " checked";
        attrs += ` data-reactive-checked="${marker}"`;
      } else {
        const attr = genericAttr(tag, key, value, metaRefresh);
        // Só reativos diretos ganham marcador em atributos comuns
        attrs += attr && reactive ? `${attr} data-reactive-${key}="${marker}"` : attr;
      }
      continue;
    }

    if (lowerKey === "class" || lowerKey === "classname") {
      const className = processClass(value);
      if (className) attrs += ` class="${escapeHtml(className)}"`;
      continue;
    }

    if (lowerKey === "style" && value && typeof value === "object") {
      const styleStr = styleObjectToString(value as Record<string, unknown>);
      if (styleStr) attrs += ` style="${escapeHtml(styleStr)}"`;
      continue;
    }

    if (BOOLEAN_ATTRS.has(lowerKey)) {
      if (value) attrs += ` ${key}`;
      continue;
    }

    if (value != null && value !== false) attrs += genericAttr(tag, key, value, metaRefresh);
  }

  return attrs;
}

// Conversão de children para HTML string. Só SafeHtml é markup; string é sempre texto
// Strings que chegam aqui são sempre dados (o texto estático é tratado em hString)
function childToString(child: Child, ctx: RenderContext, rawText = false): string {
  child = unmark(child) as Child;
  if (child == null || child === false) return "";

  if (isSafeHtml(child)) {
    if (rawText && GENERATED.has(child)) {
      if (process.env.NODE_ENV !== "production") warnOnce(RAW_TEXT_DROPPED);
      return "";
    }
    return child.value;
  }

  // Descritor de componente isomórfico (Link): renderiza como elemento nativo
  if (isSsrElement(child)) {
    if (rawText) {
      if (process.env.NODE_ENV !== "production") warnOnce(RAW_TEXT_DROPPED);
      return "";
    }
    return hString(child.tag, child.props as Props, ...(child.children as Child[])).value;
  }

  // Função: executar e processar resultado (para .map() e tracking automático)
  if (typeof child === "function") {
    const result = (child as () => unknown)();
    return childToString(result as Child, ctx, rawText);
  }

  // Reativo (mesma regra do cliente: get + subscribe; State não entra):
  // renderiza como filho comum, sem gravar o valor no estado serializado
  if (isReactive(child)) {
    // Dynamic by definition: no markers and no content inside <script>/<style>
    if (rawText) {
      if (process.env.NODE_ENV !== "production") warnOnce(RAW_TEXT_DROPPED);
      return "";
    }
    const id = `s${ctx.counter++}`;
    const inner = childToString(child.get() as Child, ctx, rawText);
    return `<!--reactive-start:${id}-->${inner}<!--reactive-end:${id}-->`;
  }

  // Array - verificar se veio de um state
  if (Array.isArray(child)) {
    const id = captureAccessedValue(ctx, child);
    const inner = child.map((c) => childToString(c as Child, ctx, rawText)).join("");
    return id ? `<!--reactive-start:${id}-->${inner}<!--reactive-end:${id}-->` : inner;
  }

  // Node ou outros objetos (não devem acontecer no SSR)
  if (typeof child === "object") {
    const name = (child as { constructor?: { name?: string } }).constructor?.name ?? "Object";
    if (process.env.NODE_ENV !== "production") warnOnce(`Unexpected object in child position (${name}). Use htmlString instead of html.`);
    return "[Object]";
  }

  // String e primitivos: sempre texto escapado; valor lido de state ganha marcador
  if (typeof child === "string") {
    if (rawText) {
      // Escaping does not make code safe (alert(1) survives): a dynamic string is dropped, as on the client
      if (process.env.NODE_ENV !== "production") warnOnce(RAW_TEXT_DROPPED);
      return "";
    } else if (LOOKS_LIKE_MARKUP.test(child)) {
      if (process.env.NODE_ENV !== "production") warnOnce("string rendered as text. For trusted HTML use unsafeHtml() (never with user input)");
    }
  }
  const text = escapeHtml(String(child));
  const id = captureAccessedValue(ctx, child);
  return id ? `<!--reactive-start:${id}-->${text}<!--reactive-end:${id}-->` : text;
}

// h() versão string (chamado pelo HTM). Sempre devolve SafeHtml
export function hString(tag: unknown, props: Props | null, ...rawChildren: Child[]): SafeHtml {
  const ctx = activeContext ?? createContext();
  tag = unmark(tag);

  // Componente função: pode devolver SafeHtml, string (texto) ou qualquer Child
  if (typeof tag === "function") {
    // O componente recebe valores simples, nunca o marcador interno
    const plainProps = Object.fromEntries(Object.entries(props || {}).map(([k, v]) => [k, unmark(v)]));
    const result = (tag as (p: Record<string, unknown>) => Child)({
      ...plainProps,
      children: rawChildren.map(unmark),
    });
    // A SafeHtml result keeps its origin (unsafeHtml stays trusted); anything else is normalised text
    return isSafeHtml(result) ? result : generated(childToString(result, ctx));
  }

  // Elemento nativo
  const tagName = String(tag || "div");
  if (!TAG_NAME.test(tagName)) {
    throw new Error(`[slash] SSR: invalid tag name: ${JSON.stringify(tagName)}`);
  }

  const attrs = propsToAttrs(ctx, tagName, props);

  // Void elements (auto-fecham)
  if (VOID_ELEMENTS.has(tagName)) {
    return generated(`<${tagName}${attrs}>`);
  }

  const rawText = RAW_TEXT_ELEMENTS.has(tagName.toLowerCase());
  // String solta (não marcada) = texto estático do template: cru em raw text, escapado nos demais
  const childHtml = rawChildren
    .map((c) => (typeof c === "string" ? (rawText ? c : escapeHtml(c)) : childToString(c, ctx, rawText)))
    .join("");
  return generated(`<${tagName}${attrs}>${childHtml}</${tagName}>`);
}

// Template literal tag usando HTM (versão string)
// O HTM não precisa saber que retorna SafeHtml - funciona normalmente
const boundHtm = (htm as any).bind(hString) as (strings: TemplateStringsArray, ...values: unknown[]) => SafeHtml;
export const htmlString = (strings: TemplateStringsArray, ...values: unknown[]): SafeHtml => {
  const result = boundHtm(strings, ...values.map(markDynamic)) as unknown;
  if (isSafeHtml(result)) return result;
  // O htm devolve a raiz como está quando não é um único elemento (texto, valor
  // dinâmico, várias raízes): normaliza para SafeHtml, tudo como dado escapado
  return generated(childToString(result as Child, activeContext ?? createContext()));
};

// Serializa o estado para uso dentro de <script>: troca os caracteres que
// permitiriam fechar a tag ou abrir comentário por escapes JSON equivalentes
export function serializeStateForScript(state: unknown): string {
  return escapeJsonForScript(JSON.stringify(state) ?? "null");
}

// Render síncrono completo: liga o modo SSR, renderiza e restaura tudo no finally.
// O contexto é local; nada é lido depois (a stream usa só o resultado)
function renderSync(view: Child | (() => Child)): { html: string; state: Record<string, unknown> } {
  const ctx = createContext();
  const previous = {
    context: activeContext,
    ssr: globalThis.__SLASH_SSR__,
    trackAccess: globalThis.__SLASH_TRACK_ACCESS__,
  };

  activeContext = ctx;
  globalThis.__SLASH_SSR__ = true;
  // Armazenar o valor com informação sobre de onde veio
  globalThis.__SLASH_TRACK_ACCESS__ = (state, prop, value) => {
    ctx.accessedValues.set(value, { state, prop });
  };

  try {
    const resolved = typeof view === "function" ? view() : view;
    const html = childToString(resolved as Child, ctx);
    return { html, state: Object.fromEntries(ctx.registry) };
  } finally {
    activeContext = previous.context;
    globalThis.__SLASH_SSR__ = previous.ssr;
    globalThis.__SLASH_TRACK_ACCESS__ = previous.trackAccess;
  }
}

// API principal
export function renderToString(view: Child | (() => Child)): {
  html: string;
  state: Record<string, unknown>;
} {
  return renderSync(view);
}

// Streaming SSR: o render roda inteiro antes do primeiro yield, então estado e
// globais não dependem do que outras requisições fazem entre os yields
export async function* renderToStream(
  view: Child | (() => Child),
): AsyncGenerator<string, void, unknown> {
  const { html, state } = renderSync(view);

  // Yield HTML em chunks de 16KB para melhor performance
  const chunkSize = 16384;
  for (let i = 0; i < html.length; i += chunkSize) {
    yield html.slice(i, i + chunkSize);
  }

  // Yield estado serializado no final
  yield `<script id="__SLASH_STATE__" type="application/json">${serializeStateForScript(state)}</script>`;
}
