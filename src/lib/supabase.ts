// Conexão com o banco de dados (Supabase).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const CHAVE_CONFIG = 'gc_conexao';
const CHAVE_MANTER = 'gc_manter_conectado';

export type Conexao = { url: string; chave: string };

/** Lê a conexão: primeiro a embutida na versão (para a equipe), depois a configurada na tela. */
export function lerConexao(): Conexao | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const chave = import.meta.env.VITE_SUPABASE_KEY as string | undefined;
  if (url && chave) return { url, chave };
  try {
    const salvo = localStorage.getItem(CHAVE_CONFIG);
    if (salvo) return JSON.parse(salvo);
  } catch {
    /* ignora */
  }
  return null;
}

export const conexaoEmbutida = () =>
  Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_KEY);

export function salvarConexao(c: Conexao | null) {
  if (c) localStorage.setItem(CHAVE_CONFIG, JSON.stringify(c));
  else localStorage.removeItem(CHAVE_CONFIG);
}

/** "Manter conectado": guarda a sessão de forma permanente; senão, só enquanto o app estiver aberto. */
export function definirManterConectado(manter: boolean) {
  localStorage.setItem(CHAVE_MANTER, manter ? '1' : '0');
}
const manterConectado = () => localStorage.getItem(CHAVE_MANTER) !== '0';

const armazenamento = {
  getItem: (k: string) => (manterConectado() ? localStorage : sessionStorage).getItem(k),
  setItem: (k: string, v: string) => {
    if (manterConectado()) {
      localStorage.setItem(k, v);
      sessionStorage.removeItem(k);
    } else {
      sessionStorage.setItem(k, v);
      localStorage.removeItem(k);
    }
  },
  removeItem: (k: string) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  },
};

let cliente: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!cliente) {
    const c = lerConexao();
    if (!c) throw new Error('Conexão com o banco não configurada.');
    cliente = createClient(c.url, c.chave, {
      auth: { storage: armazenamento, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return cliente;
}

/** Traduz mensagens de erro comuns para português. */
export function traduzirErro(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e ?? '');
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'E-mail ainda não confirmado.';
  if (m.includes('user is banned') || m.includes('banned')) return 'Este usuário foi desativado. Fale com o Gestor do escritório.';
  if (m.includes('user already registered')) return 'Já existe uma conta com este e-mail.';
  if (m.includes('password should be at least') || m.includes('weak')) return 'A senha é fraca. Use pelo menos 8 caracteres, misturando letras e números.';
  if (m.includes('should be different')) return 'A nova senha precisa ser diferente da atual.';
  if (m.includes('token has expired') || m.includes('otp') && m.includes('invalid')) return 'Código inválido ou expirado. Peça um novo.';
  if (m.includes('rate limit') || m.includes('security purposes')) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sem conexão com o servidor. Verifique sua internet.';
  if (m.includes('database error') || m.includes('unexpected_failure') || m.includes('internal server error'))
    return 'O servidor teve uma falha momentânea. Aguarde alguns segundos e tente de novo. Se continuar, avise o suporte.';
  if (m.includes('duplicate key') && m.includes('cnpj')) return 'Já existe uma empresa cadastrada com este CNPJ.';
  if (m.includes('row-level security') || m.includes('permission denied')) return 'Você não tem permissão para fazer isso.';
  return msg || 'Ocorreu um erro inesperado.';
}
