// Conferência contábil com IA: janela para pedir a conferência e exibição do resultado.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Badge, Button, Checkbox, Group, Loader, Modal, Paper, Select, Stack, Table, Text, Textarea, ThemeIcon,
} from '@mantine/core';
import {
  IconAlertTriangle, IconCircleCheck, IconCircleX, IconFile, IconHelpCircle, IconMessageQuestion, IconPaperclip, IconSend, IconSparkles, IconX,
} from '@tabler/icons-react';
import {
  CONCLUSOES, EXTENSOES_ACEITAS, MAX_ARQUIVOS_IA, TIPOS_CONFERENCIA, classificarArquivo, conferirComIA, prepararAnexo,
  perguntarIA, prepararArquivo, rotuloTipoConferencia, sugerirTipo, type PerguntaConferencia, type ArquivoPreparado, type Conferencia, type ItemConferido, type TipoConferencia,
} from '../lib/conferenciaIA';
import { formatarDataHora } from '../lib/formatos';
import { tamanhoLegivel } from '../lib/tarefas';
import type { Anexo, Empresa, Tarefa } from '../lib/tipos';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';

const ICONE_ITEM: Record<ItemConferido['situacao'], { icone: typeof IconCircleCheck; cor: string; rotulo: string }> = {
  ok: { icone: IconCircleCheck, cor: 'green', rotulo: 'Confere' },
  atencao: { icone: IconAlertTriangle, cor: 'yellow', rotulo: 'Atenção' },
  divergencia: { icone: IconCircleX, cor: 'red', rotulo: 'Divergência' },
  nao_verificado: { icone: IconHelpCircle, cor: 'gray', rotulo: 'Não verificado' },
};
const COR_GRAVIDADE = { alta: 'red', media: 'orange', baixa: 'yellow' } as const;
const ROTULO_GRAVIDADE = { alta: 'Alta', media: 'Média', baixa: 'Baixa' } as const;

export function BadgeConclusao({ conclusao }: { conclusao: Conferencia['conclusao'] }) {
  const c = CONCLUSOES[conclusao] ?? CONCLUSOES.inconclusivo;
  return <Badge color={c.cor} variant="light">{c.label}</Badge>;
}

export function ResultadoConferencia({ conferencia, nomeEmpresa, nomeAutor, nomeDe }: {
  conferencia: Conferencia; nomeEmpresa?: string; nomeAutor?: string;
  /** Nome de quem fez cada pergunta (opcional) */
  nomeDe?: (id: string) => string;
}) {
  const r = conferencia.resultado;
  return (
    <Stack gap="md">
      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" mb={6}>
          <Group gap="xs">
            <BadgeConclusao conclusao={r.conclusao} />
            <Badge variant="outline" color="gray">{rotuloTipoConferencia(conferencia.tipo)}</Badge>
          </Group>
          <Text size="xs" c="dimmed">
            {formatarDataHora(conferencia.criado_em)}{nomeAutor && ` · ${nomeAutor}`}
          </Text>
        </Group>
        {nomeEmpresa && <Text size="sm" fw={500}>{nomeEmpresa}</Text>}
        <Text size="sm" mt={4} style={{ whiteSpace: 'pre-wrap' }}>{r.resumo}</Text>
        <Text size="xs" c="dimmed" mt={6}>
          Arquivos: {conferencia.arquivos.map((a) => a.nome).join(', ')}
        </Text>
      </Paper>

      {r.divergencias.length > 0 && (
        <div>
          <Text fw={600} mb={6}>Divergências ({r.divergencias.length})</Text>
          <Stack gap="xs">
            {r.divergencias.map((d, i) => (
              <Paper key={i} withBorder radius="md" p="sm" style={{ borderLeft: `4px solid var(--mantine-color-${COR_GRAVIDADE[d.gravidade]}-6)` }}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Text size="sm" fw={600}>{d.descricao}</Text>
                  <Badge size="sm" color={COR_GRAVIDADE[d.gravidade]} variant="light">{ROTULO_GRAVIDADE[d.gravidade]}</Badge>
                </Group>
                {d.onde && <Text size="xs" c="dimmed" mt={2}>Onde: {d.onde}</Text>}
                {(d.valor_esperado || d.valor_encontrado) && (
                  <Group gap="lg" mt={6}>
                    <Text size="sm"><Text span c="dimmed" size="xs">Esperado </Text>{d.valor_esperado || '—'}</Text>
                    <Text size="sm"><Text span c="dimmed" size="xs">Encontrado </Text>{d.valor_encontrado || '—'}</Text>
                  </Group>
                )}
                {d.sugestao && <Text size="sm" mt={6}><b>Sugestão:</b> {d.sugestao}</Text>}
              </Paper>
            ))}
          </Stack>
        </div>
      )}

      {r.itens_conferidos.length > 0 && (
        <div>
          <Text fw={600} mb={6}>Itens conferidos</Text>
          <Table verticalSpacing={6}>
            <Table.Tbody>
              {r.itens_conferidos.map((it, i) => {
                const s = ICONE_ITEM[it.situacao] ?? ICONE_ITEM.nao_verificado;
                return (
                  <Table.Tr key={i}>
                    <Table.Td w={34} style={{ verticalAlign: 'top' }}>
                      <ThemeIcon variant="light" color={s.cor} size="sm" title={s.rotulo}><s.icone size={14} /></ThemeIcon>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500}>{it.item}</Text>
                      {it.detalhe && <Text size="xs" c="dimmed">{it.detalhe}</Text>}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </div>
      )}

      {r.dados_faltantes.length > 0 && (
        <Alert color="gray" variant="light" title="Para conferir melhor, faltou">
          <Stack gap={2}>{r.dados_faltantes.map((d, i) => <Text key={i} size="sm">• {d}</Text>)}</Stack>
        </Alert>
      )}

      <Text size="xs" c="dimmed">
        Conferência feita por IA: é um apoio à revisão e pode errar. Confirme as divergências antes de corrigir lançamentos ou guias.
      </Text>

      {conferencia.id && <PerguntasConferencia conferenciaId={conferencia.id} nomeDe={nomeDe} />}
    </Stack>
  );
}

/** Perguntas sobre a conferência: a IA responde olhando os mesmos arquivos e o resultado. */
export function PerguntasConferencia({ conferenciaId, nomeDe }: { conferenciaId: string; nomeDe?: (id: string) => string }) {
  const { membro: eu } = useSessao();
  const [lista, setLista] = useState<PerguntaConferencia[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase().from('conferencia_perguntas').select('*').eq('conferencia_id', conferenciaId).order('criado_em');
    setLista((data as PerguntaConferencia[]) ?? []);
  }, [conferenciaId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function perguntar() {
    const p = texto.trim();
    if (p.length < 3) return setErro('Escreva a pergunta.');
    setErro(null);
    setAviso(null);
    setEnviando(p);
    setTexto('');
    try {
      const r = await perguntarIA(conferenciaId, p);
      setLista((l) => [...l, r.pergunta]);
      setAviso(r.aviso ?? null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setTexto(p);
    } finally {
      setEnviando(null);
    }
  }

  const autor = (id: string) => (id === eu?.id ? 'Você' : nomeDe?.(id) ?? 'Equipe');

  return (
    <div>
      <Group gap={6} mb={6}>
        <IconMessageQuestion size={18} color="var(--mantine-color-indigo-6)" />
        <Text fw={600}>Perguntas sobre esta conferência</Text>
      </Group>
      <Stack gap="xs">
        {lista.map((q) => (
          <Stack key={q.id ?? q.criado_em} gap={4}>
            <Paper radius="md" p="xs" bg="gray.1" ml="xl">
              <Text size="xs" c="dimmed">{autor(q.criado_por)} · {formatarDataHora(q.criado_em)}</Text>
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{q.pergunta}</Text>
            </Paper>
            <Paper radius="md" p="xs" withBorder mr="xl">
              <Group gap={4} mb={2}><IconSparkles size={12} color="var(--mantine-color-indigo-6)" /><Text size="xs" c="dimmed">IA</Text></Group>
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{q.resposta}</Text>
            </Paper>
          </Stack>
        ))}
        {enviando && (
          <>
            <Paper radius="md" p="xs" bg="gray.1" ml="xl"><Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{enviando}</Text></Paper>
            <Group gap="xs" mr="xl"><Loader size="xs" /><Text size="sm" c="dimmed">A IA está analisando os documentos…</Text></Group>
          </>
        )}
        {aviso && <Alert color="yellow" variant="light">{aviso}</Alert>}
        {erro && <Alert color="red" variant="light">{erro}</Alert>}
        <Group align="flex-end" gap="xs" wrap="nowrap">
          <Textarea
            style={{ flex: 1 }}
            aria-label="Pergunta para a IA"
            placeholder={lista.length ? 'Faça outra pergunta…' : 'Ex.: de onde vem a diferença de R$ 250,00? Quais lançamentos preciso ajustar?'}
            autosize minRows={1} maxRows={6} maxLength={2000}
            value={texto}
            disabled={!!enviando}
            onChange={(e) => setTexto(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); perguntar(); } }}
          />
          <Button leftSection={<IconSend size={16} />} loading={!!enviando} onClick={perguntar}>Perguntar</Button>
        </Group>
        <Text size="xs" c="dimmed">Enter envia; Shift+Enter quebra a linha. Cada pergunta conta no limite diário de uso da IA.</Text>
      </Stack>
    </div>
  );
}

type Item = { chave: string; nome: string; tamanho: number | null; origem: { anexo: Anexo } | { arquivo: File } };

/**
 * Janela de nova conferência. Dentro de uma tarefa, recebe a tarefa e seus anexos (já marcados);
 * na tela de conferências, permite escolher a empresa.
 */
export function ConferenciaIAModal({
  aberto, aoFechar, tarefa, anexos = [], empresas, empresaInicial, aoConcluir,
}: {
  aberto: boolean;
  aoFechar: () => void;
  tarefa?: Tarefa | null;
  anexos?: Anexo[];
  empresas?: Empresa[];
  empresaInicial?: string | null;
  aoConcluir?: (c: Conferencia) => void;
}) {
  const [tipo, setTipo] = useState<TipoConferencia>('balancete');
  const [instrucoes, setInstrucoes] = useState('');
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [etapa, setEtapa] = useState<'' | 'preparando' | 'conferindo'>('');
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Conferencia | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  // Ao abrir: recomeça, com os anexos aceitos da tarefa já marcados
  useEffect(() => {
    if (!aberto) return;
    const daTarefa: Item[] = anexos.map((a) => ({ chave: `a:${a.id}`, nome: a.nome_arquivo, tamanho: a.tamanho, origem: { anexo: a } }));
    setItens(daTarefa);
    setMarcados(new Set(daTarefa.filter((i) => classificarArquivo(i.nome)).slice(0, MAX_ARQUIVOS_IA).map((i) => i.chave)));
    setTipo(tarefa ? sugerirTipo(tarefa.nome) : 'balancete');
    setInstrucoes('');
    setEmpresaId(tarefa?.empresa_id ?? empresaInicial ?? null);
    setErro(null);
    setResultado(null);
    setAviso(null);
    setEtapa('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  function incluirArquivos(lista: FileList | null) {
    if (!lista) return;
    const novos: Item[] = Array.from(lista).map((f) => ({
      chave: `f:${f.name}:${f.size}:${f.lastModified}`, nome: f.name, tamanho: f.size, origem: { arquivo: f },
    }));
    setItens((atual) => [...atual, ...novos.filter((n) => !atual.some((a) => a.chave === n.chave))]);
    setMarcados((m) => new Set([...m, ...novos.filter((n) => classificarArquivo(n.nome)).map((n) => n.chave)]));
  }

  function alternar(chave: string) {
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(chave)) n.delete(chave); else n.add(chave);
      return n;
    });
  }

  async function conferir() {
    setErro(null);
    const escolhidos = itens.filter((i) => marcados.has(i.chave));
    if (escolhidos.length === 0) return setErro('Marque pelo menos um arquivo.');
    if (escolhidos.length > MAX_ARQUIVOS_IA) return setErro(`Marque no máximo ${MAX_ARQUIVOS_IA} arquivos.`);
    if (tipo === 'livre' && instrucoes.trim().length < 5) return setErro('Na conferência livre, escreva o que a IA deve conferir.');
    try {
      setEtapa('preparando');
      const preparados: ArquivoPreparado[] = [];
      for (const i of escolhidos) {
        preparados.push('anexo' in i.origem ? await prepararAnexo(i.origem.anexo) : await prepararArquivo(i.nome, i.origem.arquivo));
      }
      setEtapa('conferindo');
      const r = await conferirComIA({
        tipo, instrucoes: instrucoes.trim() || undefined, tarefa_id: tarefa?.id ?? null, empresa_id: tarefa ? null : empresaId, arquivos: preparados,
      });
      setResultado(r.conferencia);
      setAviso(r.aviso ?? null);
      aoConcluir?.(r.conferencia);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setEtapa('');
    }
  }

  const ocupado = etapa !== '';
  const descricao = TIPOS_CONFERENCIA.find((t) => t.value === tipo)?.descricao;
  const nomeEmpresa = empresas?.find((e) => e.id === (resultado?.empresa_id ?? empresaId))?.razao_social;

  return (
    <Modal
      opened={aberto}
      onClose={() => { if (!ocupado) aoFechar(); }}
      closeOnClickOutside={!ocupado}
      closeOnEscape={!ocupado}
      size={720}
      zIndex={400}
      title={<Group gap="xs"><IconSparkles size={20} color="var(--mantine-color-indigo-6)" /><Text fw={600} size="lg">Conferência com IA</Text></Group>}
    >
      {resultado ? (
        <Stack>
          {aviso && <Alert color="yellow" variant="light">{aviso}</Alert>}
          <ResultadoConferencia conferencia={resultado} nomeEmpresa={tarefa ? undefined : nomeEmpresa} />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setResultado(null)}>Nova conferência</Button>
            <Button onClick={aoFechar}>Fechar</Button>
          </Group>
        </Stack>
      ) : (
        <Stack>
          {tarefa && <Text size="sm" c="dimmed">Tarefa: <b>{tarefa.nome}</b></Text>}
          <Select
            label="O que conferir"
            data={TIPOS_CONFERENCIA.map((t) => ({ value: t.value, label: t.label }))}
            value={tipo}
            onChange={(v) => v && setTipo(v as TipoConferencia)}
            allowDeselect={false}
            disabled={ocupado}
            description={descricao}
            comboboxProps={{ zIndex: 500 }}
          />
          {!tarefa && empresas && (
            <Select
              label="Empresa (opcional)"
              description="Ajuda a IA a considerar o regime tributário e o CNPJ."
              placeholder="Sem empresa"
              searchable
              clearable
              data={empresas.filter((e) => e.ativa).map((e) => ({ value: e.id, label: e.razao_social }))}
              value={empresaId}
              onChange={setEmpresaId}
              disabled={ocupado}
              comboboxProps={{ zIndex: 500 }}
            />
          )}
          <Textarea
            label={tipo === 'livre' ? 'O que a IA deve conferir?' : 'Instruções (opcional)'}
            placeholder={tipo === 'livre'
              ? 'Ex.: confira se o total das notas do relatório bate com o faturamento declarado no PGDAS.'
              : 'Ex.: o saldo contábil do Banco do Brasil em 30/11 é R$ 12.345,67; foque na conta corrente.'}
            autosize minRows={2} maxRows={6} maxLength={2000}
            value={instrucoes} onChange={(e) => setInstrucoes(e.currentTarget.value)} disabled={ocupado}
          />

          <div>
            <Group justify="space-between" mb={6}>
              <Text size="sm" fw={500}>Arquivos ({marcados.size} de no máximo {MAX_ARQUIVOS_IA})</Text>
              <Button size="xs" variant="light" leftSection={<IconPaperclip size={14} />} onClick={() => entrada.current?.click()} disabled={ocupado}>
                Escolher do computador
              </Button>
            </Group>
            <input ref={entrada} type="file" multiple hidden accept={EXTENSOES_ACEITAS.join(',')} data-testid="arquivo-conferencia"
              onChange={(e) => { incluirArquivos(e.currentTarget.files); e.currentTarget.value = ''; }} />
            <Paper withBorder radius="md" p="sm">
              {itens.length === 0 ? (
                <Text size="sm" c="dimmed" ta="center" py="xs">Escolha os arquivos a conferir (PDF, imagem, Excel .xlsx, CSV, TXT, OFX ou XML).</Text>
              ) : (
                <Stack gap={6}>
                  {itens.map((i) => {
                    const aceito = !!classificarArquivo(i.nome);
                    return (
                      <Group key={i.chave} justify="space-between" wrap="nowrap">
                        <Checkbox
                          disabled={!aceito || ocupado}
                          checked={marcados.has(i.chave)}
                          onChange={() => alternar(i.chave)}
                          label={
                            <Group gap={6} wrap="nowrap">
                              <IconFile size={14} />
                              <Text size="sm" truncate maw={440}>{i.nome}</Text>
                              <Text size="xs" c="dimmed">{tamanhoLegivel(i.tamanho)}</Text>
                              {!aceito && <Badge size="xs" color="gray" variant="light">formato não aceito</Badge>}
                              {'anexo' in i.origem && <Badge size="xs" variant="light">anexo</Badge>}
                            </Group>
                          }
                        />
                        {'arquivo' in i.origem && !ocupado && (
                          <IconX size={16} style={{ cursor: 'pointer' }} aria-label={`Tirar ${i.nome}`}
                            onClick={() => { setItens((l) => l.filter((x) => x.chave !== i.chave)); setMarcados((m) => { const n = new Set(m); n.delete(i.chave); return n; }); }} />
                        )}
                      </Group>
                    );
                  })}
                </Stack>
              )}
            </Paper>
            <Text size="xs" c="dimmed" mt={4}>
              Os arquivos são enviados à IA (Anthropic) só para esta conferência. Planilhas .xls antigas: salve como .xlsx ou PDF.
            </Text>
          </div>

          {erro && <Alert color="red" variant="light" title="Não foi possível conferir">{erro}</Alert>}
          {ocupado && (
            <Alert color="indigo" variant="light" icon={<Loader size="sm" />}>
              {etapa === 'preparando' ? 'Preparando os arquivos…' : 'A IA está conferindo os documentos. Isso pode levar alguns minutos — não feche esta janela.'}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={aoFechar} disabled={ocupado}>Cancelar</Button>
            <Button leftSection={<IconSparkles size={16} />} loading={ocupado} onClick={conferir}>Conferir</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
