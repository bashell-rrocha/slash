/**
 * FUNCTIONAL CORE: Batch Updates (FCIS pattern)
 *
 * Este módulo implementa o sistema de batch updates para otimizar
 * múltiplas atualizações de estado, agrupando-as em uma única notificação.
 *
 * Funções puras, testáveis sem side effects.
 */

import type { State } from './state'

/**
 * Status de batching
 */
export type BatchStatus =
  | { type: 'IDLE' }
  | { type: 'BATCHING', pendingUpdates: number }

/**
 * Comando de batch operation
 */
export type BatchCommand =
  | { type: 'START_BATCH' }
  | { type: 'END_BATCH' }
  | { type: 'RECORD_UPDATE' }
  | { type: 'NO_OP' }

/**
 * Contexto de batching imutável
 */
export interface BatchContext {
  readonly status: BatchStatus
}

/**
 * Cria um novo contexto de batching
 * PURE FUNCTION
 */
export function createBatchContext(): BatchContext {
  return {
    status: { type: 'IDLE' }
  }
}

/**
 * Determina o comando a ser executado baseado no estado atual
 * PURE FUNCTION
 */
export function computeBatchCommand(
  context: BatchContext,
  action: 'start' | 'end' | 'update'
): BatchCommand {
  const { status } = context

  switch (action) {
    case 'start':
      return status.type === 'IDLE'
        ? { type: 'START_BATCH' }
        : { type: 'NO_OP' }

    case 'end':
      return status.type === 'BATCHING'
        ? { type: 'END_BATCH' }
        : { type: 'NO_OP' }

    case 'update':
      return status.type === 'BATCHING'
        ? { type: 'RECORD_UPDATE' }
        : { type: 'NO_OP' }
  }
}

/**
 * Aplica comando de batch ao contexto
 * PURE FUNCTION - Retorna novo contexto
 */
export function applyBatchCommand(
  context: BatchContext,
  command: BatchCommand
): BatchContext {
  switch (command.type) {
    case 'START_BATCH':
      return {
        status: { type: 'BATCHING', pendingUpdates: 0 }
      }

    case 'RECORD_UPDATE':
      if (context.status.type !== 'BATCHING') {
        return context
      }
      return {
        status: {
          type: 'BATCHING',
          pendingUpdates: context.status.pendingUpdates + 1
        }
      }

    case 'END_BATCH':
      return {
        status: { type: 'IDLE' }
      }

    case 'NO_OP':
      return context

    default: {
      const exhaustiveCheck: never = command
      throw new Error(`Unhandled command type: ${exhaustiveCheck}`)
    }
  }
}

/**
 * Verifica se está em modo batch
 * PURE FUNCTION
 */
export function isBatching(context: BatchContext): boolean {
  return context.status.type === 'BATCHING'
}

/**
 * Obtém número de updates pendentes
 * PURE FUNCTION
 */
export function getPendingUpdates(context: BatchContext): number {
  return context.status.type === 'BATCHING'
    ? context.status.pendingUpdates
    : 0
}

/**
 * Verifica se deve notificar watchers após batch
 * PURE FUNCTION
 */
export function shouldNotifyAfterBatch(context: BatchContext): boolean {
  return context.status.type === 'BATCHING' && context.status.pendingUpdates > 0
}
