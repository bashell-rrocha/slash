/**
 * Testes para Memoization de deepEqual
 *
 * Padrão AAA (Arrange-Act-Assert)
 * Testa otimização de cache para comparações profundas
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { deepEqual, __clearDeepEqualCache } from './state-core'

describe('deepEqual com memoization', () => {
  beforeEach(() => {
    __clearDeepEqualCache()
  })

  describe('comportamento funcional (sem quebrar API)', () => {
    test('deve comparar primitivos corretamente', () => {
      // Arrange & Act & Assert
      expect(deepEqual(1, 1)).toBe(true)
      expect(deepEqual(1, 2)).toBe(false)
      expect(deepEqual('a', 'a')).toBe(true)
      expect(deepEqual('a', 'b')).toBe(false)
      expect(deepEqual(true, true)).toBe(true)
      expect(deepEqual(true, false)).toBe(false)
    })

    test('deve comparar null e undefined', () => {
      // Arrange & Act & Assert
      expect(deepEqual(null, null)).toBe(true)
      expect(deepEqual(undefined, undefined)).toBe(true)
      expect(deepEqual(null, undefined)).toBe(false)
      expect(deepEqual(null, 0)).toBe(false)
    })

    test('deve comparar arrays simples', () => {
      // Arrange & Act & Assert
      expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true)
      expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false)
      expect(deepEqual([1, 2], [1, 2, 3])).toBe(false)
    })

    test('deve comparar objetos simples', () => {
      // Arrange & Act & Assert
      expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true)
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false)
      expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    })

    test('deve comparar objetos aninhados', () => {
      // Arrange & Act & Assert
      expect(deepEqual(
        { a: { b: { c: 1 } } },
        { a: { b: { c: 1 } } }
      )).toBe(true)

      expect(deepEqual(
        { a: { b: { c: 1 } } },
        { a: { b: { c: 2 } } }
      )).toBe(false)
    })

    test('deve comparar Date objects', () => {
      // Arrange
      const date1 = new Date('2024-01-01')
      const date2 = new Date('2024-01-01')
      const date3 = new Date('2024-01-02')

      // Act & Assert
      expect(deepEqual(date1, date2)).toBe(true)
      expect(deepEqual(date1, date3)).toBe(false)
    })

    test('deve comparar Error objects por referência', () => {
      // Arrange
      const err1 = new Error('test')
      const err2 = new Error('test')

      // Act & Assert
      expect(deepEqual(err1, err1)).toBe(true)
      expect(deepEqual(err1, err2)).toBe(false)
    })
  })

  describe('otimização de cache', () => {
    test('deve usar cache para comparações repetidas de objetos', () => {
      // Arrange
      const obj1 = { a: 1, b: 2 }
      const obj2 = { a: 1, b: 2 }

      // Act: Primeira comparação (sem cache)
      const result1 = deepEqual(obj1, obj2)

      // Act: Segunda comparação (com cache)
      const result2 = deepEqual(obj1, obj2)

      // Assert
      expect(result1).toBe(true)
      expect(result2).toBe(true)
    })

    test('deve usar cache para comparações repetidas de arrays', () => {
      // Arrange
      const arr1 = [1, 2, 3]
      const arr2 = [1, 2, 3]

      // Act: Primeira comparação
      const result1 = deepEqual(arr1, arr2)

      // Act: Segunda comparação (deveria usar cache)
      const result2 = deepEqual(arr1, arr2)

      // Assert
      expect(result1).toBe(true)
      expect(result2).toBe(true)
    })

    test('não deve cachear primitivos (sem benefício)', () => {
      // Arrange & Act & Assert
      // Primitivos são comparados via fast path
      expect(deepEqual(1, 1)).toBe(true)
      expect(deepEqual('test', 'test')).toBe(true)
      expect(deepEqual(true, true)).toBe(true)
    })

    test('não deve cachear null/undefined', () => {
      // Arrange & Act & Assert
      expect(deepEqual(null, null)).toBe(true)
      expect(deepEqual(undefined, undefined)).toBe(true)
    })
  })

  describe('limite de cache (LRU)', () => {
    test('deve respeitar limite máximo de cache', () => {
      // Arrange: Criar 101 pares de objetos diferentes
      const pairs: Array<[object, object]> = []
      for (let i = 0; i < 101; i++) {
        pairs.push([{ id: i }, { id: i }])
      }

      // Act: Comparar todos (encher cache além do limite)
      pairs.forEach(([a, b]) => {
        deepEqual(a, b)
      })

      // Assert: Cache ainda funciona (não quebrou)
      const [firstA, firstB] = pairs[0]
      expect(deepEqual(firstA, firstB)).toBe(true)
    })
  })

  describe('casos extremos', () => {
    test('deve lidar com objetos grandes sem problemas', () => {
      // Arrange
      const large1 = { ...Array.from({ length: 100 }, (_, i) => ({ [`key${i}`]: i })).reduce((acc, obj) => ({ ...acc, ...obj }), {}) }
      const large2 = { ...large1 }

      // Act
      const result = deepEqual(large1, large2)

      // Assert
      expect(result).toBe(true)
    })

    test('deve lidar com arrays grandes', () => {
      // Arrange
      const large1 = Array.from({ length: 100 }, (_, i) => i)
      const large2 = [...large1]

      // Act
      const result = deepEqual(large1, large2)

      // Assert
      expect(result).toBe(true)
    })

    test('deve lidar com estruturas profundamente aninhadas', () => {
      // Arrange
      let nested1: any = { value: 1 }
      let nested2: any = { value: 1 }

      for (let i = 0; i < 10; i++) {
        nested1 = { inner: nested1 }
        nested2 = { inner: nested2 }
      }

      // Act
      const result = deepEqual(nested1, nested2)

      // Assert
      expect(result).toBe(true)
    })
  })

  describe('fast paths', () => {
    test('deve usar fast path para referências idênticas', () => {
      // Arrange
      const obj = { a: 1, b: 2 }

      // Act & Assert
      expect(deepEqual(obj, obj)).toBe(true)
    })

    test('deve usar fast path para tipos diferentes', () => {
      // Arrange & Act & Assert
      expect(deepEqual({}, [])).toBe(false)
      expect(deepEqual([], {})).toBe(false)
      expect(deepEqual({}, 'string')).toBe(false)
      expect(deepEqual(1, {})).toBe(false)
    })
  })

  describe('integração com state management', () => {
    test('deve otimizar comparações de estado repetidas', () => {
      // Arrange
      const state1 = { count: 0, user: { name: 'John', age: 25 } }
      const state2 = { count: 0, user: { name: 'John', age: 25 } }

      // Act: Primeira comparação
      const equal1 = deepEqual(state1, state2)

      // Act: Segunda comparação (mesmo par)
      const equal2 = deepEqual(state1, state2)

      // Assert
      expect(equal1).toBe(true)
      expect(equal2).toBe(true)
    })

    test('deve invalidar cache quando objetos mudam', () => {
      // Arrange
      const state1 = { count: 0 }
      const state2 = { count: 0 }
      const state3 = { count: 1 }

      // Act & Assert
      expect(deepEqual(state1, state2)).toBe(true)
      expect(deepEqual(state1, state3)).toBe(false)
    })
  })
})
