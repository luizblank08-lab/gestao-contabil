// Detalhe de uma tarefa: situação, conclusão, observação, anexos (arrastar e soltar) e histórico.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionIcon, Alert, Anchor, Badge, Modal, Button, Divider, Drawer, Group, Loader, Paper, SegmentedControl, Select, Stack, Text, Textarea,
  ThemeIcon, Timeline, Tooltip,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconArrowBackUp, IconDownload, IconFile, IconPaperclip, IconSparkles, IconTrash, IconUpload } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { supabase } from '../lib/supabase';
import { alterarTarefa, baixarAnexo, enviarAnexo, removerAnexo } from '../lib/acoesTarefa';
import { avisoErro, avisoSucesso } from '../lib/avisos';
import { corArea, rotuloArea, rotuloRegime } from '../lib/constantes';
import { formatarData, formatarDataHora } from '../lib/formatos';
import { rotuloPeriodo, situacao, tamanhoLegivel, textoPrazo } from '../lib/tarefas';
import { mascaraCnpj } from '../lib/cnpj';
import { useSessao } from '../lib/sessao';
import type { Anexo, Empresa, HistoricoTarefa, Membro, StatusTarefa, Tarefa } from '../lib/tipos';
import { SituacaoBadge } from './SituacaoBadge';
import { BadgeConclusao, ConferenciaIAModal, ResultadoConferencia } from './ConferenciaIA';
import { rotuloTipoConferencia, type Conferencia } from '../lib/conferenciaIA';

function textoHistorico(h: HistoricoTarefa): string {
  switch (h.acao) {
    case 'criada': return 'Tarefa gerada';
    case 'status': return `alterou a situação: ${h.detalhe}`;
    case 'data': return `alterou a data de conclusão para ${h.detalhe}`;
    case 'observacao': return h.detalhe ? `escreveu: "${h.detalhe}"` : 'apagou a observação';
    case 'responsavel': return `passou a tarefa para ${h.detalhe}`;
    case 'devolvida': return `devolveu para correção: "${h.detalhe}"`;
    case 'anexo_incluido': return `anexou ${h.detalhe}`;
    case 'anexo_removido': return `removeu o anexo ${h.detalhe}`;
    default: return h.acao;
  }
}

export function TarefaDrawer({
  tarefaId, aoFechar, empresas, membros, aoAlterar,
}: {
  tarefaId: string | null;
  aoFechar: () => void;
  empresas: Map<string, Empresa>;
  membros: Membro[];
  aoAlterar?: (t: Tarefa) => void;
}) {
  const { membro: eu, ehGestor } = useSessao();
  const [tarefa, setTarefa] = useState<Tarefa | null>(null);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [historico, setHistorico] = useState<HistoricoTarefa[]>([]);
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const [devolvendo, setDevolvendo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [conferencias, setConferencias] = useState<Conferencia[]>([]);
  const [conferindo, setConferindo] = useState(false);
  const [conferenciaAberta, setConferenciaAberta] = useState<Conferencia | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const nomeMembro = (id: string | null) => (id ? membros.find((m) => m.id === id)?.nome ?? 'Usuário removido' : 'Sistema');

  const carregar = useCallback(async () => {
    if (!tarefaId) return;
    const sb = supabase();
    const [t, a, h, c] = await Promise.all([
      sb.from('tarefas').select('*').eq('id', tarefaId).maybeSingle(),
      sb.from('tarefa_anexos').select('*').eq('tarefa_id', tarefaId).order('criado_em'),
      sb.from('tarefa_historico').select('*').eq('tarefa_id', tarefaId).order('id', { ascending: false }),
      sb.from('conferencias_ia').select('*').eq('tarefa_id', tarefaId).order('criado_em', { ascending: false }).limit(20),
    ]);
    if (t.error) avisoErro(t.error);
    setTarefa((t.data as Tarefa) ?? null);
    setAnexos((a.data as Anexo[]) ?? []);
    setHistorico((h.data as HistoricoTarefa[]) ?? []);
    setConferencias((c.data as Conferencia[]) ?? []); // sem a tabela (banco desatualizado) a lista fica vazia
  }, [tarefaId]);

  useEffect(() => {
    setTarefa(null);
    setAnexos([]);
    setHistorico([]);
    setConferencias([]);
    carregar();
  }, [carregar]);
  useEffect(() => setObs(tarefa?.observacao ?? ''), [tarefa?.id, tarefa?.observacao]);

  // Tempo real: o que outra pessoa fizer nesta tarefa aparece na hora
  useEffect(() => {
    if (!tarefaId) return;
    const sb = supabase();
    const canal = sb.channel(`tarefa-${tarefaId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas', filter: `id=eq.${tarefaId}` }, carregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefa_anexos', filter: `tarefa_id=eq.${tarefaId}` }, carregar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tarefa_historico', filter: `tarefa_id=eq.${tarefaId}` }, carregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conferencias_ia', filter: `tarefa_id=eq.${tarefaId}` }, carregar)
      .subscribe();
    return () => { sb.removeChannel(canal); };
  }, [tarefaId, carregar]);

  async function alterar(mudanca: Parameters<typeof alterarTarefa>[1], mensagem?: string) {
    if (!tarefa) return;
    setSalvando(true);
    try {
      const nova = await alterarTarefa(tarefa.id, mudanca);
      setTarefa(nova);
      aoAlterar?.(nova);
      if (mensagem) avisoSucesso(mensagem);
      carregar();
    } catch (e) {
      avisoErro(e);
    } finally {
      setSalvando(false);
    }
  }

  async function enviar(arquivos: FileList | File[] | null) {
    if (!tarefa || !arquivos) return;
    const lista = Array.from(arquivos);
    if (lista.length === 0) return;
    setEnviando((n) => n + lista.length);
    let ok = 0;
    for (const f of lista) {
      try {
        await enviarAnexo(tarefa.id, f);
        ok++;
      } catch (e) {
        avisoErro(e);
      } finally {
        setEnviando((n) => n - 1);
      }
    }
    if (ok) avisoSucesso(ok === 1 ? 'Arquivo anexado.' : `${ok} arquivos anexados.`);
    carregar();
  }

  async function baixar(a: Anexo) {
    try {
      const caminho = await baixarAnexo(a);
      if (caminho && window.desktop) {
        notifications.show({
          color: 'green', title: 'Arquivo salvo', autoClose: 8000,
          message: <Text size="sm">{caminho} <Anchor size="sm" onClick={() => window.desktop?.mostrarArquivo(caminho)}>Mostrar na pasta</Anchor></Text>,
        });
      }
    } catch (e) { avisoErro(e); }
  }

  async function devolver() {
    if (!tarefa) return;
    if (motivo.trim().length < 3) return avisoErro(new Error('Escreva o que precisa ser corrigido.'));
    setSalvando(true);
    const { data, error } = await supabase().rpc('devolver_tarefa', { p_tarefa: tarefa.id, p_motivo: motivo });
    setSalvando(false);
    if (error) return avisoErro(error);
    setTarefa(data as Tarefa);
    aoAlterar?.(data as Tarefa);
    setDevolvendo(false);
    setMotivo('');
    avisoSucesso(`Tarefa devolvida para ${nomeMembro(tarefa.responsavel_id)}.`);
    carregar();
  }

  function remover(a: Anexo) {
    modals.openConfirmModal({
      title: 'Remover anexo?',
      children: <Text size="sm">O arquivo <b>{a.nome_arquivo}</b> será apagado.</Text>,
      labels: { confirm: 'Remover', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try { await removerAnexo(a); carregar(); } catch (e) { avisoErro(e); }
      },
    });
  }

  const empresa = tarefa ? empresas.get(tarefa.empresa_id) : undefined;
  const s = tarefa ? situacao(tarefa) : null;
  const opcoesResponsavel = tarefa
    ? membros.filter((m) => m.ativo && (m.papel === 'gestor' || m.areas.includes(tarefa.area))).map((m) => ({ value: m.id, label: m.nome }))
    : [];

  return (
    <Drawer opened={!!tarefaId} onClose={aoFechar} position="right" size={560} title={<Text fw={600}>Tarefa</Text>} padding="lg">
      {!tarefa ? (
        <Group justify="center" py="xl"><Loader /></Group>
      ) : (
        <Stack
          gap="md"
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastando(true); } }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setArrastando(false); }}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); enviar(e.dataTransfer.files); }}
        >
          <div>
            <Group gap="xs" mb={4}>
              <Badge color={corArea(tarefa.area)} variant="light">{rotuloArea(tarefa.area)}</Badge>
              <Badge variant="outline" color="gray">{rotuloPeriodo(tarefa)}</Badge>
              {s && <SituacaoBadge s={s} />}
            </Group>
            <Text fw={700} size="xl" lh={1.25}>{tarefa.nome}</Text>
            <Text size="sm" mt={4}>{empresa?.razao_social ?? 'Empresa'}</Text>
            <Text size="xs" c="dimmed">
              {[empresa?.codigo && `Cód. ${empresa.codigo}`, empresa?.cnpj && mascaraCnpj(empresa.cnpj), empresa?.regime && rotuloRegime(empresa.regime)].filter(Boolean).join(' · ')}
            </Text>
          </div>

          {tarefa.devolvida_em && tarefa.status === 'pendente' && (
            <Alert color="grape" variant="light" icon={<IconArrowBackUp size={18} />} title="Devolvida para correção">
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{tarefa.motivo_devolucao}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                por {nomeMembro(tarefa.devolvida_por)} em {formatarDataHora(tarefa.devolvida_em)}
                {tarefa.devolucoes > 1 && ` · ${tarefa.devolucoes}ª devolução`} — corrija e marque como feita de novo.
              </Text>
            </Alert>
          )}

          <Paper withBorder radius="md" p="sm">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed">Vencimento</Text>
                <Text fw={600}>{formatarData(tarefa.vencimento)} <Text span size="sm" c={s === 'atrasado' ? 'red.7' : 'dimmed'} fw={400}>{textoPrazo(tarefa)}</Text></Text>
              </div>
              <div style={{ minWidth: 220 }}>
                {ehGestor ? (
                  <Select size="xs" label="Responsável" placeholder="Sem responsável" clearable searchable data={opcoesResponsavel}
                    value={tarefa.responsavel_id} onChange={(v) => alterar({ responsavel_id: v }, 'Responsável alterado.')} />
                ) : (
                  <>
                    <Text size="xs" c="dimmed">Responsável</Text>
                    <Text fw={500}>{tarefa.responsavel_id === eu?.id ? 'Você' : tarefa.responsavel_id ? nomeMembro(tarefa.responsavel_id) : 'Sem responsável'}</Text>
                  </>
                )}
              </div>
            </Group>
          </Paper>

          <div>
            <Text size="sm" fw={500} mb={6}>Situação</Text>
            <SegmentedControl
              fullWidth
              disabled={salvando}
              value={tarefa.status}
              onChange={(v) => alterar({ status: v as StatusTarefa })}
              data={[{ value: 'pendente', label: 'Pendente' }, { value: 'feito', label: '✓ Feita' }, { value: 'nao_se_aplica', label: 'Não se aplica' }]}
              color={tarefa.status === 'feito' ? 'green' : tarefa.status === 'nao_se_aplica' ? 'gray' : 'yellow'}
            />
            {ehGestor && tarefa.status !== 'pendente' && (
              <Button mt="sm" size="xs" variant="light" color="grape" leftSection={<IconArrowBackUp size={14} />} onClick={() => setDevolvendo(true)}>
                Devolver para correção
              </Button>
            )}
            {tarefa.status === 'feito' && (
              <Group mt="sm" align="flex-end">
                <DateInput
                  label="Data de conclusão"
                  valueFormat="DD/MM/YYYY"
                  locale="pt-br"
                  maxDate={new Date()}
                  w={180}
                  value={tarefa.concluido_em ? dayjs(tarefa.concluido_em).toDate() : null}
                  onChange={(d) => d && alterar({ concluido_em: dayjs(d).format('YYYY-MM-DD') })}
                />
                <Text size="sm" c="dimmed" pb={8}>por {nomeMembro(tarefa.concluido_por)}</Text>
              </Group>
            )}
          </div>

          <div>
            <Textarea label="Observação" placeholder="Ex.: guia enviada ao cliente por e-mail; aguardando extrato…" autosize minRows={2} maxRows={8}
              value={obs} onChange={(e) => setObs(e.currentTarget.value)} />
            {obs !== (tarefa.observacao ?? '') && (
              <Group justify="flex-end" mt={6} gap="xs">
                <Button size="xs" variant="default" onClick={() => setObs(tarefa.observacao ?? '')}>Desfazer</Button>
                <Button size="xs" loading={salvando} onClick={() => alterar({ observacao: obs.trim() || null }, 'Observação salva.')}>Salvar observação</Button>
              </Group>
            )}
          </div>

          <div>
            <Group justify="space-between" mb={6}>
              <Text size="sm" fw={500}>Anexos {anexos.length > 0 && <Text span c="dimmed">({anexos.length})</Text>}</Text>
              <Group gap="xs">
                <Button size="xs" variant="light" color="indigo" leftSection={<IconSparkles size={14} />} onClick={() => setConferindo(true)}>Conferir com IA</Button>
                <Button size="xs" variant="light" leftSection={<IconPaperclip size={14} />} onClick={() => entrada.current?.click()}>Anexar arquivo</Button>
              </Group>
            </Group>
            <input ref={entrada} type="file" multiple hidden data-testid="anexar-arquivo" onChange={(e) => { enviar(e.currentTarget.files); e.currentTarget.value = ''; }} />
            <Paper
              withBorder
              radius="md"
              p="sm"
              style={{ borderStyle: 'dashed', borderWidth: 2, borderColor: arrastando ? 'var(--mantine-color-indigo-5)' : undefined, background: arrastando ? 'var(--mantine-color-indigo-0)' : undefined }}
            >
              {anexos.length === 0 && enviando === 0 && (
                <Group justify="center" gap="xs" py="xs" c="dimmed">
                  <IconUpload size={18} />
                  <Text size="sm">Arraste guias, recibos ou comprovantes para esta janela</Text>
                </Group>
              )}
              <Stack gap={6}>
                {anexos.map((a) => (
                  <Group key={a.id} justify="space-between" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                      <ThemeIcon variant="light" size="md"><IconFile size={16} /></ThemeIcon>
                      <div style={{ minWidth: 0 }}>
                        <Text size="sm" truncate>{a.nome_arquivo}</Text>
                        <Text size="xs" c="dimmed">{tamanhoLegivel(a.tamanho)} · {nomeMembro(a.enviado_por)} · {formatarDataHora(a.criado_em)}</Text>
                      </div>
                    </Group>
                    <Group gap={4} wrap="nowrap">
                      <Tooltip label="Baixar"><ActionIcon variant="subtle" aria-label={`Baixar ${a.nome_arquivo}`} onClick={() => baixar(a)}><IconDownload size={18} /></ActionIcon></Tooltip>
                      {(ehGestor || a.enviado_por === eu?.id) && (
                        <Tooltip label="Remover"><ActionIcon variant="subtle" color="red" aria-label={`Remover ${a.nome_arquivo}`} onClick={() => remover(a)}><IconTrash size={18} /></ActionIcon></Tooltip>
                      )}
                    </Group>
                  </Group>
                ))}
                {enviando > 0 && <Group gap="xs"><Loader size="xs" /><Text size="sm" c="dimmed">Enviando {enviando} arquivo(s)…</Text></Group>}
              </Stack>
            </Paper>
            <Text size="xs" c="dimmed" mt={4}>Até 25 MB por arquivo.</Text>
          </div>

          {conferencias.length > 0 && (
            <div>
              <Text size="sm" fw={500} mb={6}>Conferências com IA <Text span c="dimmed">({conferencias.length})</Text></Text>
              <Stack gap={6}>
                {conferencias.map((c) => (
                  <Paper key={c.id} withBorder radius="md" p="xs" style={{ cursor: 'pointer' }} onClick={() => setConferenciaAberta(c)}>
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                        <BadgeConclusao conclusao={c.conclusao} />
                        <Text size="sm" truncate>{rotuloTipoConferencia(c.tipo)} — {c.resumo}</Text>
                      </Group>
                      <Text size="xs" c="dimmed" className="nowrap">{formatarDataHora(c.criado_em)}</Text>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            </div>
          )}

          <Divider label="Histórico" labelPosition="left" />
          {historico.length === 0 ? <Alert color="gray" variant="light">Sem registros.</Alert> : (
            <Timeline bulletSize={14} lineWidth={2}>
              {historico.map((h) => (
                <Timeline.Item key={h.id}>
                  <Text size="sm"><b>{h.acao === 'criada' ? '' : nomeMembro(h.membro_id) + ' '}</b>{textoHistorico(h)}</Text>
                  <Text size="xs" c="dimmed">{formatarDataHora(h.criado_em)}</Text>
                </Timeline.Item>
              ))}
            </Timeline>
          )}
        </Stack>
      )}
      <ConferenciaIAModal aberto={conferindo} aoFechar={() => setConferindo(false)} tarefa={tarefa} anexos={anexos} aoConcluir={() => carregar()} />
      <Modal opened={!!conferenciaAberta} onClose={() => setConferenciaAberta(null)} size={720} zIndex={400}
        title={<Text fw={600}>Conferência com IA</Text>}>
        {conferenciaAberta && <ResultadoConferencia conferencia={conferenciaAberta} nomeAutor={nomeMembro(conferenciaAberta.criado_por)} />}
      </Modal>
      <Modal opened={devolvendo} onClose={() => setDevolvendo(false)} title={<Text fw={600}>Devolver para correção</Text>} zIndex={400}>
        <Stack>
          <Text size="sm">
            A tarefa volta a ficar <b>pendente</b> para <b>{tarefa ? nomeMembro(tarefa.responsavel_id) : ''}</b>, em destaque como
            devolvida e com a sua observação.
          </Text>
          <Textarea label="O que precisa ser corrigido?" placeholder="Ex.: faltou anexar o comprovante de pagamento; valor da guia diferente do apurado…"
            autosize minRows={3} maxRows={8} data-autofocus value={motivo} onChange={(e) => setMotivo(e.currentTarget.value)} />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDevolvendo(false)}>Cancelar</Button>
            <Button color="grape" loading={salvando} disabled={motivo.trim().length < 3} onClick={devolver}>Devolver</Button>
          </Group>
        </Stack>
      </Modal>
    </Drawer>
  );
}
