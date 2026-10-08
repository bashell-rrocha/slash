// form.ts

/** Base: evento com target tipado (preserva e.target.value / checked etc.) */
export type FormEvent<TTarget extends EventTarget, TEvent extends Event = Event> = Omit<
  TEvent,
  "target" | "currentTarget"
> & {
  target: TTarget;
  currentTarget: TTarget;
};

/* --------------------------------- Elements --------------------------------- */
export type TextFieldElement = HTMLInputElement | HTMLTextAreaElement; // possui .value
export type CheckboxElement = HTMLInputElement; // .checked (type="checkbox")
export type RadioElement = HTMLInputElement; // .checked (type="radio")
export type SelectElement = HTMLSelectElement; // .value
export type ButtonElement = HTMLButtonElement | HTMLInputElement; // <button> | <input type="submit|button|reset">
export type FormElement = HTMLFormElement;

/* ------------------------------ Merged aliases ------------------------------ */
/**
 * TextFieldEvent:
 *  - Default: une `InputEvent | Event | KeyboardEvent`
 *  - Especialize quando precisar de props específicas, ex.: `TextFieldEvent<KeyboardEvent>` para `e.key`.
 */
export type TextFieldEvent<E extends Event = InputEvent | Event | KeyboardEvent> = FormEvent<
  TextFieldElement,
  E
>;

/** CheckboxEvent: default cobre `change`/`input` */
export type CheckboxEvent<E extends Event = Event | InputEvent> = FormEvent<CheckboxElement, E>;

/** RadioEvent: default cobre `change` */
export type RadioEvent<E extends Event = Event> = FormEvent<RadioElement, E>;

/** SelectEvent: default cobre `change`/`input` (navegadores modernos) */
export type SelectEvent<E extends Event = Event | InputEvent> = FormEvent<SelectElement, E>;

/** ButtonEvent: clique e ativação por teclado (Enter/Espaço) */
export type ButtonEvent<E extends Event = MouseEvent | KeyboardEvent> = FormEvent<ButtonElement, E>;

/* ------------------------------- Form events ------------------------------- */
export type FormSubmitEvent = FormEvent<FormElement, SubmitEvent>;
export type FormResetEvent = FormEvent<FormElement, Event>;
export type FormInputEvent = FormEvent<FormElement, InputEvent>; // bubble de <input>/<textarea>
export type FormChangeEvent = FormEvent<FormElement, Event>; // bubble de change
export type FormFocusInEvent = FormEvent<FormElement, FocusEvent>;
export type FormFocusOutEvent = FormEvent<FormElement, FocusEvent>;

/** Evento nativo "formdata": `e.formData` contém o FormData pronto */
export type FormDataEvent = FormEvent<FormElement, globalThis.FormDataEvent>;

/** Controla tipo de atualização nos campos de texto relacionadas ao two way bainding nos formulários **/
export type TextFieldControlMode = "input" | "change" | "both";
