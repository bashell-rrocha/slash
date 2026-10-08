import { describe, it, expect } from "bun:test";
import { toStr, processClassValue } from "./helpers";

describe("helpers", () => {
  describe("toStr", () => {
    it("retorna string vazia para null", () => {
      expect(toStr(null)).toBe("");
    });

    it("retorna string vazia para undefined", () => {
      expect(toStr(undefined)).toBe("");
    });

    it("retorna string inalterada", () => {
      expect(toStr("hello")).toBe("hello");
    });

    it("converte número para string", () => {
      expect(toStr(42)).toBe("42");
      expect(toStr(0)).toBe("0");
    });

    it("converte boolean para string", () => {
      expect(toStr(true)).toBe("true");
      expect(toStr(false)).toBe("false");
    });

    it("converte objeto para string", () => {
      expect(toStr({})).toBe("[object Object]");
    });
  });

  describe("processClassValue", () => {
    it("retorna string inalterada", () => {
      expect(processClassValue("foo bar")).toBe("foo bar");
    });

    it("filtra valores falsy de array", () => {
      expect(processClassValue(["foo", false, "bar", null, "baz"])).toBe("foo bar baz");
    });

    it("junta array com espaço", () => {
      expect(processClassValue(["foo", "bar", "baz"])).toBe("foo bar baz");
    });

    it("retorna classes de objeto com valores truthy", () => {
      expect(processClassValue({ foo: true, bar: false, baz: true })).toBe("foo baz");
    });

    it("retorna string vazia para objeto vazio", () => {
      expect(processClassValue({})).toBe("");
    });

    it("retorna string vazia para null", () => {
      expect(processClassValue(null)).toBe("");
    });

    it("retorna string vazia para undefined", () => {
      expect(processClassValue(undefined)).toBe("");
    });

    it("retorna string vazia para número", () => {
      expect(processClassValue(42)).toBe("");
    });
  });
});
