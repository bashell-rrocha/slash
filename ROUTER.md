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
await router.ready;               // navegação inicial concluída
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
- `state.query` é um objeto sem protótipo (`Object.create(null)`): não chame `state.query.hasOwnProperty(...)`; use `Object.hasOwn(state.query, "q")` ou `"q" in state.query`. Percent-encoding malformado é mantido como texto cru, sem lançar erro.
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

### Guards na URL inicial

No browser, a navegação inicial passa pelos mesmos guards (globais e da rota), redirects e fallback de `push`, com `replace` (não empilha histórico). `router.ready` é uma `Promise<void>` que resolve quando ela termina (já resolvida quando não há guard aplicável).

- **URL do browser** (`window.location`, ou `location.hash` em `mode: "hash"`): sem guard aplicável, a rota já está disponível logo após `createRouter`. Com guard, o estado inicial é `currentRoute: null, isNavigating: true` até a decisão, então nenhum conteúdo protegido é renderizado antes. Depois vem a rota, o destino do redirect ou, se o guard bloquear, `currentRoute: null`.
- **`initialPath` e estado do servidor (hidratação)**: a rota é aplicada de forma síncrona (sem flash, o markup do SSR é mantido) e os guards rodam em seguida. Se bloquearem, `currentRoute` vira `null`; se redirecionarem, o roteador segue o redirect.
- **`initialPath` explícito com guards no navegador**: a navegação inicial termina com `history.replace`, então a URL é reescrita para o caminho resolvido (o próprio `initialPath` ou o destino de um redirect).
- **SSR** (sem browser): o casamento continua síncrono e os guards não rodam (`renderToString` é síncrono). A autorização no servidor é responsabilidade do servidor.

Outros pontos:

- Um `push`/`replace` feito antes de `ready` prevalece: a navegação inicial pendente é descartada (e `ready` resolve mesmo assim). O mesmo vale para `push` concorrentes: vale o último.
- Cada navegação segue no máximo 10 redirects encadeados. Acima disso (por exemplo `/x` -> `/y` -> `/x`) o roteador registra `console.error`, define `currentRoute: null, isNavigating: false` e `ready` resolve.
- Quando um guard bloqueia a URL inicial, a URL continua na barra de endereço, mas `currentRoute` é `null`: renderize um estado vazio ou de erro nesse caso.
- Em `mode: "hash"` a rota inicial vem de `location.hash` (por exemplo `/#/sobre?x=1`); a query antes do `#` é ignorada.
- Para remover do DOM o container onde um `Router` está montado, use `destroyNode(container)` (de `@_bashell/slash/core`). Remover o nó só com o DOM mantém a assinatura do roteador ativa.

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

No servidor, `Router({ router })` funciona dentro de `htmlString`/`renderToString`: o HTML da rota é emitido de verdade (não escapado), entre marcadores `<!--reactive-start:id-->`, e não é gravado no estado serializado. Regra de confiança: no SSR, uma string (filho comum ou retornada por um reativo) que começa com `<` é tratada como HTML já renderizado e emitida como está, incluindo `${state.get()}` dentro de `htmlString`; nunca devolva de um reativo, componente ou `state.get()` texto vindo do usuário que comece com `<` como está. Dentro de `htmlString`, prefixe um espaço nas strings do usuário que possam começar com `<`: `const text = (v: string) => (v.startsWith("<") ? ` ${v}` : v)` (não escape antes: `htmlString` já escapa e haveria escape duplo); escape no estilo `escapeHtml` só em shells de template literal comuns.

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

**Interceptação global de links.** Com um roteador criado, o clique esquerdo (sem modificadores, `target` ou `download`) em qualquer `<a>` com `href` que não seja `#...` nem `http(s)` de outra origem recebe `preventDefault()` e `history.pushState` com o `href` cru. Links `javascript:` não executam no clique simples (o `pushState` lança), e links protocolo-relativos como `//outro.com` ficam sem efeito em vez de navegar; para links externos use URL absoluta `https://...` ou `target="_blank"`. Não há open redirect: a navegação só ocorre para rotas casadas.

O roteador não oferece lazy loading, data loaders, pré-carregamento, transições, `<Route>` declarativo nem curingas. Para carregar dados use `createLoader` do subpath `@_bashell/slash/ssr`.
