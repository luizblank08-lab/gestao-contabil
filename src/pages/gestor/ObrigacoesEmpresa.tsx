// Obrigações de uma empresa: aplicadas automaticamente pela regra, com exceções ajustáveis (Gestor).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Anchor, Badge, Checkbox, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { AREAS, corArea } from '../../lib/constantes';
import { descreverVencimento, obrigacoesDaEmpresa, rotuloPeriodicidade, type DadosEmpresaRegra, type ObrigacaoCalculada } from '../../lib/modelos';
import { supabase } from '../../lib/supabase';
import { avisoErro } from '../../lib/avisos';
import { useSessao } from '../../lib/sessao';
import type { Excecao, Modelo } from '../../lib/tipos';

export function useExcecoes(empresaId: string | null) {
  const [excecoes, setExcecoes] = useState<Excecao[]>([]);
  const carregar = useCallback(async () => {
    if (!empresaId) { setExcecoes([]); return; }
    const { data, error } = await supabase().from('empresa_item_excecoes').select('empresa_id, modelo_id, incluir').eq('empresa_id', empresaId);
    if (error) avisoErro(error);
    setExcecoes((data as Excecao[]) ?? []);
  }, [empresaId]);
  useEffect(() => { carregar(); }, [carregar]);
  return { excecoes, setExcecoes, recarregar: carregar };
}

export function ObrigacoesEmpresa({
  empresaId, dados, modelos, excecoes, setExcecoes,
}: {
  empresaId: string | null;
  dados: DadosEmpresaRegra;
  modelos: Modelo[];
  excecoes: Excecao[];
  setExcecoes: (f: (x: Excecao[]) => Excecao[]) => void;
}) {
  const { escritorio } = useSessao();
  const areas = AREAS.filter((a) => escritorio?.areas_ativas.includes(a.value));
  const [mostrarOutros, setMostrarOutros] = useState<Record<string, boolean>>({});
  const lista = useMemo(() => obrigacoesDaEmpresa(modelos.filter((m) => m.ativo), dados, excecoes), [modelos, dados, excecoes]);

  async function alternar(o: ObrigacaoCalculada, marcar: boolean) {
    if (!empresaId) return;
    const sb = supabase();
    const antes = excecoes;
    // Se o novo estado é o mesmo da regra, a exceção deixa de existir
    if (marcar === o.pelaRegra) {
      setExcecoes((x) => x.filter((e) => e.modelo_id !== o.modelo.id));
      const { error } = await sb.from('empresa_item_excecoes').delete().eq('empresa_id', empresaId).eq('modelo_id', o.modelo.id);
      if (error) { setExcecoes(() => antes); avisoErro(error); }
    } else {
      setExcecoes((x) => [...x.filter((e) => e.modelo_id !== o.modelo.id), { empresa_id: empresaId, modelo_id: o.modelo.id, incluir: marcar }]);
      const { error } = await sb.from('empresa_item_excecoes').upsert({ empresa_id: empresaId, modelo_id: o.modelo.id, incluir: marcar });
      if (error) { setExcecoes(() => antes); avisoErro(error); }
    }
  }

  const linha = (o: ObrigacaoCalculada) => (
    <Group key={o.modelo.id} justify="space-between" wrap="nowrap" py={6} style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
      <Checkbox
        checked={o.aplicada}
        disabled={!empresaId}
        onChange={(e) => alternar(o, e.currentTarget.checked)}
        aria-label={o.modelo.nome}
        label={
          <div>
            <Text size="sm" fw={500}>{o.modelo.nome}</Text>
            <Text size="xs" c="dimmed">{rotuloPeriodicidade(o.modelo.periodicidade)} · {descreverVencimento(o.modelo)}</Text>
          </div>
        }
      />
      {o.excecao !== null && (
        <Tooltip label={o.excecao ? 'A regra não aplicaria este item; foi acrescentado só para esta empresa.' : 'A regra aplicaria este item; foi retirado só para esta empresa.'}>
          <Badge size="sm" variant="light" color={o.excecao ? 'teal' : 'orange'}>{o.excecao ? 'Acrescentado' : 'Retirado'}</Badge>
        </Tooltip>
      )}
    </Group>
  );

  return (
    <Stack>
      <Alert color="blue" variant="light" icon={<IconInfoCircle size={18} />}>
        Os itens marcados entram automaticamente nos checklists desta empresa, conforme o regime, as atividades e se possui funcionários
        (veja a aba Dados). {empresaId
          ? 'Marque ou desmarque para abrir uma exceção só para esta empresa — vale na hora.'
          : 'Depois de cadastrar a empresa, você poderá abrir exceções aqui.'}
      </Alert>
      {areas.map((a) => {
        const daArea = lista.filter((o) => o.modelo.area === a.value);
        const aplicadas = daArea.filter((o) => o.aplicada);
        // Itens da regra ou com exceção ficam na lista principal (um item retirado continua visível, desmarcado)
        const principais = daArea.filter((o) => o.pelaRegra || o.excecao !== null);
        const outras = daArea.filter((o) => !o.pelaRegra && o.excecao === null);
        return (
          <Paper key={a.value} withBorder radius="md" p="md">
            <Group justify="space-between" mb="xs">
              <Group gap="xs">
                <Badge color={corArea(a.value)} variant="light">{a.label}</Badge>
                <Text size="sm" c="dimmed">{aplicadas.length} item(ns)</Text>
              </Group>
              {outras.length > 0 && (
                <Anchor size="sm" component="button" type="button" onClick={() => setMostrarOutros((x) => ({ ...x, [a.value]: !x[a.value] }))}>
                  {mostrarOutros[a.value] ? 'Esconder' : 'Mostrar'} {outras.length} que não se aplicam
                </Anchor>
              )}
            </Group>
            {principais.length === 0 && <Text size="sm" c="dimmed">Nenhum item desta área se aplica.</Text>}
            {principais.map(linha)}
            {mostrarOutros[a.value] && outras.length > 0 && (
              <Stack gap={0} mt="sm" opacity={0.85}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Não se aplicam pela regra</Text>
                {outras.map(linha)}
              </Stack>
            )}
          </Paper>
        );
      })}
    </Stack>
  );
}
