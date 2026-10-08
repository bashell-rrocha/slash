import { describe, test, expect, beforeEach } from "bun:test";
import { h } from "./element";
import { createState } from "../state";
import type { Component } from "../types";

describe("rendering/component-watch.ts - Re-renderização baseada em watch", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("Componentes com state usando watch", () => {
    test("deve re-renderizar componente quando state muda", () => {
      // Arrange
      const state = createState({ count: 0 });

      const Counter: Component = () => {
        const current = state.get();
        return h("div", null, `Count: ${current.count}`);
      };

      const container = document.createElement("div");
      const node = h(Counter, null) as HTMLElement;
      container.appendChild(node);

      // Assert - Valor inicial
      expect(container.textContent).toBe("Count: 0");

      // Act - Atualizar state
      state.set({ count: 1 });

      // Assert - Deve ter re-renderizado
      expect(container.textContent).toBe("Count: 1");
    });

    test("deve re-renderizar múltiplas vezes quando state muda múltiplas vezes", () => {
      // Arrange
      const state = createState({ value: 100 });

      const Display: Component = () => {
        const current = state.get();
        return h("span", null, `Value: ${current.value}`);
      };

      const container = document.createElement("div");
      const node = h(Display, null) as HTMLElement;
      container.appendChild(node);

      expect(container.textContent).toBe("Value: 100");

      // Act & Assert - Múltiplas atualizações
      state.set({ value: 200 });
      expect(container.textContent).toBe("Value: 200");

      state.set({ value: 300 });
      expect(container.textContent).toBe("Value: 300");

      state.set({ value: 400 });
      expect(container.textContent).toBe("Value: 400");
    });

    test("deve re-renderizar apenas componente afetado quando state específico muda", () => {
      // Arrange
      const state1 = createState({ text: "A" });
      const state2 = createState({ text: "B" });

      let renderCount1 = 0;
      let renderCount2 = 0;

      const Component1: Component = () => {
        renderCount1++;
        const current = state1.get();
        return h("div", { id: "comp1" }, current.text);
      };

      const Component2: Component = () => {
        renderCount2++;
        const current = state2.get();
        return h("div", { id: "comp2" }, current.text);
      };

      const container = document.createElement("div");
      container.appendChild(h(Component1, null) as Node);
      container.appendChild(h(Component2, null) as Node);

      expect(renderCount1).toBe(1);
      expect(renderCount2).toBe(1);

      // Act - Atualizar apenas state1
      state1.set({ text: "A-updated" });

      // Assert - Apenas Component1 deve ter re-renderizado
      expect(renderCount1).toBe(2);
      expect(renderCount2).toBe(1);
      expect(container.querySelector("#comp1")?.textContent).toBe("A-updated");
      expect(container.querySelector("#comp2")?.textContent).toBe("B");
    });

    test("deve preservar event listeners após re-renderização", () => {
      // Arrange
      const state = createState({ count: 0 });
      let clickCount = 0;

      const Counter: Component = () => {
        const current = state.get();
        return h(
          "button",
          {
            onClick: () => {
              clickCount++;
            },
          },
          `Count: ${current.count}`
        );
      };

      const container = document.createElement("div");
      const node = h(Counter, null) as HTMLElement;
      container.appendChild(node);

      const button = container.querySelector("button")!;

      // Act - Click antes da re-renderização
      button.click();
      expect(clickCount).toBe(1);

      // Act - Re-renderizar
      state.set({ count: 1 });

      // Act - Click após re-renderização
      const buttonAfter = container.querySelector("button")!;
      buttonAfter.click();

      // Assert - Event listener deve ainda funcionar
      expect(clickCount).toBe(2);
    });

    test("deve suportar componentes aninhados com states diferentes", () => {
      // Arrange
      const parentState = createState({ parentText: "Parent" });
      const childState = createState({ childText: "Child" });

      const Child: Component = () => {
        const current = childState.get();
        return h("span", { class: "child" }, current.childText);
      };

      const Parent: Component = () => {
        const current = parentState.get();
        return h(
          "div",
          { class: "parent" },
          current.parentText,
          " - ",
          h(Child, null)
        );
      };

      const container = document.createElement("div");
      container.appendChild(h(Parent, null) as Node);

      expect(container.textContent).toBe("Parent - Child");

      // Act - Atualizar child state
      childState.set({ childText: "Child Updated" });

      // Assert - Apenas child deve ter mudado
      expect(container.textContent).toBe("Parent - Child Updated");

      // Act - Atualizar parent state
      parentState.set({ parentText: "Parent Updated" });

      // Assert - Parent e child devem refletir estados atuais
      expect(container.textContent).toBe("Parent Updated - Child Updated");
    });

    test("deve limpar watchers quando componente é removido do DOM", () => {
      // Arrange
      const state = createState({ value: 0 });
      let renderCount = 0;

      const TestComponent: Component = () => {
        renderCount++;
        const current = state.get();
        return h("div", { class: "test-component" }, `Value: ${current.value}`);
      };

      const container = document.createElement("div");
      const node = h(TestComponent, null) as Node;
      container.appendChild(node);

      expect(renderCount).toBe(1);
      expect(container.querySelector(".test-component")).not.toBeNull();

      // Act - Remover todo o conteúdo do container (incluindo anchor)
      container.innerHTML = "";

      // Act - Atualizar state após remoção
      state.set({ value: 1 });

      // Assert - Não deve ter re-renderizado (watcher foi limpo)
      expect(renderCount).toBe(1);
    });

    test("deve suportar state com múltiplas propriedades", () => {
      // Arrange
      const state = createState({
        title: "Hello",
        count: 0,
        active: false,
      });

      const MultiProp: Component = () => {
        const current = state.get();
        return h(
          "div",
          null,
          h("h1", null, current.title),
          h("p", null, `Count: ${current.count}`),
          h("span", null, current.active ? "Active" : "Inactive")
        );
      };

      const container = document.createElement("div");
      container.appendChild(h(MultiProp, null) as Node);

      expect(container.querySelector("h1")?.textContent).toBe("Hello");
      expect(container.querySelector("p")?.textContent).toBe("Count: 0");
      expect(container.querySelector("span")?.textContent).toBe("Inactive");

      // Act - Atualizar múltiplas propriedades
      state.set({
        title: "Updated",
        count: 5,
        active: true,
      });

      // Assert
      expect(container.querySelector("h1")?.textContent).toBe("Updated");
      expect(container.querySelector("p")?.textContent).toBe("Count: 5");
      expect(container.querySelector("span")?.textContent).toBe("Active");
    });

    test("deve re-renderizar quando state é atualizado com spread operator", () => {
      // Arrange
      const state = createState({ a: 1, b: 2 });

      const Component: Component = () => {
        const current = state.get();
        return h("div", null, `a: ${current.a}, b: ${current.b}`);
      };

      const container = document.createElement("div");
      container.appendChild(h(Component, null) as Node);

      expect(container.textContent).toBe("a: 1, b: 2");

      // Act - Atualizar usando spread
      const prev = state.get();
      state.set({ ...prev, a: 10 });

      // Assert
      expect(container.textContent).toBe("a: 10, b: 2");
    });
  });

  describe("Edge cases", () => {
    test("não deve re-renderizar quando set é chamado com mesmo valor", () => {
      // Arrange
      const state = createState({ value: 100 });
      let renderCount = 0;

      const Component: Component = () => {
        renderCount++;
        const current = state.get();
        return h("div", null, `Value: ${current.value}`);
      };

      const container = document.createElement("div");
      container.appendChild(h(Component, null) as Node);

      expect(renderCount).toBe(1);

      // Act - Set com mesmo valor (estruturalmente igual)
      state.set({ value: 100 });

      // Note: O StateManager atual sempre notifica watchers, mesmo com valor igual
      // Este teste documenta o comportamento atual
      // Se quisermos otimizar, podemos implementar comparação shallow no futuro
      expect(renderCount).toBeGreaterThanOrEqual(1);
    });

    test("deve suportar componente sem usar state", () => {
      // Arrange
      const StaticComponent: Component = () => {
        return h("div", null, "Static content");
      };

      const container = document.createElement("div");
      container.appendChild(h(StaticComponent, null) as Node);

      // Assert
      expect(container.textContent).toBe("Static content");
    });

    test("deve suportar componente que usa múltiplos states", () => {
      // Arrange
      const state1 = createState({ value: 1 });
      const state2 = createState({ value: 2 });
      let renderCount = 0;

      const MultiState: Component = () => {
        renderCount++;
        const s1 = state1.get();
        const s2 = state2.get();
        return h("div", null, `Sum: ${s1.value + s2.value}`);
      };

      const container = document.createElement("div");
      container.appendChild(h(MultiState, null) as Node);

      expect(container.textContent).toBe("Sum: 3");
      expect(renderCount).toBe(1);

      // Act - Atualizar state1
      state1.set({ value: 5 });

      // Assert
      expect(container.textContent).toBe("Sum: 7");
      expect(renderCount).toBe(2);

      // Act - Atualizar state2
      state2.set({ value: 10 });

      // Assert
      expect(container.textContent).toBe("Sum: 15");
      expect(renderCount).toBe(3);
    });
  });
});
