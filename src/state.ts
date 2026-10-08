/**
 * State Management - FCIS Pattern (Functional Core, Imperative Shell)
 *
 * Arquitetura:
 * - state-core.ts: Functional Core (funções puras, decisões)
 * - state.ts: Imperative Shell (side effects, execução)
 * - state-history.ts: Time-travel debugging (opcional)
 */

import {
  deepClone,
  computeStateUpdate,
  applyStateCommand,
  shouldNotifyWatchers
} from './state-core'
import type { StateHistory } from './state-history'
import { createHistory, addToHistory, clearHistory as clearHistoryCore } from './state-history'
import { isInBatch, __recordBatchUpdate, __addBatchEndCallback } from './batch'

export type StateWatcher<T> = (params: T) => void;

export type State<T = unknown> = {
  set: (value: T) => void;
  get: () => T;
  watch: (callback: StateWatcher<T>) => () => void;
  // Time-travel debugging (opcional, não-breaking)
  getHistory?: () => Readonly<StateHistory<T>>;
  clearHistory?: () => void;
};

export interface StateOptions {
  /** Habilita time-travel debugging (histórico de comandos) */
  enableHistory?: boolean;
  /** Tamanho máximo do histórico (padrão: 100) */
  historyMaxSize?: number;
}

/**
 * IMPERATIVE SHELL: Gerencia side effects e mutações
 */
export const createState = <S = unknown>(
  initialState: S,
  options?: StateOptions
): State<S> => {
  // Estado interno mutável (encapsulado)
  let _state = deepClone(initialState);
  const _watchers = new Set<StateWatcher<S>>();

  // Histórico opcional (time-travel debugging)
  let _history: StateHistory<S> | null = options?.enableHistory
    ? createHistory(options.historyMaxSize ?? 100)
    : null;

  /**
   * Side effect: Notifica todos os watchers
   */
  const _notifyHandlers = (payload: S) => {
    for (const stateWatcher of _watchers) {
      stateWatcher(payload);
    }
  };

  /**
   * SHELL: Orquestra functional core + side effects
   */
  const set = (payload: S) => {
    // 1. FUNCTIONAL CORE: Computar comando (puro)
    const command = computeStateUpdate(_state, payload);

    // 2. FUNCTIONAL CORE: Aplicar comando (puro)
    const newState = applyStateCommand(_state, command);

    // 3. IMPERATIVE SHELL: Mutação do estado interno
    _state = newState;

    // 4. IMPERATIVE SHELL: Adicionar ao histórico (se habilitado)
    if (_history !== null) {
      _history = addToHistory(_history, command, deepClone(_state));
    }

    // 5. FUNCTIONAL CORE: Decidir se deve notificar (puro)
    if (shouldNotifyWatchers(command)) {
      // 6. BATCH: Registrar update se em modo batch
      if (isInBatch()) {
        __recordBatchUpdate();
      } else {
        // 7. IMPERATIVE SHELL: Side effect de notificação (fora de batch)
        _notifyHandlers(deepClone(_state));
      }
    }
  };

  /**
   * SHELL: Retorna clone do estado + side effects de tracking
   */
  const get = (): S => {
    // Side effect: Notificar sistema de rastreamento de componentes (se existir)
    if (typeof globalThis !== "undefined" && (globalThis as any).__SLASH_TRACK_STATE__) {
      (globalThis as any).__SLASH_TRACK_STATE__(state);
    }

    const cloned = deepClone(_state);

    // Em SSR, criar Proxy para rastrear acessos a propriedades
    if (typeof globalThis !== "undefined" && (globalThis as any).__SLASH_SSR__ && typeof cloned === 'object' && cloned !== null) {
      const handler: ProxyHandler<any> = {
        get(target, prop) {
          let value = target[prop];

          // Se o valor é um array, criar Proxy para interceptar métodos como .map()
          if (Array.isArray(value)) {
            const arrayHandler: ProxyHandler<any[]> = {
              get(arrTarget, arrProp) {
                const arrValue = arrTarget[arrProp as any];

                // Interceptar métodos que retornam novos arrays
                if (arrProp === 'map' || arrProp === 'filter' || arrProp === 'slice') {
                  return function(...args: any[]) {
                    const result = (arrValue as Function).apply(arrTarget, args);
                    // Side effect: Rastrear o resultado do método
                    if ((globalThis as any).__SLASH_TRACK_ACCESS__) {
                      (globalThis as any).__SLASH_TRACK_ACCESS__(state, arrProp, result);
                    }
                    return result;
                  };
                }

                return arrValue;
              }
            };
            const arrayProxy = new Proxy(value, arrayHandler);

            // Side effect: Notificar sobre acesso ao array (agora com Proxy)
            if ((globalThis as any).__SLASH_TRACK_ACCESS__) {
              (globalThis as any).__SLASH_TRACK_ACCESS__(state, prop, arrayProxy);
            }

            return arrayProxy;
          }

          // Side effect: Notificar sistema de rastreamento sobre acesso específico
          if ((globalThis as any).__SLASH_TRACK_ACCESS__) {
            (globalThis as any).__SLASH_TRACK_ACCESS__(state, prop, value);
          }

          return value;
        }
      };
      return new Proxy(cloned, handler);
    }

    return cloned;
  };

  /**
   * SHELL: Registra watcher (side effect)
   */
  const watch = (callback: StateWatcher<S>): (() => void) => {
    _watchers.add(callback);

    // Retornar função de unwatch (cleanup side effect)
    return () => {
      _watchers.delete(callback);
    };
  };

  /**
   * SHELL: Obtém histórico (se habilitado)
   */
  const getHistory = (): Readonly<StateHistory<S>> => {
    if (_history === null) {
      throw new Error('History not enabled. Create state with { enableHistory: true }');
    }
    return _history;
  };

  /**
   * SHELL: Limpa histórico (se habilitado)
   */
  const clearHistory = (): void => {
    if (_history === null) {
      throw new Error('History not enabled. Create state with { enableHistory: true }');
    }
    _history = clearHistoryCore(_history);
  };

  const state: State<S> = { set, get, watch };

  // Adicionar métodos opcionais se histórico habilitado
  if (_history !== null) {
    state.getHistory = getHistory;
    state.clearHistory = clearHistory;
  }

  // BATCH: Registrar callback para notificar watchers ao finalizar batch
  __addBatchEndCallback(() => {
    _notifyHandlers(deepClone(_state));
  });

  return state;
};
