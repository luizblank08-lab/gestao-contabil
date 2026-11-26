// Aviso de nova versão (programa de computador): baixa sozinho e oferece reiniciar.
import { useEffect, useState } from 'react';
import { Affix, Button, Group, Paper, Progress, Text, ThemeIcon, Transition } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import type { EstadoAtualizacao } from '../desktop';

export function AvisoAtualizacao() {
  const [estado, setEstado] = useState<EstadoAtualizacao>({ estado: 'nenhuma' });
  const [dispensado, setDispensado] = useState(false);
  useEffect(() => {
    const a = window.desktop?.atualizacao;
    if (!a) return;
    a.estado().then(setEstado).catch(() => {});
    return a.aoMudar(setEstado);
  }, []);
  const mostrar = estado.estado === 'pronta' && !dispensado;
  return (
    <Affix position={{ bottom: 20, right: 20 }} zIndex={400}>
      <Transition transition="slide-up" mounted={mostrar}>
        {(estilos) => (
          <Paper style={estilos} withBorder shadow="lg" radius="md" p="md" w={360} role="alert">
            <Group align="flex-start" wrap="nowrap">
              <ThemeIcon size={36} radius="md" variant="light"><IconDownload size={20} /></ThemeIcon>
              <div style={{ flex: 1 }}>
                <Text fw={600}>Nova versão pronta ({estado.versao})</Text>
                <Text size="sm" c="dimmed">Ela será instalada quando você fechar o app, ou agora mesmo:</Text>
                <Group mt="sm" gap="xs">
                  <Button size="xs" onClick={() => window.desktop?.atualizacao?.instalar()}>Reiniciar e atualizar</Button>
                  <Button size="xs" variant="default" onClick={() => setDispensado(true)}>Depois</Button>
                </Group>
              </div>
            </Group>
          </Paper>
        )}
      </Transition>
    </Affix>
  );
}

/** Linha de status da atualização (para a tela de Configurações) */
export function StatusAtualizacao() {
  const [estado, setEstado] = useState<EstadoAtualizacao>({ estado: 'nenhuma' });
  const a = typeof window !== 'undefined' ? window.desktop?.atualizacao : undefined;
  useEffect(() => {
    if (!a) return;
    a.estado().then(setEstado).catch(() => {});
    return a.aoMudar(setEstado);
  }, [a]);
  if (!a) return <Text size="sm" c="dimmed">Atualização automática disponível apenas no programa instalado.</Text>;
  const textos: Record<EstadoAtualizacao['estado'], string> = {
    nenhuma: 'O app procura versões novas sozinho ao abrir e a cada 4 horas.',
    verificando: 'Procurando versão nova…',
    baixando: `Baixando a versão ${estado.versao ?? ''}…`,
    pronta: `Versão ${estado.versao} pronta para instalar.`,
    em_dia: 'Você está com a versão mais recente.',
    erro: 'Não foi possível procurar atualizações agora. Tente mais tarde.',
    indisponivel: 'Atualização automática disponível apenas no programa instalado.',
  };
  return (
    <div>
      <Group justify="space-between">
        <Text size="sm">{textos[estado.estado]}</Text>
        {estado.estado === 'pronta' ? (
          <Button size="xs" onClick={() => a.instalar()}>Reiniciar e atualizar</Button>
        ) : (
          <Button size="xs" variant="default" loading={estado.estado === 'verificando'} disabled={estado.estado === 'baixando'}
            onClick={() => a.verificar().then(setEstado)}>Procurar atualizações</Button>
        )}
      </Group>
      {estado.estado === 'baixando' && estado.progresso != null && <Progress value={estado.progresso} mt="xs" size="sm" />}
    </div>
  );
}
