/**
 * Testes para Batch Core (FCIS Pattern - Functional Core)
 *
 * Padrão AAA (Arrange-Act-Assert)
 * Funções puras, sem necessidade de mocks
 */

import { describe, test, expect } from 'bun:test'
import { enterBatch, exitBatch } from './batch-core'

describe('batch-core', () => {
  describe('enterBatch', () => {
    test('deve incrementar a profundidade', () => {
      expect(enterBatch(0)).toBe(1)
      expect(enterBatch(1)).toBe(2)
    })
  })

  describe('exitBatch', () => {
    test('deve fazer flush ao voltar a profundidade 0', () => {
      expect(exitBatch(1)).toEqual({ depth: 0, flush: true })
    })

    test('não deve fazer flush ao sair de lote interno', () => {
      expect(exitBatch(2)).toEqual({ depth: 1, flush: false })
    })

    test('não deve descer abaixo de 0 nem fazer flush sem lote ativo', () => {
      expect(exitBatch(0)).toEqual({ depth: 0, flush: false })
    })
  })

  describe('fluxo aninhado', () => {
    test('só o fim do lote mais externo faz flush', () => {
      let depth = 0
      depth = enterBatch(depth)
      depth = enterBatch(depth)
      const inner = exitBatch(depth)
      expect(inner.flush).toBe(false)
      const outer = exitBatch(inner.depth)
      expect(outer).toEqual({ depth: 0, flush: true })
    })
  })

  test('é pura: não altera entradas e é determinística', () => {
    expect(exitBatch(3)).toEqual(exitBatch(3))
    expect(enterBatch(5)).toBe(enterBatch(5))
  })
})
