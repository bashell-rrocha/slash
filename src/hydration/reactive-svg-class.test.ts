import { describe, expect, it } from "bun:test";
import type { Reactive } from "../types";
import { hydrateReactiveAttributes } from "./reactive";

// Hidratação de class reativa em SVG: no navegador, SVGElement.className é só leitura (SVGAnimatedString) e atribuir
// a ele em modo estrito lança TypeError. O happy-dom aceita a atribuição; o teste reproduz o navegador.
function browserLikeSvg(): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  Object.defineProperty(svg, "className", { get: () => ({ baseVal: svg.getAttribute("class") ?? "" }), configurable: true });
  return svg;
}

function reactive(initial: string): Reactive<string> & { set: (v: string) => void } {
  let value = initial;
  const subs = new Set<(v: string) => void>();
  return {
    get: () => value,
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    set: (v) => {
      value = v;
      for (const fn of subs) fn(v);
    },
  };
}

describe("hydrateReactiveAttributes: class em SVG", () => {
  it("troca a classe de um <svg> vindo do SSR pelo atributo", () => {
    // Arrange
    const svg = browserLikeSvg();
    svg.setAttribute("class", "a");
    svg.setAttribute("data-reactive-class", "s1");
    const state = reactive("a");
    hydrateReactiveAttributes(svg, new Map([["s1", state as Reactive<unknown>]]));

    // Act
    state.set("b");

    // Assert
    expect(svg.getAttribute("class")).toBe("b");
    expect(svg.hasAttribute("data-reactive-class")).toBe(false);
  });
});
