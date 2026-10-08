/**
 * ssr-element.ts - Descritor de elemento para componentes que rodam no SSR
 *
 * Um componente isomórfico (ex.: Link) não pode importar o renderizador de string
 * (puxaria o servidor para o bundle do cliente) nem depender de um global mutável.
 * No SSR ele devolve este descritor; o renderizador de string o reconhece e o
 * renderiza com hString (mesma política de atributos, URLs e escape).
 * Isomórfico: sem DOM e sem imports de servidor.
 */

// Marca por Symbol.for: JSON vindo de fora não carrega símbolos, então não forja um descritor
const BRAND = Symbol.for("slash.ssrElement");

export interface SsrElement {
  readonly tag: string;
  readonly props: Record<string, unknown>;
  readonly children: readonly unknown[];
}

export function ssrElement(tag: string, props: Record<string, unknown>, ...children: unknown[]): SsrElement {
  return Object.freeze({ [BRAND]: true, tag, props, children }) as SsrElement;
}

export function isSsrElement(x: unknown): x is SsrElement {
  return typeof x === "object" && x !== null && Object.hasOwn(x, BRAND);
}
