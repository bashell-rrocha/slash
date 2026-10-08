export function toStr(v: unknown): string {
  return v == null ? "" : typeof v === "string" ? v : String(v);
}

export function processClassValue(val: unknown): string {
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.filter(Boolean).join(" ");
  if (typeof val === "object" && val !== null) {
    return Object.entries(val)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(" ");
  }
  return "";
}

