-- Nexos versão 16 — dois aparelhos ao mesmo tempo sem um desfazer o que o outro fez
-- Aplicado em 23/11/2026 em três migrações: nexos_gravacao_segura (tudo), nexos_gravar_trava_rapida (gravar monta a
-- lista de chaves uma vez) e nexos_gravar_usa_indices (enable_seqscan = off em gravar e numera_registro). Este arquivo
-- é o resultado final das três; o mesmo texto também está no fim de schema.sql.
--
-- 1. Cada gravação ganha um número de versão que só cresce, dado pelo banco (registros.versao).
-- 2. Toda exclusão deixa uma marca (registros_apagados), que também vai pelo canal ao vivo: o aparelho que estava sem
--    conexão sabe o que sumiu, e um aviso atrasado não ressuscita o que foi apagado.
-- 3. O número de pedido e de orçamento é conferido pelo banco no que passa pela função gravar: dois aparelhos nunca
--    dão o mesmo número, e o número não muda depois de dado.
-- 4. Função gravar(grupos): o sistema manda o que cada clique mudou (campos trocados, campos removidos, somas de
--    estoque, média do preço de compra), e não o registro inteiro. Cada grupo entra inteiro ou nada:
--    - estoque é somado na versão mais nova do banco (duas baixas quase juntas nunca apagam uma à outra);
--    - campo que o aparelho não mexeu não é regravado;
--    - registro de movimento (pedido, ordem, conta, orçamento, compra, falha, lançamento, manutenção) só muda se ninguém
--      mudou antes ("se": a versão que o aparelho tinha);
--    - o que foi excluído não volta por uma edição atrasada, e criar duas vezes o mesmo código não cria em dobro;
--    - o mesmo grupo reenviado (resposta perdida na rede) não é gravado de novo.
--    Para desfazer: drop function public.gravar(jsonb); o sistema antigo continua gravando direto na tabela.

-- 1. Versão de cada gravação ------------------------------------------------------------------------------------------
create sequence if not exists private.registros_versao as bigint;
revoke all on sequence private.registros_versao from public, anon;
grant usage on sequence private.registros_versao to authenticated;

alter table public.registros add column if not exists versao bigint;
update public.registros set versao = nextval('private.registros_versao') where versao is null;
alter table public.registros alter column versao set default nextval('private.registros_versao');
alter table public.registros alter column versao set not null;

create or replace function private.toca_registro() returns trigger
language plpgsql set search_path = ''
as $$ begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  new.versao := nextval('private.registros_versao');
  return new;
end $$;

-- Número guardado em JSON: número de verdade ou texto só com algarismos (e ponto decimal). Qualquer outra coisa: nulo.
create or replace function private.num(v jsonb) returns numeric
language sql immutable set search_path = ''
as $$ select case
  when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
  when jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then (v #>> '{}')::numeric
end $$;

create or replace function private.arred(x numeric, casas int) returns numeric
language sql immutable set search_path = ''
as $$ select trim_scale(round(x, casas)) $$;

-- 2. Marca das exclusões ----------------------------------------------------------------------------------------------
create table if not exists public.registros_apagados (
  colecao text not null,
  id text not null,
  versao bigint not null,
  apagado_em timestamptz not null default now(),
  primary key (colecao, id)
);
alter table public.registros_apagados enable row level security;
revoke all on public.registros_apagados from anon, authenticated;
grant select on public.registros_apagados to authenticated;
drop policy if exists "membros veem exclusoes" on public.registros_apagados;
create policy "membros veem exclusoes" on public.registros_apagados for select to authenticated using ((select private.eh_membro()));

create or replace function private.marca_exclusao() returns trigger
language plpgsql security definer set search_path = ''
as $$ begin
  insert into public.registros_apagados as a (colecao, id, versao, apagado_em)
  values (old.colecao, old.id, nextval('private.registros_versao'), now())
  on conflict (colecao, id) do update set versao = excluded.versao, apagado_em = excluded.apagado_em;
  if random() < 0.02 then delete from public.registros_apagados where apagado_em < now() - interval '30 days'; end if;
  return old;
end $$;
drop trigger if exists registros_marca_exclusao on public.registros;
create trigger registros_marca_exclusao after delete on public.registros
for each row execute function private.marca_exclusao();

-- (só se ainda não estiver: o arquivo pode ser rodado de novo sem erro)
do $$ begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'registros_apagados') then
    alter publication supabase_realtime add table public.registros_apagados;
  end if;
end $$;

-- 3. Número de pedido e de orçamento ----------------------------------------------------------------------------------
-- Só vale para o que passa pela função gravar (ela liga a marca nexos.via_gravar na transação). Um sistema antigo que
-- grave direto na tabela continua como antes: ele não saberia que o número mudou e mostraria o número velho.
-- Roda como dono da tabela (security definer): a busca pelo número usa o índice registros_numero sem passar pela regra
-- de acesso, que o impediria (com milhares de pedidos, uma restauração estouraria o tempo limite). enable_seqscan = off:
-- dentro de uma chamada grande o banco ainda acha a tabela pequena e varreria tudo a cada registro.
create or replace function private.numera_registro() returns trigger
language plpgsql security definer set search_path = '' set enable_seqscan = off
as $$
declare
  existente boolean := false;
  antes jsonb;
  n numeric;
begin
  if new.colecao not in ('vendas', 'orcamentos') or jsonb_typeof(new.dados) is distinct from 'object'
     or coalesce(current_setting('nexos.via_gravar', true), '') <> '1' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    existente := true; antes := old.dados -> 'numero';
  else   -- "insert ... on conflict": a linha pode já existir e virar alteração
    select true, r.dados -> 'numero' into existente, antes from public.registros r where r.colecao = new.colecao and r.id = new.id;
    existente := coalesce(existente, false);
  end if;
  if existente then
    -- o número, depois de dado, não muda; registro antigo sem número (de antes da versão 14) continua sem
    n := private.num(antes);
    if n >= 1 and n = trunc(n) then new.dados := jsonb_set(new.dados, '{numero}', to_jsonb(n)); end if;
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('nexos-numero:' || new.colecao));
  n := private.num(new.dados -> 'numero');
  if n is null or n < 1 or n <> trunc(n) or exists (
      select 1 from public.registros r
       where r.colecao = new.colecao and r.id <> new.id and private.num(r.dados -> 'numero') = n) then
    select coalesce(trunc(max(private.num(r.dados -> 'numero'))), 0) + 1 into n
      from public.registros r
     where r.colecao = new.colecao and r.id <> new.id and private.num(r.dados -> 'numero') >= 1;
  end if;
  new.dados := jsonb_set(new.dados, '{numero}', to_jsonb(trunc(n)));
  return new;
end $$;
drop trigger if exists registros_numera on public.registros;
create trigger registros_numera before insert or update on public.registros
for each row execute function private.numera_registro();
create index if not exists registros_numero on public.registros (colecao, (private.num(dados -> 'numero')));

-- 4. Função gravar ----------------------------------------------------------------------------------------------------
-- Grupos já gravados, com a versão que cada registro ficou (para um reenvio não gravar de novo e o aparelho saber em
-- que versão o grupo deixou cada registro). Ficam 30 dias.
create table if not exists public.registros_grupos (
  id text primary key,
  gravado_em timestamptz not null default now(),
  versoes jsonb
);
alter table public.registros_grupos enable row level security;
revoke all on public.registros_grupos from anon, authenticated;
grant select, insert, delete on public.registros_grupos to authenticated;
drop policy if exists "membros conferem grupos" on public.registros_grupos;
drop policy if exists "membros marcam grupos" on public.registros_grupos;
drop policy if exists "membros limpam grupos antigos" on public.registros_grupos;
create policy "membros conferem grupos" on public.registros_grupos for select to authenticated using ((select private.eh_membro()));
create policy "membros marcam grupos" on public.registros_grupos for insert to authenticated with check ((select private.eh_membro()));
create policy "membros limpam grupos antigos" on public.registros_grupos for delete to authenticated
  using ((select private.eh_membro()) and gravado_em < now() - interval '30 days');

-- O registro guardado tem sempre o próprio código no campo id (menos configuração e perfil).
create or replace function private.registro_com_id(c text, i text, d jsonb) returns jsonb
language sql immutable set search_path = ''
as $$ select case when jsonb_typeof(d) = 'object' then d else '{}'::jsonb end
             || case when c = 'meta' then '{}'::jsonb else jsonb_build_object('id', i) end $$;

-- Aplica os passos de uma alteração, em ordem. Cada passo: m (médias de preço, com o estoque de antes da soma),
-- s (campos trocados), x (campos removidos), a (somas: estoque). O campo id nunca muda.
create or replace function private.aplicar_passos(d jsonb, passos jsonb) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  p jsonb; m jsonb; k text; v jsonb;
  est numeric; qtd numeric; valor numeric; escala numeric; casas int;
begin
  if jsonb_typeof(d) is distinct from 'object' then d := '{}'; end if;
  if jsonb_typeof(passos) is distinct from 'array' then return d; end if;
  for p in select x from jsonb_array_elements(passos) x loop
    if jsonb_typeof(p) is distinct from 'object' then continue; end if;
    if jsonb_typeof(p -> 'm') = 'array' then
      for m in select x from jsonb_array_elements(p -> 'm') x loop
        if jsonb_typeof(m) is distinct from 'object' or coalesce(m ->> 'p', '') in ('', 'id') or coalesce(m ->> 'q', '') = '' then continue; end if;
        est := greatest(0, coalesce(private.num(d -> (m ->> 'q')), 0));
        qtd := private.num(m -> 'n');
        valor := coalesce(private.num(m -> 'v'), 0);
        escala := coalesce(private.num(m -> 'e'), 1);
        casas := least(8, greatest(0, coalesce(trunc(private.num(m -> 'k')), 2)))::int;
        if qtd > 0 and escala > 0 then
          d := jsonb_set(d, array[m ->> 'p'],
            to_jsonb(private.arred((est / escala * coalesce(private.num(d -> (m ->> 'p')), 0) + valor) / ((est + qtd) / escala), casas)), true);
        end if;
      end loop;
    end if;
    if jsonb_typeof(p -> 's') = 'object' then d := d || ((p -> 's') - 'id'); end if;
    if jsonb_typeof(p -> 'x') = 'array' then
      d := d - array(select x from jsonb_array_elements_text(p -> 'x') x where x <> 'id');
    end if;
    if jsonb_typeof(p -> 'a') = 'object' then
      for k, v in select e.key, e.value from jsonb_each(p -> 'a') e loop
        if k = 'id' then continue; end if;
        d := jsonb_set(d, array[k], to_jsonb(private.arred(coalesce(private.num(d -> k), 0) + coalesce(private.num(v), 0), 6)), true);
      end loop;
    end if;
  end loop;
  return d;
end $$;

-- Estoque digitado num formulário: o passo leva em "e" o valor que a janela mostrava ao abrir. Se no banco já está outro
-- (outra pessoa corrigiu ou movimentou nesse meio-tempo), devolve o nome do campo e o grupo volta, em vez de somar a
-- correção por cima. Confere passo a passo, com os passos anteriores do mesmo registro já aplicados.
create or replace function private.confere_esperado(d jsonb, passos jsonb) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  p jsonb; k text; v jsonb;
begin
  if jsonb_typeof(passos) is distinct from 'array' then return null; end if;
  if jsonb_typeof(d) is distinct from 'object' then d := '{}'; end if;
  for p in select x from jsonb_array_elements(passos) x loop
    if jsonb_typeof(p -> 'e') = 'object' then
      for k, v in select e.key, e.value from jsonb_each(p -> 'e') e loop
        if private.num(d -> k) is distinct from private.num(v) then return k; end if;
      end loop;
    end if;
    d := private.aplicar_passos(d, jsonb_build_array(p));
  end loop;
  return null;
end $$;

-- Como o registro está agora no banco: { c, i, v, e, d } ou, se não existe, { c, i, x: true, v: versão da exclusão }.
create or replace function private.linha_atual(c text, i text) returns jsonb
language sql volatile set search_path = ''
as $$ select coalesce(
  (select jsonb_build_object('c', r.colecao, 'i', r.id, 'v', r.versao, 'e', r.atualizado_em, 'd', r.dados)
     from public.registros r where r.colecao = c and r.id = i),
  jsonb_build_object('c', c, 'i', i, 'x', true,
    'v', (select a.versao from public.registros_apagados a where a.colecao = c and a.id = i))) $$;

create or replace function private.linhas_atuais(chaves jsonb) returns jsonb
language sql volatile set search_path = ''
as $$ select coalesce(jsonb_agg(private.linha_atual(s.k ->> 'c', s.k ->> 'i')), '[]'::jsonb)
        from (select distinct k from jsonb_array_elements(case when jsonb_typeof(chaves) = 'array' then chaves else '[]'::jsonb end) k) s $$;

-- grupos: [{ n, id, ops: [{ c, i, t, se?, modo?, d?, p? }] }]
--   t: novo (cria; se já existe, o grupo volta, ou é pulado com modo "ignorar"), mudar (aplica os passos; o registro
--   precisa existir e, com "se", estar nessa versão; com "e" num passo, o campo precisa estar com aquele valor),
--   mesclar (configuração e perfil: cria ou aplica os passos), trocar (substitui o registro inteiro: restauração de
--   backup), apagar (com "se", só se estiver nessa versão).
-- Devolve, para cada grupo: { n, ok: true, r: [linhas gravadas] } ou { n, ok: false, motivo, r: [como estão agora] }.
-- Grupo já gravado antes (reenvio): { n, ok: true, ja: true, r: [como estão agora], gv: [versão que ELE deixou: c, i, v] }.
create or replace function public.gravar(p_grupos jsonb) returns jsonb
language plpgsql set search_path = '' set enable_seqscan = off
as $$
declare
  colecoes constant text[] := array['canais','filamentos','fornecedores','compras','insumos','produtos','ordens','vendas',
    'clientes','orcamentos','falhas','manutItens','manutHist','lancamentos','pessoas','contas','meta'];
  g jsonb; op jsonb; ops jsonb; chaves jsonb; linha jsonb;
  saida jsonb[] := '{}'; feitos jsonb[];                   -- listas do plpgsql: acrescentar não copia tudo de novo
  c text; i text; t text; ignorar boolean; se bigint;
  d jsonb; v bigint; achou boolean; motivo text;
  kc text[]; ki text[]; numera boolean;
begin
  if not coalesce((select private.eh_membro()), false) then
    raise exception 'sem acesso' using errcode = '42501';
  end if;
  if jsonb_typeof(p_grupos) is distinct from 'array' or jsonb_array_length(p_grupos) > 200 then
    raise exception 'lote inválido' using errcode = '22023';
  end if;
  perform set_config('nexos.via_gravar', '1', true);       -- o gatilho de numeração só age no que passa por aqui
  -- as chaves do lote, numa passada só (montar a lista uma vez é muito mais rápido que comparar com o lote inteiro)
  select coalesce(array_agg(o ->> 'c'), '{}'), coalesce(array_agg(o ->> 'i'), '{}'),
         coalesce(bool_or(o ->> 'c' in ('vendas', 'orcamentos') and o ->> 't' in ('novo', 'trocar', 'mesclar')), false)
    into kc, ki, numera
    from jsonb_array_elements(p_grupos) gg,
         jsonb_array_elements(case when jsonb_typeof(gg -> 'ops') = 'array' then gg -> 'ops' else '[]'::jsonb end) o;
  -- quem cria pedido ou orçamento pega a vez da numeração antes de travar qualquer linha (sem impasse entre aparelhos)
  if numera then
    perform pg_advisory_xact_lock(hashtext('nexos-numero:orcamentos'));
    perform pg_advisory_xact_lock(hashtext('nexos-numero:vendas'));
  end if;
  -- trava de uma vez, sempre na mesma ordem, todas as linhas que o lote vai mexer
  perform 1 from public.registros r
    join unnest(kc, ki) as k(c, i) on r.colecao = k.c and r.id = k.i
   order by r.colecao, r.id
   for update of r;

  for g in select x from jsonb_array_elements(p_grupos) x loop
    ops := case when jsonb_typeof(g -> 'ops') = 'array' then g -> 'ops' else '[]'::jsonb end;
    chaves := coalesce((select jsonb_agg(distinct jsonb_build_object('c', o ->> 'c', 'i', o ->> 'i')) from jsonb_array_elements(ops) o), '[]'::jsonb);
    -- o mesmo grupo de novo (a resposta se perdeu e o aparelho reenviou): não grava outra vez; devolve como está agora e
    -- a versão em que ESTE grupo deixou cada registro (um grupo seguinte do aparelho depende dela, não da de agora)
    if coalesce(g ->> 'id', '') <> '' and exists (select 1 from public.registros_grupos x where x.id = g ->> 'id') then
      saida := array_append(saida, jsonb_build_object('n', g -> 'n', 'ok', true, 'ja', true, 'r', private.linhas_atuais(chaves),
        'gv', coalesce((select x.versoes from public.registros_grupos x where x.id = g ->> 'id'), '[]'::jsonb)));
      continue;
    end if;
    begin
      feitos := '{}';
      for op in select x from jsonb_array_elements(ops) x loop
        c := op ->> 'c'; i := op ->> 'i'; t := op ->> 't'; linha := null;
        ignorar := coalesce(op ->> 'modo', '') = 'ignorar';
        se := case when jsonb_typeof(op -> 'se') = 'number' then (op ->> 'se')::bigint end;
        if c is null or i is null or not (c = any (colecoes)) or i !~ '^[A-Za-z0-9_-]{1,64}$'
           or (c = 'meta' and i not in ('config', 'perfil')) or t is null then
          raise exception 'registro inválido' using errcode = 'NXINV', detail = 'invalido:' || coalesce(c, '') || '/' || coalesce(i, '');
        end if;
        select r.dados, r.versao into d, v from public.registros r where r.colecao = c and r.id = i;
        achou := found;
        if t = 'novo' then
          if jsonb_typeof(op -> 'd') is distinct from 'object' then
            raise exception 'registro inválido' using errcode = 'NXINV', detail = 'invalido:' || c || '/' || i;
          end if;
          if achou then
            if not ignorar then raise exception 'conflito' using errcode = 'NXCFL', detail = 'existe:' || c || '/' || i; end if;
          else
            insert into public.registros as r (colecao, id, dados)
            values (c, i, private.registro_com_id(c, i, private.aplicar_passos(op -> 'd', op -> 'p')))
            on conflict (colecao, id) do nothing
            returning jsonb_build_object('c', r.colecao, 'i', r.id, 'v', r.versao, 'e', r.atualizado_em, 'd', r.dados) into linha;
            if linha is null and not ignorar then   -- outro aparelho criou o mesmo código neste instante
              raise exception 'conflito' using errcode = 'NXCFL', detail = 'existe:' || c || '/' || i;
            end if;
          end if;
        elsif t = 'mudar' then
          if not achou then raise exception 'conflito' using errcode = 'NXCFL', detail = 'apagado:' || c || '/' || i; end if;
          if se is not null and v <> se then raise exception 'conflito' using errcode = 'NXCFL', detail = 'mudou:' || c || '/' || i; end if;
          if private.confere_esperado(d, op -> 'p') is not null then
            raise exception 'conflito' using errcode = 'NXCFL', detail = 'mudou:' || c || '/' || i;
          end if;
          update public.registros r set dados = private.registro_com_id(c, i, private.aplicar_passos(d, op -> 'p'))
           where r.colecao = c and r.id = i
          returning jsonb_build_object('c', r.colecao, 'i', r.id, 'v', r.versao, 'e', r.atualizado_em, 'd', r.dados) into linha;
        elsif t = 'mesclar' then
          if not achou then
            insert into public.registros as r (colecao, id, dados)
            values (c, i, private.registro_com_id(c, i, private.aplicar_passos('{}'::jsonb, op -> 'p')))
            on conflict (colecao, id) do nothing
            returning jsonb_build_object('c', r.colecao, 'i', r.id, 'v', r.versao, 'e', r.atualizado_em, 'd', r.dados) into linha;
            if linha is null then                   -- criado agora por outro aparelho: mescla no dele
              select r.dados into d from public.registros r where r.colecao = c and r.id = i for update;
              achou := true;
            end if;
          end if;
          if achou then
            update public.registros r set dados = private.registro_com_id(c, i, private.aplicar_passos(d, op -> 'p'))
             where r.colecao = c and r.id = i
            returning jsonb_build_object('c', r.colecao, 'i', r.id, 'v', r.versao, 'e', r.atualizado_em, 'd', r.dados) into linha;
          end if;
        elsif t = 'trocar' then
          if jsonb_typeof(op -> 'd') is distinct from 'object' then
            raise exception 'registro inválido' using errcode = 'NXINV', detail = 'invalido:' || c || '/' || i;
          end if;
          if se is not null and (not achou or v <> se) then
            raise exception 'conflito' using errcode = 'NXCFL', detail = case when achou then 'mudou:' else 'apagado:' end || c || '/' || i;
          end if;
          insert into public.registros as r (colecao, id, dados)
          values (c, i, private.registro_com_id(c, i, private.aplicar_passos(op -> 'd', op -> 'p')))
          on conflict (colecao, id) do update set dados = excluded.dados
          returning jsonb_build_object('c', r.colecao, 'i', r.id, 'v', r.versao, 'e', r.atualizado_em, 'd', r.dados) into linha;
        elsif t = 'apagar' then
          if achou then
            if se is not null and v <> se then raise exception 'conflito' using errcode = 'NXCFL', detail = 'mudou:' || c || '/' || i; end if;
            delete from public.registros r where r.colecao = c and r.id = i;
          elsif se is not null then
            raise exception 'conflito' using errcode = 'NXCFL', detail = 'apagado:' || c || '/' || i;
          end if;
        else
          raise exception 'registro inválido' using errcode = 'NXINV', detail = 'invalido:' || c || '/' || i;
        end if;
        feitos := array_append(feitos, coalesce(linha, private.linha_atual(c, i)));
      end loop;
      if coalesce(g ->> 'id', '') <> '' then
        insert into public.registros_grupos (id, versoes)
        values (left(g ->> 'id', 120), (select coalesce(jsonb_agg(jsonb_build_object('c', l ->> 'c', 'i', l ->> 'i',
                  'v', case when (l ->> 'x') = 'true' then -1 else (l ->> 'v')::bigint end)), '[]'::jsonb) from unnest(feitos) l))
        on conflict (id) do nothing;
      end if;
      saida := array_append(saida, jsonb_build_object('n', g -> 'n', 'ok', true, 'r', to_jsonb(feitos)));
    exception when sqlstate 'NXCFL' or sqlstate 'NXINV' then
      get stacked diagnostics motivo = pg_exception_detail;
      saida := array_append(saida, jsonb_build_object('n', g -> 'n', 'ok', false, 'motivo', motivo, 'r', private.linhas_atuais(chaves)));
    end;
  end loop;
  -- limpeza de vez em quando, no fim (nunca antes de conferir um reenvio desta mesma chamada)
  if random() < 0.02 then delete from public.registros_grupos where gravado_em < now() - interval '30 days'; end if;
  return to_jsonb(saida);
end $$;

revoke execute on function public.gravar(jsonb) from public, anon;
grant execute on function public.gravar(jsonb) to authenticated;
revoke execute on function private.num(jsonb), private.arred(numeric, int), private.registro_com_id(text, text, jsonb),
  private.aplicar_passos(jsonb, jsonb), private.confere_esperado(jsonb, jsonb), private.linha_atual(text, text),
  private.linhas_atuais(jsonb) from public, anon;
grant execute on function private.num(jsonb), private.arred(numeric, int), private.registro_com_id(text, text, jsonb),
  private.aplicar_passos(jsonb, jsonb), private.confere_esperado(jsonb, jsonb), private.linha_atual(text, text),
  private.linhas_atuais(jsonb) to authenticated;
revoke execute on function private.numera_registro(), private.marca_exclusao(), private.toca_registro() from public, anon, authenticated;
