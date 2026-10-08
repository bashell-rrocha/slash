// Fiação SSR -> política de URLs, com a política REAL (sem mock.module: no Bun ele é
// global ao processo e vaza para outros arquivos). A política em si é testada em
// utils/url-policy.test.ts; aqui prova-se, por comportamento, quais atributos a usam.
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { htmlString, renderToString } from "./server-render";

const U = "javascript:alert(1)";
const BLOCKED = "about:blank#blocked";
let warn: ReturnType<typeof spyOn>;
beforeEach(() => {
  warn = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const render = (fn: () => unknown) => renderToString(fn as never).html;

describe("SSR aplica a política de URLs nos atributos de URL", () => {
  test.each([
    ["a", "href"],
    ["img", "src"],
    ["form", "action"],
    ["button", "formaction"],
    ["video", "poster"],
    ["blockquote", "cite"],
    ["img", "srcset"],
    ["a", "ping"],
    ["object", "data"],
    ["a", "xlink:href"],
    ["td", "background"],
  ])("<%s %s>", (tag, attr) => {
    const html = render(() => htmlString`<${tag} ...${{ [attr]: U }}></${tag}>`);
    expect(html).toContain(`${attr}="${BLOCKED}"`);
    expect(html).not.toContain("javascript");
  });

  test("a chave do atributo e case-insensitive", () => {
    const html = render(() => htmlString`<a ...${{ HREF: U }}>x</a>`);
    expect(html).toContain(`HREF="${BLOCKED}"`);
  });

  test("reativo e valor lido de state tambem passam pela politica", () => {
    const rx = { get: () => U, subscribe: () => () => {} };
    const html = render(() => htmlString`<a href=${rx as never}>x</a>`);
    expect(html).toBe(`<a href="${BLOCKED}" data-reactive-href="s0">x</a>`);
  });

  test("URLs permitidas passam intactas", () => {
    const html = render(() => htmlString`<a href="/ok?x=1&y=2" title="javascript:x">x</a>`);
    expect(html).toBe('<a href="/ok?x=1&amp;y=2" title="javascript:x">x</a>');
  });

  test("atributos comuns nao passam pela politica", () => {
    const html = render(() => htmlString`<a title=${U} id=${U} data=${U}>x</a>`);
    expect(html).toContain(`title="${U}"`);
    expect(html).toContain(`id="${U}"`);
    // `data` so e URL em <object>
    expect(html).toContain(`data="${U}"`);
  });
});

describe("atributos de animacao SVG", () => {
  test.each([
    ["animate", "to"],
    ["animate", "values"],
    ["set", "from"],
    ["animateMotion", "to"],
  ])("<%s %s> passa pela politica", (tag, attr) => {
    const html = render(() => htmlString`<${tag} ...${{ [attr]: U }}></${tag}>`);
    expect(html).toContain(`${attr}="${BLOCKED}"`);
  });

  test("values lista: so o item perigoso e substituido", () => {
    const html = render(() => htmlString`<animate ...${{ values: `/a;${U};/b` }}></animate>`);
    expect(html).toContain(`values="/a;${BLOCKED};/b"`);
  });

  test("to/values em outras tags nao passam pela politica", () => {
    const html = render(() => htmlString`<div ...${{ to: U, values: U }}></div>`);
    expect(html).toContain(`to="${U}"`);
    expect(html).toContain(`values="${U}"`);
  });
});
