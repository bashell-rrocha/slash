/** Final security review F1 (I3, D7): link interception and relative push */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { setHydrateContext } from "../hydration/context";
import { resetSecurityWarnings } from "../utils/security-warn";
import { Link } from "./components";
import { __resetHistoryForTesting__, createHistoryMode } from "./history";
import { createRouter } from "./router";

const routes = [
  { path: "/", component: () => "home" },
  { path: "/about", component: () => "about" },
];

const setUrl = (path: string) => (window as any).happyDOM.setURL(`http://localhost${path}`);
let warn: ReturnType<typeof spyOn>;

beforeEach(() => {
  __resetHistoryForTesting__();
  resetSecurityWarnings();
  setHydrateContext(null);
  setUrl("/");
  document.body.innerHTML = "";
  warn = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  __resetHistoryForTesting__();
});

function clickAnchor(href: string): { prevented: boolean; paths: string[] } {
  const history = createHistoryMode();
  const paths: string[] = [];
  history.listen((p) => paths.push(p));
  const a = document.createElement("a");
  a.setAttribute("href", href);
  document.body.appendChild(a);
  const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
  a.dispatchEvent(ev);
  return { prevented: ev.defaultPrevented, paths };
}

describe("link interceptor", () => {
  for (const href of ["mailto:a@b.co", "tel:+5511999999999", "sms:+5511999999999", "//evil.com/x", "https://evil.com/x", "ftp://x.com/a", "javascript:void(0)"]) {
    test(`${href} is not intercepted`, () => {
      const r = clickAnchor(href);
      expect(r.prevented).toBe(false);
      expect(r.paths).toEqual([]);
    });
  }
  test("same-origin absolute URL is intercepted with a normalized path", () => {
    const r = clickAnchor("http://localhost/about?x=1#h");
    expect(r.prevented).toBe(true);
    expect(r.paths).toEqual(["/about?x=1#h"]);
  });
  test("relative ?tab=2 on /about goes to /about?tab=2", () => {
    setUrl("/about");
    const r = clickAnchor("?tab=2");
    expect(r.prevented).toBe(true);
    expect(r.paths).toEqual(["/about?tab=2"]);
    expect(window.location.pathname + window.location.search).toBe("/about?tab=2");
  });
  test("pushState listeners receive the normalized path, never the raw url", () => {
    const history = createHistoryMode();
    const paths: string[] = [];
    history.listen((p) => paths.push(p));
    setUrl("/about");
    window.history.pushState({}, "", "?a=1");
    window.history.pushState({}, "", "http://localhost/x?b=2#z");
    window.history.replaceState({}, "", "#only");
    expect(paths).toEqual(["/about?a=1", "/x?b=2#z", "/x?b=2#only"]);
  });
});

describe("relative router.push (D7)", () => {
  test("push('?tab=2') from /about stays on /about", async () => {
    setUrl("/about");
    const router = createRouter({ routes });
    await router.ready;
    await router.push("?tab=2");
    expect(window.location.pathname).toBe("/about");
    expect(window.location.search).toBe("?tab=2");
    expect(router.get().currentRoute?.path).toBe("/about");
    expect(router.get().query).toEqual({ tab: "2" });
  });
  test("push('#sec') from /about?x=1 keeps path and query", async () => {
    setUrl("/about?x=1");
    const router = createRouter({ routes });
    await router.ready;
    await router.push("#sec");
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/about?x=1#sec");
    expect(router.get().currentRoute?.path).toBe("/about");
  });
  test("Link to='?tab=2' navigates relative to the current path", async () => {
    setUrl("/about");
    const router = createRouter({ routes });
    await router.ready;
    const link = Link({ to: "?tab=2", router, children: "t" }) as HTMLAnchorElement;
    link.dispatchEvent(new Event("click", { cancelable: true, bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(window.location.pathname + window.location.search).toBe("/about?tab=2");
  });
  test("Link external accepts sms:", () => {
    const router = createRouter({ routes, initialPath: "/" });
    const link = Link({ to: "sms:+5511999999999", router, external: true, children: "t" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("sms:+5511999999999");
  });
});
