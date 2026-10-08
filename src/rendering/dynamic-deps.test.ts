import { describe, it, expect, beforeEach } from "bun:test";
import { html, render, createState, destroyNode } from "../core";
import { diffTrackedStates } from "./element-core";
import { setHydrateContext } from "../hydration/context";

describe("dependências dinâmicas de componente", () => {
  beforeEach(() => setHydrateContext(null));

  it("passa a acompanhar estado lido só em re-renderizações", () => {
    const show = createState(false);
    const name = createState("a");
    const Comp = () => (show.get() ? html`<p>${name.get()}</p>` : html`<p>off</p>`);
    const el = document.createElement("div");
    render(html`<${Comp}/>` as any, el);
    expect(el.textContent).toBe("off");
    show.set(true);
    expect(el.textContent).toBe("a");
    name.set("b");
    expect(el.textContent).toBe("b");
  });

  it("deixa de acompanhar dependência que não é mais lida", () => {
    const show = createState(true);
    const name = createState("a");
    let runs = 0;
    const Comp = () => {
      runs++;
      return show.get() ? html`<p>${name.get()}</p>` : html`<p>off</p>`;
    };
    const el = document.createElement("div");
    render(html`<${Comp}/>` as any, el);
    show.set(false);
    const before = runs;
    name.set("b");
    expect(runs).toBe(before);
    expect(el.textContent).toBe("off");
  });

  it("estado lido em toda renderização não acumula watchers", () => {
    const n = createState(0);
    let runs = 0;
    const Comp = () => {
      runs++;
      return html`<p>${n.get()}</p>`;
    };
    const el = document.createElement("div");
    render(html`<${Comp}/>` as any, el);
    for (let i = 1; i <= 5; i++) n.set(i);
    const before = runs;
    n.set(99);
    expect(runs).toBe(before + 1);
    expect(el.textContent).toBe("99");
  });

  it("pai e filho mantêm dependências isoladas", () => {
    const a = createState("a");
    const b = createState("b");
    let parentRuns = 0;
    let childRuns = 0;
    const Child = () => {
      childRuns++;
      return html`<i>${a.get()}</i>`;
    };
    const Parent = () => {
      parentRuns++;
      return html`<div>${b.get()}<${Child}/></div>`;
    };
    const el = document.createElement("div");
    render(html`<${Parent}/>` as any, el);
    expect(parentRuns).toBe(1);
    expect(childRuns).toBe(1);
    a.set("a2");
    expect(parentRuns).toBe(1);
    expect(childRuns).toBe(2);
    expect(el.textContent).toBe("ba2");
  });

  it("destroyNode depois de trocas de dependência remove todos os watchers", () => {
    const show = createState(false);
    const name = createState("a");
    let runs = 0;
    const Comp = () => {
      runs++;
      return show.get() ? html`<p>${name.get()}</p>` : html`<p>off</p>`;
    };
    const el = document.createElement("div");
    render(html`<${Comp}/>` as any, el);
    show.set(true);
    name.set("b");
    destroyNode(el);
    const before = runs;
    show.set(false);
    name.set("c");
    expect(runs).toBe(before);
  });

  it("erro em re-renderização restaura o rastreador global", () => {
    const n = createState(0);
    const Comp = () => {
      if (n.get() === 1) throw new Error("boom");
      return html`<p>${n.get()}</p>`;
    };
    const el = document.createElement("div");
    render(html`<${Comp}/>` as any, el);
    const marker = () => {};
    (globalThis as any).__SLASH_TRACK_STATE__ = marker;
    try {
      expect(() => n.set(1)).toThrow("boom");
      expect((globalThis as any).__SLASH_TRACK_STATE__).toBe(marker);
    } finally {
      (globalThis as any).__SLASH_TRACK_STATE__ = undefined;
    }
  });

  it("componente sem estado na primeira renderização continua estático", () => {
    const n = createState(0);
    let runs = 0;
    const Comp = () => {
      runs++;
      return html`<p>x</p>`;
    };
    const el = document.createElement("div");
    render(html`<${Comp}/>` as any, el);
    n.set(1);
    expect(runs).toBe(1);
  });
});

describe("robustez de re-renderização", () => {
  beforeEach(() => setHydrateContext(null));

  it("erro antes de ler qualquer state mantém os watchers anteriores", () => {
    const n = createState(0);
    let fail = false;
    const Comp = () => {
      if (fail) throw new Error("boom");
      return html`<p>${n.get()}</p>`;
    };
    const el = document.createElement("div");
    render(html`<${Comp}/>` as any, el);
    fail = true;
    expect(() => n.set(1)).toThrow("boom");
    fail = false;
    n.set(2);
    expect(el.textContent).toBe("2");
  });

  it("render iniciado dentro de render do mesmo componente não perde dependências", () => {
    const n = createState(0);
    const m = createState("x");
    let nested = true;
    const Comp = () => {
      const v = n.get();
      if (v === 1 && nested) {
        nested = false;
        n.set(2); // re-render aninhado
      }
      return html`<p>${v}${m.get()}</p>`;
    };
    const el = document.createElement("div");
    render(html`<${Comp}/>` as any, el);
    n.set(1);
    expect(el.textContent).toBe("2x");
    expect(el.querySelectorAll("p").length).toBe(1);
    m.set("y");
    expect(el.textContent).toBe("2y");
    n.set(3);
    expect(el.textContent).toBe("3y");
  });

  it("pai e filho lendo o mesmo state: filho renderiza no máximo 2 vezes por set", () => {
    const x = createState(0);
    let childRuns = 0;
    const Child = () => {
      childRuns++;
      return html`<i>${x.get()}</i>`;
    };
    const Parent = () => html`<div>${x.get()}<${Child}/></div>`;
    const el = document.createElement("div");
    render(html`<${Parent}/>` as any, el);
    const before = childRuns;
    x.set(1);
    expect(childRuns - before).toBe(2);
    expect(el.textContent).toBe("11");
  });
});

describe("diffTrackedStates", () => {
  it("separa states novos, removidos e mantidos", () => {
    const a = {} as any, b = {} as any, c = {} as any;
    const d = diffTrackedStates(new Map<any, unknown>([[a, 1], [b, 1]]), new Set([b, c]));
    expect(d.add).toEqual([c]);
    expect(d.remove).toEqual([a]);
  });
});
