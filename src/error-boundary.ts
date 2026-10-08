// src/error-boundary.ts
// Error Boundary para SSR e Client-Side

import { createState } from "./state";
import type { Child } from "./types";

export type ErrorBoundaryProps = {
  fallback: (error: Error) => Child;
  onError?: (error: Error, errorInfo: { componentStack?: string }) => void;
  children: Child;
};

type ErrorState = {
  error: Error | null;
  hasError: boolean;
};

/**
 * Error Boundary para capturar erros durante renderização
 * Funciona tanto no servidor quanto no cliente
 *
 * @example
 * ```ts
 * html`
 *   <${ErrorBoundary}
 *     fallback=${(error) => html`<div>Erro: ${error.message}</div>`}
 *     onError=${(error) => console.error(error)}
 *   >
 *     <${ProblematicComponent} />
 *   <//>
 * `
 * ```
 */
export function ErrorBoundary(props: ErrorBoundaryProps): Child {
  const errorState = createState<ErrorState>({
    error: null,
    hasError: false,
  });

  try {
    // No servidor, executar children diretamente
    if (typeof window === "undefined") {
      try {
        return props.children;
      } catch (error) {
        if (props.onError) {
          props.onError(error as Error, {});
        }
        return props.fallback(error as Error);
      }
    }

    // No cliente, usar signal para reatividade
    const state = errorState.get();
    if (state.hasError && state.error) {
      return props.fallback(state.error);
    }

    return props.children;
  } catch (error) {
    // Capturar erros síncronos
    const err = error as Error;

    if (props.onError) {
      props.onError(err, {});
    }

    errorState.set({
      error: err,
      hasError: true,
    });

    return props.fallback(err);
  }
}

/**
 * Wrapper para capturar erros assíncronos em componentes
 */
export function catchAsync<T>(
  fn: () => Promise<T>,
  onError?: (error: Error) => void,
): [() => Promise<T | null>, () => Error | null] {
  const errorSignal = createState<{ error: Error | null }>({ error: null });

  const safeFn = async (): Promise<T | null> => {
    try {
      errorSignal.set({ error: null });
      return await fn();
    } catch (err) {
      const error = err as Error;
      errorSignal.set({ error });

      if (onError) {
        onError(error);
      }

      return null;
    }
  };

  const getError = (): Error | null => errorSignal.get().error;

  return [safeFn, getError];
}

/**
 * Wrapper para renderização segura com error handling
 * Útil para SSR onde erros devem ser capturados sem quebrar o servidor
 */
export function safeRender(view: () => Child, fallback: (error: Error) => Child): Child {
  try {
    return view();
  } catch (error) {
    console.error("[slash] Render error:", error);
    return fallback(error as Error);
  }
}

/**
 * Error handler global para erros não capturados
 */
export function setupGlobalErrorHandler(
  onError: (error: Error, source: "render" | "runtime") => void,
): void {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    onError(event.error, "runtime");
  });

  window.addEventListener("unhandledrejection", (event) => {
    onError(event.reason, "runtime");
  });
}
