// Carregamento de listas usadas em várias telas.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useTempoReal } from './tempoReal';
import type { Empresa, Membro } from './tipos';
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
