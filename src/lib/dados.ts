// Carregamento de listas usadas em várias telas.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useTempoReal } from './tempoReal';
import type { Empresa, Membro, Modelo, Tarefa } from './tipos';
import { avisoErro } from './avisos';

export function useMembros() {
  const [membros, setMembros] = useState<Membro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const carregar = useCallback(async () => {
    const { data, error } = await supabase().from('membros').select('*').order('nome');
    if (error) avisoErro(error);
    setMembros((data as Membro[]) ?? []);
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useTempoReal(['membros'], carregar);
  return { membros, carregando, recarregar: carregar };
}

export function useEmpresas() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const carregar = useCallback(async () => {
    const { data, error } = await supabase().from('empresas').select('*').order('razao_social');
    if (error) avisoErro(error);
    setEmpresas((data as Empresa[]) ?? []);
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useTempoReal(['empresas', 'membro_empresas'], carregar);
  return { empresas, carregando, recarregar: carregar };
}

export function useModelos() {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const carregar = useCallback(async () => {
    const { data, error } = await supabase().from('modelos_checklist').select('*').order('area').order('ordem').order('nome');
    if (error) avisoErro(error);
    setModelos((data as Modelo[]) ?? []);
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useTempoReal(['modelos_checklist'], carregar);
  return { modelos, carregando, recarregar: carregar };
}

/** Busca todas as linhas, em partes de 1000 (limite por consulta do servidor). */
export async function buscarTodos<T>(montar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const tamanho = 1000;
  const todos: T[] = [];
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await montar(de, de + tamanho - 1);
    if (error) throw error;
    todos.push(...(data ?? []));
    if (!data || data.length < tamanho) break;
  }
  return todos;
}

/**
 * Tarefas de uma competência. Com `pendentesAnteriores`, inclui também as pendentes de
 * competências anteriores (o que ficou para trás continua aparecendo).
 */
export function useTarefas(competencia: string, opcoes: { pendentesAnteriores?: boolean } = {}) {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const anteriores = !!opcoes.pendentesAnteriores;
  const carregar = useCallback(async () => {
    try {
      const lista = await buscarTodos<Tarefa>((de, ate) => {
        let q = supabase().from('tarefas').select('*');
        q = anteriores
          ? q.or(`competencia.eq.${competencia},and(status.eq.pendente,competencia.lt.${competencia})`)
          : q.eq('competencia', competencia);
        return q.order('vencimento').order('id').range(de, ate);
      });
      setTarefas(lista);
    } catch (e) {
      avisoErro(e);
    }
    setCarregando(false);
  }, [competencia, anteriores]);
  useEffect(() => { setCarregando(true); carregar(); }, [carregar]);
  useTempoReal(['tarefas'], carregar);
  /** Atualiza uma tarefa na tela antes da resposta do servidor (a tela fica instantânea) */
  const atualizarLocal = useCallback((id: string, mudanca: Partial<Tarefa>) => {
    setTarefas((l) => l.map((t) => (t.id === id ? { ...t, ...mudanca } : t)));
  }, []);
  return { tarefas, carregando, recarregar: carregar, atualizarLocal };
}
