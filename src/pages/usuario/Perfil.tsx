import { useEffect, useState } from 'react';
import { Badge, Button, Group, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { corArea, rotuloArea } from '../../lib/constantes';
import { supabase } from '../../lib/supabase';
import { avisoErro, avisoSucesso } from '../../lib/avisos';
import { useSessao } from '../../lib/sessao';
import { StatusAtualizacao } from '../../components/AvisoAtualizacao';

export function Perfil() {
  const { membro, escritorio, ehGestor, minhasAreas, recarregar } = useSessao();
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setNome(membro?.nome ?? ''), [membro]);

  async function salvarNome() {
    if (!nome.trim()) return;
    const { error } = await supabase().rpc('atualizar_meu_nome', { p_nome: nome });
    if (error) return avisoErro(error);
    avisoSucesso('Nome atualizado.');
    recarregar();
  }

  async function trocarSenha() {
    if (senha.length < 8) return avisoErro(new Error('A nova senha precisa ter pelo menos 8 caracteres.'));
    if (senha !== senha2) return avisoErro(new Error('As senhas não conferem.'));
    setSalvando(true);
    const { error } = await supabase().auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) return avisoErro(error);
    setSenha(''); setSenha2('');
    avisoSucesso('Senha alterada.');
  }

  return (
    <Stack maw={640}>
      <Title order={2}>Perfil</Title>
      <Paper withBorder p="lg" radius="md">
        <Stack>
          <Text size="sm">Escritório: <b>{escritorio?.nome}</b></Text>
          <Text size="sm">E-mail: <b>{membro?.email}</b></Text>
          <Group gap={6}>
            <Text size="sm">Perfil:</Text>
            {ehGestor ? <Badge>Gestor</Badge> : minhasAreas.map((a) => <Badge key={a} color={corArea(a)} variant="light">{rotuloArea(a)}</Badge>)}
          </Group>
          <Group align="flex-end">
            <TextInput label="Seu nome" style={{ flex: 1 }} value={nome} onChange={(e) => setNome(e.currentTarget.value)} />
            <Button variant="default" onClick={salvarNome}>Salvar nome</Button>
          </Group>
        </Stack>
      </Paper>
      <Paper withBorder p="lg" radius="md">
        <Stack gap="xs">
          <Text fw={600}>Versão do aplicativo</Text>
          <StatusAtualizacao />
        </Stack>
      </Paper>
      <Paper withBorder p="lg" radius="md">
        <Stack>
          <Text fw={600}>Trocar senha</Text>
          <PasswordInput label="Nova senha" description="Pelo menos 8 caracteres" value={senha} onChange={(e) => setSenha(e.currentTarget.value)} />
          <PasswordInput label="Repita a nova senha" value={senha2} onChange={(e) => setSenha2(e.currentTarget.value)} />
          <Group justify="flex-end"><Button loading={salvando} onClick={trocarSenha}>Trocar senha</Button></Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
