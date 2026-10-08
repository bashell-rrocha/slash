/**
 * Functional Core do rastreamento de dependências de componentes.
 *
 * Funções puras, sem side effects; a execução fica em element.ts.
 */

import type { State } from "../state";

/**
 * Diferença entre os states já observados e os lidos na renderização atual.
 * Pura e sem alocar conjuntos auxiliares: states presentes nos dois lados
 * não aparecem (mantêm o watcher).
 * @param previous States com watcher ativo (ex.: o Map de unwatchers)
 * @param next States lidos na renderização mais recente
 * @returns States a observar (`add`) e a deixar de observar (`remove`)
 */
export function diffTrackedStates(
  previous: ReadonlyMap<State<any>, unknown>,
  next: ReadonlySet<State<any>>
): { readonly add: ReadonlyArray<State<any>>; readonly remove: ReadonlyArray<State<any>> } {
  const add: State<any>[] = [];
  const remove: State<any>[] = [];
  for (const s of next) if (!previous.has(s)) add.push(s);
  for (const s of previous.keys()) if (!next.has(s)) remove.push(s);
  return { add, remove };
}
