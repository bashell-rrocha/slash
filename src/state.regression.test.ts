import { describe, test, expect } from 'bun:test'
import { createState } from './state'

/**
 * Testes de regressão para garantir que refatoração FCIS não quebre comportamentos existentes
 */
describe('State - Regression Tests (FCIS)', () => {
  describe('API pública inalterada', () => {
    test('createState retorna objeto com set, get, watch', () => {
      // Arrange & Act
      const state = createState({ value: 0 })

      // Assert
      expect(typeof state.set).toBe('function')
      expect(typeof state.get).toBe('function')
      expect(typeof state.watch).toBe('function')
    })

    test('get() retorna cópia do estado, não referência', () => {
      // Arrange
      const state = createState({ nested: { value: 1 } })

      // Act
      const first = state.get()
      const second = state.get()

      // Assert
      expect(first).toEqual(second)
      expect(first).not.toBe(second) // Diferentes referências
      expect(first.nested).not.toBe(second.nested) // Deep clone
    })

    test('set() aceita novo estado completo', () => {
      // Arrange
      const state = createState({ count: 0, name: 'test' })

      // Act
      state.set({ count: 5, name: 'updated' })

      // Assert
      expect(state.get()).toEqual({ count: 5, name: 'updated' })
    })

    test('watch() retorna função de cleanup', () => {
      // Arrange
      const state = createState({ value: 0 })

      // Act
      const unwatch = state.watch(() => {})

      // Assert
      expect(typeof unwatch).toBe('function')
    })
  })

  describe('Comportamento de notificação', () => {
    test('watchers são notificados síncronamente', () => {
      // Arrange
      const state = createState({ count: 0 })
      let notifiedValue: number | undefined

      state.watch((s) => { notifiedValue = s.count })

      // Act
      state.set({ count: 42 })

      // Assert - síncrono, sem await
      expect(notifiedValue).toBe(42)
    })

    test('múltiplos watchers são todos notificados', () => {
      // Arrange
      const state = createState({ value: 0 })
      const calls: number[] = []

      state.watch((s) => calls.push(s.value))
      state.watch((s) => calls.push(s.value * 2))

      // Act
      state.set({ value: 10 })

      // Assert
      expect(calls).toEqual([10, 20])
    })

    test('watchers não são notificados se estado não mudou (deepEqual)', () => {
      // Arrange
      const state = createState({ count: 5 })
      let callCount = 0

      state.watch(() => { callCount++ })

      // Act
      state.set({ count: 5 }) // Mesmo valor

      // Assert
      expect(callCount).toBe(0)
    })

    test('watchers são notificados em mudanças nested', () => {
      // Arrange
      const state = createState({ user: { name: 'John', age: 30 } })
      let callCount = 0

      state.watch(() => { callCount++ })

      // Act
      state.set({ user: { name: 'Jane', age: 30 } })

      // Assert
      expect(callCount).toBe(1)
    })
  })

  describe('Imutabilidade', () => {
    test('mutação externa do get() não afeta estado interno', () => {
      // Arrange
      const state = createState({ value: 10 })

      // Act
      const retrieved = state.get() as any
      retrieved.value = 999

      // Assert
      expect(state.get()).toEqual({ value: 10 })
    })

    test('mutação do objeto passado para set() não afeta estado', () => {
      // Arrange
      const state = createState({ value: 0 })
      const newState = { value: 100 }

      // Act
      state.set(newState)
      newState.value = 999

      // Assert
      expect(state.get()).toEqual({ value: 100 })
    })

    test('arrays são deep clonados', () => {
      // Arrange
      const state = createState({ items: [1, 2, 3] })

      // Act
      const retrieved = state.get() as any
      retrieved.items.push(4)

      // Assert
      expect(state.get()).toEqual({ items: [1, 2, 3] })
    })

    test('objetos nested são deep clonados', () => {
      // Arrange
      const state = createState({
        user: {
          profile: { name: 'John' }
        }
      })

      // Act
      const retrieved = state.get() as any
      retrieved.user.profile.name = 'Jane'

      // Assert
      expect(state.get()).toEqual({
        user: { profile: { name: 'John' } }
      })
    })
  })

  describe('Cleanup de watchers', () => {
    test('unwatch() remove watcher', () => {
      // Arrange
      const state = createState({ value: 0 })
      let callCount = 0

      const unwatch = state.watch(() => { callCount++ })

      // Act
      state.set({ value: 1 })
      expect(callCount).toBe(1)

      unwatch()
      state.set({ value: 2 })

      // Assert
      expect(callCount).toBe(1) // Não incrementou após unwatch
    })

    test('múltiplos unwatches funcionam independentemente', () => {
      // Arrange
      const state = createState({ value: 0 })
      const calls: number[] = []

      const unwatch1 = state.watch(() => calls.push(1))
      const unwatch2 = state.watch(() => calls.push(2))

      // Act
      state.set({ value: 1 })
      expect(calls).toEqual([1, 2])

      calls.length = 0
      unwatch1()

      state.set({ value: 2 })

      // Assert
      expect(calls).toEqual([2]) // Apenas segundo watcher
    })
  })

  describe('Tipos especiais', () => {
    test('Date objects são clonados corretamente', () => {
      // Arrange
      const date = new Date('2026-01-20')
      const state = createState({ timestamp: date })

      // Act
      const retrieved = state.get() as any

      // Assert
      expect(retrieved.timestamp).toBeInstanceOf(Date)
      expect(retrieved.timestamp.getTime()).toBe(date.getTime())
      expect(retrieved.timestamp).not.toBe(date) // Clone, não referência
    })

    test('Error objects são preservados', () => {
      // Arrange
      const error = new Error('Test error')
      const state = createState({ error })

      // Act
      const retrieved = state.get() as any

      // Assert
      expect(retrieved.error).toBe(error) // Mesma referência
      expect(retrieved.error.message).toBe('Test error')
    })
  })

  describe('Integração com sistema de tracking', () => {
    test('get() notifica __SLASH_TRACK_STATE__ se existir', () => {
      // Arrange
      const tracked: any[] = []
      ;(globalThis as any).__SLASH_TRACK_STATE__ = (state: any) => {
        tracked.push(state)
      }

      const state = createState({ value: 0 })

      // Act
      state.get()

      // Assert
      expect(tracked.length).toBe(1)
      expect(tracked[0]).toBe(state)

      // Cleanup
      delete (globalThis as any).__SLASH_TRACK_STATE__
    })

    test('get() funciona sem __SLASH_TRACK_STATE__', () => {
      // Arrange
      delete (globalThis as any).__SLASH_TRACK_STATE__
      const state = createState({ value: 42 })

      // Act & Assert
      expect(() => state.get()).not.toThrow()
      expect(state.get()).toEqual({ value: 42 })
    })
  })

  describe('Edge cases', () => {
    test('estado com null é suportado', () => {
      // Arrange
      const state = createState({ value: null })

      // Act & Assert
      expect(state.get()).toEqual({ value: null })
    })

    test('estado com undefined é suportado', () => {
      // Arrange
      const state = createState({ value: undefined })

      // Act & Assert
      expect(state.get()).toEqual({ value: undefined })
    })

    test('arrays vazios são suportados', () => {
      // Arrange
      const state = createState({ items: [] })

      // Act & Assert
      expect(state.get()).toEqual({ items: [] })
    })

    test('objetos vazios são suportados', () => {
      // Arrange
      const state = createState({})

      // Act & Assert
      expect(state.get()).toEqual({})
    })

    test('watchers recebem deep clone do estado', () => {
      // Arrange
      const state = createState({ value: 0 })
      let receivedState: any = null

      state.watch((s) => { receivedState = s })

      // Act
      state.set({ value: 10 })
      receivedState.value = 999

      // Assert
      expect(state.get()).toEqual({ value: 10 })
    })
  })

  describe('Performance characteristics', () => {
    test('deep clone não compartilha referências em estruturas complexas', () => {
      // Arrange
      const state = createState({
        level1: {
          level2: {
            level3: {
              value: 'deep'
            }
          }
        }
      })

      // Act
      const first = state.get() as any
      const second = state.get() as any

      // Assert
      expect(first.level1).not.toBe(second.level1)
      expect(first.level1.level2).not.toBe(second.level1.level2)
      expect(first.level1.level2.level3).not.toBe(second.level1.level2.level3)
    })

    test('watchers não são chamados múltiplas vezes para mesmo update', () => {
      // Arrange
      const state = createState({ count: 0 })
      let callCount = 0

      state.watch(() => { callCount++ })

      // Act
      state.set({ count: 1 })

      // Assert
      expect(callCount).toBe(1)
    })
  })
})
