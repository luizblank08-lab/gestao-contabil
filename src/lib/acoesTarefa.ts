// Ações sobre tarefas e anexos.
import { supabase } from './supabase';
import { nomeSeguroArquivo } from './tarefas';
import type { Anexo, StatusTarefa, Tarefa } from './tipos';

export const LIMITE_ANEXO = 25 * 1024 * 1024; // 25 MB (igual ao limite do armazenamento)

export async function alterarTarefa(id: string, mudanca: Partial<Pick<Tarefa, 'status' | 'concluido_em' | 'observacao' | 'responsavel_id'>>) {
  const { data, error } = await supabase().from('tarefas').update(mudanca).eq('id', id).select().maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Você não tem permissão para alterar esta tarefa.');
  return data as Tarefa;
}

export const marcarStatus = (id: string, status: StatusTarefa) => alterarTarefa(id, { status });

export async function enviarAnexo(tarefaId: string, arquivo: File): Promise<Anexo> {
  if (arquivo.size > LIMITE_ANEXO) throw new Error(`"${arquivo.name}" passa de 25 MB.`);
  if (arquivo.size === 0) throw new Error(`"${arquivo.name}" está vazio.`);
  const caminho = `${tarefaId}/${Date.now()}-${nomeSeguroArquivo(arquivo.name)}`;
  const sb = supabase();
  const { error: e1 } = await sb.storage.from('anexos').upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false });
  if (e1) throw e1;
  const { data: u } = await sb.auth.getUser();
  const { data, error: e2 } = await sb.from('tarefa_anexos').insert({
    tarefa_id: tarefaId, caminho, nome_arquivo: arquivo.name, tamanho: arquivo.size, tipo: arquivo.type || null, enviado_por: u.user?.id,
  }).select().single();
  if (e2) {
    await sb.storage.from('anexos').remove([caminho]);
    throw e2;
  }
  return data as Anexo;
}

/** Baixa o anexo. No app de computador abre "Salvar como"; devolve o caminho salvo (ou null se cancelou). */
export async function baixarAnexo(a: Anexo): Promise<string | null> {
  const { data, error } = await supabase().storage.from('anexos').download(a.caminho);
  if (error || !data) throw error ?? new Error('Arquivo não encontrado.');
  if (window.desktop?.salvarArquivo) {
    return window.desktop.salvarArquivo(a.nome_arquivo, await data.arrayBuffer());
  }
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = a.nome_arquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return a.nome_arquivo;
}

export async function removerAnexo(a: Anexo) {
  const sb = supabase();
  const { error } = await sb.from('tarefa_anexos').delete().eq('id', a.id);
  if (error) throw error;
  await sb.storage.from('anexos').remove([a.caminho]);
}
