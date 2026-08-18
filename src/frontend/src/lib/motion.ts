/**
 * True if the user has requested reduced motion, or if matchMedia isn't
 * available at all (older browsers, some test/SSR environments) - in both
 * cases we skip decorative animation rather than risk throwing.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}
