/**
 * Testes de Integração: Batch + State Manager
 *
 * Padrão AAA (Arrange-Act-Assert)
 * Testa integração completa entre batch updates e state management
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { createState } from './state'
import { batch, __resetBatchContext } from './batch'

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
})
