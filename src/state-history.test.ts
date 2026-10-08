import { describe, test, expect } from 'bun:test'
import {
  createHistory,
  addToHistory,
  getCommands,
  getStates,
  clearHistory,
  getCommandAt,
  getHistorySize,
  filterByCommandType
} from './state-history'
import type { StateCommand } from './state-core'

describe('State History - Time-travel debugging', () => {
  describe('createHistory', () => {
    test('cria histórico vazio com tamanho padrão', () => {
      // Act
      const history = createHistory()

      // Assert
      expect(history.entries).toEqual([])
      expect(history.maxSize).toBe(100)
    })

    test('cria histórico com tamanho customizado', () => {
      // Act
      const history = createHistory(50)

      // Assert
      expect(history.maxSize).toBe(50)
    })
  })

  describe('addToHistory', () => {
    test('adiciona comando ao histórico', () => {
      // Arrange
      const history = createHistory(10)
      const command: StateCommand<{ count: number }> = {
        type: 'UPDATE',
        oldState: { count: 0 },
        newState: { count: 1 }
      }

      // Act
      const newHistory = addToHistory(history, command, { count: 1 })

      // Assert
      expect(newHistory.entries.length).toBe(1)
      expect(newHistory.entries[0].command).toBe(command)
      expect(newHistory.entries[0].resultingState).toEqual({ count: 1 })
      expect(typeof newHistory.entries[0].timestamp).toBe('number')
    })

    test('não modifica histórico original (imutável)', () => {
      // Arrange
      const history = createHistory(10)
      const command: StateCommand<any> = { type: 'NO_CHANGE' }

      // Act
      const newHistory = addToHistory(history, command, {})

      // Assert
      expect(history.entries.length).toBe(0)
      expect(newHistory.entries.length).toBe(1)
    })

    test('limita tamanho do histórico (FIFO)', () => {
      // Arrange
      let history = createHistory(3)

      // Act
      history = addToHistory(history, { type: 'UPDATE', oldState: {}, newState: { v: 1 } }, { v: 1 })
      history = addToHistory(history, { type: 'UPDATE', oldState: {}, newState: { v: 2 } }, { v: 2 })
      history = addToHistory(history, { type: 'UPDATE', oldState: {}, newState: { v: 3 } }, { v: 3 })
      history = addToHistory(history, { type: 'UPDATE', oldState: {}, newState: { v: 4 } }, { v: 4 })

      // Assert
      expect(history.entries.length).toBe(3)
      expect(history.entries[0].resultingState).toEqual({ v: 2 }) // Primeiro removido
      expect(history.entries[1].resultingState).toEqual({ v: 3 })
      expect(history.entries[2].resultingState).toEqual({ v: 4 })
    })
  })

  describe('getCommands', () => {
    test('retorna array de comandos', () => {
      // Arrange
      let history = createHistory(10)
      const cmd1: StateCommand<any> = { type: 'NO_CHANGE' }
      const cmd2: StateCommand<any> = { type: 'UPDATE', oldState: {}, newState: {} }

      history = addToHistory(history, cmd1, {})
      history = addToHistory(history, cmd2, {})

      // Act
      const commands = getCommands(history)

      // Assert
      expect(commands.length).toBe(2)
      expect(commands[0]).toBe(cmd1)
      expect(commands[1]).toBe(cmd2)
    })

    test('retorna array vazio para histórico vazio', () => {
      // Arrange
      const history = createHistory()

      // Act
      const commands = getCommands(history)

      // Assert
      expect(commands).toEqual([])
    })
  })

  describe('getStates', () => {
    test('retorna array de estados resultantes', () => {
      // Arrange
      let history = createHistory(10)
      const state1 = { count: 1 }
      const state2 = { count: 2 }

      history = addToHistory(history, { type: 'UPDATE', oldState: {}, newState: state1 }, state1)
      history = addToHistory(history, { type: 'UPDATE', oldState: state1, newState: state2 }, state2)

      // Act
      const states = getStates(history)

      // Assert
      expect(states.length).toBe(2)
      expect(states[0]).toBe(state1)
      expect(states[1]).toBe(state2)
    })
  })

  describe('clearHistory', () => {
    test('limpa todas as entradas', () => {
      // Arrange
      let history = createHistory(10)
      history = addToHistory(history, { type: 'NO_CHANGE' }, {})
      history = addToHistory(history, { type: 'NO_CHANGE' }, {})

      // Act
      const cleared = clearHistory(history)

      // Assert
      expect(cleared.entries.length).toBe(0)
      expect(cleared.maxSize).toBe(10) // Mantém maxSize
    })

    test('não modifica histórico original', () => {
      // Arrange
      let history = createHistory(10)
      history = addToHistory(history, { type: 'NO_CHANGE' }, {})

      // Act
      clearHistory(history)

      // Assert
      expect(history.entries.length).toBe(1)
    })
  })

  describe('getCommandAt', () => {
    test('retorna comando em índice válido', () => {
      // Arrange
      let history = createHistory(10)
      const cmd = { type: 'UPDATE' as const, oldState: {}, newState: { v: 1 } }
      history = addToHistory(history, cmd, { v: 1 })

      // Act
      const entry = getCommandAt(history, 0)

      // Assert
      expect(entry?.command).toBe(cmd)
    })

    test('retorna undefined para índice inválido', () => {
      // Arrange
      const history = createHistory(10)

      // Act
      const entry = getCommandAt(history, 0)

      // Assert
      expect(entry).toBeUndefined()
    })
  })

  describe('getHistorySize', () => {
    test('retorna 0 para histórico vazio', () => {
      // Arrange
      const history = createHistory()

      // Act & Assert
      expect(getHistorySize(history)).toBe(0)
    })

    test('retorna número correto de entradas', () => {
      // Arrange
      let history = createHistory(10)
      history = addToHistory(history, { type: 'NO_CHANGE' }, {})
      history = addToHistory(history, { type: 'NO_CHANGE' }, {})
      history = addToHistory(history, { type: 'NO_CHANGE' }, {})

      // Act & Assert
      expect(getHistorySize(history)).toBe(3)
    })
  })

  describe('filterByCommandType', () => {
    test('filtra apenas comandos UPDATE', () => {
      // Arrange
      let history = createHistory(10)
      history = addToHistory(history, { type: 'NO_CHANGE' }, {})
      history = addToHistory(history, { type: 'UPDATE', oldState: {}, newState: {} }, {})
      history = addToHistory(history, { type: 'NO_CHANGE' }, {})
      history = addToHistory(history, { type: 'UPDATE', oldState: {}, newState: {} }, {})

      // Act
      const filtered = filterByCommandType(history, 'UPDATE')

      // Assert
      expect(getHistorySize(filtered)).toBe(2)
      expect(filtered.entries.every(e => e.command.type === 'UPDATE')).toBe(true)
    })

    test('retorna histórico vazio se nenhum comando corresponder', () => {
      // Arrange
      let history = createHistory(10)
      history = addToHistory(history, { type: 'NO_CHANGE' }, {})

      // Act
      const filtered = filterByCommandType(history, 'UPDATE')

      // Assert
      expect(getHistorySize(filtered)).toBe(0)
    })

    test('não modifica histórico original', () => {
      // Arrange
      let history = createHistory(10)
      history = addToHistory(history, { type: 'NO_CHANGE' }, {})
      history = addToHistory(history, { type: 'UPDATE', oldState: {}, newState: {} }, {})

      // Act
      filterByCommandType(history, 'UPDATE')

      // Assert
      expect(getHistorySize(history)).toBe(2)
    })
  })

  describe('Funções puras - Imutabilidade', () => {
    test('todas as funções retornam novos objetos', () => {
      // Arrange
      const original = createHistory(10)
      const cmd: StateCommand<any> = { type: 'UPDATE', oldState: {}, newState: {} }

      // Act
      const withEntry = addToHistory(original, cmd, {})
      const cleared = clearHistory(withEntry)
      const filtered = filterByCommandType(withEntry, 'UPDATE')

      // Assert
      expect(withEntry).not.toBe(original)
      expect(cleared).not.toBe(withEntry)
      expect(filtered).not.toBe(withEntry)
    })
  })
})
