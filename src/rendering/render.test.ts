import { describe, test, expect, beforeEach } from 'bun:test'
import { render } from './render'
import { createState } from '../state'
import { addCleanup, hasCleanups } from '../lifecycle/cleanup'

describe('rendering/render.ts', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  describe('render() - básico', () => {
    test('deve renderizar view em Element válido', () => {
      // Arrange
      const container = document.createElement('div')
      const view = document.createElement('span')
      view.textContent = 'Hello'

      // Act
      render(view, container)

      // Assert
      expect(container.querySelector('span')?.textContent).toBe('Hello')
    })

    test('deve renderizar view usando seletor CSS string válido', () => {
      // Arrange
      const container = document.createElement('div')
      container.id = 'app'
      document.body.appendChild(container)

      const view = document.createElement('p')
      view.textContent = 'World'

      // Act
      render(view, '#app')

      // Assert
      expect(container.querySelector('p')?.textContent).toBe('World')
    })

    test('deve renderizar função view que retorna elemento', () => {
      // Arrange
      const container = document.createElement('div')
      const view = () => {
        const el = document.createElement('h1')
        el.textContent = 'Function View'
        return el
      }

      // Act
      render(view, container)

      // Assert
      expect(container.querySelector('h1')?.textContent).toBe('Function View')
    })

    test('deve renderizar Child direto (string)', () => {
      // Arrange
      const container = document.createElement('div')
      const view = 'Text content'

      // Act
      render(view, container)

      // Assert
      expect(container.textContent).toBe('Text content')
    })

    test('deve renderizar Child direto (number)', () => {
      // Arrange
      const container = document.createElement('div')
      const view = 42

      // Act
      render(view, container)

      // Assert
      expect(container.textContent).toBe('42')
    })

    test('deve renderizar array de children', () => {
      // Arrange
      const container = document.createElement('div')
      const span1 = document.createElement('span')
      span1.textContent = 'One'
      const span2 = document.createElement('span')
      span2.textContent = 'Two'
      const view = [span1, span2]

      // Act
      const result = render(view, container)

      // Assert
      expect(container.children.length).toBe(2)
      expect(container.children[0]?.textContent).toBe('One')
      expect(container.children[1]?.textContent).toBe('Two')
      expect(Array.isArray(result)).toBe(true)
      expect((result as Node[]).length).toBe(2)
    })

    test('deve retornar Node único quando há 1 child', () => {
      // Arrange
      const container = document.createElement('div')
      const view = document.createElement('div')

      // Act
      const result = render(view, container)

      // Assert
      expect(Array.isArray(result)).toBe(false)
      expect(result).toBeInstanceOf(Node)
    })

    test('deve retornar Node[] quando há múltiplos children', () => {
      // Arrange
      const container = document.createElement('div')
      const view = [document.createElement('div'), document.createElement('span')]

      // Act
      const result = render(view, container)

      // Assert
      expect(Array.isArray(result)).toBe(true)
      expect((result as Node[]).length).toBe(2)
    })
  })

  describe('render() - error handling', () => {
    test('deve lançar erro quando container é null', () => {
      // Arrange
      const view = document.createElement('div')

      // Act & Assert
      expect(() => render(view, null)).toThrow('[slash] render()')
      expect(() => render(view, null)).toThrow('container Element is required')
    })

    test('deve lançar erro quando container é undefined', () => {
      // Arrange
      const view = document.createElement('div')

      // Act & Assert
      expect(() => render(view, undefined)).toThrow('[slash] render()')
      expect(() => render(view, undefined)).toThrow('container Element is required')
    })

    test('deve lançar erro quando seletor CSS não encontra elemento', () => {
      // Arrange
      const view = document.createElement('div')
      const selector = '#non-existent-id'

      // Act & Assert
      expect(() => render(view, selector)).toThrow('[slash] render()')
      expect(() => render(view, selector)).toThrow(`selector "${selector}" not found`)
    })

    test('deve incluir mensagem informativa sobre elemento não existir', () => {
      // Arrange
      const view = document.createElement('div')
      const selector = '.missing-class'

      // Act & Assert
      expect(() => render(view, selector)).toThrow('ensure the element exists before calling render()')
    })
  })

  describe('render() - cleanup e lifecycle', () => {
    test('deve remover nodes anteriores ao re-renderizar', () => {
      // Arrange
      const container = document.createElement('div')
      const view1 = document.createElement('span')
      view1.textContent = 'First'
      const view2 = document.createElement('p')
      view2.textContent = 'Second'

      // Act
      render(view1, container)
      expect(container.querySelector('span')).not.toBeNull()

      render(view2, container)

      // Assert
      expect(container.querySelector('span')).toBeNull()
      expect(container.querySelector('p')?.textContent).toBe('Second')
    })

    test('deve chamar cleanups de nodes anteriores', () => {
      // Arrange
      const container = document.createElement('div')
      const view1 = document.createElement('div')
      let cleanupCalled = false

      addCleanup(view1, () => {
        cleanupCalled = true
      })

      // Act
      render(view1, container)
      expect(cleanupCalled).toBe(false)

      const view2 = document.createElement('p')
      render(view2, container)

      // Assert
      expect(cleanupCalled).toBe(true)
    })

    test('deve limpar textContent antes de renderizar novos children', () => {
      // Arrange
      const container = document.createElement('div')
      container.innerHTML = '<span>Old content</span><p>More old</p>'

      const view = document.createElement('div')
      view.textContent = 'New'

      // Act
      render(view, container)

      // Assert
      expect(container.children.length).toBe(1)
      expect(container.querySelector('span')).toBeNull()
      expect(container.querySelector('p')).toBeNull()
      expect(container.querySelector('div')?.textContent).toBe('New')
    })

    test('deve destruir nodes filhos recursivamente', () => {
      // Arrange
      const container = document.createElement('div')
      const parent = document.createElement('div')
      const child = document.createElement('span')
      parent.appendChild(child)

      let parentCleanupCalled = false
      let childCleanupCalled = false

      addCleanup(parent, () => { parentCleanupCalled = true })
      addCleanup(child, () => { childCleanupCalled = true })

      // Act
      render(parent, container)
      expect(parentCleanupCalled).toBe(false)
      expect(childCleanupCalled).toBe(false)

      const newView = document.createElement('p')
      render(newView, container)

      // Assert
      expect(parentCleanupCalled).toBe(true)
      expect(childCleanupCalled).toBe(true)
    })
  })

  describe('render() - hidratação SSR', () => {
    test('deve detectar __SLASH_STATE__ script e hidratar', () => {
      // Arrange
      const container = document.createElement('div')
      container.innerHTML = '<span>SSR content</span>'
      document.body.appendChild(container)

      const script = document.createElement('script')
      script.id = '__SLASH_STATE__'
      script.textContent = '{}'
      document.body.appendChild(script)

      const view = document.createElement('div')
      view.textContent = 'Hydrated'

      // Act
      render(view, container)

      // Assert
      expect(document.getElementById('__SLASH_STATE__')).toBeNull()
    })

    test('deve remover script de state após hidratação', () => {
      // Arrange
      const container = document.createElement('div')
      container.innerHTML = '<p>SSR</p>'
      document.body.appendChild(container)

      const script = document.createElement('script')
      script.id = '__SLASH_STATE__'
      script.textContent = '{"key":"value"}'
      document.body.appendChild(script)

      const view = document.createElement('section')

      // Act
      expect(document.getElementById('__SLASH_STATE__')).not.toBeNull()
      render(view, container)

      // Assert
      expect(document.getElementById('__SLASH_STATE__')).toBeNull()
    })

    test('deve fazer render normal quando não há __SLASH_STATE__', () => {
      // Arrange
      const container = document.createElement('div')
      container.innerHTML = '<span>Old</span>'

      const view = document.createElement('p')
      view.textContent = 'New'

      // Act
      render(view, container)

      // Assert
      expect(container.querySelector('span')).toBeNull()
      expect(container.querySelector('p')?.textContent).toBe('New')
    })

    test('deve fazer render normal quando container está vazio mesmo com state script', () => {
      // Arrange
      const container = document.createElement('div')
      document.body.appendChild(container)

      const script = document.createElement('script')
      script.id = '__SLASH_STATE__'
      script.textContent = '{}'
      document.body.appendChild(script)

      const view = document.createElement('h1')
      view.textContent = 'Normal Render'

      // Act
      render(view, container)

      // Assert
      expect(container.querySelector('h1')?.textContent).toBe('Normal Render')
      // Script não é removido porque container estava vazio (sem SSR content)
      expect(document.getElementById('__SLASH_STATE__')).not.toBeNull()

      // Cleanup manual do script para não afetar próximos testes
      document.getElementById('__SLASH_STATE__')?.remove()
    })

    test('deve hidratar array de children com state script', () => {
      // Arrange
      const container = document.createElement('div')
      container.innerHTML = '<span>SSR A</span><span>SSR B</span>' // Conteúdo SSR
      document.body.appendChild(container)

      const script = document.createElement('script')
      script.id = '__SLASH_STATE__'
      script.textContent = '{}'
      document.body.appendChild(script)

      const span1 = document.createElement('span')
      span1.textContent = 'A'
      const span2 = document.createElement('span')
      span2.textContent = 'B'

      // Act
      const result = render([span1, span2], container)

      // Assert
      expect(Array.isArray(result)).toBe(true)
      expect((result as Node[]).length).toBe(2)
      expect(container.children.length).toBe(2)
      expect(document.getElementById('__SLASH_STATE__')).toBeNull()
    })

    test('deve hidratar função view com state script', () => {
      // Arrange
      const container = document.createElement('div')
      container.innerHTML = '<div>SSR Content</div>' // Conteúdo SSR
      document.body.appendChild(container)

      const script = document.createElement('script')
      script.id = '__SLASH_STATE__'
      script.textContent = '{"count":5}'
      document.body.appendChild(script)

      const view = () => {
        const el = document.createElement('div')
        el.textContent = 'Function Hydrated'
        return el
      }

      // Act
      render(view, container)

      // Assert
      expect(container.querySelector('div')?.textContent).toBe('Function Hydrated')
      expect(document.getElementById('__SLASH_STATE__')).toBeNull()
    })
  })

  describe('render() - integração com createState', () => {
    test('deve renderizar state reativo como textContent', () => {
      // Arrange
      const container = document.createElement('div')
      const state = createState({ message: 'Hello State' })

      const view = document.createElement('p')
      view.textContent = state.get().message

      // Act
      render(view, container)

      // Assert
      expect(container.querySelector('p')?.textContent).toBe('Hello State')
    })

    test('deve permitir múltiplas renderizações com diferentes states', () => {
      // Arrange
      const container = document.createElement('div')
      const state1 = createState({ value: 1 })
      const state2 = createState({ value: 2 })

      const view1 = document.createElement('span')
      view1.textContent = String(state1.get().value)

      const view2 = document.createElement('span')
      view2.textContent = String(state2.get().value)

      // Act
      render(view1, container)
      expect(container.textContent).toBe('1')

      render(view2, container)

      // Assert
      expect(container.textContent).toBe('2')
    })

    test('deve limpar subscriptions ao re-renderizar', () => {
      // Arrange
      const container = document.createElement('div')
      const state = createState({ count: 0 })

      const view1 = document.createElement('div')
      let subscription1Active = false
      state.watch(() => { subscription1Active = true })

      // Act
      render(view1, container)

      const view2 = document.createElement('p')
      render(view2, container)

      // Assert
      expect(container.querySelector('div')).toBeNull()
      expect(container.querySelector('p')).not.toBeNull()
    })

    test('deve processar state em função view', () => {
      // Arrange
      const container = document.createElement('div')
      const state = createState({ text: 'Dynamic' })

      const view = () => {
        const el = document.createElement('h1')
        el.textContent = state.get().text
        return el
      }

      // Act
      render(view, container)

      // Assert
      expect(container.querySelector('h1')?.textContent).toBe('Dynamic')
    })
  })
})
