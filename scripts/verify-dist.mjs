// scripts/verify-dist.mjs
// Carrega no Node cada entrypoint publicado (import e require) dos DOIS builds listados
// em package.json "exports": produção (dist/) e desenvolvimento (condição "development",
// dist/dev/). O build pode "passar" e ainda gerar chunks que quebram em runtime (ex.:
// export de identificador não declarado), então esta verificação roda depois do build e
// antes de publicar. Também confere que os avisos de dev existem só no build de dev.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));

// Textos de avisos de dev (src/): presentes no build de dev, ausentes no de produção.
// Substrings estáveis (nomes de API e de atributo, que sobrevivem à tradução das mensagens).
const DEV_WARNING_TEXTS = ['unsafeHtml()', 'unsafeUrl()', 'data-reactive-*', 'onClick=${fn}', 'Unexpected object in child position', 'called from'];
// Erros de runtime: console.error NUNCA pode ser removido de nenhum build.
const CONSOLE_ERROR = 'console.error';

// console.warn emitted by securityWarn: `[slash] ${message}` (the SSR warning has "SSR:" after the prefix)
const SECURITY_WARN_PATTERN = /console\.warn\(`\[slash\] \$\{/;

const failures = [];

// Todos os arquivos .mjs/.cjs de um diretório de build (sem descer em dev/ nem types/)
function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(mjs|cjs)$/.test(entry.name))
    .map((entry) => resolve(dir, entry.name));
}

// Resolução real pelo "exports": condições padrão -> produção; --conditions=development -> dev.
function probe(conditions) {
  const args = conditions ? [`--conditions=${conditions}`] : [];
  const output = execFileSync(process.execPath, [...args, resolve(ROOT, 'scripts/resolve-probe.mjs')], { encoding: 'utf-8' });
  return JSON.parse(output);
}

for (const [label, conditions, dir] of [['prod', '', resolve(ROOT, 'dist')], ['dev', 'development', resolve(ROOT, 'dist/dev')]]) {
  let resolved;
  try {
    resolved = probe(conditions);
  } catch (error) {
    failures.push(`resolution (${label}): ${error.message}`);
    continue;
  }
  for (const [subpath, kinds] of Object.entries(resolved)) {
    for (const [kind, file] of Object.entries(kinds)) {
      const inDir = resolve(file, '..') === dir;
      if (!inDir) failures.push(`resolution ${label} ${subpath} (${kind}): ${file} is outside ${dir}`);
      if (!existsSync(file)) failures.push(`resolution ${label} ${subpath} (${kind}): ${file} does not exist`);
    }
  }
}

const builds = [
  { label: 'prod', pick: (targets) => targets, dir: resolve(ROOT, 'dist') },
  { label: 'dev', pick: (targets) => targets.development, dir: resolve(ROOT, 'dist/dev') },
];

for (const { label, pick, dir } of builds) {
  for (const [subpath, conditions] of Object.entries(pkg.exports)) {
    const targets = pick(conditions);
    if (!targets || !targets.import || !targets.require) {
      failures.push(`${label} ${subpath}: exports has no import/require`);
      continue;
    }
    const loaded = {};

    try {
      loaded.import = await import(pathToFileURL(resolve(ROOT, targets.import)).href);
    } catch (error) {
      failures.push(`${label} ${subpath} (import ${targets.import}): ${error.message}`);
    }

    try {
      loaded.require = require(resolve(ROOT, targets.require));
    } catch (error) {
      failures.push(`${label} ${subpath} (require ${targets.require}): ${error.message}`);
    }

    const esmKeys = loaded.import ? Object.keys(loaded.import).sort() : [];
    const cjsKeys = loaded.require ? Object.keys(loaded.require).sort() : [];

    if (loaded.require && cjsKeys.length === 0) {
      failures.push(`${label} ${subpath}: require exposes no exports`);
    }
    // O CJS é gerado sem splitting e serve de referência da API pública. No ESM,
    // um entrypoint que também é chunk de outro (ex.: core.mjs usado por index.mjs)
    // expõe nomes internos minificados a mais: isso só gera aviso.
    if (loaded.import && loaded.require) {
      const missing = cjsKeys.filter((key) => !esmKeys.includes(key));
      if (missing.length > 0) {
        failures.push(`${label} ${subpath}: import does not expose ${missing.join(', ')}`);
      }
      const extra = esmKeys.filter((key) => !cjsKeys.includes(key));
      if (extra.length > 0) {
        console.warn(`  ⚠ ${label} ${subpath}: import exposes extra internal names (${extra.join(', ')})`);
      }
      console.log(`  ✓ ${label} ${subpath} (${esmKeys.length} exports)`);
    }
  }

  // Conteúdo: avisos de dev só no build de dev; console.error em ambos.
  const files = jsFiles(dir);
  const code = files.map((file) => readFileSync(file, 'utf-8')).join('\n');
  for (const text of DEV_WARNING_TEXTS) {
    const present = code.includes(text);
    if (label === 'prod' && present) failures.push(`prod: contains dev warning "${text}"`);
    if (label === 'dev' && !present) failures.push(`dev: does not contain dev warning "${text}"`);
  }
  // securityWarn: console.warn(`[slash] ${message}`) must exist only in dev. The pattern is
  // specific to that call, so it never matches the console.error runtime errors or SSR warnings.
  const securityWarnPresent = SECURITY_WARN_PATTERN.test(code);
  if (label === 'prod' && securityWarnPresent) failures.push('prod: contains securityWarn console.warn output');
  if (label === 'dev' && !securityWarnPresent) failures.push('dev: does not contain securityWarn console.warn output');
  if (!code.includes(CONSOLE_ERROR)) {
    failures.push(`${label}: no ${CONSOLE_ERROR} in the build (console.* must not be removed)`);
  }
}

if (failures.length > 0) {
  console.error('❌ dist/ is invalid:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('✅ All entrypoints in dist/ (production) and dist/dev/ (development) load');
