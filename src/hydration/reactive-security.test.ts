/** SEC-13: a hidratação de atributos reativos segue a mesma política do cliente */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
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
