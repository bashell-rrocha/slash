/** SEC-07 / S8: Link só navega para caminhos do app; o resto vira href sanitizado */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { setHydrateContext } from "../hydration/context";
import { resetSecurityWarnings } from "../utils/security-warn";
import { BLOCKED_URL } from "../utils/url-policy";
import { Link } from "./components";
import { createRouter } from "./router";

const routes = [
  { path: "/", component: () => "home" },
  { path: "/about", component: () => "about" },
];

let warn: ReturnType<typeof spyOn>;
beforeEach(() => {
  resetSecurityWarnings();
  setHydrateContext(null);
  warn = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  delete (globalThis as any).__SLASH_SSR__;
  delete (globalThis as any).__SLASH_SSR_H__;
});

function make(to: any, extra: Record<string, unknown> = {}) {
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
      expect(click(link)).toBe(true);
      expect(pushed).toEqual([to]);
      expect(warn).not.toHaveBeenCalled();
    });
  }
});

function click(link: HTMLAnchorElement) {
  const ev = new Event("click", { cancelable: true, bubbles: true });
  link.dispatchEvent(ev);
  return ev.defaultPrevented;
}

describe("Link com destino que não é caminho do app (nunca navega)", () => {
  const bad = [
    "javascript:alert(1)",
    "java\tscript:alert(1)",
    " JaVaScRiPt:alert(1)",
    "\x01javascript:alert(1)",
    "//evil.com/x",
    "/\\evil",
    "/\\evil.com",
    "\\\\evil.com",
    "\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "https://evil.com",
    "http://evil.com",
    "mailto:a@b.co",
    "data:text/html,<script>alert(1)</script>",
    "evil",
    "about",
  ];
  for (const to of bad) {
    test(`${JSON.stringify(to)}: href bloqueado, defaultPrevented, sem push, com aviso`, () => {
      const { link, pushed } = make(to);
      expect(link.getAttribute("href")).toBe(BLOCKED_URL);
      expect(click(link)).toBe(true);
      expect(pushed).toEqual([]);
      expect(warn).toHaveBeenCalled();
    });
  }
  test("destino bloqueado emite exatamente um aviso (BLOCKED_URL não é bloqueada de novo)", () => {
    make("javascript:alert(1)");
    expect(warn).toHaveBeenCalledTimes(1);
  });
  test("to undefined ou null: sem href perigoso, sem push, com aviso", () => {
    for (const to of [undefined, null]) {
      resetSecurityWarnings();
      warn.mockClear();
      const { link, pushed } = make(to);
      expect(link.getAttribute("href") ?? BLOCKED_URL).toBe(BLOCKED_URL);
      expect(click(link)).toBe(true);
      expect(pushed).toEqual([]);
      expect(warn).toHaveBeenCalled();
    }
  });
  test("props.href não substitui o href calculado", () => {
    const { link } = make("/about", { href: "javascript:alert(1)" });
    expect(link.getAttribute("href")).toBe("/about");
  });
});

describe("Link com a prop external", () => {
  for (const to of ["https://example.com/x?y=1#z", "http://example.com", "mailto:a@b.co", "tel:+5511999999999"]) {
    test(`${to}: link nativo com rel noopener noreferrer`, () => {
      const { link, pushed } = make(to, { external: true });
      expect(link.getAttribute("href")).toBe(to);
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.hasAttribute("external")).toBe(false);
      expect(click(link)).toBe(false);
      expect(pushed).toEqual([]);
      expect(warn).not.toHaveBeenCalled();
    });
  }
  test("formas //, \\ e /\\ continuam bloqueadas mesmo com external", () => {
    for (const to of ["//evil.com", "/\\evil.com", "\\\\evil.com", "\\evil", "/\t/evil.com"]) {
      const { link, pushed } = make(to, { external: true });
      expect(link.getAttribute("href")).toBe(BLOCKED_URL);
      expect(click(link)).toBe(true);
      expect(pushed).toEqual([]);
    }
  });
  test("javascript:/data: continuam bloqueados com external", () => {
    for (const to of ["javascript:alert(1)", "java\tscript:alert(1)", "data:text/html,x", "vbscript:x"]) {
      const { link } = make(to, { external: true });
      expect(link.getAttribute("href")).toBe(BLOCKED_URL);
      expect(click(link)).toBe(true);
    }
  });
  test("external com caminho do app continua navegando pelo router", () => {
    const { link, pushed } = make("/about", { external: true });
    expect(click(link)).toBe(true);
    expect(pushed).toEqual(["/about"]);
  });
});

describe("Link normaliza caminhos do app", () => {
  test("espaços nas pontas são removidos antes do push e do href", () => {
    const { link, pushed } = make("  /about  ");
    expect(link.getAttribute("href")).toBe("/about");
    expect(click(link)).toBe(true);
    expect(pushed).toEqual(["/about"]);
  });
  test("caracteres de controle no caminho: rejeitado, nunca navega", () => {
    for (const to of ["/ab\tout", "/ab\nout", "/a\x00b", "/a\x01b"]) {
      const { link, pushed } = make(to);
      expect(link.getAttribute("href")).toBe(BLOCKED_URL);
      expect(click(link)).toBe(true);
      expect(pushed).toEqual([]);
    }
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
