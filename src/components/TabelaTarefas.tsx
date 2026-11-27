// Lista de tarefas (com marcação rápida de "feita").
import { useEffect, useState } from 'react';
import { Badge, Checkbox, Group, Pagination, Stack, Table, Text, Tooltip } from '@mantine/core';
import { corArea, rotuloArea } from '../lib/constantes';
import { formatarData } from '../lib/formatos';
import { rotuloPeriodo, situacao, textoPrazo } from '../lib/tarefas';
import type { Empresa, Membro, Tarefa } from '../lib/tipos';
import { SituacaoBadge } from './SituacaoBadge';

const POR_PAGINA = 100;

export function TabelaTarefas({
  tarefas, empresas, membros, aoAbrir, aoAlternarFeito, mostrarResponsavel = true, euId, vazio = 'Nenhuma tarefa.',
}: {
  tarefas: Tarefa[];
  empresas: Map<string, Empresa>;
  membros: Membro[];
  aoAbrir: (t: Tarefa) => void;
  aoAlternarFeito: (t: Tarefa, feito: boolean) => void;
  mostrarResponsavel?: boolean;
  euId?: string;
  vazio?: string;
}) {
  const [pagina, setPagina] = useState(1);
  useEffect(() => setPagina(1), [tarefas.length]);
  const nome = (id: string | null) => (!id ? 'Sem responsável' : id === euId ? 'Você' : membros.find((m) => m.id === id)?.nome ?? '—');
  const paginas = Math.max(1, Math.ceil(tarefas.length / POR_PAGINA));
  const visiveis = tarefas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  if (tarefas.length === 0) return <Text c="dimmed" p="lg" ta="center">{vazio}</Text>;

  return (
    <Stack gap="sm">
      <Table.ScrollContainer minWidth={780}>
        <Table className="tabela-clicavel" verticalSpacing="xs" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={44}><Tooltip label="Marcar como feita"><span>✓</span></Tooltip></Table.Th>
              <Table.Th>Empresa</Table.Th>
              <Table.Th>Obrigação</Table.Th>
              <Table.Th>Vencimento</Table.Th>
              {mostrarResponsavel && <Table.Th>Responsável</Table.Th>}
              <Table.Th>Situação</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visiveis.map((t) => {
              const e = empresas.get(t.empresa_id);
              const s = situacao(t);
              return (
                <Table.Tr key={t.id} onClick={() => aoAbrir(t)} data-tarefa={t.id}>
                  <Table.Td onClick={(ev) => ev.stopPropagation()}>
                    <Checkbox
                      aria-label={`Marcar ${t.nome} de ${e?.razao_social ?? ''} como feita`}
                      checked={t.status === 'feito'}
                      onChange={(ev) => aoAlternarFeito(t, ev.currentTarget.checked)}
                      color="green"
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={500} lineClamp={1}>{e?.razao_social ?? '—'}</Text>
                    {e?.codigo && <Text size="xs" c="dimmed">Cód. {e.codigo}</Text>}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" lineClamp={1}>{t.nome}</Text>
                    {s === 'devolvida' && t.motivo_devolucao && <Text size="xs" c="grape.8" lineClamp={1}>↩ {t.motivo_devolucao}</Text>}
                    <Group gap={4}>
                      <Badge size="xs" variant="light" color={corArea(t.area)}>{rotuloArea(t.area)}</Badge>
                      <Text size="xs" c="dimmed">{rotuloPeriodo(t)}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td className="nowrap">
                    <Text size="sm">{formatarData(t.vencimento)}</Text>
                    <Text size="xs" c={s === 'atrasado' ? 'red.7' : 'dimmed'}>{textoPrazo(t) || (t.concluido_em ? `feita em ${formatarData(t.concluido_em)}` : '')}</Text>
                  </Table.Td>
                  {mostrarResponsavel && <Table.Td><Text size="sm" c={t.responsavel_id ? undefined : 'orange.8'}>{nome(t.responsavel_id)}</Text></Table.Td>}
                  <Table.Td className="nowrap"><SituacaoBadge s={s} /></Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {paginas > 1 && (
        <Group justify="space-between" px="sm" pb="sm">
          <Text size="sm" c="dimmed">{tarefas.length} tarefas · mostrando {(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, tarefas.length)}</Text>
          <Pagination value={pagina} onChange={setPagina} total={paginas} size="sm" />
        </Group>
      )}
    </Stack>
  );
}
