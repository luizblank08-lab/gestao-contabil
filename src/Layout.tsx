import { useEffect, useState } from 'react';
import { NavLink as RouterLink, Outlet, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { competenciaPadrao } from './lib/tarefas';
import { AppShell, Avatar, Badge, Box, Group, Menu, NavLink, ScrollArea, Stack, Text, UnstyledButton } from '@mantine/core';
import {
  IconBuilding, IconChecklist, IconChevronDown, IconLayoutDashboard, IconListDetails, IconLogout,
  IconSettings, IconTemplate, IconUser, IconUsers,
} from '@tabler/icons-react';
import { Marca } from './components/Marca';
import { useSessao } from './lib/sessao';
import { corArea, rotuloArea } from './lib/constantes';

const MENU_GESTOR = [
  { para: '/painel', rotulo: 'Painel', icone: IconLayoutDashboard },
  { para: '/empresas', rotulo: 'Empresas', icone: IconBuilding },
  { para: '/checklists', rotulo: 'Checklists do mês', icone: IconChecklist },
  { para: '/modelos', rotulo: 'Modelos de checklist', icone: IconTemplate },
  { para: '/equipe', rotulo: 'Equipe', icone: IconUsers },
  { para: '/configuracoes', rotulo: 'Configurações', icone: IconSettings },
];
const MENU_USUARIO = [
  { para: '/tarefas', rotulo: 'Minhas tarefas', icone: IconListDetails },
  { para: '/minhas-empresas', rotulo: 'Minhas empresas', icone: IconBuilding },
  { para: '/perfil', rotulo: 'Perfil', icone: IconUser },
];

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

export function Layout() {
  const { membro, escritorio, ehGestor, minhasAreas, sair } = useSessao();
  const local = useLocation();
  const itens = ehGestor ? MENU_GESTOR : MENU_USUARIO;
  const [versao, setVersao] = useState('');
  useEffect(() => { window.desktop?.versao().then(setVersao).catch(() => {}); }, []);

  // Reforço da geração automática: ao abrir o app, o Gestor garante as tarefas da competência atual de trabalho
  useEffect(() => {
    if (!ehGestor || !escritorio) return;
    const chave = `gc_gerado_${escritorio.id}_${competenciaPadrao(escritorio.inicio_checklists)}`;
    if (sessionStorage.getItem(chave)) return;
    sessionStorage.setItem(chave, '1');
    supabase().rpc('gerar_checklists', { p_competencia: competenciaPadrao(escritorio.inicio_checklists) }).then(() => {});
  }, [ehGestor, escritorio]);

  return (
    <AppShell navbar={{ width: 260, breakpoint: 0 }} padding={0}>
      <AppShell.Navbar p="md" style={{ background: '#fff' }}>
        <AppShell.Section mb="lg">
          <Marca />
          <Text size="xs" c="dimmed" mt="sm" truncate>{escritorio?.nome}</Text>
        </AppShell.Section>
        <AppShell.Section grow component={ScrollArea}>
          <Stack gap={4}>
            {itens.map((i) => (
              <NavLink
                key={i.para}
                component={RouterLink}
                to={i.para}
                label={i.rotulo}
                leftSection={<i.icone size={20} stroke={1.7} />}
                active={local.pathname.startsWith(i.para)}
                style={{ borderRadius: 8 }}
                fw={500}
              />
            ))}
          </Stack>
        </AppShell.Section>
        <AppShell.Section>
          <Menu position="top-start" width={230}>
            <Menu.Target>
              <UnstyledButton w="100%" p="xs" style={{ borderRadius: 8, border: '1px solid var(--mantine-color-gray-3)' }}>
                <Group gap="sm" wrap="nowrap">
                  <Avatar color="indigo" radius="xl">{iniciais(membro?.nome ?? '')}</Avatar>
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate>{membro?.nome}</Text>
                    <Group gap={4}>
                      {ehGestor ? (
                        <Badge size="xs" variant="light">Gestor</Badge>
                      ) : (
                        minhasAreas.map((a) => <Badge key={a} size="xs" color={corArea(a)} variant="light">{rotuloArea(a)}</Badge>)
                      )}
                    </Group>
                  </Box>
                  <IconChevronDown size={16} />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item component={RouterLink} to="/perfil" leftSection={<IconUser size={16} />}>Meu perfil</Menu.Item>
              <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={sair}>Sair</Menu.Item>
            </Menu.Dropdown>
          </Menu>
          {versao && <Text size="xs" c="dimmed" ta="center" mt={6}>Versão {versao}</Text>}
        </AppShell.Section>
      </AppShell.Navbar>
      <AppShell.Main>
        <Box p="xl" maw={1600} mx="auto">
          <Outlet />
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
