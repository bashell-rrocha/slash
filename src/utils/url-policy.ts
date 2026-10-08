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

import { createDevMessage } from "../dev-warnings-core";
import { emitDevMessage } from "../dev-warnings";

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
]);

const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

// Atributos que carregam imagem (único lugar onde data:image/* é aceito)
const IMAGE_ATTRIBUTES = new Set(["src", "srcset", "poster"]);
const IMAGE_TAGS = new Set(["img", "source", "video", "image"]);

const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|avif)[;,]/i;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/** true se o atributo carrega uma URL (case-insensitive) */
export function isUrlAttribute(attr: string): boolean {
  return URL_ATTRIBUTES.has(attr.toLowerCase());
}

// Normalização equivalente ao parser de URL dos navegadores, só que mais
// estrita: remove C0 controls (inclui \t \n \r) em qualquer posição e
// espaços/whitespace nas pontas, para que `java\tscript:` seja detectado.
function normalizeForSchemeCheck(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: remoção intencional de C0
  return value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/^\s+|\s+$/g, "");
}

function isAllowedSingleUrl(attr: string, value: string, tag?: string): boolean {
  const normalized = normalizeForSchemeCheck(value);
  const match = SCHEME.exec(normalized);
  if (!match) return true; // sem esquema: relativa (inclui //host, /x, ?q, #h)

  const scheme = (match[1] as string).toLowerCase();
  if (ALLOWED_SCHEMES.has(scheme)) return true;

  if (scheme === "data" && DATA_IMAGE.test(normalized)) {
    if (!IMAGE_ATTRIBUTES.has(attr)) return false;
    return tag === undefined || IMAGE_TAGS.has(tag.toLowerCase());
  }
  return false;
}

type SrcsetCandidate = { url: string; descriptor: string };

// Parser de srcset no espírito da especificação do HTML: a URL é a sequência
// de não-espaços (pode conter vírgulas, como em data:), e vírgulas finais
// da URL encerram o candidato.
function parseSrcset(value: string): SrcsetCandidate[] {
  const out: SrcsetCandidate[] = [];
  const n = value.length;
  let i = 0;
  const isSpace = (c: string) => /\s/.test(c);

  while (i < n) {
    while (i < n && (isSpace(value[i] as string) || value[i] === ",")) i++;
    if (i >= n) break;

    let start = i;
    while (i < n && !isSpace(value[i] as string)) i++;
    let url = value.slice(start, i);

    let descriptor = "";
    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "");
    } else {
      start = i;
      let depth = 0;
      while (i < n) {
        const c = value[i] as string;
        if (c === "(") depth++;
        else if (c === ")") depth = Math.max(0, depth - 1);
        else if (c === "," && depth === 0) break;
        i++;
      }
      descriptor = value.slice(start, i).trim();
    }
    out.push({ url, descriptor });
  }
  return out;
}

function evaluateSrcset(value: string, tag?: string): { value: string; blocked: boolean } {
  const candidates = parseSrcset(value);
  let blocked = false;
  const rebuilt = candidates.map((c) => {
    if (isAllowedSingleUrl("srcset", c.url, tag)) return c;
    blocked = true;
    return { url: BLOCKED_URL, descriptor: c.descriptor };
  });
  if (!blocked) return { value, blocked: false };
  return {
    value: rebuilt.map((c) => (c.descriptor ? `${c.url} ${c.descriptor}` : c.url)).join(", "),
    blocked: true,
  };
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
  if (!URL_ATTRIBUTES.has(name)) return { value, blocked: false };
  // `data` só é URL em <object>; em outras tags (ou data-*) é outro conceito
  if (name === "data" && tag !== undefined && tag.toLowerCase() !== "object") {
    return { value, blocked: false };
  }
  if (name === "srcset") return evaluateSrcset(value, tag);
  if (isAllowedSingleUrl(name, value, tag)) return { value, blocked: false };
  return { value: BLOCKED_URL, blocked: true };
}

/** Mensagem de dev padrão para um valor bloqueado (usada também pela hidratação/props) */
export function warnBlockedUrl(attr: string, value: string): void {
  const shown = value.length > 60 ? `${value.slice(0, 60)}...` : value;
  emitDevMessage(
    createDevMessage(
      "warning",
      "API_MISUSE",
      `URL bloqueada em "${attr}": ${JSON.stringify(shown)}`,
      "Permitido: http(s), mailto, tel e URLs relativas. Para uma URL confiável use unsafeUrl(url).",
    ),
  );
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
  if (result.blocked) warnBlockedUrl(attr, value);
  return result.value;
}
