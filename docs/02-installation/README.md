# Instalação e Setup

## Instalação via npm/bun

### Usando Bun (Recomendado)

```bash
bun add @_bashell/slash
```

### Usando npm

```bash
npm install @_bashell/slash
```

### Usando pnpm

```bash
pnpm add @_bashell/slash
```

### Usando yarn

```bash
yarn add @_bashell/slash
```

## Configuração TypeScript

Slash é **TypeScript-first** e requer TypeScript 5.0+. Configure seu [tsconfig.json](../../tsconfig.json:1) com as opções recomendadas:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["bun-types"]
  }
}
```

### Opções importantes

- `target: "ES2022"`: Slash utiliza features modernas do JavaScript
- `strict: true`: Type safety completo
- Sem opções de JSX: templates `html` são tagged templates comuns e não passam por transformação JSX
- `moduleResolution: "bundler"`: Recomendado para Bun e bundlers modernos

## Estrutura de Projeto Básica

### Client-Side Rendering (CSR)

Estrutura mínima para uma SPA:

```
my-slash-app/
├── src/
│   ├── main.ts          # Entry point
│   ├── App.ts           # Root component
│   └── components/
│       └── Counter.ts
├── index.html
├── package.json
└── tsconfig.json
```

#### index.html

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Slash App</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

#### src/main.ts

```typescript
import { html, render } from '@_bashell/slash/core'
import { App } from './App'

const root = document.getElementById('app')
if (root) {
  // Monte como componente (<${App} />) para que ele re-renderize quando o state mudar
  render(html`<${App} />`, root)
}
```

#### src/App.ts

```typescript
import { html } from '@_bashell/slash/core'
import { Counter } from './components/Counter'

export const App = () => html`
  <div>
    <h1>Welcome to Slash!</h1>
    <${Counter} />
  </div>
`
```

#### src/components/Counter.ts

```typescript
import { html, createState } from '@_bashell/slash/core'

// O state fica fora do componente: ele é recriado a cada render se ficar dentro
const count = createState(0)

export const Counter = () => html`
  <div>
    <p>Count: ${count.get()}</p>
    <button onClick=${() => count.set(count.get() + 1)}>
      Increment
    </button>
  </div>
`
```

### Server-Side Rendering (SSR)

Estrutura para aplicação com SSR. O `App` compartilhado precisa usar `htmlString` no servidor e `html` no cliente (veja o template [slash-ssr](https://github.com/bashell-rrocha/slash-ssr)):

```
my-slash-ssr/
├── src/
│   ├── server.ts        # Server entry (Bun/Node)
│   ├── client.ts        # Client entry (hydration)
│   ├── App.ts           # Shared root component
│   └── components/
│       └── Counter.ts
├── public/
│   └── index.html
├── package.json
└── tsconfig.json
```

#### src/server.ts

```typescript
import { renderToString } from '@_bashell/slash/ssr'
import { App } from './App'

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    // renderToString recebe uma view (ou função) e devolve { html, state }
    const { html, state } = renderToString(() => App())

    return new Response(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>My SSR App</title>
      </head>
      <body>
        <div id="app">${html}</div>
        <script id="__SLASH_STATE__" type="application/json">${JSON.stringify(state)}</script>
        <script type="module" src="/client.js"></script>
      </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    })
  }
})

console.log(`Server running at http://localhost:${server.port}`)
```

#### src/client.ts

```typescript
import { html, render } from '@_bashell/slash/core'
import { App } from './App'

const root = document.getElementById('app')
if (root) {
  // Com conteúdo no #app e o script __SLASH_STATE__, render() hidrata o DOM do servidor
  render(html`<${App} />`, root)
}
```

## Templates de Projeto

Slash fornece templates prontos para uso:

### Template SPA (slash-spa)

```bash
# Clone o template
git clone https://github.com/bashell-rrocha/slash-spa my-app
cd my-app

# Instale dependências
bun install

# Execute em desenvolvimento
bun run dev

# Build para produção
bun run build
```

**Localização no monorepo:** [packages/slash-spa](../../../slash-spa/README.md)

### Template SSR (slash-ssr)

```bash
# Clone o template
git clone https://github.com/bashell-rrocha/slash-ssr my-ssr-app
cd my-ssr-app

# Instale dependências
bun install

# Execute servidor de desenvolvimento
bun run dev

# Build e serve em produção
bun run build
bun run start
```

**Localização no monorepo:** [packages/slash-ssr](../../../slash-ssr/README.md)

### Template SSG (slash-ssg)

Geração de site estático: [github.com/bashell-rrocha/slash-ssg](https://github.com/bashell-rrocha/slash-ssg).

**Localização no monorepo:** [packages/slash-ssg](../../../slash-ssg/README.md)

## Build Setup

### Com Bun (Recomendado)

Bun tem suporte nativo para Slash através do export `"bun"` no package.json:

```json
{
  "exports": {
    ".": {
      "bun": "./src/index.ts",
      "import": "./dist/index.mjs"
    }
  }
}
```

Quando usar Bun como runtime, o source TypeScript é carregado diretamente sem build.

### Com Vite

```bash
bun add -D vite
```

Slash não precisa de transformação JSX, então o Vite funciona sem plugins:

```typescript
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  build: { target: 'es2022' }
})
```

### Com esbuild

```bash
bun add -D esbuild
```

```javascript
// build.js
import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'dist/bundle.js',
  format: 'esm',
  target: 'es2022'
})
```

## Verificação da Instalação

Crie um arquivo de teste para verificar se tudo está funcionando:

```typescript
// test.ts
import { createState } from '@_bashell/slash/core'
import { htmlString } from '@_bashell/slash/ssr'

console.log('✅ Imports OK')

const state = createState(42)
console.log('✅ State created:', state.get())

// htmlString não precisa de DOM; no navegador use `html` de '@_bashell/slash/core'
const markup = htmlString`<div>Hello Slash!</div>`
console.log('✅ HTM working:', markup)
```

Execute:

```bash
bun run test.ts
```

Saída esperada:
```
✅ Imports OK
✅ State created: 42
✅ HTM working: <div>Hello Slash!</div>
```

## Troubleshooting

### Erro: Cannot find module '@_bashell/slash'

**Solução:** Verifique se a instalação foi concluída:
```bash
bun install
```

### Erro: TypeScript não reconhece tipos

**Solução:** Adicione `"types": ["bun-types"]` no tsconfig.json e rode:
```bash
bun install @types/bun --dev
```

### Erro: htm template not working

**Solução:** Certifique-se de importar `html` de `@_bashell/slash/core`:
```typescript
import { html } from '@_bashell/slash/core'
```

### Performance ruim em desenvolvimento

**Solução:** Use Bun para desenvolvimento (carrega TypeScript diretamente):
```bash
bun run src/main.ts
```

## Próximos Passos

Agora que seu ambiente está configurado, aprenda a:

1. [Renderização Básica](../03-rendering/README.md) - Criar e renderizar elementos
2. [Sistema de Estado](../04-state/README.md) - Gerenciar estado reativo
3. Componentes (capítulo ainda não escrito) - Construir componentes reutilizáveis
