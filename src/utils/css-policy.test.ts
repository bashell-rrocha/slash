import { describe, expect, test } from "bun:test";
import { isSafeCssDeclaration, isSafeCssValue, sanitizeStyleString } from "./css-policy";

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
  ])("permite %s", (v) => expect(isSafeCssValue(v)).toBe(true));

  test.each([
    "url(javascript:alert(1))",
    "url(data:text/html,x)",
    "url(//evil.com/x)",
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
