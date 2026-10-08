/**
 * FUNCTIONAL CORE: Lógica pura de state management (FCIS pattern)
 *
 * Este módulo contém apenas funções puras que tomam decisões sobre mudanças de estado,
 * sem realizar side effects. Todo o código aqui é facilmente testável sem mocks.
 */

/**
 * Comando que representa uma decisão sobre atualização de estado
 */
export type StateCommand<S> =
  | { type: 'NO_CHANGE' }
  | { type: 'UPDATE', oldState: S, newState: S }

/**
 * Clone profundo que preserva instâncias especiais (Error, Date, etc)
 * PURE FUNCTION - Não modifica input, retorna novo objeto
 */
export function deepClone<T>(obj: T): T {
  // Primitivos e null
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Error objects - preservar sem clonar
  if (obj instanceof Error) {
    return obj;
  }

  // Date objects - criar nova instância
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  // Arrays
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as T;
  }

  // Objects
  const cloned: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Cache usando WeakMap para evitar memory leaks
 * Chave: primeiro objeto -> Map(segundo objeto -> boolean)
 */
const deepEqualCache = new WeakMap<object, Map<object, boolean>>()

/**
 * Comparação profunda para verificar mudanças de estado
 * PURE FUNCTION - Apenas lê inputs, sem side effects
 * Usa memoization com WeakMap para otimizar comparações repetidas
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  // Fast path: referência idêntica
  if (a === b) return true;

  // Fast path: null/undefined
  if (a == null || b == null) return false;

  // Fast path: tipos diferentes
  if (typeof a !== "object" || typeof b !== "object") return false;

  // Tentar obter do cache (apenas para objects/arrays)
  if (typeof a === 'object' && typeof b === 'object') {
    let innerMap = deepEqualCache.get(a as object)
    if (innerMap !== undefined) {
      const cached = innerMap.get(b as object)
      if (cached !== undefined) {
        return cached
      }
    }
  }

  // Computar resultado
  const result = deepEqualImpl(a, b)

  // Armazenar no cache (WeakMap gerencia memory automaticamente)
  if (typeof a === 'object' && typeof b === 'object') {
    let innerMap = deepEqualCache.get(a as object)
    if (innerMap === undefined) {
      innerMap = new Map()
      deepEqualCache.set(a as object, innerMap)
    }
    innerMap.set(b as object, result)
  }

  return result
}

/**
 * Implementação interna de deepEqual (sem cache)
 */
function deepEqualImpl(a: unknown, b: unknown): boolean {
  // Error objects - comparar por referência
  if (a instanceof Error || b instanceof Error) {
    return a === b;
  }

  // Date objects - comparar timestamps
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Arrays vs não-arrays
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  // Objects
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual((a as any)[key], (b as any)[key])) return false;
  }

  return true;
}

/**
 * Limpa cache de deepEqual (útil para testes)
 * Nota: Com WeakMap, não há método clear()
 * O garbage collector limpa automaticamente
 * @internal
 */
export function __clearDeepEqualCache(): void {
  // WeakMap não tem clear(), mas podemos criar novo WeakMap
  // Isso não é necessário em produção, apenas para testes
  // Por hora, deixar vazio pois WeakMap gerencia memória automaticamente
}

/**
 * Computa o comando de atualização de estado baseado na comparação
 * PURE FUNCTION - Apenas cria comando, não executa side effects
 *
 * @param currentState - Estado atual
 * @param newPayload - Novo estado proposto
 * @returns Comando indicando se deve atualizar ou não
 */
export function computeStateUpdate<S>(
  currentState: S,
  newPayload: S
): StateCommand<S> {
  // Clonar o payload para garantir imutabilidade
  const newState = deepClone(newPayload);

  // Verificar se o estado realmente mudou
  const hasChanged = !deepEqual(currentState, newState);

  if (!hasChanged) {
    return { type: 'NO_CHANGE' };
  }

  return {
    type: 'UPDATE',
    oldState: currentState,
    newState
  };
}

/**
 * Cria um novo estado aplicando o comando de update
 * PURE FUNCTION - Retorna novo estado sem modificar o atual
 *
 * @param currentState - Estado atual
 * @param command - Comando de atualização
 * @returns Novo estado (ou mesmo estado se NO_CHANGE)
 */
export function applyStateCommand<S>(
  currentState: S,
  command: StateCommand<S>
): S {
  if (command.type === 'NO_CHANGE') {
    return currentState;
  }

  return command.newState;
}

/**
 * Determina se watchers devem ser notificados baseado no comando
 * PURE FUNCTION - Apenas decisão lógica
 *
 * @param command - Comando de atualização
 * @returns true se deve notificar watchers
 */
export function shouldNotifyWatchers<S>(command: StateCommand<S>): boolean {
  return command.type === 'UPDATE';
}
