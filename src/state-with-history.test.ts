import { describe, test, expect } from 'bun:test'
import { createState } from './state'
import { getHistorySize } from './state-history'

/**
 * Testes para funcionalidade de time-travel debugging
 */
describe('createState com History (Time-travel)', () => {
  describe('Criação com histórico desabilitado (padrão)', () => {
    test('não adiciona métodos de histórico por padrão', () => {
      // Arrange & Act
      const state = createState({ count: 0 })

      // Assert
      expect(state.getHistory).toBeUndefined()
      expect(state.clearHistory).toBeUndefined()
    })

    test('funciona normalmente sem histórico', () => {
      // Arrange
      const state = createState({ count: 0 })

      // Act & Assert
      state.set({ count: 5 })
      expect(state.get()).toEqual({ count: 5 })
    })
  })

  describe('Criação com histórico habilitado', () => {
    test('adiciona métodos getHistory e clearHistory', () => {
      // Arrange & Act
      const state = createState({ count: 0 }, { enableHistory: true })

      // Assert
      expect(typeof state.getHistory).toBe('function')
      expect(typeof state.clearHistory).toBe('function')
    })

    test('registra comandos no histórico', () => {
      // Arrange
      const state = createState({ count: 0 }, { enableHistory: true })

      // Act
      state.set({ count: 5 })
      state.set({ count: 10 })
      state.set({ count: 10 }) // Mesmo valor - NO_CHANGE

      // Assert
      const history = state.getHistory!()
      expect(getHistorySize(history)).toBe(3)
    })

    test('histórico contém comandos corretos', () => {
      // Arrange
      const state = createState({ count: 0 }, { enableHistory: true })

      // Act
      state.set({ count: 5 })

      // Assert
      const history = state.getHistory!()
      expect(history.entries[0].command.type).toBe('UPDATE')
      if (history.entries[0].command.type === 'UPDATE') {
        expect(history.entries[0].command.newState).toEqual({ count: 5 })
      }
    })

    test('histórico registra NO_CHANGE quando estado não muda', () => {
      // Arrange
      const state = createState({ count: 5 }, { enableHistory: true })

      // Act
      state.set({ count: 5 }) // Mesmo valor

      // Assert
      const history = state.getHistory!()
      expect(history.entries[0].command.type).toBe('NO_CHANGE')
    })

    test('clearHistory limpa o histórico', () => {
      // Arrange
      const state = createState({ count: 0 }, { enableHistory: true })
      state.set({ count: 5 })
      state.set({ count: 10 })

      // Act
      state.clearHistory!()

      // Assert
      const history = state.getHistory!()
      expect(getHistorySize(history)).toBe(0)
    })

    test('histórico respeita tamanho máximo customizado', () => {
      // Arrange
      const state = createState({ count: 0 }, {
        enableHistory: true,
        historyMaxSize: 2
      })

      // Act
      state.set({ count: 1 })
      state.set({ count: 2 })
      state.set({ count: 3 })
      state.set({ count: 4 })

      // Assert
      const history = state.getHistory!()
      expect(getHistorySize(history)).toBe(2)
      expect(history.entries[0].resultingState).toEqual({ count: 3 })
      expect(history.entries[1].resultingState).toEqual({ count: 4 })
    })
  })

  describe('Histórico e watchers juntos', () => {
    test('histórico funciona independentemente de watchers', () => {
      // Arrange
      const state = createState({ count: 0 }, { enableHistory: true })
      let watcherCalls = 0

      state.watch(() => { watcherCalls++ })

      // Act
      state.set({ count: 5 })
      state.set({ count: 5 }) // Não notifica watcher, mas registra comando

      // Assert
      expect(watcherCalls).toBe(1)
      const history = state.getHistory!()
      expect(getHistorySize(history)).toBe(2)
    })
  })

  describe('Erros quando histórico não habilitado', () => {
    test('getHistory é undefined se histórico não habilitado', () => {
      // Arrange
      const state = createState({ count: 0 })

      // Act & Assert
      expect(state.getHistory).toBeUndefined()
    })

    test('clearHistory é undefined se histórico não habilitado', () => {
      // Arrange
      const state = createState({ count: 0 })

      // Act & Assert
      expect(state.clearHistory).toBeUndefined()
    })
  })

  describe('Time-travel debugging - casos de uso', () => {
    test('pode inspecionar todos os estados anteriores', () => {
      // Arrange
      const state = createState({ count: 0 }, { enableHistory: true })

      // Act
      state.set({ count: 1 })
      state.set({ count: 2 })
      state.set({ count: 3 })

      // Assert
      const history = state.getHistory!()
      const states = history.entries.map(e => e.resultingState)

      expect(states).toEqual([
        { count: 1 },
        { count: 2 },
        { count: 3 }
      ])
    })

    test('pode rastrear timestamp de cada mudança', () => {
      // Arrange
      const state = createState({ count: 0 }, { enableHistory: true })
      const before = Date.now()

      // Act
      state.set({ count: 1 })
      const after = Date.now()

      // Assert
      const history = state.getHistory!()
      const timestamp = history.entries[0].timestamp

      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })

    test('pode filtrar apenas mudanças efetivas (UPDATE)', () => {
      // Arrange
      const state = createState({ count: 0 }, { enableHistory: true })

      // Act
      state.set({ count: 1 })
      state.set({ count: 1 }) // NO_CHANGE
      state.set({ count: 2 })

      // Assert
      const history = state.getHistory!()
      const updates = history.entries.filter(e => e.command.type === 'UPDATE')

      expect(updates.length).toBe(2)
    })
  })

  describe('Compatibilidade retroativa (non-breaking)', () => {
    test('código existente sem options funciona normalmente', () => {
      // Arrange & Act
      const state = createState({ count: 0 })

      // Assert
      expect(() => {
        state.set({ count: 5 })
        state.get()
        state.watch(() => {})
      }).not.toThrow()
    })

    test('API pública não muda', () => {
      // Arrange
      const state = createState({ count: 0 })

      // Assert
      expect(typeof state.set).toBe('function')
      expect(typeof state.get).toBe('function')
      expect(typeof state.watch).toBe('function')
    })
  })
})
