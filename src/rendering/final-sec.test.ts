/**
 * Final security review, stream F2: client <script>/<style> parity with SSR (I1/D2),
 * DOM-method prop keys (I5), hydration/state minors.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { destroyNode } from "../lifecycle/cleanup";
import { h, html } from "../hyper";
import { unsafeHtml } from "../safe-html";
import { htmlString, renderToString } from "../server-render";
import { deepClone } from "../state-core";
import { resetSecurityWarnings } from "../utils/security-warn";
import { computePropUpdate } from "./props-core";

let warn: ReturnType<typeof spyOn>;
beforeEach(() => {
  resetSecurityWarnings();
  warn = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe("I1/D2: client script/style dynamic content", () => {
  test("dynamic string child of <script> is dropped, with a warning", () => {
    const el = html`<script>${"alert(1)"}</script>` as HTMLElement;
    expect(el.textContent).toBe("");
    expect(warn).toHaveBeenCalled();
  });

  test("dynamic string child of <style> is dropped", () => {
    const el = html`<style>${"body{background:url(javascript:1)}"}</style>` as HTMLElement;
    expect(el.textContent).toBe("");
  });

  test("static template text is kept", () => {
    const el = html`<style>a { color: red }</style>` as HTMLElement;
    expect(el.textContent).toBe("a { color: red }");
  });

  test("static text kept next to a dropped dynamic value", () => {
    const el = html`<script>var a = 1; ${"evil()"}</script>` as HTMLElement;
    expect(el.textContent).toBe("var a = 1; ");
  });

  test("SafeHtml child is allowed", () => {
    const el = html`<script type="application/json">${unsafeHtml('{"a":1}')}</script>` as HTMLElement;
    expect(el.textContent).toBe('{"a":1}');
  });

  test("text / textContent / innerText props are dropped unless SafeHtml", () => {
    for (const key of ["text", "textContent", "innerText", "TextContent"]) {
      const el = h("script", { [key]: "alert(1)" }) as HTMLElement;
      expect(el.textContent).toBe("");
    }
    const el = html`<script text=${"alert(1)"}></script>` as HTMLElement;
    expect(el.textContent).toBe("");
  });

  test("text prop as SafeHtml is applied", () => {
    const el = h("script", { text: unsafeHtml("1+1") }) as HTMLElement;
    expect(el.textContent).toBe("1+1");
  });

  test("text prop on other elements is unaffected", () => {
    const el = h("div", { textContent: "hi" }) as HTMLElement;
    expect(el.textContent).toBe("hi");
  });

  test("dynamic strings elsewhere and attribute interpolation still work", () => {
    const cls = "b";
    const el = html`<div class="a ${cls}" title=${"t"}>${"x"} y</div>` as HTMLElement;
    expect(el.className).toBe("a b");
    expect(el.getAttribute("title")).toBe("t");
    expect(el.textContent).toBe("x y");
  });

  test("components receive plain strings", () => {
    let seen: unknown[] = [];
    const C = (p: { label: string; children: unknown[] }) => {
      seen = [p.label, ...p.children];
      return h("span", null);
    };
    html`<${C} label=${"L"}>${"kid"}</${C}>`;
    expect(seen).toEqual(["L", "kid"]);
    expect(seen.every((v) => typeof v === "string")).toBe(true);
  });

  test("parity with SSR: same visible output", () => {
    const dyn = "alert(1)";
    const client = (html`<script>a;${dyn}</script>` as HTMLElement).textContent;
    const ssr = renderToString(() => htmlString`<script>a;${dyn}</script>`).html;
    expect(ssr).toBe("<script>a;</script>");
    expect(client).toBe("a;");
  });
});

describe("I5: prop keys naming DOM methods", () => {
  test("appendChild prop does not throw and destroyNode still works", () => {
    const el = h("div", { appendChild: "x" }, "child") as HTMLElement;
    expect(el.textContent).toBe("child");
    expect(typeof el.appendChild).toBe("function");
    expect(() => destroyNode(el)).not.toThrow();
  });

  test("removeEventListener / setAttribute / addEventListener keys never shadow methods", () => {
    const el = h("div", { removeEventListener: "x", setAttribute: "y", addEventListener: "z", click: "c" }) as HTMLElement;
    expect(typeof el.removeEventListener).toBe("function");
    expect(typeof el.setAttribute).toBe("function");
    expect(typeof el.addEventListener).toBe("function");
    expect(typeof el.click).toBe("function");
    expect(() => destroyNode(el)).not.toThrow();
  });

  test("reactive prop with a method name does not shadow either", () => {
    const sig = { get: () => "x", subscribe: () => () => {} };
    const el = h("div", { appendChild: sig }) as HTMLElement;
    expect(typeof el.appendChild).toBe("function");
  });

  test("computePropUpdate: method names are never SET_PROPERTY when hasProperty is false", () => {
    expect(computePropUpdate("div", "appendChild", "x", false).type).toBe("SET_ATTRIBUTE");
  });
});

describe("deepClone cycles and depth", () => {
  test("cycle throws a clear error", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => deepClone(a)).toThrow(/circular/i);
  });

  test("shared (non-cyclic) references still clone", () => {
    const shared = { n: 1 };
    const out = deepClone({ a: shared, b: shared });
    expect(out).toEqual({ a: { n: 1 }, b: { n: 1 } });
  });

  test("depth beyond the limit throws a clear error instead of overflowing", () => {
    let o: Record<string, unknown> = {};
    const root = o;
    for (let i = 0; i < 5000; i++) {
      const next: Record<string, unknown> = {};
      o.c = next;
      o = next;
    }
    expect(() => deepClone(root)).toThrow(/deeper/i);
  });

  test("reasonable depth works", () => {
    let o: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 500; i++) o = { c: o };
    expect(() => deepClone(o)).not.toThrow();
  });
});

describe("minors", () => {
  test("hHydrate attaches handlers for any /^on/i key (onclick, ONCLICK)", async () => {
    const { setHydrateContext } = await import("../hydration/context");
    const { hHydrate } = await import("../hydration/walker");
    const root = document.createElement("div");
    root.innerHTML = "<button>x</button>";
    let clicks = 0;
    setHydrateContext({ cursor: root.firstChild, root, signals: new Map() });
    try {
      hHydrate("button", { onclick: () => clicks++ }, "x");
      setHydrateContext({ cursor: root.firstChild, root, signals: new Map() });
      hHydrate("button", { ONCLICK: () => clicks++ }, "x");
    } finally {
      setHydrateContext(null);
    }
    (root.firstChild as HTMLElement).click();
    expect(clicks).toBe(2);
  });

  test("SSR attribute-name grammar matches the client (ASCII, fail closed)", async () => {
    const { isValidAttributeName } = await import("./props-core");
    for (const name of ["@click", "[x]", "xé", "a b", "1a", "a=b", "data-ok", "aria-label", "xlink:href", "_x"]) {
      const ssr = renderToString(() => htmlString`<div ...${{ [name]: "v" }}></div>`).html;
      const ssrKept = ssr.includes("=\"v\"");
      expect({ name, ssrKept }).toEqual({ name, ssrKept: isValidAttributeName(name) });
    }
  });

  test("render() only hydrates from script#__SLASH_STATE__ of type application/json", async () => {
    const { render } = await import("./render");
    const container = document.createElement("div");
    container.id = "app-final";
    container.innerHTML = "<p>ssr</p>";
    document.body.appendChild(container);
    const decoy = document.createElement("div");
    decoy.id = "__SLASH_STATE__";
    decoy.textContent = '{"x":1}';
    document.body.appendChild(decoy);
    try {
      render(() => h("p", null, "client"), container);
      expect(container.textContent).toBe("client");
      expect(document.getElementById("__SLASH_STATE__")).toBe(decoy);
    } finally {
      decoy.remove();
      container.remove();
    }
  });
});

describe("fix round 1: SSR raw-text origin rule", () => {
  const evil = "alert(1)";
  const ssr = (fn: () => unknown) => renderToString(fn as never).html;
  const C = () => evil;
  const Kids = (p: { children: unknown }) => p.children;

  for (const tag of ["script", "style"]) {
    test(`<${tag}>: component returning a string is dropped`, () => {
      expect(ssr(() => htmlString`<${tag}><${C}/></${tag}>`)).toBe(`<${tag}></${tag}>`);
    });
    test(`<${tag}>: component echoing dynamic children is dropped`, () => {
      expect(ssr(() => htmlString`<${tag}><${Kids}>${evil}</${Kids}></${tag}>`)).toBe(`<${tag}></${tag}>`);
    });
    test(`<${tag}>: nested htmlString of a dynamic string is dropped`, () => {
      expect(ssr(() => htmlString`<${tag}>${htmlString`${evil}`}</${tag}>`)).toBe(`<${tag}></${tag}>`);
    });
    test(`<${tag}>: element markup is dropped`, () => {
      expect(ssr(() => htmlString`<${tag}>${htmlString`<b>x</b>`}</${tag}>`)).toBe(`<${tag}></${tag}>`);
    });
    test(`<${tag}>: reactive child leaves no markers`, () => {
      const rx = { get: () => evil, subscribe: () => () => {} };
      expect(ssr(() => htmlString`<${tag}>${rx as never}</${tag}>`)).toBe(`<${tag}></${tag}>`);
    });
    test(`<${tag}>: unsafeHtml and static text survive, also through a component`, () => {
      expect(ssr(() => htmlString`<${tag}>a;${unsafeHtml("b;")}</${tag}>`)).toBe(`<${tag}>a;b;</${tag}>`);
      const U = () => unsafeHtml("c;");
      expect(ssr(() => htmlString`<${tag}><${U}/></${tag}>`)).toBe(`<${tag}>c;</${tag}>`);
      expect(ssr(() => htmlString`<${tag}>${htmlString`${unsafeHtml("d;")}`}</${tag}>`)).toBe(`<${tag}>d;</${tag}>`);
    });
  }

  test("normal HTML contexts keep isSafeHtml semantics", () => {
    expect(ssr(() => htmlString`<div>${htmlString`<b>x</b>`}${unsafeHtml("<i>y</i>")}</div>`)).toBe("<div><b>x</b><i>y</i></div>");
  });

  test("client: components and nested html results are dropped inside script/style", () => {
    const Comp = () => "alert(1)";
    expect((html`<script><${Comp}/></script>` as HTMLElement).textContent).toBe("");
    expect((html`<style>${html`${"x"}`}</style>` as HTMLElement).textContent).toBe("");
    expect((html`<style>${html`${"x"}${"y"}`}</style>` as HTMLElement).textContent).toBe("");
  });

  test("constructor / __proto__ / prototype attributes are blocked on both sides", () => {
    for (const k of ["constructor", "prototype", "__proto__"]) {
      const props = Object.defineProperty({}, k, { value: "v", enumerable: true });
      expect(ssr(() => htmlString`<div ...${props}></div>`)).toBe("<div></div>");
      expect((h("div", props as never) as Element).getAttribute(k)).toBeNull();
    }
  });
});

describe("fix round 1: html() output never leaks the marker", () => {
  const leaks = (v: unknown): boolean =>
    Array.isArray(v) ? v.some(leaks) : typeof v === "object" && v !== null && v.constructor?.name === "DynamicText";

  test("single dynamic string comes back as a string", () => {
    expect(html`${"abc"}`).toBe("abc" as never);
  });
  test("several roots come back as plain strings in an array", () => {
    const out = html`${"a"}${"b"}` as unknown;
    expect(out).toEqual(["a", "b"]);
    expect(leaks(out)).toBe(false);
  });
  test("component children are plain strings, even nested", () => {
    let seen: unknown;
    const C = (p: { children: unknown }) => {
      seen = p.children;
      return h("i", null);
    };
    html`<${C}>${"a"}${"b"}</${C}>`;
    expect(seen).toEqual(["a", "b"]);
    expect(leaks(seen)).toBe(false);
  });
  test("array value inside children stays plain", () => {
    const out = html`<p>${["x", "y"]}</p>` as HTMLElement;
    expect(out.textContent).toBe("xy");
  });
});

describe("fix round 1: render() state script type warning", () => {
  test("warns when #__SLASH_STATE__ lacks type=application/json", async () => {
    const { render } = await import("./render");
    const container = document.createElement("div");
    container.innerHTML = "<p>ssr</p>";
    document.body.appendChild(container);
    const decoy = document.createElement("script");
    decoy.id = "__SLASH_STATE__";
    document.body.appendChild(decoy);
    try {
      render(() => h("p", null, "c"), container);
      expect(warn.mock.calls.some((c) => /application\/json/.test(String(c[0])))).toBe(true);
    } finally {
      decoy.remove();
      container.remove();
    }
  });
});

describe("fix round 1: deepClone speed", () => {
  function baseline<T>(obj: T): T {
    if (obj === null || typeof obj !== "object") return obj;
    if (obj instanceof Error) return obj;
    if (obj instanceof Date) return new Date(obj.getTime()) as T;
    if (Array.isArray(obj)) return obj.map((i) => baseline(i)) as T;
    const out: Record<string, unknown> = Object.getPrototypeOf(obj) === null ? Object.create(null) : {};
    for (const k of Object.keys(obj)) out[k] = baseline((obj as Record<string, unknown>)[k]);
    return out as T;
  }
  const best = (fn: () => void) => {
    let min = Infinity;
    for (let i = 0; i < 7; i++) {
      const t = performance.now();
      fn();
      min = Math.min(min, performance.now() - t);
    }
    return min;
  };
  test("at most 1.5x a simple recursive clone", () => {
    const data = Array.from({ length: 50_000 }, (_, i) => ({ id: i, tags: ["a", "b"], meta: { n: i, ok: true } }));
    const base = best(() => baseline(data));
    const ours = best(() => deepClone(data));
    expect(ours / base).toBeLessThanOrEqual(1.5);
  }, 20000);
  test("cycle deep inside still reports circular, shared refs fine", () => {
    const a: Record<string, unknown> = { x: { y: {} } };
    (a.x as Record<string, unknown>).back = a;
    expect(() => deepClone(a)).toThrow(/circular/i);
  });
});
