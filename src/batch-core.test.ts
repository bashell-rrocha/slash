/**
 * Testes para Batch Core (FCIS Pattern - Functional Core)
 *
 * Padrão AAA (Arrange-Act-Assert)
 * Todas as funções são puras, não precisam de mocks
 */

import { describe, test, expect } from 'bun:test'
import {
  createBatchContext,
  computeBatchCommand,
  applyBatchCommand,
  isBatching,
  getPendingUpdates,
  shouldNotifyAfterBatch,
  type BatchContext,
  type BatchCommand
} from './batch-core'

describe('batch-core', () => {
  describe('createBatchContext', () => {
    test('deve criar contexto inicial em IDLE', () => {
      // Arrange & Act
      const context = createBatchContext()

      // Assert
      expect(context.status.type).toBe('IDLE')
    })
  })

  describe('computeBatchCommand', () => {
    describe('ação: start', () => {
      test('deve retornar START_BATCH quando status é IDLE', () => {
        // Arrange
        const context = createBatchContext()

        // Act
        const command = computeBatchCommand(context, 'start')

        // Assert
        expect(command.type).toBe('START_BATCH')
      })

      test('deve retornar NO_OP quando já está em BATCHING', () => {
        // Arrange
        const context: BatchContext = {
          status: { type: 'BATCHING', pendingUpdates: 2 }
        }

        // Act
        const command = computeBatchCommand(context, 'start')

        // Assert
        expect(command.type).toBe('NO_OP')
      })
    })

    describe('ação: end', () => {
      test('deve retornar END_BATCH quando status é BATCHING', () => {
        // Arrange
        const context: BatchContext = {
          status: { type: 'BATCHING', pendingUpdates: 3 }
        }

        // Act
        const command = computeBatchCommand(context, 'end')

        // Assert
        expect(command.type).toBe('END_BATCH')
      })

      test('deve retornar NO_OP quando status é IDLE', () => {
        // Arrange
        const context = createBatchContext()

        // Act
        const command = computeBatchCommand(context, 'end')

        // Assert
        expect(command.type).toBe('NO_OP')
      })
    })

    describe('ação: update', () => {
      test('deve retornar RECORD_UPDATE quando status é BATCHING', () => {
        // Arrange
        const context: BatchContext = {
          status: { type: 'BATCHING', pendingUpdates: 1 }
        }

        // Act
        const command = computeBatchCommand(context, 'update')

        // Assert
        expect(command.type).toBe('RECORD_UPDATE')
      })

      test('deve retornar NO_OP quando status é IDLE', () => {
        // Arrange
        const context = createBatchContext()

        // Act
        const command = computeBatchCommand(context, 'update')

        // Assert
        expect(command.type).toBe('NO_OP')
      })
    })
  })

  describe('applyBatchCommand', () => {
    describe('comando: START_BATCH', () => {
      test('deve transicionar de IDLE para BATCHING com 0 updates', () => {
        // Arrange
        const context = createBatchContext()
        const command: BatchCommand = { type: 'START_BATCH' }

        // Act
        const newContext = applyBatchCommand(context, command)

        // Assert
        expect(newContext.status.type).toBe('BATCHING')
        expect(newContext.status.type === 'BATCHING' && newContext.status.pendingUpdates).toBe(0)
      })

      test('não deve modificar contexto original (imutabilidade)', () => {
        // Arrange
        const context = createBatchContext()
        const command: BatchCommand = { type: 'START_BATCH' }

        // Act
        applyBatchCommand(context, command)

        // Assert
        expect(context.status.type).toBe('IDLE')
      })
    })

    describe('comando: RECORD_UPDATE', () => {
      test('deve incrementar pendingUpdates quando em BATCHING', () => {
        // Arrange
        const context: BatchContext = {
          status: { type: 'BATCHING', pendingUpdates: 2 }
        }
        const command: BatchCommand = { type: 'RECORD_UPDATE' }

        // Act
        const newContext = applyBatchCommand(context, command)

        // Assert
        expect(newContext.status.type).toBe('BATCHING')
        expect(newContext.status.type === 'BATCHING' && newContext.status.pendingUpdates).toBe(3)
      })

      test('deve retornar mesmo contexto quando status não é BATCHING', () => {
        // Arrange
        const context = createBatchContext()
        const command: BatchCommand = { type: 'RECORD_UPDATE' }

        // Act
        const newContext = applyBatchCommand(context, command)

        // Assert
        expect(newContext).toBe(context)
      })

      test('deve acumular múltiplos updates', () => {
        // Arrange
        let context: BatchContext = {
          status: { type: 'BATCHING', pendingUpdates: 0 }
        }
        const command: BatchCommand = { type: 'RECORD_UPDATE' }

        // Act
        context = applyBatchCommand(context, command)
        context = applyBatchCommand(context, command)
        context = applyBatchCommand(context, command)

        // Assert
        expect(context.status.type === 'BATCHING' && context.status.pendingUpdates).toBe(3)
      })
    })

    describe('comando: END_BATCH', () => {
      test('deve transicionar de BATCHING para IDLE', () => {
        // Arrange
        const context: BatchContext = {
          status: { type: 'BATCHING', pendingUpdates: 5 }
        }
        const command: BatchCommand = { type: 'END_BATCH' }

        // Act
        const newContext = applyBatchCommand(context, command)

        // Assert
        expect(newContext.status.type).toBe('IDLE')
      })

      test('deve resetar pendingUpdates ao finalizar', () => {
        // Arrange
        const context: BatchContext = {
          status: { type: 'BATCHING', pendingUpdates: 10 }
        }
        const command: BatchCommand = { type: 'END_BATCH' }

        // Act
        const newContext = applyBatchCommand(context, command)

        // Assert
        expect(newContext.status.type).toBe('IDLE')
      })
    })

    describe('comando: NO_OP', () => {
      test('deve retornar mesmo contexto', () => {
        // Arrange
        const context = createBatchContext()
        const command: BatchCommand = { type: 'NO_OP' }

        // Act
        const newContext = applyBatchCommand(context, command)

        // Assert
        expect(newContext).toBe(context)
      })
    })

    describe('exhaustive checking', () => {
      test('deve lançar erro para comando desconhecido', () => {
        // Arrange
        const context = createBatchContext()
        const command = { type: 'UNKNOWN' } as any

        // Act & Assert
        expect(() => applyBatchCommand(context, command)).toThrow()
      })
    })
  })

  describe('isBatching', () => {
    test('deve retornar true quando status é BATCHING', () => {
      // Arrange
      const context: BatchContext = {
        status: { type: 'BATCHING', pendingUpdates: 1 }
      }

      // Act
      const result = isBatching(context)

      // Assert
      expect(result).toBe(true)
    })

    test('deve retornar false quando status é IDLE', () => {
      // Arrange
      const context = createBatchContext()

      // Act
      const result = isBatching(context)

      // Assert
      expect(result).toBe(false)
    })
  })

  describe('getPendingUpdates', () => {
    test('deve retornar número de updates quando em BATCHING', () => {
      // Arrange
      const context: BatchContext = {
        status: { type: 'BATCHING', pendingUpdates: 7 }
      }

      // Act
      const result = getPendingUpdates(context)

      // Assert
      expect(result).toBe(7)
    })

    test('deve retornar 0 quando status é IDLE', () => {
      // Arrange
      const context = createBatchContext()

      // Act
      const result = getPendingUpdates(context)

      // Assert
      expect(result).toBe(0)
    })
  })

  describe('shouldNotifyAfterBatch', () => {
    test('deve retornar true quando em BATCHING com updates pendentes', () => {
      // Arrange
      const context: BatchContext = {
        status: { type: 'BATCHING', pendingUpdates: 3 }
      }

      // Act
      const result = shouldNotifyAfterBatch(context)

      // Assert
      expect(result).toBe(true)
    })

    test('deve retornar false quando em BATCHING mas sem updates', () => {
      // Arrange
      const context: BatchContext = {
        status: { type: 'BATCHING', pendingUpdates: 0 }
      }

      // Act
      const result = shouldNotifyAfterBatch(context)

      // Assert
      expect(result).toBe(false)
    })

    test('deve retornar false quando status é IDLE', () => {
      // Arrange
      const context = createBatchContext()

      // Act
      const result = shouldNotifyAfterBatch(context)

      // Assert
      expect(result).toBe(false)
    })
  })

  describe('fluxo completo de batching', () => {
    test('deve simular ciclo completo: start -> updates -> end', () => {
      // Arrange
      let context = createBatchContext()

      // Act: Iniciar batch
      let command = computeBatchCommand(context, 'start')
      context = applyBatchCommand(context, command)

      // Assert: Status deve ser BATCHING
      expect(isBatching(context)).toBe(true)
      expect(getPendingUpdates(context)).toBe(0)

      // Act: Registrar 3 updates
      command = computeBatchCommand(context, 'update')
      context = applyBatchCommand(context, command)
      command = computeBatchCommand(context, 'update')
      context = applyBatchCommand(context, command)
      command = computeBatchCommand(context, 'update')
      context = applyBatchCommand(context, command)

      // Assert: Deve ter 3 updates pendentes
      expect(getPendingUpdates(context)).toBe(3)
      expect(shouldNotifyAfterBatch(context)).toBe(true)

      // Act: Finalizar batch
      command = computeBatchCommand(context, 'end')
      context = applyBatchCommand(context, command)

      // Assert: Deve voltar para IDLE
      expect(isBatching(context)).toBe(false)
      expect(getPendingUpdates(context)).toBe(0)
    })

    test('deve ignorar updates fora de batch', () => {
      // Arrange
      let context = createBatchContext()

      // Act: Tentar registrar update sem iniciar batch
      let command = computeBatchCommand(context, 'update')
      context = applyBatchCommand(context, command)

      // Assert: Deve permanecer IDLE e sem updates
      expect(isBatching(context)).toBe(false)
      expect(getPendingUpdates(context)).toBe(0)
    })

    test('deve ignorar múltiplos starts consecutivos', () => {
      // Arrange
      let context = createBatchContext()

      // Act: Iniciar batch duas vezes
      let command = computeBatchCommand(context, 'start')
      context = applyBatchCommand(context, command)
      command = computeBatchCommand(context, 'start')
      const newContext = applyBatchCommand(context, command)

      // Assert: Segundo start deve ser NO_OP
      expect(newContext).toBe(context)
      expect(isBatching(newContext)).toBe(true)
    })
  })
})
