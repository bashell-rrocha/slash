/**
 * Testes para Batch API (FCIS Pattern - Imperative Shell)
 *
 * Padrão AAA (Arrange-Act-Assert)
 * Testa a API pública de batching e a fila de notificadores pendentes
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import {
  batch,
  isInBatch,
  __enqueueBatchNotify,
  __pendingBatchNotifyCount,
  __resetBatchContext
} from './batch'

describe('batch (Imperative Shell)', () => {
  beforeEach(() => {
    __resetBatchContext()
  })

  describe('isInBatch', () => {
    test('deve retornar false inicialmente', () => {
      expect(isInBatch()).toBe(false)
    })

    test('deve retornar true durante execução de batch', () => {
      let insideBatch = false
      batch(() => {
        insideBatch = isInBatch()
      })
      expect(insideBatch).toBe(true)
      expect(isInBatch()).toBe(false)
    })
  })

  describe('batch', () => {
    test('deve executar função fornecida', () => {
      let executed = false
      batch(() => {
        executed = true
      })
      expect(executed).toBe(true)
    })

    test('deve finalizar o batch mesmo com erro e relançá-lo', () => {
      const error = new Error('test error')
      expect(() => {
        batch(() => {
          throw error
        })
      }).toThrow(error)
      expect(isInBatch()).toBe(false)
    })

    test('deve rodar notificadores pendentes mesmo se fn lançar', () => {
      let calls = 0
      expect(() => {
        batch(() => {
          __enqueueBatchNotify(() => calls++)
          throw new Error('boom')
        })
      }).toThrow('boom')
      expect(calls).toBe(1)
    })
  })

  describe('__enqueueBatchNotify', () => {
    test('deve rodar o notificador uma vez no fim do batch', () => {
      let calls = 0
      const notify = () => calls++
      batch(() => {
        __enqueueBatchNotify(notify)
        __enqueueBatchNotify(notify)
        __enqueueBatchNotify(notify)
        expect(calls).toBe(0)
        expect(__pendingBatchNotifyCount()).toBe(1)
      })
      expect(calls).toBe(1)
      expect(__pendingBatchNotifyCount()).toBe(0)
    })

    test('deve rodar na ordem do primeiro enfileiramento', () => {
      const order: string[] = []
      const a = () => order.push('a')
      const b = () => order.push('b')
      batch(() => {
        __enqueueBatchNotify(a)
        __enqueueBatchNotify(b)
        __enqueueBatchNotify(a)
      })
      expect(order).toEqual(['a', 'b'])
    })

    test('batch vazio não chama nada', () => {
      let calls = 0
      batch(() => {})
      expect(calls).toBe(0)
      expect(__pendingBatchNotifyCount()).toBe(0)
    })

    test('notificador que lança não impede os demais; primeiro erro é relançado', () => {
      const order: string[] = []
      expect(() => {
        batch(() => {
          __enqueueBatchNotify(() => {
            order.push('a')
            throw new Error('first')
          })
          __enqueueBatchNotify(() => order.push('b'))
          __enqueueBatchNotify(() => {
            order.push('c')
            throw new Error('second')
          })
        })
      }).toThrow('first')
      expect(order).toEqual(['a', 'b', 'c'])
      expect(isInBatch()).toBe(false)
    })
  })

  describe('batch aninhados', () => {
    test('fim do batch interno não encerra o externo', () => {
      let afterInner = false
      batch(() => {
        batch(() => {})
        afterInner = isInBatch()
      })
      expect(afterInner).toBe(true)
      expect(isInBatch()).toBe(false)
    })

    test('notificadores só rodam no fim do batch externo', () => {
      const log: string[] = []
      batch(() => {
        batch(() => {
          __enqueueBatchNotify(() => log.push('notify'))
        })
        log.push('after inner')
      })
      expect(log).toEqual(['after inner', 'notify'])
    })
  })
})
