import { Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconHourglass } from '@tabler/icons-react';

export function EmBreve({ titulo, etapa, descricao }: { titulo: string; etapa: number; descricao: string }) {
  return (
    <Stack>
      <Title order={2}>{titulo}</Title>
      <Paper withBorder p="xl" radius="md">
        <Stack align="center" gap="sm" py="xl">
          <ThemeIcon size={56} radius="xl" variant="light"><IconHourglass size={30} /></ThemeIcon>
          <Text fw={600} size="lg">Chega na Etapa {etapa}</Text>
          <Text c="dimmed" ta="center" maw={520}>{descricao}</Text>
        </Stack>
      </Paper>
    </Stack>
  );
}
