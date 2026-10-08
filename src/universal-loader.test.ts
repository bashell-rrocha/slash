import { test, expect, describe, beforeEach } from "bun:test";
import {
  createLoader,
  invalidateLoader,
  serializeLoaderData,
  deserializeLoaderData,
  hydrateLoaderCache,
  isServer,
} from "./universal-loader";

describe("isServer", () => {
  test("retorna false no ambiente de testes (cliente simulado)", () => {
    // Arrange & Act
    const result = isServer();

    // Assert
    expect(result).toBe(false);
  });
});

describe("createLoader", () => {
  beforeEach(() => {
    // Limpar cache antes de cada teste
    invalidateLoader();
  });

  test("executa loader e retorna dados", async () => {
    // Arrange
    const mockData = { id: 1, name: "Test User" };
    const loader = createLoader(
      async () => mockData,
      { key: "user" }
    );

    // Act
    const result = await loader({
      params: {},
      isServer: false,
    });

    // Assert
    expect(result).toEqual(mockData);
  });

  test("usa cache no cliente em chamadas subsequentes", async () => {
    // Arrange
    let callCount = 0;
    const loader = createLoader(
      async () => {
        callCount++;
        return { count: callCount };
      },
      { key: "counter", ttl: 60000 }
    );

    // Act - Primeira chamada
    const result1 = await loader({ params: {}, isServer: false });

    // Act - Segunda chamada (deve usar cache)
    const result2 = await loader({ params: {}, isServer: false });

    // Assert
    expect(callCount).toBe(1); // Executado apenas uma vez
    expect(result1).toEqual({ count: 1 });
    expect(result2).toEqual({ count: 1 }); // Mesmos dados do cache
  });

  test("não usa cache quando isServer é true", async () => {
    // Arrange
    let callCount = 0;
    const loader = createLoader(
      async () => {
        callCount++;
        return { count: callCount };
      },
      { key: "serverData", ttl: 60000 }
    );

    // Act - Primeira chamada no servidor
    const result1 = await loader({ params: {}, isServer: true });

    // Act - Segunda chamada no servidor
    const result2 = await loader({ params: {}, isServer: true });

    // Assert
    expect(callCount).toBe(2); // Executado duas vezes
    expect(result1).toEqual({ count: 1 });
    expect(result2).toEqual({ count: 2 }); // Novos dados
  });

  test("usa chaves diferentes para params diferentes", async () => {
    // Arrange
    const loader = createLoader(
      async ({ params }) => ({ userId: params.id }),
      { key: "user", ttl: 60000 }
    );

    // Act
    const result1 = await loader({ params: { id: "1" }, isServer: false });
    const result2 = await loader({ params: { id: "2" }, isServer: false });
    const result3 = await loader({ params: { id: "1" }, isServer: false });

    // Assert
    expect(result1).toEqual({ userId: "1" });
    expect(result2).toEqual({ userId: "2" });
    expect(result3).toEqual({ userId: "1" }); // Do cache
  });

  test("revalida dados quando revalidate é true", async () => {
    // Arrange
    let callCount = 0;
    const loader = createLoader(
      async () => {
        callCount++;
        return { count: callCount };
      },
      { key: "data", ttl: 60000 }
    );

    // Act - Primeira chamada (armazena em cache)
    await loader({ params: {}, isServer: false });

    // Act - Segunda chamada com revalidate
    const revalidatingLoader = createLoader(
      async () => {
        callCount++;
        return { count: callCount };
      },
      { key: "data", ttl: 60000, revalidate: true }
    );
    const result = await revalidatingLoader({ params: {}, isServer: false });

    // Assert
    expect(callCount).toBe(2); // Executado novamente
    expect(result).toEqual({ count: 2 });
  });

  test("respeita TTL do cache", async () => {
    // Arrange
    let callCount = 0;
    const loader = createLoader(
      async () => {
        callCount++;
        return { count: callCount };
      },
      { key: "shortTTL", ttl: 10 } // 10ms TTL
    );

    // Act - Primeira chamada
    await loader({ params: {}, isServer: false });

    // Act - Esperar TTL expirar
    await new Promise(resolve => setTimeout(resolve, 20));

    // Act - Segunda chamada após TTL
    const result = await loader({ params: {}, isServer: false });

    // Assert
    expect(callCount).toBe(2); // Cache expirou, executou novamente
    expect(result).toEqual({ count: 2 });
  });

  test("lida com erros corretamente", async () => {
    // Arrange
    const errorMessage = "API Error";
    const loader = createLoader(
      async () => {
        throw new Error(errorMessage);
      },
      { key: "errorLoader" }
    );

    // Act & Assert
    await expect(
      loader({ params: {}, isServer: false })
    ).rejects.toThrow(errorMessage);
  });

  test("funciona com dados assíncronos reais", async () => {
    // Arrange
    const loader = createLoader(
      async ({ params }) => {
        // Simular fetch
        await new Promise(resolve => setTimeout(resolve, 5));
        return { userId: params.id, fetched: true };
      },
      { key: "asyncUser", ttl: 1000 }
    );

    // Act
    const result = await loader({ params: { id: "123" }, isServer: false });

    // Assert
    expect(result).toEqual({ userId: "123", fetched: true });
  });
});

describe("invalidateLoader", () => {
  beforeEach(() => {
    invalidateLoader();
  });

  test("invalida cache de loader específico", async () => {
    // Arrange
    let userCallCount = 0;
    let postCallCount = 0;

    const userLoader = createLoader(
      async () => ({ count: ++userCallCount }),
      { key: "user", ttl: 60000 }
    );

    const postLoader = createLoader(
      async () => ({ count: ++postCallCount }),
      { key: "post", ttl: 60000 }
    );

    // Act - Carregar dados iniciais
    await userLoader({ params: {}, isServer: false });
    await postLoader({ params: {}, isServer: false });

    // Act - Invalidar apenas user
    invalidateLoader("user");

    // Act - Recarregar
    const userResult = await userLoader({ params: {}, isServer: false });
    const postResult = await postLoader({ params: {}, isServer: false });

    // Assert
    expect(userCallCount).toBe(2); // User foi recarregado
    expect(postCallCount).toBe(1); // Post usou cache
    expect(userResult).toEqual({ count: 2 });
    expect(postResult).toEqual({ count: 1 });
  });

  test("invalida todos os caches quando key não é fornecida", async () => {
    // Arrange
    let callCount1 = 0;
    let callCount2 = 0;

    const loader1 = createLoader(
      async () => ({ count: ++callCount1 }),
      { key: "loader1", ttl: 60000 }
    );

    const loader2 = createLoader(
      async () => ({ count: ++callCount2 }),
      { key: "loader2", ttl: 60000 }
    );

    // Act - Carregar dados
    await loader1({ params: {}, isServer: false });
    await loader2({ params: {}, isServer: false });

    // Act - Invalidar tudo
    invalidateLoader();

    // Act - Recarregar
    await loader1({ params: {}, isServer: false });
    await loader2({ params: {}, isServer: false });

    // Assert
    expect(callCount1).toBe(2);
    expect(callCount2).toBe(2);
  });

  test("invalida múltiplas entradas com mesma key mas params diferentes", async () => {
    // Arrange
    let callCount = 0;
    const loader = createLoader(
      async ({ params }) => ({ id: params.id, count: ++callCount }),
      { key: "user", ttl: 60000 }
    );

    // Act - Carregar vários usuários
    await loader({ params: { id: "1" }, isServer: false });
    await loader({ params: { id: "2" }, isServer: false });
    await loader({ params: { id: "3" }, isServer: false });

    expect(callCount).toBe(3);

    // Act - Invalidar todos os usuários
    invalidateLoader("user");

    // Act - Recarregar
    await loader({ params: { id: "1" }, isServer: false });
    await loader({ params: { id: "2" }, isServer: false });

    // Assert
    expect(callCount).toBe(5); // Todas as entradas foram invalidadas
  });
});

describe("serializeLoaderData / deserializeLoaderData", () => {
  test("serializa e deserializa dados corretamente", () => {
    // Arrange
    const data = {
      user: { id: 1, name: "João" },
      posts: [{ id: 1, title: "Post 1" }],
      count: 42,
    };

    // Act
    const serialized = serializeLoaderData(data);
    const deserialized = deserializeLoaderData(serialized);

    // Assert
    expect(typeof serialized).toBe("string");
    expect(deserialized).toEqual(data);
  });

  test("lida com dados vazios", () => {
    // Arrange
    const data = {};

    // Act
    const serialized = serializeLoaderData(data);
    const deserialized = deserializeLoaderData(serialized);

    // Assert
    expect(deserialized).toEqual({});
  });

  test("lida com JSON inválido gracefully", () => {
    // Arrange
    const invalidJson = "{ invalid json }";

    // Act
    const result = deserializeLoaderData(invalidJson);

    // Assert
    expect(result).toEqual({});
  });

  test("preserva tipos complexos", () => {
    // Arrange
    const data = {
      string: "hello",
      number: 123,
      boolean: true,
      null: null,
      array: [1, 2, 3],
      nested: { deep: { value: "test" } },
    };

    // Act
    const serialized = serializeLoaderData(data);
    const deserialized = deserializeLoaderData(serialized);

    // Assert
    expect(deserialized).toEqual(data);
  });
});

describe("hydrateLoaderCache", () => {
  beforeEach(() => {
    invalidateLoader();
  });

  test("injeta dados pré-carregados no cache", async () => {
    // Arrange
    const preloadedData = {
      'user:{"id":"123"}': { id: "123", name: "João Pré-carregado" },
    };

    let loaderCalled = false;
    const loader = createLoader(
      async () => {
        loaderCalled = true;
        return { id: "123", name: "Do Servidor" };
      },
      { key: "user", ttl: 60000 }
    );

    // Act - Hidratar cache
    hydrateLoaderCache(preloadedData);

    // Act - Usar loader (deve pegar do cache)
    const result = await loader({ params: { id: "123" }, isServer: false });

    // Assert
    expect(loaderCalled).toBe(false); // Não chamou o loader
    expect(result).toEqual({ id: "123", name: "João Pré-carregado" });
  });

  test("hidrata múltiplas entradas", async () => {
    // Arrange
    const preloadedData = {
      'user:{"id":"1"}': { id: "1", name: "User 1" },
      'user:{"id":"2"}': { id: "2", name: "User 2" },
      'post:{"id":"10"}': { id: "10", title: "Post 10" },
    };

    const userLoader = createLoader(
      async ({ params }) => ({ id: params.id, name: `Fallback ${params.id}` }),
      { key: "user", ttl: 60000 }
    );

    const postLoader = createLoader(
      async ({ params }) => ({ id: params.id, title: `Fallback ${params.id}` }),
      { key: "post", ttl: 60000 }
    );

    // Act
    hydrateLoaderCache(preloadedData);

    const user1 = await userLoader({ params: { id: "1" }, isServer: false });
    const user2 = await userLoader({ params: { id: "2" }, isServer: false });
    const post10 = await postLoader({ params: { id: "10" }, isServer: false });

    // Assert
    expect(user1).toEqual({ id: "1", name: "User 1" });
    expect(user2).toEqual({ id: "2", name: "User 2" });
    expect(post10).toEqual({ id: "10", title: "Post 10" });
  });

  test("dados hidratados usam TTL padrão de 5 minutos", async () => {
    // Arrange
    const preloadedData = {
      'temp:{}': { value: "cached" },
    };

    let callCount = 0;
    const loader = createLoader(
      async () => {
        callCount++;
        return { value: "fresh" };
      },
      { key: "temp", ttl: 60000 } // TTL do loader (não afeta dados hidratados)
    );

    // Act - Hidratar cache
    hydrateLoaderCache(preloadedData);

    // Act - Primeira chamada
    const result1 = await loader({ params: {}, isServer: false });

    // Assert - Usa cache hidratado (não chama loader)
    expect(result1).toEqual({ value: "cached" });
    expect(callCount).toBe(0);

    // Act - Segunda chamada imediatamente
    const result2 = await loader({ params: {}, isServer: false });

    // Assert - Cache ainda válido (DEFAULT_TTL = 5 minutos)
    expect(result2).toEqual({ value: "cached" });
    expect(callCount).toBe(0);
  });
});
