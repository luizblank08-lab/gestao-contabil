-- ARQUIVO GERADO AUTOMATICAMENTE (npm run sql:juntar). Pode ser executado mais de uma vez.

-- ===== migrations/001_etapa1.sql =====
-- =====================================================================
-- Gestão Contábil — Etapa 1
-- Escritórios, membros (equipe), empresas e regras de acesso (RLS).
--
-- Regras principais:
--   * Todo dado pertence a um escritório; ninguém enxerga outro escritório.
--   * Gestor vê e altera tudo do seu escritório.
--   * Usuário vê apenas as empresas designadas a ele (ou todas, se marcado),
--     e — a partir da Etapa 3 — apenas os itens das suas áreas.
--   * Usuário desativado não enxerga nada.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.escritorios (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(trim(nome)) > 0),
  cnpj          text,
  areas_ativas  text[] not null default array['fiscal','contabil','dp'],
  criado_em     timestamptz not null default now(),
  constraint areas_ativas_validas check (areas_ativas <@ array['fiscal','contabil','dp']
                                         and cardinality(areas_ativas) > 0)
);

create table if not exists public.membros (
  id              uuid primary key references auth.users(id) on delete cascade,
  escritorio_id   uuid not null references public.escritorios(id) on delete cascade,
  nome            text not null check (length(trim(nome)) > 0),
  email           text not null,
  papel           text not null default 'usuario' check (papel in ('gestor','usuario')),
  areas           text[] not null default '{}',
  todas_empresas  boolean not null default false,
  ativo           boolean not null default true,
  trocar_senha    boolean not null default false,
  criado_em       timestamptz not null default now(),
  constraint areas_validas check (areas <@ array['fiscal','contabil','dp'])
);
create index if not exists membros_escritorio_idx on public.membros(escritorio_id);

create table if not exists public.empresas (
  id                   uuid primary key default gen_random_uuid(),
  escritorio_id        uuid not null references public.escritorios(id) on delete cascade,
  cnpj                 text not null check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  razao_social         text not null check (length(trim(razao_social)) > 0),
  nome_fantasia        text,
  regime               text not null check (regime in ('mei','simples','presumido','real')),
  atividades           text[] not null default '{}'
                       check (atividades <@ array['comercio','servico','industria']),
  inscricao_estadual   text,
  inscricao_municipal  text,
  uf                   char(2) not null,
  municipio            text not null,
  possui_funcionarios  boolean not null default false,
  resp_fiscal_id       uuid references public.membros(id) on delete set null,
  resp_contabil_id     uuid references public.membros(id) on delete set null,
  resp_dp_id           uuid references public.membros(id) on delete set null,
  contato_nome         text,
  contato_telefone     text,
  contato_email        text,
  observacoes          text,
  ativa                boolean not null default true,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  unique (escritorio_id, cnpj)
);
create index if not exists empresas_escritorio_idx on public.empresas(escritorio_id);

-- Quais empresas cada usuário atende (quando não atende "todas")
create table if not exists public.membro_empresas (
  membro_id   uuid not null references public.membros(id) on delete cascade,
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  primary key (membro_id, empresa_id)
);
create index if not exists membro_empresas_empresa_idx on public.membro_empresas(empresa_id);

-- ---------------------------------------------------------------------
-- Funções auxiliares (usadas pelas regras de acesso)
-- "security definer" = rodam com permissão do dono, para poderem ler a
-- tabela de membros sem cair em recursão nas próprias regras.
-- ---------------------------------------------------------------------
create or replace function public.meu_escritorio()
returns uuid language sql stable security definer set search_path = public as $$
  select escritorio_id from public.membros where id = auth.uid() and ativo
$$;

create or replace function public.sou_gestor()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select papel = 'gestor' from public.membros
                   where id = auth.uid() and ativo), false)
$$;

create or replace function public.minhas_areas()
returns text[] language sql stable security definer set search_path = public as $$
  select case when m.papel = 'gestor' then e.areas_ativas
              else array(select unnest(m.areas) intersect select unnest(e.areas_ativas)) end
  from public.membros m join public.escritorios e on e.id = m.escritorio_id
  where m.id = auth.uid() and m.ativo
$$;

-- Posso ver esta empresa? (gestor: todas do escritório; usuário: as designadas
-- a ele, todas se "todas_empresas", ou aquelas em que é responsável de uma área sua)
create or replace function public.posso_ver_empresa(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.empresas e
    join public.membros m on m.id = auth.uid() and m.ativo and m.escritorio_id = e.escritorio_id
    where e.id = p_empresa
      and (
        m.papel = 'gestor'
        or m.todas_empresas
        or exists (select 1 from public.membro_empresas me
                   where me.membro_id = m.id and me.empresa_id = e.id)
        or (e.resp_fiscal_id   = m.id and 'fiscal'   = any(m.areas))
        or (e.resp_contabil_id = m.id and 'contabil' = any(m.areas))
        or (e.resp_dp_id       = m.id and 'dp'       = any(m.areas))
      )
  )
$$;

-- Posso mexer em itens desta área nesta empresa? (usado a partir da Etapa 3)
create or replace function public.posso_area_empresa(p_area text, p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.posso_ver_empresa(p_empresa)
     and p_area = any(coalesce(public.minhas_areas(), '{}'))
$$;

-- Escritório padrão nas inserções
alter table public.empresas alter column escritorio_id set default public.meu_escritorio();

-- ---------------------------------------------------------------------
-- Regras de integridade (gatilhos)
-- ---------------------------------------------------------------------

-- Responsáveis precisam ser do mesmo escritório, ativos e ter a área correspondente
create or replace function public.validar_empresa()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  new.atualizado_em := now();
  for r in select * from (values ('fiscal', new.resp_fiscal_id),
                                 ('contabil', new.resp_contabil_id),
                                 ('dp', new.resp_dp_id)) as t(area, membro)
  loop
    if r.membro is not null and not exists (
      select 1 from public.membros m
      where m.id = r.membro and m.escritorio_id = new.escritorio_id
        and (r.area = any(m.areas) or m.papel = 'gestor')
    ) then
      raise exception 'O responsável escolhido não pertence a esta área ou a este escritório.'
        using errcode = 'P0001';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_validar_empresa on public.empresas;
create trigger trg_validar_empresa before insert or update on public.empresas
for each row execute function public.validar_empresa();

-- Vínculo membro x empresa só dentro do mesmo escritório
create or replace function public.validar_membro_empresa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select escritorio_id from public.membros where id = new.membro_id)
     is distinct from (select escritorio_id from public.empresas where id = new.empresa_id) then
    raise exception 'Empresa e usuário são de escritórios diferentes.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_validar_membro_empresa on public.membro_empresas;
create trigger trg_validar_membro_empresa before insert or update on public.membro_empresas
for each row execute function public.validar_membro_empresa();

-- Proteções na tabela de membros:
--   * ninguém troca o próprio escritório, e-mail ou id;
--   * o escritório nunca pode ficar sem um Gestor ativo.
create or replace function public.proteger_membros()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_esc uuid;
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.escritorio_id <> old.escritorio_id or new.email <> old.email then
      raise exception 'Não é permitido alterar escritório, e-mail ou identificador do usuário.'
        using errcode = 'P0001';
    end if;
    v_esc := old.escritorio_id;
  else
    v_esc := old.escritorio_id;
  end if;

  if (tg_op = 'DELETE' or new.papel <> 'gestor' or not new.ativo)
     and old.papel = 'gestor' and old.ativo
     and not exists (select 1 from public.membros
                     where escritorio_id = v_esc and papel = 'gestor' and ativo and id <> old.id)
  then
    raise exception 'O escritório precisa ter pelo menos um Gestor ativo.' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists trg_proteger_membros on public.membros;
create trigger trg_proteger_membros before update or delete on public.membros
for each row execute function public.proteger_membros();

-- Quando uma área é removida de um usuário, ele deixa de ser responsável por ela
create or replace function public.limpar_responsaveis()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not ('fiscal' = any(new.areas)) or not new.ativo then
    update public.empresas set resp_fiscal_id = null where resp_fiscal_id = new.id;
  end if;
  if not ('contabil' = any(new.areas)) or not new.ativo then
    update public.empresas set resp_contabil_id = null where resp_contabil_id = new.id;
  end if;
  if not ('dp' = any(new.areas)) or not new.ativo then
    update public.empresas set resp_dp_id = null where resp_dp_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_limpar_responsaveis on public.membros;
create trigger trg_limpar_responsaveis after update of areas, ativo, papel on public.membros
for each row when (new.papel = 'usuario')
execute function public.limpar_responsaveis();

-- ---------------------------------------------------------------------
-- Regras de acesso (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.escritorios     enable row level security;
alter table public.membros         enable row level security;
alter table public.empresas        enable row level security;
alter table public.membro_empresas enable row level security;

-- Escritórios: cada um vê apenas o seu; só Gestor altera.
drop policy if exists escritorios_select on public.escritorios;
create policy escritorios_select on public.escritorios for select to authenticated
  using (id = public.meu_escritorio());
drop policy if exists escritorios_update on public.escritorios;
create policy escritorios_update on public.escritorios for update to authenticated
  using (id = public.meu_escritorio() and public.sou_gestor())
  with check (id = public.meu_escritorio() and public.sou_gestor());

-- Membros: todos do escritório veem a equipe (nomes); só Gestor altera.
-- (Criação de usuários é feita pela função segura "admin-usuarios".)
drop policy if exists membros_select on public.membros;
create policy membros_select on public.membros for select to authenticated
  using (escritorio_id = public.meu_escritorio() or id = auth.uid());
drop policy if exists membros_update on public.membros;
create policy membros_update on public.membros for update to authenticated
  using (escritorio_id = public.meu_escritorio() and public.sou_gestor())
  with check (escritorio_id = public.meu_escritorio() and public.sou_gestor());

-- Empresas: Gestor faz tudo; usuário só lê as que atende.
drop policy if exists empresas_select on public.empresas;
create policy empresas_select on public.empresas for select to authenticated
  using (escritorio_id = public.meu_escritorio() and public.posso_ver_empresa(id));
drop policy if exists empresas_insert on public.empresas;
create policy empresas_insert on public.empresas for insert to authenticated
  with check (escritorio_id = public.meu_escritorio() and public.sou_gestor());
drop policy if exists empresas_update on public.empresas;
create policy empresas_update on public.empresas for update to authenticated
  using (escritorio_id = public.meu_escritorio() and public.sou_gestor())
  with check (escritorio_id = public.meu_escritorio() and public.sou_gestor());
drop policy if exists empresas_delete on public.empresas;
create policy empresas_delete on public.empresas for delete to authenticated
  using (escritorio_id = public.meu_escritorio() and public.sou_gestor());

-- Vínculos usuário x empresa: Gestor gerencia; usuário vê os seus.
drop policy if exists me_select on public.membro_empresas;
create policy me_select on public.membro_empresas for select to authenticated
  using (membro_id = auth.uid()
         or (public.sou_gestor() and exists (select 1 from public.membros m
              where m.id = membro_id and m.escritorio_id = public.meu_escritorio())));
drop policy if exists me_insert on public.membro_empresas;
create policy me_insert on public.membro_empresas for insert to authenticated
  with check (public.sou_gestor() and exists (select 1 from public.membros m
              where m.id = membro_id and m.escritorio_id = public.meu_escritorio()));
drop policy if exists me_delete on public.membro_empresas;
create policy me_delete on public.membro_empresas for delete to authenticated
  using (public.sou_gestor() and exists (select 1 from public.membros m
         where m.id = membro_id and m.escritorio_id = public.meu_escritorio()));

-- Permissões de tabela (as regras acima filtram as linhas)
grant select, update on public.escritorios to authenticated;
grant select, update on public.membros to authenticated;
grant select, insert, update, delete on public.empresas to authenticated;
grant select, insert, delete on public.membro_empresas to authenticated;
revoke all on public.escritorios, public.membros, public.empresas, public.membro_empresas from anon;

-- ---------------------------------------------------------------------
-- Ações especiais (chamadas pelo app)
-- ---------------------------------------------------------------------

-- Cria o escritório e torna quem chamou o seu Gestor.
create or replace function public.criar_escritorio(p_nome text, p_cnpj text, p_nome_gestor text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar conectado.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.membros where id = auth.uid()) then
    raise exception 'Este usuário já pertence a um escritório.' using errcode = 'P0001';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.escritorios (nome, cnpj) values (trim(p_nome), nullif(trim(p_cnpj), ''))
  returning id into v_id;
  insert into public.membros (id, escritorio_id, nome, email, papel, areas, todas_empresas)
  values (auth.uid(), v_id, trim(p_nome_gestor), v_email, 'gestor',
          array['fiscal','contabil','dp'], true);
  return v_id;
end $$;

-- Usuário altera o próprio nome
create or replace function public.atualizar_meu_nome(p_nome text)
returns void language sql security definer set search_path = public as $$
  update public.membros set nome = trim(p_nome)
  where id = auth.uid() and length(trim(p_nome)) > 0
$$;

-- Após trocar a senha provisória
create or replace function public.senha_trocada()
returns void language sql security definer set search_path = public as $$
  update public.membros set trocar_senha = false where id = auth.uid()
$$;

-- Define a lista de empresas de um usuário (substitui a anterior)
create or replace function public.definir_empresas_membro(p_membro uuid, p_empresas uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_gestor() or not exists (
    select 1 from public.membros where id = p_membro and escritorio_id = public.meu_escritorio()) then
    raise exception 'Apenas o Gestor pode fazer isso.' using errcode = '42501';
  end if;
  delete from public.membro_empresas where membro_id = p_membro;
  insert into public.membro_empresas (membro_id, empresa_id)
  select p_membro, e.id from public.empresas e
  where e.id = any(coalesce(p_empresas, '{}')) and e.escritorio_id = public.meu_escritorio();
end $$;

-- Transfere responsabilidades e empresas de uma pessoa para outra
-- (férias, desligamento). Só transfere as áreas que o destino possui.
create or replace function public.transferir_responsabilidades(p_de uuid, p_para uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_esc uuid := public.meu_escritorio(); v_areas text[]; v_total integer := 0; v_n integer;
begin
  if not public.sou_gestor() then
    raise exception 'Apenas o Gestor pode transferir responsabilidades.' using errcode = '42501';
  end if;
  if p_de = p_para then
    raise exception 'Escolha pessoas diferentes.' using errcode = 'P0001';
  end if;
  select areas into v_areas from public.membros
   where id = p_para and escritorio_id = v_esc and ativo;
  if v_areas is null or not exists (select 1 from public.membros where id = p_de and escritorio_id = v_esc) then
    raise exception 'Usuário não encontrado ou inativo.' using errcode = 'P0001';
  end if;

  if 'fiscal' = any(v_areas) then
    update public.empresas set resp_fiscal_id = p_para where resp_fiscal_id = p_de and escritorio_id = v_esc;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;
  if 'contabil' = any(v_areas) then
    update public.empresas set resp_contabil_id = p_para where resp_contabil_id = p_de and escritorio_id = v_esc;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;
  if 'dp' = any(v_areas) then
    update public.empresas set resp_dp_id = p_para where resp_dp_id = p_de and escritorio_id = v_esc;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;

  insert into public.membro_empresas (membro_id, empresa_id)
  select p_para, empresa_id from public.membro_empresas where membro_id = p_de
  on conflict do nothing;

  return v_total;
end $$;

revoke execute on function public.criar_escritorio(text,text,text) from anon, public;
revoke execute on function public.atualizar_meu_nome(text) from anon, public;
revoke execute on function public.senha_trocada() from anon, public;
revoke execute on function public.definir_empresas_membro(uuid,uuid[]) from anon, public;
revoke execute on function public.transferir_responsabilidades(uuid,uuid) from anon, public;
grant execute on function public.criar_escritorio(text,text,text) to authenticated;
grant execute on function public.atualizar_meu_nome(text) to authenticated;
grant execute on function public.senha_trocada() to authenticated;
grant execute on function public.definir_empresas_membro(uuid,uuid[]) to authenticated;
grant execute on function public.transferir_responsabilidades(uuid,uuid) to authenticated;

-- Atualização em tempo real (outras telas veem mudanças sem reiniciar)
do $$ begin
  begin alter publication supabase_realtime add table public.empresas; exception when others then null; end;
  begin alter publication supabase_realtime add table public.membros;  exception when others then null; end;
  begin alter publication supabase_realtime add table public.membro_empresas; exception when others then null; end;
  begin alter publication supabase_realtime add table public.escritorios; exception when others then null; end;
end $$;

-- ===== migrations/002_importacao.sql =====
-- =====================================================================
-- Gestão Contábil — Etapa 1 (complemento): importação de planilha
--   * Código interno da empresa (o mesmo do sistema contábil do escritório)
--   * Empresas podem entrar com cadastro incompleto (sem CNPJ, UF etc.)
--     e ficam sinalizadas até serem completadas.
--   * Função de importação que cria ou atualiza pelo código (não duplica).
-- =====================================================================

alter table public.empresas add column if not exists codigo text;
create unique index if not exists empresas_codigo_unico
  on public.empresas (escritorio_id, codigo) where codigo is not null;

alter table public.empresas alter column cnpj drop not null;
alter table public.empresas alter column regime drop not null;
alter table public.empresas alter column uf drop not null;
alter table public.empresas alter column municipio drop not null;

alter table public.empresas drop column if exists cadastro_completo;
alter table public.empresas add column cadastro_completo boolean generated always as (
  cnpj is not null and regime is not null and uf is not null
  and municipio is not null and cardinality(atividades) > 0
) stored;

-- Importa/atualiza empresas a partir de uma lista (JSON) montada pelo app.
-- Cada item: { codigo, razao_social, cnpj?, regime?, resp_fiscal_id?, resp_contabil_id?, resp_dp_id? }
-- Campos vazios não apagam o que já estava cadastrado.
create or replace function public.importar_empresas(p_itens jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_esc uuid := public.meu_escritorio();
  v_item jsonb;
  v_id uuid;
  v_codigo text;
  v_regime text;
  v_cnpj text;
  v_criadas int := 0;
  v_atualizadas int := 0;
begin
  if not public.sou_gestor() then
    raise exception 'Apenas o Gestor pode importar empresas.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 5000 then
    raise exception 'Lista de empresas inválida.' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_codigo := nullif(trim(v_item->>'codigo'), '');
    if v_codigo is null or nullif(trim(v_item->>'razao_social'), '') is null then
      raise exception 'Há linhas sem código ou sem nome da empresa.' using errcode = 'P0001';
    end if;
    v_regime := nullif(v_item->>'regime', '');
    if v_regime is not null and v_regime not in ('mei','simples','presumido','real') then
      v_regime := null;
    end if;

    v_cnpj := nullif(upper(regexp_replace(coalesce(v_item->>'cnpj',''), '[^0-9A-Za-z]', '', 'g')), '');
    if v_cnpj is not null and v_cnpj !~ '^[0-9A-Z]{12}[0-9]{2}$' then
      v_cnpj := null;
    end if;

    select id into v_id from public.empresas where escritorio_id = v_esc and codigo = v_codigo;
    if v_id is null then
      insert into public.empresas (escritorio_id, codigo, razao_social, cnpj, regime,
                                   resp_fiscal_id, resp_contabil_id, resp_dp_id)
      values (v_esc, v_codigo, trim(v_item->>'razao_social'), v_cnpj, v_regime,
              nullif(v_item->>'resp_fiscal_id','')::uuid,
              nullif(v_item->>'resp_contabil_id','')::uuid,
              nullif(v_item->>'resp_dp_id','')::uuid);
      v_criadas := v_criadas + 1;
    else
      update public.empresas set
        razao_social     = trim(v_item->>'razao_social'),
        cnpj             = coalesce(v_cnpj, cnpj),
        regime           = coalesce(v_regime, regime),
        resp_fiscal_id   = coalesce(nullif(v_item->>'resp_fiscal_id','')::uuid, resp_fiscal_id),
        resp_contabil_id = coalesce(nullif(v_item->>'resp_contabil_id','')::uuid, resp_contabil_id),
        resp_dp_id       = coalesce(nullif(v_item->>'resp_dp_id','')::uuid, resp_dp_id)
      where id = v_id;
      v_atualizadas := v_atualizadas + 1;
    end if;
  end loop;

  return jsonb_build_object('criadas', v_criadas, 'atualizadas', v_atualizadas);
end $$;

revoke execute on function public.importar_empresas(jsonb) from anon, public;
grant execute on function public.importar_empresas(jsonb) to authenticated;

-- ===== migrations/003_ajustes.sql =====
-- =====================================================================
-- Ajuste: permitir excluir um escritório inteiro (a regra "precisa ter um
-- Gestor ativo" só vale enquanto o escritório existe).
-- =====================================================================
create or replace function public.proteger_membros()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.escritorios where id = old.escritorio_id) then
    return old; -- o escritório inteiro está sendo excluído
  end if;

  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.escritorio_id <> old.escritorio_id or new.email <> old.email then
      raise exception 'Não é permitido alterar escritório, e-mail ou identificador do usuário.'
        using errcode = 'P0001';
    end if;
  end if;

  if (tg_op = 'DELETE' or new.papel <> 'gestor' or not new.ativo)
     and old.papel = 'gestor' and old.ativo
     and not exists (select 1 from public.membros
                     where escritorio_id = old.escritorio_id and papel = 'gestor' and ativo and id <> old.id)
  then
    raise exception 'O escritório precisa ter pelo menos um Gestor ativo.' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- ===== migrations/004_modelos.sql =====
-- =====================================================================
-- Gestão Contábil — Etapa 2: modelos de checklist
--   * Itens de checklist por área, com periodicidade, regra de vencimento e
--     regras de aplicação (regime, atividade, funcionários) — tudo editável.
--   * Feriados nacionais e cálculo de vencimento (dia fixo, N-ésimo dia útil,
--     último dia útil), usados também na geração mensal (Etapa 3).
--   * Exceções por empresa (tirar ou acrescentar um item).
--   * Modelos iniciais criados automaticamente para cada escritório.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.modelos_checklist (
  id                        uuid primary key default gen_random_uuid(),
  escritorio_id             uuid not null default public.meu_escritorio()
                            references public.escritorios(id) on delete cascade,
  codigo_padrao             text,  -- identifica os itens que vieram prontos (para restaurar)
  nome                      text not null check (length(trim(nome)) > 0),
  descricao                 text,
  area                      text not null check (area in ('fiscal','contabil','dp')),
  periodicidade             text not null check (periodicidade in ('mensal','trimestral','anual')),
  tipo_vencimento           text not null default 'dia_fixo'
                            check (tipo_vencimento in ('dia_fixo','dia_util','ultimo_dia_util')),
  dia                       smallint,
  meses_apos                smallint not null default 1 check (meses_apos between -11 and 24),
  ajuste                    text not null default 'antecipa' check (ajuste in ('antecipa','posterga','nenhum')),
  regimes                   text[] not null default '{}'
                            check (regimes <@ array['mei','simples','presumido','real']),
  atividades                text[] not null default '{}'
                            check (atividades <@ array['comercio','servico','industria']),
  somente_com_funcionarios  boolean not null default false,
  ativo                     boolean not null default true,
  ordem                     integer not null default 0,
  criado_em                 timestamptz not null default now(),
  atualizado_em             timestamptz not null default now(),
  constraint dia_valido check (
    (tipo_vencimento = 'dia_fixo' and dia between 1 and 31) or
    (tipo_vencimento = 'dia_util' and dia between 1 and 22) or
    (tipo_vencimento = 'ultimo_dia_util')
  )
);
create index if not exists modelos_escritorio_idx on public.modelos_checklist(escritorio_id);
create unique index if not exists modelos_codigo_padrao_unico
  on public.modelos_checklist (escritorio_id, codigo_padrao) where codigo_padrao is not null;

-- Exceções: tirar um item que a regra aplicaria, ou acrescentar um que ela não aplicaria
create table if not exists public.empresa_item_excecoes (
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  modelo_id   uuid not null references public.modelos_checklist(id) on delete cascade,
  incluir     boolean not null,
  criado_por  uuid default auth.uid() references public.membros(id) on delete set null,
  criado_em   timestamptz not null default now(),
  primary key (empresa_id, modelo_id)
);
create index if not exists excecoes_modelo_idx on public.empresa_item_excecoes(modelo_id);

-- ---------------------------------------------------------------------
-- Calendário: feriados nacionais e dias úteis
-- (dias em que os bancos não abrem: inclui Carnaval e Corpus Christi)
-- ---------------------------------------------------------------------
create or replace function public.pascoa(p_ano int)
returns date language plpgsql immutable as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mes int; dia int;
begin
  -- Algoritmo de Meeus/Jones/Butcher
  a := p_ano % 19; b := p_ano / 100; c := p_ano % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  mes := (h + l - 7 * m + 114) / 31; dia := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(p_ano, mes, dia);
end $$;

create or replace function public.eh_feriado_nacional(p_dia date)
returns boolean language sql immutable as $$
  select to_char(p_dia, 'MM-DD') in ('01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25')
      or p_dia in (public.pascoa(extract(year from p_dia)::int) - 48,  -- segunda de Carnaval
                   public.pascoa(extract(year from p_dia)::int) - 47,  -- terça de Carnaval
                   public.pascoa(extract(year from p_dia)::int) - 2,   -- Sexta-feira Santa
                   public.pascoa(extract(year from p_dia)::int) + 60)  -- Corpus Christi
$$;

create or replace function public.eh_dia_util(p_dia date)
returns boolean language sql immutable as $$
  select extract(isodow from p_dia) < 6 and not public.eh_feriado_nacional(p_dia)
$$;

-- Calcula o vencimento de um item para uma competência (qualquer dia do mês da competência).
--   mensal: período = o mês da competência
--   trimestral: período = o trimestre que contém a competência
--   anual: período = o ano da competência
-- O mês do vencimento é o último mês do período + meses_apos.
create or replace function public.calcular_vencimento(
  p_periodicidade text, p_tipo text, p_dia int, p_meses_apos int, p_ajuste text, p_competencia date)
returns date language plpgsql immutable as $$
declare
  v_fim_periodo date;
  v_mes date;
  v_ultimo date;
  v_d date;
  v_n int := 0;
begin
  v_fim_periodo := case p_periodicidade
    when 'mensal' then date_trunc('month', p_competencia)::date
    when 'trimestral' then (date_trunc('quarter', p_competencia) + interval '2 months')::date
    when 'anual' then make_date(extract(year from p_competencia)::int, 12, 1)
  end;
  v_mes := (v_fim_periodo + make_interval(months => p_meses_apos))::date;
  v_ultimo := (v_mes + interval '1 month - 1 day')::date;

  if p_tipo = 'ultimo_dia_util' then
    v_d := v_ultimo;
    while not public.eh_dia_util(v_d) loop v_d := v_d - 1; end loop;
    return v_d;
  end if;

  if p_tipo = 'dia_util' then
    v_d := v_mes;
    loop
      if public.eh_dia_util(v_d) then
        v_n := v_n + 1;
        exit when v_n = p_dia;
      end if;
      exit when v_d = v_ultimo;
      v_d := v_d + 1;
    end loop;
    -- se o mês não tiver tantos dias úteis, fica o último dia útil
    while not public.eh_dia_util(v_d) loop v_d := v_d - 1; end loop;
    return v_d;
  end if;

  -- dia fixo (31 = último dia do mês)
  v_d := least(v_mes + (p_dia - 1), v_ultimo);
  if p_ajuste = 'antecipa' then
    while not public.eh_dia_util(v_d) loop v_d := v_d - 1; end loop;
  elsif p_ajuste = 'posterga' then
    while not public.eh_dia_util(v_d) loop v_d := v_d + 1; end loop;
  end if;
  return v_d;
end $$;

create or replace function public.vencimento_modelo(p_modelo public.modelos_checklist, p_competencia date)
returns date language sql immutable as $$
  select public.calcular_vencimento(p_modelo.periodicidade, p_modelo.tipo_vencimento, p_modelo.dia,
                                    p_modelo.meses_apos, p_modelo.ajuste, p_competencia)
$$;

-- O item se aplica a esta empresa pela regra? (sem considerar exceções)
create or replace function public.modelo_aplica_empresa(p_modelo public.modelos_checklist, p_empresa public.empresas)
returns boolean language sql immutable as $$
  select (cardinality(p_modelo.regimes) = 0 or p_empresa.regime = any(p_modelo.regimes))
     and (cardinality(p_modelo.atividades) = 0 or p_modelo.atividades && p_empresa.atividades)
     and (not p_modelo.somente_com_funcionarios or p_empresa.possui_funcionarios)
$$;

-- ---------------------------------------------------------------------
-- Integridade
-- ---------------------------------------------------------------------
create or replace function public.validar_modelo()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  if new.tipo_vencimento = 'ultimo_dia_util' then new.dia := null; end if;
  new.nome := trim(new.nome);
  return new;
end $$;
drop trigger if exists trg_validar_modelo on public.modelos_checklist;
create trigger trg_validar_modelo before insert or update on public.modelos_checklist
for each row execute function public.validar_modelo();

create or replace function public.validar_excecao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select escritorio_id from public.empresas where id = new.empresa_id)
     is distinct from (select escritorio_id from public.modelos_checklist where id = new.modelo_id) then
    raise exception 'Empresa e item são de escritórios diferentes.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_validar_excecao on public.empresa_item_excecoes;
create trigger trg_validar_excecao before insert or update on public.empresa_item_excecoes
for each row execute function public.validar_excecao();

-- ---------------------------------------------------------------------
-- Regras de acesso
-- ---------------------------------------------------------------------
alter table public.modelos_checklist enable row level security;
alter table public.empresa_item_excecoes enable row level security;

-- Modelos: Gestor vê e altera todos; usuário só vê os das suas áreas.
drop policy if exists modelos_select on public.modelos_checklist;
create policy modelos_select on public.modelos_checklist for select to authenticated
  using (escritorio_id = public.meu_escritorio()
         and (public.sou_gestor() or area = any(coalesce(public.minhas_areas(), '{}'))));
drop policy if exists modelos_insert on public.modelos_checklist;
create policy modelos_insert on public.modelos_checklist for insert to authenticated
  with check (escritorio_id = public.meu_escritorio() and public.sou_gestor());
drop policy if exists modelos_update on public.modelos_checklist;
create policy modelos_update on public.modelos_checklist for update to authenticated
  using (escritorio_id = public.meu_escritorio() and public.sou_gestor())
  with check (escritorio_id = public.meu_escritorio() and public.sou_gestor());
drop policy if exists modelos_delete on public.modelos_checklist;
create policy modelos_delete on public.modelos_checklist for delete to authenticated
  using (escritorio_id = public.meu_escritorio() and public.sou_gestor());

-- Exceções: quem vê a empresa vê as exceções; só Gestor altera.
drop policy if exists excecoes_select on public.empresa_item_excecoes;
create policy excecoes_select on public.empresa_item_excecoes for select to authenticated
  using (public.posso_ver_empresa(empresa_id));
drop policy if exists excecoes_insert on public.empresa_item_excecoes;
create policy excecoes_insert on public.empresa_item_excecoes for insert to authenticated
  with check (public.sou_gestor() and public.posso_ver_empresa(empresa_id));
drop policy if exists excecoes_update on public.empresa_item_excecoes;
create policy excecoes_update on public.empresa_item_excecoes for update to authenticated
  using (public.sou_gestor() and public.posso_ver_empresa(empresa_id))
  with check (public.sou_gestor() and public.posso_ver_empresa(empresa_id));
drop policy if exists excecoes_delete on public.empresa_item_excecoes;
create policy excecoes_delete on public.empresa_item_excecoes for delete to authenticated
  using (public.sou_gestor() and public.posso_ver_empresa(empresa_id));

grant select, insert, update, delete on public.modelos_checklist to authenticated;
grant select, insert, update, delete on public.empresa_item_excecoes to authenticated;
revoke all on public.modelos_checklist, public.empresa_item_excecoes from anon;

-- ---------------------------------------------------------------------
-- Obrigações de cada empresa (regra + exceções). Respeita as regras de acesso
-- de quem consulta (security_invoker): cada um só vê o que pode.
-- ---------------------------------------------------------------------
create or replace view public.empresa_obrigacoes with (security_invoker = true) as
select
  e.id as empresa_id,
  m.id as modelo_id,
  m.area,
  m.nome,
  m.periodicidade,
  m.ordem,
  m.ativo as modelo_ativo,
  public.modelo_aplica_empresa(m, e) as pela_regra,
  x.incluir as excecao,
  (m.ativo and coalesce(x.incluir, public.modelo_aplica_empresa(m, e))) as aplicada,
  e.ativa as empresa_ativa
from public.empresas e
join public.modelos_checklist m on m.escritorio_id = e.escritorio_id
left join public.empresa_item_excecoes x on x.empresa_id = e.id and x.modelo_id = m.id;

grant select on public.empresa_obrigacoes to authenticated;

-- Prévia do vencimento (usada na tela de edição do modelo)
create or replace function public.previa_vencimentos(
  p_periodicidade text, p_tipo text, p_dia int, p_meses_apos int, p_ajuste text, p_competencias date[])
returns date[] language sql stable as $$
  select array_agg(public.calcular_vencimento(p_periodicidade, p_tipo, p_dia, p_meses_apos, p_ajuste, c) order by o)
  from unnest(p_competencias) with ordinality as t(c, o)
$$;
grant execute on function public.previa_vencimentos(text,text,int,int,text,date[]) to authenticated;

-- ---------------------------------------------------------------------
-- Modelos iniciais (prazos de referência — o Gestor confere e ajusta)
-- ---------------------------------------------------------------------
create or replace function public.criar_modelos_padrao(p_escritorio uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  insert into public.modelos_checklist
    (escritorio_id, codigo_padrao, ordem, area, nome, descricao, periodicidade, tipo_vencimento, dia,
     meses_apos, ajuste, regimes, atividades, somente_com_funcionarios, ativo)
  select p_escritorio, t.* from (values
    -- FISCAL
    ('das', 10, 'fiscal', 'Apuração e guia do DAS', 'Simples Nacional: apurar no PGDAS-D e emitir a guia.', 'mensal', 'dia_fixo', 20, 1, 'posterga', array['simples'], array[]::text[], false, true),
    ('das_mei', 20, 'fiscal', 'Guia do DAS-MEI', null, 'mensal', 'dia_fixo', 20, 1, 'posterga', array['mei'], array[]::text[], false, true),
    ('dctfweb', 30, 'fiscal', 'DCTFWeb', 'Débitos previdenciários e, no Presumido/Real, demais tributos federais (MIT).', 'mensal', 'ultimo_dia_util', null, 1, 'antecipa', array['simples','presumido','real'], array[]::text[], false, true),
    ('reinf', 40, 'fiscal', 'EFD-Reinf', null, 'mensal', 'dia_fixo', 15, 1, 'antecipa', array['simples','presumido','real'], array[]::text[], false, true),
    ('efd_icms_ipi', 50, 'fiscal', 'EFD ICMS/IPI (SPED Fiscal)', 'O prazo varia conforme o estado — ajuste o dia.', 'mensal', 'dia_fixo', 20, 1, 'antecipa', array['presumido','real'], array['comercio','industria'], false, true),
    ('efd_contribuicoes', 60, 'fiscal', 'EFD Contribuições', null, 'mensal', 'dia_util', 10, 2, 'antecipa', array['presumido','real'], array[]::text[], false, true),
    ('icms', 70, 'fiscal', 'Apuração do ICMS', 'O prazo varia conforme o estado — ajuste o dia.', 'mensal', 'dia_fixo', 10, 1, 'antecipa', array['presumido','real'], array['comercio','industria'], false, true),
    ('iss', 80, 'fiscal', 'Apuração do ISS', 'O prazo varia conforme o município — ajuste o dia.', 'mensal', 'dia_fixo', 10, 1, 'antecipa', array['presumido','real'], array['servico'], false, true),
    ('pis_cofins', 90, 'fiscal', 'Apuração de PIS/COFINS', null, 'mensal', 'dia_fixo', 25, 1, 'antecipa', array['presumido','real'], array[]::text[], false, true),
    ('irpj_csll', 100, 'fiscal', 'Apuração de IRPJ/CSLL', 'Trimestral. No Lucro Real por estimativa mensal, mude a periodicidade para mensal.', 'trimestral', 'ultimo_dia_util', null, 1, 'antecipa', array['presumido','real'], array[]::text[], false, true),
    ('destda', 110, 'fiscal', 'DeSTDA', 'Simples Nacional com ICMS-ST, antecipação ou diferencial de alíquota.', 'mensal', 'dia_fixo', 28, 1, 'antecipa', array['simples'], array['comercio','industria'], false, true),
    ('defis', 120, 'fiscal', 'DEFIS', 'Declaração anual do Simples Nacional.', 'anual', 'dia_fixo', 31, 3, 'antecipa', array['simples'], array[]::text[], false, true),
    ('dasn_simei', 130, 'fiscal', 'DASN-SIMEI', 'Declaração anual do MEI.', 'anual', 'dia_fixo', 31, 5, 'antecipa', array['mei'], array[]::text[], false, true),
    ('cbs_ibs', 140, 'fiscal', 'Reforma Tributária: CBS/IBS', 'Em 2026 a CBS e o IBS estão em fase de testes. Ative e ajuste quando as obrigações estiverem definidas.', 'mensal', 'dia_fixo', 20, 1, 'antecipa', array[]::text[], array[]::text[], false, false),
    -- CONTÁBIL
    ('conciliacao_bancaria', 210, 'contabil', 'Conciliação bancária', null, 'mensal', 'dia_fixo', 10, 1, 'antecipa', array['simples','presumido','real'], array[]::text[], false, true),
    ('lancamentos', 220, 'contabil', 'Lançamentos contábeis', null, 'mensal', 'dia_fixo', 15, 1, 'antecipa', array['simples','presumido','real'], array[]::text[], false, true),
    ('balancete', 230, 'contabil', 'Fechamento do balancete', null, 'mensal', 'dia_fixo', 20, 1, 'antecipa', array['simples','presumido','real'], array[]::text[], false, true),
    ('encerramento', 240, 'contabil', 'Encerramento do exercício (Balanço e DRE)', null, 'anual', 'dia_fixo', 31, 3, 'antecipa', array['simples','presumido','real'], array[]::text[], false, true),
    ('ecd', 250, 'contabil', 'ECD', 'Escrituração Contábil Digital (SPED Contábil).', 'anual', 'ultimo_dia_util', null, 6, 'antecipa', array['presumido','real'], array[]::text[], false, true),
    ('ecf', 260, 'contabil', 'ECF', 'Escrituração Contábil Fiscal.', 'anual', 'ultimo_dia_util', null, 7, 'antecipa', array['presumido','real'], array[]::text[], false, true),
    -- DEPARTAMENTO PESSOAL
    ('folha', 310, 'dp', 'Folha de pagamento', 'Pagamento dos salários até o 5º dia útil.', 'mensal', 'dia_util', 5, 1, 'antecipa', array[]::text[], array[]::text[], true, true),
    ('esocial', 320, 'dp', 'eSocial – fechamento dos eventos periódicos', null, 'mensal', 'dia_fixo', 15, 1, 'antecipa', array[]::text[], array[]::text[], true, true),
    ('fgts', 330, 'dp', 'FGTS Digital – guia', null, 'mensal', 'dia_fixo', 20, 1, 'antecipa', array[]::text[], array[]::text[], true, true),
    ('decimo_terceiro_1', 340, 'dp', '13º salário – 1ª parcela', null, 'anual', 'dia_fixo', 30, -1, 'antecipa', array[]::text[], array[]::text[], true, true),
    ('decimo_terceiro_2', 350, 'dp', '13º salário – 2ª parcela', null, 'anual', 'dia_fixo', 20, 0, 'antecipa', array[]::text[], array[]::text[], true, true),
    ('informes_rendimentos', 360, 'dp', 'Informes de rendimentos', null, 'anual', 'ultimo_dia_util', null, 2, 'antecipa', array[]::text[], array[]::text[], true, true)
  ) as t(codigo, ordem, area, nome, descricao, periodicidade, tipo, dia, meses_apos, ajuste, regimes, atividades, func, ativo)
  on conflict (escritorio_id, codigo_padrao) where codigo_padrao is not null do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.criar_modelos_padrao(uuid) from anon, public, authenticated;

-- O Gestor pode recolocar itens padrão que tenha excluído
create or replace function public.restaurar_modelos_padrao()
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_gestor() then
    raise exception 'Apenas o Gestor pode fazer isso.' using errcode = '42501';
  end if;
  return public.criar_modelos_padrao(public.meu_escritorio());
end $$;
revoke execute on function public.restaurar_modelos_padrao() from anon, public;
grant execute on function public.restaurar_modelos_padrao() to authenticated;

-- Novos escritórios já nascem com os modelos
create or replace function public.criar_escritorio(p_nome text, p_cnpj text, p_nome_gestor text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar conectado.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.membros where id = auth.uid()) then
    raise exception 'Este usuário já pertence a um escritório.' using errcode = 'P0001';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.escritorios (nome, cnpj) values (trim(p_nome), nullif(trim(p_cnpj), ''))
  returning id into v_id;
  insert into public.membros (id, escritorio_id, nome, email, papel, areas, todas_empresas)
  values (auth.uid(), v_id, trim(p_nome_gestor), v_email, 'gestor',
          array['fiscal','contabil','dp'], true);
  perform public.criar_modelos_padrao(v_id);
  return v_id;
end $$;

-- Escritórios que já existiam recebem os modelos (só uma vez: depois o Gestor manda)
do $$
declare r record;
begin
  for r in select e.id from public.escritorios e
           where not exists (select 1 from public.modelos_checklist m where m.escritorio_id = e.id)
  loop
    perform public.criar_modelos_padrao(r.id);
  end loop;
end $$;

-- Tempo real
do $$ begin
  begin alter publication supabase_realtime add table public.modelos_checklist; exception when others then null; end;
  begin alter publication supabase_realtime add table public.empresa_item_excecoes; exception when others then null; end;
end $$;
