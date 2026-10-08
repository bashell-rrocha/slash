# Plano de Migração: Signals → State (IARES-inspired)

## Referências

Este plano é baseado no padrão IARES (Immutable Automatic Reactive State):

- **Repositório:** https://github.com/vaziu/iares
- **Implementação de referência:** https://github.com/vaziu/iares/tree/main/src/state

IARES utiliza observer pattern puro com imutabilidade garantida, eliminando tracking automático de dependências e estado global.

## Objetivo

Substituir o sistema atual de `signals` por `createState`, inspirado no IARES:
- ✅ Sem hooks (zero tracking global, zero CURRENT)
- ✅ Extremamente simples (apenas set/get/watch)
- ✅ Fácil de testar (100% síncrono, sem microtasks)
- ✅ Auto-reatividade em componentes
- ✅ Watch manual opcional para side effects

## Status Atual

### Problemas com Signals

1. **Complexidade desnecessária**
   - Tracking global via `CURRENT: Computation | null`
   - Microtask scheduling para batching
   - Sistema de effects com cleanup complexo

2. **Difícil de testar**
   - Todos os testes precisam `await queueMicrotask()`
   - Timing issues imprevisíveis
   - 26 ocorrências de espera em testes

3. **Memory leaks**
   - `computed()` nunca limpa effect interno (linha 137 em signals.ts)
   - Array keying acumula em `primSeen` Map

4. **Estado global mutável**
   - `CURRENT` compartilhado causa problemas de isolamento
   - Effects aninhados podem corromper contexto

## Sistema Desejado

```typescript
// 1. Criar estado (simples, sem hooks)
const counter = createState({ count: 0 })

// 2. Auto-reatividade em componentes
html`<div>${counter.count}</div>` // ✅ Re-renderiza automaticamente

// 3. Watch manual (opcional, para side effects)
const unwatch = counter.watch(state => {
  console.log('Count mudou:', state.count)
})

// 4. Atualizar estado
counter.set({ count: 5 })
counter.set(prev => ({ count: prev.count + 1 }))

// 5. Cleanup
unwatch() // Desinscrever quando necessário
```

## Resumo da Estratégia

**Renomear (não manter nada de "signal"):**
- `SignalLike` → `Reactive` (tipo genérico para objetos reativos)
- `isSignalLike()` → `isReactive()` (duck typing: tem get() + subscribe())
- Comentários e documentação: "signal" → "reactive"

**Deletar completamente:**
- `src/signals.ts`
- `src/signals.test.ts`
- Tipos: `Signal`, `ReadonlySignal`, `SignalArray`, `ReadonlySignalArray`

**State implementa `Reactive<T>` automaticamente:**
```typescript
// State tem get() + subscribe() → é Reactive!
const state = createState({ count: 0 })
state.count // → Reactive<number> (propriedade)
state // → State<{ count: number }> & { count: Reactive<number> }
```

---

## Etapas de Implementação

### ⚠️ IMPORTANTE: Signals será completamente removido

Signals **NÃO** será deprecated, será **DELETADO**:
- `src/signals.ts` será removido
- `src/signals.test.ts` será removido
- Todos os tipos Signal/ReadonlySignal/etc serão removidos
- **`SignalLike` será renomeado para `Reactive`** (nome genérico, sem referência a signals)
- **`isSignalLike()` será renomeado para `isReactive()`** (duck typing para qualquer objeto reativo)

---

## 📋 Checklist de Progresso

- [ ] **Etapa 1:** Criar infraestrutura base (state.ts + state.test.ts)
- [ ] **Etapa 2:** Adicionar suporte a acesso direto via Proxy
- [ ] **Etapa 3:** Integração com hyper.ts
- [ ] **Etapa 4:** Exportar API e remover signals
- [ ] **Etapa 5:** Criar exemplos em slash-spa
- [ ] **Etapa 6:** Validar SSR em slash-ssr
- [ ] **Etapa 7:** Migrar testes e componentes
- [ ] **Etapa 8:** Documentação e cleanup final

---

### Etapa 1: Criar infraestrutura base

**Status:** ⬜ Não iniciado

**Tarefas:**
- [ ] Criar arquivo `src/state.ts` com implementação de `createState`
- [ ] Implementar função `deepClone` com fallback
- [ ] Criar arquivo `src/state.test.ts` com testes básicos
- [ ] Executar testes: `bun test src/state.test.ts`
- [ ] Verificar que todos os testes passam

**Implementação:**

```typescript
// src/state.ts
export type State<T> = {
  get(): T
  set(payload: T | ((prev: T) => T)): void
  watch(callback: (payload: T) => void): () => void
  subscribe(fn: (v: T) => void): () => void // Compatibilidade hyper.ts
}

export function createState<T>(initialState: T): State<T> {
  let state = deepClone(initialState)
  const watchers = new Set<(payload: T) => void>()

  return {
    set: (payload) => {
      const next = typeof payload === 'function'
        ? payload(state)
        : payload

      if (Object.is(next, state)) return

      state = deepClone(next)
      watchers.forEach(fn => fn(state))
    },

    get: () => deepClone(state),

    watch: (callback) => {
      watchers.add(callback)
      return () => watchers.delete(callback) // ✅ Cleanup function
    },

    subscribe: (fn) => {
      watchers.add(fn)
      return () => watchers.delete(fn) // ✅ Cleanup function
    }
  }
}

function deepClone<T>(obj: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(obj)
  }
  return JSON.parse(JSON.stringify(obj))
}
```

**Testes:**

```typescript
// src/state.test.ts
import { describe, test, expect } from 'bun:test'
import { createState } from './state'

describe('createState', () => {
  test('should create state with initial value', () => {
    const state = createState({ count: 0 })
    expect(state.get()).toEqual({ count: 0 })
  })

  test('should update state synchronously', () => {
    const state = createState({ count: 0 })
    state.set({ count: 5 })
    expect(state.get()).toEqual({ count: 5 }) // SÍNCRONO ✅
  })

  test('should notify watchers synchronously', () => {
    const state = createState({ count: 0 })
    let notified: number | undefined

    state.watch(s => { notified = s.count })
    state.set({ count: 10 })

    expect(notified).toBe(10) // SÍNCRONO ✅
  })

  test('should return cleanup function from watch', () => {
    const state = createState({ count: 0 })
    let callCount = 0

    const unwatch = state.watch(() => { callCount++ })

    state.set({ count: 1 })
    expect(callCount).toBe(1)

    unwatch() // Cleanup

    state.set({ count: 2 })
    expect(callCount).toBe(1) // Não foi notificado ✅
  })

  test('should support functional updates', () => {
    const state = createState({ count: 5 })
    state.set(prev => ({ count: prev.count + 1 }))
    expect(state.get().count).toBe(6)
  })

  test('should not notify if value is the same', () => {
    const state = createState({ count: 0 })
    let callCount = 0

    state.watch(() => { callCount++ })

    state.set({ count: 0 }) // Mesmo valor
    expect(callCount).toBe(0) // Não notificou ✅
  })
})
```

**Validação:**
```bash
cd packages/slash
bun test src/state.test.ts
```

---

### Etapa 2: Adicionar suporte a acesso direto via Proxy

**Status:** ⬜ Não iniciado

**Tarefas:**
- [ ] Modificar `createState` para retornar Proxy
- [ ] Implementar função `createDerivedProperty`
- [ ] Adicionar testes para acesso direto a propriedades
- [ ] Adicionar testes para nested properties
- [ ] Executar testes: `bun test src/state.test.ts`
- [ ] Verificar que acesso a propriedades funciona

**Objetivo:** `counter.count` em vez de `counter.get().count`

**Implementação:**

```typescript
// src/state.ts (adicionar)

export function createState<T extends object>(initialState: T): State<T> & T {
  let state = deepClone(initialState)
  const watchers = new Set<(payload: T) => void>()

  const stateObj = {
    set: (payload: T | ((prev: T) => T)) => {
      const next = typeof payload === 'function' ? payload(state) : payload
      if (Object.is(next, state)) return
      state = deepClone(next)
      watchers.forEach(fn => fn(state))
    },
    get: () => deepClone(state),
    watch: (callback: (payload: T) => void) => {
      watchers.add(callback)
      return () => watchers.delete(callback)
    },
    subscribe: (fn: (v: T) => void) => {
      watchers.add(fn)
      return () => watchers.delete(fn)
    }
  }

  // Proxy para acesso direto: counter.count
  return new Proxy(stateObj, {
    get(target, prop) {
      // Métodos do State
      if (prop in target) {
        return target[prop as keyof typeof target]
      }
      // Propriedades do estado - retorna ReadonlySignal
      if (prop in state) {
        return createDerivedProperty(target, prop as keyof T)
      }
      return undefined
    }
  }) as State<T> & T
}

// Cria um "signal" para cada propriedade acessada
function createDerivedProperty<T, K extends keyof T>(
  parent: { get(): T; subscribe(fn: (v: T) => void): () => void },
  key: K
) {
  return {
    get: () => parent.get()[key],
    subscribe: (fn: (v: T[K]) => void) => {
      return parent.subscribe((fullState) => fn(fullState[key]))
    }
  }
}
```

**Testes:**

```typescript
// src/state.test.ts (adicionar)

describe('createState - property access', () => {
  test('should support direct property access', () => {
    const state = createState({ count: 0 })
    const countSignal = state.count

    expect(countSignal.get()).toBe(0)
    expect(typeof countSignal.subscribe).toBe('function')
  })

  test('should update property signal when state changes', () => {
    const state = createState({ count: 0 })
    let value: number | undefined

    state.count.subscribe(v => { value = v })
    state.set({ count: 42 })

    expect(value).toBe(42)
  })

  test('should work with nested properties', () => {
    const state = createState({ user: { name: 'John', age: 30 } })

    expect(state.user.get()).toEqual({ name: 'John', age: 30 })
  })
})
```

**Validação:**
```bash
cd packages/slash
bun test src/state.test.ts
```

---

### Etapa 3: Integração com hyper.ts

**Status:** ⬜ Não iniciado

**Tarefas:**
- [ ] Adicionar testes de integração com `html` e `render`
- [ ] Testar auto-rerender ao mudar state
- [ ] Testar múltiplos states no mesmo componente
- [ ] Testar reactive props (atributos HTML)
- [ ] Testar cleanup de subscriptions ao remover elementos
- [ ] Executar testes: `bun test src/state.test.ts`

**Objetivo:** Garantir que `createState` funciona com auto-reatividade

**Por que funciona:**
- `isSignalLike()` detecta objetos com `.get()` e `.subscribe()` ✅
- `appendReactiveChild()` já suporta qualquer SignalLike ✅
- `setProp()` já converte props SignalLike para reativos ✅
- **ZERO mudanças necessárias em hyper.ts!**

**Testes de integração:**

```typescript
// src/state.test.ts (adicionar)

import { html, render } from './hyper'

describe('createState - hyper.ts integration', () => {
  test('should auto-rerender on state change', () => {
    const state = createState({ count: 0 })
    const container = document.createElement('div')

    render(html`<div>${state.count}</div>`, container)
    expect(container.textContent).toBe('0')

    state.set({ count: 42 })
    expect(container.textContent).toBe('42') // ✅ Auto re-renderizou
  })

  test('should work with multiple states', () => {
    const counter = createState({ count: 0 })
    const user = createState({ name: 'John' })
    const container = document.createElement('div')

    render(html`<div>${counter.count} - ${user.name}</div>`, container)
    expect(container.textContent).toBe('0 - John')

    counter.set({ count: 5 })
    expect(container.textContent).toBe('5 - John')

    user.set({ name: 'Jane' })
    expect(container.textContent).toBe('5 - Jane')
  })

  test('should work with reactive props', () => {
    const state = createState({ className: 'active' })
    const container = document.createElement('div')

    render(html`<div class=${state.className}>Content</div>`, container)

    const div = container.querySelector('div')!
    expect(div.className).toBe('active')

    state.set({ className: 'inactive' })
    expect(div.className).toBe('inactive')
  })

  test('should cleanup subscriptions when element is removed', () => {
    const state = createState({ count: 0 })
    const container = document.createElement('div')

    render(html`<div>${state.count}</div>`, container)

    // Remover elemento
    container.innerHTML = ''

    // Atualizar state não deve causar erro
    state.set({ count: 100 })
    // Se subscriptions foram limpas corretamente, não há erro ✅
  })
})
```

**Validação:**
```bash
cd packages/slash
bun test src/state.test.ts
```

---

### Etapa 4: Exportar API e remover signals

**Status:** ⬜ Não iniciado

**Tarefas:**
- [ ] Adicionar tipo `State<T>` em `src/types.ts`
- [ ] Adicionar tipo `Reactive<T>` (renomear de `SignalLike`)
- [ ] Remover tipos: `Signal`, `ReadonlySignal`, `SignalArray`, `ReadonlySignalArray`
- [ ] Exportar `createState` em `src/index.ts`
- [ ] Remover exports de signals em `src/index.ts`
- [ ] DELETAR `src/signals.ts` completamente
- [ ] DELETAR `src/signals.test.ts` completamente
- [ ] Executar build: `bun run build`
- [ ] Verificar que build compila sem erros

**src/types.ts:**

```typescript
// Novo tipo State (API pública)
export type State<T> = {
  get(): T
  set(payload: T | ((prev: T) => T)): void
  watch(callback: (payload: T) => void): () => void
  subscribe(fn: (v: T) => void): () => void
}

// RENOMEAR SignalLike → Reactive (duck type para objetos reativos)
// Usado internamente por hyper.ts para detectar qualquer objeto reativo
export type Reactive<T = unknown> = {
  get(): T
  subscribe(fn: (v: T) => void): () => void
}

// REMOVER completamente (sem compatibilidade):
// - Signal<T>
// - ReadonlySignal<T>
// - SignalArray<T>
// - ReadonlySignalArray<T>
// - SignalLike<T> ← renomeado para Reactive<T>
```

**src/index.ts:**

```typescript
// Nova API (única)
export { createState } from './state'
export type { State } from './types'

// REMOVER completamente:
// - createSignal
// - createSignalArray
// - effect
// - computed
// - memo

// Manter apenas exports necessários:
export { html, render, /* ... */ } from './hyper'
export * from './components'
// ... outros exports
```

**Validação:**
```bash
cd packages/slash
bun run build
# Deve compilar sem erros, signals não existe mais
```

---

### Etapa 5: Criar exemplos em slash-spa

**Status:** ⬜ Não iniciado

**Tarefas:**
- [ ] Criar arquivo `examples/state-counter.html`
- [ ] Implementar exemplo com counter (increment/decrement/reset)
- [ ] Adicionar watch manual para logging no console
- [ ] Testar no navegador: `bun run dev`
- [ ] Verificar que auto-reatividade funciona
- [ ] Verificar que watch manual funciona no console

**Arquivo:** `packages/slash-spa/examples/state-counter.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>State Counter Example</title>
</head>
<body>
  <div id="app"></div>

  <script type="module">
    import { html, render, createState } from 'slash'

    // Criar estado
    const counter = createState({ count: 0 })

    // Watch manual (opcional)
    counter.watch(state => {
      console.log('Count changed:', state.count)
    })

    // Componente
    const App = () => html`
      <div>
        <h1>Counter: ${counter.count}</h1>
        <button onClick=${() => counter.set(prev => ({ count: prev.count + 1 }))}>
          Increment
        </button>
        <button onClick=${() => counter.set(prev => ({ count: prev.count - 1 }))}>
          Decrement
        </button>
        <button onClick=${() => counter.set({ count: 0 })}>
          Reset
        </button>
      </div>
    `

    render(App, '#app')
  </script>
</body>
</html>
```

**Validação:**
```bash
cd packages/slash-spa
bun run dev
# Abrir http://localhost:3000/examples/state-counter.html
# Testar increment/decrement/reset
```

---

### Etapa 6: Validar SSR em slash-ssr

**Status:** ⬜ Não iniciado

**Tarefas:**
- [ ] Criar arquivo `examples/state-ssr.ts`
- [ ] Implementar exemplo com `renderToString`
- [ ] Executar: `bun run examples/state-ssr.ts`
- [ ] Verificar que HTML é gerado corretamente
- [ ] Validar que state.count é renderizado no servidor

**Arquivo:** `packages/slash-ssr/examples/state-ssr.ts`

```typescript
import { html, renderToString, createState } from 'slash'

// Criar estado inicial
const counter = createState({ count: 42 })

const App = () => html`
  <div>
    <h1>Counter (SSR): ${counter.count}</h1>
    <p>This was rendered on the server!</p>
  </div>
`

// Renderizar no servidor
const htmlString = renderToString(App)
console.log(htmlString)
```

**Validação:**
```bash
cd packages/slash-ssr
bun run examples/state-ssr.ts
# Verificar output HTML correto
```

---

### Etapa 7: Migrar testes e componentes

**Status:** ⬜ Não iniciado

**Tarefas:**
- [ ] Renomear `SignalLike` → `Reactive` em `src/components.ts`
- [ ] Renomear `isSignalLike()` → `isReactive()` em `src/components.ts`
- [ ] Migrar testes em `src/components.test.ts` (signals → createState)
- [ ] Migrar testes em `src/hyper.test.ts` (signals → createState)
- [ ] Atualizar arquivos em `src/forms/*` se usarem signals
- [ ] Executar testes: `bun test`
- [ ] Verificar que todos os testes passam

**Objetivo:** Migrar todos os usos de signals para createState

**Exemplo de migração - `src/components.test.ts`:**

```typescript
// ANTES (com signals)
import { createSignal } from './signals'

test('should toggle class with signal', () => {
  const isActive = createSignal(true)
  const result = toggleClass('active', isActive)
  expect((result as any).get()).toEqual({ active: true })
})

// DEPOIS (com createState)
import { createState } from './state'

test('should toggle class with state', () => {
  const state = createState({ isActive: true })
  const result = toggleClass('active', state.isActive)
  expect(result.get()).toEqual({ active: true }) // Sem type cast!
})
```

**Migrar components.ts:**

```typescript
// ANTES
import type { Signal, ReadonlySignal } from './types'

type SignalLike<T = unknown> = ReadonlySignal<T> | Signal<T>

function isSignalLike<T = unknown>(x: unknown): x is SignalLike<T> {
  return !!x && typeof (x as any).get === "function" && typeof (x as any).subscribe === "function"
}

export function toggleClass(
  className: string,
  condition: boolean | SignalLike<boolean>
) {
  // ...
}

// DEPOIS
import type { Reactive } from './types'

function isReactive<T = unknown>(x: unknown): x is Reactive<T> {
  return !!x && typeof (x as any).get === "function" && typeof (x as any).subscribe === "function"
}

export function toggleClass(
  className: string,
  condition: boolean | Reactive<boolean>
) {
  // Mesma implementação, apenas nomes mudaram
}
```

**Validação:**
```bash
cd packages/slash
bun test
# Todos os testes devem passar com createState
```

---

### Etapa 8: Documentação e cleanup final

**Status:** ⬜ Não iniciado

**Tarefas:**
- [ ] Renomear `SignalLike` → `Reactive` em `src/hyper.ts`
- [ ] Renomear `isSignalLike()` → `isReactive()` em `src/hyper.ts`
- [ ] Renomear em `src/server-render.ts` se necessário
- [ ] Remover imports de `signals.ts` em `src/hyper.ts`
- [ ] Remover função `appendReactiveFunction` (usa effect)
- [ ] Atualizar comentários: "signal" → "reactive"
- [ ] Executar build: `bun run build`
- [ ] Executar todos os testes: `bun test`
- [ ] Verificar bundle size (< 5KB para state.ts)

**Arquivos a deletar:**
```bash
rm src/signals.ts
rm src/signals.test.ts
```

**Atualizar hyper.ts (se necessário):**

```typescript
// ANTES
import { effect } from './signals'

// DEPOIS
// Remover import de effect se não for usado
// hyper.ts já funciona com qualquer SignalLike via isSignalLike()
```

**Refatorar hyper.ts:**

1. **Renomear referências:**
   - `isSignalLike()` → `isReactive()` (37 linhas)
   - `SignalLike` → `Reactive` (tipos, linhas 15, 81, 275)
   - Comentários: "SignalLike" → "Reactive"

2. **Remover imports de signals.ts:**
   - Linha 2: `import { setListRendererImpl, createSignal, effect } from "./signals"`
   - **DELETAR** import de `createSignal` (não usado)
   - **DELETAR** import de `effect` (linha 152 usa effect - precisa substituir!)
   - **AVALIAR** `setListRendererImpl` - pode precisar ser removido

3. **Substituir `effect()` usado internamente:**
   - Linha 152-155: `appendReactiveFunction` usa `effect()` para tracking
   - **SOLUÇÃO:** Remover `appendReactiveFunction` completamente
   - Funções como children não funcionarão mais (simplifica!)
   - Apenas `Reactive<T>` direto funciona (State properties)

**Validação:**
```bash
cd packages/slash
bun run build
bun test
```

---

## Validação Final

### Checklist completo

**Testes:**
- [ ] Todos os testes de `state.test.ts` passam
- [ ] Todos os testes de `components.test.ts` passam
- [ ] Todos os testes de `hyper.test.ts` passam
- [ ] Todos os testes do projeto passam: `bun test`

**Integração:**
- [ ] Integração com hyper.ts funciona
- [ ] Exemplos em slash-spa funcionam no navegador
- [ ] SSR em slash-ssr funciona

**Build:**
- [ ] Build sem erros TypeScript: `bun run build`
- [ ] Bundle size aceitável (< 5KB para state.ts)
- [ ] Não há imports de signals.ts em nenhum arquivo

### Comandos de validação

```bash
# Testes
cd packages/slash
bun test

# Build
bun run build

# Validar slash-spa
cd ../slash-spa
bun run dev

# Validar slash-ssr
cd ../slash-ssr
bun run examples/state-ssr.ts
```

---

## Benefícios Alcançados

✅ **Simplicidade extrema** - apenas set/get/watch
✅ **Testes síncronos** - sem await, sem timing issues
✅ **Sem hooks** - zero CURRENT global, zero tracking
✅ **Sem memory leaks** - cleanup functions em watch/subscribe
✅ **Auto-reatividade** - componentes re-renderizam automaticamente
✅ **Watch manual** - side effects controlados quando necessário
✅ **Compatível** - funciona com hyper.ts existente sem mudanças

## Trade-offs Aceitos

⚠️ **structuredClone/JSON overhead** - aceitável para maioria dos casos
⚠️ **Não suporta funções/Symbols** - raramente necessário
⚠️ **Sempre notifica todos** - sem fine-grained reactivity (simplifica)

---

## Próximos Passos (Futuro)

1. **Derived/Computed** (se necessário):
   ```typescript
   const doubled = createDerived([counter], ([c]) => c.count * 2)
   ```

2. **Batching opcional** (se necessário):
   ```typescript
   batch(() => {
     state1.set(...)
     state2.set(...)
   }) // Notifica apenas uma vez
   ```

3. **DevTools** (opcional):
   ```typescript
   enableDevTools() // Inspecionar states no browser
   ```
