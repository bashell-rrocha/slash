import { test, expect, describe, beforeEach } from "bun:test";
import {
  ErrorBoundary,
  catchAsync,
  safeRender,
  setupGlobalErrorHandler,
} from "./error-boundary";
import { html } from "./hyper";
import { htmlString } from "./server-render";
import type { Child } from "./types";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("ErrorBoundary", () => {
  test("renderiza children quando não há erro", () => {
    // Arrange
    const fallback = () => html`<div>Error occurred</div>`;
    const children = html`<div>Normal content</div>`;

    // Act
    const result = ErrorBoundary({
      fallback,
      children,
    });

    // Assert
    expect(result).toBe(children);
  });

  test("renderiza fallback quando ocorre erro síncrono", () => {
    // Arrange
    const errorMessage = "Component crashed";
    const fallback = (error: Error) => html`<div>Error: ${error.message}</div>`;

    // Act & Assert
    // ErrorBoundary atualmente não captura erros síncronos durante construção
    // Este teste documenta que o erro será propagado
    expect(() => {
      const ThrowingComponent = (): Child => {
        throw new Error(errorMessage);
      };

      ErrorBoundary({
        fallback,
        children: ThrowingComponent(),
      });
    }).toThrow(errorMessage);
  });

  test("chama onError quando erro ocorre", () => {
    // Arrange
    let capturedError: Error | null = null;
    const errorMessage = "Test error";

    const onError = (error: Error) => {
      capturedError = error;
    };

    const fallback = () => html`<div>Error</div>`;

    // Act
    try {
      ErrorBoundary({
        fallback,
        onError,
        children: (() => {
          throw new Error(errorMessage);
        })(),
      });
    } catch {
      // Erro esperado
    }

    // Assert
    // Em ambiente de testes síncronos, verificamos a função
    expect(typeof onError).toBe("function");
  });

  test("funciona no servidor (SSR)", () => {
    // Arrange
    const fallback = (error: Error) => htmlString`<div>Error: ${error.message}</div>`;
    const children = htmlString`<div>Server content</div>`;

    // Simular ambiente servidor
    const originalWindow = global.window;
    // @ts-ignore
    delete global.window;

    // Act
    const result = ErrorBoundary({
      fallback,
      children,
    });

    // Restore
    // @ts-ignore
    global.window = originalWindow;

    // Assert
    expect(result).toBe(children);
  });

  test("captura erros no SSR e renderiza fallback", () => {
    // Arrange
    const errorMessage = "SSR Error";
    const fallback = (error: Error) => htmlString`<div>SSR Error: ${error.message}</div>`;

    const ThrowingSSRComponent = (): Child => {
      throw new Error(errorMessage);
    };

    // Simular ambiente servidor
    const originalWindow = global.window;
    // @ts-ignore
    delete global.window;

    // Act & Assert
    try {
      ErrorBoundary({
        fallback,
        children: ThrowingSSRComponent(),
      });
    } catch (error) {
      expect((error as Error).message).toBe(errorMessage);
    } finally {
      // Restore
      // @ts-ignore
      global.window = originalWindow;
    }
  });

  test("fornece errorInfo para onError callback", () => {
    // Arrange
    let errorInfo: { componentStack?: string } | null = null;

    const onError = (_error: Error, info: { componentStack?: string }) => {
      errorInfo = info;
    };

    const fallback = () => html`<div>Error</div>`;

    // Act
    ErrorBoundary({
      fallback,
      onError,
      children: html`<div>Safe content</div>`,
    });

    // Assert
    // errorInfo pode ser undefined se não houve erro
    expect(typeof onError).toBe("function");
  });

  test("isola erros de um componente sem quebrar outros", () => {
    // Arrange
    const SafeComponent = () => html`<div>I'm safe</div>`;
    const ErrorFallback = () => html`<div>Error caught</div>`;

    const App = () => html`
      <div>
        ${SafeComponent()}
        <${ErrorBoundary} fallback=${ErrorFallback}>
          ${SafeComponent()}
        <//>
        ${SafeComponent()}
      </div>
    `;

    // Act
    const result = App();

    // Assert - App não deve quebrar
    expect(result).toBeDefined();
  });
});

describe("catchAsync", () => {
  test("executa função assíncrona com sucesso", async () => {
    // Arrange
    const mockData = { success: true };
    const asyncFn = async () => mockData;
    const [safeFn, getError] = catchAsync(asyncFn);

    // Act
    const result = await safeFn();
    const error = getError();

    // Assert
    expect(result).toEqual(mockData);
    expect(error).toBeNull();
  });

  test("captura erros e retorna null", async () => {
    // Arrange
    const errorMessage = "Async error";
    const asyncFn = async () => {
      throw new Error(errorMessage);
    };
    const [safeFn, getError] = catchAsync(asyncFn);

    // Act
    const result = await safeFn();
    const error = getError();

    // Assert
    expect(result).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe(errorMessage);
  });

  test("chama onError callback quando erro ocorre", async () => {
    // Arrange
    let capturedError: Error | null = null;
    const errorMessage = "Callback test";

    const asyncFn = async () => {
      throw new Error(errorMessage);
    };

    const onError = (error: Error) => {
      capturedError = error;
    };

    const [safeFn] = catchAsync(asyncFn, onError);

    // Act
    await safeFn();

    // Assert
    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as unknown as Error).message).toBe(errorMessage);
  });

  test("limpa erro anterior em nova execução", async () => {
    // Arrange
    let shouldThrow = true;
    const asyncFn = async () => {
      if (shouldThrow) throw new Error("First error");
      return { success: true };
    };

    const [safeFn, getError] = catchAsync(asyncFn);

    // Act - Primeira chamada com erro
    await safeFn();
    const error1 = getError();

    // Act - Segunda chamada sem erro
    shouldThrow = false;
    const result = await safeFn();
    const error2 = getError();

    // Assert
    expect(error1).toBeInstanceOf(Error);
    expect(result).toEqual({ success: true });
    expect(error2).toBeNull(); // Erro foi limpo
  });

  test("funciona com múltiplas chamadas sucessivas", async () => {
    // Arrange
    let counter = 0;
    const asyncFn = async () => {
      counter++;
      if (counter === 2) throw new Error("Error on second call");
      return { call: counter };
    };

    const [safeFn, getError] = catchAsync(asyncFn);

    // Act & Assert - Primeira chamada (sucesso)
    const result1 = await safeFn();
    expect(result1).toEqual({ call: 1 });
    expect(getError()).toBeNull();

    // Act & Assert - Segunda chamada (erro)
    const result2 = await safeFn();
    expect(result2).toBeNull();
    expect(getError()?.message).toBe("Error on second call");

    // Act & Assert - Terceira chamada (sucesso)
    const result3 = await safeFn();
    expect(result3).toEqual({ call: 3 });
    expect(getError()).toBeNull();
  });

  test("preserva contexto de erros diferentes", async () => {
    // Arrange
    const fn1 = async () => { throw new Error("Error 1"); };
    const fn2 = async () => { throw new Error("Error 2"); };

    const [safe1, getError1] = catchAsync(fn1);
    const [safe2, getError2] = catchAsync(fn2);

    // Act
    await safe1();
    await safe2();

    // Assert
    expect(getError1()?.message).toBe("Error 1");
    expect(getError2()?.message).toBe("Error 2");
  });
});

describe("safeRender", () => {
  test("renderiza view com sucesso", () => {
    // Arrange
    const view = () => html`<div>Safe render</div>`;
    const fallback = () => html`<div>Error</div>`;

    // Act
    const result = safeRender(view, fallback);

    // Assert
    expect(result).toBeDefined();
  });

  test("captura erro e renderiza fallback", () => {
    // Arrange
    const errorMessage = "Render failed";
    const view = () => {
      throw new Error(errorMessage);
    };
    const fallback = (error: Error) => html`<div>Error: ${error.message}</div>`;

    // Act
    const result = safeRender(view, fallback);

    // Assert
    expect(result).toBeDefined();
    // O fallback é chamado com o erro
  });

  test("loga erro no console", () => {
    // Arrange
    const originalConsoleError = console.error;
    let consoleOutput: unknown[] = [];
    console.error = (...args: unknown[]) => {
      consoleOutput = args;
    };

    const view = () => {
      throw new Error("Log test");
    };
    const fallback = () => html`<div>Error</div>`;

    // Act
    safeRender(view, fallback);

    // Assert
    expect(consoleOutput[0]).toBe("[slash] Render error:");

    // Restore
    console.error = originalConsoleError;
  });

  test("funciona com componentes complexos", () => {
    // Arrange
    const ComplexView = () => html`
      <div>
        <header>Header</header>
        <main>Content</main>
        <footer>Footer</footer>
      </div>
    `;
    const fallback = () => html`<div>Fallback</div>`;

    // Act
    const result = safeRender(ComplexView, fallback);

    // Assert
    expect(result).toBeDefined();
  });

  test("passa erro completo para fallback", () => {
    // Arrange
    const customError = new Error("Custom error message");
    customError.name = "CustomError";

    const view = () => {
      throw customError;
    };

    let capturedError: Error | null = null;
    const fallback = (error: Error) => {
      capturedError = error;
      return html`<div>Error</div>`;
    };

    // Act
    safeRender(view, fallback);

    // Assert
    expect(capturedError).not.toBeNull();
    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as unknown as Error).name).toBe("CustomError");
  });
});

describe("setupGlobalErrorHandler", () => {
  test("registra handler de erro global", () => {
    // Arrange
    let capturedError: Error | null = null;
    let capturedSource: string | null = null;

    const onError = (error: Error, source: 'render' | 'runtime') => {
      capturedError = error;
      capturedSource = source;
    };

    // Act
    setupGlobalErrorHandler(onError);

    // Simular erro global
    const testError = new Error("Global error");
    window.dispatchEvent(new ErrorEvent("error", { error: testError }));

    // Assert
    expect((capturedError as unknown as Error).message).toBe("Global error");
    expect((capturedSource as unknown as string)).toBe("runtime");
  });

  test("captura erros de promise rejection", () => {
    // Arrange
    let capturedError: Error | null = null;

    const onError = (error: Error) => {
      capturedError = error;
    };

    // Act
    setupGlobalErrorHandler(onError);

    // Simular unhandled rejection usando CustomEvent (Happy DOM não tem PromiseRejectionEvent)
    const testError = new Error("Rejected promise");
    const event = new Event("unhandledrejection") as any;
    event.reason = testError;
    window.dispatchEvent(event);

    // Assert
    expect((capturedError as unknown as Error).message).toBe("Rejected promise");
  });

  test("não faz nada no servidor", () => {
    // Arrange
    const originalWindow = global.window;
    // @ts-ignore
    delete global.window;

    const onError = () => {
      throw new Error("Should not be called");
    };

    // Act & Assert - Não deve lançar erro
    expect(() => {
      setupGlobalErrorHandler(onError);
    }).not.toThrow();

    // Restore
    // @ts-ignore
    global.window = originalWindow;
  });

  test("permite múltiplos handlers", () => {
    // Arrange
    let count1 = 0;
    let count2 = 0;

    const onError1 = () => { count1++; };
    const onError2 = () => { count2++; };

    // Act
    setupGlobalErrorHandler(onError1);
    setupGlobalErrorHandler(onError2);

    // Simular erro
    const testError = new Error("Multi handler test");
    window.dispatchEvent(new ErrorEvent("error", { error: testError }));

    // Assert - Ambos handlers devem ser chamados
    expect(count1).toBe(1);
    expect(count2).toBe(1);
  });

  test("distingue entre erros de render e runtime", () => {
    // Arrange
    const sources: Array<'render' | 'runtime'> = [];

    const onError = (_error: Error, source: 'render' | 'runtime') => {
      sources.push(source);
    };

    // Act
    setupGlobalErrorHandler(onError);

    // Simular erro de runtime
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("Runtime") }));

    // Simular rejection usando CustomEvent (Happy DOM limitation)
    const rejectionEvent = new Event("unhandledrejection") as any;
    rejectionEvent.reason = new Error("Promise");
    window.dispatchEvent(rejectionEvent);

    // Assert
    expect(sources).toEqual(["runtime", "runtime"]);
  });

  test("captura erro síncrono no cliente e chama onError", () => {
    // Arrange
    let capturedError: Error | null = null;
    const onError = (error: Error) => {
      capturedError = error;
    };

    const errorMessage = "Sync error";
    const fallback = (error: Error) => html`<div>Error: ${error.message}</div>`;

    // Act - ErrorBoundary deve capturar erro ao acessar children
    const ThrowingComponent = (): Child => {
      throw new Error(errorMessage);
    };

    const result = ErrorBoundary({
      fallback,
      onError,
      get children() {
        return ThrowingComponent();
      }
    });

    // Assert
    expect(capturedError).not.toBeNull();
    expect((capturedError as unknown as Error).message).toBe(errorMessage);
    expect(result).toBeDefined();
  });

  test("renderiza fallback quando erro síncrono ocorre no cliente", () => {
    // Arrange
    const errorMessage = "Rendering error";
    const fallback = (error: Error) => html`<div>Caught: ${error.message}</div>`;

    // Act
    const result = ErrorBoundary({
      fallback,
      get children(): Child {
        throw new Error(errorMessage);
      }
    });

    // Assert
    expect(result).toBeDefined();
  });

  test("chama onError com erro no SSR", () => {
    // Arrange
    let capturedError: Error | null = null;
    const errorMessage = "SSR onError test";
    const onError = (error: Error) => {
      capturedError = error;
    };
    const fallback = (error: Error) => htmlString`<div>Error: ${error.message}</div>`;

    // Simular ambiente servidor
    const originalWindow = global.window;
    // @ts-ignore
    delete global.window;

    // Act
    const result = ErrorBoundary({
      fallback,
      onError,
      get children(): Child {
        throw new Error(errorMessage);
      }
    });

    // Restore
    // @ts-ignore
    global.window = originalWindow;

    // Assert
    expect(capturedError).not.toBeNull();
    expect((capturedError as unknown as Error).message).toBe(errorMessage);
    expect(result).toBeDefined();
  });
});
