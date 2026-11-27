// Situação da tarefa: sempre cor + ícone + texto (nunca só a cor).
import { Badge, ThemeIcon, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconArrowBackUp, IconCheck, IconClock, IconHourglassHigh, IconMinus } from '@tabler/icons-react';
import { SITUACOES, type Situacao } from '../lib/tarefas';

const ICONES = {
  devolvida: IconArrowBackUp,
  atrasado: IconAlertTriangle,
  vence_logo: IconHourglassHigh,
  pendente: IconClock,
  feito: IconCheck,
  nao_se_aplica: IconMinus,
} as const;

export function SituacaoBadge({ s, compacto = false }: { s: Situacao; compacto?: boolean }) {
  const { rotulo, cor } = SITUACOES[s];
  const Icone = ICONES[s];
  if (compacto) {
    return (
      <Tooltip label={rotulo} withArrow>
        <ThemeIcon size={22} radius="sm" style={{ background: cor, color: s === 'pendente' ? '#0b0b0b' : '#fff' }} aria-label={rotulo}>
          <Icone size={14} stroke={2.4} />
        </ThemeIcon>
      </Tooltip>
    );
  }
  return (
    <Badge
      size="md"
      variant="light"
      leftSection={<Icone size={13} stroke={2.4} color={cor} />}
      styles={{ root: { background: `${cor}1f`, color: 'var(--mantine-color-text)', border: `1px solid ${cor}66` } }}
    >
      {rotulo}
    </Badge>
  );
}

export const IconeSituacao = ICONES;
