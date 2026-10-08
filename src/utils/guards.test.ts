import { describe, it, expect } from "bun:test";
import { isReactive, isEventHandler, isEventOptions, isEventTuple } from "./guards";

describe("guards", () => {
  describe("isReactive", () => {
    it("retorna true para objeto com get e subscribe", () => {
      const reactive = {
        get: () => 42,
        subscribe: () => () => {}
      };
      expect(isReactive(reactive)).toBe(true);
    });

    it("retorna false para objeto sem get", () => {
      const obj = { subscribe: () => () => {} };
      expect(isReactive(obj)).toBe(false);
    });

    it("retorna false para objeto sem subscribe", () => {
      const obj = { get: () => 42 };
      expect(isReactive(obj)).toBe(false);
    });

    it("retorna false para null e undefined", () => {
      expect(isReactive(null)).toBe(false);
      expect(isReactive(undefined)).toBe(false);
    });

    it("retorna false para primitivos", () => {
      expect(isReactive(42)).toBe(false);
      expect(isReactive("test")).toBe(false);
      expect(isReactive(true)).toBe(false);
    });
  });

  describe("isEventHandler", () => {
    it("retorna true para função", () => {
      const fn = () => {};
      expect(isEventHandler(fn)).toBe(true);
    });

    it("retorna true para objeto com handleEvent", () => {
      const obj = { handleEvent: () => {} };
      expect(isEventHandler(obj)).toBe(true);
    });

    it("retorna false para objetos sem handleEvent", () => {
      const obj = { foo: "bar" };
      expect(isEventHandler(obj)).toBe(false);
    });

    it("retorna false para null e undefined", () => {
      expect(isEventHandler(null)).toBe(false);
      expect(isEventHandler(undefined)).toBe(false);
    });
  });

  describe("isEventOptions", () => {
    it("retorna true para boolean", () => {
      expect(isEventOptions(true)).toBe(true);
      expect(isEventOptions(false)).toBe(true);
    });

    it("retorna true para objeto", () => {
      expect(isEventOptions({ capture: true })).toBe(true);
      expect(isEventOptions({})).toBe(true);
    });

    it("retorna false para null", () => {
      expect(isEventOptions(null)).toBe(false);
    });

    it("retorna false para undefined", () => {
      expect(isEventOptions(undefined)).toBe(false);
    });
  });

  describe("isEventTuple", () => {
    it("retorna true para [handler]", () => {
      const tuple = [() => {}];
      expect(isEventTuple(tuple)).toBe(true);
    });

    it("retorna true para [handler, options]", () => {
      const tuple = [() => {}, { capture: true }];
      expect(isEventTuple(tuple)).toBe(true);
    });

    it("retorna true para [handler, boolean]", () => {
      const tuple = [() => {}, true];
      expect(isEventTuple(tuple)).toBe(true);
    });

    it("retorna false para array vazio", () => {
      expect(isEventTuple([])).toBe(false);
    });

    it("retorna false se primeiro elemento não é handler", () => {
      const tuple = ["not a function"];
      expect(isEventTuple(tuple)).toBe(false);
    });

    it("retorna false se segundo elemento não é valid option", () => {
      const tuple = [() => {}, "invalid"];
      expect(isEventTuple(tuple)).toBe(false);
    });

    it("retorna false para não-array", () => {
      expect(isEventTuple(null)).toBe(false);
      expect(isEventTuple(undefined)).toBe(false);
      expect(isEventTuple({})).toBe(false);
    });
  });
});
