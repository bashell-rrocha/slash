/** F1 fix round 1: desync, base href, popstate hash, Link native clicks, adapter selector */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { setHydrateContext } from "../hydration/context";
import { resetSecurityWarnings } from "../utils/security-warn";
import { createBrowserAdapter } from "./browser-adapter";
import { Link } from "./components";
import { __resetHistoryForTesting__, createHistoryMode } from "./history";
import { createRouter } from "./router";
import { sanitizePath } from "./utils";

const routes = [
  { path: "/", component: () => "home" },
  { path: "/about", component: () => "about" },
  { path: "/evil", component: () => "evil" },
];
const setUrl = (path: string) => (window as any).happyDOM.setURL(`http://localhost${path}`);
let warn: ReturnType<typeof spyOn>;
beforeEach(() => {
  __resetHistoryForTesting__();
  resetSecurityWarnings();
  setHydrateContext(null);
  setUrl("/");
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  warn = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  __resetHistoryForTesting__();
});

describe("sanitizePath backslashes", () => {
  test("every \\ becomes / and duplicates collapse", () => {
    expect(sanitizePath("/\\evil")).toBe("/evil");
    expect(sanitizePath("\\\\evil")).toBe("/evil");
    expect(sanitizePath("/\\/evil")).toBe("/evil");
    expect(sanitizePath("\\a\\b\\")).toBe("/a/b");
  });
});

describe("push never desyncs state and URL", () => {
  for (const p of ["/\\evil", "\\\\evil", "/\\/evil", "//evil"]) {
    test(`push(${JSON.stringify(p)}) lands on the same-origin /evil`, async () => {
      const router = createRouter({ routes });
      await router.ready;
      await router.push(p);
      expect(window.location.origin).toBe("http://localhost");
      expect(window.location.pathname).toBe("/evil");
      expect(router.get().currentRoute?.path).toBe("/evil");
    });
  }
  test("a throwing history leaves state unchanged and rejects with a clear error", async () => {
    const router = createRouter({ routes });
    await router.ready;
    const orig = window.history.pushState;
    window.history.pushState = (() => {
      throw new DOMException("denied", "SecurityError");
    }) as typeof window.history.pushState;
    try {
      await expect(router.push("/about")).rejects.toThrow(/Navigation failed.*\/about/);
    } finally {
      window.history.pushState = orig;
    }
    expect(router.get().currentRoute?.path).toBe("/");
    expect(router.get().isNavigating).toBe(false);
    expect(window.location.pathname).toBe("/");
  });
});

function click(href: string, init: MouseEventInit = {}, attrs: Record<string, string> = {}, tag = "a") {
  const history = createHistoryMode();
  const paths: string[] = [];
  history.listen((p) => paths.push(p));
  const a = document.createElement(tag);
  a.setAttribute("href", href);
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  document.body.appendChild(a);
  const ev = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
  a.dispatchEvent(ev);
  return { prevented: ev.defaultPrevented, paths };
}

describe("history interception details", () => {
  test("<base href> is applied to the link URL", () => {
    setUrl("/");
    const base = document.createElement("base");
    base.setAttribute("href", "http://localhost/sub/");
    document.head.appendChild(base);
    const r = click("page");
    expect(r.prevented).toBe(true);
    expect(r.paths).toEqual(["/sub/page"]);
  });
  test("<base href> pointing to another origin disables interception", () => {
    setUrl("/");
    const base = document.createElement("base");
    base.setAttribute("href", "https://evil.com/");
    document.head.appendChild(base);
    const r = click("page");
    expect(r.prevented).toBe(false);
    expect(r.paths).toEqual([]);
  });
  test("SVG <a> is resolved through baseVal and intercepted when same-origin", () => {
    setUrl("/");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const a = document.createElementNS("http://www.w3.org/2000/svg", "a");
    a.setAttribute("href", "/about");
    svg.appendChild(a);
    document.body.appendChild(svg);
    const history = createHistoryMode();
    const paths: string[] = [];
    history.listen((p) => paths.push(p));
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(paths).toEqual(["/about"]);
    expect(ev.defaultPrevented).toBe(true);
  });
  test("SVG <a> to another origin is not intercepted", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const a = document.createElementNS("http://www.w3.org/2000/svg", "a");
    a.setAttribute("href", "https://evil.com/x");
    svg.appendChild(a);
    document.body.appendChild(svg);
    const history = createHistoryMode();
    const paths: string[] = [];
    history.listen((p) => paths.push(p));
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(paths).toEqual([]);
    expect(ev.defaultPrevented).toBe(false);
  });
  test("SVG <a target=_blank> is not intercepted", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const a = document.createElementNS("http://www.w3.org/2000/svg", "a");
    a.setAttribute("href", "/about");
    a.setAttribute("target", "_blank");
    svg.appendChild(a);
    document.body.appendChild(svg);
    createHistoryMode();
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
  test("<area href> is left to the browser", () => {
    const r = click("/about", {}, {}, "area");
    expect(r.prevented).toBe(false);
    expect(r.paths).toEqual([]);
  });
  test("target, download, modifiers", () => {
    expect(click("/about", {}, { target: "_blank" }).prevented).toBe(false);
    expect(click("/about", {}, { target: "_top" }).prevented).toBe(false);
    expect(click("/about", {}, { download: "" }).prevented).toBe(false);
    for (const m of ["ctrlKey", "metaKey", "shiftKey", "altKey"]) {
      expect(click("/about", { [m]: true }).prevented).toBe(false);
    }
    expect(click("/about", {}, { target: "_self" }).prevented).toBe(true);
  });
  test("popstate listeners receive pathname + search + hash", () => {
    setUrl("/about?x=1#sec");
    const history = createHistoryMode();
    const paths: string[] = [];
    history.listen((p) => paths.push(p));
    window.dispatchEvent(new Event("popstate"));
    expect(paths).toEqual(["/about?x=1#sec"]);
  });
});

describe("Link respects native click behaviour", () => {
  function linkClick(init: MouseEventInit, extra: Record<string, unknown> = {}) {
    const router = createRouter({ routes, initialPath: "/" });
    const pushed: string[] = [];
    router.push = ((p: string) => {
      pushed.push(p);
      return Promise.resolve();
    }) as typeof router.push;
    const link = Link({ to: "/about", router, children: "x", ...extra }) as HTMLAnchorElement;
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
    link.dispatchEvent(ev);
    return { prevented: ev.defaultPrevented, pushed };
  }
  test("plain left click navigates through the router", () => {
    expect(linkClick({})).toEqual({ prevented: true, pushed: ["/about"] });
  });
  for (const m of ["ctrlKey", "metaKey", "shiftKey", "altKey"]) {
    test(`${m} is native`, () => {
      expect(linkClick({ [m]: true })).toEqual({ prevented: false, pushed: [] });
    });
  }
  test("middle and right button are native", () => {
    expect(linkClick({ button: 1 })).toEqual({ prevented: false, pushed: [] });
    expect(linkClick({ button: 2 })).toEqual({ prevented: false, pushed: [] });
  });
  test("target other than _self and download are native", () => {
    expect(linkClick({}, { target: "_blank" })).toEqual({ prevented: false, pushed: [] });
    expect(linkClick({}, { download: "f.txt" })).toEqual({ prevented: false, pushed: [] });
    expect(linkClick({}, { target: "_self" })).toEqual({ prevented: true, pushed: ["/about"] });
  });
  test("a blocked Link still never navigates, even with modifiers", () => {
    const router = createRouter({ routes, initialPath: "/" });
    const link = Link({ to: "javascript:alert(1)", router, children: "x" }) as HTMLAnchorElement;
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    link.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});

describe("server state selector", () => {
  function put(attrs: Record<string, string>, tag = "script") {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.textContent = JSON.stringify({ currentRoute: { path: "/about" } });
    document.body.appendChild(el);
  }
  test("reads script#__SLASH_STATE__[type=application/json]", () => {
    put({ id: "__SLASH_STATE__", type: "application/json" });
    const adapter = createBrowserAdapter();
    expect(adapter.getServerState()).toEqual({ currentRoute: { path: "/about" } });
  });
  test("ignores a non-script element or a wrong type with the same id", () => {
    put({ id: "__SLASH_STATE__" }, "div");
    put({ id: "__SLASH_STATE__", type: "text/javascript" });
    const adapter = createBrowserAdapter();
    expect(adapter.getServerState()).toBeNull();
  });
});
