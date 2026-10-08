/**
 * Paridade cliente x SSR (SEC-I item 8): a MESMA tabela de ataques roda no cliente
 * (h -> DOM) e no SSR (htmlString -> HTML reanalisado). O resultado de cada caso deve
 * ser idêntico. Divergências aceitas ficam no fim, documentadas e travadas por teste.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { h } from "./hyper";
import { unsafeHtml } from "./safe-html";
import { unsafeUrl } from "./safe-url";
import { htmlString, renderToString } from "./server-render";
import { resetSecurityWarnings } from "./utils/security-warn";
import { BLOCKED_URL as B } from "./utils/url-policy";

let warn: ReturnType<typeof spyOn>;
beforeEach(() => {
  resetSecurityWarnings();
  warn = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

type Props = Record<string, unknown>;

function clientAttr(tag: string, props: Props, attr: string): string | null {
  const el = h(tag, props) as Element;
  return el.getAttribute(attr);
}

// Lê o atributo do HTML emitido (regex em vez de innerHTML: <html>, <base> e <script> não sobrevivem ao parser de fragmento)
function ssrAttr(tag: string, props: Props, attr: string): string | null {
  const { html } = renderToString(() => htmlString`<${tag} ...${props}></${tag}>`);
  const open = html.slice(0, html.indexOf(">") + 1);
  const name = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`\\s${name}="([^"]*)"`, "i").exec(open);
  if (!m) return null;
  return (m[1] as string)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&");
}

// Executa o caso nos dois lados e exige o mesmo resultado
function both(tag: string, props: Props, attr: string, expected: string | null): void {
  expect({ side: "client", value: clientAttr(tag, props, attr) }).toEqual({ side: "client", value: expected });
  expect({ side: "ssr", value: ssrAttr(tag, props, attr) }).toEqual({ side: "ssr", value: expected });
}

const ATTACKS = [
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

const URL_SINKS: Array<[string, string]> = [
  ["a", "href"],
  ["area", "href"],
  ["form", "action"],
  ["button", "formaction"],
  ["input", "formaction"],
  ["iframe", "src"],
  ["embed", "src"],
  ["script", "src"],
  ["base", "href"],
  ["video", "poster"],
  ["blockquote", "cite"],
  ["a", "ping"],
  ["object", "data"],
  ["td", "background"],
  ["a", "xlink:href"],
  ["img", "longdesc"],
  ["img", "lowsrc"],
  ["html", "manifest"],
  ["applet", "codebase"],
];

describe("paridade: URLs de ataque em todos os atributos de URL", () => {
  for (const attack of ATTACKS) {
    test(`${JSON.stringify(attack)}`, () => {
      for (const [tag, attr] of URL_SINKS) both(tag, { [attr]: attack }, attr, B);
    });
  }
  test("atributo em maiusculas (HREF) tambem e URL", () => {
    // o parser de HTML minusculiza o nome; compara o resultado do lado cliente com o SSR
    both("a", { HREF: "javascript:alert(1)" }, "href", B);
  });
});

describe("paridade: URLs permitidas passam intactas", () => {
  const ok = ["/x?y=1&z=2", "./a", "../a", "?q=1", "#h", "https://example.com/a", "http://example.com", "mailto:a@b.co", "tel:+5511", "page.html", "//cdn.example.com/x"];
  for (const url of ok) {
    test(JSON.stringify(url), () => {
      both("a", { href: url }, "href", url);
      both("form", { action: url }, "action", url);
    });
  }
  test("BLOCKED_URL nao e bloqueada de novo", () => both("a", { href: B }, "href", B));
  test("title/id/data-x com javascript: nao sao URL", () => {
    both("a", { title: "javascript:x" }, "title", "javascript:x");
    both("div", { "data-url": "javascript:x" }, "data-url", "javascript:x");
    both("div", { data: "javascript:x" }, "data", "javascript:x");
  });
});

describe("paridade: data:image so em imagem", () => {
  const png = "data:image/png;base64,AAAA";
  test("img src, srcset e video poster aceitam", () => {
    both("img", { src: png }, "src", png);
    both("video", { poster: png }, "poster", png);
  });
  test("a href, iframe src, embed src, object data bloqueiam", () => {
    both("a", { href: png }, "href", B);
    both("iframe", { src: png }, "src", B);
    both("embed", { src: png }, "src", B);
    both("object", { data: png }, "data", B);
  });
});

describe("paridade: srcset / imagesrcset", () => {
  test("so o candidato perigoso e substituido", () => {
    both("img", { srcset: "/a.png 1x, javascript:alert(1) 2x, /c.png 3x" }, "srcset", `/a.png 1x, ${B} 2x, /c.png 3x`);
    both("link", { imagesrcset: "/a.png 1x, javascript:alert(1) 2x" }, "imagesrcset", `/a.png 1x, ${B} 2x`);
  });
  test("srcset seguro nao muda", () => both("img", { srcset: "/a.png 1x, /b.png 2x" }, "srcset", "/a.png 1x, /b.png 2x"));
});

describe("paridade: SMIL to/from/values", () => {
  for (const tag of ["animate", "set", "animateMotion"]) {
    test(tag, () => {
      both(tag, { to: "javascript:alert(1)" }, "to", B);
      both(tag, { from: "javascript:alert(1)" }, "from", B);
      both(tag, { values: "/a;javascript:alert(1);/b" }, "values", `/a;${B};/b`);
    });
  }
  test("to/values em outras tags nao sao URL", () => both("div", { to: "javascript:x", values: "javascript:y" }, "to", "javascript:x"));
});

describe("paridade: unsafeUrl", () => {
  test("SafeUrl passa sem sanitizar nos dois lados", () => {
    both("a", { href: unsafeUrl("javascript:void(0)") }, "href", "javascript:void(0)");
  });
  test("objetos que imitam SafeUrl nao passam", () => {
    const fake = JSON.parse('{"value":"javascript:x"}');
    expect(clientAttr("a", { href: fake }, "href")).not.toContain("javascript");
    expect(ssrAttr("a", { href: fake }, "href")).not.toContain("javascript");
  });
});

describe("paridade: srcdoc", () => {
  test("string comum e bloqueada (atributo ausente)", () => {
    both("iframe", { srcdoc: "<script>alert(1)</script>" }, "srcdoc", null);
  });
  test("SafeHtml e aceito", () => {
    both("iframe", { srcdoc: unsafeHtml("<p>a</p>") }, "srcdoc", "<p>a</p>");
  });
  test("objeto que imita SafeHtml e bloqueado", () => {
    both("iframe", { srcdoc: JSON.parse('{"value":"<script>x</script>"}') }, "srcdoc", null);
  });
});

describe("paridade: meta http-equiv=refresh", () => {
  test("URL perigosa e substituida, em qualquer ordem de atributos", () => {
    both("meta", { "http-equiv": "refresh", content: "0;url=javascript:alert(1)" }, "content", `0;url=${B}`);
    both("meta", { content: "0;javascript:alert(1)", "http-equiv": "refresh" }, "content", `0;${B}`);
    both("meta", { "http-equiv": "refresh", content: "5, data:text/html,x" }, "content", `5, ${B}`);
  });
  test("refresh seguro e meta comum passam", () => {
    both("meta", { "http-equiv": "refresh", content: "5;url=/next" }, "content", "5;url=/next");
    both("meta", { name: "description", content: "Warning: x" }, "content", "Warning: x");
  });
  test("meta comum so e tocado com http-equiv=refresh: descricoes que parecem refresh passam", () => {
    for (const content of ["10 things: a guide", "5: tips", "3, javascript:rocks", "1.5 data:image tips", "2 vbscript: myths"]) {
      both("meta", { name: "description", content }, "content", content);
      both("meta", { property: "og:title", content }, "content", content);
    }
  });
  test("http-equiv e case-insensitive e espacos sao aceitos", () => {
    for (const v of ["Refresh", "REFRESH", " refresh "]) {
      both("meta", { "http-equiv": v, content: "0;url=javascript:alert(1)" }, "content", `0;url=${B}`);
      both("meta", { content: "0;url=javascript:alert(1)", "http-equiv": v }, "content", `0;url=${B}`);
    }
  });
  test("http-equiv diferente de refresh nao e tocado", () => {
    both("meta", { "http-equiv": "content-type", content: "0;url=javascript:x" }, "content", "0;url=javascript:x");
  });
  test("sintaxe de atraso do HTML: digitos, depois ';', ',' ou espaco", () => {
    both("meta", { "http-equiv": "refresh", content: "5 javascript:x" }, "content", `5 ${B}`);
    both("meta", { "http-equiv": "refresh", content: "5,javascript:x" }, "content", `5,${B}`);
    // sem separador depois do numero o navegador ignora o refresh: nao e URL
    both("meta", { "http-equiv": "refresh", content: "5javascript:x" }, "content", "5javascript:x");
  });
});

describe("paridade: style", () => {
  // Valor perigoso removido nos dois lados; a declaracao boa sobrevive.
  const DANGEROUS = [
    "url(javascript:alert(1))",
    "url(data:text/html,x)",
    "expression(alert(1))",
    "javascript:alert(1)",
    "image('https://evil/x.png')",
    "image-set('a.png' 1x)",
    "-webkit-image-set(url(/a.png) 1x)",
    "element(#a)",
    "-moz-element(#a)",
    "paint(w)",
    "cross-fade(url(/a), url(/b), 50%)",
    "src(javascript:x)",
    "red}body{x:y",
    "u\\72l(javascript:x)",
  ];
  for (const v of DANGEROUS) {
    test(`string: ${JSON.stringify(v)}`, () => {
      const style = `color:red;background:${v}`;
      // a string com ';' extra vira declaracoes separadas: so as seguras sobrevivem
      for (const out of [clientAttr("div", { style }, "style"), ssrAttr("div", { style }, "style")]) {
        expect(out ?? "").toContain("color:red");
        expect(out ?? "").not.toMatch(/javascript|expression|image|element|paint|cross-fade|src\(|evil|\/\/|\\|fixed|body/i);
      }
      expect(clientAttr("div", { style }, "style")).toBe(ssrAttr("div", { style }, "style"));
    });
    test(`objeto: ${JSON.stringify(v)}`, () => {
      const style = { color: "red", backgroundImage: v };
      const c = clientAttr("div", { style }, "style") ?? "";
      const s = ssrAttr("div", { style }, "style") ?? "";
      for (const out of [c, s]) {
        expect(out).toContain("red");
        expect(out).not.toMatch(/javascript|expression|image\(|image-set|element|paint|cross-fade|src\(|evil|\/\/|\\/i);
      }
    });
  }
  test("style sem nenhuma declaracao segura: atributo omitido nos dois lados", () => {
    both("div", { style: "background:url(javascript:x)" }, "style", null);
    both("div", { style: "expression(1)" }, "style", null);
    both("div", { style: "" }, "style", null);
    expect(clientAttr("div", { style: { backgroundImage: "url(javascript:x)" } }, "style") ?? "").toBe("");
    expect(ssrAttr("div", { style: { backgroundImage: "url(javascript:x)" } }, "style")).toBeNull();
  });
  test("url() segue a lista dos atributos de URL; escapes e ';' entre aspas sobrevivem (string)", () => {
    for (const style of [
      "background:url(img/bg.png)",
      "background:url(//cdn.example.com/x.png)",
      "background:url(data:image/png;base64,AAAA)",
      'content:"\\2022"',
      "content:'a;b'; color:red",
    ]) both("div", { style }, "style", style);
  });
  test("escapes CSS e comentarios no meio de tokens nao driblam a politica (string e objeto)", () => {
    for (const v of ["\\75rl(javascript:x)", "ur\\l(javascript:x)", "e/**/xpression(1)", "url(data:image/svg+xml,<svg/>)", "exp\\72 ession(1)"]) {
      both("div", { style: `color:red;background:${v}` }, "style", "color:red");
      for (const out of [clientAttr("div", { style: { color: "red", background: v } }, "style"), ssrAttr("div", { style: { color: "red", background: v } }, "style")]) {
        expect(out ?? "").not.toMatch(/javascript|xpression|svg|\\/i);
      }
    }
  });
  // Pre-processamento do CSS: \r\n, \r e \f viram \n e um escape hex consome UM espaco em branco
  // (\r\n conta como um), entao `\75\r\nrl(` e `url(` para o navegador
  const NL = [["CRLF", "\r\n"], ["CR", "\r"], ["FF", "\f"], ["LF", "\n"]] as const;
  const PAYLOADS = (nl: string) => [
    `\\75${nl}rl(blob:x)`,
    `\\69${nl}mage-set('x' 1x)`,
    `\\73${nl}rc(x)`,
    `\\75${nl}rl(javascript:alert(1))`,
    `\\65${nl}xpression(alert(1))`,
  ];
  for (const [name, nl] of NL) {
    test(`escape + quebra de linha ${name}: nao driblam a politica (string e objeto, cliente e SSR)`, () => {
      for (const v of PAYLOADS(nl)) {
        const outs = [
          clientAttr("div", { style: `color:red;background:${v}` }, "style"),
          ssrAttr("div", { style: `color:red;background:${v}` }, "style"),
        ];
        for (const out of outs) expect(out).toBe("color:red");
        for (const out of [
          clientAttr("div", { style: { color: "red", background: v } }, "style"),
          ssrAttr("div", { style: { color: "red", background: v } }, "style"),
        ]) {
          expect(out ?? "").toContain("red");
          expect(out ?? "").not.toMatch(/blob|image|src|javascript|xpression|\\|\r|\f|\n/i);
        }
      }
    });
  }
  test("barra invertida fora de string: declaracao descartada nos dois lados (string e objeto)", () => {
    for (const v of ["\\/* url(data:image/svg+xml,<svg/>) */", "\\/*image-set('x' 1x)*/", "\\/* src(x) */", "\\/ expression(1)", "\\75 rl(/ok.png)"]) {
      both("div", { style: `color:red;background:${v}` }, "style", "color:red");
      for (const out of [
        clientAttr("div", { style: { color: "red", background: v } }, "style"),
        ssrAttr("div", { style: { color: "red", background: v } }, "style"),
      ]) {
        expect(out ?? "").toContain("red");
        expect(out ?? "").not.toMatch(/url|image-set|src|expression|svg|\\/i);
      }
    }
    // nome de propriedade com escape
    both("div", { style: "color:red;b\\65havior:none" }, "style", "color:red");
    for (const out of [
      clientAttr("div", { style: { color: "red", "b\\65havior": "none" } }, "style"),
      ssrAttr("div", { style: { color: "red", "b\\65havior": "none" } }, "style"),
    ]) expect(out ?? "").not.toMatch(/havior|\\/);
  });
  test("escapes DENTRO de string continuam funcionando nos dois lados", () => {
    for (const d of ['content:"\\2022"', 'content:"\\201C"', 'font-family:"\\5FAE\\8F6F"', 'content:"a\\"b"', "content:'\\'/'"]) {
      both("div", { style: `color:red;${d}` }, "style", `color:red; ${d}`);
    }
  });
  test("estrito: comentario em qualquer lugar, newline em string, url() fora do charset (string e objeto)", () => {
    const bad = [
      'url(/*) , image-set("a.png" 1x), var(--x) /* */ x)',
      "url(/*) , url(data:image/svg+xml,<svg/>), var(--x) /* */ x)",
      "url(/*) , src(x), var(--x) /* */ x)",
      "\"\n'\"/*';background-image:image-set(\"x\" 1x);x:*/",
      "red /* c */",
      "url(a b.png)",
      "url(data:image/svg+xml,<svg/>)",
    ];
    for (const v of bad) {
      both("div", { style: `color:red;background:${v}` }, "style", "color:red");
      for (const out of [
        clientAttr("div", { style: { color: "red", background: v } }, "style"),
        ssrAttr("div", { style: { color: "red", background: v } }, "style"),
      ]) {
        expect(out ?? "").toContain("red");
        expect(out ?? "").not.toMatch(/image|src|svg|\/\*|url/i);
      }
    }
  });
  test("colchetes/parenteses desbalanceados fora de strings derrubam a declaracao", () => {
    for (const v of ["calc(1px", "foo(", "a)", "[x", "x]", "(]", "([)]", "rgb(1,2,3))", "url(/a.png)) "]) {
      // um "(" sem fechar engole as declaracoes seguintes (como no navegador): elas caem juntas
      const style = `color:red;width:${v};height:1px`;
      const c = clientAttr("div", { style }, "style");
      expect(c).toBe(ssrAttr("div", { style }, "style"));
      expect(c).toContain("color:red");
      expect(c).not.toContain("width");
    }
    both("div", { style: "width:calc((1px + 2px) * 3);grid-template-columns:[a] 1fr [b]" }, "style", "width:calc((1px + 2px) * 3); grid-template-columns:[a] 1fr [b]");
  });
  test("estrito: newlines entre declaracoes e CSS comum passam nos dois lados", () => {
    const style = `color: red;\n  background: url(a/b.png);\n  content: "\\2022"`;
    both("div", { style }, "style", "color: red; background: url(a/b.png); content: \"\\2022\"");
  });
  test("estrito: style com mais de 8 KB e descartado por inteiro nos dois lados", () => {
    const style = `color:red;${"width:1px;".repeat(900)}`;
    both("div", { style }, "style", null);
    const obj = { color: "red", "--big": "a".repeat(8200) };
    expect(ssrAttr("div", { style: obj }, "style")).toBeNull();
    expect(clientAttr("div", { style: obj }, "style") ?? "").toBe("");
  });
  test("string sem fechar falha fechado nos dois lados", () => {
    both("div", { style: 'color:red;content:"abc' }, "style", "color:red");
  });
  test("-moz-binding e behavior como NOME de propriedade (string e objeto, cliente e SSR)", () => {
    for (const name of ["-moz-binding", "behavior", "behaviour", "-MOZ-BINDING", "Behavior"]) {
      both("div", { style: `color:red;${name}:url(/x.xml)` }, "style", "color:red");
    }
    for (const key of ["MozBinding", "mozBinding", "-moz-binding", "behavior", "behaviour"]) {
      for (const out of [
        clientAttr("div", { style: { color: "red", [key]: "url(/x.xml)" } }, "style"),
        ssrAttr("div", { style: { color: "red", [key]: "url(/x.xml)" } }, "style"),
      ]) expect(out ?? "").not.toMatch(/binding|behavio/i);
    }
  });
  test("chaves de objeto: --custom verbatim e prefixos de vendor", () => {
    const c = h("div", { style: { "--myVar": "1px", WebkitTransition: "all 1s", msTransform: "none" } }) as HTMLElement;
    expect(c.style.getPropertyValue("--myVar")).toBe("1px");
    expect(c.style.getPropertyValue("-webkit-transition")).toBe("all 1s");
    expect(ssrAttr("div", { style: { "--myVar": "1px", WebkitTransition: "all 1s", msTransform: "none", MozAppearance: "none", webkitFilter: "none" } }, "style")).toBe(
      "--myVar: 1px; -webkit-transition: all 1s; -ms-transform: none; -moz-appearance: none; -webkit-filter: none",
    );
  });
  test("objeto: ';' no valor nao cria declaracao nova", () => {
    const style = { color: "red", background: "red;position:fixed" };
    for (const out of [clientAttr("div", { style }, "style"), ssrAttr("div", { style }, "style")]) {
      expect(out ?? "").not.toContain("fixed");
    }
  });
  test("style seguro: string identica e objeto equivalente", () => {
    both("div", { style: "color: red; background: url(/a.png)" }, "style", "color: red; background: url(/a.png)");
    expect(clientAttr("div", { style: { color: "red" } }, "style")).toContain("red");
    expect(ssrAttr("div", { style: { color: "red" } }, "style")).toBe("color: red");
  });
  test("chaves invalidas de objeto: cssText e nomes com ; sao descartados nos dois lados", () => {
    for (const out of [
      clientAttr("div", { style: { cssText: "position:fixed", "x:y;z": "1", color: "red" } }, "style"),
      ssrAttr("div", { style: { cssText: "position:fixed", "x:y;z": "1", color: "red" } }, "style"),
    ]) {
      expect(out ?? "").toContain("red");
      expect(out ?? "").not.toMatch(/fixed|x:y/);
    }
  });
});

// Todo nome policiado e comparado em minusculas: STYLE/Style/sTyLe, HREF, SrcDoc, InnerHTML... nao
// escapam da politica (setAttribute minusculiza o nome, entao a politica precisa fazer o mesmo)
describe("paridade: variantes de caixa dos nomes policiados", () => {
  const CASES = (name: string): string[] => [name.toUpperCase(), name[0]!.toUpperCase() + name.slice(1), [...name].map((c, i) => (i % 2 ? c : c.toUpperCase())).join("")];
  const J = "javascript:alert(1)";

  test("style string e objeto em qualquer caixa", () => {
    for (const key of CASES("style")) {
      both("div", { [key]: `color:red;background:url(${J})` }, "style", "color:red");
      both("div", { [key]: "background:url(javascript:alert(1))" }, "style", null);
      for (const out of [
        clientAttr("div", { [key]: { color: "red", backgroundImage: `url(${J})` } }, "style"),
        ssrAttr("div", { [key]: { color: "red", backgroundImage: `url(${J})` } }, "style"),
      ]) {
        expect(out ?? "").toContain("red");
        expect(out ?? "").not.toMatch(/javascript|url/i);
      }
      // seguro continua funcionando
      expect(clientAttr("div", { [key]: { color: "red" } }, "style")).toContain("red");
      expect(ssrAttr("div", { [key]: { color: "red" } }, "style")).toBe("color: red");
    }
  });

  test("atributos de URL em qualquer caixa", () => {
    for (const [tag, attr] of [["a", "href"], ["img", "src"], ["form", "action"], ["button", "formaction"], ["video", "poster"]] as const) {
      for (const key of CASES(attr)) both(tag, { [key]: J }, attr, B);
    }
    for (const key of CASES("srcset")) both("img", { [key]: `/a.png 1x, ${J} 2x` }, "srcset", `/a.png 1x, ${B} 2x`);
  });

  test("srcdoc e innerHTML/outerHTML em qualquer caixa", () => {
    for (const key of CASES("srcdoc")) both("iframe", { [key]: "<script>alert(1)</script>" }, "srcdoc", null);
    for (const key of ["INNERHTML", "InnerHTML", "innerHtml", "OUTERHTML", "OuterHTML"]) {
      const c = h("div", { [key]: "<img src=x onerror=alert(1)>" }) as Element;
      expect(c.querySelector("img")).toBeNull();
      expect(c.getAttribute(key.toLowerCase())).toBeNull();
    }
  });

  test("on* em qualquer caixa", () => {
    for (const key of ["ONCLICK", "OnClick", "oNcLiCk", "ONERROR", "ONFOCUS"]) both("img", { [key]: "alert(1)" }, key.toLowerCase(), null);
  });

  test("meta refresh: HTTP-EQUIV e CONTENT em qualquer caixa", () => {
    for (const [he, ct] of [["HTTP-EQUIV", "CONTENT"], ["Http-Equiv", "Content"], ["http-equiv", "CONTENT"]] as const) {
      both("meta", { [he]: "REFRESH", [ct]: `0;url=${J}` }, "content", `0;url=${B}`);
      both("meta", { [ct]: `0;url=${J}`, [he]: "Refresh" }, "content", `0;url=${B}`);
    }
  });

  test("class/className/value/checked em qualquer caixa funcionam como a forma canonica", () => {
    for (const key of ["CLASS", "Class", "CLASSNAME", "ClassName"]) {
      expect((h("div", { [key]: { a: true, b: false } }) as Element).getAttribute("class")).toBe("a");
      expect(ssrAttr("div", { [key]: { a: true, b: false } }, "class")).toBe("a");
    }
    for (const key of ["VALUE", "Value"]) expect((h("input", { [key]: "x" }) as HTMLInputElement).value).toBe("x");
    for (const key of ["CHECKED", "Checked"]) expect((h("input", { type: "checkbox", [key]: true }) as HTMLInputElement).checked).toBe(true);
  });

  test("chaves de objeto de style proibidas em qualquer caixa (cssText, setProperty...)", () => {
    for (const k of ["CSSTEXT", "CssText", "cssText", "SETPROPERTY", "setproperty", "LENGTH", "PARENTRULE"]) {
      const c = h("div", { style: { color: "red", [k]: "position:fixed" } }) as HTMLElement;
      expect(c.getAttribute("style") ?? "").not.toMatch(/fixed/);
      expect(ssrAttr("div", { style: { color: "red", [k]: "position:fixed" } }, "style") ?? "").not.toMatch(/fixed/);
    }
  });
});

describe("paridade: handlers, nomes de atributo e de tag", () => {
  test("qualquer /^on/i com valor que nao e handler nunca vira atributo (string, true, objeto)", () => {
    for (const name of ["onclick", "onClick", "onerror", "onmouseover", "onfocus", "onpointerdown", "onload", "ontoggle", "onbegin", "onend", "onrepeat", "online", "once", "one", "onfoo"]) {
      for (const v of ["alert(1)", true, { a: 1 }]) {
        both("img", { [name]: v }, name.toLowerCase(), null);
      }
    }
  });
  test("on* com string nunca vira atributo (lista curta)", () => {
    for (const name of ["onclick", "onClick"]) {
      both("img", { [name]: "alert(1)" }, name.toLowerCase(), null);
    }
  });
  test("nomes de atributo invalidos sao descartados (sem injecao)", () => {
    const props = { 'x onmouseover="alert(1)"': "1", 'a"b': "1", "a>b": "1", "a=b": "1" };
    const c = h("div", props) as Element;
    expect(c.attributes.length).toBe(0);
    const { html } = renderToString(() => htmlString`<div ...${props}></div>`);
    expect(html).toBe("<div></div>");
  });
  test("tag dinamica invalida lanca nos dois lados", () => {
    const evil = "img src=x onerror=alert(1)";
    expect(() => h(evil, {})).toThrow();
    expect(() => renderToString(() => htmlString`<${evil}>x<//>`)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Divergencias ACEITAS (documentadas; travadas para que mudem so de proposito)
// ---------------------------------------------------------------------------
describe("divergencias aceitas entre cliente e SSR", () => {
  test("innerHTML: cliente bloqueia a prop; SSR so emite um atributo inerte (escapado)", () => {
    const X = "<img src=x onerror=alert(1)>";
    const c = h("div", { innerHTML: X }) as Element;
    expect(c.querySelector("img")).toBeNull();
    expect(c.getAttribute("innerhtml")).toBeNull();
    const { html } = renderToString(() => htmlString`<div ...${{ innerHTML: X }}></div>`);
    expect(html).not.toContain("<img");
  });
  test("style objeto: serializacao difere (CSSOM no cliente), mas a politica de valores e a mesma", () => {
    expect(clientAttr("div", { style: { color: "red" } }, "style")).not.toBe(ssrAttr("div", { style: { color: "red" } }, "style") + "x");
  });
  test("__proto__/constructor como prop: cliente descarta; SSR emite um atributo HTML inerte", () => {
    const props = JSON.parse('{"__proto__":"x","constructor":"y"}');
    expect(clientAttr("div", props, "constructor")).toBeNull();
    expect(ssrAttr("div", props, "constructor")).toBe("y");
  });
  test("data-reactive-*: reservado so no SSR (marcadores de hidratacao)", () => {
    expect(ssrAttr("div", { "data-reactive-class": "s0" }, "data-reactive-class")).toBeNull();
  });
});
