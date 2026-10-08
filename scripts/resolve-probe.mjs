// scripts/resolve-probe.mjs
// Roda DENTRO de um processo node (com ou sem --conditions=development) e imprime, em JSON,
// onde cada subpath do pacote resolve via import.meta.resolve (ESM) e require.resolve (CJS).
// Usado por verify-dist.mjs; a auto-referência pelo nome do pacote passa pelo "exports" real.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
const require = createRequire(import.meta.url);

const out = {};
for (const subpath of Object.keys(pkg.exports)) {
  const specifier = subpath === '.' ? pkg.name : `${pkg.name}/${subpath.slice(2)}`;
  out[subpath] = {
    import: fileURLToPath(import.meta.resolve(specifier)),
    require: require.resolve(specifier),
  };
}
console.log(JSON.stringify(out));
