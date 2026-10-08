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

function timed(fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe("ReDoS bounds", () => {
  test("200k spaces in a URL attribute: < 50 ms", () => {
    const value = `x${" ".repeat(200_000)}x`;
    expect(timed(() => sanitizeUrl("href", value, "a"))).toBeLessThan(50);
  });
  test("leading/trailing whitespace is still ignored for the scheme check", () => {
    expect(sanitizeUrl("href", "   javascript:alert(1)   ", "a")).toBe(BLOCKED_URL);
    expect(sanitizeUrl("href", " javascript:alert(1)", "a")).toBe(BLOCKED_URL);
  });
  test("srcset payloads: < 50 ms and fail closed", () => {
    for (const value of [`a${" (".repeat(20_000)}`, "a (b ".repeat(10_000), `a ${" ".repeat(100_000)}b`]) {
      let result = { value: "", blocked: false };
      expect(timed(() => { result = evaluateUrl("srcset", value, "img"); })).toBeLessThan(50);
      expect(result.blocked).toBe(true);
    }
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
  test("meta refresh payloads: < 50 ms", () => {
    for (const value of [`0;url=a${" ".repeat(20_000)}b`, `0;url=${"a ".repeat(50_000)}`]) {
      expect(timed(() => evaluateMetaRefresh(value))).toBeLessThan(50);
    }
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
  for (const url of ["whatsapp://send?text=x", "ftp://a.com/x", "data:text/csv,a,b", "intent://x", "sip:a@b"]) {
    test(`${url} blocked`, () => {
      expect(sanitizeUrl("href", url, "a")).toBe(BLOCKED_URL);
    });
  }
});
