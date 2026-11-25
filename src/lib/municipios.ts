// Lista de municípios por UF (IBGE). Se a internet do IBGE falhar, o campo continua livre.
const cache = new Map<string, string[]>();

export async function municipiosDaUf(uf: string): Promise<string[]> {
  if (!uf) return [];
  if (cache.has(uf)) return cache.get(uf)!;
  try {
    const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
    if (!r.ok) return [];
    const lista = ((await r.json()) as { nome: string }[]).map((m) => m.nome);
    cache.set(uf, lista);
    return lista;
  } catch {
    return [];
  }
}
