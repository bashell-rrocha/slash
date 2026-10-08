/**
 * security-warn.ts - Aviso de dev enxuto para a política de segurança
 *
 * Respeita setDevMode/setWarningsEnabled, mas evita arrastar o formatador
 * completo de dev-warnings para o bundle core (orçamento de tamanho).
 */

import { isDevMode, isWarningsEnabled } from "../dev-warnings";

/** Emite `console.warn` (somente em dev e com warnings habilitados) */
export function securityWarn(message: string): void {
  if (isDevMode() && isWarningsEnabled()) {
    console.warn(`[slash] ${message}`);
  }
}
