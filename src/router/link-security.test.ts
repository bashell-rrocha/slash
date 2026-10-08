/** SEC-07 / S8: Link só navega para caminhos do app; o resto vira href sanitizado */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { setHydrateContext } from "../hydration/context";
import { BLOCKED_URL } from "../utils/url-policy";
import { Link } from "./components";
import { createRouter } from "./router";

const routes = [
  { path: "/", component: () => "home" },
  { path: "/about", component: () => "about" },
];

let warn: ReturnType<typeof spyOn>;
beforeEach(() => {
  setHydrateContext(null);
  warn = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  delete (globalThis as any).__SLASH_SSR__;
  delete (globalThis as any).__SLASH_SSR_H__;
});

function make(to: string, extra: Record<string, unknown> = {}) {
  const router = createRouter({ routes, initialPath: "/" });
  const pushed: string[] = [];
  const orig = router.push.bind(router);
  router.push = ((p: string) => { pushed.push(p); return orig(p); }) as typeof router.push;
  const link = Link({ to, router, children: "x", ...extra }) as HTMLAnchorElement;
  return { link, pushed };
}

describe("Link com caminho do app", () => {
  for (const to of ["/about", "/", "/users/1?x=1#h", "?q=1", "#top"]) {
    test(`${to}: href preservado e clique navega via router.push`, async () => {
      const { link, pushed } = make(to);
      expect(link.getAttribute("href")).toBe(to);
      link.click();
      expect(pushed).toEqual([to]);
      expect(warn).not.toHaveBeenCalled();
    });
  }
});

describe("Link com destino que não é caminho do app", () => {
  test("javascript: -> href bloqueado, sem push, clique tem preventDefault, com aviso", () => {
    const { link, pushed } = make("javascript:alert(1)");
    expect(link.getAttribute("href")).toBe(BLOCKED_URL);
    const ev = new Event("click", { cancelable: true });
    link.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(pushed).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
  test("ofuscações de javascript:", () => {
    for (const to of ["java\tscript:alert(1)", " JaVaScRiPt:alert(1)", "\x01javascript:alert(1)"]) {
      const { link, pushed } = make(to);
      expect(link.getAttribute("href")).toBe(BLOCKED_URL);
      expect(pushed).toEqual([]);
    }
  });
  test("URL externa https: href sanitizado (válido), sem router.push, clique nativo preservado", () => {
    const { link, pushed } = make("https://example.com/x");
    expect(link.getAttribute("href")).toBe("https://example.com/x");
    const ev = new Event("click", { cancelable: true });
    link.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(pushed).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
  test("protocol-relative //evil.com e /\\evil.com não são caminhos do app", () => {
    for (const to of ["//evil.com/x", "/\\evil.com", "/\t/evil.com"]) {
      const { link, pushed } = make(to);
      link.click();
      expect(pushed).toEqual([]);
    }
  });
  test("data:text/html bloqueado", () => {
    const { link } = make("data:text/html,<script>alert(1)</script>");
    expect(link.getAttribute("href")).toBe(BLOCKED_URL);
  });
  test("props.href não substitui o href calculado", () => {
    const { link } = make("/about", { href: "javascript:alert(1)" });
    expect(link.getAttribute("href")).toBe("/about");
  });
});

describe("Link no SSR", () => {
  test("com o renderizador de string registrado, produz <a href>", () => {
    (globalThis as any).__SLASH_SSR__ = true;
    const calls: unknown[][] = [];
    (globalThis as any).__SLASH_SSR_H__ = (...args: unknown[]) => { calls.push(args); return "<a>"; };
    const router = createRouter({ routes, initialPath: "/" });
    const out = Link({ to: "/about", router, className: "c", children: "About" });
    expect(out).toBe("<a>");
    const [tag, props, children] = calls[0] as [string, Record<string, unknown>, unknown];
    expect(tag).toBe("a");
    expect(props.href).toBe("/about");
    expect(props.className).toBe("c");
    expect(children).toBe("About");
  });
  test("no SSR o href também passa pela política", () => {
    (globalThis as any).__SLASH_SSR__ = true;
    let seen: Record<string, unknown> = {};
    (globalThis as any).__SLASH_SSR_H__ = (_t: string, p: Record<string, unknown>) => { seen = p; return ""; };
    const router = createRouter({ routes, initialPath: "/" });
    Link({ to: "javascript:alert(1)", router });
    expect(seen.href).toBe(BLOCKED_URL);
  });
});
