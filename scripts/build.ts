// scripts/build.ts
import { resolve } from 'node:path';
import { rename, readFile, writeFile } from 'node:fs/promises';
import { writeFileSync, unlinkSync } from 'node:fs';

const isDev = process.env.NODE_ENV !== 'production';
const format = process.env.FORMAT || 'esm';
const watch = process.argv.includes('--watch');

type BuildConfig = Parameters<typeof Bun.build>[0];

const ROOT = resolve(import.meta.dir, '..');

// Criar entry points temporários para router e forms na raiz para evitar '../' nos imports
const tempRouterPath = resolve(ROOT, 'src/_router.ts');
const tempFormsPath = resolve(ROOT, 'src/_forms.ts');

if (!watch) {
  writeFileSync(tempRouterPath, 'export * from "./router/index";\n');
  writeFileSync(tempFormsPath, 'export * from "./forms/index";\n');
}

// Entrypoints para code splitting
const entrypoints = [
  resolve(ROOT, 'src/index.ts'),    // Full bundle
  resolve(ROOT, 'src/core.ts'),     // Core minimal
  resolve(ROOT, 'src/ssr.ts'),      // SSR only
  watch ? resolve(ROOT, 'src/router/index.ts') : tempRouterPath,  // Router only
  watch ? resolve(ROOT, 'src/forms/index.ts') : tempFormsPath,    // Forms only
];

const config: BuildConfig = {
  entrypoints,
  outdir: resolve(ROOT, 'dist'),
  format: format as 'esm' | 'cjs',
  sourcemap: isDev ? 'inline' : 'external',
  minify: !isDev ? {
    whitespace: true,
    syntax: true,
    identifiers: true,
  } : false,
  naming: isDev ? '[dir]/[name].[ext]' : '[dir]/[name].[ext]',
  target: 'browser',
  splitting: true, // Habilitado para compartilhar código comum entre chunks
  drop: isDev ? [] : ['console', 'debugger'],
  define: {
    'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
  },
};

if (watch) {
  // @ts-ignore - watch existe em runtime mas não na tipagem
  config.watch = {
    onWatch(_event: any, path: string) {
      console.log(`📝 Changed: ${path}`);
    },
    onRebuildEnd(result: any) {
      if (!result.success) {
        console.error('❌ Build failed');
        for (const log of result.logs) {
          console.error(log);
        }
        return;
      }
      const size = result.outputs.reduce((acc: number, o: any) => acc + o.size, 0);
      const sizeKB = (size / 1024).toFixed(2);
      console.log(`✅ Rebuilt ${format} - ${sizeKB}KB`);
    },
  };
  console.log(`👀 Watching ${format} bundle...`);
}

const result = await Bun.build(config);

if (!result.success) {
  console.error('❌ Build failed');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Renomear arquivos para extensões corretas (.mjs ou .cjs)
if (!isDev && result.outputs.length > 0) {
  const ext = format === 'esm' ? 'mjs' : 'cjs';
  for (const output of result.outputs) {
    const oldPath = output.path;
    if (oldPath.endsWith('.js')) {
      // Determinar o nome correto baseado no arquivo de entrada
      let newPath = oldPath.replace(/\.js$/, `.${ext}`);

      // Renomear arquivos temporários _router/_forms para router/forms
      if (oldPath.includes('/_router.')) {
        newPath = newPath.replace('/_router', '/router');
      } else if (oldPath.includes('/_forms.')) {
        newPath = newPath.replace('/_forms', '/forms');
      }

      await rename(oldPath, newPath);

      // Ler o conteúdo e atualizar imports de .js para .mjs/.cjs
      let content = await readFile(newPath, 'utf-8');

      // Atualizar imports relativos de .js para a extensão correta
      // Precisa capturar tanto import/export quanto import()
      content = content.replace(/from\s*["']\.\/([^"']+)\.js["']/g, `from "./$1.${ext}"`);
      content = content.replace(/from\s*["']\.\.\/([^"']+)\.js["']/g, `from "../$1.${ext}"`);
      content = content.replace(/import\s*["']\.\/([^"']+)\.js["']/g, `import "./$1.${ext}"`);
      content = content.replace(/import\s*["']\.\.\/([^"']+)\.js["']/g, `import "../$1.${ext}"`);
      content = content.replace(/import\s*\(\s*["']\.\/([^"']+)\.js["']\s*\)/g, `import("./$1.${ext}")`);
      content = content.replace(/import\s*\(\s*["']\.\.\/([^"']+)\.js["']\s*\)/g, `import("../$1.${ext}")`);

      // Adicionar referência ao source map se não existir
      const fileName = newPath.split('/').pop() || 'index';
      const mapFileName = `${fileName}.map`;
      const sourceMapComment = `\n//# sourceMappingURL=${mapFileName}\n`;

      if (!content.includes('sourceMappingURL=')) {
        content += sourceMapComment;
      }

      await writeFile(newPath, content, 'utf-8');

      console.log(`  ✓ ${newPath.replace(ROOT, '.')}`);
    } else if (oldPath.endsWith('.js.map')) {
      let newPath = oldPath.replace(/\.js\.map$/, `.${ext}.map`);

      // Renomear source maps temporários também
      if (oldPath.includes('/_router.')) {
        newPath = newPath.replace('/_router', '/router');
      } else if (oldPath.includes('/_forms.')) {
        newPath = newPath.replace('/_forms', '/forms');
      }

      await rename(oldPath, newPath);
    }
  }
} else if (result.outputs.length > 0) {
  for (const output of result.outputs) {
    console.log(`  ✓ ${output.path.replace(ROOT, '.')}`);
  }
} else {
  console.warn('⚠️  Warning: No outputs generated!');
}

// Limpar arquivos temporários
if (!watch) {
  try {
    unlinkSync(tempRouterPath);
    unlinkSync(tempFormsPath);
  } catch {
    // Ignore cleanup errors
  }
}

if (!watch) {
  const mode = isDev ? 'dev' : 'prod';
  const size = result.outputs.reduce((acc, o) => acc + o.size, 0);
  const sizeKB = (size / 1024).toFixed(2);
  console.log(`✅ Built ${format} (${mode}) - ${sizeKB}KB`);
} else {
  // Mostrar tamanho inicial em modo watch
  const size = result.outputs.reduce((acc, o) => acc + o.size, 0);
  const sizeKB = (size / 1024).toFixed(2);
  console.log(`✅ Initial build ${format} - ${sizeKB}KB\n`);

  // Manter o processo ativo em modo watch
  await new Promise(() => {});
}
