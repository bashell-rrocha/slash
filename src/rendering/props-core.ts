/**
 * props-core.ts - Functional Core para Props
 *
 * FCIS Pattern: Functional Core
 * Contém apenas funções puras para decisões sobre como aplicar props.
 * Não contém side effects ou mutação de DOM.
 */

import type { Elementish } from "../types";
import { processClassValue } from "../utils/helpers";

/**
 * Tipos de operações de props (Functional Core)
 */
export type PropUpdateType =
  | "SET_ATTRIBUTE"
  | "REMOVE_ATTRIBUTE"
  | "SET_PROPERTY"
  | "SET_VALUE"
  | "SET_CHECKED"
  | "SET_CLASS"
  | "SET_STYLE"
  | "SET_SELECT_OPTIONS"
  | "NO_OP";

/**
 * Comando imutável representando uma atualização de prop
 */
export interface PropUpdate {
  type: PropUpdateType;
  key: string;
  value: unknown;
  // Metadados adicionais para cada tipo de operação
  metadata?: {
    // Para SET_SELECT_OPTIONS
    selectedValue?: string;
    // Para SET_PROPERTY
    useFallbackToAttribute?: boolean;
    // Para SET_CLASS
    processedClassName?: string;
  };
}

/**
 * Função pura: decide como aplicar uma prop
 *
 * @param elementType - Tipo do elemento (input, select, textarea, etc.)
 * @param key - Nome da prop
 * @param value - Valor da prop
 * @param hasProperty - Se o elemento tem a propriedade nativa
 * @returns Comando de atualização (imutável)
 */
export function computePropUpdate(
  elementType: string,
  key: string,
  value: unknown,
  hasProperty: boolean
): PropUpdate {
  // 1) NO_OP: ignora 'children'
  if (key === "children") {
    return { type: "NO_OP", key, value };
  }

  // 2) SET_CLASS: class ou className
  if (key === "class" || key === "className") {
    const processedClassName = processClassValue(value);
    if (value == null || value === false) {
      return {
        type: "SET_CLASS",
        key,
        value: "",
        metadata: { processedClassName: "" },
      };
    }
    return {
      type: "SET_CLASS",
      key,
      value,
      metadata: { processedClassName },
    };
  }

  // 3) SET_STYLE: style object
  if (key === "style" && value && typeof value === "object") {
    return { type: "SET_STYLE", key, value };
  }

  // 4) SET_VALUE: input/textarea/select controlados
  if (key === "value") {
    const normalizedValue = value == null ? "" : String(value);

    if (elementType === "select") {
      return {
        type: "SET_SELECT_OPTIONS",
        key,
        value: normalizedValue,
        metadata: { selectedValue: normalizedValue },
      };
    }

    return { type: "SET_VALUE", key, value: normalizedValue };
  }

  // 5) SET_CHECKED: checkboxes
  if (key === "checked") {
    return { type: "SET_CHECKED", key, value: Boolean(value) };
  }

  // 6) REMOVE_ATTRIBUTE: valores nulos ou false
  if (value == null || value === false) {
    return { type: "REMOVE_ATTRIBUTE", key, value };
  }

  // 7) SET_PROPERTY: propriedade nativa do elemento
  if (hasProperty) {
    return {
      type: "SET_PROPERTY",
      key,
      value,
      metadata: { useFallbackToAttribute: true },
    };
  }

  // 8) SET_ATTRIBUTE: atributo HTML padrão
  return { type: "SET_ATTRIBUTE", key, value: String(value) };
}

/**
 * Função pura auxiliar: determina se um elemento tem uma propriedade nativa
 *
 * @param element - Elemento DOM
 * @param key - Nome da propriedade
 * @returns true se a propriedade existe no elemento
 */
export function hasNativeProperty(element: Elementish, key: string): boolean {
  return key in element;
}

/**
 * Função pura auxiliar: obtém o tipo de elemento (tagName em lowercase)
 *
 * @param element - Elemento DOM
 * @returns Nome da tag em lowercase (ex: "input", "select", "div")
 */
export function getElementType(element: Elementish): string {
  return (element as Element).tagName?.toLowerCase() || "";
}

/**
 * IMPERATIVE SHELL: Aplica o comando de atualização de prop ao DOM
 *
 * Esta função contém TODOS os side effects e mutações de DOM.
 * Não contém lógica de decisão - apenas executa comandos.
 *
 * @param element - Elemento DOM a ser modificado
 * @param update - Comando de atualização (vindo de computePropUpdate)
 */
export function applyPropUpdate(element: Elementish, update: PropUpdate): void {
  switch (update.type) {
    case "NO_OP":
      // Nenhuma operação
      return;

    case "SET_CLASS": {
      if (element instanceof HTMLElement) {
        element.className = update.metadata?.processedClassName || "";
      }
      return;
    }

    case "SET_STYLE": {
      if (element instanceof HTMLElement && update.value && typeof update.value === "object") {
        Object.assign(element.style, update.value as Record<string, unknown>);
      }
      return;
    }

    case "SET_VALUE": {
      const ctl = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const next = String(update.value);

      if (ctl.value !== next) ctl.value = next;

      if ("defaultValue" in ctl) {
        const t = ctl as HTMLInputElement | HTMLTextAreaElement;
        if (t.defaultValue !== next) t.defaultValue = next;
      }
      return;
    }

    case "SET_SELECT_OPTIONS": {
      const ctl = element as HTMLSelectElement;
      const next = update.metadata?.selectedValue || "";

      if (ctl.value !== next) ctl.value = next;

      for (const opt of Array.from(ctl.options)) {
        opt.selected = opt.value === next;
      }
      return;
    }

    case "SET_CHECKED": {
      const box = element as HTMLInputElement;
      const next = Boolean(update.value);
      if (box.checked !== next) box.checked = next;
      if (box.defaultChecked !== next) box.defaultChecked = next;
      return;
    }

    case "REMOVE_ATTRIBUTE": {
      (element as Element).removeAttribute(update.key);
      return;
    }

    case "SET_PROPERTY": {
      const ok = Reflect.set(element as object, update.key, update.value);
      // Fallback para setAttribute se Reflect.set falhar
      if (!ok && update.metadata?.useFallbackToAttribute) {
        if (update.value == null || update.value === false) {
          (element as Element).removeAttribute(update.key);
        } else {
          (element as Element).setAttribute(update.key, String(update.value));
        }
      }
      return;
    }

    case "SET_ATTRIBUTE": {
      (element as Element).setAttribute(update.key, String(update.value));
      return;
    }

    default: {
      // Tipo desconhecido - TypeScript garantirá que isso nunca acontece
      const exhaustive: never = update.type;
      throw new Error(`Tipo de PropUpdate desconhecido: ${exhaustive}`);
    }
  }
}
