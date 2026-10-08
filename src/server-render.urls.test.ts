// Fiação SSR -> sanitizeUrl (a política em si é testada em utils/url-policy.test.ts, stream SEC-B).
// Aqui o módulo é trocado por um espião para provar quais atributos passam pela política.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import * as realPolicy from "./utils/url-policy";

const calls: Array<[string, string, string | undefined]> = [];
const fake = (attr: string, value: string, tag?: string) => {
  calls.push([attr, value, tag]);
  return value.startsWith("javascript:") ? "about:blank#blocked" : value;
};

let htmlString: typeof import("./server-render").htmlString;
let renderToString: typeof import("./server-render").renderToString;

beforeAll(async () => {
  mock.module("./utils/url-policy", () => ({ ...realPolicy, sanitizeUrl: fake }));
  ({ htmlString, renderToString } = await import("./server-render"));
});
afterAll(() => {
  mock.module("./utils/url-policy", () => realPolicy);
});

const U = "javascript:alert(1)";
const render = (fn: () => unknown) => renderToString(fn as never).html;

describe("SSR chama sanitizeUrl nos atributos de URL", () => {
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
    calls.length = 0;
    const html = render(() => htmlString`<${tag} ...${{ [attr]: U }}></${tag}>`);
    expect(html).toContain(`${attr}="about:blank#blocked"`);
    expect(calls).toContainEqual([attr, U, tag]);
  });

  test("reativo e valor lido de state tambem passam pela politica", () => {
    const rx = { get: () => U, subscribe: () => () => {} };
    const html = render(() => htmlString`<a href=${rx as never}>x</a>`);
    expect(html).toBe('<a href="about:blank#blocked" data-reactive-href="s0">x</a>');
  });

  test("atributos comuns nao passam pela politica", () => {
    calls.length = 0;
    render(() => htmlString`<a title="t" id="i" href="/ok">x</a>`);
    expect(calls.map((c) => c[0])).toEqual(["href"]);
  });
});
