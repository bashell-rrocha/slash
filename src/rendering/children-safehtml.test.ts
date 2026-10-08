import { describe, expect, test } from "bun:test";
import { hydrateReactiveNodes } from "../hydration/reactive";
import { html } from "../hyper";
import { unsafeHtml } from "../safe-html";
import { appendChildSmart } from "./children";

describe("cliente: SafeHtml via <template>", () => {
  test("SafeHtml como filho vira nós reais", () => {
    const p = html`<p>${unsafeHtml("<b>x</b> y")}</p>` as HTMLElement;
    expect(p.innerHTML).toBe("<b>x</b> y");
    expect(p.querySelector("b")).not.toBeNull();
  });

  test("string simples continua texto", () => {
    const p = html`<p>${"<b>x</b>"}</p>` as HTMLElement;
    expect(p.querySelector("b")).toBeNull();
    expect(p.textContent).toBe("<b>x</b>");
  });

  test("array misto: SafeHtml vira markup, string vira texto", () => {
    const host = document.createElement("div");
    appendChildSmart(host, [unsafeHtml("<i>a</i>"), "<u>b</u>"]);
    expect(host.querySelector("i")).not.toBeNull();
    expect(host.querySelector("u")).toBeNull();
    expect(host.textContent).toBe("a<u>b</u>");
  });

  test("reativo que devolve SafeHtml renderiza markup e atualiza", () => {
    let current = unsafeHtml("<b>1</b>");
    const subs = new Set<(v: unknown) => void>();
    const rx = {
      get: () => current,
      subscribe: (fn: (v: unknown) => void) => (subs.add(fn), () => subs.delete(fn)),
    };
    const host = document.createElement("div");
    appendChildSmart(host, rx as never);
    expect(host.querySelector("b")?.textContent).toBe("1");
    current = unsafeHtml("<i>2</i>");
    for (const fn of subs) fn(current);
    expect(host.querySelector("b")).toBeNull();
    expect(host.querySelector("i")?.textContent).toBe("2");
  });

  test("hidratação: array e valor único SafeHtml viram markup", () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--reactive-start:a--><!--reactive-end:a--><!--reactive-start:b--><!--reactive-end:b-->";
    let fa: (v: unknown) => void = () => {};
    let fb: (v: unknown) => void = () => {};
    hydrateReactiveNodes(
      container,
      new Map<string, never>([
        ["a", { get: () => null, subscribe: (f: (v: unknown) => void) => ((fa = f), () => {}) } as never],
        ["b", { get: () => null, subscribe: (f: (v: unknown) => void) => ((fb = f), () => {}) } as never],
      ]),
    );
    fa([unsafeHtml("<b>x</b>"), "<u>t</u>"]);
    fb(unsafeHtml("<i>y</i>"));
    expect(container.querySelector("b")).not.toBeNull();
    expect(container.querySelector("u")).toBeNull();
    expect(container.querySelector("i")).not.toBeNull();
  });
});
