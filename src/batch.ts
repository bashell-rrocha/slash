/**
 * IMPERATIVE SHELL: Batch Updates API
 *
 * Fornece API pública para agrupar múltiplas atualizações de estado.
 * Estados alterados dentro do lote enfileiram seu notificador; no fim do
 * lote mais externo cada notificador roda uma única vez, com o valor final.
 */

import { enterBatch, exitBatch } from './batch-core'

/**
 * Profundidade atual de lotes (0 = fora de lote)
 */
let batchDepth = 0

/**
 * Notificadores de estados alterados durante o lote.
 * Set preserva a ordem do primeiro enfileiramento e deduplica por identidade.
 */
let pendingNotifiers = new Set<() => void>()

/**
 * Verifica se está atualmente em modo batch
 *
 * @returns true se está batching
 */
export function isInBatch(): boolean {
  return batchDepth > 0
}

/**
 * Registra o notificador de um estado alterado durante o lote
 * Usado internamente pelo state manager
 *
 * @internal
 */
export function __enqueueBatchNotify(notify: () => void): void {
  pendingNotifiers.add(notify)
}

/**
 * Quantidade de notificadores pendentes (apenas para testes)
 *
 * @internal
 */
export function __pendingBatchNotifyCount(): number {
  return pendingNotifiers.size
}

/**
 * Executa os notificadores pendentes, isolando erros:
 * todos rodam e o primeiro erro é relançado no fim.
 */
function flushPending(): void {
  // Esvazia antes de rodar: sets feitos por observadores (já fora do lote)
  // notificam normalmente, sem se misturar a esta fila.
  const toRun = pendingNotifiers
  pendingNotifiers = new Set()

  let firstError: unknown
  let hasError = false
  for (const notify of toRun) {
    try {
      notify()
    } catch (error) {
      if (!hasError) {
        hasError = true
        firstError = error
      }
    }
  }
  if (hasError) throw firstError
}

/**
 * Agrupa múltiplas atualizações de estado em um batch
 *
 * Durante a execução da função, estados alterados não notificam; ao final
 * do batch mais externo cada estado alterado notifica uma vez com o valor
 * final. Estados não alterados não são notificados. Batches aninhados são
 * suportados. Se `fn` lançar, as notificações ainda ocorrem e o erro sobe.
 *
 * @example
 * ```ts
 * const state = createState({ count: 0, name: 'John' })
 *
 * batch(() => {
 *   state.set({ count: 1, name: 'John' })  // não notifica
 *   state.set({ count: 2, name: 'John' })  // não notifica
 *   state.set({ count: 3, name: 'Jane' })  // não notifica
 * }) // notifica apenas uma vez aqui
 * ```
 *
 * @param fn - Função contendo as atualizações a serem agrupadas
 */
export function batch(fn: () => void): void {
  batchDepth = enterBatch(batchDepth)

  let fnError: unknown
  let fnFailed = false
  try {
    fn()
  } catch (error) {
    fnFailed = true
    fnError = error
  }

  const exit = exitBatch(batchDepth)
  batchDepth = exit.depth

  if (exit.flush) {
    try {
      flushPending()
    } catch (flushError) {
      // O erro de fn tem prioridade sobre erros de observadores
      if (!fnFailed) throw flushError
    }
  }

  if (fnFailed) throw fnError
}

/**
 * Reseta o contexto de batching (para testes)
 *
 * @internal
 */
export function __resetBatchContext(): void {
  batchDepth = 0
  pendingNotifiers = new Set()
}
