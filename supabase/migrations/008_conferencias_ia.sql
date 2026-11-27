-- =====================================================================
-- Conferência contábil com IA
--   * Qualquer pessoa da equipe envia arquivos (balancete, razão, extrato,
--     guias, folha…) e a IA aponta divergências e pontos de atenção.
--   * A chamada à IA é feita pela função segura "conferencia-ia" (a chave da
--     IA fica só no servidor do Supabase, nunca no programa).
--   * Cada conferência fica registrada: quem pediu, empresa/tarefa, arquivos
--     analisados e o resultado — para consulta e auditoria.
--   * Quem vê: o Gestor vê todas do escritório; o usuário vê as que ele fez e
--     as das empresas/tarefas que ele pode ver.
--   * Depois do resultado, dá para fazer perguntas sobre a conferência: a IA
--     responde olhando os mesmos arquivos (guardados num armazenamento
--     privado que só a função acessa) e o que já respondeu antes.
--   * A IA é só um apoio: o resultado nunca altera a situação da tarefa.
-- =====================================================================

create table if not exists public.conferencias_ia (
  id             uuid primary key default gen_random_uuid(),
  escritorio_id  uuid not null default public.meu_escritorio() references public.escritorios(id) on delete cascade,
  empresa_id     uuid references public.empresas(id) on delete set null,
  tarefa_id      uuid references public.tarefas(id) on delete set null,
  tipo           text not null check (tipo in ('balancete', 'conciliacao_bancaria', 'guias_impostos', 'folha', 'livre')),
  instrucoes     text check (length(instrucoes) <= 2000),
  arquivos       jsonb not null default '[]'::jsonb,   -- [{nome, tipo, tamanho}]
  conclusao      text not null check (conclusao in ('sem_divergencias', 'atencao', 'divergencias', 'inconclusivo')),
  resumo         text not null,
  resultado      jsonb not null,                       -- resposta completa da IA (itens conferidos, divergências…)
  modelo         text,
  tokens_entrada integer,
  tokens_saida   integer,
  criado_por     uuid not null default auth.uid() references public.membros(id) on delete cascade,
  criado_em      timestamptz not null default now()
);
create index if not exists conferencias_escritorio_idx on public.conferencias_ia(escritorio_id, criado_em desc);
create index if not exists conferencias_tarefa_idx on public.conferencias_ia(tarefa_id) where tarefa_id is not null;
create index if not exists conferencias_empresa_idx on public.conferencias_ia(empresa_id) where empresa_id is not null;

-- Empresa e tarefa precisam ser do mesmo escritório (e a tarefa, da empresa informada)
create or replace function public.validar_conferencia_ia()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_emp uuid;
begin
  if new.empresa_id is not null and not exists (
    select 1 from public.empresas where id = new.empresa_id and escritorio_id = new.escritorio_id
  ) then
    raise exception 'Empresa inválida.' using errcode = 'P0001';
  end if;
  if new.tarefa_id is not null then
    select empresa_id into v_emp from public.tarefas where id = new.tarefa_id and escritorio_id = new.escritorio_id;
    if v_emp is null then
      raise exception 'Tarefa inválida.' using errcode = 'P0001';
    end if;
    new.empresa_id := coalesce(new.empresa_id, v_emp);
    if new.empresa_id <> v_emp then
      raise exception 'A tarefa não é desta empresa.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists conferencias_validar on public.conferencias_ia;
create trigger conferencias_validar before insert on public.conferencias_ia
  for each row execute function public.validar_conferencia_ia();

alter table public.conferencias_ia enable row level security;

drop policy if exists conferencias_select on public.conferencias_ia;
create policy conferencias_select on public.conferencias_ia for select to authenticated
  using (
    escritorio_id = public.meu_escritorio()
    and (
      public.sou_gestor()
      or criado_por = auth.uid()
      or (tarefa_id is not null and public.posso_ver_tarefa(tarefa_id))
      or (tarefa_id is null and empresa_id is not null and public.posso_ver_empresa(empresa_id))
    )
  );

-- Inserção: só pela função segura, em nome de quem está conectado, e com acesso à empresa/tarefa
drop policy if exists conferencias_insert on public.conferencias_ia;
create policy conferencias_insert on public.conferencias_ia for insert to authenticated
  with check (
    escritorio_id = public.meu_escritorio()
    and criado_por = auth.uid()
    and (tarefa_id is null or public.posso_ver_tarefa(tarefa_id))
    and (empresa_id is null or public.posso_ver_empresa(empresa_id))
  );

-- Apagar: quem fez ou o Gestor
drop policy if exists conferencias_delete on public.conferencias_ia;
create policy conferencias_delete on public.conferencias_ia for delete to authenticated
  using (escritorio_id = public.meu_escritorio() and (criado_por = auth.uid() or public.sou_gestor()));

grant select, insert, delete on public.conferencias_ia to authenticated;
revoke all on public.conferencias_ia from anon;

-- ---------------------------------------------------------------------
-- Perguntas sobre uma conferência (conversa com a IA)
-- Quem vê a conferência vê as perguntas; apagar a conferência apaga tudo.
-- ---------------------------------------------------------------------
create table if not exists public.conferencia_perguntas (
  id              uuid primary key default gen_random_uuid(),
  conferencia_id  uuid not null references public.conferencias_ia(id) on delete cascade,
  pergunta        text not null check (length(trim(pergunta)) between 3 and 2000),
  resposta        text not null,
  modelo          text,
  tokens_entrada  integer,
  tokens_saida    integer,
  criado_por      uuid not null default auth.uid() references public.membros(id) on delete cascade,
  criado_em       timestamptz not null default now()
);
create index if not exists conferencia_perguntas_idx on public.conferencia_perguntas(conferencia_id, criado_em);
create index if not exists conferencia_perguntas_autor_idx on public.conferencia_perguntas(criado_por, criado_em);

alter table public.conferencia_perguntas enable row level security;

-- As regras da conferência valem aqui (a subconsulta respeita as regras de conferencias_ia)
drop policy if exists perguntas_select on public.conferencia_perguntas;
create policy perguntas_select on public.conferencia_perguntas for select to authenticated
  using (exists (select 1 from public.conferencias_ia c where c.id = conferencia_id));

drop policy if exists perguntas_insert on public.conferencia_perguntas;
create policy perguntas_insert on public.conferencia_perguntas for insert to authenticated
  with check (criado_por = auth.uid() and exists (select 1 from public.conferencias_ia c where c.id = conferencia_id));

grant select, insert on public.conferencia_perguntas to authenticated;
revoke all on public.conferencia_perguntas from anon;

-- ---------------------------------------------------------------------
-- Armazenamento privado dos arquivos conferidos (para as perguntas).
-- Sem regras para usuários: só a função "conferencia-ia" (chave de serviço)
-- lê e grava. Caminho: <conferencia_id>.json
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage')
     and exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('conferencias', 'conferencias', false, 31457280)  -- até 30 MB (arquivos de uma conferência)
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
  end if;
end $$;
