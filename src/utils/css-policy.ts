/**
 * css-policy.ts - Política de valores CSS de `style` (compartilhada por cliente e SSR)
 *
 * Funções puras, ESTRITAS e fail-closed: não se emula o tokenizador do CSS. Uma declaração é
 * descartada (com aviso de dev) quando:
 * - o nome não é um identificador CSS simples (ou é -moz-binding / behavior);
 * - o valor contém `/*` em qualquer lugar (inclusive em strings);
 * - há barra invertida FORA de string (escapes só existem dentro de strings, onde são
 *   decodificados antes de checar; o original é emitido: `content:"\2022"` fica);
 * - uma string tem LF/CR/FF/NUL cru, barra+newline, ou não fecha;
 * - há `; { } <` fora de strings e de url();
 * - um `url(` sem aspas tem argumento fora de [A-Za-z0-9-._~:/?#@!$&+,;=%] (sem espaço,
 *   aspas, parênteses, `*`, barra invertida); `url("...")` é checado como string;
 * - o alvo de url() é rejeitado pela lista dos atributos de URL (relativa, http(s), data:image
 *   raster; svg+xml não);
 * - aparecem `expression(`, `javascript:`, `vbscript:`, `behavior:`, `-moz-binding`, `@import` ou
 *   funções que carregam URL fora de url() (`image-set`, `image`, `cross-fade`, `element`,
 *   `paint`, `src`);
 * - o style inteiro passa de 8 KB (descartado por inteiro).
 * Newlines ENTRE declarações e fora de strings são válidos. Tudo é linear: um único scanner,
 * sem regex com backtracking sobre a entrada do usuário.
 */

import { evaluateUrl } from "./url-policy";

// url() is an image context: it follows exactly the <img src> policy (evaluateUrl is the pure
// decision behind sanitizeUrl, without the duplicate warning; the declaration is rejected).
function isAllowedCssUrl(url: string): boolean {
  return !evaluateUrl("src", url, "img").blocked;
}


// Chaves de CSSStyleDeclaration que não são propriedades CSS: cssText injeta CSS arbitrário e
// os métodos não podem ser sobrescritos. Comparados em minúsculas. Valem para style em forma de objeto (cliente e SSR).
const STYLE_FORBIDDEN_KEYS = new Set([
  "csstext",
  "length",
  "parentrule",
  "__proto__",
  "constructor",
  "prototype",
  "setproperty",
  "getpropertyvalue",
  "getpropertypriority",
  "removeproperty",
  "item",
]);

export const isForbiddenStyleKey = (key: string): boolean => STYLE_FORBIDDEN_KEYS.has(key.toLowerCase());

export const CSS_PROP_NAME = /^-{0,2}[a-z][a-z0-9-]*$/i;
const CSS_FORBIDDEN_VALUE = /expression\s*\(|javascript:|vbscript:|behaviou?r\s*:|-moz-binding|@import/i;

// Funções que carregam URLs além de url() (inclui as variantes com prefixo de vendor):
// rejeitadas por inteiro, inclusive as strings dentro delas
const CSS_URL_FUNCTIONS = /(?:image-set|image|cross-fade|element|paint)\s*\(|(?:^|[^a-z0-9_-])src\s*\(/i;

// Escapes só são decodificados DENTRO de strings; um escape hex consome um espaço ou tab
// (newline cru não existe dentro de string). Regex linear: grupos de tamanho fixo.
const CSS_ESCAPE = /\\(?:([0-9a-f]{1,6})[ \t]?|([\s\S]))/gi;
// Argumento de url() sem aspas
const URL_ARG = /^[A-Za-z0-9\-._~:/?#@!$&+,;=%]*$/;

/** Tamanho máximo do style inteiro (string ou soma de chaves+valores do objeto) */
export const STYLE_MAX_LENGTH = 8192;

function decodeEscapes(css: string): string {
  return css.replace(CSS_ESCAPE, (_m, hex?: string, ch?: string) => {
    if (hex) {
      const n = Number.parseInt(hex, 16);
      return n === 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff) ? "\ufffd" : String.fromCodePoint(n);
    }
    return ch as string;
  });
}

const isBreak = (code: number): boolean => code === 10 || code === 13 || code === 12 || code === 0;
const isBlank = (c: string | undefined): boolean => c === " " || c === "\t" || c === "\n";

// Fim (índice da aspa de fechamento) da string que abre em `start`, ou -1: LF/CR/FF/NUL crus,
// barra+newline e string sem fechar falham fechado
function stringEnd(css: string, start: number): number {
  const quote = css[start];
  for (let j = start + 1; j < css.length; j++) {
    const c = css[j];
    if (isBreak(css.charCodeAt(j))) return -1;
    if (c === quote) return j;
    if (c === "\\") {
      j++;
      if (j >= css.length || isBreak(css.charCodeAt(j))) return -1;
    }
  }
  return -1;
}

export function isSafeCssValue(value: string): boolean {
  if (value.length > STYLE_MAX_LENGTH || value.includes("/*")) return false;
  // `text`: o que o navegador "vê" para as checagens de palavras (strings já decodificadas)
  let text = "";
  let closers = ""; // pilha dos fechamentos esperados: ( [ fora de strings e de url() devem casar
  for (let i = 0; i < value.length; i++) {
    const c = value[i] as string;
    if (c === ")" || c === "]") {
      if (closers[closers.length - 1] !== c) return false;
      closers = closers.slice(0, -1);
      text += c;
      continue;
    }
    if (c === "[") {
      closers += "]";
      text += c;
      continue;
    }
    if (c === "\\" || c === "\0" || c === ";" || c === "{" || c === "}" || c === "<") return false;
    if (c === '"' || c === "'") {
      const end = stringEnd(value, i);
      if (end < 0) return false;
      text += decodeEscapes(value.slice(i + 1, end));
      i = end;
    } else if (c === "(" && text.slice(-3).toLowerCase() === "url") {
      let j = i + 1;
      while (isBlank(value[j])) j++;
      let target: string;
      if (value[j] === '"' || value[j] === "'") {
        const end = stringEnd(value, j);
        if (end < 0) return false;
        target = decodeEscapes(value.slice(j + 1, end));
        j = end + 1;
        while (isBlank(value[j])) j++;
        if (value[j] !== ")") return false;
        i = j;
      } else {
        const close = value.indexOf(")", j);
        if (close < 0) return false;
        target = value.slice(j, close);
        if (!URL_ARG.test(target)) return false;
        i = close;
      }
      if (!isAllowedCssUrl(target.trim())) return false;
      text += "()";
    } else {
      if (c === "(") closers += ")";
      text += c;
    }
  }
  if (closers) return false;
  return !(CSS_FORBIDDEN_VALUE.test(text) || CSS_URL_FUNCTIONS.test(text));
}

// Propriedades que executam/carregam código no IE/Firefox antigos: proibidas pelo NOME
const CSS_FORBIDDEN_NAME = /^(?:-moz-binding|behaviou?r)$/i;

export const isForbiddenCssName = (name: string): boolean => CSS_FORBIDDEN_NAME.test(name);

export function isSafeCssDeclaration(name: string, value: string): boolean {
  return CSS_PROP_NAME.test(name) && !isForbiddenCssName(name) && value !== "" && isSafeCssValue(value);
}

/**
 * Divide `a:b; c:d` em declarações (linear). Consciente de aspas e de escapes: `;` dentro de
 * string ou de parênteses (`data:...;base64`) não separa, e uma barra invertida escapa o próximo
 * caractere (`\;` não separa, `\"` não abre string). Comentários NÃO são reconhecidos: qualquer
 * declaração com `/*`, barra fora de string, newline em string etc. é rejeitada por
 * isSafeCssValue; um erro de divisão só pode juntar declarações (descartadas juntas), nunca
 * aceitar texto que o navegador leria de outro modo.
 */
export function splitDeclarations(style: string): string[] {
  const out: string[] = [];
  let start = 0;
  let quote = "";
  let depth = 0;
  for (let i = 0; i < style.length; i++) {
    const c = style[i] as string;
    if (c === "\\") {
      i++;
    } else if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "(") {
      depth++;
    } else if (c === ")") {
      if (depth > 0) depth--;
    } else if (c === ";" && depth === 0) {
      out.push(style.slice(start, i));
      start = i + 1;
    }
  }
  out.push(style.slice(start));
  return out.map((d) => d.trim()).filter(Boolean);
}

/** `style="a:b; c:d"` -> mantém só as declarações seguras; `rejected` indica que alguma foi removida */
export function sanitizeStyleString(style: string): { value: string; rejected: boolean } {
  if (style.length > STYLE_MAX_LENGTH) return { value: "", rejected: true };
  const decls: string[] = [];
  let rejected = false;
  for (const decl of splitDeclarations(style)) {
    const idx = decl.indexOf(":");
    const name = idx > 0 ? decl.slice(0, idx).trim() : "";
    const value = idx > 0 ? decl.slice(idx + 1).trim() : "";
    if (isSafeCssDeclaration(name, value)) decls.push(decl);
    else rejected = true;
  }
  return { value: decls.join("; "), rejected };
}

/** Style em forma de objeto com mais de 8 KB (chaves + valores): descartado por inteiro */
export function styleObjectTooLong(style: Record<string, unknown>): boolean {
  let total = 0;
  for (const k of Object.keys(style)) {
    const v = style[k];
    total += k.length + (v == null || v === false ? 0 : String(v).length);
    if (total > STYLE_MAX_LENGTH) return true;
  }
  return false;
}

/** Chave de objeto de style -> nome CSS: `--x` verbatim; camelCase vira kebab; webkit/moz/ms ganham `-` */
export function styleKeyToCssName(key: string): string {
  if (key.startsWith("--")) return key;
  const kebab = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  return /^(?:webkit|moz|ms)-/.test(kebab) ? `-${kebab}` : kebab;
}

/** Chave com prefixo de vendor em camelCase (WebkitX, webkitX, MozX, msX) */
export const isVendorStyleKey = (key: string): boolean => /^(?:[Ww]ebkit|[Mm]oz|ms|Ms)[A-Z]/.test(key);
