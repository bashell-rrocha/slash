# Introdução e Conceitos Core

## O que é Slash?

Slash é uma biblioteca reativa moderna para construção de interfaces de usuário que elimina a necessidade de um Virtual DOM (VDOM). A biblioteca combina três paradigmas principais:

- **HTM** (Hyperscript Tagged Markup): Template strings para JSX-like syntax sem compilação
- **Hyperscript**: Criação programática de elementos DOM
- **Reactive Signals**: Sistema de reatividade baseado em signals para atualizações eficientes

### Por que Slash?

Diferente de bibliotecas tradicionais como React ou Vue, Slash não utiliza Virtual DOM para gerenciar atualizações da interface. Em vez disso, usa um sistema de **reactive signals** que atualiza apenas os elementos específicos do DOM que dependem do estado alterado.

**Vantagens:**
- Zero overhead de diffing do VDOM
- Atualizações DOM precisas e performáticas
- Bundle size reduzido
- Renderização server-side (SSR) nativa
- TypeScript first-class support
- API minimalista e intuitiva

## Filosofia: htm + hyperscript + reactive signals

### HTM (Hyperscript Tagged Markup)

Slash utiliza a biblioteca [htm](https://github.com/developit/htm) para permitir sintaxe JSX-like sem necessidade de transpilação:

```typescript
import { html } from '@_bashell/slash'

const element = html`
  <div class="container">
    <h1>Hello, Slash!</h1>
    <p>No build step required</p>
  </div>
`
```

### Hyperscript

Para quem prefere uma abordagem programática, a função `h()` está disponível:

```typescript
import { h } from '@_bashell/slash'

const element = h('div', { class: 'container' },
  h('h1', null, 'Hello, Slash!'),
  h('p', null, 'Programmatic approach')
)
```

### Reactive Signals

O coração do Slash é seu sistema de estado reativo baseado em signals:

```typescript
import { createState, html } from '@_bashell/slash'

const count = createState(0)

const Counter = () => html`
  <div>
    <p>Count: ${count}</p>
    <button onclick=${() => count.set(count.get() + 1)}>
      Increment
    </button>
  </div>
`
```

Quando `count.set()` é chamado, **apenas** os elementos DOM que dependem de `count` são atualizados - sem re-render completo do componente.

## Quando usar Slash?

### Casos de Uso Ideais

- **SPAs (Single Page Applications)**: Roteamento integrado e gerenciamento de estado
- **SSR Applications**: Suporte nativo para renderização server-side com hidratação
- **Progressive Enhancement**: Hidratação de HTML estático gerado no servidor
- **Aplicações com foco em performance**: Quando bundle size e velocidade são críticos
- **Projetos TypeScript**: Type safety completo em toda a API

### Quando considerar alternativas

- **Ecossistema massivo**: React tem mais bibliotecas e componentes prontos
- **Equipe familiarizada com outras libs**: Curva de aprendizado pode impactar produtividade inicial
- **Requisitos de compatibilidade**: Integração com bibliotecas que dependem de React/Vue

### Comparação rápida

| Característica | Slash | React | Vue | Solid |
|----------------|-------|-------|-----|-------|
| VDOM | ❌ | ✅ | ✅ | ❌ |
| Reactive Signals | ✅ | ❌ | ✅ (Composition API) | ✅ |
| SSR Nativo | ✅ | ✅ | ✅ | ✅ |
| JSX sem build | ✅ (htm) | ❌ | ❌ | ❌ |
| Bundle size | ~8KB | ~45KB | ~35KB | ~7KB |
| TypeScript | ✅ | ✅ | ✅ | ✅ |

## Requisitos Mínimos

### Runtime

- **Node.js**: 18+ (para SSR)
- **Bun**: 1.0+ (recomendado)
- **Browsers**: ES2022+ (Chrome 94+, Firefox 93+, Safari 15+)

### Dependências

Slash tem **apenas uma dependência**:
- `htm` (^3.1.1): Para template strings

### TypeScript

- TypeScript 5.0+
- Configuração recomendada: `strict: true`, `target: "ES2022"`

### Build Tools (opcional)

Slash funciona sem build step, mas pode ser usado com:
- Vite
- Bun build
- esbuild
- Webpack
- Rollup

## Arquitetura: FCIS (Functional Core, Imperative Shell)

Slash segue o padrão **Functional Core, Imperative Shell** para separar lógica pura de side effects:

### Functional Core

Módulos com sufixo `-core.ts` contêm **lógica pura**:
- Sem side effects
- Funções determinísticas
- Fácil de testar
- Facilita raciocínio sobre o código

Exemplo: [state-core.ts](../../src/state-core.ts:1)
```typescript
// Pure function - no side effects
export function deepClone<T>(value: T): T {
  // Implementação pura de clonagem
}

// Pure decision function
export function shouldNotifyWatchers<T>(
  oldValue: T,
  newValue: T
): boolean {
  return !deepEqual(oldValue, newValue)
}
```

### Imperative Shell

Módulos sem sufixo `-core` contêm **side effects**:
- Gerenciamento de estado
- DOM manipulation
- Event handling
- API calls

Exemplo: [state.ts](../../src/state.ts:1)
```typescript
// Imperative shell - manages side effects
export function createState<T>(
  initialValue: T,
  options?: StateOptions
): State<T> {
  let currentValue = initialValue
  const watchers = new Set<StateWatcher<T>>()

  return {
    get: () => currentValue,
    set: (newValue) => {
      // Side effect: notify watchers
      watchers.forEach(watcher => watcher(newValue))
    },
    watch: (callback) => {
      watchers.add(callback)
      return () => watchers.delete(callback)
    }
  }
}
```

### Benefícios do FCIS

1. **Testabilidade**: Functional cores são triviais de testar
2. **Manutenibilidade**: Lógica de negócio isolada de side effects
3. **Previsibilidade**: Funções puras são determinísticas
4. **Reutilização**: Cores podem ser usados em diferentes contextos

## Próximos Passos

Agora que você entende os conceitos fundamentais, explore:

1. [Instalação e Setup](../02-installation/README.md) - Como começar a usar Slash
2. [Renderização Básica](../03-rendering/README.md) - Aprenda a criar elementos e renderizar na página
3. [Sistema de Estado](../04-state/README.md) - Mergulhe fundo no state management reativo
