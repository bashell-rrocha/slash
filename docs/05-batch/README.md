# Batch Updates

## Função `batch()` para Agrupar Atualizações

A função `batch()` agrupa múltiplas atualizações de estado, notificando watchers **apenas uma vez** ao final do batch em vez de notificar após cada `set()`.

### Assinatura

```typescript
function batch(fn: () => void): void
```

**Parâmetros:**
- `fn`: Função que contém as atualizações de estado a serem agrupadas

**Retorno:** `void`

### Uso Básico

```typescript
import { createState, batch } from '@_bashell/slash/core'

const count = createState(0)
const name = createState('Alice')

count.watch(() => console.log('Count changed'))
name.watch(() => console.log('Name changed'))

// Sem batch: 2 notificações
count.set(5)    // Log: "Count changed"
name.set('Bob') // Log: "Name changed"

// Com batch: 2 notificações agrupadas
batch(() => {
  count.set(10)    // Não notifica ainda
  name.set('Charlie') // Não notifica ainda
}) // Notifica ambos aqui
// Log: "Count changed"
// Log: "Name changed"
```

**Implementação:** [src/batch.ts](../../src/batch.ts:1)

## Como Funciona e Quando Usar

### Como Funciona

1. **Início do Batch**: `batch()` marca o contexto global como "batching"
2. **Acúmulo**: Cada `state.set()` registra um update mas **não notifica** watchers
3. **Fim do Batch**: Ao finalizar a função, todos os watchers são notificados **uma vez**

```typescript
const state = createState({ count: 0, name: 'John' })

state.watch((value) => {
  console.log('State changed:', value)
})

batch(() => {
  state.set({ count: 1, name: 'John' })  // Registrado
  state.set({ count: 2, name: 'John' })  // Registrado
  state.set({ count: 3, name: 'Jane' })  // Registrado
})
// Log: "State changed: { count: 3, name: 'Jane' }" (apenas uma vez)
```

### Comportamento atual

Pontos que valem conhecer (verificados contra a implementação):

- Ao terminar, o batch notifica os watchers de **todos** os states existentes uma vez, inclusive states que não foram alterados dentro do batch. Mantenha os watchers idempotentes.
- Se nenhum `set` mudou valor dentro do batch, ninguém é notificado.
- Se a função lançar um erro, as notificações ainda acontecem (o `finally` do batch roda) e o erro é propagado.
- Batches aninhados não são contabilizados: o fim do batch interno encerra o modo batch, e os `set` seguintes do batch externo notificam imediatamente.

### Estado Interno

Batch mantém um contador de updates pendentes:

```typescript
interface BatchContext {
  status: { type: 'IDLE' } | { type: 'BATCHING', pendingUpdates: number }
}
```

**Fluxo:**
1. `batch()` called → status = BATCHING, pendingUpdates = 0
2. `state.set()` → pendingUpdates++
3. `state.set()` → pendingUpdates++
4. Batch ends → Notifica watchers se pendingUpdates > 0 → status = IDLE

**Implementação Core:** [src/batch-core.ts](../../src/batch-core.ts:1)

### Quando Usar

Use `batch()` quando você precisa atualizar **múltiplos states** ou o **mesmo state várias vezes**:

#### 1. Atualizar Múltiplos States

```typescript
const user = createState({ name: '', age: 0 })
const isLoading = createState(false)
const error = createState<string | null>(null)

// ❌ Sem batch: 3 notificações separadas
const loadUser = async (id: number) => {
  isLoading.set(true)
  error.set(null)

  try {
    const data = await fetchUser(id)
    user.set(data)
  } catch (err) {
    error.set(err.message)
  } finally {
    isLoading.set(false)
  }
}

// ✅ Com batch: as atualizações de cada etapa são notificadas juntas
const loadUser = async (id: number) => {
  batch(() => {
    isLoading.set(true)
    error.set(null)
  })

  try {
    const data = await fetchUser(id)
    batch(() => {
      user.set(data)
      isLoading.set(false)
    })
  } catch (err) {
    batch(() => {
      error.set(err.message)
      isLoading.set(false)
    })
  }
}
```

#### 2. Loops com Múltiplas Atualizações

```typescript
const items = createState<number[]>([])

// ❌ Sem batch: 1000 notificações
for (let i = 0; i < 1000; i++) {
  items.set([...items.get(), i])
}

// ✅ Com batch: 1 notificação
batch(() => {
  for (let i = 0; i < 1000; i++) {
    items.set([...items.get(), i])
  }
})

// ✅ Ainda melhor: Acumular em variável local
const newItems = []
for (let i = 0; i < 1000; i++) {
  newItems.push(i)
}
items.set(newItems) // 1 notificação, sem batch necessário
```

#### 3. Inicialização de Múltiplos States

```typescript
const formState = createState({ email: '', password: '' })
const validationErrors = createState({})
const isSubmitting = createState(false)

const initializeForm = () => {
  batch(() => {
    formState.set({ email: '', password: '' })
    validationErrors.set({})
    isSubmitting.set(false)
  })
}
```

#### 4. Sincronização de States Dependentes

```typescript
const celsius = createState(0)
const fahrenheit = createState(32)

const setCelsius = (value: number) => {
  batch(() => {
    celsius.set(value)
    fahrenheit.set((value * 9/5) + 32)
  })
}
```

### Quando NÃO Usar

- **Single update**: Não há benefício em usar batch para um único `set()`
- **Updates assíncronos**: `batch()` é síncrono, não funciona com async/await

```typescript
// ❌ Batch não funciona aqui (assíncrono)
batch(async () => {
  const data = await fetchData()
  state.set(data) // Executado APÓS batch finalizar
})

// ✅ Correto
const data = await fetchData()
state.set(data)
```

## Performance Optimization

### Medindo Performance

```typescript
const state = createState(0)

state.watch(() => {
  // Simulando operação custosa
  console.time('render')
  // ... heavy DOM updates
  console.timeEnd('render')
})

// Sem batch: 100 renders
console.time('without-batch')
for (let i = 0; i < 100; i++) {
  state.set(i)
}
console.timeEnd('without-batch')

// Com batch: 1 render
console.time('with-batch')
batch(() => {
  for (let i = 0; i < 100; i++) {
    state.set(i)
  }
})
console.timeEnd('with-batch')
```

### Resultados

Os ganhos dependem do custo dos watchers (e do DOM que eles tocam): meça no seu caso com o código acima.

### Otimizações Automáticas

Slash já otimiza internamente:

1. **Deep Equality**: não notifica se o valor não mudou
2. **Re-render por componente**: só componentes que leram o state alterado executam de novo

Batch adiciona uma camada extra de otimização para cenários específicos.

## Exemplos Práticos

### Exemplo 1: Form com Múltiplos Campos

```typescript
import { createState, batch, html, render } from '@_bashell/slash/core'

interface FormData {
  name: string
  email: string
  age: number
}

const form = createState<FormData>({
  name: '',
  email: '',
  age: 0
})

const resetForm = () => {
  batch(() => {
    form.set({ name: '', email: '', age: 0 })
  })
}

const loadUserData = (userId: number) => {
  // Simular fetch
  const userData = { name: 'Alice', email: 'alice@example.com', age: 30 }

  batch(() => {
    form.set(userData)
  })
}

const FormComponent = () => html`
  <form>
    <input
      type="text"
      placeholder="Name"
      value=${form.get().name}
      onChange=${(e: Event) =>
        form.set({ ...form.get(), name: (e.target as HTMLInputElement).value })
      }
    />
    <input
      type="email"
      placeholder="Email"
      value=${form.get().email}
      onChange=${(e: Event) =>
        form.set({ ...form.get(), email: (e.target as HTMLInputElement).value })
      }
    />
    <input
      type="number"
      placeholder="Age"
      value=${form.get().age}
      onChange=${(e: Event) =>
        form.set({ ...form.get(), age: Number((e.target as HTMLInputElement).value) })
      }
    />
    <button type="button" onClick=${resetForm}>Reset</button>
    <button type="button" onClick=${() => loadUserData(1)}>Load User</button>
  </form>
`

// O form lê `form` no render, então re-renderiza a cada set (por isso onChange, não onInput)
render(html`<${FormComponent} />`, '#app')
```

### Exemplo 2: Lista com Filtros

```typescript
import { createState, batch, html, render } from '@_bashell/slash/core'

interface Todo {
  id: number
  text: string
  completed: boolean
}

const todos = createState<Todo[]>([])
const filter = createState<'all' | 'active' | 'completed'>('all')
const searchQuery = createState('')

const filteredTodos = createState<Todo[]>([])

// Recomputar filteredTodos quando qualquer dependência muda
const updateFilteredTodos = () => {
  const allTodos = todos.get()
  const currentFilter = filter.get()
  const query = searchQuery.get().toLowerCase()

  let result = allTodos

  // Aplicar filtro
  if (currentFilter === 'active') {
    result = result.filter(t => !t.completed)
  } else if (currentFilter === 'completed') {
    result = result.filter(t => t.completed)
  }

  // Aplicar busca
  if (query) {
    result = result.filter(t => t.text.toLowerCase().includes(query))
  }

  filteredTodos.set(result)
}

// Watch all dependencies
todos.watch(updateFilteredTodos)
filter.watch(updateFilteredTodos)
searchQuery.watch(updateFilteredTodos)

const addTodo = (text: string) => {
  const newTodo: Todo = {
    id: Date.now(),
    text,
    completed: false
  }

  batch(() => {
    todos.set([...todos.get(), newTodo])
    // filteredTodos será atualizado automaticamente via watcher
  })
}

const setFilter = (newFilter: 'all' | 'active' | 'completed') => {
  batch(() => {
    filter.set(newFilter)
    // filteredTodos será atualizado automaticamente
  })
}

const TodoApp = () => html`
  <div>
    <input
      type="text"
      placeholder="Search..."
      onInput=${(e: Event) => searchQuery.set((e.target as HTMLInputElement).value)}
    />
    <div>
      <button onClick=${() => setFilter('all')}>All</button>
      <button onClick=${() => setFilter('active')}>Active</button>
      <button onClick=${() => setFilter('completed')}>Completed</button>
    </div>
    <ul>
      ${filteredTodos.get().map(todo => html`
        <li>${todo.text}</li>
      `)}
    </ul>
  </div>
`

render(html`<${TodoApp} />`, '#app')
```

### Exemplo 3: Data Fetching com Loading States

```typescript
import { createState, batch, html, render } from '@_bashell/slash/core'

interface User {
  id: number
  name: string
  email: string
}

const user = createState<User | null>(null)
const isLoading = createState(false)
const error = createState<string | null>(null)

const fetchUser = async (id: number) => {
  batch(() => {
    isLoading.set(true)
    error.set(null)
  })

  try {
    const response = await fetch(`https://api.example.com/users/${id}`)
    if (!response.ok) throw new Error('Failed to fetch')

    const data = await response.json()

    batch(() => {
      user.set(data)
      isLoading.set(false)
    })
  } catch (err) {
    batch(() => {
      error.set((err as Error).message)
      isLoading.set(false)
    })
  }
}

const UserProfile = () => {
  const currentUser = user.get()
  const loading = isLoading.get()
  const errorMsg = error.get()

  if (loading) {
    return html`<div>Loading...</div>`
  }

  if (errorMsg) {
    return html`<div class="error">Error: ${errorMsg}</div>`
  }

  if (!currentUser) {
    return html`<div>No user loaded</div>`
  }

  return html`
    <div>
      <h1>${currentUser.name}</h1>
      <p>${currentUser.email}</p>
    </div>
  `
}

render(html`
  <div>
    <${UserProfile} />
    <button onClick=${() => fetchUser(1)}>Load User 1</button>
  </div>
`, '#app')
```

### Exemplo 4: Animações com Múltiplos Estados

```typescript
import { createState, batch, html, render } from '@_bashell/slash/core'

const position = createState({ x: 0, y: 0 })
const rotation = createState(0)
const scale = createState(1)

const animateElement = () => {
  let frame = 0

  const animate = () => {
    frame++

    batch(() => {
      position.set({
        x: Math.sin(frame * 0.05) * 100,
        y: Math.cos(frame * 0.05) * 100
      })
      rotation.set(frame * 2)
      scale.set(1 + Math.sin(frame * 0.1) * 0.5)
    })

    requestAnimationFrame(animate)
  }

  animate()
}

const AnimatedElement = () => html`
  <div
    style=${{
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: `
        translate(${position.get().x}px, ${position.get().y}px)
        rotate(${rotation.get()}deg)
        scale(${scale.get()})
      `,
      width: '50px',
      height: '50px',
      backgroundColor: 'blue'
    }}
  ></div>
`

render(html`<${AnimatedElement} />`, '#app')
animateElement()
```

## Integração com State Management

### `set()` respeita o batch

`set()` consulta o contexto de batch interno, então você não precisa passar nada para `createState`:

```typescript
// state.ts (interno)
const set = (payload: S) => {
  // ...

  if (isInBatch()) {
    __recordBatchUpdate() // Apenas registra
  } else {
    _notifyHandlers(deepClone(_state)) // Notifica imediatamente
  }
}
```

**Implementação:** [src/state.ts](../../src/state.ts:66-91)

### Verificar se Está em Batch

`isInBatch()` existe em `src/batch.ts`, mas é de uso interno e **não** é exportado pelos subpaths públicos (`core`, `router`, `forms`, `ssr`) nem pelo bundle principal. Os subpaths exportam apenas `batch`.

## Próximos Passos

Agora que você domina batch updates, explore:

1. Componentes (capítulo ainda não escrito) - Criar componentes reutilizáveis
2. Performance e Best Practices (capítulo ainda não escrito) - Otimizações avançadas
3. Router (capítulo ainda não escrito) - Roteamento com state management
