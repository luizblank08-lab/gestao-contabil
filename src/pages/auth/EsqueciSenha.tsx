// Recuperação de senha por código enviado ao e-mail (tudo dentro do app).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Anchor, Button, Paper, PasswordInput, PinInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { Marca } from '../../components/Marca';
import { definirManterConectado, supabase, traduzirErro } from '../../lib/supabase';
import { emailValido } from '../../lib/formatos';

export function EsqueciSenha() {
  const [etapa, setEtapa] = useState<'email' | 'codigo'>('email');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [erro, setErro] = useState('');
  const [aguarde, setAguarde] = useState(false);

  async function enviarCodigo(e?: React.FormEvent) {
    e?.preventDefault();
    setErro('');
    if (!emailValido(email)) return setErro('Informe um e-mail válido.');
    setAguarde(true);
    const { error } = await supabase().auth.resetPasswordForEmail(email.trim());
    setAguarde(false);
    if (error) return setErro(traduzirErro(error));
    setEtapa('codigo');
  }

  async function redefinir(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (codigo.length < 6) return setErro('Digite o código recebido por e-mail.');
    if (senha.length < 8) return setErro('A nova senha precisa ter pelo menos 8 caracteres.');
    if (senha !== senha2) return setErro('As senhas não conferem.');
    setAguarde(true);
    try {
      definirManterConectado(true);
      const sb = supabase();
      const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: codigo, type: 'recovery' });
      if (error) throw error;
      const { error: e2 } = await sb.auth.updateUser({ password: senha });
      if (e2) throw e2;
      await sb.rpc('senha_trocada');
      // A sessão já está ativa: o app abre automaticamente.
    } catch (err) {
      setErro(traduzirErro(err));
    } finally {
      setAguarde(false);
    }
  }

  return (
    <div className="tela-entrada">
      <Paper withBorder shadow="sm" p="xl" radius="lg" w={440}>
        <Stack>
          <Marca tamanho="lg" />
          <Title order={3} mt="sm">Esqueci minha senha</Title>
          {etapa === 'email' ? (
            <form noValidate onSubmit={enviarCodigo}>
              <Stack>
                <Text size="sm" c="dimmed">Vamos enviar um código para o seu e-mail.</Text>
                <TextInput label="E-mail" type="email" autoFocus value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
                {erro && <Alert color="red">{erro}</Alert>}
                <Button type="submit" loading={aguarde}>Enviar código</Button>
              </Stack>
            </form>
          ) : (
            <form noValidate onSubmit={redefinir}>
              <Stack>
                <Text size="sm">Enviamos um código para <b>{email}</b>. Ele pode levar alguns minutos para chegar (confira também o spam).</Text>
                <div>
                  <Text size="sm" fw={500} mb={4}>Código</Text>
                  <PinInput length={6} type="number" oneTimeCode value={codigo} onChange={setCodigo} />
                </div>
                <PasswordInput label="Nova senha" description="Pelo menos 8 caracteres" value={senha} onChange={(e) => setSenha(e.currentTarget.value)} />
                <PasswordInput label="Repita a nova senha" value={senha2} onChange={(e) => setSenha2(e.currentTarget.value)} />
                {erro && <Alert color="red">{erro}</Alert>}
                <Text size="xs" c="dimmed">Se o código não chegar em alguns minutos, peça ao Gestor do escritório para redefinir sua senha.</Text>
                <Button type="submit" loading={aguarde}>Salvar nova senha</Button>
                <Anchor component="button" type="button" size="sm" onClick={() => enviarCodigo()}>Reenviar código</Anchor>
              </Stack>
            </form>
          )}
          <Anchor component={Link} to="/" size="sm" ta="center">Voltar para o login</Anchor>
        </Stack>
      </Paper>
    </div>
  );
}
