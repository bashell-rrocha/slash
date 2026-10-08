// src/server-render.ts
import htm from "htm";
import { isDevMode, isWarningsEnabled } from "./dev-warnings";
import { isSafeHtml, SafeHtml } from "./safe-html";
import type { Child, Props, Reactive } from "./types";
import { isReactive } from "./utils/guards";
import { escapeJsonForScript } from "./utils/script-json";
import { isSafeUrl } from "./safe-url";
import { isSsrElement } from "./ssr-element";
import { isUrlAttribute, sanitizeUrl } from "./utils/url-policy";

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

// Marcador interno: htmlString embrulha todo valor string DINÂMICO (${...}) antes de
// chamar o htm. Assim, uma string "solta" filha direta de um elemento em hString é
// texto estático escrito pelo desenvolvedor (cru em <script>/<style>); o resto é dado.
// toString devolve o texto cru e existe SÓ para a concatenação do htm em atributos
// mistos (class="a ${b}"); a classe é privada ao módulo e todo ponto de saída
// (hString, htmlString) a remove antes de qualquer valor chegar ao usuário.
class DynamicText {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

function markDynamic(value: unknown): unknown {
  return typeof value === "string" ? new DynamicText(value) : value;
}

function unmark<T>(value: T): T | string {
  return value instanceof DynamicText ? value.value : value;
}

// Avisos de dev: uma vez por mensagem (mensagens fixas, sem dados do usuário)
const warned = new Set<string>();

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
// Gramática de nome de atributo HTML: sem espaço, aspas, <, >, /, = nem controles
// biome-ignore lint/suspicious/noControlCharactersInRegex: faixa de controles é o ponto
const ATTR_NAME = /^[^\s"'<>/=\u0000-\u001f\u007f-\u009f]+$/;
const EVENT_ATTR = /^on/i;
const CAMEL_EVENT_ATTR = /^on[A-Z]/;
const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);
const RESERVED_ATTR_PREFIX = "data-reactive-";
const BOOLEAN_ATTRS = new Set(["checked", "selected", "disabled", "readonly"]);

function captureSignal(ctx: RenderContext, signal: Reactive): string {
  const id = `s${ctx.counter++}`;
  ctx.registry.set(id, toSerializable(signal.get()));
  return id;
}

// Markup confiável vai para o estado serializado como string, como sempre foi
function toSerializable(value: unknown): unknown {
  if (isSafeHtml(value)) return value.value;
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

// ---- style (SEC-09): valida nome e valor de cada declaração CSS ----
const CSS_PROP_NAME = /^-{0,2}[a-z][a-z0-9-]*$/i;
const CSS_FORBIDDEN_VALUE = /[;{}<\\]|expression\s*\(|javascript:|vbscript:|behaviou?r\s*:|-moz-binding|@import/i;
const CSS_URL_ALLOWED = /^(https?:\/\/|\/(?!\/)|\.\.?\/|#)/i;

// Funções que carregam URLs além de url(): rejeitadas por inteiro (inclusive strings dentro)
const CSS_URL_FUNCTIONS = /image-set\s*\(|(?:^|[^a-z0-9_-])src\s*\(/i;

function isSafeCssValue(value: string): boolean {
  if (CSS_FORBIDDEN_VALUE.test(value) || CSS_URL_FUNCTIONS.test(value)) return false;
  const opened = value.match(/url\(/gi)?.length ?? 0;
  if (opened === 0) return true;
  const urls = [...value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*?))\s*\)/gi)];
  if (urls.length !== opened) return false;
  return urls.every((m) => CSS_URL_ALLOWED.test((m[1] ?? m[2] ?? m[3] ?? "").trim()));
}

function isSafeCssDeclaration(name: string, value: string): boolean {
  return CSS_PROP_NAME.test(name) && value !== "" && isSafeCssValue(value);
}

function styleObjectToString(style: Record<string, unknown>): string {
  const decls: string[] = [];
  for (const [k, v] of Object.entries(style)) {
    if (v == null || v === false) continue;
    const name = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    const value = String(v).trim();
    if (!isSafeCssDeclaration(name, value)) {
      warnOnce("declaração de style rejeitada (nome ou valor CSS inseguro)");
      continue;
    }
    decls.push(`${name}: ${value}`);
  }
  return decls.join("; ");
}

function styleStringToString(style: string): string {
  const decls: string[] = [];
  for (const raw of style.split(";")) {
    const decl = raw.trim();
    if (!decl) continue;
    const idx = decl.indexOf(":");
    const name = idx > 0 ? decl.slice(0, idx).trim() : "";
    const value = idx > 0 ? decl.slice(idx + 1).trim() : "";
    if (!isSafeCssDeclaration(name, value)) {
      warnOnce("declaração de style rejeitada (nome ou valor CSS inseguro)");
      continue;
    }
    decls.push(decl);
  }
  return decls.join("; ");
}

// ---- atributos ----

// Atributo genérico `key="valor"`: política de URL e srcdoc antes de escapar
function genericAttr(tag: string, key: string, value: unknown): string {
  const lower = key.toLowerCase();

  if (lower === "srcdoc") {
    if (isSafeHtml(value)) return ` ${key}="${escapeHtml(value.value)}"`;
    warnOnce("srcdoc só aceita SafeHtml; use srcdoc=${unsafeHtml(html)} (nunca com entrada do usuário)");
    return "";
  }

  let str = String(value);
  // SafeUrl (unsafeUrl) é isento da política; qualquer outro valor segue a mesma regra do cliente.
  // O tag é SEMPRE passado: sem ele data:image falha fechado.
  if (isSafeUrl(value)) {
    str = value.value;
  } else if (isUrlAttribute(lower, tag)) {
    str = sanitizeUrl(lower, str, tag);
  } else if (lower === "style") {
    str = styleStringToString(str);
  }
  return ` ${key}="${escapeHtml(str)}"`;
}

// Atributos de um elemento nativo
function propsToAttrs(ctx: RenderContext, tag: string, props: Props | null): string {
  if (!props) return "";
  let attrs = "";

  for (const [key, rawVal] of Object.entries(props)) {
    if (key === "children") continue;
    const val = unmark(rawVal);

    if (!ATTR_NAME.test(key)) {
      warnOnce("nome de atributo inválido descartado");
      continue;
    }

    // Prefixo reservado aos marcadores de hidratação emitidos pelo próprio SSR
    if (key.toLowerCase().startsWith(RESERVED_ATTR_PREFIX)) {
      warnOnce("atributos data-reactive-* são reservados à hidratação e foram descartados");
      continue;
    }

    // Handlers nunca vão para o HTML (SSR não serializa funções, e string seria JS)
    if (EVENT_ATTR.test(key)) {
      if (!CAMEL_EVENT_ATTR.test(key)) {
        warnOnce("atributo on* descartado; use onClick=${fn} (handlers só existem no cliente)");
      }
      continue;
    }

    // Valor lido via state.get() (destructuring) ou reativo direto
    const accessedId = captureAccessedValue(ctx, val);
    const reactive = !accessedId && isReactive(val);
    const marker = accessedId ?? (reactive ? captureSignal(ctx, val as Reactive) : undefined);
    const value = reactive ? (val as Reactive).get() : val;

    if (marker) {
      if (key === "class" || key === "className") {
        const className = processClass(value);
        if (className) attrs += ` class="${escapeHtml(className)}" data-reactive-class="${marker}"`;
      } else if (key === "value") {
        attrs += ` value="${escapeHtml(String(value ?? ""))}" data-reactive-value="${marker}"`;
      } else if (key === "checked") {
        if (value) attrs += " checked";
        attrs += ` data-reactive-checked="${marker}"`;
      } else {
        const attr = genericAttr(tag, key, value);
        // Só reativos diretos ganham marcador em atributos comuns
        attrs += attr && reactive ? `${attr} data-reactive-${key}="${marker}"` : attr;
      }
      continue;
    }

    if (key === "class" || key === "className") {
      const className = processClass(value);
      if (className) attrs += ` class="${escapeHtml(className)}"`;
      continue;
    }

    if (key === "style" && value && typeof value === "object") {
      const styleStr = styleObjectToString(value as Record<string, unknown>);
      if (styleStr) attrs += ` style="${escapeHtml(styleStr)}"`;
      continue;
    }

    if (BOOLEAN_ATTRS.has(key)) {
      if (value) attrs += ` ${key}`;
      continue;
    }

    if (value != null && value !== false) attrs += genericAttr(tag, key, value);
  }

  return attrs;
}

// Conversão de children para HTML string. Só SafeHtml é markup; string é sempre texto
// Strings que chegam aqui são sempre dados (o texto estático é tratado em hString)
function childToString(child: Child, ctx: RenderContext, rawText = false): string {
  child = unmark(child) as Child;
  if (child == null || child === false) return "";

  if (isSafeHtml(child)) return child.value;

  // Descritor de componente isomórfico (Link): renderiza como elemento nativo
  if (isSsrElement(child)) return hString(child.tag, child.props as Props, ...(child.children as Child[])).value;

  // Função: executar e processar resultado (para .map() e tracking automático)
  if (typeof child === "function") {
    const result = (child as () => unknown)();
    return childToString(result as Child, ctx, rawText);
  }

  // Reativo (mesma regra do cliente: get + subscribe; State não entra):
  // renderiza como filho comum, sem gravar o valor no estado serializado
  if (isReactive(child)) {
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
    warnOnce(`Unexpected object in child position (${name}). Use htmlString instead of html.`);
    return "[Object]";
  }

  // String e primitivos: sempre texto escapado; valor lido de state ganha marcador
  if (typeof child === "string") {
    if (rawText) {
      warnOnce(
        "string dentro de <script>/<style> é escapada; para JSON use unsafeHtml(serializeStateForScript(x))",
      );
    } else if (LOOKS_LIKE_MARKUP.test(child)) {
      warnOnce("string renderizada como texto. Para HTML confiável use unsafeHtml() (nunca com entrada do usuário)");
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
    return new SafeHtml(childToString(result, ctx));
  }

  // Elemento nativo
  const tagName = String(tag || "div");
  if (!TAG_NAME.test(tagName)) {
    throw new Error(`[slash] SSR: nome de tag inválido: ${JSON.stringify(tagName)}`);
  }

  const attrs = propsToAttrs(ctx, tagName, props);

  // Void elements (auto-fecham)
  if (VOID_ELEMENTS.has(tagName)) {
    return new SafeHtml(`<${tagName}${attrs}>`);
  }

  const rawText = RAW_TEXT_ELEMENTS.has(tagName.toLowerCase());
  // String solta (não marcada) = texto estático do template: cru em raw text, escapado nos demais
  const childHtml = rawChildren
    .map((c) => (typeof c === "string" ? (rawText ? c : escapeHtml(c)) : childToString(c, ctx, rawText)))
    .join("");
  return new SafeHtml(`<${tagName}${attrs}>${childHtml}</${tagName}>`);
}

// Template literal tag usando HTM (versão string)
// O HTM não precisa saber que retorna SafeHtml - funciona normalmente
const boundHtm = (htm as any).bind(hString) as (strings: TemplateStringsArray, ...values: unknown[]) => SafeHtml;
export const htmlString = (strings: TemplateStringsArray, ...values: unknown[]): SafeHtml => {
  const result = boundHtm(strings, ...values.map(markDynamic)) as unknown;
  if (isSafeHtml(result)) return result;
  // O htm devolve a raiz como está quando não é um único elemento (texto, valor
  // dinâmico, várias raízes): normaliza para SafeHtml, tudo como dado escapado
  return new SafeHtml(childToString(result as Child, activeContext ?? createContext()));
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
