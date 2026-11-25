// Guarda quem está conectado, seu cadastro (membro) e o escritório.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Escritorio, Membro } from './tipos';
import type { Area } from './constantes';

type Estado = {
  carregando: boolean;
  sessao: Session | null;
  membro: Membro | null;
  escritorio: Escritorio | null;
  ehGestor: boolean;
  /** Áreas que esta pessoa pode trabalhar (respeitando as áreas ativas do escritório) */
  minhasAreas: Area[];
  recarregar: () => Promise<void>;
  sair: () => Promise<void>;
};

const Contexto = createContext<Estado | null>(null);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState<Session | null>(null);
  const [membro, setMembro] = useState<Membro | null>(null);
  const [escritorio, setEscritorio] = useState<Escritorio | null>(null);

  // Cada carregamento recebe um número; respostas de carregamentos antigos são ignoradas
  // (evita que uma resposta atrasada apague um escritório recém-criado).
  const ultimaCarga = useRef(0);
  const carregarPerfil = useCallback(async (s: Session | null) => {
    const minha = ++ultimaCarga.current;
    if (!s) {
      setMembro(null);
      setEscritorio(null);
      return;
    }
    const sb = supabase();
    const { data: m } = await sb.from('membros').select('*').eq('id', s.user.id).maybeSingle();
    let e: Escritorio | null = null;
    if (m) {
      const r = await sb.from('escritorios').select('*').eq('id', m.escritorio_id).maybeSingle();
      e = (r.data as Escritorio) ?? null;
    }
    if (minha !== ultimaCarga.current) return;
    setMembro((m as Membro) ?? null);
    setEscritorio(e);
  }, []);

  useEffect(() => {
    const sb = supabase();
    let ativo = true;
    sb.auth.getSession().then(async ({ data }) => {
      if (!ativo) return;
      setSessao(data.session);
      await carregarPerfil(data.session);
      setCarregando(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((evento, s) => {
      setSessao(s);
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') {
        // Executa fora do callback (recomendação da biblioteca)
        setTimeout(() => carregarPerfil(s), 0);
      }
    });
    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, [carregarPerfil]);

  // Se o Gestor alterar minhas permissões, atualiza na hora
  useEffect(() => {
    if (!sessao?.user.id) return;
    const sb = supabase();
    const canal = sb
      .channel('meu-cadastro')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'membros', filter: `id=eq.${sessao.user.id}` }, () =>
        carregarPerfil(sessao)
      )
      .subscribe();
    return () => {
      sb.removeChannel(canal);
    };
  }, [sessao, carregarPerfil]);

  const valor = useMemo<Estado>(() => {
    const ehGestor = membro?.papel === 'gestor' && membro.ativo;
    const ativas = escritorio?.areas_ativas ?? [];
    const minhasAreas = ehGestor ? ativas : (membro?.areas ?? []).filter((a) => ativas.includes(a));
    return {
      carregando,
      sessao,
      membro,
      escritorio,
      ehGestor,
      minhasAreas,
      // Sempre usa a sessão atual (não a de quando a tela foi desenhada)
      recarregar: async () => {
        const { data } = await supabase().auth.getSession();
        await carregarPerfil(data.session);
      },
      sair: async () => {
        await supabase().auth.signOut();
      },
    };
  }, [carregando, sessao, membro, escritorio, carregarPerfil]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao() {
  const c = useContext(Contexto);
  if (!c) throw new Error('useSessao fora do ProvedorSessao');
  return c;
}
