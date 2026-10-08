# Scripts de Build e Desenvolvimento

Este documento explica o sistema de scripts do projeto.

## Instalação

Primeiro, instale as dependências:

```bash
bun install
```

## Desenvolvimento

### Modo Watch Completo (Recomendado)

Roda TypeScript + Bundle ESM em modo watch:

```bash
bun run dev
```

Isso inicia dois processos em paralelo:
- **types**: Gera arquivos `.d.ts` automaticamente quando você edita `.ts`
- **bundle**: Gera bundle ESM em `dist/index.js` automaticamente

### Modo Watch Individual

Se preferir rodar separadamente:

```bash
# Terminal 1: Tipos
bun run dev:types

# Terminal 2: Bundle ESM
bun run dev:bundle
```

## Produção

### Build Completo

Gera todos os arquivos de distribuição:

```bash
bun run build
```

Isso executa:
1. `clean` - Remove `dist/`
2. `build:types` - Gera arquivos `.d.ts`
3. `build:esm` - Gera `dist/index.mjs` (minificado)
4. `build:cjs` - Gera `dist/index.cjs` (minificado)

### Build Individual

```bash
# Apenas tipos
bun run build:types

# Apenas ESM
bun run build:esm

# Apenas CJS
bun run build:cjs

# Limpar dist/
bun run clean
```

## Testes

```bash
# Rodar testes uma vez
bun test

# ou
bun run test

# Modo watch (roda testes automaticamente)
bun run test:watch
```

## Estrutura de Outputs

```
dist/
├── index.mjs          # Bundle ESM (produção, minificado)
├── index.mjs.map      # Source map ESM
├── index.cjs          # Bundle CJS (produção, minificado)
├── index.cjs.map      # Source map CJS
├── index.js           # Bundle ESM (dev, não minificado)
└── types/             # Arquivos de definição TypeScript
    ├── index.d.ts
    ├── signals.d.ts
    ├── hyper.d.ts
    └── ...
```

## Variáveis de Ambiente

- `NODE_ENV=production` - Build minificado para produção
- `FORMAT=esm|cjs` - Formato do bundle (ESM ou CommonJS)

## Fluxo de Trabalho Recomendado

### Durante Desenvolvimento

```bash
# 1. Inicie o modo watch
bun run dev

# 2. Edite arquivos em src/
# 3. Os bundles são reconstruídos automaticamente
# 4. Rode testes quando necessário
bun run test:watch
```

### Antes de Publicar

```bash
# 1. Rode os testes
bun test

# 2. Gere o build de produção
bun run build

# 3. Verifique os arquivos gerados
ls -lh dist/

# 4. Publique (quando estiver pronto)
npm publish
```

## Troubleshooting

### "command not found: concurrently"

Execute `bun install` para instalar as dependências.

### Build não atualiza

Limpe e reconstrua:

```bash
bun run clean
bun run build
```

### Tipos não são gerados

Verifique se o `tsconfig.json` está correto e rode:

```bash
bun run build:types
```
