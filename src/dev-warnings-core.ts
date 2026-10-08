/**
 * Developer Warnings - Functional Core
 *
 * Funções puras para detectar anti-patterns e gerar mensagens de erro/warning.
 * FCIS Pattern: Este módulo contém apenas lógica pura, sem side effects.
 */

/**
 * Tipo de mensagem de desenvolvimento
 */
export type DevMessageType = 'error' | 'warning' | 'info';

/**
 * Categoria de mensagem
 */
export type DevMessageCategory =
  | 'STATE_MUTATION'
  | 'REACTIVITY_VIOLATION'
  | 'MEMORY_LEAK'
  | 'PERFORMANCE'
  | 'API_MISUSE'
  | 'TYPE_MISMATCH';

/**
 * Estrutura de mensagem de desenvolvimento
 */
export interface DevMessage {
  readonly type: DevMessageType;
  readonly category: DevMessageCategory;
  readonly message: string;
  readonly hint?: string;
  readonly context?: Record<string, unknown>;
  readonly timestamp: number;
}

/**
 * Resultado de validação
 */
export type ValidationResult =
  | { valid: true }
  | { valid: false; messages: readonly DevMessage[] };

/**
 * PURE: Cria uma mensagem de desenvolvimento
 */
export const createDevMessage = (
  type: DevMessageType,
  category: DevMessageCategory,
  message: string,
  hint?: string,
  context?: Record<string, unknown>
): DevMessage => ({
  type,
  category,
  message,
  hint,
  context,
  timestamp: Date.now(),
});

/**
 * PURE: Detecta tentativa de mutação direta do estado
 */
export const detectDirectStateMutation = <T>(
  oldState: T,
  newState: T,
  usedSetMethod: boolean
): ValidationResult => {
  // Se usou .set(), é válido
  if (usedSetMethod) {
    return { valid: true };
  }

  // Se os objetos são diferentes (não é mutação direta), é válido
  if (oldState !== newState) {
    return { valid: true };
  }

  // Se chegou aqui, pode ser mutação direta
  return {
    valid: false,
    messages: [
      createDevMessage(
        'error',
        'STATE_MUTATION',
        'Direct state mutation detected. Use state.set() instead of mutating state directly.',
        'Replace: state.myProp = value\nWith: state.set({ ...state.get(), myProp: value })',
        { oldState, newState }
      ),
    ],
  };
};

/**
 * PURE: Detecta uso incorreto de watch sem cleanup
 */
export const detectWatchWithoutCleanup = (
  watcherCount: number,
  maxWatchers: number = 1000
): ValidationResult => {
  if (watcherCount <= maxWatchers) {
    return { valid: true };
  }

  return {
    valid: false,
    messages: [
      createDevMessage(
        'warning',
        'MEMORY_LEAK',
        `High number of watchers detected (${watcherCount}). This may indicate missing cleanup.`,
        'Make sure to call the cleanup function returned by state.watch():\nconst unwatch = state.watch(callback);\n// Later: unwatch();',
        { watcherCount, maxWatchers }
      ),
    ],
  };
};

/**
 * PURE: Detecta uso de deepEqual em objetos muito grandes (performance)
 */
export const detectLargeObjectComparison = (
  obj: unknown,
  maxKeys: number = 1000
): ValidationResult => {
  if (typeof obj !== 'object' || obj === null) {
    return { valid: true };
  }

  const keyCount = Object.keys(obj).length;

  if (keyCount <= maxKeys) {
    return { valid: true };
  }

  return {
    valid: false,
    messages: [
      createDevMessage(
        'warning',
        'PERFORMANCE',
        `Large object detected in state comparison (${keyCount} keys). Consider breaking into smaller states.`,
        'Split large states into multiple smaller states for better performance:\nconst userState = createState({ ... });\nconst settingsState = createState({ ... });',
        { keyCount, maxKeys }
      ),
    ],
  };
};

/**
 * PURE: Detecta criação de state dentro de componentes (anti-pattern)
 */
export const detectStateInComponent = (
  stackTrace: string
): ValidationResult => {
  // Detecta se está dentro de uma função de componente
  // (padrão: funções que retornam JSX/VNode geralmente têm 'render' ou 'component' no stack)
  const isInComponent = /component|render/i.test(stackTrace);

  if (!isInComponent) {
    return { valid: true };
  }

  return {
    valid: false,
    messages: [
      createDevMessage(
        'warning',
        'REACTIVITY_VIOLATION',
        'State created inside component. This may cause memory leaks and unexpected behavior.',
        'Move state creation outside of component:\n// ❌ Bad:\nfunction MyComponent() {\n  const state = createState({});\n}\n\n// ✅ Good:\nconst myState = createState({});\nfunction MyComponent() { ... }',
        { stackTrace }
      ),
    ],
  };
};

/**
 * PURE: Detecta uso incorreto de batch (nested batches)
 */
export const detectNestedBatch = (
  currentBatchDepth: number
): ValidationResult => {
  if (currentBatchDepth <= 1) {
    return { valid: true };
  }

  return {
    valid: false,
    messages: [
      createDevMessage(
        'warning',
        'API_MISUSE',
        `Nested batch detected (depth: ${currentBatchDepth}). Nested batches are redundant.`,
        'Remove nested batch() calls:\n// ❌ Bad:\nbatch(() => {\n  batch(() => { ... });\n});\n\n// ✅ Good:\nbatch(() => { ... });',
        { currentBatchDepth }
      ),
    ],
  };
};

/**
 * PURE: Valida tipo de payload do state
 */
export const validateStatePayload = <T>(
  payload: unknown,
  expectedType: string = 'object'
): ValidationResult => {
  const actualType = typeof payload;

  // null é typeof 'object', mas queremos rejeitar
  if (payload === null) {
    return {
      valid: false,
      messages: [
        createDevMessage(
          'error',
          'TYPE_MISMATCH',
          'State payload cannot be null.',
          'Pass an object to state.set():\nstate.set({ ...state.get(), key: value });'
        ),
      ],
    };
  }

  if (actualType !== expectedType) {
    return {
      valid: false,
      messages: [
        createDevMessage(
          'error',
          'TYPE_MISMATCH',
          `State payload must be an object, received ${actualType}.`,
          `Pass an object to state.set():\nstate.set({ key: value });`,
          { payload, expectedType, actualType }
        ),
      ],
    };
  }

  return { valid: true };
};

/**
 * PURE: Formata mensagem para console
 */
export const formatDevMessage = (msg: DevMessage): string => {
  const icon = msg.type === 'error' ? '❌' : msg.type === 'warning' ? '⚠️' : 'ℹ️';
  const prefix = `[SLASH ${msg.type.toUpperCase()}] [${msg.category}]`;

  let output = `${icon} ${prefix} ${msg.message}`;

  if (msg.hint) {
    output += `\n\n💡 Hint:\n${msg.hint}`;
  }

  if (msg.context && Object.keys(msg.context).length > 0) {
    output += `\n\n🔍 Context:\n${JSON.stringify(msg.context, null, 2)}`;
  }

  return output;
};

/**
 * PURE: Agrupa múltiplas mensagens
 */
export const groupDevMessages = (
  messages: readonly DevMessage[]
): Map<DevMessageCategory, DevMessage[]> => {
  const grouped = new Map<DevMessageCategory, DevMessage[]>();

  for (const msg of messages) {
    const existing = grouped.get(msg.category) ?? [];
    grouped.set(msg.category, [...existing, msg]);
  }

  return grouped;
};
