// packages/slash/src/forms/form.helpers.ts
import type { Reactive } from "../types";
import type { State } from "../state";
import type {
  ButtonEvent,
  CheckboxElement,
  CheckboxEvent,
  FormElement,
  FormEvent,
  FormSubmitEvent,
  RadioElement,
  RadioEvent,
  SelectElement,
  SelectEvent,
  TextFieldControlMode,
  TextFieldElement,
  TextFieldEvent,
} from "./form.types";

/* ----------------------------------------------------------------------------
 * Two-way bindings (models)
 * -------------------------------------------------------------------------- */

/** Text input / textarea
 * @param state - Pass createState({ value: string })
 */
export function textFieldControl<T extends { value: string }>(
  state: State<T>,
  mode: TextFieldControlMode = "input",
) {
  // Criar Reactive a partir de state.value (tipo inferido como Reactive<string>)
  const valueReactive: Reactive<string> = {
    get: () => state.get().value,
    subscribe: (fn: (v: string) => void) => state.watch((s) => fn(s.value)),
  };

  const base = { value: valueReactive } as Record<string, unknown>;

  const setValue = (newValue: string) => {
    const current = state.get();
    state.set({ ...current, value: newValue } as T);
  };

  if (mode === "input" || mode === "both") {
    base.onInput = (e: TextFieldEvent<InputEvent>) => setValue(e.target.value);
  }
  if (mode === "change" || mode === "both") {
    base.onChange = (e: TextFieldEvent<Event>) => setValue(e.target.value);
  }
  return base;
}

/** Checkbox (boolean) */
export function checkboxControl<T extends { value: boolean }>(state: State<T>) {
  const valueReactive: Reactive<boolean> = {
    get: () => state.get().value,
    subscribe: (fn: (v: boolean) => void) => state.watch((s) => fn(s.value)),
  };

  const setValue = (newValue: boolean) => {
    const current = state.get();
    state.set({ ...current, value: newValue } as T);
  };

  return {
    checked: valueReactive,
    onChange: (e: CheckboxEvent<Event>) => {
      setValue((e.target as CheckboxElement).checked);
    },
  };
}

/** Radio group (valor selecionado). Passe o value desta opção. */
export function radioControl<T extends { value: string }>(state: State<T>, value: string) {
  // Criar um Reactive<boolean> derivado manualmente
  const checkedReactive: Reactive<boolean> = {
    get: () => state.get().value === value,
    subscribe: (fn: (v: boolean) => void) => {
      return state.watch((s) => fn(s.value === value));
    },
  };

  const setValue = (newValue: string) => {
    const current = state.get();
    state.set({ ...current, value: newValue } as T);
  };

  return {
    checked: checkedReactive,
    onChange: (e: RadioEvent<Event>) => {
      if ((e.target as RadioElement).checked) {
        setValue(value);
      }
    },
    value,
  };
}

/** Select (single) */
export function SelectControl<T extends { value: string }>(state: State<T>) {
  const valueReactive: Reactive<string> = {
    get: () => state.get().value,
    subscribe: (fn: (v: string) => void) => state.watch((s) => fn(s.value)),
  };

  const setValue = (newValue: string) => {
    const current = state.get();
    state.set({ ...current, value: newValue } as T);
  };

  return {
    value: valueReactive,
    onChange: (e: SelectEvent<Event>) => {
      setValue((e.target as SelectElement).value);
    },
    onInput: (e: SelectEvent<InputEvent>) => {
      setValue((e.target as SelectElement).value);
    },
  };
}

/* ----------------------------------------------------------------------------
 * Helpers de leitura de valor (DX)
 * -------------------------------------------------------------------------- */

export const getText = (e: TextFieldEvent): string => e.target.value;
export const getChecked = (e: CheckboxEvent | RadioEvent): boolean =>
  (e.target as CheckboxElement | RadioElement).checked;
export const getSelectValue = (e: SelectEvent): string => e.target.value;

/* ----------------------------------------------------------------------------
 * Delegation de eventos (leve e tipado)
 * -------------------------------------------------------------------------- */

/**
 * Delegation: escuta em `root`, encaminha para o elemento mais próximo que
 * corresponda ao `selector`. O handler recebe um FormEvent com target tipado.
 *
 * Uso:
 *   const off = delegate<HTMLInputElement, InputEvent>(
 *     formEl, "input", 'input[name="email"]',
 *     (e) => console.log(e.target.value)
 *   );
 *   // off() remove o listener
 */
export function delegate<El extends Element, Evt extends Event = Event>(
  root: Element,
  type: string,
  selector: string,
  handler: (e: FormEvent<El, Evt>) => void,
  options?: boolean | AddEventListenerOptions,
): () => void {
  const listener = (ev: Event) => {
    const start = ev.target as Element | null;
    if (!start) return;
    const target = start.closest(selector) as El | null;
    if (!target || !root.contains(target)) return;

    // "Projeta" o evento original com target tipado
    const wrapped = Object.create(Object.getPrototypeOf(ev), {
      target: { value: target, writable: false, enumerable: true, configurable: true },
      currentTarget: { value: target, writable: false, enumerable: true, configurable: true },
    });
    Object.setPrototypeOf(wrapped, ev);

    handler(wrapped as FormEvent<El, Evt>);
  };

  root.addEventListener(type, listener as EventListener, options);
  return () => root.removeEventListener(type, listener as EventListener, options);
}

/* ----------------------------------------------------------------------------
 * Form data helpers
 * -------------------------------------------------------------------------- */

/** Converte um <form> em objeto plano. Campos duplicados viram arrays (sem undefined). */
export function formToObject(
  form: FormElement,
): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
  const fd = new FormData(form);
  const out: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};

  fd.forEach((value, key) => {
    const existing = out[key];
    if (existing === undefined) {
      out[key] = value;
    } else if (Array.isArray(existing)) {
      (existing as FormDataEntryValue[]).push(value);
    } else {
      out[key] = [existing, value];
    }
  });

  return out;
}

/**
 * onSubmit: previne default, entrega `data` (objeto) e evento tipado.
 *
 * Uso:
 *   html`<form onSubmit=${onSubmit((data) => { ... })}>...</form>`
 */
export function onSubmit(
  cb: (data: Record<string, FormDataEntryValue | FormDataEntryValue[]>, e: FormSubmitEvent) => void,
) {
  return (e: FormSubmitEvent) => {
    e.preventDefault();
    cb(formToObject(e.currentTarget), e);
  };
}

/* ----------------------------------------------------------------------------
 * Botões utilitários (opcional)
 * -------------------------------------------------------------------------- */

export function onReset(handler: (e: FormEvent<FormElement, Event>) => void) {
  return (e: FormEvent<FormElement, Event>) => handler(e);
}

export function onButtonClick(handler: (e: ButtonEvent<MouseEvent>) => void) {
  return (e: ButtonEvent<MouseEvent>) => handler(e);
}
