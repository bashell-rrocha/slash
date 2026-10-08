import { describe, it, expect, beforeEach } from "bun:test";
import { html, render, createState, destroyNode } from "../core";
import { setHydrateContext } from "../hydration/context";
import type { Reactive } from "../types";

function createSignal<T>(initial: T): Reactive<T> & { set: (v: T) => void } {
  let value = initial;
  const subs = new Set<(v: T) => void>();
  return {
    get: () => value,
    subscribe: (fn: (v: T) => void) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    set: (v: T) => {
      value = v;
      subs.forEach((fn) => fn(v));
    },
  };
}

describe("reativo dentro de componente", () => {
  // Outros testes podem deixar um contexto de hidratação global ativo
  beforeEach(() => setHydrateContext(null));

  it("reativo devolvido por componente atualiza sem erro", () => {
    const sig = createSignal<unknown>("a");
    const Comp = () => sig;
    const el = document.createElement("div");
    render(html`<${Comp}/>` as any, el);
    expect(el.textContent).toBe("a");
    sig.set("b");
    expect(el.textContent).toBe("b");
  });

  it("reativo devolvido por componente aninhado em elemento", () => {
    const sig = createSignal<unknown>("a");
    const Comp = () => sig;
    const el = document.createElement("div");
    render(html`<main><${Comp}/></main>` as any, el);
    sig.set("b");
    expect(el.querySelector("main")!.textContent).toBe("b");
  });

  it("reativo dentro de dois niveis de componente (App -> Router)", () => {
    const sig = createSignal<unknown>(html`<h1>home</h1>`);
    const Inner = () => sig;
    const App = () => html`<${Inner}/>`;
    const el = document.createElement("div");
    render(html`<${App}/>` as any, el);
    sig.set(html`<h1>about</h1>`);
    expect(el.innerHTML).toContain("<h1>about</h1>");
    expect(el.innerHTML).not.toContain("home");
  });

  it("reativo em template com varias raizes / array", () => {
    const sig = createSignal<unknown>(["x", "y"]);
    const Comp = () => [html`<i>1</i>`, sig];
    const el = document.createElement("div");
    render(html`<${Comp}/>` as any, el);
    expect(el.textContent).toBe("1xy");
    sig.set(["z"]);
    expect(el.textContent).toBe("1z");
  });

  it("reativo montado, movido para outro pai e atualizado", () => {
    const sig = createSignal<unknown>("a");
    const Comp = () => sig;
    const el = document.createElement("div");
    render(html`<${Comp}/>` as any, el);
    const other = document.createElement("section");
    while (el.firstChild) other.appendChild(el.firstChild);
    sig.set("b");
    expect(other.textContent).toBe("b");
    expect(el.textContent).toBe("");
  });

  it("reativo desmontado nao lanca ao receber atualizacao", () => {
    const sig = createSignal<unknown>("a");
    const Comp = () => sig;
    const el = document.createElement("div");
    render(html`<${Comp}/>` as any, el);
    // remove os marcadores do DOM sem destroyNode: atualizacao deve ser ignorada
    const nodes = Array.from(el.childNodes);
    for (const n of nodes) el.removeChild(n);
    expect(() => sig.set("b")).not.toThrow();
    // com destroyNode (cleanup desinscreve)
    const el2 = document.createElement("div");
    const sig2 = createSignal<unknown>("a");
    render(html`<${() => sig2}/>` as any, el2);
    for (const n of Array.from(el2.childNodes)) {
      destroyNode(n);
      el2.removeChild(n);
    }
    expect(() => sig2.set("b")).not.toThrow();
  });

  it("componente que le estado e devolve reativo re-renderiza sem orfaos", () => {
    const state = createState({ n: 0 });
    const sig = createSignal<unknown>("a");
    const Comp = () => {
      const n = state.get().n;
      return html`<p>${n}</p>${sig}`;
    };
    const el = document.createElement("div");
    render(html`<${Comp}/>` as any, el);
    expect(el.textContent).toBe("0a");
    state.set({ n: 1 });
    sig.set("b");
    expect(el.textContent).toBe("1b");
    expect(el.querySelectorAll("p").length).toBe(1);
    state.set({ n: 2 });
    expect(el.textContent).toBe("2b");
    expect(el.querySelectorAll("p").length).toBe(1);
  });
});
