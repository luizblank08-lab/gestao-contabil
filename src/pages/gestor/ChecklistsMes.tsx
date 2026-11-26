// Checklists do mês (Gestor): todas as tarefas da competência, com filtros.
import { useMemo, useState } from 'react';
import { Alert, Button, Group, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconRefresh, IconSearch } from '@tabler/icons-react';
import { useEmpresas, useMembros, useTarefas } from '../../lib/dados';
import { AREAS, REGIMES } from '../../lib/constantes';
import { competenciaPadrao, ordenarTarefas, resumir, situacao, SITUACOES, type Situacao } from '../../lib/tarefas';
import { formatarCompetencia, normalizar } from '../../lib/formatos';
import { marcarStatus } from '../../lib/acoesTarefa';
import { supabase } from '../../lib/supabase';
import { avisoErro, avisoSucesso } from '../../lib/avisos';
import { useSessao } from '../../lib/sessao';
import { Carregando } from '../../components/Carregando';
import { CompetenciaSelect } from '../../components/CompetenciaSelect';
import { TabelaTarefas } from '../../components/TabelaTarefas';
import { TarefaDrawer } from '../../components/TarefaDrawer';
import { SituacaoBadge } from '../../components/SituacaoBadge';

export function ChecklistsMes() {
  const { escritorio, membro } = useSessao();
  const [competencia, setCompetencia] = useState(() => competenciaPadrao(escritorio?.inicio_checklists));
  const { tarefas, carregando, recarregar, atualizarLocal } = useTarefas(competencia);
  const { empresas } = useEmpresas();
  const { membros } = useMembros();
  const mapaEmpresas = useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas]);
  const [busca, setBusca] = useState('');
  const [area, setArea] = useState<string | null>(null);
  const [sit, setSit] = useState<string | null>(null);
  const [resp, setResp] = useState<string | null>(null);
  const [regime, setRegime] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  const filtradas = useMemo(() => {
    const t = normalizar(busca);
    return ordenarTarefas(tarefas.filter((x) => {
      const e = mapaEmpresas.get(x.empresa_id);
      if (t && !normalizar(`${x.nome} ${e?.razao_social ?? ''} ${e?.nome_fantasia ?? ''} ${e?.codigo ?? ''}`).includes(t)) return false;
      if (area && x.area !== area) return false;
      if (regime && e?.regime !== regime) return false;
      if (resp === 'nenhum' ? x.responsavel_id !== null : resp && x.responsavel_id !== resp) return false;
      if (sit && situacao(x) !== sit) return false;
      return true;
    }));
  }, [tarefas, mapaEmpresas, busca, area, regime, resp, sit]);
  const r = resumir(filtradas);

  async function gerar() {
    setGerando(true);
    const { data, error } = await supabase().rpc('gerar_checklists', { p_competencia: competencia });
    setGerando(false);
    if (error) return avisoErro(error);
    avisoSucesso(data ? `${data} tarefa(s) criada(s) para ${formatarCompetencia(competencia)}.` : 'Tudo já estava gerado para esta competência.');
    recarregar();
  }

  async function alternarFeito(t: (typeof tarefas)[number], feito: boolean) {
    atualizarLocal(t.id, { status: feito ? 'feito' : 'pendente' });
    try { await marcarStatus(t.id, feito ? 'feito' : 'pendente'); } catch (e) { avisoErro(e); recarregar(); }
  }

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Checklists do mês</Title>
          <Text c="dimmed" size="sm">Tarefas geradas automaticamente todos os dias para cada empresa ativa.</Text>
        </div>
        <Group align="flex-end">
          <CompetenciaSelect value={competencia} onChange={setCompetencia} />
          <Button variant="default" leftSection={<IconRefresh size={18} />} loading={gerando} onClick={gerar}>Gerar / atualizar</Button>
        </Group>
      </Group>

      <Paper withBorder p="md" radius="md">
        <Group grow align="flex-end">
          <TextInput label="Buscar" placeholder="Empresa, código ou obrigação" leftSection={<IconSearch size={16} />} value={busca} onChange={(e) => setBusca(e.currentTarget.value)} />
          <Select label="Área" placeholder="Todas" clearable data={AREAS.filter((a) => escritorio?.areas_ativas.includes(a.value))} value={area} onChange={setArea} />
          <Select label="Situação" placeholder="Todas" clearable value={sit} onChange={setSit}
            data={(Object.keys(SITUACOES) as Situacao[]).map((k) => ({ value: k, label: SITUACOES[k].rotulo }))} />
          <Select label="Responsável" placeholder="Todos" clearable searchable value={resp} onChange={setResp}
            data={[{ value: 'nenhum', label: 'Sem responsável' }, ...membros.map((m) => ({ value: m.id, label: m.nome }))]} />
          <Select label="Regime" placeholder="Todos" clearable data={REGIMES} value={regime} onChange={setRegime} />
        </Group>
      </Paper>

      {!carregando && tarefas.length > 0 && (
        <Group gap="xs">
          <Text size="sm" c="dimmed">{r.total} tarefa(s) · {r.percentual}% concluído ·</Text>
          {([['atrasado', r.atrasado], ['vence_logo', r.venceLogo], ['pendente', r.pendente], ['feito', r.feito], ['nao_se_aplica', r.naoSeAplica]] as [Situacao, number][])
            .filter(([, n]) => n > 0)
            .map(([s, n]) => (
              <Group key={s} gap={4} style={{ cursor: 'pointer' }} onClick={() => setSit(sit === s ? null : s)}>
                <SituacaoBadge s={s} /><Text size="sm" fw={600}>{n}</Text>
              </Group>
            ))}
        </Group>
      )}

      <Paper withBorder radius="md">
        {carregando ? <Carregando /> : tarefas.length === 0 ? (
          <Stack align="center" p="xl" gap="sm">
            <Text fw={500}>Nenhuma tarefa para a competência {formatarCompetencia(competencia)}.</Text>
            <Text size="sm" c="dimmed" ta="center" maw={560}>
              As tarefas do mês anterior são geradas automaticamente todos os dias. Para gerar agora (ou para outra competência),
              use o botão abaixo. Só entram empresas ativas e itens que se aplicam a cada uma.
            </Text>
            <Button loading={gerando} onClick={gerar}>Gerar checklists de {formatarCompetencia(competencia)}</Button>
          </Stack>
        ) : (
          <TabelaTarefas tarefas={filtradas} empresas={mapaEmpresas} membros={membros} euId={membro?.id}
            aoAbrir={(t) => setAberta(t.id)} aoAlternarFeito={alternarFeito} vazio="Nenhuma tarefa com esses filtros." />
        )}
      </Paper>
      {tarefas.some((t) => !t.responsavel_id && t.status === 'pendente') && (
        <Alert color="orange" variant="light">
          Há tarefas sem responsável. Defina os responsáveis no cadastro da empresa — as tarefas em aberto passam automaticamente para eles.
        </Alert>
      )}

      <TarefaDrawer tarefaId={aberta} aoFechar={() => setAberta(null)} empresas={mapaEmpresas} membros={membros}
        aoAlterar={(t) => atualizarLocal(t.id, t)} />
    </Stack>
  );
}
