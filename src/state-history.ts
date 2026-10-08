/**
 * State History - Time-travel debugging support (FCIS pattern)
 *
 * Functional Core para histórico de comandos e replay
 */

import type { StateCommand } from './state-core'

/**
 * Entrada no histórico de comandos
 */
export interface HistoryEntry<S> {
  timestamp: number
  command: StateCommand<S>
  resultingState: S
}

/**
 * Histórico de comandos de estado
 */
export interface StateHistory<S> {
  entries: ReadonlyArray<HistoryEntry<S>>
  maxSize: number
}

/**
 * PURE: Adiciona comando ao histórico
 */
export function addToHistory<S>(
  history: StateHistory<S>,
  command: StateCommand<S>,
  resultingState: S
): StateHistory<S> {
  const entry: HistoryEntry<S> = {
    timestamp: Date.now(),
    command,
    resultingState
  }

  const newEntries = [...history.entries, entry]

  // Limitar tamanho do histórico (FIFO)
  const trimmedEntries = newEntries.length > history.maxSize
    ? newEntries.slice(-history.maxSize)
    : newEntries

  return {
    ...history,
    entries: trimmedEntries
  }
}

/**
 * PURE: Cria histórico vazio
 */
export function createHistory<S>(maxSize: number = 100): StateHistory<S> {
  return {
    entries: [],
    maxSize
  }
}

/**
 * PURE: Obtém todos os comandos do histórico
 */
export function getCommands<S>(history: StateHistory<S>): ReadonlyArray<StateCommand<S>> {
  return history.entries.map(entry => entry.command)
}

/**
 * PURE: Obtém estados resultantes do histórico
 */
export function getStates<S>(history: StateHistory<S>): ReadonlyArray<S> {
  return history.entries.map(entry => entry.resultingState)
}

/**
 * PURE: Limpa o histórico
 */
export function clearHistory<S>(history: StateHistory<S>): StateHistory<S> {
  return {
    ...history,
    entries: []
  }
}

/**
 * PURE: Obtém comando em índice específico
 */
export function getCommandAt<S>(
  history: StateHistory<S>,
  index: number
): HistoryEntry<S> | undefined {
  return history.entries[index]
}

/**
 * PURE: Obtém tamanho do histórico
 */
export function getHistorySize<S>(history: StateHistory<S>): number {
  return history.entries.length
}

/**
 * PURE: Filtra histórico por tipo de comando
 */
export function filterByCommandType<S>(
  history: StateHistory<S>,
  type: StateCommand<S>['type']
): StateHistory<S> {
  return {
    ...history,
    entries: history.entries.filter(entry => entry.command.type === type)
  }
}
