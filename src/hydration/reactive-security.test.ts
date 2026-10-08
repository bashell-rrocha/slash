/** SEC-13: a hidratação de atributos reativos segue a mesma política do cliente */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { unsafeHtml } from "../safe-html";
import { isSafeUrl, unsafeUrl } from "../safe-url";
import { htmlString, renderToString } from "../server-render";
import { BLOCKED_URL } from "../utils/url-policy";
import { hydrateReactiveAttributes } from "./reactive";

let warn: ReturnType<typeof spyOn>;
beforeEach(() => {
  warn = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

function setup(attr: string, tag = "div") {
  const el = document.createElement(tag);
  el.setAttribute(`data-reactive-${attr}`, "s0");
  let emit: (v: unknown) => void = () => {};
  const reactives = new Map([
    ["s0", { get: () => undefined, subscribe: (fn: (v: unknown) => void) => { emit = fn; return () => {}; } }],
  ]);
  hydrateReactiveAttributes(el, reactives as any);
  return { el, emit: (v: unknown) => emit(v) };
}

describe("hydrateReactiveAttributes - política (SEC-13)", () => {
  test("data-reactive-onclick não vira atributo onclick", () => {
    const { el, emit } = setup("onclick");
    emit("alert(1)");
    expect(el.getAttribute("onclick")).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
  test("qualquer on* (case-insensitive) é descartado", () => {
    const { el, emit } = setup("onerror", "img");
    emit("alert(1)");
    expect(el.getAttribute("onerror")).toBeNull();
  });
  test("href javascript: é sanitizado", () => {
    const { el, emit } = setup("href", "a");
    emit("javascript:alert(1)");
    expect(el.getAttribute("href")).toBe(BLOCKED_URL);
    emit("/ok");
    expect(el.getAttribute("href")).toBe("/ok");
  });
  test("srcdoc e innerHTML não são aplicados", () => {
    const a = setup("srcdoc", "iframe");
    a.emit("<script>alert(1)</script>");
    expect(a.el.getAttribute("srcdoc")).toBeNull();
    const b = setup("innerhtml");
    b.emit("<img src=x onerror=alert(1)>");
    expect(b.el.querySelector("img")).toBeNull();
    expect(b.el.getAttribute("innerhtml")).toBeNull();
  });
  test("atributos comuns continuam funcionando", () => {
    const { el, emit } = setup("title");
    emit("olá");
    expect(el.getAttribute("title")).toBe("olá");
    const d = setup("data-x");
    d.emit("1");
    expect(d.el.getAttribute("data-x")).toBe("1");
  });
});

// SEC-I fix round 1, item 6: o brand de SafeUrl/SafeHtml NAO atravessa o JSON do
// estado serializado. O que chega ao cliente e string/objeto comum, que segue a politica normal
// (falha fechado: a isencao do unsafeUrl/unsafeHtml nao sobrevive a hidratacao).
describe("hidratacao: perda do brand no estado serializado falha fechado", () => {
  const J = "javascript:alert(1)";

  test("o brand nao sobrevive a JSON (SafeUrl e SafeHtml)", () => {
    expect(isSafeUrl(JSON.parse(JSON.stringify(unsafeUrl(J))))).toBe(false);
    const html = JSON.parse(JSON.stringify(unsafeHtml("<b>x</b>")));
    expect(Object.getOwnPropertySymbols(html)).toEqual([]);
  });

  test("SSR serializa um reativo com SafeUrl como a string (nao como objeto {value})", () => {
    const rx = { get: () => unsafeUrl(J), subscribe: () => () => {} };
    const { html, state } = renderToString(() => htmlString`<a href=${rx as never}>x</a>`);
    expect(html).toContain(`href="${J}"`); // no SSR a isencao vale
    expect(state.s0).toBe(J);
  });

  test("SSR serializa SafeHtml reativo como string", () => {
    const rx = { get: () => unsafeHtml("<b>x</b>"), subscribe: () => () => {} };
    const { state } = renderToString(() => htmlString`<iframe srcdoc=${rx as never}></iframe>`);
    expect(state.s0).toBe("<b>x</b>");
  });

  test("no cliente o valor hidratado e string e passa pela politica: href bloqueado", () => {
    const { el, emit } = setup("href", "a");
    emit(JSON.parse(JSON.stringify(J)));
    expect(el.getAttribute("href")).toBe(BLOCKED_URL);
  });

  test("srcdoc hidratado como string e bloqueado", () => {
    const { el, emit } = setup("srcdoc", "iframe");
    emit(JSON.parse(JSON.stringify(unsafeHtml("<script>alert(1)</script>").value)));
    expect(el.getAttribute("srcdoc")).toBeNull();
  });

  test("objeto {value} vindo do JSON (SafeUrl dentro de estado aninhado) nao e isento", () => {
    const { el, emit } = setup("href", "a");
    emit(JSON.parse(JSON.stringify({ value: J })));
    expect(el.getAttribute("href") ?? "").not.toContain("javascript");
  });
});
