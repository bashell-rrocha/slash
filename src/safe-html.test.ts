import { describe, expect, test } from "bun:test";
import { isSafeHtml, SafeHtml, unsafeHtml } from "./safe-html";

describe("SafeHtml", () => {
  test("unsafeHtml devolve um SafeHtml com o valor original", () => {
    const s = unsafeHtml("<b>x</b>");
    expect(isSafeHtml(s)).toBe(true);
    expect(s.value).toBe("<b>x</b>");
    expect(String(s)).toBe("<b>x</b>");
  });

  test("string simples e objeto comum não são SafeHtml", () => {
    expect(isSafeHtml("<b>x</b>")).toBe(false);
    expect(isSafeHtml({ value: "<b>x</b>" })).toBe(false);
    expect(isSafeHtml(null)).toBe(false);
    expect(isSafeHtml(undefined)).toBe(false);
  });

  test("JSON vindo de fora não consegue forjar o brand", () => {
    const forged = JSON.parse('{"value":"<img src=x onerror=alert(1)>","__brand":true,"value2":1}');
    expect(isSafeHtml(forged)).toBe(false);
  });

  test("a instância é imutável", () => {
    const s = unsafeHtml("a");
    expect(Object.isFrozen(s)).toBe(true);
    expect(s).toBeInstanceOf(SafeHtml);
  });
});
