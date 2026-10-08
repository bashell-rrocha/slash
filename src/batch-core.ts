/**
 * FUNCTIONAL CORE: Batch Updates (FCIS pattern)
 *
 * Contador de profundidade puro para lotes aninhados.
 * O flush só acontece quando o lote mais externo termina.
 *
 * Funções puras, testáveis sem side effects.
 */

/**
 * Entra em um lote: incrementa a profundidade
 * PURE FUNCTION
 */
export function enterBatch(depth: number): number {
  return depth + 1
}

/**
 * Sai de um lote: decrementa a profundidade (nunca abaixo de 0)
 * e indica se deve ocorrer o flush (somente ao voltar a 0)
 * PURE FUNCTION
 */
export function exitBatch(depth: number): { depth: number; flush: boolean } {
  const next = Math.max(0, depth - 1)
  return { depth: next, flush: depth > 0 && next === 0 }
}
