-- Testes da conferência com IA (histórico em conferencias_ia).
-- Roda depois de test_etapa3.sql (usa as tarefas de 11/2026 da Empresa X).
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\o /dev/null

create or replace function pg_temp.como(p uuid) returns void language sql as
$$ select set_config('request.jwt.claim.sub', p::text, false) $$;
create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as
$$ begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; raise notice 'ok - %', msg; end $$;
create or replace function pg_temp.tarefa(emp text, cod text, comp text) returns uuid language sql as $$
  select t.id from public.tarefas t join public.empresas e on e.id = t.empresa_id
  join public.modelos_checklist m on m.id = t.modelo_id
  where e.razao_social = emp and m.codigo_padrao = cod and t.competencia = comp::date $$;
grant execute on all functions in schema pg_temp to authenticated;
select set_config('teste.t', pg_temp.tarefa('Empresa X','pis_cofins','2026-11-01')::text, false);
select set_config('teste.x', (select id from public.empresas where razao_social = 'Empresa X')::text, false);
select set_config('teste.y', (select id from public.empresas where razao_social = 'Empresa Y')::text, false);

set role authenticated;

-- Preparação: o usuário fiscal (f2) é o responsável fiscal da Empresa X
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update public.empresas set resp_fiscal_id = '00000000-0000-0000-0000-0000000000f2' where razao_social = 'Empresa X';

-- O responsável fiscal registra uma conferência da sua tarefa (a empresa vem da tarefa)
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
insert into public.conferencias_ia (tarefa_id, tipo, conclusao, resumo, resultado)
values (current_setting('teste.t')::uuid, 'guias_impostos', 'divergencias', 'Guia de PIS diverge da apuração.', '{}');
select pg_temp.check((select empresa_id = current_setting('teste.x')::uuid and criado_por = '00000000-0000-0000-0000-0000000000f2'
                      and escritorio_id = public.meu_escritorio()
                      from public.conferencias_ia where tarefa_id = current_setting('teste.t')::uuid),
  'usuário registra conferência da sua tarefa; empresa e escritório preenchidos sozinhos');

-- Não registra em nome de outra pessoa
do $$ begin
  insert into public.conferencias_ia (tipo, conclusao, resumo, resultado, criado_por)
  values ('livre', 'atencao', 'x', '{}', '00000000-0000-0000-0000-00000000000a');
  raise exception 'FALHOU: registrou em nome do gestor';
exception when insufficient_privilege then raise notice 'ok - não registra conferência em nome de outra pessoa'; end $$;

-- Tarefa e empresa precisam combinar
do $$ begin
  insert into public.conferencias_ia (tarefa_id, empresa_id, tipo, conclusao, resumo, resultado)
  values (current_setting('teste.t')::uuid, current_setting('teste.y')::uuid, 'livre', 'atencao', 'x', '{}');
  raise exception 'FALHOU: aceitou tarefa de outra empresa';
exception when sqlstate 'P0001' or insufficient_privilege then raise notice 'ok - tarefa precisa ser da empresa informada'; end $$;

-- Usuário contábil (vê a Empresa X, mas não tarefas fiscais) não vê nem registra na tarefa fiscal
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.check(not exists (select 1 from public.conferencias_ia where tarefa_id = current_setting('teste.t')::uuid),
  'quem não vê a tarefa não vê a conferência dela');
do $$ begin
  insert into public.conferencias_ia (tarefa_id, tipo, conclusao, resumo, resultado)
  values (current_setting('teste.t')::uuid, 'livre', 'atencao', 'x', '{}');
  raise exception 'FALHOU: registrou em tarefa que não vê';
exception when insufficient_privilege then raise notice 'ok - não registra conferência em tarefa que não vê'; end $$;
-- …mas registra conferência avulsa da empresa e vê a sua
insert into public.conferencias_ia (empresa_id, tipo, conclusao, resumo, resultado)
values (current_setting('teste.x')::uuid, 'balancete', 'sem_divergencias', 'Balancete fechado.', '{}');
select pg_temp.check((select count(*) from public.conferencias_ia) = 1, 'usuário vê a conferência avulsa que fez');
-- Não apaga a de outra pessoa
delete from public.conferencias_ia where tarefa_id = current_setting('teste.t')::uuid;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.conferencias_ia) = 2, 'gestor vê todas; usuário não apagou a de outra pessoa');

-- Gestor de outro escritório não vê nada
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.check(not exists (select 1 from public.conferencias_ia), 'outro escritório não vê as conferências');
do $$ begin
  insert into public.conferencias_ia (escritorio_id, empresa_id, tipo, conclusao, resumo, resultado)
  values ((select escritorio_id from public.empresas where id = current_setting('teste.x')::uuid limit 1), current_setting('teste.x')::uuid,
          'livre', 'atencao', 'x', '{}');
  raise exception 'FALHOU: outro escritório registrou';
exception when insufficient_privilege or not_null_violation or sqlstate 'P0001' then raise notice 'ok - outro escritório não registra conferência'; end $$;

-- Valores inválidos são recusados
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
do $$ begin
  insert into public.conferencias_ia (tipo, conclusao, resumo, resultado) values ('qualquer', 'atencao', 'x', '{}');
  raise exception 'FALHOU: aceitou tipo inválido';
exception when check_violation then raise notice 'ok - tipo de conferência inválido é recusado'; end $$;

-- Gestor apaga
delete from public.conferencias_ia;
select pg_temp.check(not exists (select 1 from public.conferencias_ia), 'gestor apaga conferências');

reset role;

\echo TODOS OS TESTES DA CONFERÊNCIA COM IA PASSARAM
