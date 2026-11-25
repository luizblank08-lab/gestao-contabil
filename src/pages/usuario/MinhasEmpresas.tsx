// Empresas que o usuário atende (a lista já vem filtrada pelo banco de dados).
import { useMemo, useState } from 'react';
import { Anchor, Badge, Card, Group, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconMail, IconPhone, IconSearch, IconUser } from '@tabler/icons-react';
import { useEmpresas, useMembros } from '../../lib/dados';
import { corArea, rotuloArea, rotuloAtividade, rotuloRegime, type Area } from '../../lib/constantes';
import { mascaraCnpj } from '../../lib/cnpj';
import { normalizar } from '../../lib/formatos';
import { useSessao } from '../../lib/sessao';
import { Carregando } from '../../components/Carregando';

export function MinhasEmpresas() {
  const { membro, minhasAreas } = useSessao();
  const { empresas, carregando } = useEmpresas();
  const { membros } = useMembros();
  const [busca, setBusca] = useState('');
  const nome = (id: string | null) => membros.find((m) => m.id === id)?.nome ?? 'Não definido';

  const lista = useMemo(() => {
    const t = normalizar(busca);
    return empresas.filter((e) => e.ativa && (!t || normalizar(`${e.razao_social} ${e.nome_fantasia ?? ''} ${e.cnpj ?? ''} ${e.codigo ?? ''}`).includes(t)));
  }, [empresas, busca]);

  const respDaArea = (e: (typeof empresas)[number], a: Area) =>
    a === 'fiscal' ? e.resp_fiscal_id : a === 'contabil' ? e.resp_contabil_id : e.resp_dp_id;

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Minhas empresas</Title>
          <Group gap={6} mt={4}>
            <Text c="dimmed" size="sm">{lista.length} empresa(s) · Suas áreas:</Text>
            {minhasAreas.map((a) => <Badge key={a} color={corArea(a)} variant="light">{rotuloArea(a)}</Badge>)}
          </Group>
        </div>
        <TextInput w={320} placeholder="Buscar por nome ou CNPJ" leftSection={<IconSearch size={16} />} value={busca} onChange={(e) => setBusca(e.currentTarget.value)} />
      </Group>

      {carregando ? <Carregando /> : lista.length === 0 ? (
        <Text c="dimmed">Nenhuma empresa designada para você ainda. Fale com o Gestor.</Text>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
          {lista.map((e) => (
            <Card key={e.id} withBorder radius="md" padding="lg">
              <Stack gap={6}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <div style={{ minWidth: 0 }}>
                    <Text fw={600} truncate>{e.razao_social}</Text>
                    {e.nome_fantasia && <Text size="sm" c="dimmed" truncate>{e.nome_fantasia}</Text>}
                  </div>
                  {e.regime && <Badge variant="light" color="gray">{rotuloRegime(e.regime)}</Badge>}
                </Group>
                <Text size="sm" ff="monospace">{e.codigo && <Text span c="dimmed" ff="inherit">Cód. {e.codigo} · </Text>}{e.cnpj ? mascaraCnpj(e.cnpj) : 'CNPJ não informado'}</Text>
                {(e.municipio || e.atividades.length > 0) && (
                  <Text size="sm">{[e.municipio && `${e.municipio}/${e.uf ?? ''}`, e.atividades.map(rotuloAtividade).join(', ')].filter(Boolean).join(' · ')}</Text>
                )}
                {minhasAreas.map((a) => (
                  <Text key={a} size="sm">
                    <Badge size="xs" color={corArea(a)} variant="light" mr={6}>{rotuloArea(a)}</Badge>
                    Responsável: <b>{respDaArea(e, a) === membro?.id ? 'Você' : nome(respDaArea(e, a))}</b>
                  </Text>
                ))}
                {(e.contato_nome || e.contato_telefone || e.contato_email) && (
                  <Stack gap={2} mt={4} pt={6} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
                    {e.contato_nome && <Group gap={6}><IconUser size={14} /><Text size="sm">{e.contato_nome}</Text></Group>}
                    {e.contato_telefone && <Group gap={6}><IconPhone size={14} /><Text size="sm">{e.contato_telefone}</Text></Group>}
                    {e.contato_email && <Group gap={6}><IconMail size={14} /><Anchor size="sm" href={`mailto:${e.contato_email}`}>{e.contato_email}</Anchor></Group>}
                  </Stack>
                )}
                {e.observacoes && <Text size="xs" c="dimmed" mt={4} style={{ whiteSpace: 'pre-wrap' }}>{e.observacoes}</Text>}
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}
