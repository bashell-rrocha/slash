// Fiação SSR -> política de URLs, com a política REAL (sem mock de módulo: no Bun ele é
// global ao processo e vaza para outros arquivos). A política em si é testada em
// utils/url-policy.test.ts; aqui prova-se, por comportamento, quais atributos a usam.
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { unsafeUrl } from "./safe-url";
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
    ["html", "manifest"],
    ["applet", "codebase"],
    ["img", "longdesc"],
    ["img", "lowsrc"],
    ["link", "imagesrcset"],
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

describe("URLs de ataque do audit (SEC-04) no SSR", () => {
  const attacks = [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "\x01javascript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "blob:https://x/uuid",
    "file:///etc/passwd",
  ];
  const sinks: Array<[string, string]> = [
    ["a", "href"],
    ["form", "action"],
    ["button", "formaction"],
    ["iframe", "src"],
    ["embed", "src"],
    ["base", "href"],
    ["a", "xlink:href"],
    ["object", "data"],
  ];
  for (const attack of attacks) {
    test(`${JSON.stringify(attack)} bloqueado em todos os atributos de URL`, () => {
      for (const [tag, attr] of sinks) {
        const html = render(() => htmlString`<${tag} ...${{ [attr]: attack }}></${tag}>`);
        expect(html).toContain(`${attr}="${BLOCKED}"`);
      }
    });
  }

  test("data:image so em atributos de imagem de tags de imagem", () => {
    const png = "data:image/png;base64,AAAA";
    expect(render(() => htmlString`<img src=${png} />`)).toBe(`<img src="${png}">`);
    expect(render(() => htmlString`<a href=${png}>x</a>`)).toContain(BLOCKED);
    expect(render(() => htmlString`<iframe src=${png}></iframe>`)).toContain(BLOCKED);
  });

  test("entidades escritas pelo atacante ficam inertes (valor literal, escapado depois)", () => {
    const html = render(() => htmlString`<a href=${"&#106;avascript:alert(1)"}>x</a>`);
    expect(html).toBe('<a href="&amp;#106;avascript:alert(1)">x</a>');
  });

  test("srcset: so o candidato perigoso e substituido", () => {
    const html = render(() => htmlString`<img srcset=${`/a.png 1x, ${U} 2x, /c.png 3x`} />`);
    expect(html).toBe(`<img srcset="/a.png 1x, ${BLOCKED} 2x, /c.png 3x">`);
  });

  test("imagesrcset em link recebe a mesma regra por candidato", () => {
    const html = render(() => htmlString`<link imagesrcset=${`/a.png 1x, ${U} 2x`} />`);
    expect(html).toBe(`<link imagesrcset="/a.png 1x, ${BLOCKED} 2x">`);
  });
});

describe("unsafeUrl (SafeUrl) no SSR", () => {
  test("SafeUrl passa sem sanitizar, mas ainda e escapado", () => {
    const html = render(() => htmlString`<a href=${unsafeUrl('javascript:void("x")')}>x</a>`);
    expect(html).toBe('<a href="javascript:void(&quot;x&quot;)">x</a>');
  });
  test("SafeUrl em reativo tambem passa", () => {
    const rx = { get: () => unsafeUrl("javascript:void(0)"), subscribe: () => () => {} };
    const html = render(() => htmlString`<a href=${rx as never}>x</a>`);
    expect(html).toContain('href="javascript:void(0)"');
  });
  test("objeto que so imita SafeUrl nao passa", () => {
    const fake = { value: U, toString: () => U };
    expect(render(() => htmlString`<a href=${fake as never}>x</a>`)).toContain(BLOCKED);
    expect(render(() => htmlString`<a href=${JSON.parse('{"value":"javascript:x"}')}>x</a>`)).not.toContain("javascript");
  });
});

describe("meta http-equiv=refresh", () => {
  test("URL do refresh e sanitizada", () => {
    const html = render(() => htmlString`<meta http-equiv="refresh" content=${"0;url=javascript:alert(1)"} />`);
    expect(html).toBe(`<meta http-equiv="refresh" content="0;url=${BLOCKED}">`);
  });
  test("a ordem dos atributos nao importa e refresh seguro passa", () => {
    expect(render(() => htmlString`<meta content=${"0;javascript:x"} http-equiv="refresh" />`)).toContain(`content="0;${BLOCKED}"`);
    expect(render(() => htmlString`<meta http-equiv="refresh" content="5;url=/next" />`)).toContain('content="5;url=/next"');
  });
  test("meta comum nao e alterado", () => {
    expect(render(() => htmlString`<meta name="description" content="Warning: x" />`)).toContain('content="Warning: x"');
  });
  test("content de outras tags nao e tocado", () => {
    expect(render(() => htmlString`<div content=${"0;url=javascript:x"}></div>`)).toContain('content="0;url=javascript:x"');
  });
});
