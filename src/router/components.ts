/**
 * Router components
 */

import type { RouterInstance } from "./types"
import type { Reactive, Child } from "../types"
import { h as originalH } from "../hyper"

// Ensure h function exists
const h = originalH || ((tag: any, props: any, ...children: any[]) => {
  if (typeof tag === "function") {
    return tag({ ...props, children })
  }
  // Fallback for tests/SSR
  return { tag, props, children }
})

/**
 * Router component - renders the current route's component
 */
export function Router({ router }: { router: RouterInstance }): Reactive<Child> {
  return {
    get(): Child {
      const state = router.get()
      if (!state.currentRoute) {
        return null
      }
      return state.currentRoute.route.component(state)
    },
    subscribe(fn: (v: Child) => void): () => void {
      // Re-renderiza só quando a identidade da rota renderizada muda: caminho
      // casado, params ou query (comparados por valor, já que router.get()
      // devolve clones). Alternar isNavigating ou um bloqueio por guard não
      // muda a chave e não reconstrói a página atual (preserva estado local).
      const identity = (s: ReturnType<typeof router.get>): string =>
        s.currentRoute
          ? JSON.stringify([s.currentRoute.path, s.params, s.query])
          : "null"
      let last = identity(router.get())
      return router.watch(() => {
        const state = router.get()
        const key = identity(state)
        if (key === last) return
        last = key
        fn(state.currentRoute ? state.currentRoute.route.component(state) : null)
      })
    },
  }
}

/**
 * Link component - navigation link that uses router.push
 */
export function Link({
  to,
  router,
  children,
  ...props
}: {
  to: string
  router: RouterInstance
  children?: Child
  [key: string]: any
}): Node {
  const handleClick = (e: Event) => {
    e.preventDefault()
    router.push(to).catch((err) => {
      console.error("Navigation error:", err)
    })
  }

  return h(
    "a",
    {
      ...props,
      href: to,
      onClick: handleClick,
    },
    children
  ) as Node
}
