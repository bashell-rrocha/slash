import { addCleanup, destroyNode } from "../lifecycle/cleanup";
import type { State } from "../state";
import type { Child } from "../types";
import { appendChildSmart } from "./children";

type ComponentContext = {
  accessedStates: Set<State<any>>;
  isTracking: boolean;
};

const currentContext: ComponentContext | null = null;
let activeContext: ComponentContext | null = null;

/**
 * Registra acesso a um state durante renderização de componente
 */
export function trackStateAccess(state: State<any>): void {
  if (activeContext && activeContext.isTracking) {
    activeContext.accessedStates.add(state);
  }
}

/**
 * Wrapper para componentes que automaticamente rastreia states acessados
 * e re-renderiza quando qualquer state muda
 */
export function renderComponent(
  componentFn: () => Child,
  parent: Node | null = null
): Node {
  // Container para o conteúdo do componente
  const container = document.createDocumentFragment();
  const anchor = document.createComment("component");
  container.appendChild(anchor);

  // Context para rastrear states acessados
  const context: ComponentContext = {
    accessedStates: new Set(),
    isTracking: true,
  };

  // Função para renderizar o componente
  const render = () => {
    // Limpar conteúdo anterior (exceto anchor)
    let node = anchor.nextSibling;
    while (node) {
      const next = node.nextSibling;
      destroyNode(node);
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
      node = next;
    }

    // Resetar states rastreados para esta renderização
    context.accessedStates.clear();

    // Ativar rastreamento
    const prevContext = activeContext;
    activeContext = context;

    try {
      // Executar componente
      const result = componentFn();

      // Renderizar resultado após o anchor
      const frag = document.createDocumentFragment();
      appendChildSmart(frag, result);

      // Inserir após anchor
      if (anchor.parentNode) {
        anchor.parentNode.insertBefore(frag, anchor.nextSibling);
      }
    } finally {
      // Restaurar contexto anterior
      activeContext = prevContext;
    }
  };

  // Primeira renderização
  render();

  // Registrar watchers para todos os states acessados
  const watchers: Array<() => void> = [];

  for (const state of context.accessedStates) {
    state.watch(() => {
      // Re-renderizar quando state muda
      render();
    });
  }

  // Cleanup: remover watchers quando anchor for removido
  addCleanup(anchor, () => {
    for (const cleanup of watchers) {
      cleanup();
    }
    context.isTracking = false;
  });

  // Se parent foi fornecido, anexar
  if (parent) {
    parent.appendChild(container);
    return anchor;
  }

  return container as unknown as Node;
}

/**
 * Cria um State que notifica automaticamente o sistema de rastreamento
 */
export function createTrackedState<T>(initialState: T): State<T> & {
  _isTracked: boolean;
} {
  const state = {
    _state: JSON.parse(JSON.stringify(initialState)) as T,
    _watchers: new Set<(payload: T) => void>(),
    _isTracked: true,

    get(): T {
      // Notificar rastreamento de acesso
      trackStateAccess(state as any);
      return JSON.parse(JSON.stringify(state._state));
    },

    set(payload: T): void {
      Object.assign(state._state as object, JSON.parse(JSON.stringify(payload)));
      const current = JSON.parse(JSON.stringify(state._state));

      // Notificar todos os watchers
      for (const watcher of state._watchers) {
        watcher(current);
      }
    },

    watch(callback: (payload: T) => void): () => void {
      state._watchers.add(callback);
      return () => {
        state._watchers.delete(callback);
      };
    },
  };

  return state as State<T> & { _isTracked: boolean };
}
