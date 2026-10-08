# Renderização Básica

## Função `h()` e `html` (HTM Template Tag)

Slash oferece duas formas de criar elementos DOM: a função `h()` (hyperscript) e o template tag `html` (HTM).

### HTM Template Tag (Recomendado)

O template tag `html` permite escrever markup HTML-like diretamente no JavaScript/TypeScript sem necessidade de transpilação:

```typescript
import { html } from '@_bashell/slash/core'

const element = html`
  <div class="container">
    <h1>Hello, World!</h1>
    <p>This is a paragraph</p>
  </div>
`
```

**Vantagens:**
- Sintaxe familiar (similar a JSX)
- Sem build step necessário
- Type safety completo
- Syntax highlighting em editores modernos

### Função `h()` (Hyperscript)

Para uma abordagem mais programática, use a função `h()`:

```typescript
import { h } from '@_bashell/slash/core'

const element = h('div', { class: 'container' },
  h('h1', null, 'Hello, World!'),
  h('p', null, 'This is a paragraph')
)
```

**Assinatura:**
```typescript
function h(
  tag: string | Component,
  props: Props | null,
  ...children: Child[]
): Node
```

### Comparação: html vs h()

```typescript
// HTM
const greeting = html`
  <div class="greeting">
    <h1>Hello, ${name}!</h1>
  </div>
`

// Hyperscript equivalente
const greeting = h('div', { class: 'greeting' },
  h('h1', null, `Hello, ${name}!`)
)
```

## Criando Elementos DOM

### Elementos HTML Básicos

```typescript
import { html } from '@_bashell/slash/core'

// Div simples
const div = html`<div>Content</div>`

// Com classes
const styled = html`<div class="container flex">Styled</div>`

// Com IDs
const unique = html`<div id="app">App Root</div>`

// Elementos vazios
const input = html`<input type="text" />`
const br = html`<br />`
```

### Elementos SVG

Slash detecta automaticamente elementos SVG e aplica o namespace correto:

```typescript
import { html } from '@_bashell/slash/core'

const icon = html`
  <svg width="24" height="24" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="blue" />
    <path d="M12 6v6l4 2" stroke="white" stroke-width="2" />
  </svg>
`
```

**Tags SVG reconhecidas automaticamente:** [src/utils/constants.ts](../../src/utils/constants.ts:1)
- `svg`, `circle`, `path`, `rect`, `line`, `polyline`, `polygon`
- `ellipse`, `text`, `g`, `defs`, `use`, `symbol`, `clipPath`
- `linearGradient`, `radialGradient`, `stop`, `mask`, `pattern`

## Props e Children

### Props (Propriedades)

Props são passadas como objeto no segundo argumento de `h()` ou como atributos no `html`:

```typescript
// Com html
const button = html`
  <button
    class="btn btn-primary"
    disabled=${false}
    data-id="123"
  >
    Click Me
  </button>
`

// Com h()
const button = h('button', {
  class: 'btn btn-primary',
  disabled: false,
  'data-id': '123'
}, 'Click Me')
```

### Tipos de Props

#### 1. Atributos HTML

```typescript
const input = html`
  <input
    type="text"
    placeholder="Enter name"
    required=${true}
    maxlength="50"
  />
`
```

#### 2. Properties JavaScript

Propriedades especiais são definidas via assignment direto:

```typescript
const input = html`
  <input
    type="checkbox"
    checked=${true}
    value="option1"
  />
`
```

**Properties especiais:**
- `value` (inputs, textarea, select)
- `checked` (checkbox, radio)
- `selected` (option)
- `disabled`
- `className` (alternativa a `class`)

#### 3. Classes

Classes podem ser strings, arrays ou objetos:

```typescript
// String simples
const el1 = html`<div class="container"></div>`

// Array (classes condicionais)
const classes = ['btn', isActive && 'active', 'large']
const el2 = html`<button class=${classes}>Click</button>`

// Objeto (toggle classes)
const classMap = { active: true, disabled: false, large: true }
const el3 = html`<button class=${classMap}>Click</button>`
```

**Implementação:** [src/rendering/props-core.ts](../../src/rendering/props-core.ts:1)

#### 4. Estilos

```typescript
// String CSS
const el1 = html`<div style="color: red; font-size: 16px"></div>`

// Objeto CSS
const styles = { color: 'red', fontSize: '16px' }
const el2 = html`<div style=${styles}></div>`
```

Declarações inseguras (`url(javascript:...)`, `expression(...)`, `;` no valor) são descartadas; veja [Segurança](../19-security/README.md#style).

### Children (Filhos)

Children podem ser:
- Strings e números (strings são sempre texto: `<b>` aparece literalmente; para marcação confiável use `unsafeHtml(...)`, veja [Segurança](../19-security/README.md))
- Elementos DOM (Node)
- Arrays (aninhados)
- Objetos `Reactive` (`get()` + `subscribe()`), atualizados automaticamente (é o caso do valor retornado por `Router({ router })`)
- `null`, `undefined`, `false` (ignorados)

```typescript
import { html, createState } from '@_bashell/slash/core'

const count = createState(0)
const name = "Alice"

// Um `State` não é um Reactive: leia o valor com get() dentro de um componente
const Element = () => html`
  <div>
    <h1>Hello, ${name}!</h1>
    <p>Count: ${count.get()}</p>
    ${count.get() > 5 && html`<p>Count is high!</p>`}
    <ul>
      ${[1, 2, 3].map(n => html`<li>Item ${n}</li>`)}
    </ul>
  </div>
`
```

Funções não são aceitas como children (lançam erro): chame a função e passe o resultado.

**Implementação:** [src/rendering/children.ts](../../src/rendering/children.ts:1)

## Função `render()` para Montar na Página

A função `render()` monta elementos no DOM:

```typescript
import { render, html } from '@_bashell/slash/core'

const App = () => html`
  <div>
    <h1>My App</h1>
  </div>
`

// Renderizar em elemento existente
const root = document.getElementById('app')
render(App(), root)

// Ou usando seletor CSS
render(App(), '#app')

// Se App lê um state (createState), monte-o como componente
// para que ele re-renderize quando o state mudar
render(html`<${App} />`, '#app')
```

### Assinatura

```typescript
function render(
  view: Child | (() => Child),
  container: Element | string | null | undefined
): Node | Node[]
```

**Parâmetros:**
- `view`: Elemento ou função que retorna elemento
- `container`: Elemento DOM ou seletor CSS

**Retorno:** Node único ou array de Nodes inseridos

**Implementação:** [src/rendering/render.ts](../../src/rendering/render.ts:1)

### Comportamentos Especiais

#### Cleanup Automático

`render()` limpa children anteriores do container automaticamente:

```typescript
const root = document.getElementById('app')

// Primeira renderização
render(html`<div>First</div>`, root)

// Segunda renderização - remove 'First' antes
render(html`<div>Second</div>`, root)
```

#### Hidratação SSR

Se o container já tem conteúdo renderizado pelo servidor E existe um `<script id="__SLASH_STATE__">`, `render()` hidrata em vez de substituir:

```typescript
// Server-side (import { renderToString, serializeStateForScript } from '@_bashell/slash/ssr')
const { html, state: stateData } = renderToString(() => App())
const output = `
  <div id="app">${html}</div>
  <script id="__SLASH_STATE__" type="application/json">
    ${serializeStateForScript(stateData)}
  </script>
`

// Client-side
render(html`<${App} />`, '#app') // Hidrata DOM existente
```

#### Erro Handling

`render()` valida o container e lança erros claros em dev mode:

```typescript
// Container não encontrado
render(App(), '#non-existent')
// Error: [slash] render(): selector "#non-existent" not found

// Container null
render(App(), null)
// Error: [slash] render(): container Element is required (received null/undefined)
```

## Event Handlers

Event handlers são passados como props prefixadas com `on`:

### Sintaxe Básica

```typescript
import { html, createState } from '@_bashell/slash/core'

const count = createState(0)

const increment = () => count.set(count.get() + 1)
const decrement = () => count.set(count.get() - 1)

const Counter = () => html`
  <div>
    <p>Count: ${count.get()}</p>
    <button onClick=${increment}>+</button>
    <button onClick=${decrement}>-</button>
  </div>
`
```

### Eventos Disponíveis

Todos os eventos DOM padrão são suportados:

```typescript
const element = html`
  <input
    type="text"
    onInput=${(e) => console.log(e.target.value)}
    onChange=${handleChange}
    onFocus=${handleFocus}
    onBlur=${handleBlur}
    onKeydown=${handleKeyDown}
    onKeyup=${handleKeyUp}
  />
`
```

### Event Object

Event handlers recebem o evento nativo do browser:

```typescript
const handleClick = (event: MouseEvent) => {
  console.log('Clicked at', event.clientX, event.clientY)
  event.preventDefault()
  event.stopPropagation()
}

const button = html`
  <button onClick=${handleClick}>Click Me</button>
`
```

### Event Options

Para opções avançadas, use array tuple `[handler, options]`:

```typescript
const handleScroll = (e: Event) => {
  console.log('Scrolled')
}

const container = html`
  <div onScroll=${[handleScroll, { passive: true, capture: false }]}>
    Content
  </div>
`
```

**Event Options:**
- `capture: boolean` - Captura na fase de capturing
- `passive: boolean` - Listener não chama preventDefault()
- `once: boolean` - Listener executado apenas uma vez

**Implementação:** [src/rendering/events.ts](../../src/rendering/events.ts:1)

### Form Events com Type Safety

```typescript
import { html } from '@_bashell/slash/core'
import type { TextFieldEvent } from '@_bashell/slash/forms'

const handleInput = (e: TextFieldEvent<InputEvent>) => {
  const value = e.target.value // Type-safe access
  console.log('Input value:', value)
}

const form = html`
  <form>
    <input type="text" onInput=${handleInput} />
  </form>
`
```

**Form event types:** [src/forms/form.types.ts](../../src/forms/form.types.ts:1)

### Cleanup de Event Listeners

Event listeners são **automaticamente removidos** quando um nó é destruído:

```typescript
import { destroyNode } from '@_bashell/slash/core'

const button = html`<button onClick=${handler}>Click</button>`

// Quando não mais necessário
destroyNode(button as Node) // Remove listener automaticamente
```

**Implementação:** [src/lifecycle/cleanup.ts](../../src/lifecycle/cleanup.ts:1)

## Exemplos Práticos

### Exemplo 1: Botão com Estado

```typescript
import { html, createState, render } from '@_bashell/slash/core'

const isActive = createState(false)

const toggle = () => isActive.set(!isActive.get())

const ToggleButton = () => html`
  <button
    class=${isActive.get() ? 'active' : ''}
    onClick=${toggle}
  >
    ${isActive.get() ? 'Active' : 'Inactive'}
  </button>
`

render(html`<${ToggleButton} />`, '#app')
```

### Exemplo 2: Lista Dinâmica

```typescript
import { html, createState, render } from '@_bashell/slash/core'

const todos = createState<string[]>(['Buy milk', 'Walk dog'])

// O texto digitado fica numa variável comum: ler um state durante o render
// faria o componente re-renderizar (e recriar o <input>) a cada tecla
let draft = ''

const addTodo = () => {
  const value = draft.trim()
  if (value) {
    draft = ''
    todos.set([...todos.get(), value])
  }
}

const TodoList = () => html`
  <div>
    <h1>Todos</h1>
    <ul>
      ${todos.get().map(todo => html`<li>${todo}</li>`)}
    </ul>
    <input
      type="text"
      onInput=${(e: Event) => { draft = (e.target as HTMLInputElement).value }}
    />
    <button onClick=${addTodo}>Add</button>
  </div>
`

render(html`<${TodoList} />`, '#app')
```

### Exemplo 3: Form com Validação

```typescript
import { html, createState, render } from '@_bashell/slash/core'
import { onSubmit } from '@_bashell/slash/forms'

const error = createState('')

// Só este componente lê `error`: a mensagem re-renderiza e o form (com o que
// foi digitado) permanece intacto
const ErrorMessage = () => {
  const message = error.get()
  return message ? html`<p class="error">${message}</p>` : null
}

const handleSubmit = onSubmit((data) => {
  const email = String(data.email ?? '')
  const password = String(data.password ?? '')

  if (!email.includes('@')) {
    error.set('Invalid email')
    return
  }

  if (password.length < 6) {
    error.set('Password must be at least 6 characters')
    return
  }

  error.set('')
  console.log('Login:', { email, password })
})

const LoginForm = () => html`
  <form onSubmit=${handleSubmit}>
    <h1>Login</h1>
    <${ErrorMessage} />
    <input type="email" name="email" placeholder="Email" />
    <input type="password" name="password" placeholder="Password" />
    <button type="submit">Login</button>
  </form>
`

render(html`<${LoginForm} />`, '#app')
```

## Próximos Passos

Agora que você domina renderização básica, explore:

1. [Sistema de Estado](../04-state/README.md) - State management reativo avançado
2. Componentes (capítulo ainda não escrito) - Criar componentes reutilizáveis
3. [Batch Updates](../05-batch/README.md) - Otimizar múltiplas atualizações
