# Slash Router

Roteador completo e isomórfico para Slash, funcionando perfeitamente tanto em SPA quanto em SSR.

## Visão Geral

O Slash Router é um roteador declarativo e reativo que se integra perfeitamente com o sistema de estado reativo do Slash (`createState`). Ele suporta tanto renderização client-side (SPA) quanto server-side (SSR) com hidratação automática.

### Características Principais

- **Isomórfico**: Mesmo código funciona no cliente e servidor
- **Reativo**: Baseado em `createState` (inspirado em IARES) para atualizações automáticas
- **Type-safe**: Inferência automática de parâmetros de rota via template literal types
- **Lazy Loading**: Code splitting automático por rota
- **Data Loaders**: Carregamento assíncrono de dados com cache
- **Route Guards**: Proteção de rotas com redirecionamento
- **Nested Routes**: Suporte a layouts aninhados
- **Pre-fetching**: Pré-carregamento de rotas no hover
- **Transições**: Animações entre mudanças de rota
- **SSR Ready**: Serialização e hidratação automática

## Instalação

O router já vem incluído no pacote `slash`:

```typescript
import { Router, Route, Link } from "slash";
```

## Uso Básico

### API Declarativa (Recomendado)

```typescript
import { html, render } from "slash";
import { Router, Route, Link } from "slash";

function Home() {
  return html`<h1>Home Page</h1>`;
}

function About() {
  return html`<h1>About Page</h1>`;
}

function App() {
  return html`
    <${Router}>
      <nav>
        <${Link} to="/">Home</${Link}>
        <${Link} to="/about">About</${Link}>
      </nav>

      <main>
        <${Route} path="/" component=${Home} />
        <${Route} path="/about" component=${About} />
        <${Route} path="*" component=${NotFound} />
      </main>
    </${Router}>
  `;
}

render(() => App(), "#app");
```

### API Imperativa (Opcional)

Para melhor type safety e configuração compartilhada:

```typescript
import { createRouter } from "slash";

const routes = createRouter({
  "/": { component: Home },
  "/about": { component: About },
  "/users/:id": {
    component: User,
    loader: loadUser
  },
  "*": { component: NotFound }
});

function App() {
  return html`
    <${Router} config=${routes}>
      <nav>
        <${Link} to="/">Home</${Link}>
        <${Link} to="/about">About</${Link}>
      </nav>
      <main>${routes.outlet()}</main>
    </${Router}>
  `;
}
```

## Componentes

### `<Router>`

Componente principal que gerencia o estado de navegação.

```typescript
type RouterProps = {
  children?: Child | Child[];
  config?: RouterInstance<any>;
  location?: string; // SSR only
};
```

**Props:**
- `children`: Rotas declarativas ou conteúdo
- `config`: Configuração imperativa (opcional)
- `location`: URL para SSR (ex: `req.url`)

**Exemplo:**

```typescript
// Cliente
html`
  <${Router}>
    <${Route} path="/" component=${Home} />
  </${Router}>
`

// Servidor
html`
  <${Router} location=${req.url}>
    <${Route} path="/" component=${Home} />
  </${Router}>
`
```

### `<Route>`

Define uma rota e seu componente correspondente.

```typescript
type RouteProps<Path extends string> = {
  path: Path;
  component?: Component;
  loader?: RouteLoader<ParseParams<Path>>;
  guard?: RouteGuard<ParseParams<Path>>;
  transition?: Transition;
  children?: Child | Child[];
};
```

**Props:**
- `path`: Pattern da rota (ex: `/users/:id`)
- `component`: Componente a renderizar
- `loader`: Função para carregar dados (opcional)
- `guard`: Proteção de rota (opcional)
- `transition`: Configuração de transição (opcional)
- `children`: Nested routes (opcional)

**Exemplo:**

```typescript
// Rota simples
<${Route} path="/about" component=${About} />

// Com parâmetros
<${Route} path="/users/:id" component=${User} />

// Com loader
<${Route}
  path="/users/:id"
  component=${User}
  loader=${async ({ id }) => fetchUser(id)}
/>

// Com guard
<${Route}
  path="/dashboard"
  component=${Dashboard}
  guard=${requireAuth}
/>

// Nested routes
<${Route} path="/dashboard" component=${DashboardLayout}>
  <${Route} path="/" component=${Overview} />
  <${Route} path="/settings" component=${Settings} />
</${Route}>
```

### `<Link>`

Componente de navegação que intercepta clicks para navegação SPA.

```typescript
type LinkProps = {
  to: string;
  children: Child | Child[];
  activeClass?: string;
  prefetch?: boolean;
};
```

**Props:**
- `to`: URL de destino
- `children`: Conteúdo do link
- `activeClass`: Classe CSS quando rota ativa (padrão: `"active"`)
- `prefetch`: Habilitar pre-fetching (padrão: `true`)

**Exemplo:**

```typescript
<${Link} to="/about">About</${Link}>

// Com classe ativa customizada
<${Link} to="/home" activeClass="current">Home</${Link}>

// Sem pre-fetching
<${Link} to="/heavy" prefetch=${false}>Heavy Page</${Link}>
```

## Recursos Avançados

### Parâmetros de Rota

Parâmetros são automaticamente extraídos e passados como props:

```typescript
function User(props: { id: string }) {
  return html`<h1>User ${props.id}</h1>`;
}

html`
  <${Route} path="/users/:id" component=${User} />
`

// Navegando para /users/123
// User recebe props = { id: "123" }
```

**Type Safety:**

```typescript
// TypeScript infere automaticamente os params
<${Route}<"/users/:id/:tab">
  path="/users/:id/:tab"
  loader=${async (params) => {
    // params é tipado como { id: string; tab: string }
    return fetchUser(params.id, params.tab);
  }}
/>
```

### Query Strings

Query strings são parseadas e disponibilizadas via objeto `router` global:

```typescript
import { router } from "slash/router";

// URL: /search?q=termo&page=2
function Search() {
  // Propriedade reativa - re-renderiza automaticamente quando muda
  const query = router.query;

  return html`
    <h1>Buscando por: ${query.get("q")}</h1>
    <p>Página: ${query.get("page")}</p>
  `;
}
```

### Data Loaders

Loaders permitem carregar dados antes de renderizar:

```typescript
async function loadUser({ id }: { id: string }) {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
}

function User(props: { id: string }) {
  const user = useLoader(loadUser, { id: props.id });

  return computed(() => {
    const { loading, data, error } = user.get();

    if (loading) return html`<div>Loading...</div>`;
    if (error) return html`<div>Error: ${error.message}</div>`;

    return html`<h1>${data.name}</h1>`;
  });
}

html`
  <${Route}
    path="/users/:id"
    component=${User}
    loader=${loadUser}
  />
`
```

**Cache:**
- Loaders são cacheados por 5 minutos
- Cache baseado em params + query
- Re-carrega automaticamente quando params mudam

### Route Guards

Guards protegem rotas e podem redirecionar:

```typescript
// Guard que retorna boolean
const requireAuth: RouteGuard = () => {
  const isAuth = authStore.get();
  return isAuth;
};

// Guard que redireciona
const requireAuth: RouteGuard = () => {
  const isAuth = authStore.get();
  return isAuth || "/login"; // Redireciona para /login se não autenticado
};

// Guard async
const requireRole: RouteGuard = async ({ id }) => {
  const user = await fetchUser(id);
  return user.role === "admin" || "/forbidden";
};

html`
  <${Route}
    path="/admin"
    component=${Admin}
    guard=${requireAuth}
  />
`
```

### Nested Routes

Rotas aninhadas permitem layouts compartilhados:

```typescript
function DashboardLayout({ outlet }: { outlet: Node }) {
  return html`
    <div class="dashboard">
      <aside>
        <${Link} to="/dashboard">Overview</${Link}>
        <${Link} to="/dashboard/settings">Settings</${Link}>
      </aside>
      <main>${outlet}</main>
    </div>
  `;
}

html`
  <${Router}>
    <${Route} path="/dashboard" component=${DashboardLayout}>
      <${Route} path="/" component=${Overview} />
      <${Route} path="/settings" component=${Settings} />
      <${Route} path="/users">
        <${Route} path="/" component=${UsersList} />
        <${Route} path="/:id" component=${UserDetail} />
      </${Route}>
    </${Route}>
  </${Router}>
`
```

**Paths combinados:**
- `/dashboard` → DashboardLayout + Overview
- `/dashboard/settings` → DashboardLayout + Settings
- `/dashboard/users` → DashboardLayout + UsersList
- `/dashboard/users/123` → DashboardLayout + UserDetail

### Lazy Loading

Componentes podem ser carregados sob demanda:

```typescript
import { lazy } from "slash";

const HeavyPage = lazy(() => import("./pages/Heavy"));

html`
  <${Route} path="/heavy" component=${HeavyPage} />
`
```

**Features:**
- Code splitting automático
- Loading state enquanto carrega
- Componente cacheado após primeira carga
- Funciona em SSR (pré-renderiza no servidor)

### Pre-fetching

Links pré-carregam rotas no hover:

```typescript
// Habilitado por padrão
<${Link} to="/about">About</${Link}>

// Desabilitar
<${Link} to="/heavy" prefetch=${false}>Heavy</${Link}>

// Prefetch programático
import { prefetch } from "slash";

prefetch("/about"); // Pré-carrega componente e loader
```

**Benefícios:**
- Navegação instantânea
- Loaders executados antes do click
- Componentes lazy carregados antecipadamente

### Transições

Animações entre mudanças de rota:

```typescript
html`
  <${Route}
    path="/about"
    component=${About}
    transition=${{
      enter: "fade-in",
      exit: "fade-out",
      duration: 300
    }}
  />
`
```

**CSS correspondente:**

```css
.fade-in {
  animation: fadeIn 300ms ease-in;
}

.fade-out {
  animation: fadeOut 300ms ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
```

### Navegação Programática

Use o objeto `router` global para navegação:

```typescript
import { router } from "slash/router";

// Navegar para uma rota
router.navigate("/about");

// Com replace (não adiciona ao histórico)
router.replace("/login");

// Voltar
router.back();

// Avançar
router.forward();
```

### 404 / Not Found

Use wildcard `*` para capturar rotas não encontradas:

```typescript
function NotFound() {
  return html`
    <div>
      <h1>404 - Page Not Found</h1>
      <${Link} to="/">Go Home</${Link}>
    </div>
  `;
}

html`
  <${Router}>
    <${Route} path="/" component=${Home} />
    <${Route} path="/about" component=${About} />
    <${Route} path="*" component=${NotFound} />
  </${Router}>
`
```

**Importante:** Coloque a rota wildcard sempre por último.

## Server-Side Rendering (SSR)

### Configuração

**server.ts:**

```typescript
import { renderToString } from "slash";
import { App } from "./app";

async function serveIndex(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // Renderizar com location
  const { html: appHtml, state } = renderToString(() => App(), {
    location: url.pathname + url.search
  });

  let html = await getHtmlTemplate();
  html = html.replace(
    '<div id="app"></div>',
    `<div id="app">${appHtml}</div>`
  );

  // Injetar estado
  const stateScript = `
    <script id="__SLASH_STATE__" type="application/json">
      ${JSON.stringify(state)}
    </script>`;

  html = html.replace("</body>", `${stateScript}\n</body>`);

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    // Servir todas as rotas SPA (exceto API e assets)
    if (!url.pathname.startsWith("/api") && !url.pathname.includes(".")) {
      return serveIndex(req);
    }

    // Arquivos estáticos...
  }
});
```

**app.ts (compartilhado):**

```typescript
import { html, htmlString } from "slash";
import { Router, Route } from "slash";

// Detectar ambiente
const isServer = typeof document === "undefined";
const template = isServer ? htmlString : html;

export function App() {
  return template`
    <${Router}>
      <${Route} path="/" component=${Home} />
      <${Route} path="/about" component=${About} />
    </${Router}>
  `;
}
```

**client.ts:**

```typescript
import { render } from "slash";
import { App } from "./app";

// Hidratação automática se tiver SSR
render(() => App(), "#app");
```

### Hidratação

O router hidrata automaticamente:

1. Servidor renderiza HTML com rota inicial
2. Estado da rota é serializado em `__ROUTER_STATE__`
3. Cliente restaura estado e conecta listeners
4. Navegação subsequente é client-side

**Sem configuração adicional necessária!**

## API de Configuração

### `createRouter()`

Cria uma instância de router com configuração imperativa:

```typescript
import { createRouter, lazy } from "slash";

const routes = createRouter({
  "/": {
    component: Home
  },
  "/about": {
    component: About,
    transition: { enter: "fade-in", exit: "fade-out", duration: 300 }
  },
  "/users/:id": {
    component: User,
    loader: async ({ id }) => fetchUser(id),
    guard: requireAuth
  },
  "/blog/:slug": {
    component: lazy(() => import("./pages/Blog")),
    loader: loadBlogPost
  },
  "*": {
    component: NotFound
  }
});

// Usar no app
function App() {
  return html`
    <${Router} config=${routes}>
      <nav>
        <${Link} to="/">Home</${Link}>
        <${Link} to="/about">About</${Link}>
      </nav>
      <main>${routes.outlet()}</main>
    </${Router}>
  `;
}
```

**Métodos da instância:**

```typescript
routes.outlet()              // Signal reativo que renderiza rota atual
routes.navigate(to, options) // Navegar programaticamente
routes.prefetch(path)        // Pré-carregar rota
routes.serialize()           // Serializar estado (SSR)
routes.hydrate(state)        // Restaurar estado (Cliente)
```

### API Global do Router

#### Objeto `router`

O estado do router é acessível globalmente via propriedades reativas:

```typescript
import { router } from "slash/router";

function MyComponent() {
  // Propriedades reativas - re-renderizam automaticamente
  const pathname = router.pathname;  // Reactive<string>
  const params = router.params;      // Reactive<Record<string, string>>
  const query = router.query;        // Reactive<URLSearchParams>

  return html`
    <div>
      <p>Path: ${pathname}</p>
      <p>User ID: ${params.id}</p>
      <p>Search: ${query.get("q")}</p>
    </div>
  `;
}
```

#### Acesso a parâmetros

```typescript
import { router } from "slash/router";

function User() {
  // Propriedade reativa com params
  const params = router.params;

  return html`<h1>User ${params.id}</h1>`;
}
```

#### Acesso a query strings

```typescript
import { router } from "slash/router";

function Search() {
  const query = router.query;

  return html`
    <p>Search: ${query.get("q")}, Page: ${query.get("page")}</p>
  `;
}
```

#### `useLoader()`

Usa um data loader:

```typescript
import { useLoader } from "slash";

function User(props: { id: string }) {
  const user = useLoader(fetchUser, { id: props.id }, {});

  return computed(() => {
    const { loading, data, error } = user.get();

    if (loading) return html`<div>Loading...</div>`;
    if (error) return html`<div>Error!</div>`;

    return html`<h1>${data.name}</h1>`;
  });
}
```

## Tipos TypeScript

### Template Literal Types

O router usa template literal types para inferir parâmetros:

```typescript
// Automaticamente infere { id: string }
<${Route}<"/users/:id">
  path="/users/:id"
  loader=${async (params) => {
    params.id // string ✓
  }}
/>

// Infere { id: string; tab: string }
<${Route}<"/users/:id/:tab">
  path="/users/:id/:tab"
  loader=${async (params) => {
    params.id  // string ✓
    params.tab // string ✓
  }}
/>
```

### Tipos Principais

```typescript
// Configuração de rota
type RouteConfig<Path extends string = string> = {
  path: Path;
  component: Component;
  loader?: RouteLoader<ParseParams<Path>>;
  guard?: RouteGuard<ParseParams<Path>>;
  transition?: Transition;
  children?: RouteConfig[];
};

// Loader
type RouteLoader<Params = {}> = (
  params: Params,
  query: Record<string, string>
) => unknown | Promise<unknown>;

// Guard
type RouteGuard<Params = {}> = (
  params: Params,
  query: Record<string, string>
) => boolean | Promise<boolean> | string | Promise<string>;

// Match de rota
type RouteMatch = {
  path: string;
  pathname: string;
  params: Record<string, string>;
  query: Record<string, string>;
  search: string;
};

// Transição
type Transition = {
  enter: string;
  exit: string;
  duration: number;
};
```

## Padrões e Boas Práticas

### Organização de Rotas

```typescript
// routes.ts - Configuração centralizada
import { createRouter, lazy } from "slash";

const Admin = lazy(() => import("./pages/Admin"));
const Dashboard = lazy(() => import("./pages/Dashboard"));

export const routes = createRouter({
  "/": { component: Home },
  "/about": { component: About },
  "/dashboard": {
    component: DashboardLayout,
    children: {
      "/": { component: Dashboard },
      "/admin": { component: Admin, guard: requireAdmin }
    }
  },
  "*": { component: NotFound }
});

// app.ts - Usa configuração
import { routes } from "./routes";

export function App() {
  return html`
    <${Router} config=${routes}>
      ${routes.outlet()}
    </${Router}>
  `;
}
```

### Code Splitting

```typescript
// ✓ Bom - Lazy loading
const Heavy = lazy(() => import("./Heavy"));
<${Route} path="/heavy" component=${Heavy} />

// ✗ Evitar - Import síncrono
import { Heavy } from "./Heavy";
<${Route} path="/heavy" component=${Heavy} />
```

### Guards Reutilizáveis

```typescript
// guards.ts
export const requireAuth: RouteGuard = () => {
  return authStore.get() || "/login";
};

export const requireRole = (role: string): RouteGuard => {
  return async () => {
    const user = await getCurrentUser();
    return user.role === role || "/forbidden";
  };
};

// uso
<${Route} path="/admin" component=${Admin} guard=${requireRole("admin")} />
```

### Loaders com Cache

```typescript
// loaders.ts
const userCache = new Map();

export async function loadUser({ id }: { id: string }) {
  if (userCache.has(id)) {
    return userCache.get(id);
  }

  const user = await fetchUser(id);
  userCache.set(id, user);
  return user;
}
```

## Performance

### Otimizações Automáticas

- **Code splitting**: Componentes lazy são separados automaticamente
- **Cache de loaders**: Dados são cacheados por 5 minutos
- **Pre-fetching**: Componentes pré-carregados no hover
- **Navegação otimizada**: Apenas componentes afetados re-renderizam

### Melhores Práticas

1. **Use lazy loading para rotas pesadas**
2. **Implemente loaders com cache eficiente**
3. **Pre-carregue rotas críticas programaticamente**
4. **Minimize nested routes (max 3 níveis)**
5. **Use memoization em componentes pesados**

## Migração de Outros Frameworks

### De React Router

```typescript
// React Router
<Routes>
  <Route path="/" element={<Home />} />
  <Route path="/users/:id" element={<User />} />
</Routes>

// Slash Router
html`
  <${Router}>
    <${Route} path="/" component=${Home} />
    <${Route} path="/users/:id" component=${User} />
  </${Router}>
`
```

**Diferenças:**
- `element` → `component`
- JSX → htm templates
- `useParams()` → `router.params`
- `useNavigate()` → `router.navigate()`

### De Vue Router

```typescript
// Vue Router
const routes = [
  { path: '/', component: Home },
  { path: '/users/:id', component: User }
]

// Slash Router
const routes = createRouter({
  "/": { component: Home },
  "/users/:id": { component: User }
});
```

## Troubleshooting

### Rotas não funcionam em produção

Certifique-se de que o servidor serve `index.html` para todas as rotas:

```typescript
// SPA: Servir index.html para rotas
if (!url.pathname.includes(".")) {
  return serveIndex();
}
```

### Hidratação SSR não funciona

Verifique se:
1. Estado está sendo serializado: `__SLASH_STATE__` presente no HTML
2. `location` prop está sendo passada no servidor
3. Servidor serve HTML correto para cada rota

### Type inference não funciona

Use generics explícitos:

```typescript
<${Route}<"/users/:id/:tab">
  path="/users/:id/:tab"
  loader=${...}
/>
```

### Performance ruim com muitas rotas

1. Use lazy loading
2. Implemente cache nos loaders
3. Reduza nested routes
4. Use `prefetch={false}` em links menos usados

## Exemplos Completos

Ver exemplos funcionais em:
- `packages/slash-spa/src/` - SPA básico
- `packages/slash-ssr/src/` - SSR com hidratação
- `examples/` - Casos de uso avançados

## Referências

- [React Router v7](https://reactrouter.com/)
- [Remix Patterns](https://remix.run/docs)
- [Modern Router Design (2026)](https://www.patterns.dev/react/react-2026/)
