// Painel do Gestor: resumo do mês, por área, por responsável, por empresa e grade.
import { useMemo, useState } from 'react';
import {
  Badge, Button, Grid, Group, Paper, Progress, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, TextInput, Title,
} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useEmpresas, useMembros, useModelos, useTarefas } from '../../lib/dados';
import { AREAS, REGIMES, corArea, rotuloArea, type Area } from '../../lib/constantes';
import { competenciaPadrao, resumir, resumirPor, SITUACOES } from '../../lib/tarefas';
import { formatarCompetencia, formatarPercentual, normalizar } from '../../lib/formatos';
import { useSessao } from '../../lib/sessao';
import { Carregando } from '../../components/Carregando';
import { CompetenciaSelect } from '../../components/CompetenciaSelect';
import { TarefaDrawer } from '../../components/TarefaDrawer';
import { BarraSituacoes, BlocoNumero, LinhaProgresso } from '../../components/Indicadores';
import { GradeEmpresas } from '../../components/GradeEmpresas';

export function Painel() {
  const { escritorio } = useSessao();
  const areasAtivas = AREAS.filter((a) => escritorio?.areas_ativas.includes(a.value));
  const [competencia, setCompetencia] = useState(() => competenciaPadrao(escritorio?.inicio_checklists));
  const { tarefas, carregando, atualizarLocal } = useTarefas(competencia);
  const { empresas } = useEmpresas();
  const { membros } = useMembros();
  const { modelos } = useModelos();
  const mapaEmpresas = useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas]);
  const [area, setArea] = useState<string | null>(null);
  const [regime, setRegime] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [resp, setResp] = useState<string | null>(null);
  const [areaGrade, setAreaGrade] = useState<Area>(areasAtivas[0]?.value ?? 'fiscal');
  const [buscaEmpresa, setBuscaEmpresa] = useState('');
  const [todasEmpresas, setTodasEmpresas] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  const filtradas = useMemo(() => tarefas.filter((t) => {
    const e = mapaEmpresas.get(t.empresa_id);
    if (area && t.area !== area) return false;
    if (regime && e?.regime !== regime) return false;
    if (empresaId && t.empresa_id !== empresaId) return false;
    if (resp === 'nenhum' ? t.responsavel_id !== null : resp && t.responsavel_id !== resp) return false;
    return true;
  }), [tarefas, mapaEmpresas, area, regime, empresaId, resp]);

  const r = resumir(filtradas);
  const porArea = resumirPor(filtradas, (t) => t.area);
  const porResp = resumirPor(filtradas, (t) => t.responsavel_id ?? 'nenhum')
    .map((x) => ({ ...x, nome: x.chave === 'nenhum' ? 'Sem responsável' : membros.find((m) => m.id === x.chave)?.nome ?? '—' }))
    .sort((a, b) => b.atrasado - a.atrasado || a.percentual - b.percentual || a.nome.localeCompare(b.nome));
  const porEmpresa = resumirPor(filtradas, (t) => t.empresa_id)
    .map((x) => ({ ...x, nome: mapaEmpresas.get(x.chave)?.razao_social ?? '—', codigo: mapaEmpresas.get(x.chave)?.codigo }))
    .filter((x) => !buscaEmpresa || normalizar(`${x.nome} ${x.codigo ?? ''}`).includes(normalizar(buscaEmpresa)))
    .sort((a, b) => a.percentual - b.percentual || b.atrasado - a.atrasado || a.nome.localeCompare(b.nome));
  const empresasVisiveis = todasEmpresas ? porEmpresa : porEmpresa.slice(0, 12);
  const daGrade = filtradas.filter((t) => t.area === areaGrade);

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Painel</Title>
          <Text c="dimmed" size="sm">Competência {formatarCompetencia(competencia)} · atualiza sozinho quando alguém marca uma tarefa</Text>
        </div>
      </Group>

      <Paper withBorder p="md" radius="md">
        <Group grow align="flex-end">
          <CompetenciaSelect value={competencia} onChange={setCompetencia} />
          <Select label="Área" placeholder="Todas" clearable data={areasAtivas} value={area} onChange={setArea} />
          <Select label="Regime" placeholder="Todos" clearable data={REGIMES} value={regime} onChange={setRegime} />
          <Select label="Empresa" placeholder="Todas" clearable searchable value={empresaId} onChange={setEmpresaId}
            data={empresas.map((e) => ({ value: e.id, label: e.codigo ? `${e.codigo} · ${e.razao_social}` : e.razao_social }))} limit={50} />
          <Select label="Responsável" placeholder="Todos" clearable searchable value={resp} onChange={setResp}
            data={[{ value: 'nenhum', label: 'Sem responsável' }, ...membros.map((m) => ({ value: m.id, label: m.nome }))]} />
        </Group>
      </Paper>

      {carregando ? <Carregando /> : tarefas.length === 0 ? (
        <Paper withBorder p="xl" radius="md">
          <Stack align="center" gap="xs">
            <Text fw={500}>Ainda não há tarefas para {formatarCompetencia(competencia)}.</Text>
            <Text size="sm" c="dimmed">Elas são geradas automaticamente. Para gerar agora, vá em <b>Checklists do mês</b> › Gerar / atualizar.</Text>
          </Stack>
        </Paper>
      ) : (
        <>
          <Paper withBorder radius="md" p="md">
            <Group justify="space-between" mb="sm" align="flex-end">
              <div>
                <Text size="sm" c="dimmed" fw={500}>Conclusão geral</Text>
                <Group gap="xs" align="baseline">
                  <Text fw={700} style={{ fontSize: 40, lineHeight: 1 }}>{formatarPercentual(r.percentual)}</Text>
                  <Text size="sm" c="dimmed">{r.feito + r.naoSeAplica} de {r.total} tarefas</Text>
                </Group>
              </div>
            </Group>
            <BarraSituacoes r={r} altura={14} />
          </Paper>

          <SimpleGrid cols={{ base: 2, md: 5 }}>
            <BlocoNumero s="feito" rotulo="Feitas" valor={r.feito} detalhe={r.naoSeAplica ? `+ ${r.naoSeAplica} não se aplica` : undefined} />
            <BlocoNumero s="pendente" rotulo="Pendentes no prazo" valor={r.pendente + r.venceLogo} />
            <BlocoNumero s="vence_logo" rotulo="Vencem em até 7 dias" valor={r.venceLogo} />
            <BlocoNumero s="atrasado" rotulo="Atrasadas" valor={r.atrasado} />
            <BlocoNumero s="devolvida" rotulo="Devolvidas p/ correção" valor={r.devolvida} />
          </SimpleGrid>

          <Grid gutter="md">
            <Grid.Col span={{ base: 12, lg: 5 }}>
              <Stack>
                <Paper withBorder radius="md" p="md">
                  <Text fw={600} mb="md">Por área</Text>
                  <Stack gap="md">
                    {areasAtivas.map((a) => {
                      const x = porArea.find((p) => p.chave === a.value);
                      return x ? <LinhaProgresso key={a.value} nome={a.label} r={x} detalhe={`${x.feito + x.naoSeAplica} de ${x.total} concluídas`} aoClicar={() => setArea(area === a.value ? null : a.value)} />
                        : <Text key={a.value} size="sm" c="dimmed">{a.label}: sem tarefas</Text>;
                    })}
                  </Stack>
                </Paper>

                <Paper withBorder radius="md" p="md">
                  <Group justify="space-between" mb="sm">
                    <Text fw={600}>Por empresa</Text>
                    <TextInput size="xs" w={200} placeholder="Buscar empresa" leftSection={<IconSearch size={14} />} value={buscaEmpresa} onChange={(e) => setBuscaEmpresa(e.currentTarget.value)} />
                  </Group>
                  <Text size="xs" c="dimmed" mb="md">As com menos progresso primeiro. Clique para filtrar o painel.</Text>
                  <Stack gap="md">
                    {empresasVisiveis.map((x) => (
                      <LinhaProgresso key={x.chave} nome={x.codigo ? `${x.codigo} · ${x.nome}` : x.nome} r={x}
                        aoClicar={() => setEmpresaId(empresaId === x.chave ? null : x.chave)} />
                    ))}
                  </Stack>
                  {porEmpresa.length > 12 && (
                    <Button variant="subtle" size="xs" mt="sm" onClick={() => setTodasEmpresas((v) => !v)}>
                      {todasEmpresas ? 'Mostrar menos' : `Mostrar todas (${porEmpresa.length})`}
                    </Button>
                  )}
                </Paper>
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, lg: 7 }}>
              <Paper withBorder radius="md" p="md">
                <Text fw={600} mb="sm">Desempenho por responsável</Text>
                <Table verticalSpacing="xs" className="tabela-clicavel">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Responsável</Table.Th>
                      <Table.Th ta="right">Tarefas</Table.Th>
                      <Table.Th ta="right">Concluídas</Table.Th>
                      <Table.Th ta="right">Pendentes</Table.Th>
                      <Table.Th ta="right">Atrasadas</Table.Th>
                      <Table.Th w={160}>Conclusão</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {porResp.map((x) => (
                      <Table.Tr key={x.chave} onClick={() => setResp(resp === x.chave ? null : x.chave)}>
                        <Table.Td><Text size="sm" fw={500} c={x.chave === 'nenhum' ? 'orange.8' : undefined}>{x.nome}</Text></Table.Td>
                        <Table.Td ta="right">{x.total}</Table.Td>
                        <Table.Td ta="right">{x.feito + x.naoSeAplica}</Table.Td>
                        <Table.Td ta="right">{x.pendente + x.venceLogo + x.devolvida}</Table.Td>
                        <Table.Td ta="right">{x.atrasado > 0 ? <Badge color="red" variant="light" leftSection="⚠">{x.atrasado}</Badge> : 0}</Table.Td>
                        <Table.Td>
                          <Group gap={8} wrap="nowrap">
                            <Progress value={x.percentual} color={SITUACOES.feito.cor} size="md" style={{ flex: 1 }} aria-label={`${x.percentual}%`} />
                            <Text size="xs" fw={600} w={36} ta="right">{x.percentual}%</Text>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>
            </Grid.Col>
          </Grid>

          <Paper withBorder radius="md" p="md">
            <Group justify="space-between" mb="sm">
              <div>
                <Text fw={600}>Grade: empresas × obrigações</Text>
                <Text size="xs" c="dimmed">Clique numa célula para abrir a tarefa. "·" = não se aplica à empresa.</Text>
              </div>
              <SegmentedControl value={areaGrade} onChange={(v) => setAreaGrade(v as Area)}
                data={areasAtivas.map((a) => ({ value: a.value, label: `${a.label} (${filtradas.filter((t) => t.area === a.value).length})` }))} />
            </Group>
            <Group gap="md" mb="sm">
              {(['feito', 'pendente', 'vence_logo', 'atrasado', 'devolvida', 'nao_se_aplica'] as const).map((s) => (
                <Group key={s} gap={6}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: SITUACOES[s].cor, display: 'inline-block' }} />
                  <Text size="xs" c="dimmed">{SITUACOES[s].rotulo}</Text>
                </Group>
              ))}
              <Badge size="xs" variant="light" color={corArea(areaGrade)}>{rotuloArea(areaGrade)}</Badge>
            </Group>
            <GradeEmpresas tarefas={daGrade} empresas={mapaEmpresas} modelos={modelos} aoAbrir={(t) => setAberta(t.id)} />
          </Paper>
        </>
      )}

      <TarefaDrawer tarefaId={aberta} aoFechar={() => setAberta(null)} empresas={mapaEmpresas} membros={membros} aoAlterar={(t) => atualizarLocal(t.id, t)} />
    </Stack>
  );
}
