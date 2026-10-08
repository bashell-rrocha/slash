/**
 * url-policy.ts - Política de URLs (compartilhada por cliente, SSR e hidratação)
 *
 * Funções puras. Permitido: http:, https:, mailto:, tel: e URLs relativas
 * (`/`, `./`, `../`, `?`, `#`, caminho sem esquema). `data:image/(png|jpeg|gif|webp|avif)`
 * só em atributos de imagem (`img src`, `srcset`, `poster`). Todo o resto
 * (javascript:, vbscript:, data:text/html, blob:, file:...) vira BLOCKED_URL.
 *
 * Observações de projeto:
 * - URL protocol-relative (`//host/x`) é PERMITIDA: herda http(s) da página,
 *   portanto não executa script. Quem precisa restringir origem deve validar
 *   o host por conta própria.
 * - Não há decodificação de entidades HTML aqui: no caminho DOM do cliente o valor
 *   chega literal, e `&#106;avascript:` é só um caminho relativo inerte.
 *   (A stream SSR escapa o valor depois de sanitizar, nunca antes.)
 */

import { securityWarn } from "./security-warn";

/** URL inerte usada no lugar de qualquer valor rejeitado */
export const BLOCKED_URL = "about:blank#blocked";

const URL_ATTRIBUTES = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "poster",
  "cite",
  "background",
  "srcset",
  "ping",
  "data",
  "manifest",
  "codebase",
  "longdesc",
  "lowsrc",
  "imagesrcset",
]);

// SMIL: values/to/from só são URL em elementos de animação (atributo alvo href)
const SMIL_ATTRIBUTES = new Set(["values", "to", "from"]);
const SMIL_TAGS = new Set(["animate", "set", "animatemotion"]);

const isSmil = (name: string, tag?: string): boolean =>
  SMIL_ATTRIBUTES.has(name) && tag !== undefined && SMIL_TAGS.has(tag.toLowerCase());

const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

// Atributos que carregam imagem (único lugar onde data:image/* é aceito)
const IMAGE_ATTRIBUTES = new Set(["src", "srcset", "poster", "imagesrcset"]);
const IMAGE_TAGS = new Set(["img", "source", "video", "image", "link"]);

const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|avif)[;,]/i;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/** true se o atributo carrega uma URL (case-insensitive) */
export function isUrlAttribute(attr: string, tag?: string): boolean {
  const name = attr.toLowerCase();
  return URL_ATTRIBUTES.has(name) || isSmil(name, tag);
}

// Normalização equivalente ao parser de URL dos navegadores, só que mais
// estrita: remove C0 controls (inclui \t \n \r) em qualquer posição e
// espaços/whitespace nas pontas, para que `java\tscript:` seja detectado.
function normalizeForSchemeCheck(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: remoção intencional de C0
  return value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/^\s+|\s+$/g, "");
}

function isAllowedSingleUrl(attr: string, value: string, tag?: string): boolean {
  // O valor inerte que a própria política emite (ex.: Link bloqueado) não é bloqueado de novo
  if (value === BLOCKED_URL) return true;
  const normalized = normalizeForSchemeCheck(value);
  const match = SCHEME.exec(normalized);
  if (!match) return true; // sem esquema: relativa (inclui //host, /x, ?q, #h)

  const scheme = (match[1] as string).toLowerCase();
  if (ALLOWED_SCHEMES.has(scheme)) return true;

  if (scheme === "data" && DATA_IMAGE.test(normalized)) {
    if (!IMAGE_ATTRIBUTES.has(attr)) return false;
    // Sem tag informada: falha fechado (não dá para provar que é uma imagem)
    return tag !== undefined && IMAGE_TAGS.has(tag.toLowerCase());
  }
  return false;
}

// Candidatos do srcset como no HTML: a URL é a sequência de não-espaços (pode
// conter vírgulas, como em data:); vírgula final da URL ou vírgula após os
// descritores encerra o candidato.
const SRCSET_CANDIDATE = /[\s,]*([^\s,]\S*?)(?:,+(?=\s|$)|\s+((?:[^,(]|\([^)]*\))*)(?=,|$)|$)/g;

function evaluateSrcset(value: string, tag?: string): { value: string; blocked: boolean } {
  let blocked = false;
  const parts: string[] = [];
  for (const m of value.matchAll(SRCSET_CANDIDATE)) {
    const url = m[1] as string;
    const desc = (m[2] ?? "").trim();
    const ok = isAllowedSingleUrl("srcset", url, tag);
    blocked ||= !ok;
    parts.push((ok ? url : BLOCKED_URL) + (desc ? ` ${desc}` : ""));
  }
  return blocked ? { value: parts.join(", "), blocked } : { value, blocked };
}

// SMIL: `values` é uma lista separada por ";"; `to`/`from` são valores únicos
function evaluateSmil(name: string, value: string, tag?: string): { value: string; blocked: boolean } {
  let blocked = false;
  const items = (name === "values" ? value.split(";") : [value]).map((item) => {
    if (isAllowedSingleUrl(name, item, tag)) return item;
    blocked = true;
    return BLOCKED_URL;
  });
  return blocked ? { value: items.join(";"), blocked } : { value, blocked };
}

/**
 * PURO: aplica a política sem efeitos colaterais.
 * `blocked` indica que o valor (ou parte dele) foi substituído por BLOCKED_URL.
 */
export function evaluateUrl(
  attr: string,
  value: string,
  tag?: string,
): { value: string; blocked: boolean } {
  const name = attr.toLowerCase();
  if (isSmil(name, tag)) return evaluateSmil(name, value, tag);
  if (!URL_ATTRIBUTES.has(name)) return { value, blocked: false };
  // `data` só é URL em <object>; em outras tags (ou data-*) é outro conceito
  if (name === "data" && tag !== undefined && tag.toLowerCase() !== "object") {
    return { value, blocked: false };
  }
  if (name === "srcset" || name === "imagesrcset") return evaluateSrcset(value, tag);
  if (isAllowedSingleUrl(name, value, tag)) return { value, blocked: false };
  return { value: BLOCKED_URL, blocked: true };
}

/** Aviso de dev padrão para um valor bloqueado (usado também por props-core) */
export function blockedUrlMessage(attr: string, value: string): string {
  return `URL bloqueada em ${attr}: ${JSON.stringify(value.slice(0, 40))}. Para URL confiável use unsafeUrl()`;
}

/**
 * Sanitiza o valor de um atributo de URL. Atributos que não são de URL passam
 * intactos. Valor rejeitado vira BLOCKED_URL e emite aviso em dev.
 *
 * @param attr - nome do atributo (case-insensitive)
 * @param value - valor já convertido para string
 * @param tag - tag do elemento (restringe data:image a img/source/video e `data` a object)
 */
export function sanitizeUrl(attr: string, value: string, tag?: string): string {
  const result = evaluateUrl(attr, value, tag);
  if (result.blocked && process.env.NODE_ENV !== "production") {
    securityWarn(blockedUrlMessage(attr, value), `url:${attr.toLowerCase()}`);
  }
  return result.value;
}
