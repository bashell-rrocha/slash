/**
 * Testes de Integração: Batch + State Manager
 *
 * Padrão AAA (Arrange-Act-Assert)
 * Testa integração completa entre batch updates e state management
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { createState } from './state'
import { batch, isInBatch, __pendingBatchNotifyCount, __resetBatchContext } from './batch'

describe('batch + state integration', () => {
  beforeEach(() => {
    __resetBatchContext()
  })

  describe('batching sem watchers', () => {
    test('deve permitir múltiplos sets em batch', () => {
      // Arrange
      const state = createState({ count: 0 })

      // Act
      batch(() => {
        state.set({ count: 1 })
        state.set({ count: 2 })
        state.set({ count: 3 })
      })

      // Assert
      expect(state.get().count).toBe(3)
    })

    test('deve atualizar estado mesmo em batch', () => {
      // Arrange
      const state = createState({ value: 'initial' })

      // Act & Assert
      batch(() => {
        state.set({ value: 'updated' })
        expect(state.get().value).toBe('updated')
      })
    })
  })

  describe('batching com watchers', () => {
    test('deve notificar watchers apenas uma vez ao finalizar batch', () => {
      // Arrange
      const state = createState({ count: 0 })
      const notifications: number[] = []

      state.watch((s) => {
        notifications.push(s.count)
      })

      // Act
      batch(() => {
        state.set({ count: 1 }) // não notifica
        state.set({ count: 2 }) // não notifica
        state.set({ count: 3 }) // não notifica
      }) // notifica aqui com valor final

      // Assert
      expect(notifications).toEqual([3])
    })

    test('deve notificar múltiplos watchers em batch', () => {
      // Arrange
      const state = createState({ value: 'initial' })
      const calls1: string[] = []
      const calls2: string[] = []

      state.watch((s) => calls1.push(s.value))
      state.watch((s) => calls2.push(s.value))

      // Act
      batch(() => {
        state.set({ value: 'a' })
        state.set({ value: 'b' })
      })

      // Assert
      expect(calls1).toEqual(['b'])
      expect(calls2).toEqual(['b'])
    })

    test('não deve notificar se não houver mudanças em batch', () => {
      // Arrange
      const state = createState({ count: 0 })
      const notifications: number[] = []

      state.watch((s) => {
        notifications.push(s.count)
      })

      // Act
      batch(() => {
        state.set({ count: 0 }) // sem mudança
        state.set({ count: 0 }) // sem mudança
      })

      // Assert
      expect(notifications).toEqual([])
    })

    test('deve notificar com valor final mesmo se voltar ao inicial', () => {
      // Arrange
      const state = createState({ count: 0 })
      const notifications: number[] = []

      state.watch((s) => {
        notifications.push(s.count)
      })

      // Act
      batch(() => {
        state.set({ count: 1 })
        state.set({ count: 2 })
        state.set({ count: 0 }) // volta ao inicial
      })

      // Assert: Notifica porque houve mudanças intermediárias
      expect(notifications).toEqual([0])
    })
  })

  describe('batching com múltiplos states', () => {
    test('deve batchear atualizações de múltiplos states', () => {
      // Arrange
      const state1 = createState({ value: 'a' })
      const state2 = createState({ value: 'b' })

      const notifications1: string[] = []
      const notifications2: string[] = []

      state1.watch((s) => notifications1.push(s.value))
      state2.watch((s) => notifications2.push(s.value))

      // Act
      batch(() => {
        state1.set({ value: 'x' })
        state2.set({ value: 'y' })
        state1.set({ value: 'z' })
      })

      // Assert
      expect(notifications1).toEqual(['z'])
      expect(notifications2).toEqual(['y'])
    })
  })

  describe('comparação: com batch vs sem batch', () => {
    test('sem batch: notifica a cada set', () => {
      // Arrange
      const state = createState({ count: 0 })
      const notifications: number[] = []

      state.watch((s) => {
        notifications.push(s.count)
      })

      // Act
      state.set({ count: 1 })
      state.set({ count: 2 })
      state.set({ count: 3 })

      // Assert
      expect(notifications).toEqual([1, 2, 3])
    })

    test('com batch: notifica apenas uma vez', () => {
      // Arrange
      const state = createState({ count: 0 })
      const notifications: number[] = []

      state.watch((s) => {
        notifications.push(s.count)
      })

      // Act
      batch(() => {
        state.set({ count: 1 })
        state.set({ count: 2 })
        state.set({ count: 3 })
      })

      // Assert
      expect(notifications).toEqual([3])
    })
  })

  describe('erro handling em batch', () => {
    test('deve finalizar batch mesmo com erro', () => {
      // Arrange
      const state = createState({ count: 0 })
      const notifications: number[] = []

      state.watch((s) => {
        notifications.push(s.count)
      })

      // Act
      try {
        batch(() => {
          state.set({ count: 1 })
          throw new Error('test error')
        })
      } catch (e) {
        // esperado
      }

      // Assert: deve ter notificado mesmo com erro
      expect(notifications).toEqual([1])
    })

    test('estado deve ser atualizado mesmo com erro em batch', () => {
      // Arrange
      const state = createState({ count: 0 })

      // Act
      try {
        batch(() => {
          state.set({ count: 5 })
          throw new Error('test error')
        })
      } catch (e) {
        // esperado
      }

      // Assert
      expect(state.get().count).toBe(5)
    })
  })

  describe('batches sequenciais', () => {
    test('deve resetar entre batches', () => {
      // Arrange
      const state = createState({ count: 0 })
      const notifications: number[] = []

      state.watch((s) => {
        notifications.push(s.count)
      })

      // Act: Primeiro batch
      batch(() => {
        state.set({ count: 1 })
        state.set({ count: 2 })
      })

      // Act: Segundo batch
      batch(() => {
        state.set({ count: 3 })
        state.set({ count: 4 })
      })

      // Assert: Duas notificações (uma por batch)
      expect(notifications).toEqual([2, 4])
    })
  })

  describe('casos de uso reais', () => {
    test('deve otimizar múltiplas atualizações de formulário', () => {
      // Arrange
      const formState = createState({
        name: '',
        email: '',
        age: 0,
        terms: false
      })

      let renderCount = 0
      formState.watch(() => {
        renderCount++
      })

      // Act: Simular preenchimento de formulário
      batch(() => {
        formState.set({ ...formState.get(), name: 'John' })
        formState.set({ ...formState.get(), email: 'john@example.com' })
        formState.set({ ...formState.get(), age: 25 })
        formState.set({ ...formState.get(), terms: true })
      })

      // Assert: Apenas 1 render (ao invés de 4)
      expect(renderCount).toBe(1)
      expect(formState.get()).toEqual({
        name: 'John',
        email: 'john@example.com',
        age: 25,
        terms: true
      })
    })

    test('deve otimizar updates em lista', () => {
      // Arrange
      const listState = createState({ items: [] as number[] })
      let renderCount = 0

      listState.watch(() => {
        renderCount++
      })

      // Act: Adicionar múltiplos items
      batch(() => {
        for (let i = 1; i <= 10; i++) {
          listState.set({ items: [...listState.get().items, i] })
        }
      })

      // Assert: Apenas 1 render (ao invés de 10)
      expect(renderCount).toBe(1)
      expect(listState.get().items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })
  })

  describe('semântica de estados alterados', () => {
    test('estado não alterado no lote não é notificado', () => {
      const a = createState({ n: 0 })
      const b = createState({ n: 0 })
      let na = 0
      let nb = 0
      a.watch(() => na++)
      b.watch(() => nb++)

      batch(() => {
        a.set({ n: 1 })
      })

      expect(na).toBe(1)
      expect(nb).toBe(0)
    })

    test('lotes aninhados notificam uma única vez no fim do externo', () => {
      const a = createState(0)
      const log: unknown[] = []
      a.watch((v) => log.push(v))

      batch(() => {
        batch(() => {
          a.set(1)
        })
        log.push('after inner')
        a.set(2)
        a.set(3)
        log.push('end outer body')
      })

      expect(log).toEqual(['after inner', 'end outer body', 3])
    })

    test('fim do lote interno não encerra o lote externo', () => {
      batch(() => {
        batch(() => {})
        expect(isInBatch()).toBe(true)
      })
      expect(isInBatch()).toBe(false)
    })

    test('valor final é entregue uma vez por estado', () => {
      const a = createState(0)
      const b = createState('x')
      const seenA: number[] = []
      const seenB: string[] = []
      a.watch((v) => seenA.push(v))
      b.watch((v) => seenB.push(v))

      batch(() => {
        a.set(1)
        b.set('y')
        a.set(2)
        b.set('z')
        a.set(3)
      })

      expect(seenA).toEqual([3])
      expect(seenB).toEqual(['z'])
    })

    test('exceção em fn: estados alterados ainda são notificados e a exceção sobe', () => {
      const a = createState(0)
      const seen: number[] = []
      a.watch((v) => seen.push(v))

      expect(() => {
        batch(() => {
          a.set(5)
          throw new Error('boom')
        })
      }).toThrow('boom')

      expect(seen).toEqual([5])
      expect(isInBatch()).toBe(false)
    })

    test('observador que altera outro estado durante o flush não perde a notificação', () => {
      const a = createState(0)
      const b = createState(0)
      const seenB: number[] = []
      a.watch((v) => b.set(v * 10))
      b.watch((v) => seenB.push(v))

      batch(() => {
        a.set(1)
      })

      expect(seenB).toEqual([10])
      expect(b.get()).toBe(10)
    })

    test('observador que lança não impede os demais e o erro é relançado (flush)', () => {
      const a = createState(0)
      const b = createState(0)
      let nb = 0
      a.watch(() => {
        throw new Error('w')
      })
      b.watch(() => nb++)

      expect(() => {
        batch(() => {
          a.set(1)
          b.set(1)
        })
      }).toThrow('w')

      expect(nb).toBe(1)
      expect(isInBatch()).toBe(false)
    })

    test('observador que lança não impede os demais fora de lote', () => {
      const a = createState(0)
      const order: string[] = []
      a.watch(() => {
        order.push('first')
        throw new Error('w1')
      })
      a.watch(() => order.push('second'))

      expect(() => a.set(1)).toThrow('w1')
      expect(order).toEqual(['first', 'second'])
    })

    test('createState não mantém registro global', () => {
      let calls = 0
      const first = createState(0)
      first.watch(() => calls++)
      for (let i = 0; i < 10_000; i++) createState(i)

      batch(() => {})

      expect(__pendingBatchNotifyCount()).toBe(0)
      expect(calls).toBe(0)
    })
  })
})
