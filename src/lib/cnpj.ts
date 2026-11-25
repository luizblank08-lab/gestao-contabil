// CNPJ: validação e máscara.
// Aceita o CNPJ numérico tradicional e o novo CNPJ alfanumérico
// (letras nas 12 primeiras posições, em vigor desde julho/2026 — IN RFB 2.229/2024).
// Os dois dígitos verificadores continuam sendo números.

export function limparCnpj(valor: string): string {
  return (valor || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14);
}

function valorCaractere(c: string): number {
  // Tabela oficial: o valor é o código ASCII menos 48 (0–9 => 0–9, A => 17, B => 18…)
  return c.charCodeAt(0) - 48;
}

function digito(base: string): number {
  const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = base.split('').reduce((acc, c, i) => acc + valorCaractere(c) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCnpj(valor: string): boolean {
  const c = limparCnpj(valor);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return false;
  if (/^(\d)\1{13}$/.test(c)) return false; // 00.000.000/0000-00, 11.111…
  const d1 = digito(c.slice(0, 12));
  const d2 = digito(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}

export function mascaraCnpj(valor: string): string {
  const c = limparCnpj(valor);
  let r = c.slice(0, 2);
  if (c.length > 2) r += '.' + c.slice(2, 5);
  if (c.length > 5) r += '.' + c.slice(5, 8);
  if (c.length > 8) r += '/' + c.slice(8, 12);
  if (c.length > 12) r += '-' + c.slice(12, 14);
  return r;
}
