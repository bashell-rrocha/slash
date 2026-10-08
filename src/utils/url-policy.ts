// TODO(SEC-B): shim temporário do stream SEC-A. A implementação real (S2) é do
// stream SEC-B e substitui este arquivo no merge. Assinatura fixada em sec-design.md.
export function sanitizeUrl(_attr: string, value: string, _tag?: string): string {
  return value;
}
