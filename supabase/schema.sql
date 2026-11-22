-- Nexos — banco de dados (Supabase, projeto "nexos"). Este arquivo é a referência do que está aplicado.
-- Modelo: cada registro do sistema é um documento JSON em public.registros (colecao + id).
-- Acesso: só quem está em public.membros lê ou grava. A primeira conta vira dona; as demais entram por convite.
-- Fora deste arquivo (painel do Supabase, Authentication): o sistema só usa e-mail e senha e nunca usa o cadastro
-- público do Supabase. Toda conta nasce pela função de borda "cadastro". Por isso "Allow new users to sign up"
-- deve ficar DESLIGADO e "Confirm email" LIGADO.

create schema if not exists private;

-- Marca que o sistema já tem dono (nunca volta a ficar "sem dono").
create table private.instalacao (
  id boolean primary key default true check (id),
  dono_definido_em timestamptz not null default now()
);

-- Código de primeiro acesso (10 letras/números): só o resumo (sha256) fica guardado. Serve para criar a
-- primeira conta e, depois, como chave de recuperação da senha de quem administra. Não há trava por
-- tentativas (o código é longo demais para adivinhar e uma trava deixaria um estranho bloquear o dono).
create table private.primeiro_acesso (
  id boolean primary key default true check (id),
  hash text not null,
  tentativas int not null default 0
);
-- insert into private.primeiro_acesso (hash) values ('<sha256 do código em maiúsculas, sem traço>');   -- feito à parte, fora do repositório

-- Código aleatório em letras e números sem caracteres parecidos (0/O, 1/I). Usa os bytes aleatórios de um uuid.
create or replace function private.novo_codigo(n int default 8) returns text
language plpgsql volatile set search_path = ''
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  pos constant int[] := array[0,1,2,3,4,5,7,9,10,11,12,13,14,15];
  b bytea := uuid_send(gen_random_uuid());
  s text := '';
begin
  for i in 1..least(n, 14) loop
    s := s || substr(alfabeto, (get_byte(b, pos[i]) % 32) + 1, 1);
  end loop;
  return s;
end $$;

create table public.membros (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  papel text not null default 'membro' check (papel in ('dono','membro')),
  criado_em timestamptz not null default now()
);
-- Cada convite tem um código próprio (8 letras/números) e vale 7 dias. Quem convida informa só o e-mail:
-- código, data e autor são preenchidos pelo banco (a permissão de INSERT é só na coluna email).
create table public.convites (
  email text primary key check (email = lower(email)),
  criado_em timestamptz not null default now(),
  codigo text not null default private.novo_codigo(8),
  criado_por uuid default auth.uid()
);
create table public.registros (
  colecao text not null,
  id text not null,
  dados jsonb not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  primary key (colecao, id)
);
alter table public.membros enable row level security;
alter table public.convites enable row level security;
alter table public.registros enable row level security;

create or replace function private.eh_membro() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.membros where user_id = (select auth.uid())) $$;

create or replace function private.eh_dono() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.membros where user_id = (select auth.uid()) and papel = 'dono') $$;

create or replace function private.toca_registro() returns trigger
language plpgsql set search_path = ''
as $$ begin new.atualizado_em := now(); new.atualizado_por := auth.uid(); return new; end $$;

create trigger registros_toca before insert or update on public.registros
for each row execute function private.toca_registro();

-- Quem sai da equipe leva junto os convites do próprio e-mail e os que criou: sem isso, um convite esquecido
-- recolocaria a pessoa removida na equipe. Roda também quando a conta é apagada no painel (ON DELETE CASCADE).
create or replace function private.limpa_convites_do_removido() returns trigger
language plpgsql security definer set search_path = ''
as $$ begin
  delete from public.convites c where c.email = lower(old.email) or c.criado_por = old.user_id;
  return old;
end $$;

create trigger membros_limpa_convites after delete on public.membros
for each row execute function private.limpa_convites_do_removido();

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on function private.eh_membro() to authenticated;
grant execute on function private.eh_dono() to authenticated;

-- Quem pode convidar um e-mail: pessoa nova, qualquer membro; membro comum (redefinir a senha), só a dona;
-- a dona, ninguém (a senha dela só muda com o código de primeiro acesso).
create or replace function private.pode_convidar(p_email text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when not exists (select 1 from public.membros m where m.email = lower(p_email)) then true
    when exists (select 1 from public.membros m where m.email = lower(p_email) and m.papel = 'dono') then false
    else exists (select 1 from public.membros d where d.user_id = (select auth.uid()) and d.papel = 'dono')
  end
$$;
revoke execute on function private.limpa_convites_do_removido() from public, anon, authenticated;
revoke execute on function private.novo_codigo(int) from public, anon;
grant execute on function private.novo_codigo(int) to authenticated;
revoke execute on function private.pode_convidar(text) from public, anon;
grant execute on function private.pode_convidar(text) to authenticated;

-- Confere o código de primeiro acesso (chamada só pela função de cadastro, com a chave de serviço).
create or replace function public.confere_codigo(p text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  limpo text := upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  select * into r from private.primeiro_acesso;
  if not found then return 'sem_codigo'; end if;
  if limpo <> '' and encode(sha256(convert_to(limpo, 'UTF8')), 'hex') = r.hash then return 'ok'; end if;
  update private.primeiro_acesso set tentativas = tentativas + 1 where id;   -- só contagem, não bloqueia
  return 'errado';
end $$;
revoke execute on function public.confere_codigo(text) from public, anon, authenticated;
grant execute on function public.confere_codigo(text) to service_role;

-- Confere o código de um convite (chamada só pela função de cadastro). "Sem convite" e "código errado"
-- devolvem a mesma resposta, para não revelar quem foi convidado.
create or replace function public.confere_convite(p_email text, p_codigo text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  c record;
  limpo text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  select * into c from public.convites where email = lower(coalesce(p_email, ''));
  if not found or limpo = '' or c.codigo <> limpo then return 'recusado'; end if;
  if c.criado_em < now() - interval '7 days' then return 'vencido'; end if;
  return 'ok';
end $$;
revoke execute on function public.confere_convite(text, text) from public, anon, authenticated;
grant execute on function public.confere_convite(text, text) to service_role;

-- Chamada logo depois do login. Só contas com a marca nexos = true no app_metadata (que só a função de cadastro
-- grava, com a chave de serviço) podem virar dona (a primeira) ou membro (se tiverem convite dentro do prazo).
create or replace function public.entrar() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mail text;
begin
  if uid is null then return 'anon'; end if;
  select lower(u.email) into mail from auth.users u
   where u.id = uid and u.email_confirmed_at is not null
     and coalesce(u.raw_app_meta_data ->> 'nexos', '') = 'true';
  if exists (select 1 from public.membros where user_id = uid) then
    if mail is not null then delete from public.convites c where c.email = mail; end if;
    return 'ok';
  end if;
  if mail is null then return 'sem_acesso'; end if;
  perform pg_advisory_xact_lock(424242);
  if not exists (select 1 from private.instalacao) then
    insert into private.instalacao default values;
    insert into public.membros (user_id, email, papel) values (uid, mail, 'dono');
    return 'ok';
  end if;
  if exists (select 1 from public.convites c where c.email = mail and c.criado_em >= now() - interval '7 days') then
    insert into public.membros (user_id, email, papel) values (uid, mail, 'membro');
    delete from public.convites c where c.email = mail;
    return 'ok';
  end if;
  return 'sem_acesso';
end $$;
revoke execute on function public.entrar() from public, anon;
grant execute on function public.entrar() to authenticated;

revoke all on public.registros, public.membros, public.convites from anon;
revoke all on public.registros, public.membros, public.convites from authenticated;
grant select, insert, update, delete on public.registros to authenticated;
grant select, delete on public.membros to authenticated;
grant select, delete on public.convites to authenticated;
grant insert (email) on public.convites to authenticated;          -- só o e-mail: código, data e autor vêm dos padrões da tabela
grant select on public.membros, public.convites to service_role;

create policy "membros leem registros" on public.registros for select to authenticated using ((select private.eh_membro()));
create policy "membros inserem registros" on public.registros for insert to authenticated with check ((select private.eh_membro()));
create policy "membros alteram registros" on public.registros for update to authenticated using ((select private.eh_membro())) with check ((select private.eh_membro()));
create policy "membros apagam registros" on public.registros for delete to authenticated using ((select private.eh_membro()));

create policy "membros veem a equipe" on public.membros for select to authenticated using ((select private.eh_membro()));
create policy "dono remove membros" on public.membros for delete to authenticated using ((select private.eh_dono()) and papel <> 'dono');

-- Convites: quem administra vê e cancela todos; cada membro, só os que ele mesmo criou (o código de um convite
-- ou de uma redefinição de senha não fica à vista do resto da equipe).
create policy "membros veem convites" on public.convites for select to authenticated
  using ((select private.eh_dono()) or ((select private.eh_membro()) and criado_por = (select auth.uid())));
create policy "membros criam convites" on public.convites for insert to authenticated
  with check ((select private.eh_membro()) and private.pode_convidar(email));
create policy "membros apagam convites" on public.convites for delete to authenticated
  using ((select private.eh_dono()) or ((select private.eh_membro()) and criado_por = (select auth.uid())));

-- Arquivos (fotos e modelos 3D): bucket privado, só a equipe acessa.
insert into storage.buckets (id, name, public, file_size_limit)
values ('arquivos', 'arquivos', false, 52428800) on conflict (id) do nothing;

create policy "nexos membros leem arquivos" on storage.objects for select to authenticated
  using (bucket_id = 'arquivos' and (select private.eh_membro()));
create policy "nexos membros enviam arquivos" on storage.objects for insert to authenticated
  with check (bucket_id = 'arquivos' and (select private.eh_membro()));
create policy "nexos membros alteram arquivos" on storage.objects for update to authenticated
  using (bucket_id = 'arquivos' and (select private.eh_membro()))
  with check (bucket_id = 'arquivos' and (select private.eh_membro()));
create policy "nexos membros apagam arquivos" on storage.objects for delete to authenticated
  using (bucket_id = 'arquivos' and (select private.eh_membro()));

-- Sincronização ao vivo entre os aparelhos.
alter publication supabase_realtime add table public.registros;
