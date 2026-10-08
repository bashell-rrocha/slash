/**
 * Testes para Functional Core do Component Tracking System
 *
 * Testes unitários puros, sem side effects ou dependências de DOM.
 * Segue padrão AAA (Arrange, Act, Assert).
 */

import { describe, test, expect } from "bun:test";
import { createState } from "../state";
import type { State } from "../state";
import {
  createStateTracker,
  trackState,
  startTracking,
  stopTracking,
  clearTrackedStates,
  getTrackedStates,
  hasTrackedStates,
  isStateTracked,
  computeTrackingCommand,
  applyTrackingCommand,
  type StateTracker,
} from "./element-core";

describe("rendering/element-core.ts - Functional Core", () => {
  describe("createStateTracker()", () => {
    test("deve criar tracker vazio no estado inicial", () => {
      // Act
      const tracker = createStateTracker();

      // Assert
      expect(tracker.states.size).toBe(0);
      expect(tracker.isTracking).toBe(false);
    });

    test("deve criar novo tracker a cada chamada", () => {
      // Act
      const tracker1 = createStateTracker();
      const tracker2 = createStateTracker();

      // Assert
      expect(tracker1).not.toBe(tracker2);
      expect(tracker1.states).not.toBe(tracker2.states);
    });
  });

  describe("startTracking()", () => {
    test("deve ativar tracking quando desativado", () => {
      // Arrange
      const tracker = createStateTracker();
      expect(tracker.isTracking).toBe(false);

      // Act
      const newTracker = startTracking(tracker);

      // Assert
      expect(newTracker.isTracking).toBe(true);
      expect(tracker.isTracking).toBe(false); // Original não muda
    });

    test("deve retornar mesmo tracker quando já está tracking", () => {
      // Arrange
      const tracker = startTracking(createStateTracker());

      // Act
      const newTracker = startTracking(tracker);

      // Assert
      expect(newTracker).toBe(tracker);
    });

    test("deve preservar states rastreados ao ativar tracking", () => {
      // Arrange
      const state = createState({ value: 1 });
      let tracker = createStateTracker();
      tracker = startTracking(tracker);
      tracker = trackState(tracker, state);
      tracker = stopTracking(tracker);

      // Act
      const newTracker = startTracking(tracker);

      // Assert
      expect(newTracker.isTracking).toBe(true);
      expect(newTracker.states.size).toBe(1);
      expect(newTracker.states.has(state)).toBe(true);
    });
  });

  describe("stopTracking()", () => {
    test("deve desativar tracking quando ativado", () => {
      // Arrange
      const tracker = startTracking(createStateTracker());
      expect(tracker.isTracking).toBe(true);

      // Act
      const newTracker = stopTracking(tracker);

      // Assert
      expect(newTracker.isTracking).toBe(false);
      expect(tracker.isTracking).toBe(true); // Original não muda
    });

    test("deve retornar mesmo tracker quando já está parado", () => {
      // Arrange
      const tracker = createStateTracker();

      // Act
      const newTracker = stopTracking(tracker);

      // Assert
      expect(newTracker).toBe(tracker);
    });

    test("deve preservar states rastreados ao parar tracking", () => {
      // Arrange
      const state = createState({ value: 1 });
      let tracker = createStateTracker();
      tracker = startTracking(tracker);
      tracker = trackState(tracker, state);

      // Act
      const newTracker = stopTracking(tracker);

      // Assert
      expect(newTracker.isTracking).toBe(false);
      expect(newTracker.states.size).toBe(1);
      expect(newTracker.states.has(state)).toBe(true);
    });
  });

  describe("trackState()", () => {
    test("deve adicionar state quando tracking está ativo", () => {
      // Arrange
      const state = createState({ value: 1 });
      let tracker = createStateTracker();
      tracker = startTracking(tracker);

      // Act
      const newTracker = trackState(tracker, state);

      // Assert
      expect(newTracker.states.size).toBe(1);
      expect(newTracker.states.has(state)).toBe(true);
      expect(tracker.states.size).toBe(0); // Original não muda
    });

    test("não deve adicionar state quando tracking está inativo", () => {
      // Arrange
      const state = createState({ value: 1 });
      const tracker = createStateTracker();

      // Act
      const newTracker = trackState(tracker, state);

      // Assert
      expect(newTracker).toBe(tracker);
      expect(newTracker.states.size).toBe(0);
    });

    test("deve adicionar múltiplos states diferentes", () => {
      // Arrange
      const state1 = createState({ value: 1 });
      const state2 = createState({ value: 2 });
      const state3 = createState({ value: 3 });
      let tracker = createStateTracker();
      tracker = startTracking(tracker);

      // Act
      tracker = trackState(tracker, state1);
      tracker = trackState(tracker, state2);
      tracker = trackState(tracker, state3);

      // Assert
      expect(tracker.states.size).toBe(3);
      expect(tracker.states.has(state1)).toBe(true);
      expect(tracker.states.has(state2)).toBe(true);
      expect(tracker.states.has(state3)).toBe(true);
    });

    test("deve retornar mesmo tracker ao adicionar state já rastreado", () => {
      // Arrange
      const state = createState({ value: 1 });
      let tracker = createStateTracker();
      tracker = startTracking(tracker);
      tracker = trackState(tracker, state);

      // Act
      const newTracker = trackState(tracker, state);

      // Assert
      expect(newTracker).toBe(tracker);
      expect(newTracker.states.size).toBe(1);
    });
  });

  describe("clearTrackedStates()", () => {
    test("deve limpar todos os states rastreados", () => {
      // Arrange
      const state1 = createState({ value: 1 });
      const state2 = createState({ value: 2 });
      let tracker = createStateTracker();
      tracker = startTracking(tracker);
      tracker = trackState(tracker, state1);
      tracker = trackState(tracker, state2);
      expect(tracker.states.size).toBe(2);

      // Act
      const newTracker = clearTrackedStates(tracker);

      // Assert
      expect(newTracker.states.size).toBe(0);
      expect(tracker.states.size).toBe(2); // Original não muda
    });

    test("deve manter estado de tracking ao limpar states", () => {
      // Arrange
      const state = createState({ value: 1 });
      let tracker = createStateTracker();
      tracker = startTracking(tracker);
      tracker = trackState(tracker, state);

      // Act
      const newTracker = clearTrackedStates(tracker);

      // Assert
      expect(newTracker.isTracking).toBe(true);
      expect(newTracker.states.size).toBe(0);
    });

    test("deve retornar mesmo tracker se já está vazio", () => {
      // Arrange
      const tracker = createStateTracker();

      // Act
      const newTracker = clearTrackedStates(tracker);

      // Assert
      expect(newTracker).toBe(tracker);
    });
  });

  describe("getTrackedStates()", () => {
    test("deve retornar array vazio para tracker sem states", () => {
      // Arrange
      const tracker = createStateTracker();

      // Act
      const states = getTrackedStates(tracker);

      // Assert
      expect(states).toBeInstanceOf(Array);
      expect(states.length).toBe(0);
    });

    test("deve retornar array com states rastreados", () => {
      // Arrange
      const state1 = createState({ value: 1 });
      const state2 = createState({ value: 2 });
      let tracker = createStateTracker();
      tracker = startTracking(tracker);
      tracker = trackState(tracker, state1);
      tracker = trackState(tracker, state2);

      // Act
      const states = getTrackedStates(tracker);

      // Assert
      expect(states.length).toBe(2);
      expect(states).toContain(state1);
      expect(states).toContain(state2);
    });

    test("deve retornar array readonly", () => {
      // Arrange
      const state = createState({ value: 1 });
      let tracker = createStateTracker();
      tracker = startTracking(tracker);
      tracker = trackState(tracker, state);

      // Act
      const states = getTrackedStates(tracker);

      // Assert - TypeScript deve garantir readonly, mas verificamos comportamento
      expect(states).toBeInstanceOf(Array);
      expect(states.length).toBe(1);
    });
  });

  describe("hasTrackedStates()", () => {
    test("deve retornar false para tracker vazio", () => {
      // Arrange
      const tracker = createStateTracker();

      // Act & Assert
      expect(hasTrackedStates(tracker)).toBe(false);
    });

    test("deve retornar true para tracker com states", () => {
      // Arrange
      const state = createState({ value: 1 });
      let tracker = createStateTracker();
      tracker = startTracking(tracker);
      tracker = trackState(tracker, state);

      // Act & Assert
      expect(hasTrackedStates(tracker)).toBe(true);
    });

    test("deve retornar false após limpar states", () => {
      // Arrange
      const state = createState({ value: 1 });
      let tracker = createStateTracker();
      tracker = startTracking(tracker);
      tracker = trackState(tracker, state);
      tracker = clearTrackedStates(tracker);

      // Act & Assert
      expect(hasTrackedStates(tracker)).toBe(false);
    });
  });

  describe("isStateTracked()", () => {
    test("deve retornar false para state não rastreado", () => {
      // Arrange
      const state = createState({ value: 1 });
      const tracker = createStateTracker();

      // Act & Assert
      expect(isStateTracked(tracker, state)).toBe(false);
    });

    test("deve retornar true para state rastreado", () => {
      // Arrange
      const state = createState({ value: 1 });
      let tracker = createStateTracker();
      tracker = startTracking(tracker);
      tracker = trackState(tracker, state);

      // Act & Assert
      expect(isStateTracked(tracker, state)).toBe(true);
    });

    test("deve retornar false para state diferente", () => {
      // Arrange
      const state1 = createState({ value: 1 });
      const state2 = createState({ value: 2 });
      let tracker = createStateTracker();
      tracker = startTracking(tracker);
      tracker = trackState(tracker, state1);

      // Act & Assert
      expect(isStateTracked(tracker, state2)).toBe(false);
    });
  });

  describe("computeTrackingCommand()", () => {
    describe("operação 'track'", () => {
      test("deve retornar NO_OP quando state não fornecido", () => {
        // Arrange
        const tracker = startTracking(createStateTracker());

        // Act
        const command = computeTrackingCommand(tracker, "track");

        // Assert
        expect(command.type).toBe("NO_OP");
      });

      test("deve retornar NO_OP quando tracking está inativo", () => {
        // Arrange
        const state = createState({ value: 1 });
        const tracker = createStateTracker();

        // Act
        const command = computeTrackingCommand(tracker, "track", state);

        // Assert
        expect(command.type).toBe("NO_OP");
      });

      test("deve retornar NO_OP quando state já está rastreado", () => {
        // Arrange
        const state = createState({ value: 1 });
        let tracker = createStateTracker();
        tracker = startTracking(tracker);
        tracker = trackState(tracker, state);

        // Act
        const command = computeTrackingCommand(tracker, "track", state);

        // Assert
        expect(command.type).toBe("NO_OP");
      });

      test("deve retornar TRACK_STATE quando deve rastrear", () => {
        // Arrange
        const state = createState({ value: 1 });
        const tracker = startTracking(createStateTracker());

        // Act
        const command = computeTrackingCommand(tracker, "track", state);

        // Assert
        expect(command.type).toBe("TRACK_STATE");
        if (command.type === "TRACK_STATE") {
          expect(command.state).toBe(state);
        }
      });
    });

    describe("operação 'start'", () => {
      test("deve retornar NO_OP quando tracking já está ativo", () => {
        // Arrange
        const tracker = startTracking(createStateTracker());

        // Act
        const command = computeTrackingCommand(tracker, "start");

        // Assert
        expect(command.type).toBe("NO_OP");
      });

      test("deve retornar START_TRACKING quando tracking está inativo", () => {
        // Arrange
        const tracker = createStateTracker();

        // Act
        const command = computeTrackingCommand(tracker, "start");

        // Assert
        expect(command.type).toBe("START_TRACKING");
      });
    });

    describe("operação 'stop'", () => {
      test("deve retornar NO_OP quando tracking já está inativo", () => {
        // Arrange
        const tracker = createStateTracker();

        // Act
        const command = computeTrackingCommand(tracker, "stop");

        // Assert
        expect(command.type).toBe("NO_OP");
      });

      test("deve retornar STOP_TRACKING quando tracking está ativo", () => {
        // Arrange
        const tracker = startTracking(createStateTracker());

        // Act
        const command = computeTrackingCommand(tracker, "stop");

        // Assert
        expect(command.type).toBe("STOP_TRACKING");
      });
    });

    describe("operação 'clear'", () => {
      test("deve retornar NO_OP quando não há states rastreados", () => {
        // Arrange
        const tracker = createStateTracker();

        // Act
        const command = computeTrackingCommand(tracker, "clear");

        // Assert
        expect(command.type).toBe("NO_OP");
      });

      test("deve retornar CLEAR_TRACKING quando há states rastreados", () => {
        // Arrange
        const state = createState({ value: 1 });
        let tracker = createStateTracker();
        tracker = startTracking(tracker);
        tracker = trackState(tracker, state);

        // Act
        const command = computeTrackingCommand(tracker, "clear");

        // Assert
        expect(command.type).toBe("CLEAR_TRACKING");
      });
    });
  });

  describe("applyTrackingCommand()", () => {
    test("deve aplicar comando TRACK_STATE", () => {
      // Arrange
      const state = createState({ value: 1 });
      const tracker = startTracking(createStateTracker());
      const command = { type: "TRACK_STATE" as const, state };

      // Act
      const newTracker = applyTrackingCommand(tracker, command);

      // Assert
      expect(newTracker.states.has(state)).toBe(true);
    });

    test("deve aplicar comando START_TRACKING", () => {
      // Arrange
      const tracker = createStateTracker();
      const command = { type: "START_TRACKING" as const };

      // Act
      const newTracker = applyTrackingCommand(tracker, command);

      // Assert
      expect(newTracker.isTracking).toBe(true);
    });

    test("deve aplicar comando STOP_TRACKING", () => {
      // Arrange
      const tracker = startTracking(createStateTracker());
      const command = { type: "STOP_TRACKING" as const };

      // Act
      const newTracker = applyTrackingCommand(tracker, command);

      // Assert
      expect(newTracker.isTracking).toBe(false);
    });

    test("deve aplicar comando CLEAR_TRACKING", () => {
      // Arrange
      const state = createState({ value: 1 });
      let tracker = createStateTracker();
      tracker = startTracking(tracker);
      tracker = trackState(tracker, state);
      const command = { type: "CLEAR_TRACKING" as const };

      // Act
      const newTracker = applyTrackingCommand(tracker, command);

      // Assert
      expect(newTracker.states.size).toBe(0);
    });

    test("deve aplicar comando NO_OP sem mudanças", () => {
      // Arrange
      const state = createState({ value: 1 });
      let tracker = createStateTracker();
      tracker = startTracking(tracker);
      tracker = trackState(tracker, state);
      const command = { type: "NO_OP" as const };

      // Act
      const newTracker = applyTrackingCommand(tracker, command);

      // Assert
      expect(newTracker).toBe(tracker);
    });
  });

  describe("Fluxo completo de tracking (integração de funções puras)", () => {
    test("deve simular ciclo completo de tracking", () => {
      // Arrange
      const state1 = createState({ value: 1 });
      const state2 = createState({ value: 2 });

      // Act & Assert - Criar tracker
      let tracker = createStateTracker();
      expect(tracker.isTracking).toBe(false);
      expect(tracker.states.size).toBe(0);

      // Act & Assert - Iniciar tracking
      tracker = startTracking(tracker);
      expect(tracker.isTracking).toBe(true);

      // Act & Assert - Rastrear states
      tracker = trackState(tracker, state1);
      tracker = trackState(tracker, state2);
      expect(tracker.states.size).toBe(2);
      expect(hasTrackedStates(tracker)).toBe(true);

      // Act & Assert - Verificar states
      const trackedStates = getTrackedStates(tracker);
      expect(trackedStates.length).toBe(2);
      expect(isStateTracked(tracker, state1)).toBe(true);
      expect(isStateTracked(tracker, state2)).toBe(true);

      // Act & Assert - Parar tracking
      tracker = stopTracking(tracker);
      expect(tracker.isTracking).toBe(false);
      expect(tracker.states.size).toBe(2); // States preservados

      // Act & Assert - Limpar states
      tracker = clearTrackedStates(tracker);
      expect(tracker.states.size).toBe(0);
      expect(hasTrackedStates(tracker)).toBe(false);
    });

    test("deve processar comandos em sequência", () => {
      // Arrange
      const state = createState({ value: 1 });
      let tracker = createStateTracker();

      // Act - Processar comandos
      const cmd1 = computeTrackingCommand(tracker, "start");
      tracker = applyTrackingCommand(tracker, cmd1);

      const cmd2 = computeTrackingCommand(tracker, "track", state);
      tracker = applyTrackingCommand(tracker, cmd2);

      const cmd3 = computeTrackingCommand(tracker, "stop");
      tracker = applyTrackingCommand(tracker, cmd3);

      // Assert
      expect(tracker.isTracking).toBe(false);
      expect(tracker.states.size).toBe(1);
      expect(isStateTracked(tracker, state)).toBe(true);
    });
  });

  describe("Imutabilidade", () => {
    test("funções não devem mutar tracker original", () => {
      // Arrange
      const state = createState({ value: 1 });
      const original = createStateTracker();
      const originalIsTracking = original.isTracking;
      const originalStatesSize = original.states.size;

      // Act - Aplicar múltiplas transformações
      const t1 = startTracking(original);
      const t2 = trackState(t1, state);
      const t3 = stopTracking(t2);
      const t4 = clearTrackedStates(t3);

      // Assert - Original não deve ter mudado
      expect(original.isTracking).toBe(originalIsTracking);
      expect(original.states.size).toBe(originalStatesSize);

      // Assert - Cada transformação cria novo tracker
      expect(t1).not.toBe(original);
      expect(t2).not.toBe(t1);
      expect(t3).not.toBe(t2);
      expect(t4).not.toBe(t3);
    });

    test("getTrackedStates não deve permitir mutação do Set interno", () => {
      // Arrange
      const state1 = createState({ value: 1 });
      const state2 = createState({ value: 2 });
      let tracker = createStateTracker();
      tracker = startTracking(tracker);
      tracker = trackState(tracker, state1);

      // Act
      const states = getTrackedStates(tracker);

      // Tentar "mutar" (não deve afetar tracker original)
      // TypeScript previne, mas testar comportamento runtime
      (states as any).push(state2);

      // Assert - Tracker original não mudou
      expect(tracker.states.size).toBe(1);
      expect(isStateTracked(tracker, state2)).toBe(false);
    });
  });
});
