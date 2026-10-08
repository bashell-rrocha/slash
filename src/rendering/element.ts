import { addCleanup, destroyNode } from "../lifecycle/cleanup";
import type { State } from "../state";
import type { Child, Elementish, Props } from "../types";
import { SVG_NS, SVG_TAGS } from "../utils/constants";
import { appendChildSmart } from "./children";
import { setProp } from "./props";
import {
  createStateTracker,
  startTracking,
  stopTracking,
  trackState,
  clearTrackedStates,
  hasTrackedStates,
  getTrackedStates,
  type StateTracker,
} from "./element-core";

export function h(tag: unknown, props: Props, ...children: Child[]): Node {
  // Componente (função) — pode retornar qualquer Child; empacotar se não for Node
  if (typeof tag === "function") {
    // Rastrear states acessados durante renderização usando Functional Core
    let tracker = createStateTracker();

    // Registrar função de rastreamento global
    const originalTracker = (globalThis as any).__SLASH_TRACK_STATE__;
    (globalThis as any).__SLASH_TRACK_STATE__ = (state: State<any>) => {
      tracker = trackState(tracker, state);
    };

    // Criar anchor para marcar posição do componente
    const anchor = document.createComment("component");

    // Marcador final: o intervalo anchor..end é o conteúdo do componente.
    // Acompanhar pelos marcadores (e não por um retrato dos nós) cobre nós
    // que filhos reativos inserem ou removem depois da renderização.
    const end = document.createComment("component:end");

    // Container que vai segurar anchor + conteúdo renderizado + end
    const wrapper = document.createDocumentFragment();
    wrapper.appendChild(anchor);
    wrapper.appendChild(end);

    // Destrói e remove tudo entre anchor e end
    const clearRange = () => {
      let n = anchor.nextSibling;
      while (n && n !== end) {
        const next = n.nextSibling;
        destroyNode(n);
        n.parentNode?.removeChild(n);
        n = next;
      }
    };

    // Lista de nodes renderizados (para cleanup)
    let renderedNodes: Node[] = [];

    // Lista de unwatchers (para cleanup)
    let unwatchers: Array<() => void> = [];

    // Função de renderização
    const render = () => {
      // Limpar nodes anteriores
      clearRange();
      renderedNodes = [];

      // Resetar tracking para nova renderização
      tracker = clearTrackedStates(tracker);
      tracker = startTracking(tracker);

      try {
        // Executar componente
        const out = (tag as (p: Record<string, unknown>) => Node | Child)({
          ...(props || {}),
          children,
        });

        // Parar tracking após execução
        tracker = stopTracking(tracker);

        // Renderizar resultado
        const frag = document.createDocumentFragment();
        if (out instanceof Node) {
          frag.appendChild(out);
        } else {
          appendChildSmart(frag, out as Child);
        }

        // Capturar nodes renderizados
        const newNodes = Array.from(frag.childNodes);
        renderedNodes = newNodes;

        // Inserir antes do marcador final
        const parent = end.parentNode;
        if (parent) {
          parent.insertBefore(frag, end);
        }
      } finally {
        // Parar tracking em caso de erro
        tracker = stopTracking(tracker);
      }
    };

    // Primeira renderização
    render();

    // Restaurar tracker original
    (globalThis as any).__SLASH_TRACK_STATE__ = originalTracker;

    // Se não há states acessados, retornar node diretamente (retrocompatibilidade)
    if (!hasTrackedStates(tracker)) {
      // Componente estático - retornar resultado direto se for Element
      if (
        renderedNodes.length === 1 &&
        (renderedNodes[0] instanceof HTMLElement || renderedNodes[0] instanceof SVGElement)
      ) {
        return renderedNodes[0];
      }
      // Múltiplos nodes ou não-Element - retornar fragment
      const frag = document.createDocumentFragment();
      for (const node of renderedNodes) {
        frag.appendChild(node);
      }
      return frag;
    }

    // Componente reativo - configurar sistema de re-renderização
    // (anchor, conteúdo e end já estão no wrapper)

    // Registrar watchers nos states acessados
    const trackedStates = getTrackedStates(tracker);
    for (const state of trackedStates) {
      const unwatch = state.watch(() => {
        if (anchor.parentNode) {
          // Apenas re-renderizar se ainda estiver no DOM
          render();
        }
      });
      unwatchers.push(unwatch);
    }

    // Cleanup ao remover do DOM
    addCleanup(anchor, () => {
      tracker = stopTracking(tracker);
      tracker = clearTrackedStates(tracker);
      // Chamar unwatchers
      for (const unwatch of unwatchers) {
        unwatch();
      }
      unwatchers = [];
      // Destruir nodes do intervalo (sem removê-los do DOM)
      let n = anchor.nextSibling;
      while (n && n !== end) {
        const next = n.nextSibling;
        destroyNode(n);
        n = next;
      }
      renderedNodes = [];
    });

    // Retornar wrapper (fragment com anchor + conteúdo)
    return wrapper as unknown as Node;
  }

  // Tag nativa
  const tagName = String(tag || "div");
  const el = (
    SVG_TAGS.has(tagName)
      ? document.createElementNS(SVG_NS, tagName)
      : document.createElement(tagName)
  ) as Elementish;

  // Para select, guardar value para aplicar depois
  let selectValue: unknown = undefined;
  const isSelect = tagName.toLowerCase() === "select";

  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (isSelect && k === "value") {
        selectValue = v;
      } else {
        setProp(el, k, v);
      }
    }
  }

  for (const ch of children) appendChildSmart(el, ch);

  // Aplicar value do select DEPOIS das options terem sido adicionadas
  if (isSelect && selectValue !== undefined) {
    setProp(el, "value", selectValue);
  }

  return el;
}
