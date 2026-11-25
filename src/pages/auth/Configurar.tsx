// Primeira execução sem conexão embutida: informar o endereço do banco.
import { useState } from 'react';
import { Alert, Button, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconPlugConnected } from '@tabler/icons-react';
import { createClient } from '@supabase/supabase-js';
import { Marca } from '../../components/Marca';
import { salvarConexao } from '../../lib/supabase';

export function Configurar() {
  const [url, setUrl] = useState('');
  const [chave, setChave] = useState('');
  const [erro, setErro] = useState('');
  const [testando, setTestando] = useState(false);

  async function salvar() {
    setErro('');
    const u = url.trim().replace(/\/+$/, '');
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(u)) {
      setErro('O endereço deve ser parecido com https://abcdefgh.supabase.co');
      return;
    }
    if (chave.trim().length < 20) {
      setErro('A chave parece incompleta. Copie a chave inteira.');
      return;
    }
    setTestando(true);
    try {
      const sb = createClient(u, chave.trim(), { auth: { persistSession: false } });
      const { error } = await sb.from('escritorios').select('id').limit(1);
      if (error && !/permission|row-level/i.test(error.message)) throw error;
      salvarConexao({ url: u, chave: chave.trim() });
      window.location.reload();
    } catch (e) {
      setErro(
        'Não consegui conectar. Confira o endereço e a chave, e se o banco já foi preparado (arquivo 001_etapa1.sql). Detalhe: ' +
          ((e as Error).message || e)
      );
    } finally {
      setTestando(false);
    }
  }

  return (
    <div className="tela-entrada">
      <Paper withBorder shadow="sm" p="xl" radius="lg" w={520}>
        <Stack>
          <Marca tamanho="lg" />
          <Title order={3}>Conectar ao banco de dados</Title>
          <Text size="sm" c="dimmed">
            Isto só aparece na versão de testes. Na versão que você mandar para a equipe, a conexão já vem configurada.
            Copie os dois dados em Supabase › Project Settings › API.
          </Text>
          <TextInput label="Endereço do projeto (Project URL)" placeholder="https://abcdefgh.supabase.co" value={url} onChange={(e) => setUrl(e.currentTarget.value)} />
          <TextInput label="Chave pública (publishable ou anon)" placeholder="sb_publishable_…" value={chave} onChange={(e) => setChave(e.currentTarget.value)} />
          {erro && <Alert color="red">{erro}</Alert>}
          <Button leftSection={<IconPlugConnected size={18} />} loading={testando} onClick={salvar}>Conectar</Button>
        </Stack>
      </Paper>
    </div>
  );
}
