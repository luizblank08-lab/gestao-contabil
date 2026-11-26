-- =====================================================================
-- Gestão Contábil — Etapa 3: checklists do mês
--   * Tarefas geradas por competência para cada empresa ativa, a partir dos
--     modelos (regra + exceções), já com o responsável da área na empresa.
--   * Situação (pendente / feito / não se aplica), data de conclusão,
--     observação, anexos e histórico de quem fez o quê e quando.
--   * Geração automática diária (pg_cron) + botão "Gerar agora".
--   * Transferência de tarefas em aberto junto com as responsabilidades.
-- =====================================================================

-- A partir de qual competência o escritório usa os checklists
-- (evita gerar meses antigos cheios de "atrasados" no primeiro uso)
alter table public.escritorios
  add column if not exists inicio_checklists date not null
  default date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;

create or replace function public.hoje_sp()
returns date language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.tarefas (
  id              uuid primary key default gen_random_uuid(),
  escritorio_id   uuid not null references public.escritorios(id) on delete cascade,
  empresa_id      uuid not null references public.empresas(id) on delete cascade,
  modelo_id       uuid references public.modelos_checklist(id) on delete set null,
  competencia     date not null,  -- mês em que a tarefa foi gerada (dia 1)
  periodo_ref     date not null,  -- mês (mensal), início do trimestre ou início do ano
  periodicidade   text not null check (periodicidade in ('mensal','trimestral','anual')),
  area            text not null check (area in ('fiscal','contabil','dp')),
  nome            text not null,
  vencimento      date not null,
  responsavel_id  uuid references public.membros(id) on delete set null,
  status          text not null default 'pendente' check (status in ('pendente','feito','nao_se_aplica')),
  concluido_em    date,
  concluido_por   uuid references public.membros(id) on delete set null,
  observacao      text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid references public.membros(id) on delete set null,
  constraint tarefa_unica unique (empresa_id, modelo_id, periodo_ref)
);
create index if not exists tarefas_comp_idx on public.tarefas(escritorio_id, competencia);
create index if not exists tarefas_resp_idx on public.tarefas(responsavel_id, status);
create index if not exists tarefas_empresa_idx on public.tarefas(empresa_id);

create table if not exists public.tarefa_historico (
  id         bigint generated always as identity primary key,
  tarefa_id  uuid not null references public.tarefas(id) on delete cascade,
  membro_id  uuid references public.membros(id) on delete set null,
  acao       text not null,
  detalhe    text,
  criado_em  timestamptz not null default now()
);
create index if not exists historico_tarefa_idx on public.tarefa_historico(tarefa_id, criado_em);

create table if not exists public.tarefa_anexos (
  id            uuid primary key default gen_random_uuid(),
  tarefa_id     uuid not null references public.tarefas(id) on delete cascade,
  caminho       text not null unique,  -- caminho no armazenamento: <tarefa_id>/<arquivo>
  nome_arquivo  text not null,
  tamanho       bigint,
  tipo          text,
  enviado_por   uuid default auth.uid() references public.membros(id) on delete set null,
  criado_em     timestamptz not null default now()
);
create index if not exists anexos_tarefa_idx on public.tarefa_anexos(tarefa_id);

-- ---------------------------------------------------------------------
-- Quem pode ver/mexer numa tarefa
-- ---------------------------------------------------------------------
create or replace function public.posso_ver_tarefa(p_tarefa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tarefas t
    where t.id = p_tarefa
      and t.escritorio_id = public.meu_escritorio()
      and (public.sou_gestor() or public.posso_area_empresa(t.area, t.empresa_id))
  )
$$;

-- Converte texto em uuid sem erro (para caminhos de arquivo)
create or replace function public.uuid_ou_nulo(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- ---------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------
-- Usuário só altera situação, data de conclusão e observação; Gestor também
-- pode trocar o responsável. Preenche quem/quando concluiu.
create or replace function public.antes_atualizar_tarefa()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_gestor boolean := public.sou_gestor();
begin
  if auth.uid() is not null then
    if new.escritorio_id <> old.escritorio_id or new.empresa_id <> old.empresa_id
       or new.modelo_id is distinct from old.modelo_id or new.competencia <> old.competencia
       or new.periodo_ref <> old.periodo_ref or new.area <> old.area or new.periodicidade <> old.periodicidade then
      raise exception 'Estes dados da tarefa não podem ser alterados.' using errcode = 'P0001';
    end if;
    if not v_gestor and (new.responsavel_id is distinct from old.responsavel_id
                         or new.vencimento <> old.vencimento or new.nome <> old.nome) then
      raise exception 'Apenas o Gestor pode alterar o responsável, o nome ou o vencimento.' using errcode = '42501';
    end if;
  end if;

  if new.status = 'feito' and old.status <> 'feito' then
    new.concluido_em := coalesce(new.concluido_em, public.hoje_sp());
    new.concluido_por := coalesce(auth.uid(), new.concluido_por);
  elsif new.status <> 'feito' then
    new.concluido_em := null;
    new.concluido_por := null;
  end if;
  if new.status = 'nao_se_aplica' and old.status <> 'nao_se_aplica' then
    new.concluido_por := auth.uid();
  end if;

  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;
drop trigger if exists trg_antes_atualizar_tarefa on public.tarefas;
create trigger trg_antes_atualizar_tarefa before update on public.tarefas
for each row execute function public.antes_atualizar_tarefa();

-- Histórico automático
create or replace function public.registrar_historico_tarefa()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rotulo constant jsonb := '{"pendente":"Pendente","feito":"Feito","nao_se_aplica":"Não se aplica"}';
begin
  if tg_op = 'INSERT' then
    insert into public.tarefa_historico (tarefa_id, membro_id, acao, detalhe)
    values (new.id, auth.uid(), 'criada', null);
    return new;
  end if;
  if new.status <> old.status then
    insert into public.tarefa_historico (tarefa_id, membro_id, acao, detalhe)
    values (new.id, auth.uid(), 'status', format('%s → %s', rotulo->>old.status, rotulo->>new.status));
  elsif new.concluido_em is distinct from old.concluido_em then
    insert into public.tarefa_historico (tarefa_id, membro_id, acao, detalhe)
    values (new.id, auth.uid(), 'data', coalesce(to_char(new.concluido_em, 'DD/MM/YYYY'), 'sem data'));
  end if;
  if new.observacao is distinct from old.observacao then
    insert into public.tarefa_historico (tarefa_id, membro_id, acao, detalhe)
    values (new.id, auth.uid(), 'observacao', left(coalesce(new.observacao, ''), 300));
  end if;
  if new.responsavel_id is distinct from old.responsavel_id then
    insert into public.tarefa_historico (tarefa_id, membro_id, acao, detalhe)
    values (new.id, auth.uid(), 'responsavel',
            coalesce((select nome from public.membros where id = new.responsavel_id), 'sem responsável'));
  end if;
  return new;
end $$;
drop trigger if exists trg_historico_tarefa on public.tarefas;
create trigger trg_historico_tarefa after insert or update on public.tarefas
for each row execute function public.registrar_historico_tarefa();

create or replace function public.registrar_historico_anexo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.tarefa_historico (tarefa_id, membro_id, acao, detalhe)
    values (new.tarefa_id, auth.uid(), 'anexo_incluido', new.nome_arquivo);
    return new;
  end if;
  if exists (select 1 from public.tarefas where id = old.tarefa_id) then
    insert into public.tarefa_historico (tarefa_id, membro_id, acao, detalhe)
    values (old.tarefa_id, auth.uid(), 'anexo_removido', old.nome_arquivo);
  end if;
  return old;
end $$;
drop trigger if exists trg_historico_anexo on public.tarefa_anexos;
create trigger trg_historico_anexo after insert or delete on public.tarefa_anexos
for each row execute function public.registrar_historico_anexo();

-- Quando o responsável de uma área muda na empresa, as tarefas em aberto acompanham
create or replace function public.responsavel_empresa_mudou()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.resp_fiscal_id is distinct from old.resp_fiscal_id then
    update public.tarefas set responsavel_id = new.resp_fiscal_id
    where empresa_id = new.id and area = 'fiscal' and status = 'pendente';
  end if;
  if new.resp_contabil_id is distinct from old.resp_contabil_id then
    update public.tarefas set responsavel_id = new.resp_contabil_id
    where empresa_id = new.id and area = 'contabil' and status = 'pendente';
  end if;
  if new.resp_dp_id is distinct from old.resp_dp_id then
    update public.tarefas set responsavel_id = new.resp_dp_id
    where empresa_id = new.id and area = 'dp' and status = 'pendente';
  end if;
  return new;
end $$;
drop trigger if exists trg_responsavel_empresa_mudou on public.empresas;
create trigger trg_responsavel_empresa_mudou after update of resp_fiscal_id, resp_contabil_id, resp_dp_id
on public.empresas for each row execute function public.responsavel_empresa_mudou();

-- ---------------------------------------------------------------------
-- Regras de acesso
-- ---------------------------------------------------------------------
alter table public.tarefas enable row level security;
alter table public.tarefa_historico enable row level security;
alter table public.tarefa_anexos enable row level security;

drop policy if exists tarefas_select on public.tarefas;
create policy tarefas_select on public.tarefas for select to authenticated
  using (escritorio_id = public.meu_escritorio()
         and (public.sou_gestor() or public.posso_area_empresa(area, empresa_id)));
drop policy if exists tarefas_update on public.tarefas;
create policy tarefas_update on public.tarefas for update to authenticated
  using (escritorio_id = public.meu_escritorio()
         and (public.sou_gestor() or public.posso_area_empresa(area, empresa_id)))
  with check (escritorio_id = public.meu_escritorio()
         and (public.sou_gestor() or public.posso_area_empresa(area, empresa_id)));
drop policy if exists tarefas_delete on public.tarefas;
create policy tarefas_delete on public.tarefas for delete to authenticated
  using (escritorio_id = public.meu_escritorio() and public.sou_gestor());
-- (inserção apenas pela função de geração)

drop policy if exists historico_select on public.tarefa_historico;
create policy historico_select on public.tarefa_historico for select to authenticated
  using (public.posso_ver_tarefa(tarefa_id));

drop policy if exists anexos_select on public.tarefa_anexos;
create policy anexos_select on public.tarefa_anexos for select to authenticated
  using (public.posso_ver_tarefa(tarefa_id));
drop policy if exists anexos_insert on public.tarefa_anexos;
create policy anexos_insert on public.tarefa_anexos for insert to authenticated
  with check (public.posso_ver_tarefa(tarefa_id) and enviado_por = auth.uid()
              and split_part(caminho, '/', 1) = tarefa_id::text);
drop policy if exists anexos_delete on public.tarefa_anexos;
create policy anexos_delete on public.tarefa_anexos for delete to authenticated
  using (public.posso_ver_tarefa(tarefa_id) and (enviado_por = auth.uid() or public.sou_gestor()));

grant select, update, delete on public.tarefas to authenticated;
grant select on public.tarefa_historico to authenticated;
grant select, insert, delete on public.tarefa_anexos to authenticated;
revoke all on public.tarefas, public.tarefa_historico, public.tarefa_anexos from anon;

-- ---------------------------------------------------------------------
-- Geração das tarefas de uma competência
--   mensal: toda competência
--   trimestral: no último mês do trimestre (03, 06, 09, 12)
--   anual: no mês anterior ao vencimento, se ele cair no próprio ano;
--          senão em dezembro (ex.: ECD do ano-base 2026 nasce em 12/2026)
-- Pode ser rodada várias vezes: só cria o que ainda não existe.
-- ---------------------------------------------------------------------
create or replace function public.gerar_tarefas(p_escritorio uuid, p_competencia date)
returns integer language plpgsql security definer set search_path = public as $$
declare
  c date := date_trunc('month', p_competencia)::date;
  mes int := extract(month from p_competencia)::int;
  v_n integer;
begin
  insert into public.tarefas (escritorio_id, empresa_id, modelo_id, competencia, periodo_ref, periodicidade,
                              area, nome, vencimento, responsavel_id)
  select e.escritorio_id, e.id, m.id, c,
         case m.periodicidade when 'mensal' then c
                              when 'trimestral' then date_trunc('quarter', c)::date
                              else date_trunc('year', c)::date end,
         m.periodicidade, m.area, m.nome,
         public.vencimento_modelo(m, c),
         case m.area when 'fiscal' then e.resp_fiscal_id when 'contabil' then e.resp_contabil_id else e.resp_dp_id end
  from public.empresas e
  join public.escritorios es on es.id = e.escritorio_id
  join public.modelos_checklist m on m.escritorio_id = e.escritorio_id
  left join public.empresa_item_excecoes x on x.empresa_id = e.id and x.modelo_id = m.id
  where e.escritorio_id = p_escritorio
    and e.ativa and m.ativo
    and m.area = any(es.areas_ativas)
    and coalesce(x.incluir, public.modelo_aplica_empresa(m, e))
    and (m.periodicidade = 'mensal'
         or (m.periodicidade = 'trimestral' and mes in (3, 6, 9, 12))
         or (m.periodicidade = 'anual' and mes = greatest(1, least(12, 11 + m.meses_apos))))
  on conflict (empresa_id, modelo_id, periodo_ref) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.gerar_tarefas(uuid, date) from anon, public, authenticated;

-- "Gerar agora" (Gestor)
create or replace function public.gerar_checklists(p_competencia date)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_gestor() then
    raise exception 'Apenas o Gestor pode gerar checklists.' using errcode = '42501';
  end if;
  if p_competencia > (date_trunc('month', public.hoje_sp()) + interval '12 months') then
    raise exception 'Competência muito distante.' using errcode = 'P0001';
  end if;
  return public.gerar_tarefas(public.meu_escritorio(), p_competencia);
end $$;
revoke execute on function public.gerar_checklists(date) from anon, public;
grant execute on function public.gerar_checklists(date) to authenticated;

-- Geração automática: competência do mês anterior (e o mês atual a partir do
-- início do uso), para todos os escritórios. Rodada todo dia.
create or replace function public.gerar_checklists_automatico()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_total integer := 0;
  v_anterior date := (date_trunc('month', public.hoje_sp()) - interval '1 month')::date;
begin
  for r in select id, inicio_checklists from public.escritorios loop
    if v_anterior >= r.inicio_checklists then
      v_total := v_total + public.gerar_tarefas(r.id, v_anterior);
    end if;
  end loop;
  return v_total;
end $$;
revoke execute on function public.gerar_checklists_automatico() from anon, public, authenticated;

-- Agenda diária às 03:00 de Brasília (06:00 UTC), quando o agendador existe
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'Agendador (pg_cron) indisponível: a geração automática fica a cargo do app.';
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('gerar-checklists', '0 6 * * *', 'select public.gerar_checklists_automatico()');
  end if;
exception when others then
  raise notice 'Não foi possível agendar a geração automática: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- Transferência: também passa as tarefas em aberto
-- ---------------------------------------------------------------------
create or replace function public.transferir_responsabilidades(p_de uuid, p_para uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_esc uuid := public.meu_escritorio(); v_areas text[]; v_papel text; v_total integer := 0; v_n integer;
begin
  if not public.sou_gestor() then
    raise exception 'Apenas o Gestor pode transferir responsabilidades.' using errcode = '42501';
  end if;
  if p_de = p_para then
    raise exception 'Escolha pessoas diferentes.' using errcode = 'P0001';
  end if;
  select areas, papel into v_areas, v_papel from public.membros
   where id = p_para and escritorio_id = v_esc and ativo;
  if v_areas is null or not exists (select 1 from public.membros where id = p_de and escritorio_id = v_esc) then
    raise exception 'Usuário não encontrado ou inativo.' using errcode = 'P0001';
  end if;
  if v_papel = 'gestor' then v_areas := array['fiscal','contabil','dp']; end if;

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

  -- Tarefas em aberto que ainda estejam com a pessoa (de qualquer competência)
  update public.tarefas set responsavel_id = p_para
  where escritorio_id = v_esc and responsavel_id = p_de and status = 'pendente' and area = any(v_areas);

  insert into public.membro_empresas (membro_id, empresa_id)
  select p_para, empresa_id from public.membro_empresas where membro_id = p_de
  on conflict do nothing;

  return v_total;
end $$;

-- ---------------------------------------------------------------------
-- Armazenamento de anexos (Supabase Storage), quando disponível
-- Caminho dos arquivos: <tarefa_id>/<nome-do-arquivo>
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage')
     and exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('anexos', 'anexos', false, 26214400)  -- até 25 MB por arquivo
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

    execute 'drop policy if exists anexos_ler on storage.objects';
    execute $p$create policy anexos_ler on storage.objects for select to authenticated
      using (bucket_id = 'anexos' and public.posso_ver_tarefa(public.uuid_ou_nulo(split_part(name, '/', 1))))$p$;
    execute 'drop policy if exists anexos_enviar on storage.objects';
    execute $p$create policy anexos_enviar on storage.objects for insert to authenticated
      with check (bucket_id = 'anexos' and public.posso_ver_tarefa(public.uuid_ou_nulo(split_part(name, '/', 1))))$p$;
    execute 'drop policy if exists anexos_apagar on storage.objects';
    execute $p$create policy anexos_apagar on storage.objects for delete to authenticated
      using (bucket_id = 'anexos' and public.posso_ver_tarefa(public.uuid_ou_nulo(split_part(name, '/', 1))))$p$;
  end if;
end $$;

-- Tempo real
do $$ begin
  begin alter publication supabase_realtime add table public.tarefas; exception when others then null; end;
  begin alter publication supabase_realtime add table public.tarefa_anexos; exception when others then null; end;
  begin alter publication supabase_realtime add table public.tarefa_historico; exception when others then null; end;
end $$;
