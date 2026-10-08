/**
 * Testes para Batch API (FCIS Pattern - Imperative Shell)
 *
 * Padrão AAA (Arrange-Act-Assert)
 * Testa a API pública de batching integrada com state management
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import {
  batch,
  isInBatch,
  __recordBatchUpdate,
  __addBatchEndCallback,
  __removeBatchEndCallback,
  __resetBatchContext
} from './batch'

describe('batch (Imperative Shell)', () => {
  beforeEach(() => {
    // Resetar contexto antes de cada teste
    __resetBatchContext()
  })

  describe('isInBatch', () => {
    test('deve retornar false inicialmente', () => {
      // Arrange & Act & Assert
      expect(isInBatch()).toBe(false)
    })

    test('deve retornar true durante execução de batch', () => {
      // Arrange
      let insideBatch = false

      // Act
      batch(() => {
        insideBatch = isInBatch()
      })

      // Assert
      expect(insideBatch).toBe(true)
      expect(isInBatch()).toBe(false) // após batch
    })

    test('deve retornar false após batch finalizar', () => {
      // Arrange & Act
      batch(() => {
        // dentro do batch
      })

      // Assert
      expect(isInBatch()).toBe(false)
    })
  })

  describe('batch', () => {
    test('deve executar função fornecida', () => {
      // Arrange
      let executed = false

      // Act
      batch(() => {
        executed = true
      })

      // Assert
      expect(executed).toBe(true)
    })

    test('deve executar finally mesmo com erro', () => {
      // Arrange
      const error = new Error('test error')

      // Act & Assert
      expect(() => {
        batch(() => {
          throw error
        })
      }).toThrow(error)

      // Assert: deve ter finalizado batch (voltou para IDLE)
      expect(isInBatch()).toBe(false)
    })

    test('deve chamar callback se houver updates', () => {
      // Arrange
      let callbackCalled = false
      __addBatchEndCallback(() => {
        callbackCalled = true
      })

      // Act
      batch(() => {
        __recordBatchUpdate()
        __recordBatchUpdate()
      })

      // Assert
      expect(callbackCalled).toBe(true)
    })

    test('não deve chamar callback se não houver updates', () => {
      // Arrange
      let callbackCalled = false
      __addBatchEndCallback(() => {
        callbackCalled = true
      })

      // Act
      batch(() => {
        // sem updates
      })

      // Assert
      expect(callbackCalled).toBe(false)
    })

    test('deve funcionar sem callback configurado', () => {
      // Arrange & Act
      expect(() => {
        batch(() => {
          __recordBatchUpdate()
        })
      }).not.toThrow()
    })

    test('deve acumular múltiplos updates', () => {
      // Arrange
      let callCount = 0
      __addBatchEndCallback(() => {
        callCount++
      })

      // Act
      batch(() => {
        __recordBatchUpdate()
        __recordBatchUpdate()
        __recordBatchUpdate()
      })

      // Assert
      expect(callCount).toBe(1) // apenas uma notificação
    })
  })

  describe('batch aninhados', () => {
    test('deve ignorar batch aninhado (não suportado)', () => {
      // Arrange
      let outerBatching = false
      let innerBatching = false

      // Act
      batch(() => {
        outerBatching = isInBatch()
        batch(() => {
          innerBatching = isInBatch()
        })
      })

      // Assert
      expect(outerBatching).toBe(true)
      expect(innerBatching).toBe(true) // ainda no batch externo
    })
  })

  describe('__recordBatchUpdate', () => {
    test('deve ser ignorado fora de batch', () => {
      // Arrange & Act
      __recordBatchUpdate()
      __recordBatchUpdate()

      // Assert
      expect(isInBatch()).toBe(false)
    })

    test('deve ser contado dentro de batch', () => {
      // Arrange
      let callbackCalled = false
      __addBatchEndCallback(() => {
        callbackCalled = true
      })

      // Act
      batch(() => {
        __recordBatchUpdate()
      })

      // Assert
      expect(callbackCalled).toBe(true)
    })
  })

  describe('fluxo completo de batching', () => {
    test('deve simular uso real com múltiplas operações', () => {
      // Arrange
      const notifications: string[] = []
      __addBatchEndCallback(() => {
        notifications.push('batch-end')
      })

      // Act: Operações fora de batch
      __recordBatchUpdate() // ignorado (fora de batch)

      // Act: Operações dentro de batch
      batch(() => {
        __recordBatchUpdate() // contado
        __recordBatchUpdate() // contado
        __recordBatchUpdate() // contado
      })

      // Assert
      expect(notifications).toEqual(['batch-end'])
    })

    test('deve resetar estado após cada batch', () => {
      // Arrange
      let callCount = 0
      __addBatchEndCallback(() => {
        callCount++
      })

      // Act: Primeiro batch
      batch(() => {
        __recordBatchUpdate()
      })

      // Act: Segundo batch
      batch(() => {
        __recordBatchUpdate()
      })

      // Assert: Dois batches independentes
      expect(callCount).toBe(2)
    })
  })
})
