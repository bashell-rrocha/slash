/**
 * Router components
 */

import type { RouterInstance } from "./types"
import type { Reactive, Child } from "../types"
import { h as originalH } from "../hyper"
import { ssrElement } from "../ssr-element"
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

// Normaliza `to`: remove espaços nas pontas. Retorna null se houver caracteres
// de controle (\t \n \r \0...), que os navegadores removem silenciosamente e
// permitiriam disfarçar "//host" como "/\t/host".
function normalizeTo(to: unknown): string | null {
  if (typeof to !== "string") return null
  const t = to.trim()
  // biome-ignore lint/suspicious/noControlCharactersInRegex: detecção intencional de C0
  return /[\u0000-\u001f\u007f]/.test(t) ? null : t
}

// Caminho do app: "/x", "?q" ou "#h". "//host", "/\\host" e "\\host" NÃO são
// (protocol-relative / outra origem).
const APP_PATH = /^(?:\/(?![/\\])|[?#])/
// Destinos externos aceitos com a prop `external`
const EXTERNAL_URL = /^(?:https?:|mailto:|tel:)/i

/**
 * Link component - navigation link that uses router.push
 *
 * `to` deve ser um caminho do app ("/x", "?q", "#h"). Qualquer outro valor NUNCA
 * navega: preventDefault, href = about:blank#blocked e aviso de dev.
 * Exceção explícita: a prop `external` com URL absoluta http(s), mailto ou tel
 * renderiza um link nativo com rel="noopener noreferrer" (href passa por
 * sanitizeUrl). As formas "//", "\\" e "/\\" são sempre bloqueadas.
 * No SSR devolve um descritor (ssr-element) que o renderizador de string expande
 * em <a href> com a mesma política de URL (sem handler, sem global mutável).
 */
export function Link({
  to,
  router,
  children,
  external,
  ...props
}: {
  to: string
  router: RouterInstance
  children?: Child
  /** Permite link nativo para URL absoluta http(s), mailto ou tel */
  external?: boolean
  [key: string]: any
}): Node {
  const target = normalizeTo(to)
  const appPath = target !== null && APP_PATH.test(target)
  const nativeExternal =
    !appPath && external === true && target !== null && EXTERNAL_URL.test(target)

  let href: string
  if (appPath) {
    href = target as string
  } else if (nativeExternal) {
    href = sanitizeUrl("href", target as string, "a")
  } else {
    href = BLOCKED_URL
    if (process.env.NODE_ENV !== "production") {
      securityWarn(
        `Link: "to" deve ser um caminho do app (/..., ?... ou #...) ou, com a prop external, uma URL http(s)/mailto/tel; recebido ${JSON.stringify(String(to).slice(0, 40))}`,
        "link:to",
      )
    }
  }

  const handleClick = (e: Event) => {
    if (appPath) {
      e.preventDefault()
      router.push(target as string).catch((err) => {
        console.error("Navigation error:", err)
      })
    } else if (href === BLOCKED_URL) {
      // Nunca navega (nem para about:blank)
      e.preventDefault()
    }
    // external válido: comportamento nativo do navegador
  }

  // SSR (flag do renderToString): descritor que o renderizador de string expande em <a href>
  if ((globalThis as { __SLASH_SSR__?: boolean }).__SLASH_SSR__) {
    return ssrElement(
      "a",
      { ...props, href, ...(nativeExternal ? { rel: "noopener noreferrer" } : {}) },
      children
    ) as unknown as Node
  }

  return h(
    "a",
    {
      ...props,
      href,
      ...(nativeExternal ? { rel: "noopener noreferrer" } : {}),
      onClick: handleClick,
    },
    children
  ) as Node
}
