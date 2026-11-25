// Função segura (roda no servidor do Supabase) para o Gestor administrar usuários.
// Ações: "criar", "redefinir_senha", "definir_ativo".
// Só funciona se quem chama for Gestor ativo do escritório.
// Não depende de bibliotecas externas: fala direto com os serviços do Supabase.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function resposta(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
const erro = (mensagem: string, status = 400) => resposta({ erro: mensagem }, status);

const AREAS = ["fiscal", "contabil", "dp"];
const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_ADMIN = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function cabecalhosAdmin(extra: Record<string, string> = {}) {
  const h: Record<string, string> = { apikey: CHAVE_ADMIN, "Content-Type": "application/json", ...extra };
  if (CHAVE_ADMIN.startsWith("ey")) h.Authorization = `Bearer ${CHAVE_ADMIN}`;
  return h;
}

async function chamar(caminho: string, init: RequestInit & { prefer?: string } = {}) {
  const r = await fetch(`${URL_BASE}${caminho}`, {
    ...init,
    headers: cabecalhosAdmin(init.prefer ? { Prefer: init.prefer } : {}),
  });
  const texto = await r.text();
  let dados: any = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = texto; }
  return { ok: r.ok, status: r.status, dados };
}

const mensagemDe = (dados: any) =>
  (dados && (dados.msg || dados.message || dados.error_description || dados.error)) || "erro desconhecido";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return erro("Método não permitido.", 405);

  try {
    // Quem está chamando?
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return erro("Sessão expirada. Entre novamente.", 401);
    const rUser = await fetch(`${URL_BASE}/auth/v1/user`, {
      headers: { apikey: CHAVE_ADMIN, Authorization: `Bearer ${token}` },
    });
    if (!rUser.ok) return erro("Sessão expirada. Entre novamente.", 401);
    const usuario = await rUser.json();

    const rG = await chamar(`/rest/v1/membros?id=eq.${usuario.id}&select=id,escritorio_id,papel,ativo`);
    const gestor = Array.isArray(rG.dados) ? rG.dados[0] : null;
    if (!gestor || !gestor.ativo || gestor.papel !== "gestor") {
      return erro("Apenas o Gestor pode administrar a equipe.", 403);
    }

    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return erro("Requisição inválida.");
    }

    const uuid = /^[0-9a-f-]{36}$/i;
    async function membroDoEscritorio(id: string) {
      if (!uuid.test(id)) return null;
      const r = await chamar(
        `/rest/v1/membros?id=eq.${id}&escritorio_id=eq.${gestor.escritorio_id}&select=id,papel,ativo`,
      );
      return Array.isArray(r.dados) ? r.dados[0] ?? null : null;
    }

    switch (body.acao) {
      case "criar": {
        const email = String(body.email ?? "").trim().toLowerCase();
        const nome = String(body.nome ?? "").trim();
        const senha = String(body.senha ?? "");
        const papel = body.papel === "gestor" ? "gestor" : "usuario";
        const areas: string[] = Array.isArray(body.areas) ? body.areas.filter((a: string) => AREAS.includes(a)) : [];
        const todas = Boolean(body.todas_empresas);
        const empresas: string[] = Array.isArray(body.empresas)
          ? body.empresas.filter((e: unknown) => typeof e === "string" && uuid.test(e))
          : [];

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro("E-mail inválido.");
        if (!nome) return erro("Informe o nome.");
        if (senha.length < 8) return erro("A senha provisória precisa ter pelo menos 8 caracteres.");
        if (papel === "usuario" && areas.length === 0) return erro("Escolha pelo menos uma área.");

        const rc = await chamar(`/auth/v1/admin/users`, {
          method: "POST",
          body: JSON.stringify({ email, password: senha, email_confirm: true, user_metadata: { nome } }),
        });
        if (!rc.ok) {
          const msg = mensagemDe(rc.dados).toLowerCase();
          if (rc.status === 422 || msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
            return erro("Já existe uma conta com este e-mail.");
          }
          return erro("Não foi possível criar o usuário: " + mensagemDe(rc.dados));
        }
        const novoId = rc.dados.id as string;

        const rm = await chamar(`/rest/v1/membros`, {
          method: "POST",
          prefer: "return=minimal",
          body: JSON.stringify({
            id: novoId,
            escritorio_id: gestor.escritorio_id,
            nome,
            email,
            papel,
            areas: papel === "gestor" ? AREAS : areas,
            todas_empresas: papel === "gestor" ? true : todas,
            trocar_senha: true,
          }),
        });
        if (!rm.ok) {
          await chamar(`/auth/v1/admin/users/${novoId}`, { method: "DELETE" });
          return erro("Não foi possível salvar o usuário: " + mensagemDe(rm.dados));
        }

        if (!todas && empresas.length > 0) {
          const rv = await chamar(
            `/rest/v1/empresas?select=id&escritorio_id=eq.${gestor.escritorio_id}&id=in.(${empresas.join(",")})`,
          );
          const validas = Array.isArray(rv.dados) ? rv.dados : [];
          if (validas.length > 0) {
            await chamar(`/rest/v1/membro_empresas`, {
              method: "POST",
              prefer: "return=minimal",
              body: JSON.stringify(validas.map((e: { id: string }) => ({ membro_id: novoId, empresa_id: e.id }))),
            });
          }
        }
        return resposta({ ok: true, id: novoId });
      }

      case "redefinir_senha": {
        const alvo = await membroDoEscritorio(String(body.membro_id ?? ""));
        if (!alvo) return erro("Usuário não encontrado.", 404);
        const senha = String(body.senha ?? "");
        if (senha.length < 8) return erro("A senha provisória precisa ter pelo menos 8 caracteres.");
        const r = await chamar(`/auth/v1/admin/users/${alvo.id}`, { method: "PUT", body: JSON.stringify({ password: senha }) });
        if (!r.ok) return erro("Não foi possível redefinir a senha: " + mensagemDe(r.dados));
        await chamar(`/rest/v1/membros?id=eq.${alvo.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ trocar_senha: true }) });
        return resposta({ ok: true });
      }

      case "definir_ativo": {
        const alvo = await membroDoEscritorio(String(body.membro_id ?? ""));
        if (!alvo) return erro("Usuário não encontrado.", 404);
        if (alvo.id === gestor.id) return erro("Você não pode desativar a si mesmo.");
        const ativo = Boolean(body.ativo);
        // Primeiro o cadastro (o banco impede remover o último Gestor)
        const r1 = await chamar(`/rest/v1/membros?id=eq.${alvo.id}`, {
          method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ ativo }),
        });
        if (!r1.ok) return erro(mensagemDe(r1.dados));
        // Depois bloqueia (ou libera) o login
        const r2 = await chamar(`/auth/v1/admin/users/${alvo.id}`, {
          method: "PUT", body: JSON.stringify({ ban_duration: ativo ? "none" : "876000h" }),
        });
        if (!r2.ok) return erro("Cadastro atualizado, mas o login não foi bloqueado: " + mensagemDe(r2.dados));
        return resposta({ ok: true });
      }

      default:
        return erro("Ação desconhecida.");
    }
  } catch (e) {
    return erro("Erro inesperado: " + (e instanceof Error ? e.message : String(e)), 500);
  }
});
