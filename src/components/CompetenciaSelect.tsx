import { Select } from '@mantine/core';
import { IconCalendarMonth } from '@tabler/icons-react';
import { useMemo } from 'react';
import { listaCompetencias } from '../lib/tarefas';

export function CompetenciaSelect({ value, onChange, label = 'Competência' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const dados = useMemo(() => listaCompetencias(), []);
  return (
    <Select
      label={label}
      w={150}
      leftSection={<IconCalendarMonth size={16} />}
      data={dados}
      value={value}
      onChange={(v) => v && onChange(v)}
      allowDeselect={false}
      searchable
      maxDropdownHeight={300}
      aria-label="Competência"
    />
  );
}
