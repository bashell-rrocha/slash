import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createRouter } from "./router/router";
import { Router } from "./router/components";
import { isSafeHtml, unsafeHtml } from "./safe-html";
import {
  htmlString,
  renderToStream,
  renderToString,
  resetSsrWarningsForTests,
  serializeStateForScript,
} from "./server-render";
import { createState } from "./state";

const X = "<img src=x onerror=alert(1)>";

let warnings: string[] = [];
const realWarn = console.warn;
beforeEach(() => {
  warnings = [];
  resetSsrWarningsForTests();
  console.warn = (...a: unknown[]) => {
    warnings.push(a.map(String).join(" "));
  };
});
afterEach(() => {
  console.warn = realWarn;
});

describe("SEC-01: strings sao sempre texto", () => {
  test("htmlString devolve SafeHtml", () => {
    expect(isSafeHtml(htmlString`<p>x</p>`)).toBe(true);
  });

  test("string que comeca com < e escapada em filho direto", () => {
    expect(renderToString(() => htmlString`<p>${X}</p>`).html).toBe(
      "<p>&lt;img src=x onerror=alert(1)&gt;</p>",
    );
  });

  test("escapada dentro de array", () => {
    expect(renderToString(() => htmlString`<ul>${[X, "b"]}</ul>`).html).toBe(
      "<ul>&lt;img src=x onerror=alert(1)&gt;b</ul>",
    );
  });

  test("escapada quando vem de propriedade aninhada de state", () => {
    const st = createState({ o: { q: X } });
    const { html } = renderToString(() => htmlString`<p>${st.get().o.q}</p>`);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  test("escapada em reativo", () => {
    const rx = { get: () => X, subscribe: () => () => {} };
    const { html } = renderToString(() => htmlString`<p>${rx as never}</p>`);
    expect(html).toBe("<p><!--reactive-start:s0-->&lt;img src=x onerror=alert(1)&gt;<!--reactive-end:s0--></p>");
  });

  test("escapada no topo de renderToString e renderToStream", async () => {
    expect(renderToString(X).html).toBe("&lt;img src=x onerror=alert(1)&gt;");
    let out = "";
    for await (const c of renderToStream(() => X)) out += c;
    expect(out).not.toContain("<img");
  });

  test("componente que devolve string e texto; devolvendo SafeHtml e markup", () => {
    const Txt = () => "<b>a</b>" as never;
    const Mk = () => unsafeHtml("<b>a</b>") as never;
    expect(renderToString(() => htmlString`<p><${Txt} /></p>`).html).toBe("<p>&lt;b&gt;a&lt;/b&gt;</p>");
    expect(renderToString(() => htmlString`<p><${Mk} /></p>`).html).toBe("<p><b>a</b></p>");
  });

  test("injecao de comentario e escapada", () => {
    expect(renderToString(() => htmlString`<p>${"<!-- "}</p>`).html).toBe("<p>&lt;!-- </p>");
  });

  test("Router: query maliciosa nao vira markup", () => {
    const router = createRouter({
      initialPath: `/?q=${encodeURIComponent(X)}`,
      routes: [{ path: "/", component: ((s: { query: { q: string } }) => htmlString`<p>${s.query.q}</p>`) as never }],
    });
    const { html } = renderToString(() => htmlString`<main>${Router({ router })}</main>`);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  test("templates aninhados, arrays de templates e unsafeHtml continuam markup", () => {
    const li = (t: string) => htmlString`<li>${t}</li>`;
    expect(renderToString(() => htmlString`<ul>${["a", "<b"].map(li)}${unsafeHtml("<hr>")}</ul>`).html).toBe(
      "<ul><li>a</li><li>&lt;b</li><hr></ul>",
    );
  });

  test("avisa uma vez quando string parece markup", () => {
    renderToString(() => htmlString`<p>${X}</p><p>${X}</p>`);
    const w = warnings.filter((m) => m.includes("unsafeHtml"));
    expect(w).toHaveLength(1);
  });

  test("nao avisa para texto comum", () => {
    renderToString(() => htmlString`<p>${"ola < mundo"}</p>`);
    expect(warnings).toHaveLength(0);
  });
});

describe("script/style (regra de raw text)", () => {
  test("SafeHtml e emitido como esta", () => {
    const json = serializeStateForScript({ a: "</script>" });
    const { html } = renderToString(() => htmlString`<script type="application/json">${unsafeHtml(json)}</script>`);
    expect(html).toBe(`<script type="application/json">${json}</script>`);
  });

  test("string simples e escapada com aviso apontando unsafeHtml(serializeStateForScript(x))", () => {
    const { html } = renderToString(() => htmlString`<script>${"</script><img src=x>"}</script>`);
    expect(html).toBe("<script>&lt;/script&gt;&lt;img src=x&gt;</script>");
    expect(warnings.some((m) => m.includes("unsafeHtml(serializeStateForScript"))).toBe(true);
  });

  test("style com string tambem e escapada", () => {
    const { html } = renderToString(() => htmlString`<style>${"</style><b>"}</style>`);
    expect(html).toBe("<style>&lt;/style&gt;&lt;b&gt;</style>");
  });
});

describe("SEC-02: nomes de atributo", () => {
  test("nome com espaco/atributo extra e descartado", () => {
    const { html } = renderToString(() => htmlString`<div ...${{ "x onmouseover=alert(1) y": "1", ok: "2" }}>x</div>`);
    expect(html).toBe('<div ok="2">x</div>');
    expect(warnings.length).toBeGreaterThan(0);
  });

  test("nome com > e script e descartado", () => {
    const { html } = renderToString(() => htmlString`<div ...${{ "><script>alert(1)</script><b a": "1" }}>x</div>`);
    expect(html).toBe("<div>x</div>");
  });

  test("nome invalido tambem nao vaza para data-reactive-", () => {
    const rx = { get: () => "v", subscribe: () => () => {} };
    const { html } = renderToString(() => htmlString`<a ...${{ "x onfocus=alert(1) y": rx }}>x</a>`);
    expect(html).toBe("<a>x</a>");
  });

  test("nomes validos (data-, aria-, xlink:href) continuam", () => {
    const { html } = renderToString(() => htmlString`<div ...${{ "data-id": "1", "aria-label": "a", "xlink:title": "t" }}></div>`);
    expect(html).toBe('<div data-id="1" aria-label="a" xlink:title="t"></div>');
  });
});

describe("SEC-03: on* descartado no SSR", () => {
  test("onclick minusculo (valor string) e descartado", () => {
    expect(renderToString(() => htmlString`<button onclick=${"alert(1)"}>x</button>`).html).toBe("<button>x</button>");
  });

  test("onerror via spread e descartado", () => {
    expect(renderToString(() => htmlString`<img ...${{ onerror: "alert(1)", src: "x" }} />`).html).toBe('<img src="x">');
  });

  test("onclick estatico no template e descartado", () => {
    expect(renderToString(() => htmlString`<button onclick="alert(1)">x</button>`).html).toBe("<button>x</button>");
  });

  test("qualquer caixa, inclusive ONCLICK, e descartada", () => {
    expect(renderToString(() => htmlString`<b ...${{ ONCLICK: "a", OnMouseOver: "b" }}>x</b>`).html).toBe("<b>x</b>");
  });

  test("onClick camelCase continua descartado sem aviso; minusculo avisa", () => {
    renderToString(() => htmlString`<button onClick=${() => {}}>x</button>`);
    expect(warnings).toHaveLength(0);
    renderToString(() => htmlString`<button onclick=${"a"}>x</button>`);
    expect(warnings.some((m) => m.includes("onClick"))).toBe(true);
  });
});

describe("SEC-08: nome de tag", () => {
  test("nome com atributo injetado lanca", () => {
    expect(() => renderToString(() => htmlString`<${"img src=x onerror=alert(1)"} />`)).toThrow();
  });

  test("nome com > e script lanca", () => {
    expect(() => renderToString(() => htmlString`<${"div><script>alert(1)</script><div"}>x<//>`)).toThrow();
  });

  test("tags validas (custom element, svg:x) passam", () => {
    expect(renderToString(() => htmlString`<my-el>a</my-el>`).html).toBe("<my-el>a</my-el>");
  });

  test("tag dinamica valida passa", () => {
    expect(renderToString(() => htmlString`<${"h1"}>t<//>`).html).toBe("<h1>t</h1>");
  });
});

describe("SEC-09 (lado SSR): style", () => {
  test("valor com aspas/atributo injetado e descartado", () => {
    const { html } = renderToString(() => htmlString`<div style=${{ background: 'red;" onmouseover="alert(1)', color: "blue" }}></div>`);
    expect(html).toBe('<div style="color: blue"></div>');
  });

  test("chave com ; e descartada", () => {
    const { html } = renderToString(() => htmlString`<div style=${{ "x:y;z": "1", color: "red" }}></div>`);
    expect(html).toBe('<div style="color: red"></div>');
  });

  test("url(javascript:) e expression() sao descartados; url https e relativa passam", () => {
    const { html } = renderToString(
      () =>
        htmlString`<div style=${{
          background: "url(javascript:alert(1))",
          width: "expression(alert(1))",
          backgroundImage: "url(https://a.test/x.png)",
          maskImage: "url(/m.png)",
        }}></div>`,
    );
    expect(html).toBe('<div style="background-image: url(https://a.test/x.png); mask-image: url(/m.png)"></div>');
  });

  test("custom properties --x sao aceitas", () => {
    expect(renderToString(() => htmlString`<div style=${{ "--gap": "4px" }}></div>`).html).toBe('<div style="--gap: 4px"></div>');
  });

  test("style em string: declaracao maliciosa e removida, boa permanece", () => {
    const { html } = renderToString(
      () => htmlString`<div style=${"color:red;background:url(javascript:alert(1));position:fixed"}></div>`,
    );
    expect(html).toBe('<div style="color:red; position:fixed"></div>');
  });

  test("funcoes CSS que carregam URL sao rejeitadas (image, element, paint, cross-fade)", () => {
    for (const v of ["image('https://evil/x.png')", "element(#a)", "paint(w)", "cross-fade(url(/a), url(/b), 50%)"]) {
      expect(renderToString(() => htmlString`<div style=${{ background: v, color: "red" }}></div>`).html).toBe(
        '<div style="color: red"></div>',
      );
      expect(renderToString(() => htmlString`<div style=${`color:red;background:${v}`}></div>`).html).toBe(
        '<div style="color:red"></div>',
      );
    }
  });

  test("style estatico simples nao muda", () => {
    expect(renderToString(() => htmlString`<div style="color: red"></div>`).html).toBe('<div style="color: red"></div>');
  });
});

describe("srcdoc", () => {
  test("string simples e descartada com aviso", () => {
    const { html } = renderToString(() => htmlString`<iframe srcdoc=${"<script>alert(1)</script>"}></iframe>`);
    expect(html).toBe("<iframe></iframe>");
    expect(warnings.some((m) => m.includes("srcdoc"))).toBe(true);
  });

  test("SafeHtml e permitido (escapado como valor de atributo)", () => {
    const { html } = renderToString(() => htmlString`<iframe srcdoc=${unsafeHtml("<p>a</p>")}></iframe>`);
    expect(html).toBe('<iframe srcdoc="&lt;p&gt;a&lt;/p&gt;"></iframe>');
  });
});

describe("SEC-06: contexto por render", () => {
  const rxOf = (v: string) => ({ get: () => v, subscribe: () => () => {} });

  test("streams intercalados nao trocam estado entre si", async () => {
    const a = renderToStream(() => htmlString`<p class=${rxOf("SECRET-A") as never}></p>`);
    const b = renderToStream(() => htmlString`<p class=${rxOf("SECRET-B") as never}></p>`);
    const a1 = await a.next();
    const b1 = await b.next();
    renderToString(() => htmlString`<p class=${rxOf("SECRET-C") as never}></p>`);
    const a2 = await a.next();
    const b2 = await b.next();
    expect(a1.value).toContain('data-reactive-class="s0"');
    expect(b1.value).toContain('data-reactive-class="s0"');
    expect(a2.value).toContain('{"s0":"SECRET-A"}');
    expect(a2.value).not.toContain("SECRET-B");
    expect(a2.value).not.toContain("SECRET-C");
    expect(b2.value).toContain('{"s0":"SECRET-B"}');
    expect(b2.value).not.toContain("SECRET-A");
  });

  test("globais de SSR nao ficam ligadas durante os yields", async () => {
    const s = renderToStream(() => htmlString`<p>x</p>`);
    await s.next();
    expect(globalThis.__SLASH_SSR__).toBeFalsy();
    expect(globalThis.__SLASH_TRACK_ACCESS__).toBeUndefined();
    await s.return(undefined);
  });

  test("render dentro de render restaura o contexto externo", () => {
    const { html, state } = renderToString(() => {
      const inner = renderToString(() => htmlString`<i class=${rxOf("in") as never}></i>`);
      return htmlString`<p class=${rxOf("out") as never}>${inner.html.length}</p>`;
    });
    expect(state).toEqual({ s0: "out" });
    expect(html).toContain('data-reactive-class="s0"');
  });
});

describe("texto estatico vs dinamico (marcador interno)", () => {
  test("CSS estatico em <style> fica cru (a > b)", () => {
    expect(renderToString(() => htmlString`<style>a > b { color: red }</style>`).html).toBe(
      "<style>a > b { color: red }</style>",
    );
    expect(warnings).toHaveLength(0);
  });

  test("JS estatico em <script> fica cru (a > b &&; o parser do htm nao aceita < literal)", () => {
    expect(renderToString(() => htmlString`<script>if (a > b && c) x(1)</script>`).html).toBe(
      "<script>if (a > b && c) x(1)</script>",
    );
  });

  test("string dinamica em <style> e escapada com aviso", () => {
    const userCss = "</style><img onerror=1>";
    const { html } = renderToString(() => htmlString`<style>a > b {}${userCss}</style>`);
    expect(html).toBe("<style>a > b {}&lt;/style&gt;&lt;img onerror=1&gt;</style>");
    expect(warnings.some((m) => m.includes("unsafeHtml"))).toBe(true);
  });

  test("texto estatico em elemento normal continua escapado; dinamico tambem", () => {
    expect(renderToString(() => htmlString`<p>a & b ${"<b>"}</p>`).html).toBe("<p>a &amp; b &lt;b&gt;</p>");
  });

  test("array de strings vindo de .map e dinamico (escapado), tambem em <style>", () => {
    expect(renderToString(() => htmlString`<p>${["<a>", "<b>"].map((s) => s)}</p>`).html).toBe("<p>&lt;a&gt;&lt;b&gt;</p>");
    expect(renderToString(() => htmlString`<style>${["</style>"]}</style>`).html).toBe("<style>&lt;/style&gt;</style>");
  });

  test("funcao e reativo devolvendo string em <script> sao dinamicos", () => {
    const rx = { get: () => "</script>", subscribe: () => () => {} };
    expect(renderToString(() => htmlString`<script>${() => "</script>"}</script>`).html).toBe("<script>&lt;/script&gt;</script>");
    expect(renderToString(() => htmlString`<script>${rx as never}</script>`).html).toContain("&lt;/script&gt;");
  });

  test("templates aninhados e componentes compõem; SafeHtml em <script> segue cru", () => {
    const Box = ({ children, label }: { children: unknown; label: string }) =>
      htmlString`<div title=${label}>${children as never}</div>`;
    const { html } = renderToString(
      () => htmlString`<section><${Box} label="a<b">${htmlString`<i>x</i>`}t ${"<u>"}<//><script>${unsafeHtml("{}")}</script></section>`,
    );
    expect(html).toBe('<section><div title="a&lt;b"><i>x</i>t &lt;u&gt;</div><script>{}</script></section>');
  });

  test("tag dinamica e props de componente chegam como string simples", () => {
    let seen: unknown;
    const C = (p: { text: string }) => {
      seen = p.text;
      return htmlString`<b>${p.text}</b>`;
    };
    const { html } = renderToString(() => htmlString`<${"h1"}><${C} text=${"<x>"} /><//>`);
    expect(typeof seen).toBe("string");
    expect(html).toBe("<h1><b>&lt;x&gt;</b></h1>");
  });

  test("marcador nao vaza para o estado nem para atributos", () => {
    const st = createState({ q: "a<b", n: 1 });
    const { html, state } = renderToString(() => {
      const { q, n } = st.get();
      return htmlString`<p class=${q} title="x ${q}">${q}${n}</p>`;
    });
    expect(html).not.toContain("object");
    expect(html).toContain("&lt;");
    expect(JSON.stringify(state)).not.toContain("value");
    expect(state).toEqual({ s0: "a<b", s1: "a<b", s2: 1 });
    const rx = { get: () => "r", subscribe: () => () => {} };
    expect(renderToString(() => htmlString`<p class=${rx as never}>${rx as never}</p>`).state).toEqual({ s0: "r" });
  });
});

describe("round 2: raiz de htmlString sempre e SafeHtml", () => {
  test("raiz so com valor dinamico", () => {
    const r = htmlString`${X}`;
    expect(isSafeHtml(r)).toBe(true);
    expect(String(r)).toBe("&lt;img src=x onerror=alert(1)&gt;");
    expect(`${r}`).not.toContain("<img");
  });

  test("raiz com texto e valor (antes: array)", () => {
    const r = htmlString`Hello ${X}`;
    expect(isSafeHtml(r)).toBe(true);
    expect(String(r)).toBe("Hello &lt;img src=x onerror=alert(1)&gt;");
  });

  test("raiz so com texto estatico (antes: string)", () => {
    const r = htmlString`a & b`;
    expect(isSafeHtml(r)).toBe(true);
    expect(String(r)).toBe("a &amp; b");
  });

  test("raiz com varios elementos", () => {
    const r = htmlString`<a>${"<"}</a><b>x</b>`;
    expect(isSafeHtml(r)).toBe(true);
    expect(String(r)).toBe("<a>&lt;</a><b>x</b>");
  });

  test("resultado normalizado compoe em outro template e em renderToString", () => {
    const inner = htmlString`Hello ${X}`;
    expect(renderToString(() => htmlString`<p>${inner}</p>`).html).toBe("<p>Hello &lt;img src=x onerror=alert(1)&gt;</p>");
    expect(renderToString(() => htmlString`${X}`).html).not.toContain("<img");
  });

  test("atributo misto com valor dinamico continua funcionando", () => {
    expect(renderToString(() => htmlString`<p title="x ${"<q>"}">a</p>`).html).toBe('<p title="x &lt;q&gt;">a</p>');
  });
});

describe("round 2: brand proprio", () => {
  test("poluir Object.prototype com o Symbol.for nao forja SafeHtml", () => {
    const key = Symbol.for("slash.SafeHtml");
    try {
      (Object.prototype as Record<symbol, unknown>)[key] = true;
      expect(isSafeHtml({ value: "<img src=x onerror=1>" })).toBe(false);
      expect(renderToString(() => htmlString`<p>${{ value: "<b>" } as never}</p>`).html).not.toContain("<b>");
      expect(isSafeHtml(unsafeHtml("<b>"))).toBe(true);
    } finally {
      delete (Object.prototype as Record<symbol, unknown>)[key];
    }
  });
});

describe("round 2: CSS", () => {
  test("image-set, -webkit-image-set e src() sao rejeitados", () => {
    const { html } = renderToString(
      () =>
        htmlString`<div style=${{
          background: 'image-set("javascript:alert(1)" 1x)',
          backgroundImage: "-webkit-image-set(url(/a.png) 1x)",
          content: "src(https://a.test/x)",
          color: "red",
        }}></div>`,
    );
    expect(html).toBe('<div style="color: red"></div>');
  });

  test("nome de propriedade em maiusculas e aceito (string)", () => {
    expect(renderToString(() => htmlString`<div style=${"COLOR: red"}></div>`).html).toBe('<div style="COLOR: red"></div>');
  });
});

describe("round 2: data-reactive reservado", () => {
  test("atributo data-reactive-* do usuario e descartado com aviso", () => {
    const { html } = renderToString(() => htmlString`<div ...${{ "data-reactive-onclick": "s0", "DATA-REACTIVE-x": "1", "data-ok": "2" }}>x</div>`);
    expect(html).toBe('<div data-ok="2">x</div>');
    expect(warnings.some((m) => m.includes("data-reactive"))).toBe(true);
  });
});

describe("round 2: animacao SVG", () => {
  test.each(["to", "values", "from"])("<animate %s> passa por sanitizeUrl (shim: inalterado, sem quebrar)", (attr) => {
    const { html } = renderToString(() => htmlString`<animate ...${{ [attr]: "0;1" }} />`);
    expect(html).toBe(`<animate ${attr}="0;1"></animate>`);
  });
});

describe("round 2: objeto inesperado", () => {
  test("avisa uma vez, com contexto", () => {
    renderToString(() => htmlString`<p>${{ a: 1 } as never}${{ a: 2 } as never}</p>`);
    const w = warnings.filter((m) => m.includes("Unexpected object in child position"));
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("Object");
  });
});
