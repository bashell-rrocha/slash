// Internal marker shared by the client `html` and the SSR `htmlString`: it wraps every
// DYNAMIC string value (${...}) before the template engine (htm) sees it. A bare string
// that reaches h() unmarked is therefore static text written by the developer in the
// template (raw inside <script>/<style>); a marked one is data.
// toString returns the raw text and exists ONLY for htm's concatenation in mixed
// attributes (class="a ${b}"); the class is private to the library and every exit point
// (h, hString, htmlString) strips it before any value reaches user code.
export class DynamicText {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

export function markDynamic(value: unknown): unknown {
  return typeof value === "string" ? new DynamicText(value) : value;
}

/** unmark through arrays (htm returns several roots as an array) */
export function unmarkDeep(value: unknown): unknown {
  return Array.isArray(value) ? value.map(unmarkDeep) : unmark(value);
}

export function unmark<T>(value: T): T | string {
  return value instanceof DynamicText ? value.value : value;
}
