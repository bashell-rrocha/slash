/**
 * Tests for dev-warnings-core.ts (Functional Core)
 * Pattern: AAA (Arrange, Act, Assert)
 */

import { describe, test, expect } from 'bun:test';
import {
  createDevMessage,
  detectDirectStateMutation,
  detectWatchWithoutCleanup,
  detectLargeObjectComparison,
  detectStateInComponent,
  detectNestedBatch,
  validateStatePayload,
  formatDevMessage,
  groupDevMessages,
  type DevMessage,
} from './dev-warnings-core';

describe('dev-warnings-core (Functional Core)', () => {
  describe('createDevMessage', () => {
    test('should create error message without hint or context', () => {
      // Arrange & Act
      const msg = createDevMessage('error', 'STATE_MUTATION', 'Test error');

      // Assert
      expect(msg.type).toBe('error');
      expect(msg.category).toBe('STATE_MUTATION');
      expect(msg.message).toBe('Test error');
      expect(msg.hint).toBeUndefined();
      expect(msg.context).toBeUndefined();
      expect(msg.timestamp).toBeGreaterThan(0);
    });

    test('should create warning message with hint', () => {
      // Arrange & Act
      const msg = createDevMessage(
        'warning',
        'PERFORMANCE',
        'Test warning',
        'This is a hint'
      );

      // Assert
      expect(msg.type).toBe('warning');
      expect(msg.category).toBe('PERFORMANCE');
      expect(msg.message).toBe('Test warning');
      expect(msg.hint).toBe('This is a hint');
      expect(msg.context).toBeUndefined();
    });

    test('should create info message with context', () => {
      // Arrange
      const context = { count: 42 };

      // Act
      const msg = createDevMessage(
        'info',
        'API_MISUSE',
        'Test info',
        undefined,
        context
      );

      // Assert
      expect(msg.type).toBe('info');
      expect(msg.category).toBe('API_MISUSE');
      expect(msg.message).toBe('Test info');
      expect(msg.hint).toBeUndefined();
      expect(msg.context).toEqual({ count: 42 });
    });
  });

  describe('detectDirectStateMutation', () => {
    test('should return valid when .set() was used', () => {
      // Arrange
      const oldState = { count: 0 };
      const newState = { count: 1 };
      const usedSetMethod = true;

      // Act
      const result = detectDirectStateMutation(oldState, newState, usedSetMethod);

      // Assert
      expect(result.valid).toBe(true);
    });

    test('should return valid when states are different objects', () => {
      // Arrange
      const oldState = { count: 0 };
      const newState = { count: 0 };
      const usedSetMethod = false;

      // Act
      const result = detectDirectStateMutation(oldState, newState, usedSetMethod);

      // Assert
      expect(result.valid).toBe(true);
    });

    test('should detect direct mutation (same object, no .set())', () => {
      // Arrange
      const state = { count: 0 };
      const usedSetMethod = false;

      // Act
      const result = detectDirectStateMutation(state, state, usedSetMethod);

      // Assert
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].type).toBe('error');
        expect(result.messages[0].category).toBe('STATE_MUTATION');
        expect(result.messages[0].message).toContain('Direct state mutation');
      }
    });
  });

  describe('detectWatchWithoutCleanup', () => {
    test('should return valid when watcher count is low', () => {
      // Arrange
      const watcherCount = 10;
      const maxWatchers = 1000;

      // Act
      const result = detectWatchWithoutCleanup(watcherCount, maxWatchers);

      // Assert
      expect(result.valid).toBe(true);
    });

    test('should return valid when watcher count equals max', () => {
      // Arrange
      const watcherCount = 1000;
      const maxWatchers = 1000;

      // Act
      const result = detectWatchWithoutCleanup(watcherCount, maxWatchers);

      // Assert
      expect(result.valid).toBe(true);
    });

    test('should detect high watcher count', () => {
      // Arrange
      const watcherCount = 1001;
      const maxWatchers = 1000;

      // Act
      const result = detectWatchWithoutCleanup(watcherCount, maxWatchers);

      // Assert
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].type).toBe('warning');
        expect(result.messages[0].category).toBe('MEMORY_LEAK');
        expect(result.messages[0].message).toContain('1001');
      }
    });

    test('should use default max watchers', () => {
      // Arrange
      const watcherCount = 1001;

      // Act
      const result = detectWatchWithoutCleanup(watcherCount);

      // Assert
      expect(result.valid).toBe(false);
    });
  });

  describe('detectLargeObjectComparison', () => {
    test('should return valid for primitives', () => {
      // Arrange
      const primitives = [42, 'string', true, undefined];

      // Act & Assert
      for (const value of primitives) {
        const result = detectLargeObjectComparison(value);
        expect(result.valid).toBe(true);
      }
    });

    test('should return valid for null', () => {
      // Arrange
      const value = null;

      // Act
      const result = detectLargeObjectComparison(value);

      // Assert
      expect(result.valid).toBe(true);
    });

    test('should return valid for small objects', () => {
      // Arrange
      const obj = { a: 1, b: 2, c: 3 };
      const maxKeys = 1000;

      // Act
      const result = detectLargeObjectComparison(obj, maxKeys);

      // Assert
      expect(result.valid).toBe(true);
    });

    test('should detect large objects', () => {
      // Arrange
      const obj: Record<string, number> = {};
      for (let i = 0; i < 1001; i++) {
        obj[`key${i}`] = i;
      }
      const maxKeys = 1000;

      // Act
      const result = detectLargeObjectComparison(obj, maxKeys);

      // Assert
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].type).toBe('warning');
        expect(result.messages[0].category).toBe('PERFORMANCE');
        expect(result.messages[0].message).toContain('1001 keys');
      }
    });
  });

  describe('detectStateInComponent', () => {
    test('should return valid for normal stack trace', () => {
      // Arrange
      const stackTrace = 'at createState (state.ts:10)\nat main (index.ts:5)';

      // Act
      const result = detectStateInComponent(stackTrace);

      // Assert
      expect(result.valid).toBe(true);
    });

    test('should detect state creation in component', () => {
      // Arrange
      const stackTrace =
        'at createState (state.ts:10)\nat MyComponent (component.tsx:15)';

      // Act
      const result = detectStateInComponent(stackTrace);

      // Assert
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].type).toBe('warning');
        expect(result.messages[0].category).toBe('REACTIVITY_VIOLATION');
        expect(result.messages[0].message).toContain('inside component');
      }
    });

    test('should detect state creation in render function', () => {
      // Arrange
      const stackTrace =
        'at createState (state.ts:10)\nat renderApp (render.ts:20)';

      // Act
      const result = detectStateInComponent(stackTrace);

      // Assert
      expect(result.valid).toBe(false);
    });
  });

  describe('detectNestedBatch', () => {
    test('should return valid for single batch', () => {
      // Arrange
      const batchDepth = 1;

      // Act
      const result = detectNestedBatch(batchDepth);

      // Assert
      expect(result.valid).toBe(true);
    });

    test('should return valid for no batch', () => {
      // Arrange
      const batchDepth = 0;

      // Act
      const result = detectNestedBatch(batchDepth);

      // Assert
      expect(result.valid).toBe(true);
    });

    test('should detect nested batches', () => {
      // Arrange
      const batchDepth = 2;

      // Act
      const result = detectNestedBatch(batchDepth);

      // Assert
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].type).toBe('warning');
        expect(result.messages[0].category).toBe('API_MISUSE');
        expect(result.messages[0].message).toContain('depth: 2');
      }
    });

    test('should detect deeply nested batches', () => {
      // Arrange
      const batchDepth = 5;

      // Act
      const result = detectNestedBatch(batchDepth);

      // Assert
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.messages[0].message).toContain('depth: 5');
      }
    });
  });

  describe('validateStatePayload', () => {
    test('should return valid for object payload', () => {
      // Arrange
      const payload = { count: 0 };

      // Act
      const result = validateStatePayload(payload);

      // Assert
      expect(result.valid).toBe(true);
    });

    test('should reject null payload', () => {
      // Arrange
      const payload = null;

      // Act
      const result = validateStatePayload(payload);

      // Assert
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].type).toBe('error');
        expect(result.messages[0].category).toBe('TYPE_MISMATCH');
        expect(result.messages[0].message).toContain('cannot be null');
      }
    });

    test('should reject primitive payloads', () => {
      // Arrange
      const primitives = [42, 'string', true, undefined];

      // Act & Assert
      for (const payload of primitives) {
        const result = validateStatePayload(payload);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.messages[0].type).toBe('error');
          expect(result.messages[0].category).toBe('TYPE_MISMATCH');
        }
      }
    });

    test('should validate custom expected type', () => {
      // Arrange
      const payload = 'string';
      const expectedType = 'string';

      // Act
      const result = validateStatePayload(payload, expectedType);

      // Assert
      expect(result.valid).toBe(true);
    });
  });

  describe('formatDevMessage', () => {
    test('should format error message', () => {
      // Arrange
      const msg = createDevMessage('error', 'STATE_MUTATION', 'Test error');

      // Act
      const formatted = formatDevMessage(msg);

      // Assert
      expect(formatted).toContain('❌');
      expect(formatted).toContain('[SLASH ERROR]');
      expect(formatted).toContain('[STATE_MUTATION]');
      expect(formatted).toContain('Test error');
    });

    test('should format warning message', () => {
      // Arrange
      const msg = createDevMessage('warning', 'PERFORMANCE', 'Test warning');

      // Act
      const formatted = formatDevMessage(msg);

      // Assert
      expect(formatted).toContain('⚠️');
      expect(formatted).toContain('[SLASH WARNING]');
      expect(formatted).toContain('[PERFORMANCE]');
      expect(formatted).toContain('Test warning');
    });

    test('should format info message', () => {
      // Arrange
      const msg = createDevMessage('info', 'API_MISUSE', 'Test info');

      // Act
      const formatted = formatDevMessage(msg);

      // Assert
      expect(formatted).toContain('ℹ️');
      expect(formatted).toContain('[SLASH INFO]');
      expect(formatted).toContain('[API_MISUSE]');
      expect(formatted).toContain('Test info');
    });

    test('should include hint when present', () => {
      // Arrange
      const msg = createDevMessage(
        'error',
        'STATE_MUTATION',
        'Test error',
        'This is a hint'
      );

      // Act
      const formatted = formatDevMessage(msg);

      // Assert
      expect(formatted).toContain('💡 Hint:');
      expect(formatted).toContain('This is a hint');
    });

    test('should include context when present', () => {
      // Arrange
      const msg = createDevMessage(
        'error',
        'STATE_MUTATION',
        'Test error',
        undefined,
        { count: 42 }
      );

      // Act
      const formatted = formatDevMessage(msg);

      // Assert
      expect(formatted).toContain('🔍 Context:');
      expect(formatted).toContain('"count": 42');
    });

    test('should include both hint and context', () => {
      // Arrange
      const msg = createDevMessage(
        'warning',
        'PERFORMANCE',
        'Test warning',
        'Optimize this',
        { items: 1000 }
      );

      // Act
      const formatted = formatDevMessage(msg);

      // Assert
      expect(formatted).toContain('💡 Hint:');
      expect(formatted).toContain('Optimize this');
      expect(formatted).toContain('🔍 Context:');
      expect(formatted).toContain('"items": 1000');
    });
  });

  describe('groupDevMessages', () => {
    test('should group empty array', () => {
      // Arrange
      const messages: DevMessage[] = [];

      // Act
      const grouped = groupDevMessages(messages);

      // Assert
      expect(grouped.size).toBe(0);
    });

    test('should group single message', () => {
      // Arrange
      const messages = [
        createDevMessage('error', 'STATE_MUTATION', 'Test error'),
      ];

      // Act
      const grouped = groupDevMessages(messages);

      // Assert
      expect(grouped.size).toBe(1);
      expect(grouped.get('STATE_MUTATION')).toHaveLength(1);
    });

    test('should group messages by category', () => {
      // Arrange
      const messages = [
        createDevMessage('error', 'STATE_MUTATION', 'Error 1'),
        createDevMessage('warning', 'PERFORMANCE', 'Warning 1'),
        createDevMessage('error', 'STATE_MUTATION', 'Error 2'),
        createDevMessage('info', 'API_MISUSE', 'Info 1'),
        createDevMessage('warning', 'PERFORMANCE', 'Warning 2'),
      ];

      // Act
      const grouped = groupDevMessages(messages);

      // Assert
      expect(grouped.size).toBe(3);
      expect(grouped.get('STATE_MUTATION')).toHaveLength(2);
      expect(grouped.get('PERFORMANCE')).toHaveLength(2);
      expect(grouped.get('API_MISUSE')).toHaveLength(1);
    });

    test('should preserve message order within groups', () => {
      // Arrange
      const messages = [
        createDevMessage('error', 'STATE_MUTATION', 'First'),
        createDevMessage('error', 'STATE_MUTATION', 'Second'),
        createDevMessage('error', 'STATE_MUTATION', 'Third'),
      ];

      // Act
      const grouped = groupDevMessages(messages);

      // Assert
      const stateMutations = grouped.get('STATE_MUTATION')!;
      expect(stateMutations[0].message).toBe('First');
      expect(stateMutations[1].message).toBe('Second');
      expect(stateMutations[2].message).toBe('Third');
    });
  });
});
