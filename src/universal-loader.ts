// src/universal-loader.ts
// Sistema de data fetching universal (isomórfico)

type LoaderContext = {
  params: Record<string, string>;
  request?: Request;
  isServer: boolean;
};

type LoaderFunction<T = unknown> = (ctx: LoaderContext) => T | Promise<T>;

type LoaderCache = Map<
  string,
  {
    data: unknown;
    timestamp: number;
    ttl: number;
  }
>;

// Cache global de loaders (client-side)
const loaderCache: LoaderCache = new Map();

// TTL padrão: 5 minutos
const DEFAULT_TTL = 5 * 60 * 1000;

export type LoaderOptions = {
  key: string;
  ttl?: number;
  revalidate?: boolean;
};

/**
 * Cria um loader universal que funciona em cliente e servidor
 *
 * @example
 * ```ts
 * const userLoader = createLoader(
 *   async ({ params }) => {
 *     const res = await fetch(`/api/users/${params.id}`);
 *     return res.json();
 *   },
 *   { key: 'user', ttl: 60000 }
 * );
 *
 * // No componente:
 * const user = await userLoader({ params: { id: '123' } });
 * ```
 */
export function createLoader<T>(fn: LoaderFunction<T>, options: LoaderOptions): LoaderFunction<T> {
  return async (ctx: LoaderContext): Promise<T> => {
    const { key, ttl = DEFAULT_TTL, revalidate = false } = options;

    // No servidor, sempre executar (sem cache)
    if (ctx.isServer) {
      return await fn(ctx);
    }

    // No cliente, verificar cache
    const cacheKey = `${key}:${JSON.stringify(ctx.params)}`;
    const cached = loaderCache.get(cacheKey);

    if (cached && !revalidate) {
      const age = Date.now() - cached.timestamp;
      if (age < cached.ttl) {
        return cached.data as T;
      }
    }

    // Executar loader
    const data = await fn(ctx);

    // Armazenar em cache
    loaderCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      ttl,
    });

    return data;
  };
}

/**
 * Limpa cache de um loader específico ou todos
 */
export function invalidateLoader(key?: string): void {
  if (key) {
    // Limpar apenas loaders com essa key
    for (const [cacheKey] of loaderCache) {
      if (cacheKey.startsWith(`${key}:`)) {
        loaderCache.delete(cacheKey);
      }
    }
  } else {
    // Limpar tudo
    loaderCache.clear();
  }
}

/**
 * Pré-carrega dados no servidor para hidratação
 */
export function serializeLoaderData(data: Record<string, unknown>): string {
  return JSON.stringify(data);
}

/**
 * Restaura dados de loaders no cliente
 */
export function deserializeLoaderData(serialized: string): Record<string, unknown> {
  try {
    return JSON.parse(serialized);
  } catch {
    return {};
  }
}

/**
 * Injeta dados de loaders no cache do cliente
 */
export function hydrateLoaderCache(data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    loaderCache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl: DEFAULT_TTL,
    });
  }
}

/**
 * Detecta se está executando no servidor
 */
export function isServer(): boolean {
  return typeof window === "undefined";
}
