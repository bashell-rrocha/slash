/**
 * props-core.ts - Functional Core para Props
 *
 * FCIS Pattern: Functional Core
 * Contém apenas funções puras para decisões sobre como aplicar props.
 * Não contém side effects ou mutação de DOM.
 */

import { isSafeHtml } from "../safe-html";
import { isSafeUrl } from "../safe-url";
import type { Elementish } from "../types";
import { isForbiddenCssName, isForbiddenStyleKey, isSafeCssValue, isVendorStyleKey, sanitizeStyleString, styleKeyToCssName, styleObjectTooLong } from "../utils/css-policy";
import { isEventHandler, isEventTuple } from "../utils/guards";
import { processClassValue } from "../utils/helpers";
import { securityWarn } from "../utils/security-warn";
import { blockedUrlMessage, evaluateMetaRefresh, evaluateUrl, isRefreshHttpEquiv, isUrlAttribute } from "../utils/url-policy";

/**
 * Nomes de atributo válidos (subconjunto seguro do HTML/SVG/XML): impede que uma
 * chave vinda de dados (spread) injete `x onmouseover=...` ou faça setAttribute lançar.
 */
const ATTRIBUTE_NAME = /^[A-Za-z_:][A-Za-z0-9_:.-]*$/;
/** Nomes de tag válidos: letras, dígitos, `-` e `:` (custom elements e SVG com prefixo) */
const TAG_NAME = /^[A-Za-z][A-Za-z0-9:-]*$/;

export function isValidAttributeName(name: string): boolean {
  return ATTRIBUTE_NAME.test(name);
}

export function isValidTagName(name: string): boolean {
  return TAG_NAME.test(name);
}

// Props que viram HTML/markup: bloqueadas (use unsafeHtml() como filho)
const HTML_SINK_PROPS = new Set(["innerhtml", "outerhtml", "insertadjacenthtml", "srcdoc"]);
// Nomes que alterariam o protótipo/identidade do elemento
const PROTOTYPE_PROPS = new Set(["__proto__", "constructor", "prototype"]);
// Avisos só existem em dev: toda mensagem é montada atrás de
// `process.env.NODE_ENV !== "production"` escrito por extenso (o bundler só elimina
// os textos quando a expressão aparece inline, não via constante intermediária).

// Style por allowlist: nome CSS válido (custom property, dashed ou camelCase) e
// que não seja chave de CSSStyleDeclaration que não é propriedade CSS
// (cssText injeta CSS arbitrário; métodos não podem ser sobrescritos).
const STYLE_KEY = /^(?:--[A-Za-z0-9_-]+|-?[A-Za-z][A-Za-z0-9-]*)$/;

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
  | "BLOCKED"
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
    // Aviso de dev a ser emitido pelo shell (BLOCKED ou valor sanitizado)
    warning?: string;
  };
}

/**
 * Função pura: decide como aplicar uma prop
 *
 * @param elementType - Tipo do elemento (input, select, textarea, etc.)
 * @param key - Nome da prop
 * @param value - Valor da prop
 * @param hasProperty - Se o elemento tem a propriedade nativa
 * @param isMetaRefresh - O elemento é <meta http-equiv="refresh">: só então `content` é
 *   tratado como "atraso; url=..." e a URL passa pela política
 * @returns Comando de atualização (imutável)
 */
export function computePropUpdate(
  elementType: string,
  key: string,
  value: unknown,
  hasProperty: boolean,
  isMetaRefresh = false
): PropUpdate {
  // Toda decisão de política usa o nome em minúsculas: setAttribute minusculiza o nome em HTML,
  // então `STYLE`/`Style`/`HREF`/`SrcDoc` não podem escapar da política por diferença de caixa.
  const lowerKey = key.toLowerCase();

  // 1) NO_OP: ignora 'children'
  if (lowerKey === "children") {
    return { type: "NO_OP", key, value };
  }

  // 1.0) unsafeUrl()/SafeUrl só isenta atributos de URL (e o content de um meta refresh).
  // Em qualquer outro lugar vale como a string, que segue as regras do atributo.
  if (isSafeUrl(value) && !(isUrlAttribute(key, elementType) || (isMetaRefresh && lowerKey === "content"))) {
    const update = computePropUpdate(elementType, key, value.value, hasProperty, isMetaRefresh);
    if (process.env.NODE_ENV === "production") return update;
    const warning = update.metadata?.warning ?? `${key}: unsafeUrl() só vale em atributos de URL; tratado como a string`;
    return { ...update, metadata: { ...update.metadata, warning } };
  }

  // 1.1) Nome de atributo inválido (S5): descarta, nunca chega ao DOM
  if (!isValidAttributeName(key)) {
    return blocked(key, value, process.env.NODE_ENV !== "production" ? `atributo inválido: ${JSON.stringify(key)}` : "");
  }

  // 1.2) Eventos (S3/SEC-14, regra única com o SSR): TODO /^on/i é evento. Só função, objeto
  // handleEvent e tupla [fn, opções] viram listener (setProp registra antes de chegar aqui).
  // Qualquer outro valor (string, true, objeto) é descartado com aviso; atributo simples que
  // começa com "on" precisa do prefixo data-.
  if (key.length > 2 && /^on/i.test(key)) {
    if (isEventHandler(value) || isEventTuple(value)) {
      // Só chega aqui por prop reativa / hidratação: handlers não são reativos
      return blocked(
        key,
        value,
        process.env.NODE_ENV !== "production" ? `${key}: handlers reativos não são suportados; passe uma função` : "",
      );
    }
    if (value == null || value === false) return { type: "NO_OP", key, value };
    return blocked(
      key,
      value,
      process.env.NODE_ENV !== "production"
        ? `${key} só aceita função, objeto handleEvent ou tupla [fn, opções]; atributo simples que começa com "on" precisa do prefixo data- (ex.: data-${key})`
        : "",
    );
  }

  // 1.3) Props que viram HTML ou alteram o protótipo (S4/SEC-05)
  if (lowerKey === "srcdoc" && isSafeHtml(value)) {
    // srcdoc só é aceito como SafeHtml (unsafeHtml): grava o markup confiável como texto do atributo
    value = value.value;
  } else if (HTML_SINK_PROPS.has(lowerKey)) {
    if (value == null || value === false) return { type: "NO_OP", key, value };
    return blocked(
      key,
      value,
      process.env.NODE_ENV !== "production" ? `${key} bloqueada (injeta HTML). Para HTML confiável use um filho unsafeHtml()` : "",
    );
  }
  if (PROTOTYPE_PROPS.has(lowerKey)) {
    return blocked(key, value, process.env.NODE_ENV !== "production" ? `${key} não pode ser prop` : "");
  }

  // 2) SET_CLASS: class ou className
  if (lowerKey === "class" || lowerKey === "classname") {
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
  if (lowerKey === "style" && value && typeof value === "object") {
    // Mais de 8 KB no total: descarta o style inteiro
    if (styleObjectTooLong(value as Record<string, unknown>)) {
      return {
        type: "SET_STYLE",
        key,
        value: {},
        ...(process.env.NODE_ENV !== "production" ? { metadata: { warning: "style ignorado: mais de 8 KB" } } : {}),
      };
    }
    const safe: Record<string, unknown> = {};
    const dropped: string[] = [];
    for (const k of Object.keys(value)) {
      const v = (value as Record<string, unknown>)[k];
      // Mesma política de valores do SSR (url/expression/javascript, funções de URL...)
      const emptyValue = v == null || v === false;
      if (STYLE_KEY.test(k) && !isForbiddenStyleKey(k) && !isForbiddenCssName(styleKeyToCssName(k)) && (emptyValue || isSafeCssValue(String(v).trim()))) {
        safe[k] = v;
      } else {
        dropped.push(k);
      }
    }
    return {
      type: "SET_STYLE",
      key,
      value: safe,
      ...(process.env.NODE_ENV !== "production" && dropped.length ? { metadata: { warning: `style ignora ${dropped.join(", ")}` } } : {}),
    };
  }

  // 3.1) style como string: só as declarações seguras (mesma política do SSR)
  if (lowerKey === "style" && typeof value === "string") {
    const { value: safeStyle, rejected } = sanitizeStyleString(value);
    // Nada seguro sobrou: o atributo style é omitido (mesma regra do SSR)
    if (safeStyle === "") {
      return {
        type: "REMOVE_ATTRIBUTE",
        key,
        value: "",
        ...(process.env.NODE_ENV !== "production" && rejected
          ? { metadata: { warning: "style: declaração rejeitada (nome ou valor CSS inseguro)" } }
          : {}),
      };
    }
    return {
      type: "SET_ATTRIBUTE",
      key,
      value: safeStyle,
      ...(process.env.NODE_ENV !== "production" && rejected
        ? { metadata: { warning: "style: declaração rejeitada (nome ou valor CSS inseguro)" } }
        : {}),
    };
  }

  // 4) SET_VALUE: input/textarea/select controlados
  if (lowerKey === "value") {
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
  if (lowerKey === "checked") {
    return { type: "SET_CHECKED", key, value: Boolean(value) };
  }

  // 6) REMOVE_ATTRIBUTE: valores nulos ou false
  if (value == null || value === false) {
    return { type: "REMOVE_ATTRIBUTE", key, value };
  }

  // 6.1) Atributos de URL (S2/SEC-04): SafeUrl passa; o resto segue a política
  let finalValue: unknown = value;
  let warning: string | undefined;
  if (isSafeUrl(value)) {
    finalValue = value.value;
  } else if (isMetaRefresh && lowerKey === "content") {
    const result = evaluateMetaRefresh(String(value));
    finalValue = result.value;
    if (result.blocked) {
      warning = process.env.NODE_ENV !== "production" ? blockedUrlMessage(key, String(value)) : undefined;
    }
  } else if (isUrlAttribute(key, elementType)) {
    const result = evaluateUrl(key, String(value), elementType);
    finalValue = result.value;
    if (result.blocked) {
      warning = process.env.NODE_ENV !== "production" ? blockedUrlMessage(key, String(value)) : undefined;
    }
  }

  // 7) SET_PROPERTY: propriedade nativa do elemento
  if (hasProperty) {
    return {
      type: "SET_PROPERTY",
      key,
      value: finalValue,
      metadata: { useFallbackToAttribute: true, ...(warning ? { warning } : {}) },
    };
  }

  // 8) SET_ATTRIBUTE: atributo HTML padrão
  return {
    type: "SET_ATTRIBUTE",
    key,
    value: String(finalValue),
    ...(warning ? { metadata: { warning } } : {}),
  };
}

// Comando BLOCKED: não toca o DOM; o shell emite o aviso de dev
function blocked(key: string, value: unknown, reason: string): PropUpdate {
  return { type: "BLOCKED", key, value, metadata: { warning: reason } };
}

// Shell: aviso de dev (silencioso em produção)
function emitPropWarning(update: PropUpdate): void {
  const warning = update.metadata?.warning;
  // Uma vez por tipo de problema e nome de prop (não por valor)
  if (warning) securityWarn(warning, `${update.type}:${update.key.toLowerCase()}`);
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

/** Shell: o elemento é <meta http-equiv="refresh"> (lê o atributo já gravado)? */
export function isMetaRefreshElement(element: Elementish): boolean {
  return getElementType(element) === "meta" && isRefreshHttpEquiv((element as Element).getAttribute("http-equiv"));
}

/**
 * Shell: http-equiv pode ser definido DEPOIS de content (ordem das props). Quando o elemento
 * vira meta refresh, o content já gravado passa pela política.
 */
export function resanitizeMetaContent(element: Elementish, key: string): void {
  const lower = key.toLowerCase();
  if ((lower !== "http-equiv" && lower !== "httpequiv") || !isMetaRefreshElement(element)) return;
  const content = (element as Element).getAttribute("content");
  if (content === null) return;
  const result = evaluateMetaRefresh(content);
  if (result.blocked) {
    (element as Element).setAttribute("content", result.value);
    if (process.env.NODE_ENV !== "production") securityWarn(blockedUrlMessage("content", content), "url:meta-refresh");
  }
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
  // Qualquer comando pode carregar um aviso de dev (valor sanitizado/bloqueado)
  emitPropWarning(update);

  switch (update.type) {
    case "NO_OP":
    case "BLOCKED":
      // Nenhuma operação (BLOCKED já avisou acima)
      return;

    case "SET_CLASS": {
      if (element instanceof HTMLElement) {
        element.className = update.metadata?.processedClassName || "";
      }
      return;
    }

    case "SET_STYLE": {
      if (element instanceof HTMLElement && update.value && typeof update.value === "object") {
        // Os nomes já foram filtrados no core; aqui só aplica o que existe de fato
        const st = element.style as unknown as Record<string, unknown> & CSSStyleDeclaration;
        for (const [k, v] of Object.entries(update.value as Record<string, unknown>)) {
          const empty = v == null || v === false;
          if (k.includes("-") || isVendorStyleKey(k)) {
            // dashed, custom property (--x verbatim) e vendor camelCase (WebkitX -> -webkit-x)
            const name = styleKeyToCssName(k);
            if (empty) st.removeProperty(name);
            else st.setProperty(name, String(v));
          } else if (k in st && typeof st[k] !== "function") {
            st[k] = empty ? "" : v;
          }
        }
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
