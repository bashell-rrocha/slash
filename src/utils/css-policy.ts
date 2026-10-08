/**
 * css-policy.ts - Política de valores CSS de `style` (compartilhada por cliente e SSR)
 *
 * Funções puras. Uma declaração é aceita quando o nome é um identificador CSS válido
 * e o valor não contém: `; { } < \`, `expression(`, `javascript:`, `vbscript:`,
 * `behavior:`, `-moz-binding`, `@import`, nem funções que carregam URL fora de
 * `url()` (`image-set`, `image`, `cross-fade`, `element`, `paint`, `src`).
 * `url()` só aceita http(s), caminho absoluto de um `/`, `./`, `../` ou `#fragmento`.
 */

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
const CSS_FORBIDDEN_VALUE = /[;{}<\\]|expression\s*\(|javascript:|vbscript:|behaviou?r\s*:|-moz-binding|@import/i;
const CSS_URL_ALLOWED = /^(https?:\/\/|\/(?!\/)|\.\.?\/|#)/i;

// Funções que carregam URLs além de url() (inclui as variantes com prefixo de vendor):
// rejeitadas por inteiro, inclusive as strings dentro delas
const CSS_URL_FUNCTIONS = /(?:image-set|image|cross-fade|element|paint)\s*\(|(?:^|[^a-z0-9_-])src\s*\(/i;

export function isSafeCssValue(value: string): boolean {
  if (CSS_FORBIDDEN_VALUE.test(value) || CSS_URL_FUNCTIONS.test(value)) return false;
  const opened = value.match(/url\(/gi)?.length ?? 0;
  if (opened === 0) return true;
  const urls = [...value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*?))\s*\)/gi)];
  if (urls.length !== opened) return false;
  return urls.every((m) => CSS_URL_ALLOWED.test((m[1] ?? m[2] ?? m[3] ?? "").trim()));
}

export function isSafeCssDeclaration(name: string, value: string): boolean {
  return CSS_PROP_NAME.test(name) && value !== "" && isSafeCssValue(value);
}

/** `style="a:b; c:d"` -> mantém só as declarações seguras; `rejected` indica que alguma foi removida */
export function sanitizeStyleString(style: string): { value: string; rejected: boolean } {
  const decls: string[] = [];
  let rejected = false;
  for (const raw of style.split(";")) {
    const decl = raw.trim();
    if (!decl) continue;
    const idx = decl.indexOf(":");
    const name = idx > 0 ? decl.slice(0, idx).trim() : "";
    const value = idx > 0 ? decl.slice(idx + 1).trim() : "";
    if (isSafeCssDeclaration(name, value)) decls.push(decl);
    else rejected = true;
  }
  return { value: decls.join("; "), rejected };
}
