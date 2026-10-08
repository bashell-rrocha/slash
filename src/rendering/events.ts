import { addCleanup } from "../lifecycle/cleanup";
import type { EventHandler, EventOptions, EventTuple } from "../types";
import { isEventHandler, isEventTuple } from "../utils/guards";

export function parseEventProp(
  x: unknown,
): { handler: EventHandler; options?: EventOptions } | null {
  if (isEventHandler(x)) {
    return { handler: x };
  }
  if (isEventTuple(x)) {
    const handler = x[0];
    const options = x.length > 1 ? x[1] : undefined;
    return { handler, options };
  }
  return null;
}

export function setEvent(
  element: Element,
  eventName: string,
  handler: EventHandler,
  options?: EventOptions,
): void {
  const evtName = eventName.slice(2).toLowerCase();
  const listener = handler as EventListener;

  if (options !== undefined) {
    element.addEventListener(evtName, listener, options);
    addCleanup(element, () => element.removeEventListener(evtName, listener, options));
  } else {
    element.addEventListener(evtName, listener);
    addCleanup(element, () => element.removeEventListener(evtName, listener));
  }
}
