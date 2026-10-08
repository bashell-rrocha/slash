// Escapa um JSON já serializado para embutir dentro de <script>: troca os
// caracteres que permitiriam fechar a tag ou abrir comentário por escapes
// JSON equivalentes (o JSON.parse devolve o valor original)
export function escapeJsonForScript(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
