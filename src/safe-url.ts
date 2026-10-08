/**
 * safe-url.ts - Marca de URL confiável (escape hatch da política de URLs)
 *
 * Isomórfico: sem DOM e sem imports de servidor.
 */

// Marca global: funciona entre bundles CJS/ESM e cópias do pacote
const BRAND = Symbol.for("slash.safeUrl");

/**
 * URL declarada como confiável pelo desenvolvedor. Atributos de URL (href, src,
 * action...) aceitam um SafeUrl sem passar pela política de `sanitizeUrl`.
 * Só `unsafeUrl()` cria instâncias; strings e objetos comuns nunca são SafeUrl.
 */
export interface SafeUrl {
  readonly value: string;
  toString(): string;
}

/**
 * Type guard: a marca precisa ser propriedade PRÓPRIA (poluição de protótipo
 * não forja um SafeUrl) e `value` precisa ser string.
 */
export function isSafeUrl(x: unknown): x is SafeUrl {
  return (
    typeof x === "object" &&
    x !== null &&
    Object.prototype.hasOwnProperty.call(x, BRAND) &&
    (x as Record<symbol, unknown>)[BRAND] === true &&
    typeof (x as { value?: unknown }).value === "string"
  );
}

/**
 * Escape hatch: marca uma URL como confiável e a isenta da política de URLs.
 *
 * NUNCA passe entrada do usuário. Esta função NÃO sanitiza nada: `javascript:` e
 * `data:text/html` passam intactos. Use apenas com URLs escritas por você.
 */
export function unsafeUrl(url: string): SafeUrl {
  const value = String(url);
  return Object.freeze({
    [BRAND]: true,
    value,
    toString: () => value,
  }) as SafeUrl;
}
