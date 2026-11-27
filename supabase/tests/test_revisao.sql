-- Testes da revisão do Gestor (devolver tarefa para correção).
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
select set_config('teste.pend', pg_temp.tarefa('Empresa X','efd_contribuicoes','2026-11-01')::text, false);

set role authenticated;

-- Preparação: o usuário fiscal volta a ser o responsável fiscal da Empresa X
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update public.empresas set resp_fiscal_id = '00000000-0000-0000-0000-0000000000f2' where razao_social = 'Empresa X';
update public.tarefas set responsavel_id = '00000000-0000-0000-0000-0000000000f2' where id = current_setting('teste.t')::uuid;

-- Responsável marca como feita
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
update public.tarefas set status = 'feito' where id = current_setting('teste.t')::uuid;
select pg_temp.check((select status from public.tarefas where id = current_setting('teste.t')::uuid) = 'feito', 'responsável marca a tarefa como feita');

-- Usuário não devolve nem forja a devolução
do $$ begin
  perform public.devolver_tarefa(current_setting('teste.t')::uuid, 'teste');
  raise exception 'FALHOU: usuário devolveu';
exception when sqlstate '42501' then raise notice 'ok - usuário comum não devolve tarefas'; end $$;
do $$ begin
  update public.tarefas set devolvida_em = now(), motivo_devolucao = 'falso' where id = current_setting('teste.t')::uuid;
  raise exception 'FALHOU: usuário forjou devolução';
exception when sqlstate '42501' then raise notice 'ok - usuário não marca devolução direto no banco'; end $$;

-- Gestor devolve com motivo
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
do $$ begin
  perform public.devolver_tarefa(current_setting('teste.t')::uuid, '  ');
  raise exception 'FALHOU: devolveu sem motivo';
exception when sqlstate 'P0001' then raise notice 'ok - devolver exige escrever o que corrigir'; end $$;
do $$ begin
  perform public.devolver_tarefa(current_setting('teste.pend')::uuid, 'corrigir');
  raise exception 'FALHOU: devolveu tarefa pendente';
exception when sqlstate 'P0001' then raise notice 'ok - não devolve tarefa que ainda está pendente'; end $$;

select public.devolver_tarefa(current_setting('teste.t')::uuid, 'Faltou anexar o comprovante de pagamento');
select pg_temp.check((select status = 'pendente' and devolvida_em is not null and devolvida_por = '00000000-0000-0000-0000-00000000000a'
                             and motivo_devolucao = 'Faltou anexar o comprovante de pagamento' and devolucoes = 1
                             and concluido_em is null and responsavel_id = '00000000-0000-0000-0000-0000000000f2'
                      from public.tarefas where id = current_setting('teste.t')::uuid),
  'gestor devolve: volta a pendente para o mesmo responsável, com motivo, data e autor');
select pg_temp.check((select acao = 'devolvida' and detalhe = 'Faltou anexar o comprovante de pagamento' and membro_id = '00000000-0000-0000-0000-00000000000a'
                      from public.tarefa_historico where tarefa_id = current_setting('teste.t')::uuid order by id desc limit 1),
  'histórico registra a devolução com o motivo');

-- Responsável vê o motivo e corrige
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check((select motivo_devolucao from public.tarefas where id = current_setting('teste.t')::uuid) = 'Faltou anexar o comprovante de pagamento',
  'responsável vê o motivo da devolução');
update public.tarefas set observacao = 'Comprovante anexado' where id = current_setting('teste.t')::uuid;
select pg_temp.check((select devolvida_em is not null from public.tarefas where id = current_setting('teste.t')::uuid), 'continua devolvida enquanto não for concluída de novo');
update public.tarefas set status = 'feito' where id = current_setting('teste.t')::uuid;
select pg_temp.check((select status = 'feito' and devolvida_em is null and devolucoes = 1 and motivo_devolucao is not null
                      from public.tarefas where id = current_setting('teste.t')::uuid),
  'ao concluir de novo, sai a marca de devolvida (contagem e último motivo ficam guardados)');

-- Segunda devolução soma
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select public.devolver_tarefa(current_setting('teste.t')::uuid, 'Valor da guia diferente do apurado');
select pg_temp.check((select devolucoes = 2 and motivo_devolucao = 'Valor da guia diferente do apurado' from public.tarefas where id = current_setting('teste.t')::uuid),
  'segunda devolução atualiza o motivo e conta 2');
reset role;

\echo TODOS OS TESTES DA REVISÃO PASSARAM
