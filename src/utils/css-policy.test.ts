import { describe, expect, test } from "bun:test";
import { isForbiddenStyleKey, isSafeCssDeclaration, isSafeCssValue, sanitizeStyleString, splitDeclarations, styleKeyToCssName, styleObjectTooLong } from "./css-policy";

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
    // D3/D4: url() is an image context, same as <img src>: svg+xml images and blob: are allowed
    "url(data:image/svg+xml;base64,AAAA)",
    "url('data:image/svg+xml;base64,AAAA')",
    "url(blob:https://x/y)",
    // escapes e comentarios: o valor DECODIFICADO e que e avaliado
    '"\\2022"',
    '"\\2022 "',
    "'a;b'",
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
    "url(data:text/html;base64,AAAA)",
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
    // comentarios nao sao emulados: `/*` derruba a declaracao em isSafeCssValue
    expect(splitDeclarations("a:b/*;*/c;d:e")).toEqual(["a:b/*", "*/c", "d:e"]);
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
  test("escape fora de string e sempre rejeitado, mesmo com alvo inofensivo", () => {
    expect(isSafeCssValue("\\75  rl(blob:x)")).toBe(false);
    expect(isSafeCssValue("\\75\r\n\nrl(blob:x)")).toBe(false);
    expect(isSafeCssValue("\\75 rl(x)")).toBe(false);
  });
  test("NUL em qualquer lugar derruba a declaracao (estrito)", () => {
    expect(isSafeCssValue("ur\u0000l(/x)")).toBe(false);
    expect(isSafeCssValue("url(blob:x)\u0000")).toBe(false);
    expect(isSafeCssValue("\\75\u0000rl(blob:x)")).toBe(false); // escape fora de string
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

  // Familia `\/*`: barra invertida antes de `/*` (nao e comentario) e escapes fora de string
  const escapedComment = (tok: string, rest: string): string[] => {
    const out: string[] = [];
    for (const open of ["\\/*", "\\/* ", "\\/**", " \\/*", "red \\/* x */ ", "\\/*/"]) {
      for (const close of ["*/", " */", ""]) out.push(`${open}${tok}${rest}${close}`, `${open}*/${tok}${rest}`);
    }
    out.push(`\\/${tok}${rest}`, `\\${tok}${rest}`, `${tok.slice(0, 1)}\\${tok.slice(1)}${rest}`);
    return out;
  };

  test("todas as variantes sao bloqueadas (e o conjunto e pequeno)", () => {
    const cases: string[] = [];
    for (const [tok, rest] of TARGETS) cases.push(...variants(tok, rest), ...escapedComment(tok, rest));
    expect(cases.length).toBeGreaterThan(100);
    expect(cases.length).toBeLessThan(700);
    const leaked = cases.filter((c) => isSafeCssValue(c));
    expect(leaked).toEqual([]);
    for (const c of cases) expect(sanitizeStyleString(`color:red;background:${c}`).value).toBe("color:red");
  });
});

describe("escapes: qualquer barra invertida FORA de string invalida a declaracao", () => {
  test.each([
    "\\/* url(data:image/svg+xml,<svg/>) */",
    "\\/*image-set('x' 1x)*/",
    "\\/* src(x) */",
    "\\/* expression(1) */",
    "\\/**/url(blob:x)",
    "\\/ url(blob:x)",
    "red \\/* x */ url(blob:x)",
    "\\75 rl(x)",
    "\\75rl(/ok.png)",
    "\\;",
    "red\\",
    "a\\\nb",
    'url(a\\)b)',
  ])("bloqueia %s", (v) => expect(isSafeCssValue(v)).toBe(false));

  test("barra dentro de comentario fechado e ignorada (o comentario some)", () => {
    expect(isSafeCssValue("red /* \\ */")).toBe(false); // `/*` em qualquer lugar derruba
  });

  test.each([
    '"\\2022"',
    '"\\201C"',
    '"\\5FAE\\8F6F"',
    '"a\\"b"',
    "'a\\'b'",
    "'x' \"\\2022\" 'y'",
  ])("permite string com escape %s", (v) => expect(isSafeCssValue(v)).toBe(true));

  test("string com escape que decodifica algo perigoso continua bloqueada", () => {
    expect(isSafeCssValue('"\\6a avascript:x"')).toBe(false);
    expect(isSafeCssValue('"java\\73 cript:x"')).toBe(false);
  });

  test("string sem fechar falha fechado", () => {
    expect(isSafeCssValue('"abc')).toBe(false);
    expect(isSafeCssValue("'abc\\'")).toBe(false);
    expect(isSafeCssValue('red "url(javascript:x)')).toBe(false);
    expect(isSafeCssValue('"a" "')).toBe(false);
  });
});

describe("sanitizeStyleString e escapes", () => {
  test("declaracao com barra fora de string e removida e avisa (rejected)", () => {
    expect(sanitizeStyleString("color:red;background:\\75 rl(/ok.png)")).toEqual({ value: "color:red", rejected: true });
    expect(sanitizeStyleString("color:red;b\\65havior:none")).toEqual({ value: "color:red", rejected: true });
    expect(sanitizeStyleString("color:red;background:\\/* url(blob:x) */")).toEqual({ value: "color:red", rejected: true });
  });
  test("strings com escape continuam funcionando", () => {
    for (const d of ['content:"\\2022"', 'content:"\\201C"', 'font-family:"\\5FAE\\8F6F"', 'content:"a\\"b"', "content:'\\'/'"]) {
      expect(sanitizeStyleString(`color:red;${d}`)).toEqual({ value: `color:red; ${d}`, rejected: false });
    }
  });
  test("string sem fechar derruba a declaracao (e as seguintes, como no navegador)", () => {
    expect(sanitizeStyleString('color:red;content:"abc;background:url(/a.png)')).toEqual({ value: "color:red", rejected: true });
  });
});

describe("splitDeclarations e escapes", () => {
  test("\\; nao separa, \\/* nao abre comentario, \\\" nao abre string", () => {
    expect(splitDeclarations("a:b\\;c;d:e")).toEqual(["a:b\\;c", "d:e"]);
    expect(splitDeclarations("a:\\/*;d:e*/")).toEqual(["a:\\/*", "d:e*/"]);
    expect(splitDeclarations('a:\\";b:c;d:e')).toEqual(['a:\\"', "b:c", "d:e"]);
  });
  test("aspas com escape dentro de string nao fecham a string", () => {
    expect(splitDeclarations("content:'\\'/*;';x:y")).toEqual(["content:'\\'/*;'", "x:y"]);
  });
});

// ---------------------------------------------------------------------------
// Politica ESTRITA (fix round 4): sem comentarios, sem newline cru em string, url() sem
// emulacao do tokenizador, limite de tamanho, scanner linear
// ---------------------------------------------------------------------------
describe("estrito: /* em qualquer lugar derruba a declaracao", () => {
  test.each([
    "red /* c */",
    "/**/red",
    '"a /* b */"',
    "'/*'",
    "url(/*) , image-set(\"a.png\" 1x), var(--x) /* */ x)",
    "url(/*) , url(data:image/svg+xml,<svg/>), var(--x) /* */ x)",
    "url(/*) , src(x), var(--x) /* */ x)",
    "url(/*",
    "url(/a/*b)",
    "calc(1px /* x */ + 2px)",
  ])("bloqueia %s", (v) => expect(isSafeCssValue(v)).toBe(false));
});

describe("estrito: newline cru dentro de string", () => {
  test.each([
    "\"a\n'\"",
    "'a\rb'",
    '"a\fb"',
    '"a\u0000b"',
    "\"\n'\"/*';background-image:image-set(\"x\" 1x);x:*/",
    '"abc\\\n"', // barra + newline (continuacao) tambem
    '"abc\\\r\n"',
  ])("bloqueia %j", (v) => expect(isSafeCssValue(v)).toBe(false));

  test("(b) payload completo: a declaracao inteira (e o que o splitter junta com ela) e descartada", () => {
    const payload = "a:\"\n'\"/*';background-image:image-set(\"x\" 1x);x:*/";
    expect(sanitizeStyleString(`color:red;${payload}`).value).toBe("color:red");
    expect(sanitizeStyleString(`color:red;${payload};width:1px`).value).toBe("color:red");
  });

  test("NUL fora de string tambem derruba", () => {
    expect(isSafeCssValue("red\u0000")).toBe(false);
  });

  test("quebras de linha ENTRE declaracoes e fora de strings continuam validas", () => {
    expect(sanitizeStyleString("\n  color: red;\n  margin: 0\n    auto;\n  width: calc(1px +\n 2px);\n")).toEqual({
      value: "color: red; margin: 0\n    auto; width: calc(1px +\n 2px)",
      rejected: false,
    });
  });
});

describe("estrito: url() sem argumento nao-quoted fora do charset seguro", () => {
  test.each([
    "url(a b.png)",
    "url( a.png )",
    "url(a\tb)",
    "url(a(b)",
    "url(a\"b)",
    "url(a'b)",
    "url(a\\b)",
    "url(a*b)",
    "url(a{b)",
    "url(a<b)",
    "url(",
    "url(a.png",
    "url(javascript:x)",
    "url(data:image/svg+xml,<svg/>)",
    "url(data:text/html;base64,AAAA)",
    "url(\"javascript:x\")",
    "url(\"data:text/html;base64,AAAA\")",
    "url(vbscript:x)",
    "url(\"a.png\" x)",
    "url(\"a.png\"",
    "URL(javascript:x)",
    "url ( a.png )".replace(" (", "(") + "x",
  ])("bloqueia %s", (v) => expect(isSafeCssValue(v)).toBe(false));

  test.each([
    "url(a/b.png)",
    "url(img/bg.png?v=1#x)",
    "url(//cdn.example.com/x.png)",
    "url(https://a.test/x.png)",
    "url(data:image/png;base64,iVBORw0KGgo=)",
    "url(data:image/webp;base64,AAAA+/==)",
    "url(\"a b.png\")",
    "url('a b.png')",
    "url( \"a.png\" )",
    "url(\"data:image/png;base64,AAAA\")",
    "URL(/a.png)",
    "url(#frag)",
    "url(/a.png), url(/b.png)",
    "url(blob:x)",
    "url('data:image/svg+xml;base64,AAAA')",
  ])("permite %s", (v) => expect(isSafeCssValue(v)).toBe(true));
});

describe("estrito: limite de tamanho (8 KB)", () => {
  test("valor com mais de 8 KB e rejeitado; no limite passa", () => {
    expect(isSafeCssValue("a".repeat(8192))).toBe(true);
    expect(isSafeCssValue("a".repeat(8193))).toBe(false);
  });
  test("style maior que 8 KB: descarta tudo com aviso (rejected)", () => {
    const big = `color:red;${"width:1px;".repeat(900)}`;
    expect(big.length).toBeGreaterThan(8192);
    expect(sanitizeStyleString(big)).toEqual({ value: "", rejected: true });
    expect(sanitizeStyleString("color:red")).toEqual({ value: "color:red", rejected: false });
  });
  test("style objeto maior que 8 KB (chaves + valores)", () => {
    expect(styleObjectTooLong({ color: "red" })).toBe(false);
    expect(styleObjectTooLong({ color: "a".repeat(8200) })).toBe(true);
    const many: Record<string, string> = {};
    for (let i = 0; i < 700; i++) many[`--v${i}`] = "1234567890";
    expect(styleObjectTooLong(many)).toBe(true);
  });
});

describe("estrito: tempo linear", () => {
  test("100 KB de `url( ` termina em < 100 ms (corte de tamanho)", () => {
    const t = performance.now();
    const input = "url( ".repeat(20000);
    expect(isSafeCssValue(input)).toBe(false);
    expect(sanitizeStyleString(`a:${input}`)).toEqual({ value: "", rejected: true });
    expect(performance.now() - t).toBeLessThan(100);
  });
  test("o scanner em 8 KB de entrada adversaria termina rapido", () => {
    const shapes = [
      "url( ".repeat(1638),
      "url(".repeat(2048),
      `url(${"a".repeat(8000)}`,
      `${"image".repeat(1600)}`,
      `${"image ".repeat(1300)}(`,
      `${" ".repeat(8000)}src`,
      '"'.repeat(8000),
      "\\".repeat(8000),
      "(".repeat(8000),
      `url(${" ".repeat(8000)}`,
      `${"a;".repeat(4000)}`,
    ];
    const t = performance.now();
    for (const s of shapes) {
      isSafeCssValue(s.slice(0, 8192));
      sanitizeStyleString(`a:${s.slice(0, 8180)}`);
    }
    expect(performance.now() - t).toBeLessThan(200);
  });
});

describe("estrito: CSS comum continua funcionando", () => {
  const decls = [
    "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, \"Helvetica Neue\", sans-serif",
    'content: "\\2022"',
    'content: "\\201C"',
    'font-family: "\\5FAE\\8F6F\\96C5\\9ED1"',
    "width: calc(100% - var(--gap, 8px))",
    "background: linear-gradient(to right, rgba(0,0,0,.5) 0%, #fff 100%)",
    "background-image: url(a/b.png)",
    'background-image: url("a b.png")',
    "background-image: url(data:image/png;base64,iVBORw0KGgo=)",
    "transform: translate(-50%, -50%) rotate(45deg)",
    "grid-template-areas: 'a b' 'c d'",
    "--x: 1px",
    "margin: -1px 0 0 -1px !important",
  ];
  test.each(decls)("%s", (d) => {
    expect(sanitizeStyleString(d)).toEqual({ value: d, rejected: false });
  });
  test("template literal multi-linha", () => {
    const style = `
      display: flex;
      font-family: "Inter", sans-serif;
      background: url(data:image/png;base64,AAAA) no-repeat,
                  linear-gradient(red, blue);
      content: "\\2022";
    `;
    const out = sanitizeStyleString(style);
    expect(out.rejected).toBe(false);
    expect(out.value.split("; ").length).toBe(4);
  });
});

describe("fuzz estrito: comentario dentro de url( e newline dentro de string", () => {
  const PAYLOADS = [
    "image-set(\"a.png\" 1x)",
    "url(data:image/svg+xml,<svg/>)",
    "src(x)",
    "expression(1)",
    "url(javascript:x)",
  ];
  test("todas as formas sao rejeitadas (conjunto pequeno e deterministico)", () => {
    const cases: string[] = [];
    for (const p of PAYLOADS) {
      for (const open of ["url(/*)", "url(/*", "url( /*", "url(a/*", "url('/*", "url(\"/*"]) {
        for (const close of [" */ x)", "*/)", ")", ""]) {
          cases.push(`${open} , ${p} /* ${close}`, `${open}${p}${close}`);
        }
      }
      for (const nl of ["\n", "\r", "\r\n", "\f", "\u0000"]) {
        for (const q of ['"', "'"]) {
          const other = q === '"' ? "'" : '"';
          cases.push(`${q}${nl}${other}${q}/*${other};background:${p};x:*/`);
          cases.push(`${q}a${nl}b${q} ${p}`);
          cases.push(`${q}${nl}${q}${p}`);
          cases.push(`url(${q}a${nl}b${q}) ${p}`);
        }
      }
    }
    expect(cases.length).toBeGreaterThan(100);
    expect(cases.length).toBeLessThan(700);
    expect(cases.filter((c) => isSafeCssValue(c))).toEqual([]);
    for (const c of cases) expect(sanitizeStyleString(`color:red;background:${c}`).value).toBe("color:red");
  });
});

describe("colchetes e parenteses balanceados fora de strings", () => {
  test.each([
    "calc(1px",
    "foo(",
    "foo((a)",
    "a)",
    "rgb(1,2,3))",
    "[x",
    "x]",
    "(]",
    "([)]",
    "[(])",
    "(a [b)] c",
    "url(/a.png))",
    "var(--x, (1px)",
    "(".repeat(100),
  ])("bloqueia %s", (v) => expect(isSafeCssValue(v)).toBe(false));

  test.each([
    "calc((1px + 2px) * 3)",
    "[a] 1fr [b]",
    "repeat(2, [a] 1fr)",
    "rgba(0,0,0,.5)",
    "var(--x, calc(1px + 2px))",
    "url(/a.png) no-repeat, linear-gradient(red, blue)",
    '"((" ")" "[" "]"',
    "'(' content",
    "url(data:image/png;base64,AAAA==)",
    "",
  ])("permite %j", (v) => expect(isSafeCssValue(v)).toBe(true));

  test("parentese aberto engole o resto (como no navegador): tudo cai junto, nada inseguro sobra", () => {
    expect(sanitizeStyleString("color:red;width:calc(1px;height:2px;background:url(javascript:x)")).toEqual({ value: "color:red", rejected: true });
    expect(sanitizeStyleString("color:red;width:a);height:2px")).toEqual({ value: "color:red; height:2px", rejected: true });
  });
});

describe("chaves proibidas de objeto de style sem distinguir caixa", () => {
  test.each(["cssText", "CSSTEXT", "CssText", "setProperty", "SETPROPERTY", "length", "LENGTH", "__PROTO__", "Constructor"])(
    "%s",
    (k) => expect(isForbiddenStyleKey(k)).toBe(true),
  );
  test("propriedades normais passam", () => {
    expect(isForbiddenStyleKey("color")).toBe(false);
    expect(isForbiddenStyleKey("backgroundColor")).toBe(false);
  });
});

describe("url() follows the <img src> policy (D4)", () => {
  test("blocked and allowed urls match evaluateUrl for src on img", async () => {
    const { evaluateUrl } = await import("./url-policy");
    const { isSafeCssValue } = await import("./css-policy");
    for (const u of ["javascript:alert(1)", "/a.png", "https://x/a.png", "data:text/html,x", "data:image/png;base64,AAAA", "data:image/svg+xml,%3Csvg%3E"]) {
      expect({ u, ok: isSafeCssValue(`url("${u}")`) }).toEqual({ u, ok: !evaluateUrl("src", u, "img").blocked });
    }
  });
});
