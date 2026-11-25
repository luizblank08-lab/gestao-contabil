-- Testes da Etapa 2: calendário, vencimentos, modelos, aplicação e exceções.
-- Roda depois de test_etapa1.sql (usa os escritórios e usuários criados lá).
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\o /dev/null

create or replace function pg_temp.como(p uuid) returns void language sql as
$$ select set_config('request.jwt.claim.sub', p::text, false) $$;
create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as
$$ begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; raise notice 'ok - %', msg; end $$;
create or replace function pg_temp.venc(per text, tipo text, dia int, meses int, aj text, comp text) returns date language sql as
$$ select public.calcular_vencimento(per, tipo, dia, meses, aj, comp::date) $$;
grant execute on all functions in schema pg_temp to authenticated;

-- ---------------- Calendário ----------------
select pg_temp.check(public.pascoa(2026) = '2026-04-05' and public.pascoa(2027) = '2027-03-28', 'data da Páscoa');
select pg_temp.check(public.eh_feriado_nacional('2026-04-03'), 'Sexta-feira Santa 2026 é feriado');
select pg_temp.check(public.eh_feriado_nacional('2027-02-08') and public.eh_feriado_nacional('2027-02-09'), 'Carnaval 2027 (bancos fechados)');
select pg_temp.check(public.eh_feriado_nacional('2026-06-04'), 'Corpus Christi 2026');
select pg_temp.check(public.eh_feriado_nacional('2026-11-20'), 'Consciência Negra (20/11)');
select pg_temp.check(not public.eh_dia_util('2026-12-20') and public.eh_dia_util('2026-12-21'), 'domingo não é dia útil; segunda é');

-- ---------------- Vencimentos ----------------
select pg_temp.check(pg_temp.venc('mensal','dia_fixo',20,1,'posterga','2026-11-01') = '2026-12-21', 'DAS 11/2026: dia 20/12 é domingo, adia para 21/12');
select pg_temp.check(pg_temp.venc('mensal','dia_fixo',20,1,'antecipa','2026-11-15') = '2026-12-18', 'dia 20 caindo no domingo, antecipa para sexta 18/12');
select pg_temp.check(pg_temp.venc('mensal','dia_util',10,2,'antecipa','2026-10-01') = '2026-12-14', 'EFD Contribuições 10/2026: 10º dia útil de dezembro = 14/12');
select pg_temp.check(pg_temp.venc('anual','ultimo_dia_util',null,6,'antecipa','2026-05-01') = '2027-06-30', 'ECD ano-base 2026: último dia útil de junho/2027');
select pg_temp.check(pg_temp.venc('mensal','dia_fixo',9,1,'antecipa','2027-01-01') = '2027-02-05', 'vencimento no Carnaval antecipa para a sexta anterior');
select pg_temp.check(pg_temp.venc('mensal','dia_fixo',9,1,'posterga','2027-01-01') = '2027-02-10', 'vencimento no Carnaval adia para quarta-feira');
select pg_temp.check(pg_temp.venc('trimestral','ultimo_dia_util',null,1,'antecipa','2026-08-10') = '2026-10-30', 'IRPJ 3º trimestre/2026: 31/10 é sábado, fica 30/10');
select pg_temp.check(pg_temp.venc('anual','dia_fixo',30,-1,'antecipa','2026-01-01') = '2026-11-30', '13º 1ª parcela 2026 = 30/11/2026');
select pg_temp.check(pg_temp.venc('mensal','dia_fixo',31,1,'nenhum','2027-01-01') = '2027-02-28', 'dia 31 em fevereiro vira o último dia do mês');
select pg_temp.check(pg_temp.venc('mensal','dia_fixo',31,1,'antecipa','2027-01-01') = '2027-02-26', 'último dia de fevereiro no domingo, antecipa para sexta');
select pg_temp.check(pg_temp.venc('mensal','dia_fixo',20,1,'antecipa','2026-10-01') = '2026-11-19', 'vencimento no feriado de 20/11 antecipa');
select pg_temp.check(pg_temp.venc('mensal','dia_util',22,1,'antecipa','2026-01-01') = '2026-02-27', 'mês sem tantos dias úteis fica no último dia útil');

-- ---------------- Modelos iniciais e acesso ----------------
set role authenticated;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.modelos_checklist) = 26, 'escritório já vem com 26 itens prontos');
select pg_temp.check((select count(*) from public.modelos_checklist where area = 'fiscal') = 14
                 and (select count(*) from public.modelos_checklist where area = 'contabil') = 6
                 and (select count(*) from public.modelos_checklist where area = 'dp') = 6, 'itens separados por área');
select pg_temp.check((select not ativo from public.modelos_checklist where codigo_padrao = 'cbs_ibs'), 'item da Reforma Tributária vem desativado');

-- Gestor edita e cria itens
update public.modelos_checklist set dia = 18 where codigo_padrao = 'reinf';
select pg_temp.check((select dia from public.modelos_checklist where codigo_padrao = 'reinf') = 18, 'gestor altera o prazo de um item');
insert into public.modelos_checklist (nome, area, periodicidade, tipo_vencimento, dia, meses_apos)
values ('Item criado pelo gestor', 'fiscal', 'mensal', 'dia_fixo', 5, 1);
select pg_temp.check((select count(*) from public.modelos_checklist) = 27, 'gestor cria item novo');
do $$ begin
  insert into public.modelos_checklist (nome, area, periodicidade, tipo_vencimento, dia, meses_apos)
  values ('Dia inválido', 'fiscal', 'mensal', 'dia_fixo', 40, 1);
  raise exception 'FALHOU: aceitou dia 40';
exception when check_violation then raise notice 'ok - recusa dia de vencimento inválido'; end $$;

-- Restaurar padrão
delete from public.modelos_checklist where codigo_padrao = 'defis';
select pg_temp.check(public.restaurar_modelos_padrao() = 1, 'restaurar recoloca só o item padrão excluído');
select pg_temp.check(public.restaurar_modelos_padrao() = 0, 'restaurar de novo não duplica');

-- Usuário fiscal (reativado no teste da etapa 1? garante)
reset role;
update public.membros set ativo = true where id = '00000000-0000-0000-0000-0000000000f2';
set role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check((select count(*) from public.modelos_checklist where area <> 'fiscal') = 0
                 and (select count(*) from public.modelos_checklist) = 15, 'usuário fiscal vê só os itens fiscais');
update public.modelos_checklist set dia = 1;
select pg_temp.check(not exists (select 1 from public.modelos_checklist where dia = 1 and codigo_padrao = 'das'), 'usuário não altera modelos');
do $$ begin
  perform public.restaurar_modelos_padrao();
  raise exception 'FALHOU: usuário restaurou';
exception when sqlstate '42501' then raise notice 'ok - usuário não restaura modelos'; end $$;

-- ---------------- Aplicação às empresas ----------------
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update public.empresas set regime = 'presumido', atividades = '{servico}', possui_funcionarios = false where razao_social = 'Empresa X';
update public.empresas set regime = 'simples', atividades = '{comercio}', possui_funcionarios = true where razao_social = 'Empresa Y';

select pg_temp.check(exists (select 1 from public.empresa_obrigacoes o join public.modelos_checklist m on m.id = o.modelo_id
                             join public.empresas e on e.id = o.empresa_id
                             where e.razao_social = 'Empresa X' and m.codigo_padrao = 'iss' and o.aplicada),
  'Presumido de serviço recebe Apuração do ISS');
select pg_temp.check(not exists (select 1 from public.empresa_obrigacoes o join public.modelos_checklist m on m.id = o.modelo_id
                             join public.empresas e on e.id = o.empresa_id
                             where e.razao_social = 'Empresa X' and m.codigo_padrao in ('icms','das','folha') and o.aplicada),
  'Presumido de serviço sem funcionários NÃO recebe ICMS, DAS nem folha');
select pg_temp.check(exists (select 1 from public.empresa_obrigacoes o join public.modelos_checklist m on m.id = o.modelo_id
                             join public.empresas e on e.id = o.empresa_id
                             where e.razao_social = 'Empresa Y' and m.codigo_padrao = 'das' and o.aplicada)
                 and exists (select 1 from public.empresa_obrigacoes o join public.modelos_checklist m on m.id = o.modelo_id
                             join public.empresas e on e.id = o.empresa_id
                             where e.razao_social = 'Empresa Y' and m.codigo_padrao = 'folha' and o.aplicada),
  'Simples de comércio com funcionários recebe DAS e folha');
select pg_temp.check(not exists (select 1 from public.empresa_obrigacoes o join public.modelos_checklist m on m.id = o.modelo_id
                             where m.codigo_padrao = 'cbs_ibs' and o.aplicada), 'item desativado não se aplica a ninguém');

-- Mudar o regime muda as obrigações na hora
update public.empresas set regime = 'real' where razao_social = 'Empresa X';
select pg_temp.check(exists (select 1 from public.empresa_obrigacoes o join public.modelos_checklist m on m.id = o.modelo_id
                             join public.empresas e on e.id = o.empresa_id
                             where e.razao_social = 'Empresa X' and m.codigo_padrao = 'ecd' and o.aplicada), 'trocar regime atualiza as obrigações');

-- Exceções
insert into public.empresa_item_excecoes (empresa_id, modelo_id, incluir)
select e.id, m.id, false from public.empresas e, public.modelos_checklist m
where e.razao_social = 'Empresa X' and m.codigo_padrao = 'iss';
insert into public.empresa_item_excecoes (empresa_id, modelo_id, incluir)
select e.id, m.id, true from public.empresas e, public.modelos_checklist m
where e.razao_social = 'Empresa X' and m.codigo_padrao = 'icms';
select pg_temp.check((select not aplicada and pela_regra from public.empresa_obrigacoes o join public.modelos_checklist m on m.id = o.modelo_id
                      join public.empresas e on e.id = o.empresa_id where e.razao_social = 'Empresa X' and m.codigo_padrao = 'iss'),
  'exceção tira um item que a regra aplicaria');
select pg_temp.check((select aplicada and not pela_regra from public.empresa_obrigacoes o join public.modelos_checklist m on m.id = o.modelo_id
                      join public.empresas e on e.id = o.empresa_id where e.razao_social = 'Empresa X' and m.codigo_padrao = 'icms'),
  'exceção acrescenta um item que a regra não aplicaria');

-- Fiscal vê as obrigações fiscais das suas empresas, mas não altera exceções
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check((select count(distinct area) from public.empresa_obrigacoes) = 1
                 and (select min(area) from public.empresa_obrigacoes) = 'fiscal', 'fiscal só enxerga obrigações fiscais');
delete from public.empresa_item_excecoes;
reset role;
select pg_temp.check((select count(*) from public.empresa_item_excecoes) = 2, 'fiscal não apaga exceções');
set role authenticated;

-- Outro escritório não mistura
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.check(not exists (select 1 from public.modelos_checklist m join public.escritorios e on e.id = m.escritorio_id where e.nome = 'Escritório A'),
  'gestor de outro escritório não vê os modelos do A');
reset role;

\echo TODOS OS TESTES DA ETAPA 2 PASSARAM
