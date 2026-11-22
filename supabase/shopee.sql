-- Nexos — integração com a Shopee. Aplicado no banco em 22/11/2026 (migração nexos_shopee); também está no fim do schema.sql.
-- Guarda, numa linha só, as credenciais do app da Shopee (partner_id e partner_key), o ambiente
-- (produção ou teste) e os tokens da loja conectada. Quem usa é só a função de borda "shopee", com a
-- chave de serviço (service_role). O site (anon/authenticated) não lê nem grava nada aqui.

create table private.shopee (
  id boolean primary key default true check (id),                     -- uma linha só
  partner_id bigint check (partner_id between 1 and 4294967295),
  partner_key text,
  ambiente text not null default 'producao' check (ambiente in ('producao', 'teste')),
  shop_id bigint check (shop_id between 1 and 4294967295),
  loja_nome text,
  access_token text,
  refresh_token text,
  expira_em timestamptz,               -- fim do access_token (a Shopee dá 4 horas)
  refresh_expira_em timestamptz,       -- fim do refresh_token (30 dias; cada renovação traz um novo)
  autorizacao_expira_em timestamptz,   -- fim da autorização da loja (a vendedora escolhe, até 365 dias)
  nonce text,                          -- controle de uso único do link de autorização
  nonce_criado_em timestamptz,
  ultima_sincronizacao timestamptz,
  atualizado_em timestamptz not null default now()
);

-- RLS ligada e nenhuma política: só quem ignora RLS (a service_role) enxerga a linha.
alter table private.shopee enable row level security;
revoke all on private.shopee from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update on private.shopee to service_role;

-- O PostgREST só enxerga o schema public, por isso a função de borda usa as três funções abaixo.
-- Elas rodam com as permissões de quem chama (sem security definer): só a service_role chega à tabela.

-- Lê a linha (null enquanto nada foi configurado).
create or replace function public.shopee_ler() returns jsonb
language sql stable set search_path = ''
as $$ select to_jsonb(s) from private.shopee s where s.id $$;

-- Grava só as chaves presentes em p. Com p_se_refresh, só grava se o refresh_token guardado ainda for
-- esse: assim duas renovações ao mesmo tempo não apagam uma à outra. Devolve true quando gravou.
create or replace function public.shopee_gravar(p jsonb, p_se_refresh text default null) returns boolean
language plpgsql set search_path = ''
as $$
begin
  insert into private.shopee (id) values (true) on conflict (id) do nothing;
  update private.shopee s set
    partner_id            = case when p ? 'partner_id' then (p ->> 'partner_id')::bigint else s.partner_id end,
    partner_key           = case when p ? 'partner_key' then p ->> 'partner_key' else s.partner_key end,
    ambiente              = case when p ? 'ambiente' then p ->> 'ambiente' else s.ambiente end,
    shop_id               = case when p ? 'shop_id' then (p ->> 'shop_id')::bigint else s.shop_id end,
    loja_nome             = case when p ? 'loja_nome' then p ->> 'loja_nome' else s.loja_nome end,
    access_token          = case when p ? 'access_token' then p ->> 'access_token' else s.access_token end,
    refresh_token         = case when p ? 'refresh_token' then p ->> 'refresh_token' else s.refresh_token end,
    expira_em             = case when p ? 'expira_em' then (p ->> 'expira_em')::timestamptz else s.expira_em end,
    refresh_expira_em     = case when p ? 'refresh_expira_em' then (p ->> 'refresh_expira_em')::timestamptz else s.refresh_expira_em end,
    autorizacao_expira_em = case when p ? 'autorizacao_expira_em' then (p ->> 'autorizacao_expira_em')::timestamptz else s.autorizacao_expira_em end,
    nonce                 = case when p ? 'nonce' then p ->> 'nonce' else s.nonce end,
    nonce_criado_em       = case when p ? 'nonce' then (case when p ->> 'nonce' is null then null else now() end) else s.nonce_criado_em end,
    ultima_sincronizacao  = case when p ? 'ultima_sincronizacao' then (p ->> 'ultima_sincronizacao')::timestamptz else s.ultima_sincronizacao end,
    atualizado_em         = now()
  where s.id and (p_se_refresh is null or s.refresh_token = p_se_refresh);
  return found;
end $$;

-- Confere e gasta o controle do link de autorização (vale 30 minutos). Só devolve true uma vez:
-- o UPDATE trava a linha, então duas chamadas com o mesmo valor não passam juntas.
create or replace function public.shopee_usar_nonce(p text) returns boolean
language plpgsql set search_path = ''
as $$
begin
  update private.shopee s set nonce = null, nonce_criado_em = null, atualizado_em = now()
   where s.id and s.nonce is not null and s.nonce = p
     and s.nonce_criado_em > now() - interval '30 minutes';
  return found;
end $$;

revoke execute on function public.shopee_ler() from public, anon, authenticated;
revoke execute on function public.shopee_gravar(jsonb, text) from public, anon, authenticated;
revoke execute on function public.shopee_usar_nonce(text) from public, anon, authenticated;
grant execute on function public.shopee_ler() to service_role;
grant execute on function public.shopee_gravar(jsonb, text) to service_role;
grant execute on function public.shopee_usar_nonce(text) to service_role;

-- Para desfazer:
-- drop function public.shopee_usar_nonce(text), public.shopee_gravar(jsonb, text), public.shopee_ler();
-- drop table private.shopee;
-- revoke usage on schema private from service_role;
