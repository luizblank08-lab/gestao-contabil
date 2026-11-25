// Lista de empresas com busca e filtros (Gestor).
import { useMemo, useState } from 'react';
import { Badge, Button, Group, Paper, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconFileSpreadsheet, IconPlus, IconSearch } from '@tabler/icons-react';
import { useEmpresas, useMembros } from '../../lib/dados';
import { REGIMES, rotuloRegime } from '../../lib/constantes';
import { limparCnpj, mascaraCnpj } from '../../lib/cnpj';
import { normalizar } from '../../lib/formatos';
import { useSessao } from '../../lib/sessao';
import { Carregando } from '../../components/Carregando';
import { EmpresaForm } from './EmpresaForm';
import { ImportarPlanilha } from './ImportarPlanilha';
import type { Empresa } from '../../lib/tipos';

export function Empresas() {
  const { escritorio } = useSessao();
  const ativas = escritorio?.areas_ativas ?? [];
  const { empresas, carregando } = useEmpresas();
  const { membros } = useMembros();
  const [busca, setBusca] = useState('');
  const [regime, setRegime] = useState<string | null>(null);
  const [responsavel, setResponsavel] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>('ativa');
  const [editando, setEditando] = useState<Empresa | null>(null);
  const [aberto, setAberto] = useState(false);
  const [versaoForm, setVersaoForm] = useState(0);
  const [importando, setImportando] = useState(false);
  const [cadastro, setCadastro] = useState<string | null>(null);

  const nomeMembro = useMemo(() => {
    const mapa = new Map(membros.map((m) => [m.id, m.nome]));
    return (id: string | null) => (id ? mapa.get(id) ?? '—' : '—');
  }, [membros]);

  const filtradas = useMemo(() => {
    const termo = normalizar(busca.trim());
    const termoCnpj = limparCnpj(busca);
    return empresas.filter((e) => {
      if (termo) {
        const nome = normalizar(`${e.razao_social} ${e.nome_fantasia ?? ''}`);
        const porCodigo = e.codigo != null && e.codigo === busca.trim();
        if (!nome.includes(termo) && !porCodigo && !(termoCnpj.length >= 3 && (e.cnpj ?? '').includes(termoCnpj))) return false;
      }
      if (regime && e.regime !== regime) return false;
      if (status === 'ativa' && !e.ativa) return false;
      if (status === 'inativa' && e.ativa) return false;
      if (cadastro === 'incompleto' && e.cadastro_completo) return false;
      if (cadastro === 'completo' && !e.cadastro_completo) return false;
      if (responsavel && ![e.resp_fiscal_id, e.resp_contabil_id, e.resp_dp_id].includes(responsavel)) return false;
      return true;
    });
  }, [empresas, busca, regime, status, responsavel, cadastro]);

  function abrir(e: Empresa | null) {
    setEditando(e);
    setVersaoForm((v) => v + 1);
    setAberto(true);
  }

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Empresas</Title>
          <Text c="dimmed" size="sm">
            {empresas.filter((e) => e.ativa).length} ativa(s) · {empresas.length} no total
            {empresas.some((e) => !e.cadastro_completo) && (
              <> · <Text span c="orange.8" style={{ cursor: 'pointer' }} onClick={() => setCadastro('incompleto')}>{empresas.filter((e) => !e.cadastro_completo).length} com cadastro incompleto</Text></>
            )}
          </Text>
        </div>
        <Group>
          <Button variant="default" leftSection={<IconFileSpreadsheet size={18} />} onClick={() => setImportando(true)}>Importar planilha</Button>
          <Button leftSection={<IconPlus size={18} />} onClick={() => abrir(null)}>Nova empresa</Button>
        </Group>
      </Group>

      <Paper withBorder p="md" radius="md">
        <Group grow align="flex-end">
          <TextInput label="Buscar" placeholder="Nome, código ou CNPJ" leftSection={<IconSearch size={16} />} value={busca} onChange={(e) => setBusca(e.currentTarget.value)} />
          <Select label="Regime" placeholder="Todos" clearable data={REGIMES} value={regime} onChange={setRegime} />
          <Select label="Responsável" placeholder="Todos" clearable searchable data={membros.map((m) => ({ value: m.id, label: m.nome }))} value={responsavel} onChange={setResponsavel} />
          <Select label="Status" data={[{ value: 'ativa', label: 'Ativas' }, { value: 'inativa', label: 'Inativas' }, { value: 'todas', label: 'Todas' }]} value={status} onChange={setStatus} allowDeselect={false} />
          <Select label="Cadastro" placeholder="Todos" clearable data={[{ value: 'incompleto', label: 'Incompleto' }, { value: 'completo', label: 'Completo' }]} value={cadastro} onChange={setCadastro} />
        </Group>
      </Paper>

      <Paper withBorder radius="md">
        {carregando ? (
          <Carregando />
        ) : filtradas.length === 0 ? (
          <Stack align="center" p="xl" gap="xs">
            <Text fw={500}>{empresas.length === 0 ? 'Nenhuma empresa cadastrada ainda.' : 'Nenhuma empresa encontrada com esses filtros.'}</Text>
            {empresas.length === 0 && (
              <Group>
                <Button variant="light" onClick={() => abrir(null)}>Cadastrar a primeira empresa</Button>
                <Button variant="default" onClick={() => setImportando(true)}>Importar de uma planilha</Button>
              </Group>
            )}
          </Stack>
        ) : (
          <Table.ScrollContainer minWidth={900}>
            <Table className="tabela-clicavel" verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={80}>Código</Table.Th>
                  <Table.Th>Empresa</Table.Th>
                  <Table.Th>CNPJ</Table.Th>
                  <Table.Th>Regime</Table.Th>
                  <Table.Th>Município</Table.Th>
                  {ativas.includes('fiscal') && <Table.Th>Resp. Fiscal</Table.Th>}
                  {ativas.includes('contabil') && <Table.Th>Resp. Contábil</Table.Th>}
                  {ativas.includes('dp') && <Table.Th>Resp. DP</Table.Th>}
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtradas.map((e) => (
                  <Table.Tr key={e.id} onClick={() => abrir(e)}>
                    <Table.Td><Text size="sm" c="dimmed">{e.codigo ?? '—'}</Text></Table.Td>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <Text fw={500} size="sm">{e.razao_social}</Text>
                        {!e.cadastro_completo && <Badge size="xs" color="orange" variant="light">Incompleto</Badge>}
                      </Group>
                      {e.nome_fantasia && <Text size="xs" c="dimmed">{e.nome_fantasia}</Text>}
                    </Table.Td>
                    <Table.Td className="nowrap"><Text size="sm" ff="monospace">{e.cnpj ? mascaraCnpj(e.cnpj) : '—'}</Text></Table.Td>
                    <Table.Td className="nowrap">{e.regime ? <Badge variant="light" color="gray">{rotuloRegime(e.regime)}</Badge> : <Text size="sm" c="dimmed">—</Text>}</Table.Td>
                    <Table.Td><Text size="sm">{e.municipio ? `${e.municipio}/${e.uf ?? ''}` : '—'}</Text></Table.Td>
                    {ativas.includes('fiscal') && <Table.Td><Text size="sm">{nomeMembro(e.resp_fiscal_id)}</Text></Table.Td>}
                    {ativas.includes('contabil') && <Table.Td><Text size="sm">{nomeMembro(e.resp_contabil_id)}</Text></Table.Td>}
                    {ativas.includes('dp') && <Table.Td><Text size="sm">{nomeMembro(e.resp_dp_id)}</Text></Table.Td>}
                    <Table.Td className="nowrap">{e.ativa ? <Badge color="green" variant="light">Ativa</Badge> : <Badge color="gray" variant="light">Inativa</Badge>}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <ImportarPlanilha aberto={importando} aoFechar={() => setImportando(false)} membros={membros} empresas={empresas} />
      <EmpresaForm key={versaoForm} aberto={aberto} aoFechar={() => setAberto(false)} empresa={editando} membros={membros} />
    </Stack>
  );
}
