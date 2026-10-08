# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui, seguindo [Conventional Commits](https://www.conventionalcommits.org/) e [SemVer](https://semver.org/).

## [0.0.3] — 2026-10-08

Primeira versão utilizável do `slash` no npm: **a 0.0.1 e a 0.0.2 tinham o build CJS quebrado** (todo `require("@_bashell/slash...")` falhava) e a **0.0.2 foi descartada** (rejeitada antes de ser liberada). Esta versão também torna o core **seguro por padrão**, o que traz mudanças incompatíveis: leia a seção "Breaking changes" e o [guia de migração](./MIGRATION.md#migrating-to-003-secure-by-default).

### Security

Tudo abaixo vale no cliente e no SSR, sem configuração. Referência completa: [docs/19-security](./docs/19-security/README.md).

- **SEC-01, XSS pelo SSR:** uma string que começava com `<` era emitida como HTML pronto. Agora toda string é escapada; HTML confiável precisa de `unsafeHtml()` (ou de um template `htmlString`).
- **SEC-02, nomes de atributo:** nomes de atributo inválidos (que poderiam fechar a tag e injetar outros atributos) são descartados no SSR e no cliente.
- **SEC-03, handlers:** uma regra única no cliente e no SSR: toda prop que começa com `on` (qualquer caixa) é um evento e só função, objeto `handleEvent` ou tupla `[fn, opções]` é anexado; qualquer outro valor é descartado com aviso em dev. Atributos comuns que comecem com "on" precisam do prefixo `data-`.
- **SEC-04, URLs perigosas:** `javascript:`, `vbscript:`, `data:text/html`, `file:` e qualquer esquema fora da lista de permissão (`http`, `https`, `mailto`, `tel`, `sms`) em `href`, `src`, `action`, `formaction`, `srcset`, `poster`, `xlink:href`, `<object data>`, etc. viram `about:blank#blocked`. `data:image/*` seguro só em imagens; `blob:` só em `src` de mídia (`img`, `audio`, `video`, `source`, `track`) e `data:image/svg+xml` só em `img src`/`srcset` e em `url()` de CSS. `srcset` e `meta refresh` com mais de 16 KB são bloqueados (análise linear). A política é de esquema: a origem de `<base>`, `<script src>`, `<iframe src>` e `<link>` vinda de entrada de usuário é responsabilidade do app. Vale também para a URL de `<meta http-equiv="refresh" content="N;url=...">` (o `content` de outros `<meta>` não é alterado) e para `to`/`from`/`values` de animações SVG.
- **SEC-05, `innerHTML`/`srcdoc`:** as props `innerHTML`, `outerHTML`, `insertAdjacentHTML` e `srcdoc` (string) são bloqueadas; `srcdoc` só aceita `unsafeHtml(...)`.
- **SEC-06, vazamento entre requisições:** o estado do SSR deixou de ser global; `renderToStream` simultâneos não misturam dados entre usuários.
- **SEC-07, `Link` e roteador:** o `Link` só navega para caminhos do app (`/x`, `?q`, `#h`); `to="javascript:..."` ou `//outro.com` não navegam mais. Link externo exige `external` (`http(s)`, `mailto:`, `tel:`, `sms:`). O interceptador de cliques só assume links `http(s)` da mesma origem (respeitando `<base>`) e deixa o navegador agir com ctrl/meta/shift/alt, botão não esquerdo, `target` diferente de `_self` e `download`. Barras invertidas viram o caminho da mesma origem (`/\evil` vai para `/evil`). Um `push` recusado pelo navegador rejeita com `Navigation failed: ...` sem dessincronizar o estado, e um `pushState` que lança no clique cai na navegação nativa.
- **SEC-08, nomes de tag:** nome de tag dinâmico inválido lança erro em vez de gerar HTML quebrado.
- **SEC-09, `style`:** política de CSS estrita e fail-closed, em strings e objetos. Uma declaração é descartada (com aviso em dev) quando contém `/*` em qualquer lugar, tem uma string com quebra de linha crua, CR, FF ou NUL, barra invertida seguida de quebra de linha ou sem fechamento, tem barra invertida fora de aspas (escapes dentro de aspas continuam válidos), tem `url(` sem aspas com caracteres fora de `[A-Za-z0-9-._~:/?#@!$&+,;=%]`, ou usa `-moz-binding`, `behavior` ou `behaviour` como propriedade. `url()`, com ou sem aspas, segue a política de `<img src>` (relativos, `data:image/png|jpeg|gif|webp|avif`, `data:image/svg+xml` e `blob:` passam; `javascript:`, `data:text/html` e `vbscript:` não); `image()`, `image-set()`, `cross-fade()`, `element()`, `paint()`, `src()` e `expression()` são fiscalizadas. Um `style` com mais de 8 KB é descartado por inteiro e um `style` vazio é omitido. Quebras de linha entre declarações são válidas.
- **SEC-10, `formToObject`:** nomes de campo como `__proto__` ou `constructor` não colidem mais com `Object.prototype`.
- **SEC-11, `parseQuery`:** percent-encoding malformado (`?q=%E0%A4%A`) não derruba mais a navegação; valores com `=` não são truncados.
- **SEC-12, `deepClone`:** um `__proto__` vindo de JSON não altera o protótipo do clone, e uma chave `hasOwnProperty` não lança. Um estado circular ou aninhado em mais de 1000 níveis lança `State is circular or nested deeper than 1000 levels and cannot be cloned`.
- **SEC-13, hidratação:** atributos `data-reactive-*` lidos do DOM passam pela mesma política de atributos.
- **SEC-14, divergência cliente/SSR:** `onclick` em string tem o mesmo tratamento nos dois lados (ignorado).
- **SEC-15, interceptador de links:** o comportamento do interceptador global de links do roteador foi documentado em [ROUTER.md](./ROUTER.md).
- **SEC-16, `<script>` e `<style>` dinâmicos:** valores dinâmicos (strings, números, arrays, componentes, templates aninhados e reativos) são descartados no cliente e no SSR, com aviso em dev. Só passam o texto estático do template e `unsafeHtml(...)`. As props `text`, `textContent` e `innerText` de `<script>`/`<style>` também exigem `unsafeHtml`.
- **SEC-17, props:** uma prop com nome de método do DOM (`click`, `focus`...) vira atributo e nunca sobrescreve o método; `constructor` e props de protótipo são bloqueadas no cliente e no SSR; a gramática de nome de atributo (ASCII) é a mesma nos dois lados.
- **Estado e loaders em `<script>`:** `serializeStateForScript` e `serializeLoaderData` escapam `<`, `>`, `&`, U+2028 e U+2029, então um valor `</script><img onerror=...>` não executa. `renderToStream` usa o mesmo escape.

### Breaking changes

- **`htmlString` devolve `SafeHtml`**, não `string`. Migre: `String(x)` ou `renderToString(() => x).html`. (`renderToString().html` continua `string`.)
- **Strings com HTML viram texto**, no SSR e no cliente (componentes que retornam `"<div>...</div>"`, Markdown/CMS, ícones SVG em string). Migre: retorne um template `htmlString`/`html`, ou `unsafeHtml(str)` para HTML confiável.
- **Props `innerHTML`, `outerHTML` e `srcdoc` (string) são ignoradas.** Migre: `unsafeHtml(...)` como filho; `srcdoc=${unsafeHtml(...)}`.
- **URLs bloqueadas.** Esquemas fora de `http(s)`, `mailto:`, `tel:`, `sms:` e relativas viram `about:blank#blocked`. Migre: use uma URL válida ou `unsafeUrl(url)` para uma URL confiável.
- **`Link` só aceita caminhos do app.** `./x`, `../x`, `about` e URLs absolutas ficam bloqueados. Migre: use `/x`, `?q` ou `#h`; para site externo, `external`. `?q` e `#h` agora são relativos à página atual, e links `mailto:`, `tel:`, `sms:` ou de outra origem deixam de ser interceptados.
- **Props `on*` que não são função são descartadas** (`onclick="..."`, booleanos, objetos), no cliente e no SSR. Migre: `onClick=${fn}`; atributos comuns que comecem com "on" passam a `data-*`.
- **`<script>` e `<style>` com valores dinâmicos:** strings, números, arrays, componentes e reativos dinâmicos são descartados (e avisam em dev), no cliente e no SSR; antes o SSR só os escapava, o que deixava `alert(1)` executar. Migre: `unsafeHtml(serializeStateForScript(dados))` para JSON; um `<` literal em `<script>` estático dentro de `htmlString` também precisa de `unsafeHtml(...)` (limitação do htm).
- **O script de estado precisa de `type="application/json"`.** `render()` só lê `<script id="__SLASH_STATE__" type="application/json">` (aviso em dev se faltar o `type`). Migre: adicione o atributo.
- **Builds de dev e de produção.** O pacote tem `dist/dev` (com avisos), escolhido pela condição de exportação `development` (Vite em dev e webpack em modo development); o padrão é o build de produção, sem avisos de dev. Os erros continuam em `console.error` nos dois. Para forçar os avisos: `--conditions=development`. Migre: nada, a menos que você dependa de um aviso em CI.
- **Mensagens de runtime em inglês.** Avisos e erros que estavam em português (`URL bloqueada`, `deve ser um caminho do app`...) agora são em inglês; ajuste testes que comparam o texto.
- **`State` não é reativo no SSR.** `${state}` não se atualiza; interpole `state.get()`.
- **`router.ready` é obrigatório no tipo `RouterInstance`.** Mocks escritos à mão precisam de `ready: Promise.resolve()`.
- **`router.push` para a URL atual não reconstrói a página**, e `Router` só atualiza quando o caminho, os params ou a query mudam.
- **Internos removidos:** `__addBatchEndCallback`, `__removeBatchEndCallback` e `__recordBatchUpdate`. Migre: use `batch()` para agrupar e `state.watch()` para observar.
- **Query e `formToObject()` sem protótipo** (`Object.create(null)`). Migre: `Object.hasOwn(obj, "campo")` no lugar de `obj.hasOwnProperty(...)`.
- **Pacote npm menor:** não inclui mais `.gz`/`.br`, e os sourcemaps não carregam `sourcesContent` (`src` continua no pacote). `build:compress` deixou de fazer parte de `bun run build`.
- **Escapes CSS fora de aspas não são aceitos** (`\6c`, `\2022` soltos no valor ou no nome da propriedade). Migre: coloque o valor entre aspas (`content:"\2022"`).
- **Comentários `/* */` não são permitidos em `style`** (a declaração com `/*` é descartada, até dentro de aspas). Migre: remova o comentário do `style` (comente no código ou no CSS).
- **`url()` sem aspas só aceita `[A-Za-z0-9-._~:/?#@!$&+,;=%]`.** Migre: use aspas, `url("a b.png")`.
- **`style` com mais de 8 KB é descartado por inteiro.** Migre: mova o excesso para uma folha de estilos ou classes.
- **Strings de `style` são sanitizadas no cliente** (antes eram aplicadas como vieram); declarações inseguras são removidas. Migre: mantenha só valores CSS seguros; para uma URL fora da política (em `url()` ou no `content` de um `meta refresh`), use `unsafeUrl()` no atributo ou no `content`, não dentro da string de `style`.
- **`unsafeUrl()` só vale em atributos de URL e no `content` de `<meta http-equiv="refresh">`**, e `SafeHtml`/`SafeUrl` guardados em estado reativo perdem a marca ao serializar para hidratação (falham fechado: viram texto ou a URL é sanitizada). Reembrulhe no cliente se precisar.

### Fixed

- **Router:** `<${Router} router=${router} />` dentro de um componente quebrava na primeira navegação (`removeChild ... not a child`) e a URL não mudava. Agora o reativo usa o pai vivo dos marcadores.
- **Componentes:** só os estados lidos na *primeira* renderização eram observados; leituras condicionais nunca assinavam. Agora cada render refaz o rastreamento e reconcilia os observers. Estados lidos dentro do conteúdo reativo de um filho (ex.: `Router`) não assinam mais o componente pai.
- **Router, navegação inicial:** no navegador ela agora passa pelos guards (globais e da rota), redirects e fallback; em `mode: "hash"` a rota inicial vem de `location.hash`; `initialPath` e o estado do servidor também passam pelos guards depois de aplicados. Inclui `router.ready`, limite de 10 redirects encadeados e descarte de navegações antigas (a última vence). Guards que rodavam duas vezes no modo hash rodam uma.
- **Router no SSR** escapava o HTML da rota (`&lt;h1&gt;`) e o duplicava no JSON de estado.
- **`Router`** deixou de re-renderizar a rota a cada alternância de `isNavigating`.
- **SSR:** `State` lido durante o render deixou de ser tratado como reativo (saía `[Object]`).
- **Estado em `<script>`:** `renderToStream` inseria o JSON sem escape (`</script>` executava código).
- **`serializeLoaderData`** inseria o JSON sem escape em `<script>`.
- **`batch()`:** cada estado criado registrava um callback global que nunca era removido (vazamento de memória e CPU); o fim do lote notificava estados que não mudaram; o fim de um lote interno encerrava o externo; um observador que lançava erro impedia os demais. Agora os observers rodam todos, o primeiro erro chega a quem chamou e uma exceção dentro de `batch(fn)` ainda notifica os estados alterados.
- **`state.set` dentro de um observer:** o loop externo entregava o valor antigo por último. Agora vale o valor mais recente, entregue de forma síncrona (`último recebido == get()`).
- **Build:** `dist/*.cjs` estava quebrado em 0.0.1 e 0.0.2 (o Bun não faz splitting em CJS) e o ESM falhava com `Export 'T' not defined` ao importar o servidor. Corrigido com imports ESM em `hydration/walker.ts` e splitting só no ESM. O novo `bun run verify:dist` (rodado no `publish.yml`) importa e dá `require` em todos os entrypoints de `package.json`.
- Documentação: exemplos de `batch` e SSR alinhados com o comportamento real; `ErrorBoundary` documentado com a limitação (filhos já foram construídos pelo `html`; use `safeRender(() => view, fallback)`).

### Added

- `sanitizeUrl(attr, value, tag?)` e `BLOCKED_URL`, em `@_bashell/slash/core` e `@_bashell/slash/ssr`, para validar uma URL com a mesma política dos templates.
- Build de desenvolvimento (`dist/dev`) escolhido pela condição `development`; `bun run verify:dist` confere os dois builds.
- Esquema `sms:` na lista de permissão e em `Link external`.
- `unsafeHtml(html)`, `isSafeHtml(x)` e o tipo `SafeHtml`, em `@_bashell/slash/core` e `@_bashell/slash/ssr`.
- `unsafeUrl(url)`, `isSafeUrl(x)` e o tipo `SafeUrl`.
- `serializeStateForScript(state)` em `@_bashell/slash/ssr`.
- `router.ready` (`Promise<void>`) e a prop `external` do `Link`.
- `bun run verify:dist`.
- Página [docs/19-security](./docs/19-security/README.md) e seção "Security" no README.

### Tamanho do bundle

Bundle de produção do core (app com `createState`, `html` e `render`, minificado): **8,39 KB gzip / 7,45 KB brotli**, contra 5,02 KB / 4,39 KB antes do ciclo de segurança. O aumento é o custo da camada de segurança: políticas de URL e de CSS, `SafeHtml`/`SafeUrl`, regras do roteador e tratamento de `meta refresh`; as mensagens de aviso de dev ficam fora do build de produção. Limites do teste de tamanho: 8,64 KB gzip / 7,67 KB brotli. O pacote npm tem 251 kB (sem `.gz`/`.br`; sourcemaps sem `sourcesContent`; `src` incluso).

## [0.0.2] — 2026-10-08

### Documentação
- README reescrito a partir da API real (`createState`, `batch`, imports `@_bashell/slash/*`), com exemplos verificados.
- `ROUTER.md`, guias em `docs/`, `MIGRATION.md`, `state.md` e `SCRIPTS.md` alinhados com a API atual.
- Descrição do pacote no npm sem a menção antiga a "signals".

## [0.0.1] — 2026-10-08

Primeira versão pública do `slash`.
