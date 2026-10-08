import { describe, it, expect } from "bun:test";
import { appendChildSmart, appendReactiveChild, appendNodeSafe } from "./children";
import type { Reactive } from "../types";

// Helper para criar signal mock
function createSignal<T>(initial: T): Reactive<T> & { set: (v: T) => void } {
  let value = initial;
  const subscribers = new Set<(v: T) => void>();

  return {
    get: () => value,
    subscribe: (fn: (v: T) => void) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    set: (newValue: T) => {
      value = newValue;
      subscribers.forEach((fn) => fn(value));
    },
  };
}

describe("rendering/children", () => {
  describe("appendNodeSafe", () => {
    it("adiciona node ao parent", () => {
      const parent = document.createElement("div");
      const child = document.createElement("span");
      appendNodeSafe(parent, child);
      expect(parent.children.length).toBe(1);
      expect(parent.children[0]).toBe(child);
    });

    it("consome DocumentFragment (não clona)", () => {
      const parent = document.createElement("div");
      const frag = document.createDocumentFragment();
      const span = document.createElement("span");
      frag.appendChild(span);

      appendNodeSafe(parent, frag);
      expect(parent.children.length).toBe(1);
      // Fragment foi consumido, então original está vazio
      expect(frag.childNodes.length).toBe(0);
    });

    it("move node de parent diferente (preserva event listeners)", () => {
      const parent1 = document.createElement("div");
      const parent2 = document.createElement("div");
      const child = document.createElement("span");

      parent1.appendChild(child);
      appendNodeSafe(parent2, child);

      // Node foi movido, não clonado
      expect(parent1.children.length).toBe(0);
      expect(parent2.children.length).toBe(1);
      expect(parent2.children[0]).toBe(child);
    });
  });

  describe("appendChildSmart", () => {
    it("não adiciona null", () => {
      const parent = document.createElement("div");
      appendChildSmart(parent, null);
      expect(parent.childNodes.length).toBe(0);
    });

    it("não adiciona false", () => {
      const parent = document.createElement("div");
      appendChildSmart(parent, false);
      expect(parent.childNodes.length).toBe(0);
    });

    it("adiciona texto para string", () => {
      const parent = document.createElement("div");
      appendChildSmart(parent, "hello");
      expect(parent.textContent).toBe("hello");
    });

    it("adiciona texto para número", () => {
      const parent = document.createElement("div");
      appendChildSmart(parent, 42);
      expect(parent.textContent).toBe("42");
    });

    it("adiciona Node diretamente", () => {
      const parent = document.createElement("div");
      const child = document.createElement("span");
      appendChildSmart(parent, child);
      expect(parent.children[0]).toBe(child);
    });

    it("adiciona array de children recursivamente", () => {
      const parent = document.createElement("div");
      appendChildSmart(parent, ["hello", " ", "world"]);
      expect(parent.textContent).toBe("hello world");
    });

    it("lança erro para função", () => {
      const parent = document.createElement("div");
      expect(() => {
        appendChildSmart(parent, () => "test");
      }).toThrow("Function children are no longer supported");
    });
  });

  describe("appendReactiveChild", () => {
    it("renderiza valor inicial do signal", () => {
      const parent = document.createElement("div");
      const sig = createSignal("initial");
      appendReactiveChild(parent, sig);

      const textNodes = Array.from(parent.childNodes).filter(
        (n) => n.nodeType === Node.TEXT_NODE
      );
      expect(textNodes.length).toBe(1);
      expect(textNodes[0]?.textContent).toBe("initial");
    });

    it("atualiza quando signal muda", () => {
      const parent = document.createElement("div");
      const sig = createSignal("initial");
      appendReactiveChild(parent, sig);

      sig.set("updated");

      const textNodes = Array.from(parent.childNodes).filter(
        (n) => n.nodeType === Node.TEXT_NODE
      );
      expect(textNodes[0]?.textContent).toBe("updated");
    });

    it("renderiza null como vazio", () => {
      const parent = document.createElement("div");
      const sig = createSignal<string | null>("initial");
      appendReactiveChild(parent, sig);

      sig.set(null);

      const textNodes = Array.from(parent.childNodes).filter(
        (n) => n.nodeType === Node.TEXT_NODE
      );
      expect(textNodes.length).toBe(0);
    });

    it("renderiza array de valores", () => {
      const parent = document.createElement("div");
      const sig = createSignal<string[]>(["a", "b", "c"]);
      appendReactiveChild(parent, sig);

      const textNodes = Array.from(parent.childNodes).filter(
        (n) => n.nodeType === Node.TEXT_NODE
      );
      expect(textNodes.length).toBe(3);
      expect(textNodes.map((n) => n.textContent).join("")).toBe("abc");
    });

    it("adiciona marcadores de comentário", () => {
      const parent = document.createElement("div");
      const sig = createSignal("test");
      appendReactiveChild(parent, sig);

      const comments = Array.from(parent.childNodes).filter(
        (n) => n.nodeType === Node.COMMENT_NODE
      );
      expect(comments.length).toBe(2);
      expect(comments[0]?.textContent).toBe("sig:start");
      expect(comments[1]?.textContent).toBe("sig:end");
    });
  });
});
