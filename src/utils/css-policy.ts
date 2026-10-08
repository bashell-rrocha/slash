/**
 * css-policy.ts - Política de valores CSS de `style` (compartilhada por cliente e SSR)
 *
 * Funções puras. Uma declaração é aceita quando o nome é um identificador CSS válido e o valor
 * passa na checagem abaixo. O valor é avaliado DEPOIS de remover comentários e decodificar os
 * escapes CSS (`\75rl(` = `url(`); se for aceito, emite-se o original (`content:"\2022"` fica).
 * Rejeita: `; { } <` fora de strings e de url(); `expression(`, `javascript:`, `vbscript:`,
 * `behavior:`, `-moz-binding`, `@import`; funções que carregam URL fora de url()
 * (`image-set`, `image`, `cross-fade`, `element`, `paint`, `src`). Cada `url()` segue a mesma
 * lista dos atributos de URL (relativa, http(s), data:image raster; svg+xml é bloqueado).
 * O divisor de declarações respeita aspas, parênteses e comentários (`content:'a;b'` e
 * `data:image/png;base64,...` sobrevivem).
 */

import { isAllowedCssUrl } from "./url-policy";


// Chaves de CSSStyleDeclaration que não são propriedades CSS: cssText injeta CSS arbitrário e
// os métodos não podem ser sobrescritos. Valem para style em forma de objeto (cliente e SSR).
const STYLE_FORBIDDEN_KEYS = new Set([
  "cssText",
  "length",
  "parentRule",
  "__proto__",
  "constructor",
  "prototype",
  "setProperty",
  "getPropertyValue",
  "getPropertyPriority",
  "removeProperty",
  "item",
]);

export const isForbiddenStyleKey = (key: string): boolean => STYLE_FORBIDDEN_KEYS.has(key);

export const CSS_PROP_NAME = /^-{0,2}[a-z][a-z0-9-]*$/i;
const CSS_FORBIDDEN_VALUE = /expression\s*\(|javascript:|vbscript:|behaviou?r\s*:|-moz-binding|@import/i;

// Funções que carregam URLs além de url() (inclui as variantes com prefixo de vendor):
// rejeitadas por inteiro, inclusive as strings dentro delas
const CSS_URL_FUNCTIONS = /(?:image-set|image|cross-fade|element|paint)\s*\(|(?:^|[^a-z0-9_-])src\s*\(/i;

const CSS_STRING = /"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'/g;
const CSS_UNQUOTED_URL = /url\(\s*[^)"']*\)/gi;
const CSS_ESCAPE = /\\(?:([0-9a-f]{1,6})[ \t\n\r\f]?|([\s\S]))/gi;

// Remove /* comentários */ (inclusive sem fechar) sem mexer dentro de strings
function stripComments(css: string): string {
  let out = "";
  let quote = "";
  for (let i = 0; i < css.length; i++) {
    const c = css[i] as string;
    if (quote) {
      out += c;
      if (c === "\\" && i + 1 < css.length) out += css[++i];
      else if (c === quote) quote = "";
    } else if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end < 0) break;
      i = end + 1;
    } else {
      if (c === '"' || c === "'") quote = c;
      out += c;
    }
  }
  return out;
}

// Decodifica escapes CSS (\75 -> u; \<newline> some; \x -> x)
function decodeEscapes(css: string): string {
  return css.replace(CSS_ESCAPE, (_m, hex?: string, ch?: string) => {
    if (hex) {
      const n = Number.parseInt(hex, 16);
      return n === 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff) ? "\ufffd" : String.fromCodePoint(n);
    }
    return ch === "\n" || ch === "\r" || ch === "\f" ? "" : (ch as string);
  });
}

export function isSafeCssValue(value: string): boolean {
  const stripped = stripComments(value);
  // `;` `{` `}` `<` só são aceitos dentro de strings e de url()
  if (/[;{}<]/.test(stripped.replace(CSS_STRING, '""').replace(CSS_UNQUOTED_URL, "url()"))) return false;
  const decoded = decodeEscapes(stripped);
  if (CSS_FORBIDDEN_VALUE.test(decoded) || CSS_URL_FUNCTIONS.test(decoded)) return false;
  const opened = decoded.match(/url\(/gi)?.length ?? 0;
  if (opened === 0) return true;
  const urls = [...decoded.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*?))\s*\)/gi)];
  if (urls.length !== opened) return false;
  return urls.every((m) => isAllowedCssUrl((m[1] ?? m[2] ?? m[3] ?? "").trim()));
}

export function isSafeCssDeclaration(name: string, value: string): boolean {
  return CSS_PROP_NAME.test(name) && value !== "" && isSafeCssValue(value);
}

/** Divide `a:b; c:d` em declarações; `;` dentro de aspas, parênteses ou comentários não separa */
export function splitDeclarations(style: string): string[] {
  const out: string[] = [];
  let start = 0;
  let quote = "";
  let depth = 0;
  for (let i = 0; i < style.length; i++) {
    const c = style[i] as string;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === "/" && style[i + 1] === "*") {
      const end = style.indexOf("*/", i + 2);
      if (end < 0) break;
      i = end + 1;
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

/** Chave de objeto de style -> nome CSS: `--x` verbatim; camelCase vira kebab; webkit/moz/ms ganham `-` */
export function styleKeyToCssName(key: string): string {
  if (key.startsWith("--")) return key;
  const kebab = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  return /^(?:webkit|moz|ms)-/.test(kebab) ? `-${kebab}` : kebab;
}

/** Chave com prefixo de vendor em camelCase (WebkitX, webkitX, MozX, msX) */
export const isVendorStyleKey = (key: string): boolean => /^(?:[Ww]ebkit|[Mm]oz|ms|Ms)[A-Z]/.test(key);
