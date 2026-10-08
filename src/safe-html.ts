// src/safe-html.ts - Marcação confiável (isomórfico, sem DOM nem imports de servidor)

// Brand por Symbol.for: sobrevive a bundles duplicados (core/ssr) e não pode ser
// forjado por JSON vindo de fora (JSON não carrega símbolos)
export const SAFE_HTML_BRAND = Symbol.for("slash.SafeHtml");

/**
 * Marcação HTML confiável. Strings comuns são sempre texto (escapadas);
 * só um SafeHtml é emitido como markup. Crie via `htmlString`/`html` ou `unsafeHtml()`.
 */
export class SafeHtml {
  readonly [SAFE_HTML_BRAND] = true as const;
  readonly value: string;

  constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }

  toString(): string {
    return this.value;
  }
}

export function isSafeHtml(x: unknown): x is SafeHtml {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as Record<symbol, unknown>)[SAFE_HTML_BRAND] === true &&
    typeof (x as { value?: unknown }).value === "string"
  );
}

/**
 * ESCAPE HATCH: marca `html` como markup confiável e o emite sem escapar.
 * NUNCA passe entrada do usuário: esta função NÃO sanitiza nada.
 * Para JSON dentro de <script>, use `unsafeHtml(serializeStateForScript(x))`.
 */
export function unsafeHtml(html: string): SafeHtml {
  return new SafeHtml(String(html));
}
