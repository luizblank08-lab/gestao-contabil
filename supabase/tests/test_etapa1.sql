-- Testes das regras de acesso da Etapa 1. Qualquer falha interrompe com erro.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\o /dev/null

insert into auth.users values
 ('00000000-0000-0000-0000-00000000000a','gestor.a@teste.com'),
 ('00000000-0000-0000-0000-00000000000f','fiscal@teste.com'),
 ('00000000-0000-0000-0000-00000000000c','contabil@teste.com'),
 ('00000000-0000-0000-0000-00000000000b','gestor.b@teste.com'),
 ('00000000-0000-0000-0000-0000000000ff','semescritorio@teste.com');

create or replace function pg_temp.como(p uuid) returns void language sql as
$$ select set_config('request.jwt.claim.sub', p::text, false) $$;
create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as
$$ begin if not cond then raise exception 'FALHOU: %', msg; end if; raise notice 'ok - %', msg; end $$;
grant execute on all functions in schema pg_temp to authenticated;

set role authenticated;

-- Gestor A cria escritório
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select public.criar_escritorio('Escritório A', '', 'Gestora A') \gset esc_a_
select pg_temp.check(public.sou_gestor(), 'criador vira gestor');

-- Não pode criar dois escritórios
do $$ begin
  perform public.criar_escritorio('Outro', '', 'X');
  raise exception 'FALHOU: criou segundo escritório';
exception when sqlstate 'P0001' then raise notice 'ok - não cria segundo escritório'; end $$;

-- Gestor B cria outro escritório
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select public.criar_escritorio('Escritório B', '', 'Gestor B');
insert into public.empresas (cnpj, razao_social, regime, uf, municipio)
values ('11222333000181', 'Empresa do B', 'simples', 'SP', 'São Paulo');

-- Membros de A (normalmente criados pela função admin-usuarios, com service_role)
reset role;
insert into public.membros (id, escritorio_id, nome, email, papel, areas, todas_empresas)
select '00000000-0000-0000-0000-00000000000f', id, 'Fábio Fiscal', 'fiscal@teste.com', 'usuario', '{fiscal}', false
from public.escritorios where nome = 'Escritório A';
insert into public.membros (id, escritorio_id, nome, email, papel, areas, todas_empresas)
select '00000000-0000-0000-0000-00000000000c', id, 'Carla Contábil', 'contabil@teste.com', 'usuario', '{contabil}', true
from public.escritorios where nome = 'Escritório A';
set role authenticated;

-- Gestor A cadastra empresas
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
insert into public.empresas (cnpj, razao_social, regime, uf, municipio, resp_fiscal_id, resp_contabil_id)
values ('11444777000161', 'Empresa X', 'presumido', 'SP', 'Campinas',
        '00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-00000000000c');
insert into public.empresas (cnpj, razao_social, regime, uf, municipio)
values ('04252011000110', 'Empresa Y', 'simples', 'MG', 'Belo Horizonte');
select pg_temp.check((select count(*) from public.empresas) = 2, 'gestor A vê só as 2 empresas dele (não vê a do B)');
select pg_temp.check((select count(*) from public.membros) = 3, 'gestor A vê os 3 membros do escritório A');

-- Responsável com área errada é recusado
do $$ begin
  update public.empresas set resp_fiscal_id = '00000000-0000-0000-0000-00000000000c' where razao_social = 'Empresa Y';
  raise exception 'FALHOU: aceitou responsável sem a área';
exception when sqlstate 'P0001' then raise notice 'ok - recusa responsável fiscal que não é fiscal'; end $$;

-- Gestor A não consegue inserir empresa no escritório B
reset role;
select set_config('teste.esc_b', (select id::text from public.escritorios where nome = 'Escritório B'), false);
set role authenticated;
do $$ begin
  insert into public.empresas (escritorio_id, cnpj, razao_social, regime, uf, municipio)
  values (current_setting('teste.esc_b')::uuid, '99888777000100', 'Invasora', 'mei', 'RJ', 'Rio');
  raise exception 'FALHOU: inseriu em outro escritório';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok - não insere empresa em outro escritório';
end $$;

-- Fiscal: só vê a Empresa X (é responsável fiscal dela)
select pg_temp.como('00000000-0000-0000-0000-00000000000f');
select pg_temp.check((select count(*) from public.empresas) = 1, 'fiscal vê só a empresa que atende');
select pg_temp.check((select razao_social from public.empresas) = 'Empresa X', 'fiscal vê a Empresa X');
select pg_temp.check(public.minhas_areas() = '{fiscal}', 'fiscal tem só a área fiscal');
select pg_temp.check(public.posso_area_empresa('fiscal', (select id from public.empresas limit 1)), 'fiscal pode itens fiscais da X');
select pg_temp.check(not public.posso_area_empresa('contabil', (select id from public.empresas limit 1)), 'fiscal NÃO pode itens contábeis da X');

-- Fiscal não altera nem cria empresas, nem se promove
update public.empresas set razao_social = 'Hackeada';
select pg_temp.check(not exists (select 1 from public.empresas where razao_social = 'Hackeada'), 'fiscal não altera empresa');
update public.membros set papel = 'gestor', todas_empresas = true where id = auth.uid();
select pg_temp.check(not public.sou_gestor(), 'fiscal não se promove a gestor');
do $$ begin
  insert into public.empresas (cnpj, razao_social, regime, uf, municipio) values ('11222333000181','Nova','mei','SP','SP');
  raise exception 'FALHOU: fiscal criou empresa';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok - fiscal não cria empresa';
end $$;
do $$ begin
  perform public.transferir_responsabilidades('00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000f');
  raise exception 'FALHOU: fiscal transferiu';
exception when sqlstate '42501' then raise notice 'ok - fiscal não transfere responsabilidades'; end $$;

-- Contábil: atende todas
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from public.empresas) = 2, 'contábil (todas as empresas) vê as 2');
select pg_temp.check(not public.posso_area_empresa('fiscal', (select id from public.empresas limit 1)), 'contábil NÃO pode itens fiscais');

-- Gestor B não vê nada do A
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.empresas) = 1, 'gestor B vê só a empresa dele');
select pg_temp.check(not exists (select 1 from public.membros where nome like '%Fiscal%'), 'gestor B não vê equipe do A');
update public.membros set ativo = false where id = '00000000-0000-0000-0000-00000000000f';
reset role;
select pg_temp.check((select ativo from public.membros where id = '00000000-0000-0000-0000-00000000000f'), 'gestor B não desativa usuário do A');
set role authenticated;

-- Usuário sem escritório não vê nada
select pg_temp.como('00000000-0000-0000-0000-0000000000ff');
select pg_temp.check((select count(*) from public.empresas) = 0 and (select count(*) from public.escritorios) = 0, 'usuário sem escritório não vê nada');

-- Gestor A: lista de empresas e transferência
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select public.definir_empresas_membro('00000000-0000-0000-0000-00000000000f',
  array(select id from public.empresas where razao_social = 'Empresa Y'));
select pg_temp.como('00000000-0000-0000-0000-00000000000f');
select pg_temp.check((select count(*) from public.empresas) = 2, 'fiscal passa a ver Y depois de designada');

-- Gestor desativa o fiscal: ele deixa de ver tudo e sai da responsabilidade
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update public.membros set ativo = false where id = '00000000-0000-0000-0000-00000000000f';
select pg_temp.check((select resp_fiscal_id from public.empresas where razao_social = 'Empresa X') is null, 'desativado deixa de ser responsável');
select pg_temp.como('00000000-0000-0000-0000-00000000000f');
select pg_temp.check((select count(*) from public.empresas) = 0, 'usuário desativado não vê nada');

-- Gestor único não pode se rebaixar/desativar
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
do $$ begin
  update public.membros set ativo = false where id = auth.uid();
  raise exception 'FALHOU: desativou último gestor';
exception when sqlstate 'P0001' then raise notice 'ok - não remove o último gestor'; end $$;

-- Transferência
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update public.membros set ativo = true where id = '00000000-0000-0000-0000-00000000000f';
update public.empresas set resp_fiscal_id = '00000000-0000-0000-0000-00000000000f';
reset role;
insert into auth.users values ('00000000-0000-0000-0000-0000000000f2','fiscal2@teste.com');
insert into public.membros (id, escritorio_id, nome, email, areas)
select '00000000-0000-0000-0000-0000000000f2', id, 'Fiscal 2', 'fiscal2@teste.com', '{fiscal}'
from public.escritorios where nome = 'Escritório A';
set role authenticated;
select pg_temp.check(public.transferir_responsabilidades('00000000-0000-0000-0000-00000000000f','00000000-0000-0000-0000-0000000000f2') = 2, 'transfere 2 responsabilidades fiscais');
select pg_temp.check((select count(*) from public.empresas where resp_fiscal_id = '00000000-0000-0000-0000-0000000000f2') = 2, 'novo responsável assumiu');

-- Importação por planilha
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.check(public.importar_empresas('[
  {"codigo":"410","razao_social":"AGRO TESTE","regime":"presumido","resp_fiscal_id":"00000000-0000-0000-0000-0000000000f2","resp_contabil_id":"00000000-0000-0000-0000-00000000000c"},
  {"codigo":"212","razao_social":"SEM REGIME","regime":""}
]'::jsonb) = '{"criadas":2,"atualizadas":0}'::jsonb, 'importa 2 empresas novas');
select pg_temp.check((select not cadastro_completo from public.empresas where codigo = '410'), 'importada sem CNPJ fica como cadastro incompleto');
select pg_temp.check(public.importar_empresas('[{"codigo":"410","razao_social":"AGRO TESTE LTDA","regime":""}]'::jsonb)
  = '{"criadas":0,"atualizadas":1}'::jsonb, 'reimportar atualiza pelo código, sem duplicar');
select pg_temp.check((select regime = 'presumido' and resp_fiscal_id is not null and razao_social = 'AGRO TESTE LTDA'
  from public.empresas where codigo = '410'), 'campos vazios na reimportação não apagam dados');
do $$ begin
  perform public.importar_empresas('[{"codigo":"1","razao_social":"X","resp_fiscal_id":"00000000-0000-0000-0000-00000000000c"}]'::jsonb);
  raise exception 'FALHOU: aceitou contábil como responsável fiscal';
exception when sqlstate 'P0001' then raise notice 'ok - importação respeita a área do responsável'; end $$;
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
do $$ begin
  perform public.importar_empresas('[{"codigo":"9","razao_social":"X"}]'::jsonb);
  raise exception 'FALHOU: usuário importou';
exception when sqlstate '42501' then raise notice 'ok - só o gestor importa'; end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.check(public.importar_empresas('[{"codigo":"410","razao_social":"DO B"}]'::jsonb)
  = '{"criadas":1,"atualizadas":0}'::jsonb, 'mesmo código em outro escritório não mexe no escritório A');

-- Excluir o escritório inteiro funciona (e apaga tudo dele)
reset role;
delete from public.escritorios where nome = 'Escritório B';
select pg_temp.check(not exists (select 1 from public.empresas where razao_social in ('Empresa do B','DO B')), 'excluir escritório apaga os dados dele');
select pg_temp.check(not exists (select 1 from public.membros where id = '00000000-0000-0000-0000-00000000000b'), 'excluir escritório apaga a equipe dele');
select pg_temp.check((select count(*) from public.empresas) > 0, 'outros escritórios continuam intactos');

\echo TODOS OS TESTES PASSARAM
