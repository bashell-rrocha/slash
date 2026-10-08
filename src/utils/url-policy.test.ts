import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { BLOCKED_URL, evaluateUrl, isUrlAttribute, sanitizeUrl } from "./url-policy";

let warn: ReturnType<typeof spyOn>;
beforeEach(() => {
  warn = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe("sanitizeUrl - esquemas permitidos", () => {
  const ok = [
    "http://example.com/a?b=1#c",
    "https://example.com",
    "HTTPS://EXAMPLE.COM",
    "mailto:a@b.co",
    "tel:+5511999999999",
    "/path/to",
    "./rel",
    "../up",
    "?q=1",
    "#frag",
    "bare/path.html",
    "file.html",
    "",
    "/a:b", // dois-pontos depois de "/" não é esquema
    "a/b:c",
    "my file: notes.txt", // espaço invalida o esquema: é caminho relativo
  ];
  for (const url of ok) {
    test(`permite ${JSON.stringify(url)}`, () => {
      expect(sanitizeUrl("href", url, "a")).toBe(url);
    });
  }

  test("URL protocol-relative (//host) é permitida: resolve para http(s)", () => {
    // Decisão documentada: //evil.com herda http(s) da página, então não executa script.
    expect(sanitizeUrl("href", "//example.com/x", "a")).toBe("//example.com/x");
  });
});

describe("sanitizeUrl - esquemas bloqueados", () => {
  const bad = [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "JAVASCRIPT:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "java\rscript:alert(1)",
    "  javascript:alert(1)",
    "\x01javascript:alert(1)",
    "\x00javascript:alert(1)",
    "\x1f\x20\tjavascript:alert(1)",
    " javascript:alert(1)",
    " javascript:alert(1)",
    "java\x00script:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:text/html;base64,PHNjcmlwdD4=",
    "DATA:text/html,x",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "data:application/javascript,alert(1)",
    "blob:https://x/1",
    "file:///etc/passwd",
    "ftp://x",
    "about:blank",
    "custom-scheme:x",
  ];
  for (const url of bad) {
    test(`bloqueia ${JSON.stringify(url)}`, () => {
      expect(sanitizeUrl("href", url, "a")).toBe(BLOCKED_URL);
    });
  }

  test("BLOCKED_URL é about:blank#blocked", () => {
    expect(BLOCKED_URL).toBe("about:blank#blocked");
  });

  test("entidades numéricas NÃO são decodificadas (texto literal, relativo e inerte)", () => {
    // No caminho DOM do cliente não há decodificação de entidades: o valor chega literal.
    expect(sanitizeUrl("href", "&#106;avascript:alert(1)", "a")).toBe("&#106;avascript:alert(1)");
    expect(sanitizeUrl("href", "jav&#x61;script:alert(1)", "a")).toBe("jav&#x61;script:alert(1)");
  });

  test("emite aviso em dev quando bloqueia", () => {
    sanitizeUrl("href", "javascript:alert(1)", "a");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("unsafeUrl");
  });

  test("não avisa quando permite", () => {
    sanitizeUrl("href", "/ok", "a");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("sanitizeUrl - data:image", () => {
  const imgs = [
    "data:image/png;base64,AAAA",
    "data:image/jpeg;base64,AAAA",
    "data:image/gif;base64,AAAA",
    "data:image/webp;base64,AAAA",
    "data:image/avif;base64,AAAA",
    "DATA:IMAGE/PNG;base64,AAAA",
  ];
  for (const url of imgs) {
    test(`img src permite ${url}`, () => {
      expect(sanitizeUrl("src", url, "img")).toBe(url);
    });
  }
  test("source srcset e video poster permitem data:image", () => {
    expect(sanitizeUrl("srcset", "data:image/png;base64,AAAA 1x", "source")).toBe("data:image/png;base64,AAAA 1x");
    expect(sanitizeUrl("poster", "data:image/png;base64,AAAA", "video")).toBe("data:image/png;base64,AAAA");
  });
  test("svg+xml nunca é permitido", () => {
    expect(sanitizeUrl("src", "data:image/svg+xml;base64,AAAA", "img")).toBe(BLOCKED_URL);
  });
  test("data:image em href, iframe, embed, script e object é bloqueado", () => {
    const u = "data:image/png;base64,AAAA";
    expect(sanitizeUrl("href", u, "a")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("src", u, "iframe")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("src", u, "embed")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("src", u, "script")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("data", u, "object")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("action", u, "form")).toBe(BLOCKED_URL);
  });
  test("data:image sem tag informada (spread/hidratação) é aceito só em src/srcset/poster", () => {
    expect(sanitizeUrl("src", "data:image/png;base64,AA")).toBe("data:image/png;base64,AA");
    expect(sanitizeUrl("href", "data:image/png;base64,AA")).toBe(BLOCKED_URL);
  });
});

describe("sanitizeUrl - atributos", () => {
  const attrs = [
    "href", "src", "action", "formaction", "xlink:href", "poster",
    "cite", "background", "srcset", "ping", "data", "manifest", "codebase",
  ];
  test("todos os atributos de URL bloqueiam javascript:", () => {
    for (const a of attrs) {
      const tag = a === "data" ? "object" : undefined;
      expect(sanitizeUrl(a, "javascript:alert(1)", tag)).toBe(BLOCKED_URL);
    }
  });
  test("nome do atributo é case-insensitive", () => {
    expect(sanitizeUrl("HREF", "javascript:alert(1)", "a")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("FormAction", "javascript:alert(1)", "button")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("XLINK:HREF", "javascript:alert(1)", "a")).toBe(BLOCKED_URL);
  });
  test("atributos que não são de URL passam sem alteração", () => {
    expect(sanitizeUrl("title", "javascript:alert(1)", "a")).toBe("javascript:alert(1)");
    expect(sanitizeUrl("data-x", "javascript:alert(1)")).toBe("javascript:alert(1)");
    expect(sanitizeUrl("value", "javascript:alert(1)", "input")).toBe("javascript:alert(1)");
    expect(warn).not.toHaveBeenCalled();
  });
  test("data só é URL em <object>", () => {
    expect(sanitizeUrl("data", "javascript:alert(1)", "div")).toBe("javascript:alert(1)");
    expect(sanitizeUrl("data", "javascript:alert(1)", "object")).toBe(BLOCKED_URL);
  });
  test("isUrlAttribute", () => {
    expect(isUrlAttribute("href")).toBe(true);
    expect(isUrlAttribute("XLINK:HREF")).toBe(true);
    expect(isUrlAttribute("title")).toBe(false);
    expect(isUrlAttribute("data-href")).toBe(false);
  });
});

describe("sanitizeUrl - srcset", () => {
  test("candidatos válidos passam intactos", () => {
    const v = "/a.png 1x, https://cdn/b.png 2x";
    expect(sanitizeUrl("srcset", v, "img")).toBe(v);
  });
  test("candidato perigoso é substituído; os demais ficam", () => {
    const out = sanitizeUrl("srcset", "/a.png 1x, javascript:alert(1) 2x", "img");
    expect(out).toBe(`/a.png 1x, ${BLOCKED_URL} 2x`);
  });
  test("data:image com vírgula interna é um único candidato", () => {
    const v = "data:image/png;base64,AAAA 1x, /b.png 2x";
    expect(sanitizeUrl("srcset", v, "img")).toBe(v);
  });
  test("tab no meio parte o candidato como no navegador: a URL é 'java' (relativa, inerte)", () => {
    // Segundo a especificação do srcset, o tab é separador: URL "java", descritor "script:alert(1) 1x".
    const v = "java\tscript:alert(1) 1x";
    expect(sanitizeUrl("srcset", v, "img")).toBe(v);
  });
  test("esquema ofuscado com C0 no início do candidato", () => {
    expect(sanitizeUrl("srcset", "\x01javascript:alert(1) 1x", "img")).toBe(`${BLOCKED_URL} 1x`);
  });
  test("data:text/html em candidato é bloqueado", () => {
    expect(sanitizeUrl("srcset", "data:text/html,x 1x", "img")).toBe(`${BLOCKED_URL} 1x`);
  });
  test("vírgula sem espaço dentro da URL faz parte dela (como no navegador): caminho relativo", () => {
    const v = "/a.png,javascript:alert(1)";
    expect(sanitizeUrl("srcset", v, "img")).toBe(v);
  });
  test("vírgula final encerra o candidato e o seguinte é avaliado", () => {
    const out = sanitizeUrl("srcset", "/a.png, javascript:alert(1)", "img");
    expect(out).toBe(`/a.png, ${BLOCKED_URL}`);
  });
  test("candidatos separados por vírgula sem espaço", () => {
    const out = sanitizeUrl("srcset", "/a.png 1x,javascript:alert(1) 2x", "img");
    expect(out).not.toContain("javascript");
    expect(out).toContain("/a.png 1x");
  });
});

describe("evaluateUrl (puro)", () => {
  test("não emite aviso e informa bloqueio", () => {
    expect(evaluateUrl("href", "javascript:x", "a")).toEqual({ value: BLOCKED_URL, blocked: true });
    expect(evaluateUrl("href", "/ok", "a")).toEqual({ value: "/ok", blocked: false });
    expect(warn).not.toHaveBeenCalled();
  });
});
