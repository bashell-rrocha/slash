# Segurança

O Slash é seguro por padrão: você escreve templates do jeito normal e a biblioteca faz a coisa segura. Esta página é a referência completa. Para o resumo, veja a seção [Security](../../README.md#security) do README.

## Regra de ouro

**Uma string é sempre dado, nunca HTML.** Isso vale no cliente (`html`) e no servidor (`htmlString`, `renderToString`, `renderToStream`). Toda string é escapada, inclusive as devolvidas por componentes, por `state.get()` e por reativos.

```typescript
import { html } from "@_bashell/slash/core";

const comentario = '<img src=x onerror="alert(1)">';
html`<p>${comentario}</p>`; // mostra o texto literal; nada executa
```

Para marcação confiável existe um tipo próprio, `SafeHtml`, e duas saídas explícitas.

## Saídas explícitas

| Função | Quando usar | Retorna |
| --- | --- | --- |
| `unsafeHtml(html)` | marcação **confiável** que você mesmo gerou (ícone SVG, Markdown já renderizado **e sanitizado**) | `SafeHtml` |
| `unsafeUrl(url)` | URL **confiável** com esquema que a política bloqueia (por exemplo `myapp://abrir/42`) | `SafeUrl` |

```typescript
import { html, unsafeHtml, unsafeUrl } from "@_bashell/slash/core";

html`<button>${unsafeHtml('<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>')} Salvar</button>`;
html`<a href=${unsafeUrl("myapp://abrir/42")}>Abrir no app</a>`;
```

- **Por que o nome é comprido:** é de propósito. Ele aparece em revisão de código e `grep unsafe` encontra todos os usos.
- **Elas NÃO sanitizam.** Significam "eu garanto este valor". Nunca passe entrada de usuário, nem "limpa" com regex. Se o conteúdo vem de usuários (comentários, Markdown, CMS), passe por um sanitizador de verdade e só depois embrulhe o resultado.
- `isSafeHtml(x)` e `isSafeUrl(x)` identificam os valores. Eles não podem ser forjados por JSON (a marca é uma propriedade própria com `Symbol.for`), então dados vindos da rede nunca viram `SafeHtml`.
- `htmlString` já devolve `SafeHtml`: templates aninhados, componentes e listas de templates (`items.map(...)`) compõem sem nenhum wrapper.
- `renderToString(...).html` continua sendo `string`; `renderToStream` entrega strings.

## Política de URLs

Vale para `href`, `src`, `action`, `formaction`, `xlink:href`, `poster`, `cite`, `background`, `srcset` (cada candidato), `imagesrcset`, `ping`, `data` (de `<object>`), `manifest`, `codebase`, `longdesc` e `lowsrc`, e para `values`/`to`/`from` dentro de `<animate>`, `<set>` e `<animateMotion>`.

Permitido:

- `http:`, `https:`, `mailto:`, `tel:` e `sms:`;
- URLs relativas: `/x`, `./x`, `../x`, `?q`, `#h`, caminho sem esquema, e `//host` (herda `http(s)` da página; valide o host você mesmo se precisar restringir origem);
- `data:image/png|jpeg|gif|webp|avif` **somente** em atributos de imagem (`img src`, `srcset`, `poster`);
- `blob:` **somente** em `src` de mídia (`img`, `audio`, `video`, `source`, `track`): são object URLs da mesma origem, inertes nesses contextos;
- `data:image/svg+xml` **somente** em `img src`, `img srcset` e em `url()` de CSS: como imagem, o SVG não executa scripts.

Todo o resto (`javascript:`, `vbscript:`, `data:text/html`, `file:`, `ftp:`, `whatsapp:`...) vira `about:blank#blocked`, com aviso em dev. `blob:` e `data:image/svg+xml` em `href`, `iframe src`, `object` ou `embed` também são bloqueados. Para um esquema que a lista não cobre, use `unsafeUrl(...)`. Espaços, tabs e caracteres de controle antes ou dentro do esquema não enganam a política (`java\tscript:` é bloqueado). Entidades HTML não são decodificadas.

```typescript
html`<a href=${"javascript:alert(1)"}>x</a>`; // <a href="about:blank#blocked">
html`<img src=${"data:image/png;base64,iVBOR..."} />`; // permitido
html`<img src=${URL.createObjectURL(arquivo)} />`; // blob: permitido em mídia
```

`srcset` e o `content` de `<meta http-equiv="refresh">` com mais de **16 KB** são bloqueados por inteiro (a análise é linear, então uma entrada enorme não trava a página).

### A política é de esquema, não de origem

A política decide quais **esquemas** passam. Ela não sabe se o host é confiável. Se o valor de `<base href>`, `<script src>`, `<iframe src>` ou `<link href>` vem de entrada de usuário, restringir a origem é responsabilidade do app (compare `new URL(valor).origin` com uma lista sua). Um `https://atacante.com/x.js` passa pela política, porque `https:` é um esquema permitido.

### Validar entrada você mesmo: `sanitizeUrl` e `BLOCKED_URL`

As duas peças da política são exportadas de `@_bashell/slash/core` e `@_bashell/slash/ssr`. Use quando a URL não passa por um atributo do Slash (um redirect no servidor, uma URL guardada no banco):

```typescript
import { sanitizeUrl, BLOCKED_URL } from "@_bashell/slash/core";

// sanitizeUrl(atributo, valor, tag?) devolve o valor ou BLOCKED_URL
const destino = sanitizeUrl("href", req.query.next ?? "/");
if (destino === BLOCKED_URL) return res.redirect("/");
res.redirect(destino);
```

O primeiro argumento é o nome do atributo (`"href"`, `"src"`...) e o terceiro, opcional, a tag (`"img"`), porque `blob:` e `data:image/svg+xml` dependem do contexto. Em dev, um valor bloqueado emite o mesmo aviso dos templates.

`<meta http-equiv="refresh" content="N;url=...">` segue a mesma regra: a URL do `content` é verificada como um `href`. Só esse caso é tratado; o `content` de qualquer outro `<meta>` não é tocado.

`unsafeUrl()` só vale em atributos de URL e no `content` de `<meta http-equiv="refresh">`; em qualquer outro atributo o valor é tratado como uma string comum.

## Eventos

Uma regra única, no cliente e no SSR: toda prop cujo nome começa com `on` (qualquer caixa) é um evento. Só valores função, objeto `handleEvent` ou tupla `[fn, opções]` são anexados (no servidor handlers não existem, então nada é emitido). Qualquer outro valor (string, booleano, objeto) é descartado com aviso em dev: `onclick="alert(1)"` não vira atributo. Um atributo comum que comece com "on" (`online`, `one-time`) precisa do prefixo `data-`.

## `innerHTML`, `outerHTML`, `srcdoc`

No cliente, as props `innerHTML`, `outerHTML` e `insertAdjacentHTML` são bloqueadas (aviso em dev); no SSR elas saem como atributos inertes com o valor escapado (veja "Diferenças aceitas"). Para inserir marcação confiável use `unsafeHtml` como **filho**:

```typescript
html`<div>${unsafeHtml(htmlConfiavel)}</div>`;
```

`srcdoc` só aceita `SafeHtml`:

```typescript
html`<iframe srcdoc=${unsafeHtml("<p>oi</p>")}></iframe>`; // ok
html`<iframe srcdoc=${"<p>oi</p>"}></iframe>`;              // atributo removido
```

Nomes de atributo inválidos (por exemplo com espaço ou `>`) são descartados, e nomes de tag inválidos lançam erro: são erro de programação.

## `style`

`style` aceita string ou objeto, e cada declaração passa por uma política de CSS estrita no cliente e no servidor. Uma declaração é descartada (com aviso em dev) quando:

- contém `/*` em qualquer lugar: comentários não são permitidos em `style` inline (`color:red/**/` e `content:"/*"` são descartados);
- tem uma barra invertida (`\`) **fora de aspas**, no nome ou no valor: `background:ur\6c(javascript:...)` e `c\6flor:red` não passam. Escapes **dentro de aspas** continuam funcionando (`content:"\2022"`, `font-family:"Fira \43ode"`);
- tem uma string com quebra de linha crua, CR, FF ou NUL, com barra invertida seguida de quebra de linha, ou sem fechamento;
- tem um `url(` **sem aspas** cujo argumento usa caracteres fora de `[A-Za-z0-9-._~:/?#@!$&+,;=%]`. Qualquer outro caractere exige aspas: `url(a b.png)` é descartado, `url("a b.png")` passa.

Quebras de linha **entre** declarações são válidas, então um template literal em várias linhas funciona. Um `style` com mais de **8 KB** (string, ou chaves mais valores de um objeto) é descartado por inteiro, e um que fica vazio é omitido.

Regras por nome e valor:

- o nome precisa ser um identificador CSS válido (propriedades `--custom` são mantidas como estão);
- a propriedade não pode ser `-moz-binding`, `behavior` nem `behaviour` (`scroll-behavior` é permitido);
- o valor não pode conter `;` (fora de strings e de `url()`), `{`, `}`, `<`, `expression(`, `javascript:`, `vbscript:`, `behavior:`, `-moz-binding` nem `@import`;
- `url()` (com ou sem aspas) segue a mesma lista de permissão de `href`/`src`: caminhos relativos e `http(s)` passam, assim como `data:image/png|jpeg|gif|webp|avif`; `data:image/svg+xml`, `javascript:` e semelhantes são bloqueados;
- `image()`, `image-set()`, `cross-fade()`, `element()`, `paint()`, `src()` e `expression()` são fiscalizadas.

Uma declaração insegura é descartada e as demais são mantidas: `color:red;background:url(javascript:alert(1))` vira `color:red`. No SSR, chaves de objeto em camelCase viram propriedades CSS e prefixos de fornecedor saem como `-ms-`, `-webkit-` e `-moz-`. Em objetos, chaves como `cssText`, `setProperty` ou `__proto__` são ignoradas.

## `Link` e roteador

`to` precisa ser um caminho do app: `/x`, `?q` ou `#h`. Qualquer outra coisa nunca navega: o clique recebe `preventDefault`, o `href` vira `about:blank#blocked` e há um aviso em dev. Isso inclui `./x`, `../x`, `about`, `//host`, `javascript:` e `https://...`. `?q` e `#h` são relativos à página atual.

Para um link externo de verdade, diga isso explicitamente:

```typescript
html`<${Link} to="https://example.com/docs" external router=${router}>Docs<//>`;
// <a href="https://example.com/docs" rel="noopener noreferrer">Docs</a>
```

`external` só libera `http(s)`, `mailto:`, `tel:` e `sms:` (a URL ainda passa pela política) e adiciona `rel="noopener noreferrer"`; `//host` continua bloqueado. No SSR o `Link` gera o mesmo `<a href>`.

Regras do roteador no navegador:

- O interceptador de cliques só assume links `http(s)` da **mesma origem** (respeitando `<base>`). `mailto:`, `tel:`, `sms:`, `//outro.com` e outras origens ficam com o navegador.
- Com ctrl, meta, shift ou alt, botão que não seja o esquerdo, `target` diferente de `_self` ou `download`, o `Link` não interfere e o navegador age normalmente.
- Barras invertidas viram o caminho da mesma origem: `push("/\\evil")` vai para `/evil`, nunca para outro host.
- Se o navegador recusar um `push`/`replace`, a promise rejeita com `Navigation failed: ...` e o estado do roteador continua igual à URL. Se o `pushState` lançar durante um clique em um link, o roteador cai na navegação nativa do navegador.

## Estado e dados de loader em `<script>`

Nunca use `JSON.stringify` dentro de `<script>`: um valor `"</script><img onerror=...>"` fecha a tag. Use:

```typescript
import { renderToString, serializeStateForScript } from "@_bashell/slash/ssr";

const { html, state } = renderToString(() => App());
const pagina = `<div id="app">${html}</div>
<script id="__SLASH_STATE__" type="application/json">${serializeStateForScript(state)}</script>`;
```

O atributo `type="application/json"` é **obrigatório**: o `render()` só lê `script#__SLASH_STATE__[type="application/json"]` e, com um script sem `type`, avisa em dev e não hidrata.

`serializeStateForScript` e `serializeLoaderData` escapam `<`, `>`, `&`, U+2028 e U+2029; `JSON.parse` devolve exatamente o valor original. Para JSON em outro `<script>` dentro de um `htmlString`:

```typescript
htmlString`<script type="application/ld+json">${unsafeHtml(serializeStateForScript(dados))}</script>`;
```

Valores dinâmicos dentro de `<script>`/`<style>` (strings, números, arrays, componentes, templates aninhados e reativos) são **descartados**, no cliente e no SSR, com aviso em dev. Só passam o texto **estático** do template, então CSS e JS inline escritos por você funcionam, e `unsafeHtml(...)`. No cliente a regra é mais estrita: `unsafeHtml` precisa ser filho **direto** do `<script>`/`<style>`; vindo de um componente, de um array ou de uma função ele também é descartado. As props `text`, `textContent` e `innerText` de `<script>`/`<style>` também exigem `unsafeHtml`. Isso vale para templates (`html`/`htmlString`); chamadas diretas a `h()`/`hString()` (uso avançado) tratam uma string como texto estático confiável, então nunca passe entrada de usuário a elas.

Limitação do htm: um `<` literal dentro de um `<script>` estático (`if (a < b)`) é lido como início de tag; coloque esse código em `unsafeHtml(...)`.

## Props e nomes de atributo

Uma prop com nome de método do DOM (`click`, `focus`, `remove`...) vira **atributo**, nunca sobrescreve o método do elemento. `constructor`, `__proto__`, `prototype` e outras props de protótipo são bloqueadas no cliente e no SSR. A gramática de nome de atributo é a mesma nos dois lados e só aceita ASCII; nomes como `@click` ou `[x]` são descartados (com aviso em dev).

## Dados sem protótipo

`formToObject()` e `state.query` do roteador devolvem objetos sem protótipo (`Object.create(null)`): nomes como `__proto__` ou `constructor` viram chaves comuns e não afetam nada. Em troca, `obj.hasOwnProperty(...)` não existe; use `Object.hasOwn(obj, "campo")` ou `"campo" in obj`. `parseQuery` não lança com percent-encoding malformado (mantém o texto cru), e o clone interno de estado não deixa `__proto__` alterar protótipos. Um estado circular, ou aninhado em mais de 1000 níveis, lança `State is circular or nested deeper than 1000 levels and cannot be cloned` em vez de estourar a pilha.

## Limitação do htm em `<script>` estático

Um `<` literal dentro de um `<script>` ou `<style>` estático de um `htmlString` (`if (a < b)`) é lido pelo htm como início de tag. Coloque esse código em `unsafeHtml(...)`.

## Guards do cliente são UX

Guards do roteador, botões escondidos e rotas "protegidas" no navegador melhoram a experiência, mas quem usa o DevTools passa por cima. **O servidor autoriza cada requisição.** No SSR os guards não rodam.

## Diferenças aceitas entre cliente e SSR

O Slash testa as mesmas entradas nos dois lados e o resultado é igual, com estas exceções conhecidas:

1. `innerHTML=...`, `outerHTML=...` e `insertAdjacentHTML=...`: o cliente bloqueia a prop; o SSR emite um atributo comum com o valor escapado (inerte, nunca vira marcação).
2. `style` em objeto: o cliente serializa pelo CSSOM (formatação diferente), com a mesma política de valores.
3. Atributos `data-reactive-*` são reservados e removidos só no SSR (marcadores de hidratação).
4. `SafeHtml`/`SafeUrl` guardados em estado reativo perdem a marca ao serializar para hidratação e passam a falhar fechado: o HTML vira texto e a URL é sanitizada. Reembrulhe com `unsafeHtml`/`unsafeUrl` no cliente se precisar.
5. Em `<script>`/`<style>`, o cliente é mais estrito que o SSR: `unsafeHtml` que chega por componente, array ou função é descartado no cliente.

## Builds de desenvolvimento e de produção

O pacote publica dois builds por entrada (`core`, `router`, `forms`, `ssr`), escolhidos pelas condições de exportação:

- **Desenvolvimento** (`dist/dev`): Vite em `dev` e webpack em `mode: "development"` o escolhem sozinhos. Cada bloqueio emite um aviso (uma vez por tipo) com a correção sugerida.
- **Produção** (`dist`, o padrão): sem os avisos, que não pagam o custo das mensagens. Os erros de verdade (`ErrorBoundary`, guards do roteador, `batch`) continuam indo para `console.error`.

Para forçar os avisos fora de um bundler, por exemplo no Node: `node --conditions=development app.mjs`. Sem a condição, o Node usa o build de produção. As mensagens de runtime são todas em inglês.
