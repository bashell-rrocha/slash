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
