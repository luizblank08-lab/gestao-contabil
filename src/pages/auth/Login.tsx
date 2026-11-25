import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Anchor, Button, Checkbox, Divider, Group, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { Marca } from '../../components/Marca';
import { definirManterConectado, supabase, traduzirErro } from '../../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [manter, setManter] = useState(true);
  const [erro, setErro] = useState('');
  const [entrando, setEntrando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (!email.trim() || !senha) return setErro('Informe o e-mail e a senha.');
    setEntrando(true);
    definirManterConectado(manter);
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password: senha });
    setEntrando(false);
    if (error) setErro(traduzirErro(error));
  }

  return (
    <div className="tela-entrada">
      <Paper withBorder shadow="sm" p="xl" radius="lg" w={420}>
        <form noValidate onSubmit={entrar}>
          <Stack>
            <Marca tamanho="lg" />
            <Title order={3} mt="sm">Entrar</Title>
            <TextInput label="E-mail" type="email" autoFocus required value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
            <PasswordInput label="Senha" required value={senha} onChange={(e) => setSenha(e.currentTarget.value)} />
            <Group justify="space-between">
              <Checkbox label="Manter conectado neste computador" checked={manter} onChange={(e) => setManter(e.currentTarget.checked)} />
            </Group>
            {erro && <Alert color="red">{erro}</Alert>}
            <Button type="submit" loading={entrando} fullWidth>Entrar</Button>
            <Anchor component={Link} to="/esqueci-senha" size="sm" ta="center">Esqueci minha senha</Anchor>
            <Divider label="Primeira vez?" labelPosition="center" />
            <Text size="sm" ta="center">
              É o responsável pelo escritório?{' '}
              <Anchor component={Link} to="/criar-conta">Criar a conta do escritório</Anchor>
            </Text>
            <Text size="xs" c="dimmed" ta="center">Membros da equipe recebem o acesso do Gestor.</Text>
          </Stack>
        </form>
      </Paper>
    </div>
  );
}
