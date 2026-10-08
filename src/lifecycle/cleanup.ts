const CLEANUPS = new WeakMap<Node, Array<() => void>>();

export function addCleanup(node: Node, fn: () => void): void {
  const arr = CLEANUPS.get(node);
  if (arr) arr.push(fn);
  else CLEANUPS.set(node, [fn]);
}

export function destroyNode(node: Node): void {
  const fns = CLEANUPS.get(node);
  if (fns) {
    for (const f of fns) {
      try {
        f();
      } catch {}
    }
    CLEANUPS.delete(node);
  }
  if (node instanceof Element && node.hasChildNodes()) {
    node.childNodes.forEach((child) => destroyNode(child));
  }
}

export function hasCleanups(node: Node): boolean {
  return CLEANUPS.has(node);
}
