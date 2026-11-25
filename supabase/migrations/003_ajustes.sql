-- =====================================================================
-- Ajuste: permitir excluir um escritório inteiro (a regra "precisa ter um
-- Gestor ativo" só vale enquanto o escritório existe).
-- =====================================================================
create or replace function public.proteger_membros()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.escritorios where id = old.escritorio_id) then
    return old; -- o escritório inteiro está sendo excluído
  end if;

  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.escritorio_id <> old.escritorio_id or new.email <> old.email then
      raise exception 'Não é permitido alterar escritório, e-mail ou identificador do usuário.'
        using errcode = 'P0001';
    end if;
  end if;

  if (tg_op = 'DELETE' or new.papel <> 'gestor' or not new.ativo)
     and old.papel = 'gestor' and old.ativo
     and not exists (select 1 from public.membros
                     where escritorio_id = old.escritorio_id and papel = 'gestor' and ativo and id <> old.id)
  then
    raise exception 'O escritório precisa ter pelo menos um Gestor ativo.' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
