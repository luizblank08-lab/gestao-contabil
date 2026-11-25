// Criar/editar um item de modelo de checklist (Gestor).
import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Chip, Divider, Group, Modal, NumberInput, Paper, SegmentedControl, Select, SimpleGrid, Stack, Switch,
  Text, Textarea, TextInput,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconCalendarEvent } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { AREAS, ATIVIDADES, REGIMES, type Area } from '../../lib/constantes';
import { MESES, PERIODICIDADES, anualParaMesAno, descreverVencimento, mesAnoParaAnual } from '../../lib/modelos';
import { formatarData } from '../../lib/formatos';
import { supabase } from '../../lib/supabase';
import { avisoErro, avisoSucesso } from '../../lib/avisos';
import { useSessao } from '../../lib/sessao';
import type { Ajuste, Modelo, Periodicidade, TipoVencimento } from '../../lib/tipos';

type Valores = Omit<Modelo, 'id' | 'escritorio_id' | 'codigo_padrao' | 'ordem'>;

const vazio = (area: Area): Valores => ({
  nome: '', descricao: '', area, periodicidade: 'mensal', tipo_vencimento: 'dia_fixo', dia: 20, meses_apos: 1,
  ajuste: 'antecipa', regimes: [], atividades: [], somente_com_funcionarios: false, ativo: true,
});

/** Competências usadas na prévia (a partir do mês atual) */
function competenciasPrevia(p: Periodicidade): { rotulo: string; data: string }[] {
  const hoje = dayjs().startOf('month');
  if (p === 'mensal') return [0, 1, 2].map((i) => { const d = hoje.add(i, 'month'); return { rotulo: `Competência ${d.format('MM/YYYY')}`, data: d.format('YYYY-MM-DD') }; });
  if (p === 'trimestral') {
    const ini = hoje.month(Math.floor(hoje.month() / 3) * 3);
    return [0, 3].map((i) => { const d = ini.add(i, 'month'); return { rotulo: `${Math.floor(d.month() / 3) + 1}º trimestre/${d.year()}`, data: d.format('YYYY-MM-DD') }; });
  }
  return [0, 1].map((i) => { const d = hoje.add(i, 'year'); return { rotulo: `Ano-base ${d.year()}`, data: d.format('YYYY-MM-DD') }; });
}

export function ModeloForm({
  aberto, aoFechar, modelo, areaInicial,
}: { aberto: boolean; aoFechar: () => void; modelo: Modelo | null; areaInicial: Area }) {
  const { escritorio } = useSessao();
  // O formulário é recriado a cada abertura (key), então já nasce com os dados do item
  const [v, setV] = useState<Valores>(() => (modelo ? { ...modelo, descricao: modelo.descricao ?? '' } : vazio(areaInicial)));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [previa, setPrevia] = useState<string[] | null>(null);


  const muda = <K extends keyof Valores>(k: K, valor: Valores[K]) => setV((x) => ({ ...x, [k]: valor }));

  // Ao trocar a periodicidade, sugere um mês de vencimento sensato
  function mudaPeriodicidade(p: Periodicidade) {
    setV((x) => ({ ...x, periodicidade: p, meses_apos: p === 'anual' ? 3 : 1 }));
  }

  const regraVencimento = useMemo(
    () => ({ periodicidade: v.periodicidade, tipo_vencimento: v.tipo_vencimento, dia: v.dia, meses_apos: v.meses_apos, ajuste: v.ajuste }),
    [v.periodicidade, v.tipo_vencimento, v.dia, v.meses_apos, v.ajuste],
  );
  const [regraAtrasada] = useDebouncedValue(regraVencimento, 300);
  const comps = useMemo(() => competenciasPrevia(regraAtrasada.periodicidade), [regraAtrasada.periodicidade]);

  // Prévia calculada pelo próprio banco (mesma regra usada para gerar os checklists)
  useEffect(() => {
    if (!aberto) return;
    const r = regraAtrasada;
    if (r.tipo_vencimento !== 'ultimo_dia_util' && !r.dia) { setPrevia(null); return; }
    supabase().rpc('previa_vencimentos', {
      p_periodicidade: r.periodicidade, p_tipo: r.tipo_vencimento, p_dia: r.dia, p_meses_apos: r.meses_apos, p_ajuste: r.ajuste,
      p_competencias: comps.map((c) => c.data),
    }).then(({ data, error }) => setPrevia(error ? null : (data as string[])));
  }, [aberto, regraAtrasada, comps]);

  async function salvar() {
    setErro('');
    if (!v.nome.trim()) return setErro('Informe o nome do item.');
    if (v.tipo_vencimento === 'dia_fixo' && (!v.dia || v.dia < 1 || v.dia > 31)) return setErro('O dia do vencimento deve ser de 1 a 31.');
    if (v.tipo_vencimento === 'dia_util' && (!v.dia || v.dia < 1 || v.dia > 22)) return setErro('O dia útil deve ser de 1 a 22.');
    setSalvando(true);
    const dados = {
      nome: v.nome.trim(), descricao: v.descricao?.trim() || null, area: v.area, periodicidade: v.periodicidade,
      tipo_vencimento: v.tipo_vencimento, dia: v.tipo_vencimento === 'ultimo_dia_util' ? null : v.dia,
      meses_apos: v.meses_apos, ajuste: v.ajuste, regimes: v.regimes, atividades: v.atividades,
      somente_com_funcionarios: v.somente_com_funcionarios, ativo: v.ativo,
    };
    const sb = supabase();
    const { error } = modelo
      ? await sb.from('modelos_checklist').update(dados).eq('id', modelo.id)
      : await sb.from('modelos_checklist').insert({ ...dados, ordem: 1000 });
    setSalvando(false);
    if (error) return avisoErro(error);
    avisoSucesso(modelo ? 'Item atualizado.' : 'Item criado.');
    aoFechar();
  }

  function excluir() {
    if (!modelo) return;
    modals.openConfirmModal({
      title: 'Excluir item?',
      children: (
        <Text size="sm">
          <b>{modelo.nome}</b> deixará de ser aplicado às empresas. Se só quer parar de usar por um tempo, prefira
          <b> desativar</b>.{modelo.codigo_padrao && ' Itens que vieram prontos podem ser recolocados depois em "Restaurar itens padrão".'}
        </Text>
      ),
      labels: { confirm: 'Excluir', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        const { error } = await supabase().from('modelos_checklist').delete().eq('id', modelo.id);
        if (error) return avisoErro(error);
        avisoSucesso('Item excluído.');
        aoFechar();
      },
    });
  }

  const areas = AREAS.filter((a) => escritorio?.areas_ativas.includes(a.value) || a.value === v.area);
  const { mes: mesAnual, ano: anoAnual } = anualParaMesAno(v.meses_apos);

  return (
    <Modal opened={aberto} onClose={aoFechar} size="xl" title={<Text fw={600} size="lg">{modelo ? 'Editar item' : 'Novo item'}</Text>}>
      <Stack>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <TextInput label="Nome do item" required style={{ gridColumn: 'span 2' }} value={v.nome} onChange={(e) => muda('nome', e.currentTarget.value)} />
          <Select label="Área" data={areas} value={v.area} onChange={(x) => x && muda('area', x as Area)} allowDeselect={false} />
        </SimpleGrid>
        <Textarea label="Orientação (opcional)" placeholder="Ex.: onde fazer, o que conferir, observações sobre o prazo" autosize minRows={1} maxRows={4}
          value={v.descricao ?? ''} onChange={(e) => muda('descricao', e.currentTarget.value)} />

        <Divider label="Vencimento" labelPosition="left" />
        <div>
          <Text size="sm" fw={500} mb={4}>Periodicidade</Text>
          <SegmentedControl data={PERIODICIDADES} value={v.periodicidade} onChange={(x) => mudaPeriodicidade(x as Periodicidade)} />
        </div>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Select label="Tipo de prazo" allowDeselect={false} value={v.tipo_vencimento}
            onChange={(x) => setV((s) => ({ ...s, tipo_vencimento: x as TipoVencimento, dia: x === 'ultimo_dia_util' ? null : s.dia ?? (x === 'dia_util' ? 5 : 20) }))}
            data={[{ value: 'dia_fixo', label: 'Dia fixo do mês' }, { value: 'dia_util', label: 'N-ésimo dia útil' }, { value: 'ultimo_dia_util', label: 'Último dia útil' }]} />
          {v.tipo_vencimento !== 'ultimo_dia_util' && (
            <NumberInput label={v.tipo_vencimento === 'dia_util' ? 'Qual dia útil' : 'Dia (31 = último dia)'} min={1} max={v.tipo_vencimento === 'dia_util' ? 22 : 31}
              value={v.dia ?? ''} onChange={(x) => muda('dia', typeof x === 'number' ? x : null)} allowDecimal={false} />
          )}
          {v.periodicidade === 'anual' ? (
            <Group grow gap="xs" align="flex-end">
              <Select label="Mês" allowDeselect={false} value={String(mesAnual)} data={MESES.map((m, i) => ({ value: String(i + 1), label: m[0].toUpperCase() + m.slice(1) }))}
                onChange={(x) => x && muda('meses_apos', mesAnoParaAnual(Number(x), anoAnual))} />
              <Select label="Ano" allowDeselect={false} value={String(anoAnual)} data={[{ value: '0', label: 'do próprio ano' }, { value: '1', label: 'do ano seguinte' }]}
                onChange={(x) => x && muda('meses_apos', mesAnoParaAnual(mesAnual, Number(x)))} />
            </Group>
          ) : (
            <Select label="Em qual mês" allowDeselect={false} value={String(v.meses_apos)} onChange={(x) => x && muda('meses_apos', Number(x))}
              data={v.periodicidade === 'mensal'
                ? [{ value: '0', label: 'No próprio mês da competência' }, { value: '1', label: 'No mês seguinte' }, { value: '2', label: 'No 2º mês seguinte' }, { value: '3', label: 'No 3º mês seguinte' }]
                : [{ value: '0', label: 'No último mês do trimestre' }, { value: '1', label: 'No mês seguinte ao trimestre' }, { value: '2', label: 'No 2º mês seguinte ao trimestre' }, { value: '3', label: 'No 3º mês seguinte ao trimestre' }]} />
          )}
        </SimpleGrid>
        {v.tipo_vencimento === 'dia_fixo' && (
          <Select label="Se cair em fim de semana ou feriado" allowDeselect={false} value={v.ajuste} onChange={(x) => x && muda('ajuste', x as Ajuste)}
            data={[{ value: 'antecipa', label: 'Antecipa para o dia útil anterior' }, { value: 'posterga', label: 'Adia para o próximo dia útil' }, { value: 'nenhum', label: 'Mantém a data' }]} maw={360} />
        )}
        <Paper withBorder p="sm" radius="md" bg="indigo.0">
          <Group gap="xs" mb={4}><IconCalendarEvent size={18} /><Text fw={600} size="sm">{descreverVencimento(v)}</Text></Group>
          {previa && (
            <Group gap="lg">
              {comps.map((c, i) => <Text key={c.data} size="sm">{c.rotulo} → vence em <b>{formatarData(previa[i])}</b></Text>)}
            </Group>
          )}
          <Text size="xs" c="dimmed" mt={4}>Feriados nacionais (inclusive Carnaval e Corpus Christi) já são considerados. Feriados estaduais e municipais ainda não.</Text>
        </Paper>

        <Divider label="Aplica-se a" labelPosition="left" />
        <div>
          <Text size="sm" fw={500} mb={4}>Regimes <Text span c="dimmed" size="xs">(nenhum marcado = todos)</Text></Text>
          <Chip.Group multiple value={v.regimes} onChange={(x) => muda('regimes', x as Valores['regimes'])}>
            <Group gap="xs">{REGIMES.map((r) => <Chip key={r.value} value={r.value} size="sm">{r.label}</Chip>)}</Group>
          </Chip.Group>
        </div>
        <div>
          <Text size="sm" fw={500} mb={4}>Atividades <Text span c="dimmed" size="xs">(nenhuma marcada = todas)</Text></Text>
          <Chip.Group multiple value={v.atividades} onChange={(x) => muda('atividades', x as Valores['atividades'])}>
            <Group gap="xs">{ATIVIDADES.map((a) => <Chip key={a.value} value={a.value} size="sm">{a.label}</Chip>)}</Group>
          </Chip.Group>
        </div>
        <Switch label="Somente empresas com funcionários" checked={v.somente_com_funcionarios} onChange={(e) => muda('somente_com_funcionarios', e.currentTarget.checked)} />
        <Switch label={v.ativo ? 'Item ativo' : 'Item desativado (não se aplica a nenhuma empresa)'} checked={v.ativo} onChange={(e) => muda('ativo', e.currentTarget.checked)} />

        {erro && <Alert color="red">{erro}</Alert>}
        <Group justify="space-between">
          {modelo ? <Button variant="subtle" color="red" onClick={excluir}>Excluir item</Button> : <span />}
          <Group>
            <Button variant="default" onClick={aoFechar}>Cancelar</Button>
            <Button loading={salvando} onClick={salvar}>{modelo ? 'Salvar' : 'Criar item'}</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
