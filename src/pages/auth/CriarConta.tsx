// Cria a conta do escritório: o primeiro usuário vira Gestor.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Anchor, Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { Marca } from '../../components/Marca';
import { definirManterConectado, supabase, traduzirErro } from '../../lib/supabase';
import { limparCnpj, mascaraCnpj, validarCnpj } from '../../lib/cnpj';
import { emailValido } from '../../lib/formatos';
import { useSessao } from '../../lib/sessao';

/** Usada tanto na criação completa quanto quando a pessoa já tem login mas ainda não tem escritório. */
export function CriarConta({ jaConectado = false }: { jaConectado?: boolean }) {
  const { recarregar, sair, sessao } = useSessao();
  const [escritorio, setEscritorio] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (!escritorio.trim() || !nome.trim()) return setErro('Preencha o nome do escritório e o seu nome.');
    if (cnpj && !validarCnpj(cnpj)) return setErro('CNPJ do escritório inválido.');
    if (!jaConectado) {
      if (!emailValido(email)) return setErro('E-mail inválido.');
      if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
      if (senha !== senha2) return setErro('As senhas não conferem.');
    }
    setSalvando(true);
    try {
      const sb = supabase();
      if (!jaConectado) {
        definirManterConectado(true);
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password: senha, options: { data: { nome } } });
        if (error) throw error;
        if (!data.session) {
          setErro(
            'Conta criada, mas o servidor exige confirmação por e-mail. Confirme o e-mail recebido e depois entre normalmente — o app vai pedir os dados do escritório.'
          );
          return;
        }
      }
      const { error: e2 } = await sb.rpc('criar_escritorio', {
        p_nome: escritorio,
        p_cnpj: cnpj ? limparCnpj(cnpj) : '',
        p_nome_gestor: nome,
      });
      if (e2) throw e2;
      await recarregar();
    } catch (err) {
      setErro(traduzirErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="tela-entrada">
      <Paper withBorder shadow="sm" p="xl" radius="lg" w={480}>
        <form noValidate onSubmit={criar}>
          <Stack>
            <Marca tamanho="lg" />
            <Title order={3} mt="sm">Criar a conta do escritório</Title>
            <Text size="sm" c="dimmed">Você será o Gestor: poderá cadastrar empresas, a equipe e definir o que cada um faz.</Text>
            <TextInput label="Nome do escritório" required value={escritorio} onChange={(e) => setEscritorio(e.currentTarget.value)} />
            <TextInput label="CNPJ do escritório (opcional)" value={cnpj} onChange={(e) => setCnpj(mascaraCnpj(e.currentTarget.value))} placeholder="00.000.000/0000-00" />
            <TextInput label="Seu nome" required value={nome} onChange={(e) => setNome(e.currentTarget.value)} />
            {jaConectado ? (
              <Text size="sm">Conectado como <b>{sessao?.user.email}</b></Text>
            ) : (
              <>
                <TextInput label="Seu e-mail" type="email" required value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
                <PasswordInput label="Senha" description="Pelo menos 8 caracteres" required value={senha} onChange={(e) => setSenha(e.currentTarget.value)} />
                <PasswordInput label="Repita a senha" required value={senha2} onChange={(e) => setSenha2(e.currentTarget.value)} />
              </>
            )}
            {erro && <Alert color="orange">{erro}</Alert>}
            <Button type="submit" loading={salvando}>Criar escritório</Button>
            {jaConectado ? (
              <Anchor component="button" type="button" size="sm" onClick={sair}>Sair e entrar com outra conta</Anchor>
            ) : (
              <Anchor component={Link} to="/" size="sm" ta="center">Já tenho conta — entrar</Anchor>
            )}
          </Stack>
        </form>
      </Paper>
    </div>
  );
}
