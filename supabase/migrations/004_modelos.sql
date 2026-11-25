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
