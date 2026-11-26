// Grade: empresas nas linhas, obrigações nas colunas, situação em cada célula.
import { useMemo } from 'react';
import { ScrollArea, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { formatarData } from '../lib/formatos';
import { situacao, SITUACOES } from '../lib/tarefas';
import type { Empresa, Modelo, Tarefa } from '../lib/tipos';
import { SituacaoBadge } from './SituacaoBadge';

export function GradeEmpresas({
  tarefas, empresas, modelos, aoAbrir,
}: { tarefas: Tarefa[]; empresas: Map<string, Empresa>; modelos: Modelo[]; aoAbrir: (t: Tarefa) => void }) {
  const { colunas, linhas, celula } = useMemo(() => {
    const ordem = new Map(modelos.map((m) => [m.id, m.ordem]));
    const nomes = new Map<string, string>();
    const cel = new Map<string, Tarefa>();
    const emps = new Set<string>();
    for (const t of tarefas) {
      const col = t.modelo_id ?? `nome:${t.nome}`;
      nomes.set(col, t.nome);
      cel.set(`${t.empresa_id}|${col}`, t);
      emps.add(t.empresa_id);
    }
    const colunas = [...nomes.entries()]
      .sort((a, b) => (ordem.get(a[0]) ?? 9999) - (ordem.get(b[0]) ?? 9999) || a[1].localeCompare(b[1]))
      .map(([id, nome]) => ({ id, nome }));
    const linhas = [...emps].map((id) => ({ id, nome: empresas.get(id)?.razao_social ?? '—', codigo: empresas.get(id)?.codigo }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    return { colunas, linhas, celula: cel };
  }, [tarefas, empresas, modelos]);

  if (linhas.length === 0) return <Text c="dimmed" p="lg" ta="center">Nenhuma tarefa com esses filtros.</Text>;

  return (
    <ScrollArea type="auto" offsetScrollbars>
      <table className="grade" role="grid" aria-label="Grade de empresas por obrigação">
        <thead>
          <tr>
            <th className="grade-empresa">Empresa</th>
            {colunas.map((c) => (
              <th key={c.id} className="grade-coluna" title={c.nome}><span>{c.nome}</span></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id}>
              <th className="grade-empresa" scope="row">
                <Text size="sm" fw={500} truncate maw={260}>{l.nome}</Text>
                {l.codigo && <Text size="xs" c="dimmed">Cód. {l.codigo}</Text>}
              </th>
              {colunas.map((c) => {
                const t = celula.get(`${l.id}|${c.id}`);
                if (!t) return <td key={c.id} className="grade-vazia" aria-label="Não se aplica a esta empresa">·</td>;
                const s = situacao(t);
                return (
                  <td key={c.id}>
                    <Tooltip withArrow multiline w={240} label={`${l.nome} — ${t.nome}: ${SITUACOES[s].rotulo} (vence ${formatarData(t.vencimento)})`}>
                      <UnstyledButton onClick={() => aoAbrir(t)} aria-label={`${l.nome}, ${t.nome}: ${SITUACOES[s].rotulo}`} className="grade-botao">
                        <SituacaoBadge s={s} compacto />
                      </UnstyledButton>
                    </Tooltip>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}
