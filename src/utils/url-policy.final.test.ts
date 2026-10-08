/** Final security review F1: ReDoS bounds and scheme/context allowlist (D3, D4, D5) */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { resetSecurityWarnings } from "./security-warn";
import { BLOCKED_URL, evaluateMetaRefresh, evaluateUrl, isAllowedImageUrl, sanitizeUrl } from "./url-policy";

let warn: ReturnType<typeof spyOn>;
beforeEach(() => {
  resetSecurityWarnings();
  warn = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

// Timing probes run in a killable subprocess: a quadratic regression FAILS fast instead of hanging the suite.
const POLICY = `${import.meta.dir}/url-policy.ts`;
async function probe(body: string): Promise<{ ms: number; out: string }> {
  const code = `import * as p from ${JSON.stringify(POLICY)};
const MB = 1024 * 1024;
const t = performance.now();
const out = (() => { ${body} })();
console.log(JSON.stringify({ ms: performance.now() - t, out }));`;
  const proc = Bun.spawn(["bun", "-e", code], { stdout: "pipe", stderr: "pipe", timeout: 8000, killSignal: "SIGKILL" });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  if (proc.signalCode) throw new Error(`probe killed (${proc.signalCode}): quadratic behaviour`);
  return JSON.parse(text.trim().split("\n").pop() as string);
}

describe("ReDoS bounds (1 MB inputs, subprocess)", () => {
  test("1 MB of spaces in a URL attribute", async () => {
    const r = await probe(`return p.sanitizeUrl("href", "x" + " ".repeat(MB) + "x", "a").length > 0`);
    expect(r.ms).toBeLessThan(500);
  }, 15000);
  test("srcset payloads", async () => {
    const r = await probe(`
      const vals = ["a" + " (".repeat(MB / 2), "a (b ".repeat(MB / 5), "a " + " ".repeat(MB) + "b", "a" + ",".repeat(MB) + "x,"];
      return vals.map((v) => p.evaluateUrl("srcset", v, "img").blocked);`);
    expect(r.out).toEqual([true, true, true, true]);
    expect(r.ms).toBeLessThan(500);
  }, 15000);
  test("meta refresh payloads", async () => {
    const r = await probe(`
      const vals = ["0;url=a" + " ".repeat(MB) + "b", "0;url=" + "a ".repeat(MB / 2), " ".repeat(MB) + "1"];
      return vals.map((v) => p.evaluateMetaRefresh(v).blocked);`);
    expect(r.ms).toBeLessThan(500);
  }, 15000);
  test("16 KB boundary payloads stay fast too", async () => {
    const r = await probe(`
      const v = "a" + " (".repeat(8000);
      return [p.evaluateUrl("srcset", v, "img").blocked, p.evaluateMetaRefresh("0;url=a" + " ".repeat(16000) + "b").blocked];`);
    expect(r.ms).toBeLessThan(200);
  }, 15000);
});

describe("ReDoS semantics", () => {
  test("leading/trailing whitespace is still ignored for the scheme check", () => {
    expect(sanitizeUrl("href", "   javascript:alert(1)   ", "a")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("href", "\u00a0javascript:alert(1)", "a")).toBe(BLOCKED_URL);
  });
  test("srcset above 16 KB fails closed", () => {
    const r = evaluateUrl("srcset", `/a.png 1x, ${"/b.png 2x, ".repeat(3000)}`, "img");
    expect(r.blocked).toBe(true);
    expect(r.value).toBe(BLOCKED_URL);
  });
  test("small valid srcset still works", () => {
    const v = "/a.png 1x, /b.png 2x, /c.png 100w";
    expect(evaluateUrl("srcset", v, "img")).toEqual({ value: v, blocked: false });
    expect(evaluateUrl("srcset", "javascript:x 1x, /b.png 2x", "img").blocked).toBe(true);
  });
  test("meta refresh above 16 KB fails closed", () => {
    expect(evaluateMetaRefresh(`0;url=/${"a".repeat(20_000)}`).blocked).toBe(true);
  });
  test("meta refresh semantics preserved", () => {
    expect(evaluateMetaRefresh("5; url=/ok")).toEqual({ value: "5; url=/ok", blocked: false });
    expect(evaluateMetaRefresh("0;url='javascript:alert(1)'").value).toBe(`0;url='${BLOCKED_URL}'`);
    expect(evaluateMetaRefresh("0; url=javascript:alert(1) ").blocked).toBe(true);
  });
});

describe("D3 blob: on media src", () => {
  for (const tag of ["img", "audio", "video", "source", "track"]) {
    test(`${tag} src allows blob:`, () => {
      expect(sanitizeUrl("src", "blob:https://a.com/1-2", tag)).toBe("blob:https://a.com/1-2");
    });
  }
  test("blob: blocked on embed, area, input, link and other tags", () => {
    for (const [attr, tag] of [["src", "embed"], ["href", "area"], ["src", "input"], ["href", "link"], ["poster", "video"], ["srcset", "img"]] as const) {
      expect(sanitizeUrl(attr, "blob:https://a.com/1", tag)).toBe(BLOCKED_URL);
    }
  });
  test("blob: blocked in href, iframe src, script src, object data", () => {
    expect(sanitizeUrl("href", "blob:https://a.com/1", "a")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("src", "blob:https://a.com/1", "iframe")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("src", "blob:https://a.com/1", "script")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("data", "blob:https://a.com/1", "object")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("src", "blob:https://a.com/1")).toBe(BLOCKED_URL);
  });
});

describe("D4 data:image/svg+xml in image context", () => {
  const svg = "data:image/svg+xml,%3Csvg%3E%3C/svg%3E";
  test("allowed in img src and srcset", () => {
    expect(sanitizeUrl("src", svg, "img")).toBe(svg);
    expect(evaluateUrl("srcset", `${svg} 1x`, "img").blocked).toBe(false);
  });
  test("blocked in href, iframe, object, embed, script", () => {
    expect(sanitizeUrl("href", svg, "a")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("src", svg, "iframe")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("data", svg, "object")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("src", svg, "embed")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("src", svg)).toBe(BLOCKED_URL);
  });
  test("isAllowedImageUrl helper (for CSS url())", () => {
    expect(isAllowedImageUrl(svg)).toBe(true);
    expect(isAllowedImageUrl("data:image/png;base64,AAAA")).toBe(true);
    expect(isAllowedImageUrl("blob:https://a.com/1")).toBe(true);
    expect(isAllowedImageUrl("/a.png")).toBe(true);
    expect(isAllowedImageUrl("data:text/html,x")).toBe(false);
    expect(isAllowedImageUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("D5 scheme allowlist", () => {
  test("sms: allowed", () => {
    expect(sanitizeUrl("href", "sms:+5511999999999", "a")).toBe("sms:+5511999999999");
  });
  test("sms: obfuscations are classified like the browser would", () => {
    expect(sanitizeUrl("href", "s\tm\ns:+55119", "a")).toBe("s\tm\ns:+55119");
    expect(sanitizeUrl("href", "  SMS:+55119", "a")).toBe("  SMS:+55119");
    expect(sanitizeUrl("href", "sms\u00a0:+55119", "a")).toBe("sms\u00a0:+55119"); // not a scheme: relative path
    expect(sanitizeUrl("href", "smss:+55119", "a")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("href", "xsms:+55119", "a")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("href", "sms:\u0000javascript:alert(1)", "a")).toBe("sms:\u0000javascript:alert(1)"); // sms body is inert
    expect(sanitizeUrl("href", "&#115;ms:+55119", "a")).toBe("&#115;ms:+55119"); // inert relative path
  });
  for (const url of ["whatsapp://send?text=x", "ftp://a.com/x", "data:text/csv,a,b", "intent://x", "sip:a@b"]) {
    test(`${url} blocked`, () => {
      expect(sanitizeUrl("href", url, "a")).toBe(BLOCKED_URL);
    });
  }
});
