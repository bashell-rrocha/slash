/**
 * Developer Warnings - Imperative Shell
 *
 * Side effects: console logging, environment detection
 * FCIS Pattern: Este módulo orquestra o Functional Core + side effects
 */

import type { DevMessage, ValidationResult } from './dev-warnings-core';
import { formatDevMessage } from './dev-warnings-core';

/**
 * Configuração de warnings (mutável, side effect)
 */
let __DEV_MODE__ = process.env.NODE_ENV !== 'production';
let __WARNINGS_ENABLED__ = true;
let __ERRORS_THROW__ = false;

/**
 * SHELL: Habilita/desabilita modo de desenvolvimento
 */
export const setDevMode = (enabled: boolean): void => {
  __DEV_MODE__ = enabled;
};

/**
 * SHELL: Habilita/desabilita warnings
 */
export const setWarningsEnabled = (enabled: boolean): void => {
  __WARNINGS_ENABLED__ = enabled;
};

/**
 * SHELL: Habilita/desabilita throw em erros
 */
export const setErrorsThrow = (shouldThrow: boolean): void => {
  __ERRORS_THROW__ = shouldThrow;
};

/**
 * SHELL: Retorna se está em modo dev
 */
export const isDevMode = (): boolean => __DEV_MODE__;

/**
 * SHELL: Retorna se warnings estão habilitados
 */
export const isWarningsEnabled = (): boolean => __WARNINGS_ENABLED__;

/**
 * SHELL: Side effect - emite mensagem para console
 */
export const emitDevMessage = (msg: DevMessage): void => {
  // Skip em produção
  if (!__DEV_MODE__) {
    return;
  }

  // Skip se warnings desabilitados
  if (!__WARNINGS_ENABLED__ && msg.type !== 'error') {
    return;
  }

  const formatted = formatDevMessage(msg);

  // Side effect: console
  if (msg.type === 'error') {
    if (__ERRORS_THROW__) {
      throw new Error(formatted);
    }
    console.error(formatted);
  } else if (msg.type === 'warning') {
    console.warn(formatted);
  } else {
    console.info(formatted);
  }
};

/**
 * SHELL: Side effect - processa resultado de validação
 */
export const processValidationResult = (result: ValidationResult): boolean => {
  if (result.valid) {
    return true;
  }

  // Side effect: emitir mensagens
  for (const msg of result.messages) {
    emitDevMessage(msg);
  }

  return false;
};

/**
 * SHELL: Side effect - captura stack trace
 */
export const captureStackTrace = (): string => {
  const error = new Error();
  return error.stack ?? '';
};

/**
 * SHELL: Wrapper para validações com side effects automáticos
 */
export const validate = (result: ValidationResult): boolean => {
  return processValidationResult(result);
};
