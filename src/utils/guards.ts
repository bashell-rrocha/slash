import type { EventHandler, EventOptions, EventTuple, Reactive } from "../types";

export function isReactive(x: unknown): x is Reactive {
  return (
    !!x &&
    typeof (x as Record<string, unknown>).get === "function" &&
    typeof (x as Record<string, unknown>).subscribe === "function"
  );
}

export function isEventHandler(x: unknown): x is EventHandler {
  return (
    typeof x === "function" ||
    (typeof x === "object" && x !== null && "handleEvent" in (x as Record<string, unknown>))
  );
}

export function isEventOptions(x: unknown): x is EventOptions {
  return typeof x === "boolean" || (typeof x === "object" && x !== null);
}

export function isEventTuple(x: unknown): x is EventTuple {
  if (!Array.isArray(x)) return false;
  if (x.length === 0) return false;
  const fn0: unknown = x[0];
  if (!isEventHandler(fn0)) return false;
  const maybeOpts: unknown = x.length > 1 ? x[1] : undefined;
  if (maybeOpts !== undefined && !isEventOptions(maybeOpts)) return false;
  return true;
}
