/**
 * Functional Core for Component Tracking System
 *
 * Pure functions that handle component state tracking logic without side effects.
 * Following FCIS pattern: decisions are pure, execution is imperative.
 */

import type { State } from "../state";

// ============================================================================
// Types
// ============================================================================

/**
 * Tracker para states acessados durante renderização de componentes.
 * Encapsula o estado de tracking de forma imutável.
 */
export interface StateTracker {
  readonly states: ReadonlySet<State<any>>;
  readonly isTracking: boolean;
}

/**
 * Comandos que podem ser emitidos pelo tracking system.
 */
export type TrackingCommand =
  | { type: "TRACK_STATE"; state: State<any> }
  | { type: "START_TRACKING" }
  | { type: "STOP_TRACKING" }
  | { type: "CLEAR_TRACKING" }
  | { type: "NO_OP" };

/**
 * Resultado do processamento de tracking.
 */
export interface TrackingResult {
  readonly tracker: StateTracker;
  readonly command: TrackingCommand;
}

// ============================================================================
// Functional Core - Pure Functions
// ============================================================================

/**
 * Cria um novo StateTracker vazio.
 * @returns Novo tracker no estado inicial
 */
export function createStateTracker(): StateTracker {
  return {
    states: new Set<State<any>>(),
    isTracking: false,
  };
}

/**
 * Adiciona um state ao tracker se o tracking estiver ativo.
 * @param tracker Tracker atual
 * @param state State a ser rastreado
 * @returns Novo tracker com o state adicionado (se tracking ativo)
 */
export function trackState(
  tracker: StateTracker,
  state: State<any>
): StateTracker {
  if (!tracker.isTracking) {
    return tracker;
  }

  // Se já está sendo rastreado, retornar tracker atual
  if (tracker.states.has(state)) {
    return tracker;
  }

  // Criar novo Set com o state adicionado
  const newStates = new Set(tracker.states);
  newStates.add(state);

  return {
    ...tracker,
    states: newStates,
  };
}

/**
 * Inicia o tracking de states.
 * @param tracker Tracker atual
 * @returns Novo tracker com tracking ativado
 */
export function startTracking(tracker: StateTracker): StateTracker {
  if (tracker.isTracking) {
    return tracker;
  }

  return {
    ...tracker,
    isTracking: true,
  };
}

/**
 * Para o tracking de states.
 * @param tracker Tracker atual
 * @returns Novo tracker com tracking desativado
 */
export function stopTracking(tracker: StateTracker): StateTracker {
  if (!tracker.isTracking) {
    return tracker;
  }

  return {
    ...tracker,
    isTracking: false,
  };
}

/**
 * Limpa todos os states rastreados, mantendo o estado de tracking.
 * @param tracker Tracker atual
 * @returns Novo tracker sem states rastreados
 */
export function clearTrackedStates(tracker: StateTracker): StateTracker {
  if (tracker.states.size === 0) {
    return tracker;
  }

  return {
    ...tracker,
    states: new Set<State<any>>(),
  };
}

/**
 * Retorna os states rastreados como array (para iteração).
 * @param tracker Tracker atual
 * @returns Array de states rastreados
 */
export function getTrackedStates(
  tracker: StateTracker
): ReadonlyArray<State<any>> {
  return Array.from(tracker.states);
}

/**
 * Verifica se há states sendo rastreados.
 * @param tracker Tracker atual
 * @returns true se há states rastreados
 */
export function hasTrackedStates(tracker: StateTracker): boolean {
  return tracker.states.size > 0;
}

/**
 * Verifica se um state específico está sendo rastreado.
 * @param tracker Tracker atual
 * @param state State a verificar
 * @returns true se o state está sendo rastreado
 */
export function isStateTracked(
  tracker: StateTracker,
  state: State<any>
): boolean {
  return tracker.states.has(state);
}

/**
 * Computa o comando necessário para processar uma operação de tracking.
 * Esta é a função de decisão principal do Functional Core.
 *
 * @param tracker Tracker atual
 * @param operation Operação a ser realizada
 * @param state State relacionado à operação (se aplicável)
 * @returns Comando a ser executado
 */
export function computeTrackingCommand(
  tracker: StateTracker,
  operation: "track" | "start" | "stop" | "clear",
  state?: State<any>
): TrackingCommand {
  switch (operation) {
    case "track":
      if (!state) {
        return { type: "NO_OP" };
      }
      if (!tracker.isTracking) {
        return { type: "NO_OP" };
      }
      if (tracker.states.has(state)) {
        return { type: "NO_OP" };
      }
      return { type: "TRACK_STATE", state };

    case "start":
      if (tracker.isTracking) {
        return { type: "NO_OP" };
      }
      return { type: "START_TRACKING" };

    case "stop":
      if (!tracker.isTracking) {
        return { type: "NO_OP" };
      }
      return { type: "STOP_TRACKING" };

    case "clear":
      if (tracker.states.size === 0) {
        return { type: "NO_OP" };
      }
      return { type: "CLEAR_TRACKING" };

    default: {
      const _exhaustive: never = operation;
      return { type: "NO_OP" };
    }
  }
}

/**
 * Aplica um comando de tracking ao tracker, retornando novo tracker.
 * Esta função é pura, mas serve de ponte para o Imperative Shell.
 *
 * @param tracker Tracker atual
 * @param command Comando a ser aplicado
 * @returns Novo tracker após aplicar o comando
 */
export function applyTrackingCommand(
  tracker: StateTracker,
  command: TrackingCommand
): StateTracker {
  switch (command.type) {
    case "TRACK_STATE":
      return trackState(tracker, command.state);

    case "START_TRACKING":
      return startTracking(tracker);

    case "STOP_TRACKING":
      return stopTracking(tracker);

    case "CLEAR_TRACKING":
      return clearTrackedStates(tracker);

    case "NO_OP":
      return tracker;

    default: {
      const _exhaustive: never = command;
      return tracker;
    }
  }
}
