/**
 * safe-url.ts - Marca de URL confiável (escape hatch da política de URLs)
 *
 * Isomórfico: sem DOM e sem imports de servidor.
 */

/**
 * URL declarada como confiável pelo desenvolvedor. Atributos de URL (href, src,
 * action...) aceitam um SafeUrl sem passar pela política de `sanitizeUrl`.
 * Só `unsafeUrl()` cria instâncias; strings e objetos comuns nunca são SafeUrl.
 */
export class SafeUrl {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }
}

/** Type guard: true apenas para instâncias criadas por `unsafeUrl()` */
export function isSafeUrl(x: unknown): x is SafeUrl {
  return x instanceof SafeUrl;
}

/**
 * Escape hatch: marca uma URL como confiável e a isenta da política de URLs.
 *
 * NUNCA passe entrada do usuário. Esta função NÃO sanitiza nada: `javascript:` e
 * `data:text/html` passam intactos. Use apenas com URLs escritas por você.
 */
export function unsafeUrl(url: string): SafeUrl {
  return new SafeUrl(String(url));
}
