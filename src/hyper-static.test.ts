import { describe, expect, it } from "bun:test";
import { html } from "./hyper";
import { createState } from "./state";

// Regressões do renderizador de DOM (html): nó estático reaproveitado entre chamadas do mesmo template e class em SVG.

const asNode = (value: unknown): Node => value as Node;

describe("html: subárvores estáticas", () => {
  it("o mesmo template num map gera o filho estático em todos os itens", () => {
    // Arrange
    const items = ["a", "b", "c"];

    // Act
    const list = asNode(html`<div>${items.map((q) => html`<p>${q}<span>+</span></p>`)}</div>`) as HTMLElement;

    // Assert
    expect(list.querySelectorAll("p")).toHaveLength(3);
    expect(list.querySelectorAll("span")).toHaveLength(3);
  });

  it("template totalmente estático chamado duas vezes gera dois nós", () => {
    // Arrange
    const make = () => html`<i class="star"></i>`;
    const parent = document.createElement("div");

    // Act
    parent.append(asNode(make()), asNode(make()));

    // Assert
    expect(parent.querySelectorAll("i")).toHaveLength(2);
  });

  it("elemento estático dentro de template dinâmico não é compartilhado entre chamadas", () => {
    // Arrange
    const row = (text: string) => html`<li>${text}<br /></li>`;
    const parent = document.createElement("ul");

    // Act
    parent.append(asNode(row("x")), asNode(row("y")));

    // Assert
    expect(parent.querySelectorAll("br")).toHaveLength(2);
  });
});

describe("html: class em SVG", () => {
  it("aplica class em <svg> como atributo", () => {
    // Arrange
    const name = "decor";

    // Act
    const svg = asNode(html`<svg class=${name} viewBox="0 0 1 1"></svg>`) as SVGElement;

    // Assert
    expect(svg.getAttribute("class")).toBe("decor");
  });

  it("troca reativa da class em SVG também aplica", () => {
    // Arrange
    const state = createState("a");
    const svg = asNode(html`<svg class=${{ get: state.get, subscribe: state.watch }}></svg>`) as SVGElement;

    // Act
    state.set("b");

    // Assert
    expect(svg.getAttribute("class")).toBe("b");
  });

  it("class vazia remove o valor em SVG", () => {
    // Arrange
    const value = false;

    // Act
    const svg = asNode(html`<svg class=${value}></svg>`) as SVGElement;

    // Assert
    expect(svg.getAttribute("class") ?? "").toBe("");
  });
});
