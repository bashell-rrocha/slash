# Slash Router

Roteador para Slash, disponível em `@_bashell/slash/router`. Ele é construído sobre `createState`: o próprio roteador é um estado (`get`, `set`, `watch`) que guarda a rota atual.

## Instalação

O roteador já vem no pacote principal, em um subpath próprio:

```typescript
import { createRouter, Router, Link } from "@_bashell/slash/router";
```

Exports do subpath `@_bashell/slash/router`:

- `createRouter`, `Router`, `Link`
- utilitários: `sanitizePath`, `parseQuery`, `buildPath`
- funções puras de navegação: `computeNavigation`, `parseNavigationPath`, `findRouteMatch`
- adaptadores de ambiente: `createBrowserAdapter`, `createMockAdapter`, `detectInitialPath`
- tipos: `RouteConfig`, `RouteMatch`, `RouterConfig`, `RouterInstance`, `RouterState`, `RouterMode`, `RouteParams`, `RouteQuery`, `RouteMeta`, `RouteComponent`, `NavigationGuard`, `EnvironmentAdapter`, `NavigationDecision`, `NavigationInput`

## Uso básico

```typescript
import { html, render } from "@_bashell/slash/core";
import { createRouter, Router, Link } from "@_bashell/slash/router";

const router = createRouter({
  routes: [
    { path: "/", component: () => html`<h1>Home</h1>` },
    { path: "/about", component: () => html`<h1>About</h1>` },
    { path: "/users/:id", component: (state) => html`<h1>User ${state.params.id}</h1>` },
    { path: "/404", component: () => html`<h1>Not found</h1>` },
  ],
  mode: "history",
  fallback: "/404",
});

function App() {
  return html`
    <div>
      <nav>
        <${Link} to="/" router=${router}>Home<//>
        <${Link} to="/about" router=${router}>About<//>
      </nav>
      <main><${Router} router=${router} /></main>
    </div>
  `;
}

render(html`<${App} />`, "#app");
```

## `createRouter(config)`

```typescript
type RouterConfig = {
  routes: RouteConfig[];
  mode?: "history" | "hash"; // padrão: "history"
  fallback?: string;         // caminho usado quando nenhuma rota casa
  guards?: NavigationGuard[]; // guards globais
  initialPath?: string;      // caminho inicial (SSR)
};

type RouteConfig = {
  path: string;                       // ex.: "/users/:id"
  component: (state: RouterState) => any;
  name?: string;
  meta?: Record<string, any>;
  guards?: NavigationGuard[];         // guards desta rota
  children?: RouteConfig[];           // rotas aninhadas (caminho do pai + caminho do filho)
};
```

O `component` de cada rota recebe o `RouterState` atual e retorna um template.

### Instância do roteador

`createRouter` retorna um `State<RouterState>` com métodos extras:

```typescript
router.get();      // { currentRoute, params, query, meta, isNavigating }
router.watch((state) => console.log(state.params));

await router.push("/users/7");    // navega e adiciona ao histórico
await router.replace("/about");   // navega sem adicionar ao histórico
router.back();
router.forward();
router.go(-2);
router.currentRoute();            // RouteMatch | null
```

## Componentes

### `Router`

`Router` renderiza o `component` da rota atual e se atualiza a cada navegação. Use-o como componente, `<${Router} router=${router} />`, em qualquer posição do template (dentro de um elemento, na raiz ou aninhado em outros componentes). A forma direta `${Router({ router })}` também continua válida.

### `Link`

```typescript
html`<${Link} to="/about" router=${router}>About<//>`;
```

Renderiza um `<a href="/about">` cujo clique é interceptado e chama `router.push("/about")`. Props extras (como `class`) são repassadas ao `<a>`.

## Parâmetros e query string

```typescript
{ path: "/users/:id/posts/:postId", component: (state) => html`${state.params.id} / ${state.params.postId}` }
```

- Segmentos que começam com `:` viram `state.params`.
- A query string vira `state.query`: `/search?q=slash&page=2` gera `{ q: "slash", page: "2" }`.
- As rotas são testadas na ordem em que foram declaradas e vence a primeira que casar; declare as mais específicas antes.
- Não existe curinga (`*`). Use `fallback` para o 404.

## Guards

Um guard recebe `(to, from)` e pode retornar:

- `void` ou `true`: permite a navegação;
- `false`: bloqueia;
- uma `string`: redireciona para esse caminho.

Guards podem ser assíncronos. Os globais (`config.guards`) rodam antes dos da rota (`route.guards`).

```typescript
import { html } from "@_bashell/slash/core";
import { createRouter, type NavigationGuard } from "@_bashell/slash/router";

const requireAuth: NavigationGuard = (to) => {
  return isLoggedIn() ? true : "/login";
};

createRouter({
  routes: [
    { path: "/login", component: () => html`<h1>Login</h1>` },
    { path: "/admin", component: () => html`<h1>Admin</h1>`, guards: [requireAuth], meta: { title: "Admin" } },
  ],
});
```

## Rotas aninhadas

```typescript
{
  path: "/admin",
  component: () => html`<h1>Admin</h1>`,
  children: [
    { path: "/users", component: () => html`<h1>Admin users</h1>` }, // casa com /admin/users
  ],
}
```

## SSR

Passe `initialPath` para que o roteador resolva a rota de forma síncrona na criação (no servidor e na hidratação). No cliente, sem `initialPath`, ele usa `window.location`.

No servidor, `Router({ router })` funciona dentro de `htmlString`/`renderToString`: o HTML da rota é emitido de verdade (não escapado), entre marcadores `<!--reactive-start:id-->`, e não é gravado no estado serializado.

```typescript
import { Router, createRouter } from "@_bashell/slash/router";
import { htmlString, renderToString } from "@_bashell/slash/ssr";

const router = createRouter({
  routes: [{ path: "/", component: () => htmlString`<h1>Home</h1>` }],
  initialPath: "/",
});

const { html: markup } = renderToString(
  () => htmlString`<main>${Router({ router })}</main>`,
);
// markup: "<main><!--reactive-start:s0--><h1>Home</h1><!--reactive-end:s0--></main>"
```

Veja o [README](./README.md) para o fluxo completo de SSR e hidratação.

## Limitações conhecidas

O roteador não oferece lazy loading, data loaders, pré-carregamento, transições, `<Route>` declarativo nem curingas. Para carregar dados use `createLoader` do subpath `@_bashell/slash/ssr`.
