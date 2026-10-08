/**
 * security-warn.ts - Aviso de dev enxuto para a política de segurança
 *
 * Respeita setDevMode/setWarningsEnabled, mas evita arrastar o formatador
 * completo de dev-warnings para o bundle core (orçamento de tamanho).
 *
 * IMPORTANTE: quem chama deve montar a mensagem DENTRO de
 * `if (process.env.NODE_ENV !== "production")`, para que o bundle de produção
 * elimine os textos (dead-code elimination).
 */

import { isDevMode, isWarningsEnabled } from "../dev-warnings";

// Limite de chaves guardadas: as chaves podem vir de dados (nomes de prop em spread)
const MAX_KEYS = 200;
const seen = new Set<string>();

/**
 * Emite `console.warn` uma vez por chave (somente em dev e com warnings habilitados).
 * @param key - identifica o tipo de problema (padrão: a própria mensagem)
 */
export function securityWarn(message: string, key: string = message): void {
  if (!isDevMode() || !isWarningsEnabled()) return;
  if (seen.has(key)) return;
  if (seen.size >= MAX_KEYS) seen.clear();
  seen.add(key);
  console.warn(`[slash] ${message}`);
}

/** Zera a deduplicação (uso em testes) */
export function resetSecurityWarnings(): void {
  seen.clear();
}
