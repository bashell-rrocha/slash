import { describe, it, expect, beforeEach, mock } from "bun:test";
import { skipReactiveMarkers, hydrateChild, hHydrate } from "./walker";
import { setHydrateContext, getHydrateContext } from "./context";
import type { HydrateContext } from "./context";
import type { Reactive } from "../types";

describe("Hydration Walker", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    setHydrateContext(null);
  });

  describe("skipReactiveMarkers", () => {
    it("deve pular marcadores de signal", () => {
      container.innerHTML = `<div>Before</div><!--reactive-start:sig1--><span>Signal Content</span><!--reactive-end:sig1--><div>After</div>`;

      const comments = Array.from(container.childNodes).filter(
        n => n.nodeType === Node.COMMENT_NODE
      );

      const ctx: HydrateContext = {
        cursor: comments[0], // reactive-start
        root: container,
        signals: new Map(),
      };

      setHydrateContext(ctx);
      skipReactiveMarkers();

      // Cursor deve ter pulado para depois do reactive-end
      const afterDiv = Array.from(container.childNodes).find(
        n => n.nodeType === Node.ELEMENT_NODE && n.textContent === "After"
      );
      expect(ctx.cursor).toBe(afterDiv ?? null);
    });

    it("deve lidar com signals aninhados", () => {
      container.innerHTML = `<!--reactive-start:outer--><!--reactive-start:inner--><!--reactive-end:inner--><!--reactive-end:outer--><div>Next</div>`;

      const comments = Array.from(container.childNodes).filter(
        n => n.nodeType === Node.COMMENT_NODE
      );

      const ctx: HydrateContext = {
        cursor: comments[0], // reactive-start:outer
        root: container,
        signals: new Map(),
      };

      setHydrateContext(ctx);
      skipReactiveMarkers();

      // Deve ter pulado todos os marcadores aninhados
      const nextDiv = container.querySelector("div");
      expect(ctx.cursor).toBe(nextDiv);
    });

    it("não deve fazer nada se não há contexto", () => {
      setHydrateContext(null);
      skipReactiveMarkers(); // Não deve lançar erro
      expect(getHydrateContext()).toBeNull();
    });
  });

  describe("hydrateChild", () => {
    it("deve ignorar null e false", () => {
      const ctx: HydrateContext = {
        cursor: container.firstChild,
        root: container,
        signals: new Map(),
      };

      setHydrateContext(ctx);
      const initialCursor = ctx.cursor;

      hydrateChild(null);
      expect(ctx.cursor).toBe(initialCursor);

      hydrateChild(false);
      expect(ctx.cursor).toBe(initialCursor);
    });

    it("deve processar arrays recursivamente", () => {
      container.innerHTML = `
        <div>1</div>
        <div>2</div>
        <div>3</div>
      `;

      const ctx: HydrateContext = {
        cursor: container.firstChild,
        root: container,
        signals: new Map(),
      };

      setHydrateContext(ctx);
      hydrateChild(["a", "b", "c"]);

      // Array não muda cursor diretamente, mas processa cada item
      expect(getHydrateContext()).not.toBeNull();
    });

    it("deve processar children reativos", () => {
      const signal: Reactive<string> = {
        subscribe: () => () => {},
      } as any;

      const ctx: HydrateContext = {
        cursor: null,
        root: container,
        signals: new Map(),
      };

      setHydrateContext(ctx);

      // Deve processar sem erros
      hydrateChild(signal);
      expect(getHydrateContext()).not.toBeNull();
    });

    it("não deve fazer nada para nós Node", () => {
      const node = document.createElement("span");
      const ctx: HydrateContext = {
        cursor: container.firstChild,
        root: container,
        signals: new Map(),
      };

      setHydrateContext(ctx);
      const initialCursor = ctx.cursor;

      hydrateChild(node);
      expect(ctx.cursor).toBe(initialCursor);
    });

    it("deve avançar cursor em text nodes", () => {
      container.innerHTML = `Text 1<span>Element</span>Text 2`;

      const ctx: HydrateContext = {
        cursor: container.firstChild, // Text node
        root: container,
        signals: new Map(),
      };

      setHydrateContext(ctx);
      hydrateChild("Some string");

      // Cursor deve ter avançado
      expect(ctx.cursor).not.toBe(container.firstChild);
    });
  });

  describe("hHydrate", () => {
    it("deve lançar erro se chamado sem contexto", () => {
      setHydrateContext(null);

      expect(() => {
        hHydrate("div", {});
      }).toThrow("[slash] hHydrate called without context");
    });

    it("deve processar function components", () => {
      const Component = ({ text }: { text: string }) => {
        const div = document.createElement("div");
        div.textContent = text;
        return div;
      };

      const ctx: HydrateContext = {
        cursor: null,
        root: container,
        signals: new Map(),
      };

      setHydrateContext(ctx);
      const result = hHydrate(Component, { text: "Hello" });

      expect(result).toBeInstanceOf(HTMLDivElement);
      expect(result.textContent).toBe("Hello");
    });

    it("deve reutilizar elemento existente", () => {
      const existing = document.createElement("button");
      existing.textContent = "Click me";
      container.appendChild(existing);

      const ctx: HydrateContext = {
        cursor: existing,
        root: container,
        signals: new Map(),
      };

      setHydrateContext(ctx);
      const result = hHydrate("button", {});

      expect(result).toBe(existing);
    });

    it("deve anexar event handlers durante hidratação", () => {
      const button = document.createElement("button");
      container.appendChild(button);

      const onClick = mock(() => {});

      const ctx: HydrateContext = {
        cursor: button,
        root: container,
        signals: new Map(),
      };

      setHydrateContext(ctx);
      hHydrate("button", { onClick });

      // Event handler deve estar anexado
      button.click();
      expect(onClick).toHaveBeenCalled();
    });

    it("deve processar children durante hidratação", () => {
      container.innerHTML = `<div><span>Child 1</span><span>Child 2</span></div><p>Next</p>`;

      const div = container.querySelector("div") as Element;
      const nextP = container.querySelector("p") as Element;

      const ctx: HydrateContext = {
        cursor: div,
        root: container,
        signals: new Map(),
      };

      setHydrateContext(ctx);
      const result = hHydrate("div", {}, "Child 1", "Child 2");

      expect(result).toBe(div);
      // Cursor deve ter avançado para o próximo sibling
      expect(ctx.cursor).toBe(nextP);
    });

    it("deve criar novo elemento em caso de mismatch", () => {
      // Cursor aponta para text node, mas esperamos um elemento
      container.innerHTML = "Just text";

      const ctx: HydrateContext = {
        cursor: container.firstChild,
        root: container,
        signals: new Map(),
      };

      setHydrateContext(ctx);
      const result = hHydrate("div", { className: "new" });

      expect(result).toBeInstanceOf(HTMLDivElement);
      expect((result as HTMLDivElement).className).toBe("new");
    });
  });
});
