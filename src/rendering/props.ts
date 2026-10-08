import { addCleanup } from "../lifecycle/cleanup";
import type { Elementish, Props, Reactive } from "../types";
import { isReactive } from "../utils/guards";
import { processClassValue } from "../utils/helpers";
import { parseEventProp } from "./events";
import {
  computePropUpdate,
  applyPropUpdate,
  getElementType,
  hasNativeProperty,
} from "./props-core";

export function applyClass(element: Element, val: unknown): void {
  if (element instanceof HTMLElement) {
    const className = processClassValue(val);
    if (val == null || val === false) {
      element.className = "";
    } else {
      element.className = className;
    }
  }
}

export function setPropReactive(element: Element, key: string, sig: Reactive<unknown>): void {
  // FCIS: Função de aplicação que usa Functional Core
  const apply = (val: unknown) => {
    // Functional Core: decide o que fazer (sem side effects)
    const elementType = getElementType(element as Elementish);
    const hasProp = hasNativeProperty(element as Elementish, key);
    const update = computePropUpdate(elementType, key, val, hasProp);

    // Imperative Shell: executa o comando (com side effects)
    applyPropUpdate(element as Elementish, update);
  };

  apply(sig.get());
  const unsub = sig.subscribe(apply);
  addCleanup(element, unsub);
}

export function setProp(element: Elementish, key: string, val: unknown): void {
  // 1) NO_OP: ignora children
  if (key === "children") return;

  // 2) Signals: converte para prop reativo
  if (isReactive(val)) {
    setPropReactive(element, key, val);
    return;
  }

  // 3) Eventos: onClick / onInput / onChange / ...
  if (key.startsWith("on") && key[2] === key[2]?.toUpperCase()) {
    const type = key.slice(2).toLowerCase();
    const parsed = parseEventProp(val);
    if (parsed) {
      element.addEventListener(type, parsed.handler, parsed.options);
      addCleanup(element, () => element.removeEventListener(type, parsed.handler, parsed.options));
    }
    return;
  }

  // 4) FCIS Pattern: Functional Core + Imperative Shell
  // Functional Core: decide o que fazer (sem side effects)
  const elementType = getElementType(element);
  const hasProp = hasNativeProperty(element, key);
  const update = computePropUpdate(elementType, key, val, hasProp);

  // Imperative Shell: executa o comando (com side effects)
  applyPropUpdate(element, update);
}
