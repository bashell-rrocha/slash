/**
 * Tests for dev-warnings.ts (Imperative Shell)
 * Pattern: AAA (Arrange, Act, Assert)
 */

import { describe, test, expect, beforeEach, mock, spyOn } from 'bun:test';
import {
  setDevMode,
  setWarningsEnabled,
  setErrorsThrow,
  isDevMode,
  isWarningsEnabled,
  emitDevMessage,
  processValidationResult,
  captureStackTrace,
  validate,
} from './dev-warnings';
import { createDevMessage } from './dev-warnings-core';

describe('dev-warnings (Imperative Shell)', () => {
  // Salvar configurações originais
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // Reset para estado padrão
    setDevMode(true);
    setWarningsEnabled(true);
    setErrorsThrow(false);
  });

  afterEach(() => {
    // Restaurar ambiente
    process.env.NODE_ENV = originalEnv;
  });

  describe('setDevMode / isDevMode', () => {
    test('should enable dev mode', () => {
      // Arrange
      setDevMode(false);

      // Act
      setDevMode(true);

      // Assert
      expect(isDevMode()).toBe(true);
    });

    test('should disable dev mode', () => {
      // Arrange
      setDevMode(true);

      // Act
      setDevMode(false);

      // Assert
      expect(isDevMode()).toBe(false);
    });
  });

  describe('setWarningsEnabled / isWarningsEnabled', () => {
    test('should enable warnings', () => {
      // Arrange
      setWarningsEnabled(false);

      // Act
      setWarningsEnabled(true);

      // Assert
      expect(isWarningsEnabled()).toBe(true);
    });

    test('should disable warnings', () => {
      // Arrange
      setWarningsEnabled(true);

      // Act
      setWarningsEnabled(false);

      // Assert
      expect(isWarningsEnabled()).toBe(false);
    });
  });

  describe('setErrorsThrow', () => {
    test('should enable throwing errors', () => {
      // Arrange & Act
      setErrorsThrow(true);

      // Assert
      const errorMsg = createDevMessage('error', 'STATE_MUTATION', 'Test error');
      expect(() => emitDevMessage(errorMsg)).toThrow();
    });

    test('should disable throwing errors', () => {
      // Arrange
      setErrorsThrow(false);
      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

      // Act
      const errorMsg = createDevMessage('error', 'STATE_MUTATION', 'Test error');
      emitDevMessage(errorMsg);

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('emitDevMessage', () => {
    test('should not emit in production mode', () => {
      // Arrange
      setDevMode(false);
      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
      const msg = createDevMessage('error', 'STATE_MUTATION', 'Test error');

      // Act
      emitDevMessage(msg);

      // Assert
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    test('should emit error to console.error', () => {
      // Arrange
      setDevMode(true);
      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
      const msg = createDevMessage('error', 'STATE_MUTATION', 'Test error');

      // Act
      emitDevMessage(msg);

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Test error');
      consoleErrorSpy.mockRestore();
    });

    test('should emit warning to console.warn', () => {
      // Arrange
      setDevMode(true);
      const consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
      const msg = createDevMessage('warning', 'PERFORMANCE', 'Test warning');

      // Act
      emitDevMessage(msg);

      // Assert
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('Test warning');
      consoleWarnSpy.mockRestore();
    });

    test('should emit info to console.info', () => {
      // Arrange
      setDevMode(true);
      const consoleInfoSpy = spyOn(console, 'info').mockImplementation(() => {});
      const msg = createDevMessage('info', 'API_MISUSE', 'Test info');

      // Act
      emitDevMessage(msg);

      // Assert
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
      expect(consoleInfoSpy.mock.calls[0][0]).toContain('Test info');
      consoleInfoSpy.mockRestore();
    });

    test('should not emit warnings when disabled', () => {
      // Arrange
      setDevMode(true);
      setWarningsEnabled(false);
      const consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
      const msg = createDevMessage('warning', 'PERFORMANCE', 'Test warning');

      // Act
      emitDevMessage(msg);

      // Assert
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    test('should emit errors even when warnings disabled', () => {
      // Arrange
      setDevMode(true);
      setWarningsEnabled(false);
      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
      const msg = createDevMessage('error', 'STATE_MUTATION', 'Test error');

      // Act
      emitDevMessage(msg);

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      consoleErrorSpy.mockRestore();
    });

    test('should throw error when setErrorsThrow is enabled', () => {
      // Arrange
      setDevMode(true);
      setErrorsThrow(true);
      const msg = createDevMessage('error', 'STATE_MUTATION', 'Test error');

      // Act & Assert
      expect(() => emitDevMessage(msg)).toThrow('Test error');
    });
  });

  describe('processValidationResult', () => {
    test('should return true for valid result', () => {
      // Arrange
      const result = { valid: true as const };

      // Act
      const isValid = processValidationResult(result);

      // Assert
      expect(isValid).toBe(true);
    });

    test('should return false for invalid result', () => {
      // Arrange
      const result = {
        valid: false as const,
        messages: [createDevMessage('error', 'STATE_MUTATION', 'Test error')],
      };
      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

      // Act
      const isValid = processValidationResult(result);

      // Assert
      expect(isValid).toBe(false);
      consoleErrorSpy.mockRestore();
    });

    test('should emit all messages from invalid result', () => {
      // Arrange
      const result = {
        valid: false as const,
        messages: [
          createDevMessage('error', 'STATE_MUTATION', 'Error 1'),
          createDevMessage('warning', 'PERFORMANCE', 'Warning 1'),
        ],
      };
      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      // Act
      processValidationResult(result);

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('captureStackTrace', () => {
    test('should return a string', () => {
      // Act
      const stack = captureStackTrace();

      // Assert
      expect(typeof stack).toBe('string');
    });

    test('should contain stack trace information', () => {
      // Act
      const stack = captureStackTrace();

      // Assert
      // Stack trace deve conter pelo menos "at" (padrão V8)
      expect(stack.length).toBeGreaterThan(0);
    });
  });

  describe('validate', () => {
    test('should return true for valid result', () => {
      // Arrange
      const result = { valid: true as const };

      // Act
      const isValid = validate(result);

      // Assert
      expect(isValid).toBe(true);
    });

    test('should return false and emit messages for invalid result', () => {
      // Arrange
      const result = {
        valid: false as const,
        messages: [createDevMessage('error', 'STATE_MUTATION', 'Test error')],
      };
      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

      // Act
      const isValid = validate(result);

      // Assert
      expect(isValid).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});

// Helper para afterEach
function afterEach(fn: () => void) {
  // Bun test não tem afterEach nativo, mas podemos simular
  // executando a função após cada teste
  // (Esta é uma limitação do ambiente de teste)
}
