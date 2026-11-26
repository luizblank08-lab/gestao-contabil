-- Testes do histórico de importações com "Desfazer".
-- Roda depois dos testes das etapas (usa o Escritório A e seus usuários).
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\o /dev/null

create or replace function pg_temp.como(p uuid) returns void language sql as
$$ select set_config('request.jwt.claim.sub', p::text, false) $$;
create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as
$$ begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; raise notice 'ok - %', msg; end $$;
grant execute on all functions in schema pg_temp to authenticated;

set role authenticated;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');

-- Foto da empresa 410 antes das importações deste teste
create temp table antes_410 as select razao_social, regime, cnpj from public.empresas where codigo = '410';
grant select on antes_410 to authenticated;

-- Importação 1: cria I1 e altera 410
select pg_temp.check((public.importar_empresas('[
  {"codigo":"I1","razao_social":"Importada Um"},
  {"codigo":"410","razao_social":"AGRO NOME ERRADO","regime":"mei","cnpj":"11.222.333/0001-81"}
]'::jsonb, 'planilha-certa.xlsx') - 'importacao_id') = '{"criadas":1,"atualizadas":1}'::jsonb, 'importação 1: cria 1 e altera 1');
select pg_temp.check((select nome_arquivo = 'planilha-certa.xlsx' and criadas = 1 and atualizadas = 1 and criado_por = '00000000-0000-0000-0000-00000000000a'
                      from public.importacoes order by criado_em desc limit 1), 'importação fica registrada no histórico (arquivo, quem, números)');
select set_config('teste.imp1', (select id::text from public.importacoes order by criado_em desc limit 1), false);

-- Importação 2: cria I2 e altera I1
select pg_sleep(0.01);
select public.importar_empresas('[{"codigo":"I2","razao_social":"Importada Dois"},{"codigo":"I1","razao_social":"Importada Um ALTERADA"}]'::jsonb, 'planilha-errada.xlsx');
select set_config('teste.imp2', (select id::text from public.importacoes order by criado_em desc limit 1), false);

-- Só a mais recente pode ser desfeita
do $$ begin
  perform public.desfazer_importacao(current_setting('teste.imp1')::uuid);
  raise exception 'FALHOU: desfez importação antiga antes da recente';
exception when sqlstate 'P0001' then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok - não desfaz uma importação antiga antes das mais recentes';
end $$;

-- Usuário comum não vê nem desfaz
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check((select count(*) from public.importacoes) = 0 and (select count(*) from public.importacao_itens) = 0, 'usuário comum não vê o histórico');
do $$ begin
  perform public.desfazer_importacao(current_setting('teste.imp2')::uuid);
  raise exception 'FALHOU: usuário desfez';
exception when sqlstate '42501' then raise notice 'ok - usuário comum não desfaz importação'; end $$;

-- Correção manual depois da importação é preservada
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update public.empresas set razao_social = 'Corrigida à mão' where codigo = 'I1';
select pg_temp.check((public.desfazer_importacao(current_setting('teste.imp2')::uuid))
                     = '{"removidas":1,"restauradas":0,"campos_mantidos":1,"ja_removidas":0}'::jsonb,
  'desfazer a importação 2: remove a empresa criada e mantém a correção feita à mão');
select pg_temp.check(not exists (select 1 from public.empresas where codigo = 'I2'), 'empresa criada pela importação desfeita foi removida');
select pg_temp.check((select razao_social from public.empresas where codigo = 'I1') = 'Corrigida à mão', 'correção manual não foi desfeita');
select pg_temp.check((select desfeita_em is not null and desfeita_por = '00000000-0000-0000-0000-00000000000a' from public.importacoes where id = current_setting('teste.imp2')::uuid),
  'histórico marca quando e quem desfez');
do $$ begin
  perform public.desfazer_importacao(current_setting('teste.imp2')::uuid);
  raise exception 'FALHOU: desfez duas vezes';
exception when sqlstate 'P0001' then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok - não desfaz a mesma importação duas vezes';
end $$;

-- Agora a importação 1 pode ser desfeita: remove I1 e devolve os dados da 410
select pg_temp.check((public.desfazer_importacao(current_setting('teste.imp1')::uuid) ->> 'removidas')::int = 1, 'desfazer a importação 1 remove a empresa que ela criou');
select pg_temp.check((select e.razao_social = a.razao_social and e.regime is not distinct from a.regime and e.cnpj is not distinct from a.cnpj
                      from public.empresas e, antes_410 a where e.codigo = '410'), 'empresa alterada volta a ter razão social, regime e CNPJ de antes');

-- Empresa criada com trabalho feito bloqueia o "Desfazer"
select public.importar_empresas('[{"codigo":"I3","razao_social":"Importada Três"}]'::jsonb, 'outra.xlsx');
reset role;
insert into public.tarefas (escritorio_id, empresa_id, competencia, periodo_ref, periodicidade, area, nome, vencimento, status)
select escritorio_id, id, '2026-11-01', '2026-11-01', 'mensal', 'fiscal', 'Tarefa feita', '2026-12-10', 'feito' from public.empresas where codigo = 'I3';
set role authenticated;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
do $$ begin
  perform public.desfazer_importacao((select id from public.importacoes order by criado_em desc limit 1));
  raise exception 'FALHOU: apagou empresa com trabalho feito';
exception when sqlstate 'P0001' then
  if sqlerrm not like '%I3 – Importada Três%' then raise exception 'FALHOU: mensagem sem a empresa: %', sqlerrm; end if;
  raise notice 'ok - não apaga empresa criada que já tem tarefa marcada (e diz qual)';
end $$;
select pg_temp.check(exists (select 1 from public.empresas where codigo = 'I3'), 'empresa com trabalho continua cadastrada');
reset role;

\echo TODOS OS TESTES DO HISTÓRICO DE IMPORTAÇÕES PASSARAM
