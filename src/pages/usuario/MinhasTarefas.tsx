// Painel do usuário: minhas tarefas (atrasadas, vencendo em 7 dias, pendentes) e conclusão por empresa.
import { useMemo, useState } from 'react';
import { Alert, Grid, Group, Paper, ScrollArea, SegmentedControl, SimpleGrid, Stack, Tabs, Text, Title } from '@mantine/core';
import { useEmpresas, useMembros, useTarefas } from '../../lib/dados';
import { competenciaPadrao, ordenarTarefas, resumir, resumirPor, situacao } from '../../lib/tarefas';
import { formatarCompetencia } from '../../lib/formatos';
import { marcarStatus } from '../../lib/acoesTarefa';
import { avisoErro } from '../../lib/avisos';
import { useSessao } from '../../lib/sessao';
import { Carregando } from '../../components/Carregando';
import { CompetenciaSelect } from '../../components/CompetenciaSelect';
import { TabelaTarefas } from '../../components/TabelaTarefas';
import { TarefaDrawer } from '../../components/TarefaDrawer';
import { BlocoNumero, LinhaProgresso } from '../../components/Indicadores';
import type { Tarefa } from '../../lib/tipos';

type Aba = 'devolvidas' | 'atrasadas' | 'semana' | 'pendentes' | 'concluidas';

export function MinhasTarefas() {
  const { escritorio, membro } = useSessao();
  const [competencia, setCompetencia] = useState(() => competenciaPadrao(escritorio?.inicio_checklists));
  const [escopo, setEscopo] = useState<'minhas' | 'todas'>('minhas');
  const { tarefas, carregando, recarregar, atualizarLocal } = useTarefas(competencia, { pendentesAnteriores: true });
  const { empresas } = useEmpresas();
  const { membros } = useMembros();
  const mapaEmpresas = useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas]);
  const [aba, setAba] = useState<Aba | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  const base = useMemo(() => (escopo === 'minhas' ? tarefas.filter((t) => t.responsavel_id === membro?.id) : tarefas), [tarefas, escopo, membro?.id]);
  const grupos = useMemo(() => {
    const g: Record<Aba, Tarefa[]> = { devolvidas: [], atrasadas: [], semana: [], pendentes: [], concluidas: [] };
    for (const t of ordenarTarefas(base)) {
      const s = situacao(t);
      if (s === 'devolvida') g.devolvidas.push(t);
      else if (s === 'atrasado') g.atrasadas.push(t);
      else if (s === 'vence_logo') g.semana.push(t);
      else if (s === 'pendente') g.pendentes.push(t);
      else if (t.competencia === competencia) g.concluidas.push(t);
    }
    return g;
  }, [base, competencia]);
  const daCompetencia = base.filter((t) => t.competencia === competencia);
  const r = resumir(daCompetencia);
  const anteriores = base.filter((t) => t.competencia < competencia).length;
  const abaAtual: Aba = aba ?? (grupos.devolvidas.length ? 'devolvidas' : grupos.atrasadas.length ? 'atrasadas' : grupos.semana.length ? 'semana' : 'pendentes');
  const porEmpresa = resumirPor(daCompetencia, (t) => t.empresa_id)
    .map((x) => ({ ...x, nome: mapaEmpresas.get(x.chave)?.razao_social ?? '—' }))
    .sort((a, b) => a.percentual - b.percentual || b.atrasado - a.atrasado || a.nome.localeCompare(b.nome));

  async function alternarFeito(t: Tarefa, feito: boolean) {
    atualizarLocal(t.id, { status: feito ? 'feito' : 'pendente' });
    try { await marcarStatus(t.id, feito ? 'feito' : 'pendente'); } catch (e) { avisoErro(e); recarregar(); }
  }

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Minhas tarefas</Title>
          <Text c="dimmed" size="sm">Olá, {membro?.nome.split(' ')[0]}! Competência {formatarCompetencia(competencia)}{anteriores > 0 ? ` + ${anteriores} pendente(s) de meses anteriores` : ''}.</Text>
        </div>
        <Group align="flex-end">
          <SegmentedControl value={escopo} onChange={(v) => setEscopo(v as 'minhas' | 'todas')}
            data={[{ value: 'minhas', label: 'Só as minhas' }, { value: 'todas', label: 'Todas das minhas empresas' }]} />
          <CompetenciaSelect value={competencia} onChange={setCompetencia} />
        </Group>
      </Group>

      {carregando ? <Carregando /> : (
        <>
          {grupos.devolvidas.length > 0 && (
            <Alert color="grape" variant="light" title={`${grupos.devolvidas.length} tarefa(s) devolvida(s) pelo Gestor para correção`}
              style={{ cursor: 'pointer' }} onClick={() => setAba('devolvidas')}>
              Abra cada uma para ver o que precisa ser corrigido. Depois de corrigir, marque como feita de novo.
            </Alert>
          )}
          <SimpleGrid cols={{ base: 2, md: 4 }}>
            <BlocoNumero s="atrasado" rotulo="Atrasadas" valor={grupos.atrasadas.length} ativo={abaAtual === 'atrasadas'} aoClicar={() => setAba('atrasadas')} />
            <BlocoNumero s="vence_logo" rotulo="Vencem em até 7 dias" valor={grupos.semana.length} ativo={abaAtual === 'semana'} aoClicar={() => setAba('semana')} />
            <BlocoNumero s="pendente" rotulo="Demais pendentes" valor={grupos.pendentes.length} ativo={abaAtual === 'pendentes'} aoClicar={() => setAba('pendentes')} />
            <BlocoNumero s="feito" rotulo="Concluídas" valor={r.feito + r.naoSeAplica} detalhe={`${r.percentual}% da competência`} ativo={abaAtual === 'concluidas'} aoClicar={() => setAba('concluidas')} />
          </SimpleGrid>

          <Grid gutter="md">
            <Grid.Col span={{ base: 12, xl: 9 }}>
              <Paper withBorder radius="md">
                <Tabs value={abaAtual} onChange={(v) => v && setAba(v as Aba)}>
                  <Tabs.List px="sm" pt="xs">
                    {grupos.devolvidas.length > 0 && <Tabs.Tab value="devolvidas" color="grape">Devolvidas ({grupos.devolvidas.length})</Tabs.Tab>}
                    <Tabs.Tab value="atrasadas">Atrasadas ({grupos.atrasadas.length})</Tabs.Tab>
                    <Tabs.Tab value="semana">Próximos 7 dias ({grupos.semana.length})</Tabs.Tab>
                    <Tabs.Tab value="pendentes">Pendentes ({grupos.pendentes.length})</Tabs.Tab>
                    <Tabs.Tab value="concluidas">Concluídas ({grupos.concluidas.length})</Tabs.Tab>
                  </Tabs.List>
                </Tabs>
                <TabelaTarefas
                  tarefas={grupos[abaAtual]} empresas={mapaEmpresas} membros={membros} euId={membro?.id}
                  mostrarResponsavel={escopo === 'todas'} aoAbrir={(t) => setAberta(t.id)} aoAlternarFeito={alternarFeito}
                  vazio={abaAtual === 'atrasadas' ? 'Nenhuma tarefa atrasada. 👏' : 'Nenhuma tarefa aqui.'}
                />
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, xl: 3 }}>
              <Paper withBorder radius="md" p="md">
                <Text fw={600} mb={2}>Conclusão por empresa</Text>
                <Text size="xs" c="dimmed" mb="md">Competência {formatarCompetencia(competencia)} · as com menos progresso primeiro</Text>
                {porEmpresa.length === 0 ? <Text size="sm" c="dimmed">Sem tarefas nesta competência.</Text> : (
                  <ScrollArea.Autosize mah={560}>
                    <Stack gap="md" pr="sm">
                      {porEmpresa.map((x) => <LinhaProgresso key={x.chave} nome={x.nome} r={x} detalhe={`${x.feito + x.naoSeAplica} de ${x.total} concluídas`} />)}
                    </Stack>
                  </ScrollArea.Autosize>
                )}
              </Paper>
            </Grid.Col>
          </Grid>
        </>
      )}

      <TarefaDrawer tarefaId={aberta} aoFechar={() => setAberta(null)} empresas={mapaEmpresas} membros={membros} aoAlterar={(t) => atualizarLocal(t.id, t)} />
    </Stack>
  );
}
