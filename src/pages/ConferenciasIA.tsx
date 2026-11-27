// Conferência com IA: nova conferência e histórico (Gestor vê todas; usuário vê as suas e as das suas empresas).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionIcon, Alert, Button, Group, Modal, Select, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconInfoCircle, IconSparkles, IconTrash } from '@tabler/icons-react';
import { supabase } from '../lib/supabase';
import { useEmpresas, useMembros } from '../lib/dados';
import { useTempoReal } from '../lib/tempoReal';
import { useSessao } from '../lib/sessao';
import { avisoErro } from '../lib/avisos';
import { formatarDataHora } from '../lib/formatos';
import { TIPOS_CONFERENCIA, apagarConferencia, rotuloTipoConferencia, type Conferencia } from '../lib/conferenciaIA';
import { BadgeConclusao, ConferenciaIAModal, ResultadoConferencia } from '../components/ConferenciaIA';
import { Carregando } from '../components/Carregando';

export function ConferenciasIA() {
  const { membro: eu, ehGestor } = useSessao();
  const { empresas } = useEmpresas();
  const { membros } = useMembros();
  const [lista, setLista] = useState<Conferencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroEmpresa, setFiltroEmpresa] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [aberta, setAberta] = useState<Conferencia | null>(null);

  const nomeEmpresa = (id: string | null) => (id ? empresas.find((e) => e.id === id)?.razao_social ?? '—' : '—');
  const nomeMembro = (id: string | null) => membros.find((m) => m.id === id)?.nome ?? '—';

  const carregar = useCallback(async () => {
    let q = supabase().from('conferencias_ia').select('*').order('criado_em', { ascending: false }).limit(200);
    if (filtroEmpresa) q = q.eq('empresa_id', filtroEmpresa);
    if (filtroTipo) q = q.eq('tipo', filtroTipo);
    const { data, error } = await q;
    if (error) avisoErro(error);
    setLista((data as Conferencia[]) ?? []);
    setCarregando(false);
  }, [filtroEmpresa, filtroTipo]);
  useEffect(() => { carregar(); }, [carregar]);
  useTempoReal(['conferencias_ia'], carregar);

  const opcoesEmpresa = useMemo(() => empresas.map((e) => ({ value: e.id, label: e.razao_social })), [empresas]);

  function apagar(c: Conferencia) {
    modals.openConfirmModal({
      title: 'Apagar conferência?',
      children: <Text size="sm">A conferência de <b>{formatarDataHora(c.criado_em)}</b>, as perguntas feitas sobre ela e os arquivos guardados para a IA serão apagados.</Text>,
      labels: { confirm: 'Apagar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await apagarConferencia(c.id!);
          carregar();
        } catch (e) { avisoErro(e); }
      },
    });
  }

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Conferência com IA</Title>
          <Text c="dimmed" size="sm" mt={4}>Envie balancetes, extratos, guias ou folhas e a IA aponta divergências.</Text>
        </div>
        <Button leftSection={<IconSparkles size={16} />} onClick={() => setNova(true)}>Nova conferência</Button>
      </Group>

      <Alert color="blue" variant="light" icon={<IconInfoCircle size={18} />}>
        A IA é um apoio à revisão: ela refaz as contas e confronta os documentos, mas pode errar. Confirme sempre antes de corrigir.
        Para conferir os anexos de uma tarefa, abra a tarefa e use <b>Conferir com IA</b>.
      </Alert>

      <Group>
        <Select w={320} placeholder="Todas as empresas" searchable clearable data={opcoesEmpresa} value={filtroEmpresa} onChange={setFiltroEmpresa} />
        <Select w={220} placeholder="Todos os tipos" clearable data={TIPOS_CONFERENCIA.map((t) => ({ value: t.value, label: t.label }))}
          value={filtroTipo} onChange={setFiltroTipo} />
      </Group>

      {carregando ? <Carregando /> : lista.length === 0 ? (
        <Text c="dimmed" ta="center" p="lg">Nenhuma conferência ainda.</Text>
      ) : (
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Quando</Table.Th>
              <Table.Th>Empresa</Table.Th>
              <Table.Th>Tipo</Table.Th>
              <Table.Th>Resultado</Table.Th>
              <Table.Th>Resumo</Table.Th>
              <Table.Th>Quem</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lista.map((c) => (
              <Table.Tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setAberta(c)}>
                <Table.Td className="nowrap"><Text size="sm">{formatarDataHora(c.criado_em)}</Text></Table.Td>
                <Table.Td><Text size="sm" lineClamp={1}>{nomeEmpresa(c.empresa_id)}</Text></Table.Td>
                <Table.Td><Text size="sm">{rotuloTipoConferencia(c.tipo)}</Text></Table.Td>
                <Table.Td><BadgeConclusao conclusao={c.conclusao} /></Table.Td>
                <Table.Td><Text size="sm" lineClamp={2}>{c.resumo}</Text></Table.Td>
                <Table.Td><Text size="sm">{nomeMembro(c.criado_por)}</Text></Table.Td>
                <Table.Td ta="right" onClick={(e) => e.stopPropagation()}>
                  {(ehGestor || c.criado_por === eu?.id) && (
                    <Tooltip label="Apagar"><ActionIcon variant="subtle" color="red" aria-label="Apagar conferência" onClick={() => apagar(c)}><IconTrash size={16} /></ActionIcon></Tooltip>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <ConferenciaIAModal aberto={nova} aoFechar={() => setNova(false)} empresas={empresas} empresaInicial={filtroEmpresa} aoConcluir={carregar} />
      <Modal opened={!!aberta} onClose={() => setAberta(null)} size={720} title={<Text fw={600} size="lg">Conferência com IA</Text>}>
        {aberta && <ResultadoConferencia conferencia={aberta} nomeEmpresa={nomeEmpresa(aberta.empresa_id)} nomeAutor={nomeMembro(aberta.criado_por)} nomeDe={nomeMembro} />}
      </Modal>
    </Stack>
  );
}
