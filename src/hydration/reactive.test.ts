import { describe, it, expect, beforeEach } from "bun:test";
import {
  hydrateReactiveAttributes,
  hydrateReactiveNodes,
  walkAndHydrateReactiveAttributes,
} from "./reactive";
import type { Reactive } from "../types";

describe("Hydration Signals", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
  });

  describe("hydrateReactiveAttributes", () => {
    it("deve hidratar atributo data-reactive-value", () => {
      const element = document.createElement("input");
      element.setAttribute("data-reactive-value", "signal1");

      let subscriber: ((value: string) => void) | null = null;
      const signal: Reactive<string> = {
        get: () => "",
        subscribe: (fn: (value: string) => void) => {
          subscriber = fn;
          return () => {};
        },
      };

      const signals = new Map([["signal1", signal]]);
      hydrateReactiveAttributes(element, signals);

      // Atributo deve ser removido
      expect(element.hasAttribute("data-reactive-value")).toBe(false);

      // Atualizar signal deve atualizar o valor
      subscriber!("test value");
      expect((element as HTMLInputElement).value).toBe("test value");
    });

    it("deve hidratar atributo data-reactive-checked", () => {
      const element = document.createElement("input");
      element.type = "checkbox";
      element.setAttribute("data-reactive-checked", "signal2");

      let subscriber: ((value: boolean) => void) | null = null;
      const signal: Reactive<boolean> = {
        get: () => false,
        subscribe: (fn: (value: boolean) => void) => {
          subscriber = fn;
          return () => {};
        },
      };

      const signals = new Map([["signal2", signal]]);
      hydrateReactiveAttributes(element, signals);

      subscriber!(true);
      expect((element as HTMLInputElement).checked).toBe(true);

      subscriber!(false);
      expect((element as HTMLInputElement).checked).toBe(false);
    });

    it("deve hidratar atributo data-reactive-class", () => {
      const element = document.createElement("div");
      element.setAttribute("data-reactive-class", "signal3");

      let subscriber: ((value: string) => void) | null = null;
      const signal: Reactive<string> = {
        get: () => "",
        subscribe: (fn: (value: string) => void) => {
          subscriber = fn;
          return () => {};
        },
      };

      const signals = new Map([["signal3", signal]]);
      hydrateReactiveAttributes(element, signals);

      subscriber!("active highlight");
      expect(element.className).toBe("active highlight");
    });

    it("deve hidratar atributos genéricos", () => {
      const element = document.createElement("div");
      element.setAttribute("data-reactive-title", "signal4");

      let subscriber: ((value: string) => void) | null = null;
      const signal: Reactive<string> = {
        get: () => "",
        subscribe: (fn: (value: string) => void) => {
          subscriber = fn;
          return () => {};
        },
      };

      const signals = new Map([["signal4", signal]]);
      hydrateReactiveAttributes(element, signals);

      subscriber!("My Title");
      expect(element.getAttribute("title")).toBe("My Title");
    });

    it("deve ignorar signals não encontrados no mapa", () => {
      const element = document.createElement("div");
      element.setAttribute("data-reactive-class", "unknown-signal");

      const signals = new Map();
      hydrateReactiveAttributes(element, signals);

      // Não deve lançar erro
      expect(element.hasAttribute("data-reactive-class")).toBe(true);
    });
  });

  describe("hydrateReactiveNodes", () => {
    it("deve hidratar nós de texto reativos", () => {
      container.innerHTML = `
        <!--reactive-start:sig1-->
        Old Text
        <!--reactive-end:sig1-->
      `;

      let subscriber: ((value: string) => void) | null = null;
      const signal: Reactive<string> = {
        get: () => "Initial",
        subscribe: (fn: (value: string) => void) => {
          subscriber = fn;
          fn("Initial");
          return () => {};
        },
      };

      const signals = new Map([["sig1", signal]]);
      hydrateReactiveNodes(container, signals);

      subscriber!("New Text");

      const textContent = Array.from(container.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim())
        .filter(Boolean)
        .join("");

      expect(textContent).toContain("New Text");
    });

    it("deve lidar com valores null/false", () => {
      container.innerHTML = `
        <!--reactive-start:sig2-->
        Old
        <!--reactive-end:sig2-->
      `;

      let subscriber: ((value: string | null) => void) | null = null;
      const signal: Reactive<string | null> = {
        get: () => "Old",
        subscribe: (fn: (value: string | null) => void) => {
          subscriber = fn;
          return () => {};
        },
      };

      const signals = new Map([["sig2", signal]]);
      hydrateReactiveNodes(container, signals);

      subscriber!(null);

      const textNodes = Array.from(container.childNodes).filter(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()
      );

      expect(textNodes.length).toBe(0);
    });

    it("deve lidar com arrays", () => {
      container.innerHTML = `
        <!--reactive-start:sig3-->
        <!--reactive-end:sig3-->
      `;

      let subscriber: ((value: string[] | any) => void) | null = null;
      const signal: Reactive<string[]> = {
        get: () => [],
        subscribe: (fn: (value: string[]) => void) => {
          subscriber = fn as any;
          return () => {};
        },
      };

      const signals = new Map([["sig3", signal]]);
      hydrateReactiveNodes(container, signals);

      subscriber!(["a", "b", "c"]);

      const textContent = Array.from(container.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join("");

      expect(textContent).toContain("a");
      expect(textContent).toContain("b");
      expect(textContent).toContain("c");
    });

    it("deve lidar com elementos Node", () => {
      container.innerHTML = `
        <!--reactive-start:sig4-->
        <!--reactive-end:sig4-->
      `;

      let subscriber: ((value: Node) => void) | null = null;
      const signal: Reactive<Node> = {
        get: () => document.createTextNode(""),
        subscribe: (fn: (value: Node) => void) => {
          subscriber = fn;
          return () => {};
        },
      };

      const signals = new Map([["sig4", signal]]);
      hydrateReactiveNodes(container, signals);

      const span = document.createElement("span");
      span.textContent = "Dynamic Element";
      subscriber!(span);

      expect(container.querySelector("span")).not.toBeNull();
      expect(container.textContent).toContain("Dynamic Element");
    });
  });

  describe("walkAndHydrateReactiveAttributes", () => {
    it("deve hidratar atributos em toda a árvore", () => {
      container.innerHTML = `
        <div data-reactive-class="sig1">
          <span data-reactive-title="sig2">
            <input data-reactive-value="sig3" />
          </span>
        </div>
      `;

      const subscribers: Array<(value: string) => void> = [];
      const createSignal = (): Reactive<string> => ({
        get: () => "",
        subscribe: (fn: (value: string) => void) => {
          subscribers.push(fn);
          return () => {};
        },
      });

      const signals = new Map([
        ["sig1", createSignal()],
        ["sig2", createSignal()],
        ["sig3", createSignal()],
      ]);

      walkAndHydrateReactiveAttributes(container, signals);

      // Todos os atributos data-reactive-* devem ser removidos
      expect(container.querySelector("[data-reactive-class]")).toBeNull();
      expect(container.querySelector("[data-reactive-title]")).toBeNull();
      expect(container.querySelector("[data-reactive-value]")).toBeNull();

      // Deve ter criado 3 subscribers
      expect(subscribers.length).toBe(3);
    });

    it("não deve hidratar nós que não são elementos", () => {
      const textNode = document.createTextNode("Just text");
      container.appendChild(textNode);

      const signals = new Map();

      // Não deve lançar erro
      walkAndHydrateReactiveAttributes(textNode, signals);

      expect(textNode.textContent).toBe("Just text");
    });
  });
});
