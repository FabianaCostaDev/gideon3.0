-- Contador de usos do Gideon por pessoa e por dia.
-- Só a função de servidor (gideon-ia) mexe aqui; o site não tem acesso.

create table if not exists public.ia_uso (
  user_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  chamadas integer not null default 0,
  primary key (user_id, dia)
);

alter table public.ia_uso enable row level security;
-- Sem políticas de propósito: nenhum usuário lê ou altera direto.

create or replace function public.registrar_uso_ia(p_user uuid, p_dia date)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.ia_uso (user_id, dia, chamadas)
  values (p_user, p_dia, 1)
  on conflict (user_id, dia) do update set chamadas = public.ia_uso.chamadas + 1
  returning chamadas;
$$;

revoke execute on function public.registrar_uso_ia(uuid, date) from public, anon, authenticated;
grant execute on function public.registrar_uso_ia(uuid, date) to service_role;
