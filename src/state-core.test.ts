import { describe, test, expect } from 'bun:test'
import {
  deepClone,
  deepEqual,
  computeStateUpdate,
  applyStateCommand,
  shouldNotifyWatchers
} from './state-core'

/**
 * Testes do FUNCTIONAL CORE - Apenas funções puras, sem side effects
 */
describe('State Core - FCIS Pattern', () => {
  describe('deepClone', () => {
    test('clona primitivos corretamente', () => {
      // Arrange & Act & Assert
      expect(deepClone(42)).toBe(42)
      expect(deepClone('test')).toBe('test')
      expect(deepClone(true)).toBe(true)
      expect(deepClone(null)).toBe(null)
      expect(deepClone(undefined)).toBe(undefined)
    })

    test('clona objetos simples', () => {
      // Arrange
      const obj = { a: 1, b: 2 }

      // Act
      const cloned = deepClone(obj)

      // Assert
      expect(cloned).toEqual(obj)
      expect(cloned).not.toBe(obj)
    })

    test('clona objetos nested sem compartilhar referências', () => {
      // Arrange
      const obj = { a: { b: { c: 1 } } }

      // Act
      const cloned = deepClone(obj)

      // Assert
      expect(cloned).toEqual(obj)
      expect(cloned).not.toBe(obj)
      expect(cloned.a).not.toBe(obj.a)
      expect(cloned.a.b).not.toBe(obj.a.b)
    })

    test('clona arrays sem compartilhar referências', () => {
      // Arrange
      const arr = [1, 2, [3, 4]]

      // Act
      const cloned = deepClone(arr)

      // Assert
      expect(cloned).toEqual(arr)
      expect(cloned).not.toBe(arr)
      expect(cloned[2]).not.toBe(arr[2])
    })

    test('preserva Date objects como nova instância', () => {
      // Arrange
      const date = new Date('2026-01-20')

      // Act
      const cloned = deepClone(date)

      // Assert
      expect(cloned).toBeInstanceOf(Date)
      expect(cloned.getTime()).toBe(date.getTime())
      expect(cloned).not.toBe(date)
    })

    test('preserva Error objects por referência', () => {
      // Arrange
      const error = new Error('test')

      // Act
      const cloned = deepClone(error)

      // Assert
      expect(cloned).toBe(error) // Mesma referência
    })
  })

  describe('deepEqual', () => {
    test('compara primitivos corretamente', () => {
      // Assert
      expect(deepEqual(1, 1)).toBe(true)
      expect(deepEqual('a', 'a')).toBe(true)
      expect(deepEqual(true, true)).toBe(true)
      expect(deepEqual(1, 2)).toBe(false)
      expect(deepEqual('a', 'b')).toBe(false)
    })

    test('compara objetos simples', () => {
      // Assert
      expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true)
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false)
      expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false)
    })

    test('compara objetos nested', () => {
      // Assert
      expect(deepEqual(
        { a: { b: { c: 1 } } },
        { a: { b: { c: 1 } } }
      )).toBe(true)

      expect(deepEqual(
        { a: { b: { c: 1 } } },
        { a: { b: { c: 2 } } }
      )).toBe(false)
    })

    test('compara arrays', () => {
      // Assert
      expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true)
      expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false)
      expect(deepEqual([1, 2], [1, 2, 3])).toBe(false)
    })

    test('compara Date objects por timestamp', () => {
      // Arrange
      const date1 = new Date('2026-01-20')
      const date2 = new Date('2026-01-20')
      const date3 = new Date('2026-01-21')

      // Assert
      expect(deepEqual(date1, date2)).toBe(true)
      expect(deepEqual(date1, date3)).toBe(false)
    })

    test('compara Error objects por referência', () => {
      // Arrange
      const error1 = new Error('test')
      const error2 = new Error('test')

      // Assert
      expect(deepEqual(error1, error1)).toBe(true)
      expect(deepEqual(error1, error2)).toBe(false)
    })

    test('detecta diferença entre array e não-array', () => {
      // Assert
      expect(deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(false)
    })
  })

  describe('computeStateUpdate', () => {
    test('retorna NO_CHANGE quando estados são iguais', () => {
      // Arrange
      const current = { count: 5 }
      const newState = { count: 5 }

      // Act
      const command = computeStateUpdate(current, newState)

      // Assert
      expect(command.type).toBe('NO_CHANGE')
    })

    test('retorna UPDATE quando estados diferem', () => {
      // Arrange
      const current = { count: 5 }
      const newState = { count: 10 }

      // Act
      const command = computeStateUpdate(current, newState)

      // Assert
      expect(command.type).toBe('UPDATE')
      if (command.type === 'UPDATE') {
        expect(command.oldState).toBe(current)
        expect(command.newState).toEqual({ count: 10 })
        expect(command.newState).not.toBe(newState) // Clonado
      }
    })

    test('detecta mudanças em objetos nested', () => {
      // Arrange
      const current = { user: { name: 'John' } }
      const newState = { user: { name: 'Jane' } }

      // Act
      const command = computeStateUpdate(current, newState)

      // Assert
      expect(command.type).toBe('UPDATE')
    })

    test('detecta mudanças em arrays', () => {
      // Arrange
      const current = { items: [1, 2, 3] }
      const newState = { items: [1, 2, 4] }

      // Act
      const command = computeStateUpdate(current, newState)

      // Assert
      expect(command.type).toBe('UPDATE')
    })

    test('é uma função pura (múltiplas chamadas, mesmo resultado)', () => {
      // Arrange
      const current = { value: 1 }
      const newState = { value: 2 }

      // Act
      const command1 = computeStateUpdate(current, newState)
      const command2 = computeStateUpdate(current, newState)

      // Assert
      expect(command1.type).toBe(command2.type)
      if (command1.type === 'UPDATE' && command2.type === 'UPDATE') {
        expect(command1.newState).toEqual(command2.newState)
      }
    })

    test('não modifica inputs (imutabilidade)', () => {
      // Arrange
      const current = { value: 1 }
      const newState = { value: 2 }
      const currentCopy = { ...current }
      const newStateCopy = { ...newState }

      // Act
      computeStateUpdate(current, newState)

      // Assert
      expect(current).toEqual(currentCopy)
      expect(newState).toEqual(newStateCopy)
    })
  })

  describe('applyStateCommand', () => {
    test('retorna estado atual quando comando é NO_CHANGE', () => {
      // Arrange
      const current = { count: 5 }
      const command = { type: 'NO_CHANGE' as const }

      // Act
      const result = applyStateCommand(current, command)

      // Assert
      expect(result).toBe(current) // Mesma referência
    })

    test('retorna novo estado quando comando é UPDATE', () => {
      // Arrange
      const current = { count: 5 }
      const newState = { count: 10 }
      const command = { type: 'UPDATE' as const, oldState: current, newState }

      // Act
      const result = applyStateCommand(current, command)

      // Assert
      expect(result).toBe(newState)
      expect(result).not.toBe(current)
    })

    test('é uma função pura', () => {
      // Arrange
      const current = { value: 1 }
      const newState = { value: 2 }
      const command = { type: 'UPDATE' as const, oldState: current, newState }

      // Act
      const result1 = applyStateCommand(current, command)
      const result2 = applyStateCommand(current, command)

      // Assert
      expect(result1).toBe(result2)
    })
  })

  describe('shouldNotifyWatchers', () => {
    test('retorna false para NO_CHANGE', () => {
      // Arrange
      const command = { type: 'NO_CHANGE' as const }

      // Act & Assert
      expect(shouldNotifyWatchers(command)).toBe(false)
    })

    test('retorna true para UPDATE', () => {
      // Arrange
      const command = {
        type: 'UPDATE' as const,
        oldState: { value: 1 },
        newState: { value: 2 }
      }

      // Act & Assert
      expect(shouldNotifyWatchers(command)).toBe(true)
    })

    test('é uma função pura', () => {
      // Arrange
      const command = { type: 'UPDATE' as const, oldState: {}, newState: {} }

      // Act
      const result1 = shouldNotifyWatchers(command)
      const result2 = shouldNotifyWatchers(command)

      // Assert
      expect(result1).toBe(result2)
    })
  })

  describe('Integração do Core (funções puras compostas)', () => {
    test('fluxo completo: estado igual não gera UPDATE', () => {
      // Arrange
      const current = { count: 5 }
      const newPayload = { count: 5 }

      // Act
      const command = computeStateUpdate(current, newPayload)
      const shouldNotify = shouldNotifyWatchers(command)
      const finalState = applyStateCommand(current, command)

      // Assert
      expect(command.type).toBe('NO_CHANGE')
      expect(shouldNotify).toBe(false)
      expect(finalState).toBe(current)
    })

    test('fluxo completo: estado diferente gera UPDATE', () => {
      // Arrange
      const current = { count: 5 }
      const newPayload = { count: 10 }

      // Act
      const command = computeStateUpdate(current, newPayload)
      const shouldNotify = shouldNotifyWatchers(command)
      const finalState = applyStateCommand(current, command)

      // Assert
      expect(command.type).toBe('UPDATE')
      expect(shouldNotify).toBe(true)
      expect(finalState).toEqual({ count: 10 })
      expect(finalState).not.toBe(current)
    })

    test('deepClone + deepEqual: round-trip mantém igualdade', () => {
      // Arrange
      const original = { a: 1, b: { c: 2 }, d: [3, 4] }

      // Act
      const cloned = deepClone(original)

      // Assert
      expect(deepEqual(original, cloned)).toBe(true)
      expect(cloned).not.toBe(original)
    })
  })
})
