-- Testes da Etapa 3: geração das tarefas, permissões, histórico, transferência e anexos.
-- Roda depois de test_etapa1.sql e test_etapa2.sql.
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

-- Preparação (Gestor A): X = Lucro Real/serviço sem funcionários; Y = Simples/comércio com funcionários
set role authenticated;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update public.empresas set resp_fiscal_id = '00000000-0000-0000-0000-0000000000f2',
       resp_contabil_id = '00000000-0000-0000-0000-00000000000c', resp_dp_id = null, ativa = true
 where razao_social in ('Empresa X', 'Empresa Y');
delete from public.empresa_item_excecoes;

-- ---------------- Geração ----------------
select pg_temp.check(public.gerar_checklists('2026-11-01') > 0, 'gestor gera os checklists de 11/2026');
select pg_temp.check(public.gerar_checklists('2026-11-01') = 0, 'gerar de novo não duplica');
select pg_temp.check((select vencimento from public.tarefas where id = pg_temp.tarefa('Empresa X','pis_cofins','2026-11-01')) = '2026-12-24',
  'PIS/COFINS 11/2026 vence 24/12 (dia 25 é Natal, antecipa)');
select pg_temp.check((select responsavel_id from public.tarefas where id = pg_temp.tarefa('Empresa X','pis_cofins','2026-11-01')) = '00000000-0000-0000-0000-0000000000f2',
  'tarefa fiscal já cai para o responsável fiscal da empresa');
select pg_temp.check((select responsavel_id from public.tarefas where id = pg_temp.tarefa('Empresa X','balancete','2026-11-01')) = '00000000-0000-0000-0000-00000000000c',
  'tarefa contábil cai para o responsável contábil');
select pg_temp.check(pg_temp.tarefa('Empresa X','das','2026-11-01') is null and pg_temp.tarefa('Empresa Y','das','2026-11-01') is not null,
  'DAS só para a empresa do Simples');
select pg_temp.check(pg_temp.tarefa('Empresa Y','folha','2026-11-01') is not null and pg_temp.tarefa('Empresa X','folha','2026-11-01') is null,
  'folha só para quem tem funcionários');
select pg_temp.check(pg_temp.tarefa('Empresa X','irpj_csll','2026-11-01') is null, 'IRPJ trimestral não nasce em novembro');
select pg_temp.check((select responsavel_id is null from public.tarefas where id = pg_temp.tarefa('Empresa Y','folha','2026-11-01')), 'sem responsável de DP, a tarefa fica sem responsável');
select pg_temp.check((select vencimento from public.tarefas where id = pg_temp.tarefa('Empresa Y','decimo_terceiro_2','2026-11-01')) = '2026-12-18',
  '13º 2ª parcela nasce em 11/2026 e vence 18/12 (dia 20 é domingo)');

select public.gerar_checklists('2026-12-01');
select pg_temp.check((select vencimento = '2027-01-29' and periodo_ref = '2026-10-01' from public.tarefas where id = pg_temp.tarefa('Empresa X','irpj_csll','2026-12-01')),
  'IRPJ do 4º trimestre nasce em 12/2026 e vence 29/01/2027');
select pg_temp.check((select vencimento from public.tarefas where id = pg_temp.tarefa('Empresa X','ecd','2026-12-01')) = '2027-06-30',
  'ECD do ano-base 2026 nasce em 12/2026 e vence 30/06/2027');
select public.gerar_checklists('2026-10-01');
select pg_temp.check((select vencimento from public.tarefas where id = pg_temp.tarefa('Empresa Y','decimo_terceiro_1','2026-10-01')) = '2026-11-30',
  '13º 1ª parcela nasce em 10/2026 e vence 30/11');
select pg_temp.check((select count(*) from public.tarefa_historico h join public.tarefas t on t.id = h.tarefa_id
                      where t.id = pg_temp.tarefa('Empresa X','pis_cofins','2026-11-01') and h.acao = 'criada') = 1, 'histórico registra a criação');

-- Empresa inativa não gera
update public.empresas set ativa = false where razao_social = 'Empresa Y';
select public.gerar_checklists('2027-01-01');
select pg_temp.check(not exists (select 1 from public.tarefas t join public.empresas e on e.id = t.empresa_id
                                 where e.razao_social = 'Empresa Y' and t.competencia = '2027-01-01'), 'empresa inativa não recebe tarefas');
update public.empresas set ativa = true where razao_social = 'Empresa Y';

-- ---------------- Usuário fiscal ----------------
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check((select count(*) from public.tarefas where area <> 'fiscal') = 0 and (select count(*) from public.tarefas) > 0,
  'usuário fiscal vê só tarefas fiscais');
update public.tarefas set status = 'feito', observacao = 'Guia emitida' where id = pg_temp.tarefa('Empresa X','pis_cofins','2026-11-01');
select pg_temp.check((select status = 'feito' and concluido_em = public.hoje_sp() and concluido_por = '00000000-0000-0000-0000-0000000000f2'
                      from public.tarefas where id = pg_temp.tarefa('Empresa X','pis_cofins','2026-11-01')),
  'fiscal marca como feito; data e autor da conclusão são registrados');
select pg_temp.check((select string_agg(acao || ':' || coalesce(detalhe,''), '|' order by h.id) from public.tarefa_historico h
                      where tarefa_id = pg_temp.tarefa('Empresa X','pis_cofins','2026-11-01') and membro_id = '00000000-0000-0000-0000-0000000000f2')
                     = 'status:Pendente → Feito|observacao:Guia emitida', 'histórico guarda quem marcou o quê');
update public.tarefas set concluido_em = '2026-12-10' where id = pg_temp.tarefa('Empresa X','pis_cofins','2026-11-01');
select pg_temp.check((select concluido_em from public.tarefas where id = pg_temp.tarefa('Empresa X','pis_cofins','2026-11-01')) = '2026-12-10',
  'pode corrigir a data de conclusão');
do $$ begin
  update public.tarefas set responsavel_id = '00000000-0000-0000-0000-00000000000c' where id = pg_temp.tarefa('Empresa X','reinf','2026-11-01');
  raise exception 'FALHOU: usuário trocou responsável';
exception when sqlstate '42501' then raise notice 'ok - usuário não troca o responsável'; end $$;
update public.tarefas set status = 'feito' where area = 'contabil';
reset role;
select pg_temp.check(not exists (select 1 from public.tarefas where area = 'contabil' and status = 'feito'), 'usuário fiscal não mexe em tarefas contábeis');
set role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
do $$ begin
  perform public.gerar_checklists('2026-11-01');
  raise exception 'FALHOU: usuário gerou';
exception when sqlstate '42501' then raise notice 'ok - usuário não gera checklists'; end $$;
delete from public.tarefas;
reset role;
select pg_temp.check((select count(*) from public.tarefas) > 0, 'usuário não exclui tarefas');
set role authenticated;

-- Desmarcar limpa a conclusão
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
update public.tarefas set status = 'nao_se_aplica' where id = pg_temp.tarefa('Empresa X','reinf','2026-11-01');
update public.tarefas set status = 'pendente' where id = pg_temp.tarefa('Empresa X','pis_cofins','2026-11-01');
select pg_temp.check((select concluido_em is null and concluido_por is null from public.tarefas where id = pg_temp.tarefa('Empresa X','pis_cofins','2026-11-01')),
  'voltar para pendente limpa a data de conclusão');
update public.tarefas set status = 'feito' where id = pg_temp.tarefa('Empresa X','pis_cofins','2026-11-01');

-- ---------------- Anexos ----------------
insert into public.tarefa_anexos (tarefa_id, caminho, nome_arquivo, tamanho)
values (pg_temp.tarefa('Empresa X','pis_cofins','2026-11-01'), pg_temp.tarefa('Empresa X','pis_cofins','2026-11-01')::text || '/guia.pdf', 'guia.pdf', 1000);
select pg_temp.check((select count(*) from public.tarefa_anexos) = 1, 'fiscal anexa arquivo na sua tarefa');
do $$ begin
  insert into public.tarefa_anexos (tarefa_id, caminho, nome_arquivo)
  values (pg_temp.tarefa('Empresa X','pis_cofins','2026-11-01'), 'outra-pasta/x.pdf', 'x.pdf');
  raise exception 'FALHOU: aceitou caminho errado';
exception when insufficient_privilege then raise notice 'ok - anexo precisa ficar na pasta da tarefa'; end $$;
do $$ begin
  insert into public.tarefa_anexos (tarefa_id, caminho, nome_arquivo)
  values (pg_temp.tarefa('Empresa X','balancete','2026-11-01'), pg_temp.tarefa('Empresa X','balancete','2026-11-01')::text || '/x.pdf', 'x.pdf');
  raise exception 'FALHOU: anexou em tarefa contábil';
exception when insufficient_privilege then raise notice 'ok - fiscal não anexa em tarefa contábil'; end $$;
select pg_temp.check(exists (select 1 from public.tarefa_historico where acao = 'anexo_incluido' and detalhe = 'guia.pdf'), 'histórico registra o anexo');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from public.tarefa_anexos) = 0, 'usuário contábil não vê anexos fiscais');
select pg_temp.check(not public.posso_ver_tarefa(pg_temp.tarefa('Empresa X','pis_cofins','2026-11-01')), 'usuário contábil não acessa a tarefa fiscal');

-- ---------------- Mudança de responsável e transferência ----------------
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update public.empresas set resp_fiscal_id = '00000000-0000-0000-0000-00000000000a' where razao_social = 'Empresa X';
select pg_temp.check((select responsavel_id from public.tarefas where id = pg_temp.tarefa('Empresa X','dctfweb','2026-11-01')) = '00000000-0000-0000-0000-00000000000a',
  'trocar o responsável da empresa leva junto as tarefas pendentes');
select pg_temp.check((select responsavel_id from public.tarefas where id = pg_temp.tarefa('Empresa X','pis_cofins','2026-11-01')) = '00000000-0000-0000-0000-0000000000f2',
  'tarefas já feitas continuam com quem fez');
select pg_temp.check(exists (select 1 from public.tarefa_historico where acao = 'responsavel' and tarefa_id = pg_temp.tarefa('Empresa X','dctfweb','2026-11-01')),
  'histórico registra a troca de responsável');
select public.transferir_responsabilidades('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a');
select pg_temp.check(not exists (select 1 from public.tarefas where responsavel_id = '00000000-0000-0000-0000-00000000000c' and status = 'pendente'),
  'transferir responsabilidades passa as tarefas em aberto (férias/desligamento)');
update public.tarefas set responsavel_id = '00000000-0000-0000-0000-0000000000f2' where id = pg_temp.tarefa('Empresa X','reinf','2026-11-01');
select pg_temp.check((select responsavel_id from public.tarefas where id = pg_temp.tarefa('Empresa X','reinf','2026-11-01')) = '00000000-0000-0000-0000-0000000000f2',
  'gestor reatribui uma tarefa específica');

-- ---------------- Geração automática ----------------
reset role;
update public.escritorios set inicio_checklists = '2999-01-01';
select pg_temp.check(public.gerar_checklists_automatico() = 0, 'automático respeita o início de uso do escritório');
delete from public.tarefas where competencia = (date_trunc('month', public.hoje_sp()) - interval '1 month')::date;
update public.escritorios set inicio_checklists = '2000-01-01';
select pg_temp.check(public.gerar_checklists_automatico() > 0, 'automático gera a competência do mês anterior');
select pg_temp.check(public.gerar_checklists_automatico() = 0, 'automático rodando de novo não duplica');

\echo TODOS OS TESTES DA ETAPA 3 PASSARAM
