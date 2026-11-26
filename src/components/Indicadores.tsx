// Indicadores: blocos de número e barra de progresso por situação.
import { Group, Paper, Progress, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core';
import { SITUACOES, type Resumo, type Situacao } from '../lib/tarefas';
import { formatarPercentual } from '../lib/formatos';
import { IconeSituacao } from './SituacaoBadge';

export function BlocoNumero({
  s, rotulo, valor, detalhe, ativo, aoClicar,
}: { s: Situacao; rotulo: string; valor: number; detalhe?: string; ativo?: boolean; aoClicar?: () => void }) {
  const { cor } = SITUACOES[s];
  const Icone = IconeSituacao[s];
  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      onClick={aoClicar}
      style={{ cursor: aoClicar ? 'pointer' : undefined, borderColor: ativo ? cor : undefined, boxShadow: ativo ? `0 0 0 1px ${cor}` : undefined }}
      aria-label={`${rotulo}: ${valor}`}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text size="sm" c="dimmed" fw={500}>{rotulo}</Text>
          <Text fw={700} style={{ fontSize: 32, lineHeight: 1.15 }}>{valor}</Text>
          {detalhe && <Text size="xs" c="dimmed">{detalhe}</Text>}
        </div>
        <ThemeIcon size={36} radius="md" style={{ background: `${cor}22`, color: cor }}>
          <Icone size={20} stroke={2.2} />
        </ThemeIcon>
      </Group>
    </Paper>
  );
}

/** Barra dividida por situação, com legenda; o percentual é (feitas + não se aplica) / total */
export function BarraSituacoes({ r, altura = 12, legenda = true }: { r: Resumo; altura?: number; legenda?: boolean }) {
  const partes: [Situacao, number][] = [
    ['feito', r.feito], ['nao_se_aplica', r.naoSeAplica], ['pendente', r.pendente], ['vence_logo', r.venceLogo], ['atrasado', r.atrasado],
  ];
  return (
    <Stack gap={6}>
      <Progress.Root size={altura} radius="sm" style={{ background: 'var(--mantine-color-gray-1)' }}>
        {r.total > 0 && partes.filter(([, n]) => n > 0).map(([s, n]) => (
          <Tooltip key={s} label={`${SITUACOES[s].rotulo}: ${n}`} withArrow>
            <Progress.Section value={(n / r.total) * 100} style={{ background: SITUACOES[s].cor, borderRight: '2px solid var(--mantine-color-body)' }} />
          </Tooltip>
        ))}
      </Progress.Root>
      {legenda && (
        <Group gap="md">
          {partes.filter(([, n]) => n > 0).map(([s, n]) => (
            <Group key={s} gap={6}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: SITUACOES[s].cor, display: 'inline-block' }} />
              <Text size="xs" c="dimmed">{SITUACOES[s].rotulo}: <b>{n}</b></Text>
            </Group>
          ))}
        </Group>
      )}
    </Stack>
  );
}

/** Linha "nome — barra — percentual" para listas de conclusão */
export function LinhaProgresso({ nome, detalhe, r, aoClicar }: { nome: string; detalhe?: string; r: Resumo; aoClicar?: () => void }) {
  return (
    <div onClick={aoClicar} style={{ cursor: aoClicar ? 'pointer' : undefined }}>
      <Group justify="space-between" mb={4} wrap="nowrap">
        <Text size="sm" fw={500} truncate style={{ minWidth: 0 }}>{nome}</Text>
        <Group gap={8} wrap="nowrap">
          {r.atrasado > 0 && <Text size="xs" c="red.7" fw={600}>{r.atrasado} atrasada(s)</Text>}
          <Text size="sm" fw={600}>{formatarPercentual(r.percentual)}</Text>
        </Group>
      </Group>
      <BarraSituacoes r={r} altura={8} legenda={false} />
      {detalhe && <Text size="xs" c="dimmed" mt={2}>{detalhe}</Text>}
    </div>
  );
}
