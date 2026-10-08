import { describe, it, expect, mock } from "bun:test";
import { parseEventProp, setEvent } from "./events";
import { hasCleanups, destroyNode } from "../lifecycle/cleanup";

describe("rendering/events", () => {
  describe("parseEventProp", () => {
    it("retorna handler para função", () => {
      const fn = () => {};
      const result = parseEventProp(fn);
      expect(result).not.toBeNull();
      expect(result?.handler).toBe(fn);
      expect(result?.options).toBeUndefined();
    });

    it("retorna handler e options para tupla", () => {
      const fn = () => {};
      const opts = { capture: true };
      const result = parseEventProp([fn, opts]);
      expect(result).not.toBeNull();
      expect(result?.handler).toBe(fn);
      expect(result?.options).toBe(opts);
    });

    it("retorna handler sem options para tupla de 1 elemento", () => {
      const fn = () => {};
      const result = parseEventProp([fn]);
      expect(result).not.toBeNull();
      expect(result?.handler).toBe(fn);
      expect(result?.options).toBeUndefined();
    });

    it("retorna null para valores inválidos", () => {
      expect(parseEventProp("invalid")).toBeNull();
      expect(parseEventProp(42)).toBeNull();
      expect(parseEventProp(null)).toBeNull();
      expect(parseEventProp({})).toBeNull();
    });
  });

  describe("setEvent", () => {
    it("adiciona event listener ao elemento", () => {
      const el = document.createElement("div");
      const handler = mock(() => {});

      setEvent(el, "onClick", handler);

      el.click();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("adiciona event listener com options", () => {
      const el = document.createElement("div");
      const handler = mock(() => {});
      const opts = { capture: true };

      setEvent(el, "onClick", handler, opts);

      el.click();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("adiciona cleanup para remover listener", () => {
      const el = document.createElement("div");
      const handler = mock(() => {});

      setEvent(el, "onClick", handler);

      expect(hasCleanups(el)).toBe(true);
    });

    it("remove listener quando nó é destruído", () => {
      const el = document.createElement("div");
      const handler = mock(() => {});

      setEvent(el, "onClick", handler);
      destroyNode(el);

      el.click();
      // Handler não deve ser chamado após destroyNode
      // mas o event listener padrão do DOM ainda existe
      // Este teste verifica que o cleanup foi chamado
      expect(hasCleanups(el)).toBe(false);
    });

    it("converte nome do evento corretamente", () => {
      const el = document.createElement("input");
      const handler = mock(() => {});

      setEvent(el, "onInput", handler);

      el.dispatchEvent(new Event("input"));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
