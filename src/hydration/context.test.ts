import { describe, it, expect, beforeEach } from "bun:test";
import { setHydrateContext, getHydrateContext } from "./context";
import type { HydrateContext } from "./context";

describe("HydrateContext", () => {
  beforeEach(() => {
    setHydrateContext(null);
  });

  describe("setHydrateContext", () => {
    it("deve definir o contexto de hidratação", () => {
      const mockContext: HydrateContext = {
        cursor: null,
        root: document.createElement("div"),
        signals: new Map(),
      };

      setHydrateContext(mockContext);
      expect(getHydrateContext()).toBe(mockContext);
    });

    it("deve permitir definir contexto como null", () => {
      const mockContext: HydrateContext = {
        cursor: null,
        root: document.createElement("div"),
        signals: new Map(),
      };

      setHydrateContext(mockContext);
      setHydrateContext(null);
      expect(getHydrateContext()).toBeNull();
    });
  });

  describe("getHydrateContext", () => {
    it("deve retornar null quando não há contexto", () => {
      expect(getHydrateContext()).toBeNull();
    });

    it("deve retornar o contexto atual", () => {
      const mockContext: HydrateContext = {
        cursor: document.createTextNode("test"),
        root: document.createElement("section"),
        signals: new Map([["id1", { subscribe: () => () => {} } as any]]),
      };

      setHydrateContext(mockContext);
      const result = getHydrateContext();

      expect(result).toBe(mockContext);
      expect(result?.cursor).toBe(mockContext.cursor);
      expect(result?.root).toBe(mockContext.root);
      expect(result?.signals).toBe(mockContext.signals);
    });
  });
});
