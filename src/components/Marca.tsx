import { Group, Text, ThemeIcon } from '@mantine/core';
import { IconChecklist } from '@tabler/icons-react';

export function Marca({ tamanho = 'md' }: { tamanho?: 'md' | 'lg' }) {
  const grande = tamanho === 'lg';
  return (
    <Group gap="xs" wrap="nowrap">
      <ThemeIcon size={grande ? 44 : 34} radius="md" variant="filled">
        <IconChecklist size={grande ? 26 : 20} />
      </ThemeIcon>
      <div>
        <Text fw={700} size={grande ? 'xl' : 'md'} lh={1.1}>Gestão Contábil</Text>
        <Text size="xs" c="dimmed">Obrigações fiscais e contábeis</Text>
      </div>
    </Group>
  );
}
