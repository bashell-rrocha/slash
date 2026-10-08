/**
 * IMPERATIVE SHELL: Batch Updates API
 *
 * Fornece API pública para agrupar múltiplas atualizações de estado,
 * executando notificações apenas uma vez ao final do batch.
 */

import {
  createBatchContext,
  computeBatchCommand,
  applyBatchCommand,
  isBatching,
  shouldNotifyAfterBatch,
  type BatchContext
} from './batch-core'

/**
 * Contexto global de batching (singleton)
 */
let globalBatchContext: BatchContext = createBatchContext()

/**
 * Callbacks que serão executados quando batch finalizar
 */
const batchEndCallbacks = new Set<() => void>()

/**
 * Adiciona callback para ser executado ao finalizar batch
 * Usado internamente pelo state manager
 *
 * @internal
 */
export function __addBatchEndCallback(callback: () => void): void {
  batchEndCallbacks.add(callback)
}

/**
 * Remove callback de batch end
 * Usado internamente pelo state manager (cleanup)
 *
 * @internal
 */
export function __removeBatchEndCallback(callback: () => void): void {
  batchEndCallbacks.delete(callback)
}

/**
 * Verifica se está atualmente em modo batch
 *
 * @returns true se está batching
 */
export function isInBatch(): boolean {
  return isBatching(globalBatchContext)
}

/**
 * Agrupa múltiplas atualizações de estado em um batch
 *
 * Durante a execução da função, todas as atualizações de estado
 * são acumuladas e notificam watchers apenas uma vez ao final.
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
  // 1. FUNCTIONAL CORE: Computar comando de início
  const startCommand = computeBatchCommand(globalBatchContext, 'start')

  // 2. FUNCTIONAL CORE: Aplicar comando
  globalBatchContext = applyBatchCommand(globalBatchContext, startCommand)

  try {
    // 3. IMPERATIVE SHELL: Executar função do usuário (side effects)
    fn()
  } finally {
    // 4. FUNCTIONAL CORE: Verificar se deve notificar
    const shouldNotify = shouldNotifyAfterBatch(globalBatchContext)

    // 5. FUNCTIONAL CORE: Computar comando de fim
    const endCommand = computeBatchCommand(globalBatchContext, 'end')

    // 6. FUNCTIONAL CORE: Aplicar comando
    globalBatchContext = applyBatchCommand(globalBatchContext, endCommand)

    // 7. IMPERATIVE SHELL: Side effect de notificação (se necessário)
    if (shouldNotify) {
      for (const callback of batchEndCallbacks) {
        callback()
      }
    }
  }
}

/**
 * Registra um update durante batch
 * Usado internamente pelo state manager
 *
 * @internal
 */
export function __recordBatchUpdate(): void {
  // 1. FUNCTIONAL CORE: Computar comando de update
  const command = computeBatchCommand(globalBatchContext, 'update')

  // 2. FUNCTIONAL CORE: Aplicar comando
  globalBatchContext = applyBatchCommand(globalBatchContext, command)
}

/**
 * Reseta o contexto de batching (para testes)
 *
 * @internal
 */
export function __resetBatchContext(): void {
  globalBatchContext = createBatchContext()
  batchEndCallbacks.clear()
}
