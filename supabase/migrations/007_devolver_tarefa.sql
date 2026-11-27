-- =====================================================================
-- Revisão do Gestor: devolver tarefa para correção
--   * O Gestor revisa uma tarefa feita (ou "não se aplica") e, se houver
--     pendência, devolve para o responsável com uma observação obrigatória.
--   * A tarefa volta a "pendente", marcada como devolvida, com o motivo.
--   * Quando o responsável marca como feita de novo, a marca de devolvida sai
--     (o histórico guarda tudo).
-- =====================================================================

alter table public.tarefas add column if not exists devolvida_em timestamptz;
alter table public.tarefas add column if not exists devolvida_por uuid references public.membros(id) on delete set null;
alter table public.tarefas add column if not exists motivo_devolucao text;
alter table public.tarefas add column if not exists devolucoes integer not null default 0;

create or replace function public.devolver_tarefa(p_tarefa uuid, p_motivo text)
returns public.tarefas language plpgsql security definer set search_path = public as $$
declare v public.tarefas;
begin
  if not public.sou_gestor() then
    raise exception 'Apenas o Gestor pode devolver tarefas.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escreva o que precisa ser corrigido.' using errcode = 'P0001';
  end if;
  select * into v from public.tarefas where id = p_tarefa and escritorio_id = public.meu_escritorio() for update;
  if v.id is null then
    raise exception 'Tarefa não encontrada.' using errcode = 'P0001';
  end if;
  if v.status = 'pendente' then
    raise exception 'Só é possível devolver uma tarefa marcada como feita ou "não se aplica".' using errcode = 'P0001';
  end if;

  -- Marca a devolução antes de mudar a situação (o gatilho de histórico usa estes campos)
  perform set_config('gc.devolvendo', 'sim', true);
  update public.tarefas set
    status = 'pendente',
    devolvida_em = now(),
    devolvida_por = auth.uid(),
    motivo_devolucao = left(trim(p_motivo), 1000),
    devolucoes = devolucoes + 1
  where id = v.id
  returning * into v;
  perform set_config('gc.devolvendo', '', true);
  return v;
end $$;
revoke execute on function public.devolver_tarefa(uuid, text) from anon, public;
grant execute on function public.devolver_tarefa(uuid, text) to authenticated;

-- Gatilho de atualização: protege os campos da devolução e limpa a marca quando a tarefa é concluída de novo
create or replace function public.antes_atualizar_tarefa()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_gestor boolean := public.sou_gestor();
  v_devolvendo boolean := coalesce(current_setting('gc.devolvendo', true), '') = 'sim';
begin
  if auth.uid() is not null then
    if new.escritorio_id <> old.escritorio_id or new.empresa_id <> old.empresa_id
       or new.modelo_id is distinct from old.modelo_id or new.competencia <> old.competencia
       or new.periodo_ref <> old.periodo_ref or new.area <> old.area or new.periodicidade <> old.periodicidade then
      raise exception 'Estes dados da tarefa não podem ser alterados.' using errcode = 'P0001';
    end if;
    if not v_gestor and (new.responsavel_id is distinct from old.responsavel_id
                         or new.vencimento <> old.vencimento or new.nome <> old.nome) then
      raise exception 'Apenas o Gestor pode alterar o responsável, o nome ou o vencimento.' using errcode = '42501';
    end if;
    -- Os campos da devolução só mudam pela função devolver_tarefa (ou ao concluir de novo, abaixo)
    if not v_devolvendo and (new.devolvida_por is distinct from old.devolvida_por
                             or new.motivo_devolucao is distinct from old.motivo_devolucao
                             or new.devolucoes <> old.devolucoes
                             or (new.devolvida_em is distinct from old.devolvida_em and new.devolvida_em is not null)) then
      raise exception 'Use "Devolver para correção" para devolver uma tarefa.' using errcode = '42501';
    end if;
  end if;

  if new.status = 'feito' and old.status <> 'feito' then
    new.concluido_em := coalesce(new.concluido_em, public.hoje_sp());
    new.concluido_por := coalesce(auth.uid(), new.concluido_por);
  elsif new.status <> 'feito' then
    new.concluido_em := null;
    new.concluido_por := null;
  end if;
  if new.status = 'nao_se_aplica' and old.status <> 'nao_se_aplica' then
    new.concluido_por := auth.uid();
  end if;
  -- Concluída de novo: deixa de estar "devolvida" (o motivo continua no histórico)
  if new.status <> 'pendente' and old.status = 'pendente' and not v_devolvendo then
    new.devolvida_em := null;
  end if;

  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;

-- Histórico: registra a devolução com o motivo
create or replace function public.registrar_historico_tarefa()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rotulo constant jsonb := '{"pendente":"Pendente","feito":"Feito","nao_se_aplica":"Não se aplica"}';
begin
  if tg_op = 'INSERT' then
    insert into public.tarefa_historico (tarefa_id, membro_id, acao, detalhe)
    values (new.id, auth.uid(), 'criada', null);
    return new;
  end if;
  if new.devolucoes > old.devolucoes then
    insert into public.tarefa_historico (tarefa_id, membro_id, acao, detalhe)
    values (new.id, auth.uid(), 'devolvida', new.motivo_devolucao);
  elsif new.status <> old.status then
    insert into public.tarefa_historico (tarefa_id, membro_id, acao, detalhe)
    values (new.id, auth.uid(), 'status', format('%s → %s', rotulo->>old.status, rotulo->>new.status));
  elsif new.concluido_em is distinct from old.concluido_em then
    insert into public.tarefa_historico (tarefa_id, membro_id, acao, detalhe)
    values (new.id, auth.uid(), 'data', coalesce(to_char(new.concluido_em, 'DD/MM/YYYY'), 'sem data'));
  end if;
  if new.observacao is distinct from old.observacao then
    insert into public.tarefa_historico (tarefa_id, membro_id, acao, detalhe)
    values (new.id, auth.uid(), 'observacao', left(coalesce(new.observacao, ''), 300));
  end if;
  if new.responsavel_id is distinct from old.responsavel_id then
    insert into public.tarefa_historico (tarefa_id, membro_id, acao, detalhe)
    values (new.id, auth.uid(), 'responsavel',
            coalesce((select nome from public.membros where id = new.responsavel_id), 'sem responsável'));
  end if;
  return new;
end $$;

create index if not exists tarefas_devolvidas_idx on public.tarefas(escritorio_id) where devolvida_em is not null;
