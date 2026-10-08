import { describe, expect, test } from "bun:test";
import { isSafeUrl, unsafeUrl } from "./safe-url";

describe("SafeUrl / unsafeUrl", () => {
  test("unsafeUrl embrulha a string sem alterá-la", () => {
    const u = unsafeUrl("javascript:void(0)");
    expect(isSafeUrl(u)).toBe(true);
    expect(u.value).toBe("javascript:void(0)");
    expect(String(u)).toBe("javascript:void(0)");
  });
  test("string e objetos comuns não são SafeUrl (sem falsificação estrutural)", () => {
    expect(isSafeUrl("javascript:x")).toBe(false);
    expect(isSafeUrl({ value: "javascript:x" })).toBe(false);
    expect(isSafeUrl(null)).toBe(false);
  });
});

describe("exports públicos", () => {
  test("core, ssr e index expõem unsafeUrl/isSafeUrl", async () => {
    const [core, ssr, index] = await Promise.all([import("./core"), import("./ssr"), import("./index")]);
    for (const mod of [core, ssr, index]) {
      expect(mod.unsafeUrl).toBe(unsafeUrl);
      expect(mod.isSafeUrl).toBe(isSafeUrl);
    }
  });
});
