// Configurações do escritório (Gestor).
import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { AREAS, type Area } from '../../lib/constantes';
import { limparCnpj, mascaraCnpj, validarCnpj } from '../../lib/cnpj';
import { conexaoEmbutida, lerConexao, salvarConexao, supabase } from '../../lib/supabase';
import { avisoErro, avisoSucesso } from '../../lib/avisos';
import { useSessao } from '../../lib/sessao';

export function Configuracoes() {
  const { escritorio, recarregar } = useSessao();
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [areas, setAreas] = useState<Area[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [versao, setVersao] = useState('');

  useEffect(() => {
    setNome(escritorio?.nome ?? '');
    setCnpj(escritorio?.cnpj ? mascaraCnpj(escritorio.cnpj) : '');
    setAreas(escritorio?.areas_ativas ?? []);
  }, [escritorio]);

  useEffect(() => {
    window.desktop?.versao().then(setVersao).catch(() => {});
  }, []);

  async function salvar() {
    if (!escritorio) return;
    if (!nome.trim()) return avisoErro(new Error('Informe o nome do escritório.'));
    if (cnpj && !validarCnpj(cnpj)) return avisoErro(new Error('CNPJ inválido.'));
    if (areas.length === 0) return avisoErro(new Error('Mantenha pelo menos uma área ativa.'));
    setSalvando(true);
    const { error } = await supabase().from('escritorios').update({
      nome: nome.trim(), cnpj: cnpj ? limparCnpj(cnpj) : null, areas_ativas: areas,
    }).eq('id', escritorio.id);
    setSalvando(false);
    if (error) return avisoErro(error);
    avisoSucesso('Configurações salvas.');
    recarregar();
  }

  return (
    <Stack maw={760}>
      <Title order={2}>Configurações</Title>
      <Paper withBorder p="lg" radius="md">
        <Stack>
          <Text fw={600}>Dados do escritório</Text>
          <TextInput label="Nome do escritório" value={nome} onChange={(e) => setNome(e.currentTarget.value)} />
          <TextInput label="CNPJ" value={cnpj} onChange={(e) => setCnpj(mascaraCnpj(e.currentTarget.value))} placeholder="Opcional" />
          <Checkbox.Group label="Áreas utilizadas pelo escritório" description="Desmarque uma área que o escritório não atende (ex.: Departamento Pessoal). Ela some dos cadastros e menus."
            value={areas} onChange={(v) => setAreas(v as Area[])}>
            <Group mt={6}>{AREAS.map((a) => <Checkbox key={a.value} value={a.value} label={a.label} />)}</Group>
          </Checkbox.Group>
          <Group justify="flex-end"><Button loading={salvando} onClick={salvar}>Salvar</Button></Group>
        </Stack>
      </Paper>

      <Paper withBorder p="lg" radius="md">
        <Stack gap="xs">
          <Text fw={600}>Recursos do computador</Text>
          <Text size="sm" c="dimmed">Notificações do Windows, ícone perto do relógio e abrir junto com o Windows chegam na Etapa 5.</Text>
        </Stack>
      </Paper>

      <Paper withBorder p="lg" radius="md">
        <Stack gap="xs">
          <Text fw={600}>Sobre</Text>
          <Text size="sm">Versão do aplicativo: <b>{versao || '—'}</b></Text>
          <Text size="sm">Banco de dados: <code>{lerConexao()?.url}</code></Text>
          {!conexaoEmbutida() && (
            <Alert color="gray" variant="light">
              <Group justify="space-between">
                <Text size="sm">Versão de testes: a conexão foi informada manualmente.</Text>
                <Button size="xs" variant="default" onClick={async () => { await supabase().auth.signOut(); salvarConexao(null); location.reload(); }}>Trocar conexão</Button>
              </Group>
            </Alert>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
