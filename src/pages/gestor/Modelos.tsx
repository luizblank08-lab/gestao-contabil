// Modelos de checklist por área (Gestor).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Badge, Button, Group, Paper, Stack, Switch, Table, Tabs, Text, TextInput, Title, Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconInfoCircle, IconPlus, IconRestore, IconSearch } from '@tabler/icons-react';
import { useModelos } from '../../lib/dados';
import { AREAS, corArea, type Area } from '../../lib/constantes';
import { descreverAplicacao, descreverVencimento, rotuloPeriodicidade } from '../../lib/modelos';
import { normalizar } from '../../lib/formatos';
import { supabase } from '../../lib/supabase';
import { useTempoReal } from '../../lib/tempoReal';
import { avisoErro, avisoSucesso } from '../../lib/avisos';
import { useSessao } from '../../lib/sessao';
import { Carregando } from '../../components/Carregando';
import { ModeloForm } from './ModeloForm';
import type { Modelo } from '../../lib/tipos';

/** Quantas empresas ativas recebem cada item */
function useContagemEmpresas() {
  const [contagem, setContagem] = useState<Map<string, number>>(new Map());
  const carregar = useCallback(async () => {
    const { data } = await supabase().from('empresa_obrigacoes').select('modelo_id').eq('aplicada', true).eq('empresa_ativa', true);
    const m = new Map<string, number>();
    for (const r of (data ?? []) as { modelo_id: string }[]) m.set(r.modelo_id, (m.get(r.modelo_id) ?? 0) + 1);
    setContagem(m);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useTempoReal(['modelos_checklist', 'empresas', 'empresa_item_excecoes'], carregar);
  return contagem;
}

export function Modelos() {
  const { escritorio } = useSessao();
  const areas = AREAS.filter((a) => escritorio?.areas_ativas.includes(a.value));
  const { modelos, carregando } = useModelos();
  const contagem = useContagemEmpresas();
  const [aba, setAba] = useState<Area>(areas[0]?.value ?? 'fiscal');
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Modelo | null>(null);
  const [aberto, setAberto] = useState(false);
  const [versao, setVersao] = useState(0);

  const daAba = useMemo(() => {
    const t = normalizar(busca);
    return modelos.filter((m) => m.area === aba && (!t || normalizar(`${m.nome} ${m.descricao ?? ''}`).includes(t)));
  }, [modelos, aba, busca]);

  function abrir(m: Modelo | null) {
    setEditando(m);
    setVersao((x) => x + 1);
    setAberto(true);
  }

  async function alternarAtivo(m: Modelo) {
    const { error } = await supabase().from('modelos_checklist').update({ ativo: !m.ativo }).eq('id', m.id);
    if (error) avisoErro(error);
  }

  function restaurar() {
    modals.openConfirmModal({
      title: 'Restaurar itens padrão',
      children: <Text size="sm">Recoloca os itens que vieram prontos e foram excluídos. Itens existentes e as suas alterações não são mexidos.</Text>,
      labels: { confirm: 'Restaurar', cancel: 'Cancelar' },
      onConfirm: async () => {
        const { data, error } = await supabase().rpc('restaurar_modelos_padrao');
        if (error) return avisoErro(error);
        avisoSucesso(data ? `${data} item(ns) recolocado(s).` : 'Nenhum item padrão estava faltando.');
      },
    });
  }

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Modelos de checklist</Title>
          <Text c="dimmed" size="sm">Itens aplicados automaticamente às empresas conforme regime, atividade e funcionários.</Text>
        </div>
        <Group>
          <Button variant="default" leftSection={<IconRestore size={18} />} onClick={restaurar}>Restaurar itens padrão</Button>
          <Button leftSection={<IconPlus size={18} />} onClick={() => abrir(null)}>Novo item</Button>
        </Group>
      </Group>

      <Alert color="blue" variant="light" icon={<IconInfoCircle size={18} />}>
        Os itens e prazos que vieram prontos são uma <b>referência</b>. As regras mudam — inclusive com a Reforma Tributária (CBS/IBS) —
        e alguns prazos variam por estado ou município. Confira e ajuste para a realidade do escritório.
      </Alert>

      <Tabs value={aba} onChange={(x) => x && setAba(x as Area)}>
        <Group justify="space-between" align="flex-end">
          <Tabs.List>
            {areas.map((a) => (
              <Tabs.Tab key={a.value} value={a.value} rightSection={<Badge size="xs" variant="light" color={a.cor}>{modelos.filter((m) => m.area === a.value).length}</Badge>}>
                {a.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <TextInput w={280} placeholder="Buscar item" leftSection={<IconSearch size={16} />} value={busca} onChange={(e) => setBusca(e.currentTarget.value)} />
        </Group>
      </Tabs>

      <Paper withBorder radius="md">
        {carregando ? <Carregando /> : daAba.length === 0 ? (
          <Text c="dimmed" p="xl" ta="center">Nenhum item nesta área.</Text>
        ) : (
          <Table.ScrollContainer minWidth={900}>
            <Table className="tabela-clicavel" verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={70}>Ativo</Table.Th>
                  <Table.Th>Item</Table.Th>
                  <Table.Th>Periodicidade</Table.Th>
                  <Table.Th>Vencimento</Table.Th>
                  <Table.Th>Aplica-se a</Table.Th>
                  <Table.Th ta="right">Empresas</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {daAba.map((m) => (
                  <Table.Tr key={m.id} onClick={() => abrir(m)} opacity={m.ativo ? 1 : 0.55}>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Switch size="sm" checked={m.ativo} onChange={() => alternarAtivo(m)} aria-label={`Ativar ${m.nome}`} />
                    </Table.Td>
                    <Table.Td>
                      <Text fw={500} size="sm">{m.nome}</Text>
                      {m.descricao && <Text size="xs" c="dimmed" lineClamp={1}>{m.descricao}</Text>}
                    </Table.Td>
                    <Table.Td className="nowrap"><Badge variant="light" color={corArea(m.area)}>{rotuloPeriodicidade(m.periodicidade)}</Badge></Table.Td>
                    <Table.Td><Text size="sm">{descreverVencimento(m)}</Text></Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{descreverAplicacao(m)}</Text></Table.Td>
                    <Table.Td ta="right">
                      <Tooltip label="Empresas ativas que recebem este item">
                        <Text size="sm" fw={500}>{m.ativo ? contagem.get(m.id) ?? 0 : '—'}</Text>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <ModeloForm key={versao} aberto={aberto} aoFechar={() => setAberto(false)} modelo={editando} areaInicial={aba} />
    </Stack>
  );
}
