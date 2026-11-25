import { Center, Loader, Stack, Text } from '@mantine/core';

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <Center h="100%" mih={300}>
      <Stack align="center" gap="xs">
        <Loader />
        <Text c="dimmed" size="sm">{texto}</Text>
      </Stack>
    </Center>
  );
}
