/**
 * Testes de segurança das props no cliente (SEC-04, SEC-05, SEC-09, SEC-14, S3, S4, S5).
 * Cada bloco reproduz uma prova da auditoria.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { h, html } from "../hyper";
import { unsafeHtml } from "../safe-html";
import { unsafeUrl } from "../safe-url";
import { resetSecurityWarnings } from "../utils/security-warn";
import { BLOCKED_URL } from "../utils/url-policy";
import { computePropUpdate, isValidAttributeName, isValidTagName } from "./props-core";
import { setProp } from "./props";

const U = "javascript:alert(1)";
let warn: ReturnType<typeof spyOn>;
beforeEach(() => {
  resetSecurityWarnings();
  warn = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const reactive = <T,>(v: T) => ({ get: () => v, subscribe: () => () => {} });

describe("SEC-04 cliente: atributos de URL", () => {
  test("a href=javascript: vira about:blank#blocked", () => {
    const a = html`<a href=${U}>x</a>` as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe(BLOCKED_URL);
    expect(warn).toHaveBeenCalled();
  });
  test("form action e button formaction", () => {
    const f = html`<form action=${U}><button formaction=${U}>x</button></form>` as HTMLFormElement;
    expect(f.getAttribute("action")).toBe(BLOCKED_URL);
    expect(f.querySelector("button")?.getAttribute("formaction")).toBe(BLOCKED_URL);
  });
  test("svg a xlink:href e href", () => {
    const a = h("a", { "xlink:href": U }) as Element;
    expect(a.getAttribute("xlink:href")).toBe(BLOCKED_URL);
    const b = h("a", { href: U }) as Element;
    expect(b.getAttribute("href")).toBe(BLOCKED_URL);
  });
  test("iframe src data:text/html e javascript:", () => {
    const f = h("iframe", { src: "data:text/html,<script>alert(1)</script>" }) as HTMLIFrameElement;
    expect(f.getAttribute("src")).toBe(BLOCKED_URL);
    const g = h("iframe", { src: U }) as HTMLIFrameElement;
    expect(g.getAttribute("src")).toBe(BLOCKED_URL);
  });
  test("spread de props não confiáveis", () => {
    const evil = { href: "java\tscript:alert(1)" };
    const a = html`<a ...${evil}>x</a>` as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe(BLOCKED_URL);
  });
  test("prop reativa href é sanitizada a cada atualização", () => {
    let push: (v: unknown) => void = () => {};
    const sig = {
      v: "/ok" as unknown,
      get() { return this.v; },
      subscribe(fn: (v: unknown) => void) { push = (x) => { this.v = x; fn(x); }; return () => {}; },
    };
    const a = h("a", { href: sig }) as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("/ok");
    push(U);
    expect(a.getAttribute("href")).toBe(BLOCKED_URL);
    push("/again");
    expect(a.getAttribute("href")).toBe("/again");
  });
  test("img src data:image/png permitido; data:text/html bloqueado", () => {
    const ok = h("img", { src: "data:image/png;base64,AAAA" }) as Element;
    expect(ok.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    const bad = h("img", { src: "data:text/html,x" }) as Element;
    expect(bad.getAttribute("src")).toBe(BLOCKED_URL);
  });
  test("srcset candidato a candidato", () => {
    const img = h("img", { srcset: `/a.png 1x, ${U} 2x` }) as Element;
    expect(img.getAttribute("srcset")).toBe(`/a.png 1x, ${BLOCKED_URL} 2x`);
  });
  test("unsafeUrl é o escape hatch", () => {
    const a = h("a", { href: unsafeUrl(U) }) as Element;
    expect(a.getAttribute("href")).toBe(U);
  });
  test("URLs normais (relativas, https, mailto) passam", () => {
    for (const u of ["/x", "https://a.com/b?c#d", "mailto:a@b.co", "#top", "tel:+55"]) {
      expect((h("a", { href: u }) as Element).getAttribute("href")).toBe(u);
    }
  });
  test("atributo de URL com valor null/false é removido, não bloqueado", () => {
    const a = h("a", { href: null }) as Element;
    expect(a.hasAttribute("href")).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
  test("computePropUpdate (puro) devolve valor sanitizado e metadata de aviso", () => {
    const u = computePropUpdate("a", "href", U, true);
    expect(u.value).toBe(BLOCKED_URL);
    expect(u.metadata?.warning).toContain("href");
  });
});

describe("SEC-05 / S4 cliente: props que viram HTML", () => {
  const X = '<img src=x onerror="alert(1)">';
  test("innerHTML estático é ignorado", () => {
    const d = html`<div innerHTML=${X}></div>` as HTMLElement;
    expect(d.querySelector("img")).toBeNull();
    expect(d.innerHTML).toBe("");
  });
  test("innerHTML via spread é ignorado", () => {
    const d = html`<div ...${{ innerHTML: X }}></div>` as HTMLElement;
    expect(d.querySelector("img")).toBeNull();
  });
  test("innerHTML reativo é ignorado", () => {
    const d = h("div", { innerHTML: reactive(X) }) as HTMLElement;
    expect(d.querySelector("img")).toBeNull();
  });
  test("template innerHTML", () => {
    const t = h("template", { innerHTML: X }) as HTMLTemplateElement;
    expect(t.content.querySelector("img")).toBeNull();
  });
  test("outerHTML e insertAdjacentHTML são ignorados (sem lançar)", () => {
    const d = h("div", { outerHTML: X, insertAdjacentHTML: X }) as HTMLElement;
    expect(d.tagName).toBe("DIV");
    expect(d.querySelector("img")).toBeNull();
  });
  test("srcdoc é bloqueado", () => {
    const f = h("iframe", { srcdoc: "<script>alert(1)</script>" }) as HTMLIFrameElement;
    expect(f.getAttribute("srcdoc")).toBeNull();
    expect(f.srcdoc ?? "").toBe("");
  });
  test("srcdoc aceita SafeHtml (unsafeHtml) e grava o valor como atributo", () => {
    const f = h("iframe", { srcdoc: unsafeHtml("<p>a</p>") }) as HTMLIFrameElement;
    expect(f.getAttribute("srcdoc")).toBe("<p>a</p>");
    expect(warn).not.toHaveBeenCalled();
  });
  test("srcdoc SafeHtml reativo também passa; string reativa não", () => {
    const f = h("iframe", { srcdoc: reactive(unsafeHtml("<b>r</b>")) }) as HTMLIFrameElement;
    expect(f.getAttribute("srcdoc")).toBe("<b>r</b>");
    const g = h("iframe", { srcdoc: reactive("<script>alert(1)</script>") }) as HTMLIFrameElement;
    expect(g.getAttribute("srcdoc")).toBeNull();
  });
  test("srcdoc: objeto que imita SafeHtml ({value}) é bloqueado com aviso", () => {
    const f = h("iframe", { srcdoc: { value: "<script>alert(1)</script>" } }) as HTMLIFrameElement;
    expect(f.getAttribute("srcdoc")).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
  test("o aviso menciona unsafeHtml()", () => {
    h("div", { innerHTML: X });
    expect(String(warn.mock.calls[0]?.[0])).toContain("unsafeHtml");
  });
  test("nomes são verificados sem case: INNERHTML também", () => {
    const d = h("div", { InnerHTML: X }) as HTMLElement;
    expect(d.querySelector("img")).toBeNull();
  });
  test("computePropUpdate devolve BLOCKED", () => {
    expect(computePropUpdate("div", "innerHTML", X, true).type).toBe("BLOCKED");
  });
  test("textContent continua sendo escapado (seguro)", () => {
    const d = h("div", { textContent: X }) as HTMLElement;
    expect(d.querySelector("img")).toBeNull();
    expect(d.textContent).toBe(X);
  });
});

describe("S3 / SEC-14 cliente: on* só com função", () => {
  test("onclick (minúsculo) com string é ignorado", () => {
    const b = html`<button onclick=${"alert(1)"}>x</button>` as HTMLButtonElement;
    expect(b.getAttribute("onclick")).toBeNull();
    expect((b as any).onclick ?? null).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
  test("onerror via spread com string é ignorado", () => {
    const i = html`<img ...${{ onerror: "alert(1)", src: "x" }} />` as HTMLImageElement;
    expect(i.getAttribute("onerror")).toBeNull();
    expect(i.getAttribute("src")).toBe("x");
  });
  test("onfoo (não é propriedade de evento) com string é atributo inerte, não handler", () => {
    const d = h("div", { onfoo: "alert(1)" }) as Element;
    expect(d.getAttribute("onfoo")).toBe("alert(1)");
    expect((d as any).onfoo).toBeUndefined();
  });
  test("onClick com string é ignorado", () => {
    const b = h("button", { onClick: "alert(1)" }) as Element;
    expect(b.getAttribute("onclick")).toBeNull();
  });
  test("onclick minúsculo com função registra listener", () => {
    let n = 0;
    const b = h("button", { onclick: () => n++ }) as HTMLButtonElement;
    b.click();
    expect(n).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });
  test("onClick com função, objeto handleEvent e tupla continuam funcionando", () => {
    let n = 0;
    const a = h("button", { onClick: () => n++ }) as HTMLButtonElement;
    const b = h("button", { onClick: { handleEvent: () => n++ } }) as HTMLButtonElement;
    const c = h("button", { onClick: [() => n++, { once: true }] }) as HTMLButtonElement;
    a.click(); b.click(); c.click(); c.click();
    expect(n).toBe(3);
  });
  test("on* reativo nunca vira atributo (função não é serializada)", () => {
    const b = h("button", { onClick: reactive(() => {}) }) as Element;
    expect(b.getAttribute("onClick")).toBeNull();
    expect(b.getAttribute("onclick")).toBeNull();
  });
  test("computePropUpdate: on* de evento bloqueia; sem informação falha fechado", () => {
    expect(computePropUpdate("div", "onclick", "x", true, true).type).toBe("BLOCKED");
    expect(computePropUpdate("div", "ONCLICK", "x", true, true).type).toBe("BLOCKED");
    expect(computePropUpdate("div", "onclick", "x", true).type).toBe("BLOCKED");
    expect(computePropUpdate("div", "onfoo", "x", false).type).toBe("BLOCKED");
  });
  test("on* que não é propriedade de evento do elemento é atributo normal", () => {
    const d = h("div", { one: "1", online: "x", once: "y" }) as Element;
    expect(d.getAttribute("one")).toBe("1");
    expect(d.getAttribute("online")).toBe("x");
    expect(d.getAttribute("once")).toBe("y");
    expect(computePropUpdate("div", "online", "x", false, false).type).toBe("SET_ATTRIBUTE");
  });
  test("handler com nome fora da lista nativa vira listener de evento custom", () => {
    let n = 0;
    const d = h("div", { onfoo: () => n++ }) as Element;
    d.dispatchEvent(new Event("foo"));
    expect(n).toBe(1);
  });
  test("nome de evento nativo com string é descartado (onerror em img, onload em body)", () => {
    const i = h("img", { onerror: "alert(1)" }) as Element;
    expect(i.getAttribute("onerror")).toBeNull();
    const b = h("div", { onmouseover: "alert(1)" }) as Element;
    expect(b.getAttribute("onmouseover")).toBeNull();
  });
  test("handler reativo: aviso diz que não é suportado e pede uma função", () => {
    h("button", { onClick: reactive(() => {}) });
    const msg = String(warn.mock.calls[0]?.[0]);
    expect(msg).toMatch(/reativ/i);
    expect(msg).toMatch(/função/i);
  });
});

describe("S5 cliente: nomes de atributo e de tag", () => {
  test("isValidAttributeName", () => {
    for (const n of ["href", "data-x", "aria-label", "xlink:href", "x_y", "v-bind:foo"]) {
      expect(isValidAttributeName(n)).toBe(true);
    }
    for (const n of ["", "x onmouseover=alert(1)", 'a"b', "a>b", "1a", "a=b", "a/b", "a\nb"]) {
      expect(isValidAttributeName(n)).toBe(false);
    }
  });
  test("isValidTagName", () => {
    for (const n of ["div", "my-element", "h1", "svg:rect", "A"]) expect(isValidTagName(n)).toBe(true);
    for (const n of ["", "div><script>", "img src=x onerror=alert(1)", "1a", "a b"]) {
      expect(isValidTagName(n)).toBe(false);
    }
  });
  test("spread com nome inválido não lança e é descartado (SEC-14)", () => {
    const d = html`<div ...${{ "x onmouseover=alert(1)": "1", id: "ok" }}></div>` as HTMLElement;
    expect(d.id).toBe("ok");
    expect(d.attributes.length).toBe(1);
    expect(warn).toHaveBeenCalled();
  });
  test("tag inválida lança (erro de programação)", () => {
    expect(() => h("img src=x onerror=alert(1)", {})).toThrow(/tag/i);
    expect(() => h("div><script>alert(1)</script><div", {})).toThrow(/tag/i);
  });
});

describe("SEC-09 cliente: style", () => {
  test("cssText, length e parentRule são ignorados no objeto de style", () => {
    const d = h("div", { style: { cssText: "position:fixed;inset:0", color: "red" } }) as HTMLElement;
    expect(d.style.position).toBe("");
    expect(d.style.color).toBe("red");
    expect(warn).toHaveBeenCalled();
  });
  test("computePropUpdate SET_STYLE sem as chaves perigosas", () => {
    const u = computePropUpdate("div", "style", { cssText: "x", length: 1, parentRule: 1, color: "red" }, true);
    expect(u.value).toEqual({ color: "red" });
  });
  test("allowlist: __proto__, constructor, métodos, chaves numéricas e inválidas são ignorados sem lançar", () => {
    const evil = JSON.parse(
      '{"__proto__":{"x":1},"constructor":"x","setProperty":"x","getPropertyValue":"x","item":"x","0":"x","color":"red","a;b":"x","":"x"}',
    );
    const d = h("div", { style: evil }) as HTMLElement;
    expect(d.style.color).toBe("red");
    expect(typeof d.style.setProperty).toBe("function");
    expect(typeof d.style.item).toBe("function");
    expect(d.style.constructor).not.toBe("x");
    const u = computePropUpdate("div", "style", evil, true);
    expect(Object.keys(u.value as object)).toEqual(["color"]);
  });
  test("custom properties e nomes com hífen usam setProperty", () => {
    const d = h("div", { style: { "--tema": "azul", "background-color": "red", "-webkit-line-clamp": "2" } }) as HTMLElement;
    expect(d.style.getPropertyValue("--tema")).toBe("azul");
    expect(d.style.backgroundColor).toBe("red");
  });
  test("camelCase que não é propriedade de style é ignorado", () => {
    const d = h("div", { style: { notAProp: "x", color: "red" } }) as HTMLElement;
    expect((d.style as any).notAProp).toBeUndefined();
    expect(d.style.color).toBe("red");
  });
  test("valor null remove a propriedade", () => {
    const d = h("div", { style: { color: "red" } }) as HTMLElement;
    setProp(d, "style", { color: null, "--x": null });
    expect(d.style.color).toBe("");
  });
});

describe("avisos deduplicados (cliente)", () => {
  test("a mesma prop bloqueada avisa uma vez", () => {
    h("div", { innerHTML: "a" });
    h("div", { innerHTML: "b" });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("atributos de URL extras no cliente", () => {
  test("SMIL animate to/values e imagesrcset", () => {
    const a = h("animate", { to: U, values: `a;${U}` }) as Element;
    expect(a.getAttribute("to")).toBe(BLOCKED_URL);
    expect(a.getAttribute("values")).toBe(`a;${BLOCKED_URL}`);
    const l = h("link", { imagesrcset: `/a.png 1x, ${U} 2x` }) as Element;
    expect(l.getAttribute("imagesrcset")).toBe(`/a.png 1x, ${BLOCKED_URL} 2x`);
    const i = h("img", { longdesc: U, lowsrc: U }) as Element;
    expect(i.getAttribute("longdesc")).toBe(BLOCKED_URL);
    expect(i.getAttribute("lowsrc")).toBe(BLOCKED_URL);
  });
  test("to em div não é tratado como URL", () => {
    expect((h("div", { to: U }) as Element).getAttribute("to")).toBe(U);
  });
});

describe("setProp direto", () => {
  test("href perigoso", () => {
    const a = document.createElement("a");
    setProp(a, "href", U);
    expect(a.getAttribute("href")).toBe(BLOCKED_URL);
  });
});
