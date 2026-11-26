// Histórico de importações de planilha, com "Desfazer" (Gestor).
import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, List, Modal, Stack, Table, Text, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconArrowBackUp, IconInfoCircle } from '@tabler/icons-react';
import { supabase } from '../../lib/supabase';
import { formatarDataHora } from '../../lib/formatos';
import { avisoErro, avisoSucesso } from '../../lib/avisos';
import { useTempoReal } from '../../lib/tempoReal';
import { Carregando } from '../../components/Carregando';
import type { Membro } from '../../lib/tipos';

type Importacao = {
  id: string;
  criado_em: string;
  criado_por: string | null;
  nome_arquivo: string | null;
  criadas: number;
  atualizadas: number;
  desfeita_em: string | null;
  desfeita_por: string | null;
  resultado_desfazer: { removidas: number; restauradas: number; campos_mantidos: number } | null;
};

export function HistoricoImportacoes({ aberto, aoFechar, membros }: { aberto: boolean; aoFechar: () => void; membros: Membro[] }) {
  const [lista, setLista] = useState<Importacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [desfazendo, setDesfazendo] = useState<string | null>(null);
  const nome = (id: string | null) => membros.find((m) => m.id === id)?.nome ?? '—';

  const carregar = useCallback(async () => {
    const { data, error } = await supabase().from('importacoes').select('*').order('criado_em', { ascending: false }).limit(50);
    if (error) avisoErro(error);
    setLista((data as Importacao[]) ?? []);
    setCarregando(false);
  }, []);
  useEffect(() => { if (aberto) { setCarregando(true); carregar(); } }, [aberto, carregar]);
  useTempoReal(['importacoes'], carregar);

  // Só a importação mais recente ainda ativa pode ser desfeita
  const desfazivel = lista.find((i) => !i.desfeita_em)?.id;

  function desfazer(i: Importacao) {
    modals.openConfirmModal({
      title: 'Desfazer importação?',
      children: (
        <Stack gap="xs">
          <Text size="sm">Importação de <b>{formatarDataHora(i.criado_em)}</b>{i.nome_arquivo && <> ({i.nome_arquivo})</>}:</Text>
          <List size="sm">
            {i.criadas > 0 && <List.Item>as <b>{i.criadas}</b> empresa(s) criadas por ela serão <b>excluídas</b>;</List.Item>}
            {i.atualizadas > 0 && <List.Item>as <b>{i.atualizadas}</b> empresa(s) alteradas voltam a ter razão social, CNPJ, regime e responsáveis de antes.</List.Item>}
          </List>
          <Text size="xs" c="dimmed">
            O que você corrigiu à mão depois da importação é mantido. Se alguma empresa criada já tiver tarefa marcada ou anexo, nada é desfeito e o app avisa quais são.
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Desfazer importação', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        setDesfazendo(i.id);
        const { data, error } = await supabase().rpc('desfazer_importacao', { p_importacao: i.id });
        setDesfazendo(null);
        if (error) return avisoErro(error);
        const r = data as { removidas: number; restauradas: number; campos_mantidos: number };
        avisoSucesso(
          `Importação desfeita: ${r.removidas} empresa(s) excluída(s), ${r.restauradas} restaurada(s)` +
            (r.campos_mantidos ? `; ${r.campos_mantidos} campo(s) corrigido(s) à mão foram mantidos.` : '.'),
        );
        carregar();
      },
    });
  }

  return (
    <Modal opened={aberto} onClose={aoFechar} size={900} title={<Text fw={600} size="lg">Histórico de importações</Text>}>
      <Stack>
        <Alert color="blue" variant="light" icon={<IconInfoCircle size={18} />}>
          Importou a planilha errada? Desfaça aqui. Desfaça sempre da mais recente para a mais antiga, uma de cada vez.
        </Alert>
        {carregando ? <Carregando /> : lista.length === 0 ? (
          <Text c="dimmed" ta="center" p="lg">Nenhuma importação registrada ainda.</Text>
        ) : (
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Quando</Table.Th>
                <Table.Th>Arquivo</Table.Th>
                <Table.Th>Quem</Table.Th>
                <Table.Th ta="right">Criadas</Table.Th>
                <Table.Th ta="right">Alteradas</Table.Th>
                <Table.Th>Situação</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lista.map((i) => (
                <Table.Tr key={i.id} opacity={i.desfeita_em ? 0.6 : 1}>
                  <Table.Td className="nowrap"><Text size="sm">{formatarDataHora(i.criado_em)}</Text></Table.Td>
                  <Table.Td><Text size="sm" lineClamp={1}>{i.nome_arquivo ?? '—'}</Text></Table.Td>
                  <Table.Td><Text size="sm">{nome(i.criado_por)}</Text></Table.Td>
                  <Table.Td ta="right">{i.criadas}</Table.Td>
                  <Table.Td ta="right">{i.atualizadas}</Table.Td>
                  <Table.Td>
                    {i.desfeita_em ? (
                      <Tooltip label={`Desfeita em ${formatarDataHora(i.desfeita_em)} por ${nome(i.desfeita_por)}`}>
                        <Badge color="gray" variant="light">Desfeita</Badge>
                      </Tooltip>
                    ) : <Badge color="green" variant="light">Ativa</Badge>}
                  </Table.Td>
                  <Table.Td ta="right">
                    {i.id === desfazivel && (
                      <Button size="xs" variant="light" color="red" leftSection={<IconArrowBackUp size={14} />}
                        loading={desfazendo === i.id} onClick={() => desfazer(i)}>Desfazer</Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
        <Group justify="flex-end"><Button variant="default" onClick={aoFechar}>Fechar</Button></Group>
      </Stack>
    </Modal>
  );
}
