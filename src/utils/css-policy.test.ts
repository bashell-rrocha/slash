import { describe, expect, test } from "bun:test";
import { isSafeCssDeclaration, isSafeCssValue, sanitizeStyleString, splitDeclarations, styleKeyToCssName } from "./css-policy";

describe("isSafeCssValue", () => {
  test.each([
    "red",
    "10px",
    "calc(1px + 2px)",
    "linear-gradient(red, blue)",
    "url(https://a.test/x.png)",
    "url('/m.png')",
    'url("./a.png")',
    "url(#frag)",
    // url() segue a mesma lista dos atributos de URL
    "url(img/bg.png)",
    "url(//cdn.example.com/x.png)",
    "url(data:image/png;base64,AAAA)",
    "url('data:image/webp;base64,AAAA')",
    "url(mailto:a@b.co)",
    // escapes e comentarios: o valor DECODIFICADO e que e avaliado
    '"\\2022"',
    '"\\2022 "',
    "red /* comentario */",
    "'a;b'",
    '"/* nao e comentario */"',
    "'x' url(/a.png) 'y'",
  ])("permite %s", (v) => expect(isSafeCssValue(v)).toBe(true));

  test.each([
    "url(javascript:alert(1))",
    "url(data:text/html,x)",
    "url(https://a.test/x) url(javascript:x)",
    "expression(alert(1))",
    "javascript:alert(1)",
    "vbscript:x",
    "red;position:fixed",
    "red}body{x:y",
    "red<",
    "u\\72l(javascript:x)",
    "behavior: url(x)",
    "-moz-binding: url(x)",
    "@import 'x'",
    "image-set('a.png' 1x)",
    "-webkit-image-set(url(/a.png) 1x)",
    "src(javascript:x)",
    "image('https://evil/x.png')",
    "IMAGE (\"https://evil/x.png\")",
    "element(#id)",
    "-moz-element(#id)",
    "paint(worklet)",
    "cross-fade(url(/a.png), url(/b.png), 50%)",
    "-webkit-cross-fade(url(/a.png), url(/b.png), 50%)",
    // svg e data nao-raster
    "url(data:image/svg+xml,<svg/>)",
    "url(data:image/svg+xml;base64,AAAA)",
    "url(data:text/html;base64,AAAA)",
    "url(blob:https://x/y)",
    "url(vbscript:x)",
    // escapes CSS decodificados antes de checar
    "\\75rl(javascript:alert(1))",
    "ur\\l(javascript:alert(1))",
    "url(java\\73 cript:alert(1))",
    "url(\\6a avascript:alert(1))",
    "exp\\72 ession(alert(1))",
    "\\65xpression(alert(1))",
    "\\000069mage('https://evil/x.png')",
    "ima\\67 e-set('a.png' 1x)",
    // comentarios no meio de tokens
    "e/**/xpression(alert(1))",
    "u/**/rl(javascript:alert(1))",
    "java/**/script:alert(1)",
    "/* x */ expression(alert(1))",
    // comentario dentro de string nao esconde codigo fora dela
    '"/*" url(javascript:x) "*/"',
    // ';' fora de aspas / url continua separando
    "red;position:fixed",
    "'a' ; url(javascript:x)",
    "url(javascript:x",
  ])("bloqueia %s", (v) => expect(isSafeCssValue(v)).toBe(false));
});

describe("isSafeCssDeclaration / sanitizeStyleString", () => {
  test("nome e valor", () => {
    expect(isSafeCssDeclaration("color", "red")).toBe(true);
    expect(isSafeCssDeclaration("--x", "1")).toBe(true);
    expect(isSafeCssDeclaration("x:y;z", "1")).toBe(false);
    expect(isSafeCssDeclaration("color", "")).toBe(false);
  });
  test("string: remove só a declaração perigosa e informa", () => {
    expect(sanitizeStyleString("color:red;background:url(javascript:alert(1));position:fixed")).toEqual({
      value: "color:red; position:fixed",
      rejected: true,
    });
    expect(sanitizeStyleString("color: red")).toEqual({ value: "color: red", rejected: false });
    expect(sanitizeStyleString("background: image('x')").value).toBe("");
  });
});

describe("splitDeclarations (consciente de aspas, parenteses e comentarios)", () => {
  test("; dentro de string, url() e comentario nao separa", () => {
    expect(splitDeclarations("content:'a;b'; color:red")).toEqual(["content:'a;b'", "color:red"]);
    expect(splitDeclarations('content:"a;b";color:red')).toEqual(['content:"a;b"', "color:red"]);
    expect(splitDeclarations("background:url(data:image/png;base64,AAAA);color:red")).toEqual([
      "background:url(data:image/png;base64,AAAA)",
      "color:red",
    ]);
    expect(splitDeclarations("a:b/*;*/c;d:e")).toEqual(["a:b/*;*/c", "d:e"]);
  });
  test("aspas escapadas e vazios", () => {
    expect(splitDeclarations('content:"a\\";b";x:y')).toEqual(['content:"a\\";b"', "x:y"]);
    expect(splitDeclarations(" ; ;a:b;; ")).toEqual(["a:b"]);
  });
  test("parentese sem fechar nao esconde declaracoes perigosas (falha fechada)", () => {
    expect(sanitizeStyleString("a:b(;background:url(javascript:x)").value).toBe("");
  });
});

describe("sanitizeStyleString com a nova politica", () => {
  test("content com ; entre aspas e data:image;base64 sobrevivem", () => {
    expect(sanitizeStyleString("content:'a;b';color:red")).toEqual({ value: "content:'a;b'; color:red", rejected: false });
    const bg = "background:url(data:image/png;base64,AAAA)";
    expect(sanitizeStyleString(`${bg};color:red`)).toEqual({ value: `${bg}; color:red`, rejected: false });
  });
  test("escape do conteudo: emite o original, nao o decodificado", () => {
    expect(sanitizeStyleString('content:"\\2022"').value).toBe('content:"\\2022"');
  });
  test("resultado vazio", () => {
    expect(sanitizeStyleString("background:url(javascript:x)")).toEqual({ value: "", rejected: true });
    expect(sanitizeStyleString("")).toEqual({ value: "", rejected: false });
  });
});

describe("styleKeyToCssName", () => {
  test.each([
    ["backgroundColor", "background-color"],
    ["--myVar", "--myVar"],
    ["--my-var", "--my-var"],
    ["WebkitTransition", "-webkit-transition"],
    ["webkitTransition", "-webkit-transition"],
    ["MozAppearance", "-moz-appearance"],
    ["mozAppearance", "-moz-appearance"],
    ["msTransform", "-ms-transform"],
    ["MsTransform", "-ms-transform"],
    ["-webkit-transition", "-webkit-transition"],
    ["color", "color"],
  ])("%s -> %s", (k, name) => expect(styleKeyToCssName(k)).toBe(name));
});

describe("pre-processamento de newlines (CSS Syntax) antes de decodificar", () => {
  test.each([
    ["CRLF", "\r\n"],
    ["CR", "\r"],
    ["FF", "\f"],
    ["LF", "\n"],
    ["espaco", " "],
    ["tab", "\t"],
  ])("escape hex + %s consome um espaco e forma o token", (_n, ws) => {
    expect(isSafeCssValue(`\\75${ws}rl(blob:x)`)).toBe(false);
    expect(isSafeCssValue(`\\69${ws}mage-set('x' 1x)`)).toBe(false);
    expect(isSafeCssValue(`\\73${ws}rc(x)`)).toBe(false);
  });
  test("so UM espaco apos o escape e consumido: dois espacos separam os tokens", () => {
    expect(isSafeCssValue("\\75  rl(blob:x)")).toBe(true); // `u` + espaco + `rl(` nao e url(
    expect(isSafeCssValue("\\75\r\n\nrl(blob:x)")).toBe(true);
  });
  test("NUL vira U+FFFD (nao some e nao junta tokens)", () => {
    expect(isSafeCssValue("ur\u0000l(blob:x)")).toBe(true); // `ur\uFFFDl(` nao e a funcao url
    expect(isSafeCssValue("url(blob:x)\u0000")).toBe(false);
    expect(isSafeCssValue("\\75\u0000rl(blob:x)")).toBe(true); // NUL nao e branco: nao e consumido
  });
});

describe("nomes de propriedade proibidos", () => {
  test.each(["-moz-binding", "behavior", "behaviour", "-MOZ-BINDING", "Behavior"])("%s", (n) => {
    expect(isSafeCssDeclaration(n, "url(/x.xml)")).toBe(false);
    expect(isSafeCssDeclaration(n, "none")).toBe(false);
    expect(sanitizeStyleString(`color:red;${n}:none`)).toEqual({ value: "color:red", rejected: true });
  });
  test("nomes parecidos continuam validos", () => {
    expect(isSafeCssDeclaration("behavior-x", "1")).toBe(true);
    expect(isSafeCssDeclaration("scroll-behavior", "smooth")).toBe(true);
  });
});

// Fuzz deterministico e limitado: variantes de escape/espaco/comentario dos tokens perigosos
describe("fuzz deterministico das formas ofuscadas", () => {
  const TARGETS: Array<[string, string]> = [
    ["url(", "javascript:alert(1))"],
    ["image-set(", "'x' 1x)"],
    ["src(", "x)"],
    ["expression(", "alert(1))"],
    ["javascript:", "alert(1)"],
  ];
  const SEPS = ["", " ", "\t", "\n", "\r\n", "\r", "\f", "/**/", "/* a */"];
  // Todas as formas de escrever o i-esimo caractere de `tok` com um escape hex seguido de `sep`
  const variants = (tok: string, rest: string): string[] => {
    const out = new Set<string>();
    for (let i = 0; i < tok.length; i++) {
      const hex = tok.charCodeAt(i).toString(16);
      for (const sep of ["", " ", "\t", "\n", "\r\n", "\r", "\f"]) {
        // hex curto so e seguro com separador; sem ele o escape engoliria o proximo hex
        const padded = sep === "" ? hex.padStart(6, "0") : hex;
        out.add(tok.slice(0, i) + "\\" + padded + sep + tok.slice(i + 1) + rest);
      }
    }
    // comentario entre o token e o resto nao pode esconder o token: `tok` + comentario + rest
    for (const sep of SEPS) if (sep.startsWith("/*")) out.add(tok.slice(0, -1) + sep + tok.slice(-1) + rest);
    return [...out];
  };

  test("todas as variantes sao bloqueadas (e o conjunto e pequeno)", () => {
    const cases: string[] = [];
    for (const [tok, rest] of TARGETS) cases.push(...variants(tok, rest));
    expect(cases.length).toBeGreaterThan(100);
    expect(cases.length).toBeLessThan(600);
    const leaked = cases.filter((c) => isSafeCssValue(c));
    expect(leaked).toEqual([]);
    for (const c of cases) expect(sanitizeStyleString(`color:red;background:${c}`).value).toBe("color:red");
  });
});
