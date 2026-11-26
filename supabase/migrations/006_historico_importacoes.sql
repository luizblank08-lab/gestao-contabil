-- =====================================================================
-- Histórico de importações com "Desfazer"
--   * Cada importação de planilha fica registrada (quando, quem, arquivo,
--     quantas empresas criou e alterou), com os dados de antes e depois.
--   * "Desfazer" apaga as empresas criadas e devolve os dados das alteradas.
--   * Proteções:
--       - só a importação mais recente ainda ativa pode ser desfeita;
--       - não apaga empresa com trabalho feito (tarefa marcada ou anexo);
--       - não desfaz um campo que foi alterado à mão depois da importação.
-- =====================================================================

create table if not exists public.importacoes (
  id            uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  criado_por    uuid references public.membros(id) on delete set null,
  criado_em     timestamptz not null default now(),
  nome_arquivo  text,
  criadas       integer not null default 0,
  atualizadas   integer not null default 0,
  desfeita_em   timestamptz,
  desfeita_por  uuid references public.membros(id) on delete set null,
  resultado_desfazer jsonb
);
create index if not exists importacoes_escritorio_idx on public.importacoes(escritorio_id, criado_em desc);

create table if not exists public.importacao_itens (
  id             bigint generated always as identity primary key,
  importacao_id  uuid not null references public.importacoes(id) on delete cascade,
  empresa_id     uuid references public.empresas(id) on delete set null,
  codigo         text not null,
  acao           text not null check (acao in ('criada','atualizada')),
  antes          jsonb,  -- campos antes da importação (só nas atualizadas)
  depois         jsonb not null  -- campos como a importação deixou
);
create index if not exists importacao_itens_imp_idx on public.importacao_itens(importacao_id);

alter table public.importacoes enable row level security;
alter table public.importacao_itens enable row level security;

drop policy if exists importacoes_select on public.importacoes;
create policy importacoes_select on public.importacoes for select to authenticated
  using (escritorio_id = public.meu_escritorio() and public.sou_gestor());
drop policy if exists importacao_itens_select on public.importacao_itens;
create policy importacao_itens_select on public.importacao_itens for select to authenticated
  using (exists (select 1 from public.importacoes i where i.id = importacao_id
                 and i.escritorio_id = public.meu_escritorio() and public.sou_gestor()));

grant select on public.importacoes, public.importacao_itens to authenticated;
revoke all on public.importacoes, public.importacao_itens from anon;

-- Campos que a importação mexe (e que o "Desfazer" devolve)
create or replace function public.campos_importacao(e public.empresas)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'razao_social', e.razao_social, 'cnpj', e.cnpj, 'regime', e.regime,
    'resp_fiscal_id', e.resp_fiscal_id, 'resp_contabil_id', e.resp_contabil_id, 'resp_dp_id', e.resp_dp_id)
$$;

-- ---------------------------------------------------------------------
-- Importação (substitui a versão anterior, agora com registro no histórico)
-- ---------------------------------------------------------------------
drop function if exists public.importar_empresas(jsonb);

create or replace function public.importar_empresas(p_itens jsonb, p_nome_arquivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_esc uuid := public.meu_escritorio();
  v_imp uuid;
  v_item jsonb;
  v_id uuid;
  v_codigo text;
  v_regime text;
  v_cnpj text;
  v_antes jsonb;
  v_criadas int := 0;
  v_atualizadas int := 0;
  r public.empresas;
begin
  if not public.sou_gestor() then
    raise exception 'Apenas o Gestor pode importar empresas.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 5000 then
    raise exception 'Lista de empresas inválida.' using errcode = 'P0001';
  end if;

  insert into public.importacoes (escritorio_id, criado_por, nome_arquivo)
  values (v_esc, auth.uid(), nullif(left(trim(coalesce(p_nome_arquivo, '')), 200), ''))
  returning id into v_imp;

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

    select * into r from public.empresas where escritorio_id = v_esc and codigo = v_codigo;
    if r.id is null then
      insert into public.empresas (escritorio_id, codigo, razao_social, cnpj, regime,
                                   resp_fiscal_id, resp_contabil_id, resp_dp_id)
      values (v_esc, v_codigo, trim(v_item->>'razao_social'), v_cnpj, v_regime,
              nullif(v_item->>'resp_fiscal_id','')::uuid,
              nullif(v_item->>'resp_contabil_id','')::uuid,
              nullif(v_item->>'resp_dp_id','')::uuid)
      returning * into r;
      insert into public.importacao_itens (importacao_id, empresa_id, codigo, acao, antes, depois)
      values (v_imp, r.id, v_codigo, 'criada', null, public.campos_importacao(r));
      v_criadas := v_criadas + 1;
    else
      v_antes := public.campos_importacao(r);
      update public.empresas set
        razao_social     = trim(v_item->>'razao_social'),
        cnpj             = coalesce(v_cnpj, cnpj),
        regime           = coalesce(v_regime, regime),
        resp_fiscal_id   = coalesce(nullif(v_item->>'resp_fiscal_id','')::uuid, resp_fiscal_id),
        resp_contabil_id = coalesce(nullif(v_item->>'resp_contabil_id','')::uuid, resp_contabil_id),
        resp_dp_id       = coalesce(nullif(v_item->>'resp_dp_id','')::uuid, resp_dp_id)
      where id = r.id
      returning * into r;
      insert into public.importacao_itens (importacao_id, empresa_id, codigo, acao, antes, depois)
      values (v_imp, r.id, v_codigo, 'atualizada', v_antes, public.campos_importacao(r));
      v_atualizadas := v_atualizadas + 1;
    end if;
  end loop;

  update public.importacoes set criadas = v_criadas, atualizadas = v_atualizadas where id = v_imp;
  return jsonb_build_object('criadas', v_criadas, 'atualizadas', v_atualizadas, 'importacao_id', v_imp);
end $$;
revoke execute on function public.importar_empresas(jsonb, text) from anon, public;
grant execute on function public.importar_empresas(jsonb, text) to authenticated;

-- ---------------------------------------------------------------------
-- Desfazer uma importação
-- ---------------------------------------------------------------------
create or replace function public.desfazer_importacao(p_importacao uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_esc uuid := public.meu_escritorio();
  v_imp public.importacoes;
  v_it record;
  v_atual jsonb;
  v_campo text;
  v_restaurar jsonb;
  v_removidas int := 0;
  v_restauradas int := 0;
  v_campos_mantidos int := 0;
  v_bloqueadas text[] := '{}';
  v_ja_removidas int := 0;
begin
  if not public.sou_gestor() then
    raise exception 'Apenas o Gestor pode desfazer importações.' using errcode = '42501';
  end if;
  select * into v_imp from public.importacoes where id = p_importacao and escritorio_id = v_esc for update;
  if v_imp.id is null then
    raise exception 'Importação não encontrada.' using errcode = 'P0001';
  end if;
  if v_imp.desfeita_em is not null then
    raise exception 'Esta importação já foi desfeita.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.importacoes where escritorio_id = v_esc and desfeita_em is null
             and criado_em > v_imp.criado_em) then
    raise exception 'Desfaça antes as importações mais recentes (uma de cada vez, da mais nova para a mais antiga).'
      using errcode = 'P0001';
  end if;

  -- Empresas criadas com trabalho feito não podem ser apagadas
  select coalesce(array_agg(distinct i.codigo || ' – ' || e.razao_social), '{}') into v_bloqueadas
  from public.importacao_itens i
  join public.empresas e on e.id = i.empresa_id
  where i.importacao_id = v_imp.id and i.acao = 'criada'
    and (exists (select 1 from public.tarefas t where t.empresa_id = e.id and t.status <> 'pendente')
         or exists (select 1 from public.tarefa_anexos a join public.tarefas t on t.id = a.tarefa_id where t.empresa_id = e.id));
  if cardinality(v_bloqueadas) > 0 then
    raise exception 'Não é possível desfazer: estas empresas criadas pela importação já têm tarefas marcadas ou anexos: %. Exclua-as manualmente se tiver certeza.',
      array_to_string(v_bloqueadas[1:5], '; ') || case when cardinality(v_bloqueadas) > 5 then ' …' else '' end
      using errcode = 'P0001';
  end if;

  for v_it in select * from public.importacao_itens where importacao_id = v_imp.id order by id desc loop
    if v_it.empresa_id is null then
      v_ja_removidas := v_ja_removidas + 1;
      continue;
    end if;
    if v_it.acao = 'criada' then
      delete from public.empresas where id = v_it.empresa_id and escritorio_id = v_esc;
      if found then v_removidas := v_removidas + 1; end if;
    else
      select public.campos_importacao(e) into v_atual from public.empresas e where e.id = v_it.empresa_id;
      if v_atual is null then continue; end if;
      -- Devolve só os campos que continuam como a importação deixou (não desfaz correções feitas depois)
      v_restaurar := '{}';
      for v_campo in select jsonb_object_keys(v_it.antes) loop
        if (v_atual->v_campo) is not distinct from (v_it.depois->v_campo) then
          if (v_it.antes->v_campo) is distinct from (v_it.depois->v_campo) then
            v_restaurar := v_restaurar || jsonb_build_object(v_campo, v_it.antes->v_campo);
          end if;
        elsif (v_it.antes->v_campo) is distinct from (v_it.depois->v_campo) then
          v_campos_mantidos := v_campos_mantidos + 1;
        end if;
      end loop;
      if v_restaurar <> '{}' then
        update public.empresas set
          razao_social     = case when v_restaurar ? 'razao_social' then v_restaurar->>'razao_social' else razao_social end,
          cnpj             = case when v_restaurar ? 'cnpj' then v_restaurar->>'cnpj' else cnpj end,
          regime           = case when v_restaurar ? 'regime' then v_restaurar->>'regime' else regime end,
          resp_fiscal_id   = case when v_restaurar ? 'resp_fiscal_id' then (v_restaurar->>'resp_fiscal_id')::uuid else resp_fiscal_id end,
          resp_contabil_id = case when v_restaurar ? 'resp_contabil_id' then (v_restaurar->>'resp_contabil_id')::uuid else resp_contabil_id end,
          resp_dp_id       = case when v_restaurar ? 'resp_dp_id' then (v_restaurar->>'resp_dp_id')::uuid else resp_dp_id end
        where id = v_it.empresa_id;
        v_restauradas := v_restauradas + 1;
      end if;
    end if;
  end loop;

  update public.importacoes set desfeita_em = now(), desfeita_por = auth.uid(),
    resultado_desfazer = jsonb_build_object('removidas', v_removidas, 'restauradas', v_restauradas,
                                            'campos_mantidos', v_campos_mantidos, 'ja_removidas', v_ja_removidas)
  where id = v_imp.id;

  return jsonb_build_object('removidas', v_removidas, 'restauradas', v_restauradas,
                            'campos_mantidos', v_campos_mantidos, 'ja_removidas', v_ja_removidas);
end $$;
revoke execute on function public.desfazer_importacao(uuid) from anon, public;
grant execute on function public.desfazer_importacao(uuid) to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.importacoes; exception when others then null; end;
end $$;
