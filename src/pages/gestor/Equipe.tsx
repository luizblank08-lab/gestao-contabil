// Equipe: criar usuários, definir áreas e empresas, desativar, transferir (Gestor).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon, Alert, Badge, Button, Checkbox, CopyButton, Group, Menu, Modal, MultiSelect, Paper, PasswordInput,
  SegmentedControl, Select, Stack, Switch, Table, Text, TextInput, Title, Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconArrowsExchange, IconCheck, IconCopy, IconDots, IconKey, IconPencil, IconUserOff, IconUserCheck, IconUserPlus,
} from '@tabler/icons-react';
import { useEmpresas, useMembros } from '../../lib/dados';
import { AREAS, corArea, rotuloArea, type Area } from '../../lib/constantes';
import { emailValido } from '../../lib/formatos';
import { supabase } from '../../lib/supabase';
import { useTempoReal } from '../../lib/tempoReal';
import { avisoErro, avisoSucesso } from '../../lib/avisos';
import { useSessao } from '../../lib/sessao';
import { Carregando } from '../../components/Carregando';
import type { Membro } from '../../lib/tipos';

/** Chama a função segura do servidor para administrar usuários */
export async function adminUsuarios(corpo: Record<string, unknown>) {
  const { data, error } = await supabase().functions.invoke('admin-usuarios', { body: corpo });
  if (error) {
    let mensagem = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') mensagem = (await ctx.json()).erro ?? mensagem;
    } catch { /* ignora */ }
    if (/failed to send|not found|404/i.test(mensagem)) {
      mensagem = 'A função "admin-usuarios" não está instalada no Supabase. Veja o passo de preparação do banco.';
    }
    throw new Error(mensagem);
  }
  return data;
}

export function gerarSenha() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(bytes, (b) => letras[b % letras.length]).join('');
}

function useVinculos() {
  const [vinculos, setVinculos] = useState<{ membro_id: string; empresa_id: string }[]>([]);
  const carregar = useCallback(async () => {
    const { data } = await supabase().from('membro_empresas').select('membro_id, empresa_id');
    setVinculos(data ?? []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useTempoReal(['membro_empresas'], carregar);
  return { vinculos, recarregar: carregar };
}

export function Equipe() {
  const { membro: eu } = useSessao();
  const { membros, carregando, recarregar } = useMembros();
  const { empresas } = useEmpresas();
  const { vinculos, recarregar: recarregarVinculos } = useVinculos();
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [formAberto, setFormAberto] = useState(false);
  const [versaoForm, setVersaoForm] = useState(0);
  const [editando, setEditando] = useState<Membro | null>(null);
  const [transferindo, setTransferindo] = useState<Membro | null>(null);
  const [senhaGerada, setSenhaGerada] = useState<{ nome: string; email: string; senha: string } | null>(null);

  const visiveis = membros.filter((m) => mostrarInativos || m.ativo);
  const qtdEmpresas = (id: string) => vinculos.filter((v) => v.membro_id === id).length;

  function redefinirSenha(m: Membro) {
    const senha = gerarSenha();
    modals.openConfirmModal({
      title: 'Redefinir senha',
      children: <Text size="sm">Gerar uma nova senha provisória para <b>{m.nome}</b>? A pessoa terá que criar uma senha nova ao entrar.</Text>,
      labels: { confirm: 'Gerar nova senha', cancel: 'Cancelar' },
      onConfirm: async () => {
        try {
          await adminUsuarios({ acao: 'redefinir_senha', membro_id: m.id, senha });
          setSenhaGerada({ nome: m.nome, email: m.email, senha });
        } catch (e) { avisoErro(e); }
      },
    });
  }

  function alternarAtivo(m: Membro) {
    const desativar = m.ativo;
    modals.openConfirmModal({
      title: desativar ? 'Desativar usuário' : 'Reativar usuário',
      children: (
        <Text size="sm">
          {desativar
            ? <>Desativar <b>{m.nome}</b>? A pessoa não conseguirá mais entrar e deixará de ser responsável pelas empresas. O histórico é mantido. Se quiser, primeiro <b>transfira</b> as responsabilidades para outra pessoa.</>
            : <>Reativar <b>{m.nome}</b>? A pessoa voltará a conseguir entrar. Lembre-se de designar as empresas novamente.</>}
        </Text>
      ),
      labels: { confirm: desativar ? 'Desativar' : 'Reativar', cancel: 'Cancelar' },
      confirmProps: { color: desativar ? 'red' : 'green' },
      onConfirm: async () => {
        try {
          await adminUsuarios({ acao: 'definir_ativo', membro_id: m.id, ativo: !desativar });
          avisoSucesso(desativar ? 'Usuário desativado.' : 'Usuário reativado.');
          recarregar();
        } catch (e) { avisoErro(e); }
      },
    });
  }

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Equipe</Title>
          <Text c="dimmed" size="sm">Defina a área e as empresas de cada pessoa.</Text>
        </div>
        <Group>
          <Switch label="Mostrar desativados" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.currentTarget.checked)} />
          <Button leftSection={<IconUserPlus size={18} />} onClick={() => { setEditando(null); setVersaoForm((v) => v + 1); setFormAberto(true); }}>Novo usuário</Button>
        </Group>
      </Group>

      <Paper withBorder radius="md">
        {carregando ? <Carregando /> : (
          <Table.ScrollContainer minWidth={850}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nome</Table.Th>
                  <Table.Th>Perfil</Table.Th>
                  <Table.Th>Áreas</Table.Th>
                  <Table.Th>Empresas</Table.Th>
                  <Table.Th>Situação</Table.Th>
                  <Table.Th w={60} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visiveis.map((m) => (
                  <Table.Tr key={m.id} opacity={m.ativo ? 1 : 0.55}>
                    <Table.Td>
                      <Text fw={500} size="sm">{m.nome}{m.id === eu?.id && <Text span c="dimmed"> (você)</Text>}</Text>
                      <Text size="xs" c="dimmed">{m.email}</Text>
                    </Table.Td>
                    <Table.Td>{m.papel === 'gestor' ? <Badge>Gestor</Badge> : <Badge variant="outline" color="gray">Usuário</Badge>}</Table.Td>
                    <Table.Td>
                      {m.papel === 'gestor' ? <Text size="sm" c="dimmed">Todas</Text> : (
                        <Group gap={4}>{m.areas.map((a) => <Badge key={a} color={corArea(a)} variant="light">{rotuloArea(a)}</Badge>)}</Group>
                      )}
                    </Table.Td>
                    <Table.Td><Text size="sm">{m.papel === 'gestor' || m.todas_empresas ? 'Todas' : `${qtdEmpresas(m.id)} escolhida(s)`}</Text></Table.Td>
                    <Table.Td>
                      {!m.ativo ? <Badge color="gray">Desativado</Badge>
                        : m.trocar_senha ? <Tooltip label="Ainda não fez o primeiro acesso"><Badge color="yellow" variant="light">Aguardando 1º acesso</Badge></Tooltip>
                        : <Badge color="green" variant="light">Ativo</Badge>}
                    </Table.Td>
                    <Table.Td>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target><ActionIcon variant="subtle" color="gray"><IconDots size={18} /></ActionIcon></Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => { setEditando(m); setVersaoForm((v) => v + 1); setFormAberto(true); }}>Editar áreas e empresas</Menu.Item>
                          <Menu.Item leftSection={<IconArrowsExchange size={16} />} onClick={() => setTransferindo(m)}>Transferir responsabilidades</Menu.Item>
                          {m.id !== eu?.id && <Menu.Item leftSection={<IconKey size={16} />} onClick={() => redefinirSenha(m)}>Redefinir senha</Menu.Item>}
                          {m.id !== eu?.id && (
                            <Menu.Item color={m.ativo ? 'red' : 'green'} leftSection={m.ativo ? <IconUserOff size={16} /> : <IconUserCheck size={16} />} onClick={() => alternarAtivo(m)}>
                              {m.ativo ? 'Desativar' : 'Reativar'}
                            </Menu.Item>
                          )}
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <FormMembro
        key={versaoForm}
        aberto={formAberto}
        aoFechar={() => setFormAberto(false)}
        membro={editando}
        empresas={empresas.map((e) => ({ value: e.id, label: e.nome_fantasia ? `${e.razao_social} (${e.nome_fantasia})` : e.razao_social }))}
        empresasDoMembro={editando ? vinculos.filter((v) => v.membro_id === editando.id).map((v) => v.empresa_id) : []}
        aoCriar={(info) => setSenhaGerada(info)}
        aoSalvar={() => { recarregar(); recarregarVinculos(); }}
        souEu={editando?.id === eu?.id}
      />

      <Transferir de={transferindo} membros={membros} aoFechar={() => setTransferindo(null)} />

      <AcessoCriado info={senhaGerada} aoFechar={() => setSenhaGerada(null)} />
    </Stack>
  );
}

export function FormMembro({
  aberto, aoFechar, membro, empresas, empresasDoMembro, aoCriar, aoSalvar, souEu, inicial,
}: {
  aberto: boolean;
  aoFechar: () => void;
  membro: Membro | null;
  empresas: { value: string; label: string }[];
  empresasDoMembro: string[];
  aoCriar: (i: { nome: string; email: string; senha: string }) => void;
  aoSalvar: () => void;
  souEu: boolean;
  /** Valores sugeridos para um usuário novo (ex.: vindos da importação de planilha) */
  inicial?: { nome: string; areas: Area[] };
}) {
  const { escritorio } = useSessao();
  const ativas = escritorio?.areas_ativas ?? [];
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [papel, setPapel] = useState<'gestor' | 'usuario'>('usuario');
  const [areas, setAreas] = useState<Area[]>([]);
  const [todas, setTodas] = useState(false);
  const [lista, setLista] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErro('');
    setNome(membro?.nome ?? inicial?.nome ?? '');
    setEmail(membro?.email ?? '');
    setSenha(membro ? '' : gerarSenha());
    setPapel(membro?.papel ?? 'usuario');
    setAreas(membro?.areas ?? inicial?.areas ?? []);
    setTodas(membro?.todas_empresas ?? false);
    setLista(empresasDoMembro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, membro]);

  const areasDisponiveis = useMemo(() => AREAS.filter((a) => ativas.includes(a.value)), [ativas]);

  async function salvar() {
    setErro('');
    if (!nome.trim()) return setErro('Informe o nome.');
    if (papel === 'usuario' && areas.length === 0) return setErro('Escolha pelo menos uma área.');
    setSalvando(true);
    try {
      if (!membro) {
        if (!emailValido(email)) throw new Error('E-mail inválido.');
        if (senha.length < 8) throw new Error('A senha provisória precisa ter pelo menos 8 caracteres.');
        await adminUsuarios({ acao: 'criar', nome, email, senha, papel, areas, todas_empresas: todas, empresas: todas ? [] : lista });
        aoCriar({ nome, email: email.trim().toLowerCase(), senha });
      } else {
        const sb = supabase();
        const { error } = await sb.from('membros').update({
          nome: nome.trim(),
          papel,
          areas: papel === 'gestor' ? ['fiscal', 'contabil', 'dp'] : areas,
          todas_empresas: papel === 'gestor' ? true : todas,
        }).eq('id', membro.id);
        if (error) throw error;
        const { error: e2 } = await sb.rpc('definir_empresas_membro', { p_membro: membro.id, p_empresas: todas || papel === 'gestor' ? [] : lista });
        if (e2) throw e2;
        avisoSucesso('Alterações salvas.');
      }
      aoSalvar();
      aoFechar();
    } catch (e) {
      setErro((e as Error).message);
      avisoErro(e);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal opened={aberto} onClose={aoFechar} size="lg" title={<Text fw={600} size="lg">{membro ? `Editar ${membro.nome}` : 'Novo usuário'}</Text>}>
      <Stack>
        <TextInput label="Nome" required value={nome} onChange={(e) => setNome(e.currentTarget.value)} />
        <TextInput label="E-mail" required disabled={!!membro} value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
        {!membro && (
          <PasswordInput label="Senha provisória" description="Gerada automaticamente. A pessoa troca no primeiro acesso." value={senha}
            onChange={(e) => setSenha(e.currentTarget.value)} visible onVisibilityChange={() => {}} />
        )}
        <div>
          <Text size="sm" fw={500} mb={4}>Perfil</Text>
          <SegmentedControl
            disabled={souEu}
            value={papel}
            onChange={(v) => setPapel(v as 'gestor' | 'usuario')}
            data={[{ value: 'usuario', label: 'Usuário' }, { value: 'gestor', label: 'Gestor (vê e altera tudo)' }]}
          />
        </div>
        {papel === 'usuario' && (
          <>
            <Checkbox.Group label="Áreas de atuação" description="A pessoa só verá os itens destas áreas." value={areas} onChange={(v) => setAreas(v as Area[])}>
              <Group mt={6}>{areasDisponiveis.map((a) => <Checkbox key={a.value} value={a.value} label={a.label} />)}</Group>
            </Checkbox.Group>
            <Switch label="Atende todas as empresas (inclusive as que forem cadastradas depois)" checked={todas} onChange={(e) => setTodas(e.currentTarget.checked)} />
            {!todas && (
              <MultiSelect label="Empresas que atende" placeholder="Escolha as empresas" searchable clearable data={empresas} value={lista} onChange={setLista}
                description="A pessoa também verá automaticamente as empresas em que for definida como responsável." nothingFoundMessage="Nenhuma empresa encontrada" maxDropdownHeight={260} />
            )}
          </>
        )}
        {erro && <Alert color="red">{erro}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>Cancelar</Button>
          <Button loading={salvando} onClick={salvar}>{membro ? 'Salvar' : 'Criar usuário'}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function Transferir({ de, membros, aoFechar }: { de: Membro | null; membros: Membro[]; aoFechar: () => void }) {
  const [para, setPara] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setPara(null), [de]);

  const destino = membros.find((m) => m.id === para);
  async function confirmar() {
    if (!de || !para) return;
    setSalvando(true);
    const { data, error } = await supabase().rpc('transferir_responsabilidades', { p_de: de.id, p_para: para });
    setSalvando(false);
    if (error) return avisoErro(error);
    avisoSucesso(`${data ?? 0} responsabilidade(s) transferida(s) para ${destino?.nome}.`);
    aoFechar();
  }

  return (
    <Modal opened={!!de} onClose={aoFechar} title={<Text fw={600} size="lg">Transferir responsabilidades</Text>}>
      {de && (
        <Stack>
          <Text size="sm">
            Tudo o que <b>{de.nome}</b> é responsável passa para outra pessoa (por exemplo, nas férias ou num desligamento).
            Só são transferidas as áreas que a pessoa escolhida também atende, e quem recebe passa a ver as mesmas empresas.
          </Text>
          <Select label="Transferir para" placeholder="Escolha a pessoa" searchable value={para} onChange={setPara}
            data={membros.filter((m) => m.ativo && m.id !== de.id).map((m) => ({
              value: m.id, label: `${m.nome} — ${m.papel === 'gestor' ? 'Gestor' : m.areas.map(rotuloArea).join(', ')}`,
            }))} />
          <Text size="xs" c="dimmed">Nas próximas etapas, as tarefas em aberto também serão transferidas.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={aoFechar}>Cancelar</Button>
            <Button disabled={!para} loading={salvando} onClick={confirmar}>Transferir</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

/** Janela que mostra os dados de acesso recém-criados (para enviar à pessoa) */
export function AcessoCriado({ info, aoFechar }: { info: { nome: string; email: string; senha: string } | null; aoFechar: () => void }) {
  return (
  <Modal opened={!!info} onClose={() => aoFechar()} title="Acesso criado">
    {info && (
      <Stack>
        <Text size="sm">Envie estes dados para <b>{info.nome}</b> (por WhatsApp ou pessoalmente). No primeiro acesso, será pedida a criação de uma senha própria.</Text>
        <Paper withBorder p="md" bg="gray.0">
          <Text size="sm">E-mail: <b>{info.email}</b></Text>
          <Text size="sm">Senha provisória: <b style={{ fontFamily: 'monospace', fontSize: 16 }}>{info.senha}</b></Text>
        </Paper>
        <CopyButton value={`Acesso ao Gestão Contábil\nE-mail: ${info.email}\nSenha provisória: ${info.senha}`}>
          {({ copied, copy }) => (
            <Button variant="light" leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />} onClick={copy}>
              {copied ? 'Copiado!' : 'Copiar dados de acesso'}
            </Button>
          )}
        </CopyButton>
        <Alert color="yellow">Por segurança, esta senha não será mostrada de novo.</Alert>
      </Stack>
    )}
  </Modal>
  );
}
