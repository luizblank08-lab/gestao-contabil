// Obrigatória no primeiro acesso (senha provisória definida pelo Gestor).
import { useState } from 'react';
import { Alert, Anchor, Button, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core';
import { Marca } from '../../components/Marca';
import { supabase, traduzirErro } from '../../lib/supabase';
import { useSessao } from '../../lib/sessao';

export function TrocarSenha() {
  const { membro, recarregar, sair } = useSessao();
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (senha.length < 8) return setErro('A nova senha precisa ter pelo menos 8 caracteres.');
    if (senha !== senha2) return setErro('As senhas não conferem.');
    setSalvando(true);
    try {
      const { error } = await supabase().auth.updateUser({ password: senha });
      if (error) throw error;
      await supabase().rpc('senha_trocada');
      await recarregar();
    } catch (err) {
      setErro(traduzirErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="tela-entrada">
      <Paper withBorder shadow="sm" p="xl" radius="lg" w={440}>
        <form noValidate onSubmit={salvar}>
          <Stack>
            <Marca tamanho="lg" />
            <Title order={3} mt="sm">Bem-vindo(a), {membro?.nome.split(' ')[0]}!</Title>
            <Text size="sm" c="dimmed">Por segurança, crie uma senha só sua antes de começar.</Text>
            <PasswordInput label="Nova senha" description="Pelo menos 8 caracteres" autoFocus value={senha} onChange={(e) => setSenha(e.currentTarget.value)} />
            <PasswordInput label="Repita a nova senha" value={senha2} onChange={(e) => setSenha2(e.currentTarget.value)} />
            {erro && <Alert color="red">{erro}</Alert>}
            <Button type="submit" loading={salvando}>Salvar e continuar</Button>
            <Anchor component="button" type="button" size="sm" onClick={sair}>Sair</Anchor>
          </Stack>
        </form>
      </Paper>
    </div>
  );
}
