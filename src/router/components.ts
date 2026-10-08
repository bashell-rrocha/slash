/**
 * Router components
 */

import type { RouterInstance } from "./types"
import type { Reactive, Child } from "../types"
import { h as originalH } from "../hyper"
import { securityWarn } from "../utils/security-warn"
import { BLOCKED_URL, sanitizeUrl } from "../utils/url-policy"

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

// Caminho do app: "/x", "?q" ou "#h". "//host" e "/\\host" são protocol-relative
// (o navegador as trata como outra origem), então NÃO são caminhos do app.
// Mesma normalização do navegador: remove C0 (inclui \t \n \r) e espaços nas pontas.
function isAppPath(to: string): boolean {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: remoção intencional de C0
  const n = to.replace(/[\u0000-\u001f\u007f]/g, "").trim()
  return /^(\/(?![/\\])|[?#])/.test(n)
}

/**
 * Link component - navigation link that uses router.push
 *
 * `to` deve ser um caminho do app ("/x", "?q", "#h"). Qualquer outro valor não
 * navega pelo router: o href passa pela política de URLs (javascript: vira
 * about:blank#blocked) e um aviso de dev é emitido. No SSR renderiza <a href>
 * (usa o renderizador de string registrado em globalThis.__SLASH_SSR_H__).
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
  const target = String(to)
  const appPath = isAppPath(target)
  const href = appPath ? target : sanitizeUrl("href", target, "a")
  if (!appPath) {
    securityWarn(`Link: "to" deve ser um caminho (/..., ?... ou #...), recebido ${JSON.stringify(target.slice(0, 40))}`)
  }

  const handleClick = (e: Event) => {
    if (appPath) {
      e.preventDefault()
      router.push(target).catch((err) => {
        console.error("Navigation error:", err)
      })
    } else if (href === BLOCKED_URL) {
      // Destino bloqueado: não navega nem para about:blank
      e.preventDefault()
    }
    // Demais destinos (https externo): comportamento nativo do navegador
  }

  const g = globalThis as { __SLASH_SSR__?: boolean; __SLASH_SSR_H__?: (...a: unknown[]) => unknown }
  const hSsr = g.__SLASH_SSR__ ? g.__SLASH_SSR_H__ : undefined
  const render = (hSsr as typeof h | undefined) ?? h

  return render(
    "a",
    {
      ...props,
      href,
      onClick: handleClick,
    },
    children
  ) as Node
}
