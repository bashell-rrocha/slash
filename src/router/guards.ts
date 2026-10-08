/**
 * Navigation guards pipeline
 */

import type { NavigationGuard, RouteMatch } from "./types"

/**
 * Result of guard execution
 */
export interface GuardResult {
  /** Whether navigation is allowed */
  allowed: boolean
  /** Redirect path (if guard returns a string) */
  redirect?: string
}

/**
 * Execute navigation guards in sequence
 * Stops at the first guard that returns false or a redirect
 *
 * @param guards - Array of navigation guards
 * @param to - Target route
 * @param from - Current route (null if no current route)
 * @returns Guard result indicating whether to allow or block navigation
 */
export async function executeGuards(
  guards: NavigationGuard[],
  to: RouteMatch,
  from: RouteMatch | null
): Promise<GuardResult> {
  // If no guards, allow navigation
  if (!guards || guards.length === 0) {
    return { allowed: true }
  }

  // Execute guards in order
  for (const guard of guards) {
    try {
      const result = await guard(to, from)

      // Guard returned false - block navigation
      if (result === false) {
        return { allowed: false }
      }

      // Guard returned a string - redirect
      if (typeof result === "string") {
        return { allowed: false, redirect: result }
      }

      // Guard returned void or true - continue to next guard
    } catch (error) {
      // Guard threw an error - block navigation
      console.error("Navigation guard error:", error)
      return { allowed: false }
    }
  }

  // All guards passed
  return { allowed: true }
}
