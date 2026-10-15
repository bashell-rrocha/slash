// Elementos vazios do HTML (<br>, <img …>) escritos sem `/>`: o htm não conhece elementos vazios e, sem a barra,
// trata o resto do template como filho deles. Antes de chegar ao htm, as partes estáticas do template ganham a barra
// que falta (e perdem o `</input>` que o HTML ignora). Um tokenizador por parte, com o estado (dentro de tag, aspas,
// comentário) atravessando as interpolações.

const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
// comentário | fechamento | abertura | aspas | > | espaço | outro caractere
const TOKEN = /<!--|-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)|["'>]|\s|[^]/g;

// Mesmo template → mesmo array: o htm guarda o parse por identidade das partes
const cache = new WeakMap<TemplateStringsArray, TemplateStringsArray>();

export function closeVoidTags(strings: TemplateStringsArray): TemplateStringsArray {
  let result = cache.get(strings);
  if (result) return result;
  // tag: 0 fora, 1 tag comum, 2 tag vazia; quote: aspas abertas; prev: último não-espaço na tag ("" após interpolação)
  let tag = 0;
  let quote = "";
  let comment = false;
  let prev = "";
  const parts = strings.map((part, index) => {
    if (index) prev = "";
    return part.replace(TOKEN, (token, close?: string, open?: string) => {
      if (comment) {
        if (token === "-->") comment = false;
      } else if (quote) {
        if (token === quote) quote = "";
      } else if (!tag) {
        if (token === "<!--") comment = true;
        else if (close && VOID.test(close)) return "";
        else if (open) tag = VOID.test(open) ? 2 : 1;
      } else if (token === ">") {
        const slash = tag === 2 && prev !== "/" ? "/" : "";
        tag = 0;
        return `${slash}>`;
      } else if (token === '"' || token === "'") quote = prev = token;
      else if (token.trim()) prev = token;
      return token;
    });
  });
  result = Object.assign(parts, { raw: [...parts] }) as unknown as TemplateStringsArray;
  cache.set(strings, result);
  return result;
}
