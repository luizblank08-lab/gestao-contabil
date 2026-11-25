// Recarrega dados automaticamente quando algo muda no banco (por outro usuário).
import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

export function useTempoReal(tabelas: string[], aoMudar: () => void) {
  const ref = useRef(aoMudar);
  ref.current = aoMudar;
  const chave = tabelas.join(',');
  useEffect(() => {
    const sb = supabase();
    let canal = sb.channel(`tr-${chave}-${Math.random().toString(36).slice(2)}`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    for (const t of chave.split(',')) {
      canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => ref.current(), 300);
      });
    }
    canal.subscribe();
    return () => {
      clearTimeout(timer);
      sb.removeChannel(canal);
    };
  }, [chave]);
}
