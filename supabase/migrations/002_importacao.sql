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
