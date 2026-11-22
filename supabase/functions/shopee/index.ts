// Nexos — integração com a Shopee (Open Platform v2): puxa os pedidos da loja sozinho.
// Publicada em 22/11/2026 (versão 14 do Nexos), junto com supabase/shopee.sql. Os pontos "CONFERIR" dependem da primeira
// conexão com uma loja de verdade (não dá para testar sem as credenciais da Shopee).
// Toda chamada exige alguém da equipe logado (rpc('entrar') = 'ok'). Partner Key e tokens ficam em
// private.shopee, que só a chave de serviço lê. Nenhum segredo volta para o navegador.
// Ações (POST com JSON { acao, ... }):
//   status     → configurado? loja conectada? última sincronização
//   configurar → só a dona: { partner_id, partner_key, ambiente: 'producao' | 'teste' }
//   link       → { redirect } → { url, estado }. A tela guarda o estado (sessionStorage) e abre a url.
//   conectar   → { code, shop_id, estado }: o que volta no endereço do Nexos depois da autorização
//                (a Shopee devolve o estado como "state"; se não vier, a tela usa o guardado)
//   pedidos    → { de, ate: 'AAAA-MM-DD', por?: 'criado' | 'atualizado' } → pedidos normalizados
// Publicar com verify_jwt = true (padrão): quem chama sempre manda o login.
import { createClient } from "npm:@supabase/supabase-js@2";

// Endereços da Shopee (doc oficial: open.shopee.com/developer-guide/16 e /20; SDKs congminh1254/shopee-sdk,
// EcomPHP/shopee-php e QuoVadis86/shopee-sdk).
const API: Record<string, string> = {
  producao: "https://openplatform.shopee.com.br",              // servidor do Brasil; alternativa: https://partner.shopeemobile.com
  teste: "https://openplatform.sandbox.test-stable.shopee.sg", // sandbox v2, o mesmo para todos os países
};
const AUTORIZAR: Record<string, string> = {
  producao: "https://open.shopee.com.br/auth",
  // CONFERIR: a doc cita open.sandbox.test-stable.shopee.com.br/auth, mas esse domínio não existe (nov/2026).
  // O guia do sandbox e os SDKs usam este:
  teste: "https://open.sandbox.test-stable.shopee.com/auth",
};
// Endereços de volta aceitos. O domínio precisa estar em "Redirect URL Domain" no app da Shopee
// (Live: aquecerandroi-oss.github.io; Test: localhost, ou vazio, que não confere nada).
const VOLTAS = ["https://aquecerandroi-oss.github.io/nexos/", "http://localhost:8768/"];
// true: usa o link antigo /api/v2/shop/auth_partner (assinado, vale 5 minutos e não devolve "state").
const LINK_ANTIGO = false;
const DIA = 86_400;
const JANELA = 15 * DIA;  // get_order_list e get_return_list aceitam no máximo 15 dias por consulta
const MAX_DIAS = 31;      // por chamada, para caber no tempo da função de borda (corta em 150 s)
const CAMPOS_DETALHE =
  "item_list,pay_time,total_amount,estimated_shipping_fee,actual_shipping_fee,cancel_by,cancel_reason,buyer_cancel_reason,payment_method,shipping_carrier";

// Chaves do Supabase: as novas (SUPABASE_*_KEYS) quando existirem; senão as antigas (valem até o fim de 2026).
function chaveSupabase(nova: string, antiga: string): string {
  try {
    const k = JSON.parse(Deno.env.get(nova) ?? "{}").default;
    if (k) return k;
  } catch { /* projeto só com as chaves antigas */ }
  return Deno.env.get(antiga) ?? "";
}
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_PUBLICA = chaveSupabase("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const SB_SERVICO = chaveSupabase("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

type Dados = Record<string, any>;
type Ctx = { admin: any; cfg: Dados | null; inicio: number };

class Falha extends Error {       // erro com a mensagem pronta para a tela
  status: number;
  constructor(msg: string, status = 400) { super(msg); this.status = status; }
}
class ErroShopee extends Error {  // a Shopee respondeu { error, message, request_id }
  codigo: string;
  detalhe: string;
  requestId: string | null;
  constructor(codigo: string, detalhe: string, requestId?: string) {
    super(codigo);
    this.codigo = codigo;
    this.detalhe = detalhe;
    this.requestId = requestId ?? null;
  }
}

const FIM_DA_AUTORIZACAO = "A autorização da loja venceu. Conecte a loja de novo (a vendedora autoriza por até 365 dias).";
const TOKEN_RECUSADO = "O acesso à loja não vale mais. Conecte a loja de novo.";
const SEM_PERMISSAO = "O app da Shopee não tem permissão para isso. Confira se ele é do tipo Seller In House System.";
const MENSAGENS: Record<string, string> = {
  error_sign: "A Shopee recusou a assinatura. Confira a Partner Key e se o ambiente (teste ou produção) é o da chave.",
  invalid_partner_id: "A Shopee não reconheceu o Partner ID. Confira o número e o ambiente (teste ou produção).",
  error_partner_key_expired: "A Partner Key de produção venceu. Gere outra no Console da Shopee e salve de novo.",
  error_auth: "A Shopee recusou o acesso. Confira as credenciais ou conecte a loja de novo.",
  invalid_code: "O código da Shopee venceu (vale 10 minutos e uma vez só). Clique em conectar de novo.",
  invalid_shop_id: "O código não é desta loja. Clique em conectar de novo.",
  invalid_access_token: TOKEN_RECUSADO,
  invalid_acceess_token: TOKEN_RECUSADO,  // escrito assim mesmo na doc da Shopee
  refresh_token_expired: FIM_DA_AUTORIZACAO,
  shop_access_expired: FIM_DA_AUTORIZACAO,
  error_shop_refresh_token: FIM_DA_AUTORIZACAO,
  shop_no_linked: FIM_DA_AUTORIZACAO,
  partner_shop_no_link: FIM_DA_AUTORIZACAO,
  shop_banned: "A loja está bloqueada na Shopee. O acesso volta quando a loja for liberada.",
  error_kyc_auth: "A Shopee pede que a loja termine o cadastro de vendedora na Central do Vendedor.",
  error_permission: SEM_PERMISSAO,
  error_api_permission: SEM_PERMISSAO,
  error_api_call_restricted: "A Shopee restringiu as chamadas deste app. O motivo aparece no Console da Shopee.",
  error_rate_limit: "A Shopee pediu uma pausa (muitas chamadas seguidas). Tente de novo em alguns minutos.",
  error_limit: "O app chegou ao limite diário de chamadas da Shopee. Tente de novo depois das 13h (Brasília).",
  source_ip_undeclared: "A Shopee bloqueou o endereço de IP. No app da Shopee, deixe desligado o acesso a dados pessoais (PII) e a lista de IPs.",
  "order.order_list_invalid_time": "A Shopee recusou o período (até 15 dias por consulta).",
};
const CREDENCIAL_ERRADA = new Set(["error_sign", "invalid_partner_id", "error_partner_key_expired"]);
const CONEXAO_ENCERRADA = new Set(["refresh_token_expired", "shop_access_expired", "error_shop_refresh_token", "shop_no_linked", "partner_shop_no_link"]);
function mensagem(e: ErroShopee): string {
  if (MENSAGENS[e.codigo]) return MENSAGENS[e.codigo];
  if (/^error_(server|network|data|busy)/.test(e.codigo)) return "A Shopee não respondeu direito agora. Tente de novo em instantes.";
  return `A Shopee recusou o pedido (${e.codigo}).`;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const enc = new TextEncoder();
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const aleatorio = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));
const n2 = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
const iso = (s: unknown) => (Number(s) > 0 ? new Date(Number(s) * 1000).toISOString() : null);
const agoraS = () => Math.floor(Date.now() / 1000);
const daquiA = (dias: number) => new Date(Date.now() + dias * DIA * 1000).toISOString();
const semTempo = (ctx: Ctx) => Date.now() - ctx.inicio > 100_000;
function fatiar<T>(lista: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
}
function janelas(inicio: number, fim: number): number[][] {
  const out: number[][] = [];
  for (let a = inicio; a <= fim; a += JANELA) out.push([a, Math.min(a + JANELA - 1, fim)]);
  return out;
}
// Roda fn em até n itens ao mesmo tempo, mantendo a ordem do resultado.
async function emParalelo<T, R>(itens: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = new Array(itens.length);
  let i = 0;
  const trabalhador = async () => {
    while (i < itens.length) { const k = i++; saida[k] = await fn(itens[k]); }
  };
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador));
  return saida;
}

// sign = HMAC-SHA256 em hexadecimal minúsculo, com a partner_key como chave.
async function assinar(chave: string, base: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(chave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(base))));
}

// Chama a Shopee. Base da assinatura: partner_id + caminho + timestamp (chamada pública) ou
// partner_id + caminho + timestamp + access_token + shop_id (chamada da loja). O timestamp vale 5 minutos.
// GET leva tudo na URL; POST leva os parâmetros comuns na URL e o resto no corpo JSON.
async function shopee(cfg: Dados, caminho: string, op: { query?: Dados; corpo?: unknown; token?: string } = {}): Promise<Dados> {
  for (let tentativa = 1; ; tentativa++) {
    const ts = agoraS();
    const q: Dados = { ...op.query, partner_id: cfg.partner_id, timestamp: ts };
    let base = `${cfg.partner_id}${caminho}${ts}`;
    if (op.token) {
      base += `${op.token}${cfg.shop_id}`;
      q.access_token = op.token;
      q.shop_id = cfg.shop_id;
    }
    q.sign = await assinar(cfg.partner_key, base);
    const url = new URL(API[cfg.ambiente] + caminho);
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    let j: Dados;
    try {
      const r = await fetch(url, {
        method: op.corpo === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json" },
        body: op.corpo === undefined ? undefined : JSON.stringify(op.corpo),
        signal: AbortSignal.timeout(25_000),
      });
      // A Shopee manda JSON também nos erros (às vezes com HTTP 403, às vezes com 200).
      j = await r.json().catch(() => ({ error: r.status === 429 ? "error_rate_limit" : "error_server", message: `HTTP ${r.status}` }));
    } catch {
      j = { error: "error_network", message: "sem resposta" };
    }
    if (!j.error) return j;
    // Repete só o que é seguro: pausa pedida pela Shopee, ou falha passageira numa leitura (GET).
    // Troca de código e renovação de token (POST) nunca repetem: cada código/refresh_token vale uma vez.
    const repete = tentativa < 3 &&
      (j.error === "error_rate_limit" || (op.corpo === undefined && /^error_(server|network|busy)/.test(j.error)));
    if (!repete) throw new ErroShopee(String(j.error), String(j.message ?? ""), j.request_id);
    await new Promise((ok) => setTimeout(ok, 1500 * tentativa));
  }
}

async function ler(admin: any): Promise<Dados | null> {
  const { data, error } = await admin.rpc("shopee_ler");
  if (error) throw error;
  return data ?? null;
}
async function gravar(admin: any, p: Dados, seRefresh: string | null = null): Promise<boolean> {
  const { data, error } = await admin.rpc("shopee_gravar", { p, p_se_refresh: seRefresh });
  if (error) throw error;
  return data === true;
}
function exigeApp(cfg: Dados | null): Dados {
  if (!cfg?.partner_id || !cfg?.partner_key) throw new Falha("A Shopee ainda não foi configurada (Partner ID e Partner Key).", 409);
  return cfg;
}

// expire_in vem em segundos (14400 = 4 h). Um exemplo da doc traz um número com cara de data: os dois
// casos são tratados, sempre limitados a 4 horas. CONFERIR com a primeira resposta real.
function vence(expireIn: unknown): string {
  const agora = Date.now(), maximo = agora + 4 * 3600_000, n = Number(expireIn);
  let ms = maximo;
  if (n > 1e9 && n * 1000 > agora + 60_000) ms = Math.min(n * 1000, maximo);
  else if (n > 0 && n <= 4 * 3600) ms = agora + n * 1000;
  return new Date(ms).toISOString();
}
const valeAinda = (c: Dados | null) => !!c?.access_token && Date.parse(c.expira_em ?? "") - Date.now() > 5 * 60_000;

// Devolve um access_token válido (dura 4 h). Renova com o refresh_token quando faltam menos de 5 minutos
// ou quando a Shopee recusou o token "ruim". Cada refresh_token vale uma vez e dura 30 dias; o token velho
// ainda funciona por 5 minutos depois da renovação.
async function tokenDaLoja(ctx: Ctx, ruim?: string): Promise<string> {
  if (!ruim && valeAinda(ctx.cfg)) return ctx.cfg!.access_token;
  const atual = await ler(ctx.admin);  // outra chamada pode ter acabado de renovar
  if (!atual?.shop_id || !atual.refresh_token) throw new Falha("A loja da Shopee não está conectada.", 409);
  ctx.cfg = atual;
  if (valeAinda(atual) && atual.access_token !== ruim) return atual.access_token;
  let novo: Dados;
  try {
    const j = await shopee(atual, "/api/v2/auth/access_token/get", {
      corpo: { refresh_token: atual.refresh_token, partner_id: Number(atual.partner_id), shop_id: Number(atual.shop_id) },
    });
    novo = { access_token: j.access_token, refresh_token: j.refresh_token, expira_em: vence(j.expire_in), refresh_expira_em: daquiA(30) };
  } catch (e) {
    const depois = await ler(ctx.admin);
    if (depois?.access_token && depois.refresh_token !== atual.refresh_token) { ctx.cfg = depois; return depois.access_token; }
    if (e instanceof ErroShopee && CONEXAO_ENCERRADA.has(e.codigo)) {
      // a autorização acabou: limpa os tokens para a tela mostrar "conectar de novo"
      await gravar(ctx.admin, { access_token: null, refresh_token: null, expira_em: null, refresh_expira_em: null }, atual.refresh_token);
    }
    throw e;
  }
  if (await gravar(ctx.admin, novo, atual.refresh_token)) { ctx.cfg = { ...atual, ...novo }; return novo.access_token; }
  ctx.cfg = await ler(ctx.admin);  // outra chamada gravou antes: vale a dela
  return ctx.cfg?.access_token ?? "";
}
const tokenRuim = (e: unknown) => e instanceof ErroShopee &&
  (e.codigo === "invalid_access_token" || e.codigo === "invalid_acceess_token" || (e.codigo === "error_auth" && /access_token/i.test(e.detalhe)));

// Chamada da loja. Se o token for recusado, renova uma vez e tenta de novo.
async function daLoja(ctx: Ctx, caminho: string, op: { query?: Dados; corpo?: unknown } = {}): Promise<Dados> {
  const t = await tokenDaLoja(ctx);
  try {
    return await shopee(ctx.cfg!, caminho, { ...op, token: t });
  } catch (e) {
    if (!tokenRuim(e)) throw e;
    return await shopee(ctx.cfg!, caminho, { ...op, token: await tokenDaLoja(ctx, t) });
  }
}

function situacao(cfg: Dados | null) {
  const vivo = (d: unknown) => !d || Date.parse(String(d)) > Date.now();
  return {
    configurado: !!(cfg?.partner_id && cfg?.partner_key),
    ambiente: cfg?.ambiente ?? null,
    partner_id: cfg?.partner_id ?? null,
    loja_conectada: !!(cfg?.shop_id && cfg?.refresh_token) && vivo(cfg?.refresh_expira_em) && vivo(cfg?.autorizacao_expira_em),
    shop_id: cfg?.shop_id ?? null,
    loja_nome: cfg?.loja_nome ?? null,
    autorizacao_expira_em: cfg?.autorizacao_expira_em ?? null,  // depois disso, a vendedora autoriza de novo
    renovar_ate: cfg?.refresh_expira_em ?? null,                 // sem uso até aqui, a conexão cai
    ultima_sincronizacao: cfg?.ultima_sincronizacao ?? null,
  };
}

async function configurar(ctx: Ctx, b: Dados, usuarioId: string | undefined) {
  const soDona = new Falha("Só quem administra o sistema configura a Shopee.", 403);
  if (!usuarioId) throw soDona;
  const { data: m, error } = await ctx.admin.from("membros").select("papel").eq("user_id", usuarioId).maybeSingle();
  if (error) throw error;
  if (m?.papel !== "dono") throw soDona;
  const partnerId = Number(b.partner_id);
  const partnerKey = String(b.partner_key ?? "").trim();
  const ambiente = b.ambiente === "producao" || b.ambiente === "teste" ? b.ambiente : "";
  if (!Number.isInteger(partnerId) || partnerId < 1 || partnerId > 4294967295) throw new Falha("Partner ID inválido: use só números.");
  if (partnerKey.length < 16 || partnerKey.length > 256 || /\s/.test(partnerKey)) throw new Falha("Partner Key inválida: copie a chave inteira do Console da Shopee.");
  if (!ambiente) throw new Falha("Escolha o ambiente: 'producao' ou 'teste'.");
  // Confere as credenciais numa chamada pública e barata (lista de IPs da Shopee).
  let aviso: string | null = null;
  try {
    await shopee({ partner_id: partnerId, partner_key: partnerKey, ambiente }, "/api/v2/public/get_shopee_ip_ranges");
  } catch (e) {
    if (!(e instanceof ErroShopee) || CREDENCIAL_ERRADA.has(e.codigo)) throw e;  // chave errada: não salva
    aviso = `Credenciais salvas, mas não deu para conferir com a Shopee agora (${e.codigo}).`;
  }
  // Outro app ou outro ambiente: a loja conectada não vale mais.
  const trocouApp = !!ctx.cfg && (Number(ctx.cfg.partner_id) !== partnerId || ctx.cfg.ambiente !== ambiente);
  const p: Dados = { partner_id: partnerId, partner_key: partnerKey, ambiente };
  if (trocouApp) {
    Object.assign(p, { shop_id: null, loja_nome: null, access_token: null, refresh_token: null, expira_em: null,
      refresh_expira_em: null, autorizacao_expira_em: null, nonce: null });
  }
  await gravar(ctx.admin, p);
  return { ok: true, loja_desconectada: trocouApp && !!ctx.cfg?.shop_id, aviso };
}

async function link(ctx: Ctx, b: Dados) {
  const cfg = exigeApp(ctx.cfg);
  const volta = String(b.redirect ?? "");
  if (!VOLTAS.includes(volta)) throw new Falha("Endereço de volta não permitido.");
  const estado = aleatorio(32);
  await gravar(ctx.admin, { nonce: estado });
  let url: URL;
  if (LINK_ANTIGO) {
    const caminho = "/api/v2/shop/auth_partner", ts = agoraS();
    url = new URL(API[cfg.ambiente] + caminho);
    url.searchParams.set("partner_id", String(cfg.partner_id));
    url.searchParams.set("timestamp", String(ts));
    url.searchParams.set("sign", await assinar(cfg.partner_key, `${cfg.partner_id}${caminho}${ts}`));
    url.searchParams.set("redirect", volta);
  } else {
    url = new URL(AUTORIZAR[cfg.ambiente]);
    url.searchParams.set("partner_id", String(cfg.partner_id));
    url.searchParams.set("auth_type", "seller");
    url.searchParams.set("redirect_uri", volta);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", estado);  // a Shopee devolve igual no endereço de volta
  }
  return { url: url.toString(), estado, vale_minutos: 30 };
}

async function conectar(ctx: Ctx, b: Dados, usuarioId: string | undefined) {
  const cfg = exigeApp(ctx.cfg);
  const code = String(b.code ?? "").trim();
  const shopId = Number(b.shop_id);
  const estado = String(b.estado ?? b.state ?? "");
  if (!b.shop_id && b.main_account_id) throw new Falha("Autorize entrando com a conta da loja, não com a conta principal.");
  if (!/^[A-Za-z0-9]{6,128}$/.test(code)) throw new Falha("Código de autorização inválido.");
  if (!Number.isInteger(shopId) || shopId < 1 || shopId > 4294967295) throw new Falha("Loja (shop_id) inválida.");
  if (!/^[0-9a-f]{64}$/.test(estado)) throw new Falha("Falta o controle do link. Clique em conectar de novo.");
  // Reconectar a mesma loja vale para toda a equipe; trocar por outra loja, só para quem administra o sistema.
  if (cfg.shop_id && Number(cfg.shop_id) !== shopId) {
    const soDona = new Falha("Esta é outra loja. Só quem administra o sistema troca a loja conectada.", 403);
    if (!usuarioId) throw soDona;
    const { data: m, error: eM } = await ctx.admin.from("membros").select("papel").eq("user_id", usuarioId).maybeSingle();
    if (eM) throw eM;
    if (m?.papel !== "dono") throw soDona;
  }
  const { data: valeu, error } = await ctx.admin.rpc("shopee_usar_nonce", { p: estado });
  if (error) throw error;
  if (valeu !== true) throw new Falha("Este link de conexão venceu ou já foi usado. Clique em conectar de novo.");
  // O code vale 10 minutos e uma vez só.
  const j = await shopee(cfg, "/api/v2/auth/token/get", { corpo: { code, partner_id: Number(cfg.partner_id), shop_id: shopId } });
  const novo: Dados = { shop_id: shopId, loja_nome: null, autorizacao_expira_em: null, access_token: j.access_token,
    refresh_token: j.refresh_token, expira_em: vence(j.expire_in), refresh_expira_em: daquiA(30) };
  await gravar(ctx.admin, novo);
  ctx.cfg = { ...cfg, ...novo };
  // Nome da loja e fim da autorização: ajudam a tela, mas não impedem a conexão.
  try {
    const info = await daLoja(ctx, "/api/v2/shop/get_shop_info");
    novo.loja_nome = info.shop_name ?? null;
    novo.autorizacao_expira_em = iso(info.expire_time);
    await gravar(ctx.admin, { loja_nome: novo.loja_nome, autorizacao_expira_em: novo.autorizacao_expira_em });
  } catch (e) {
    console.error("shopee get_shop_info", e instanceof ErroShopee ? `${e.codigo} ${e.requestId}` : e);
  }
  return { ok: true, shop_id: shopId, loja_nome: novo.loja_nome, autorizacao_expira_em: novo.autorizacao_expira_em };
}

// Valores do pedido (escrow), em lotes de 20; se o lote falhar, um por um.
async function escrows(ctx: Ctx, sns: string[], avisos: string[]): Promise<Map<string, Dados>> {
  const mapa = new Map<string, Dados>();
  let falhas = 0, ultimo = "";
  await emParalelo(fatiar(sns, 20), 3, async (lote) => {
    if (semTempo(ctx)) { falhas += lote.length; ultimo = "sem tempo"; return; }
    try {
      // CONFERIR: o lote é POST com { order_sn_list } nos SDKs de TypeScript e Go; a doc não traz exemplo.
      const j = await daLoja(ctx, "/api/v2/payment/get_escrow_detail_batch", { corpo: { order_sn_list: lote } });
      for (const x of j.response ?? []) if (x?.escrow_detail?.order_sn) mapa.set(x.escrow_detail.order_sn, x.escrow_detail);
    } catch (e) {
      if (!(e instanceof ErroShopee)) throw e;
    }
    for (const sn of lote) {
      if (mapa.has(sn)) continue;
      try {
        const j = await daLoja(ctx, "/api/v2/payment/get_escrow_detail", { query: { order_sn: sn } });
        if (j.response) mapa.set(sn, j.response);
      } catch (e) {
        if (!(e instanceof ErroShopee)) throw e;
        falhas++;
        ultimo = e.codigo;
      }
    }
  });
  if (falhas) avisos.push(`${falhas} pedido(s) concluído(s) ficaram sem os valores da Shopee (${ultimo}). Tente de novo mais tarde.`);
  return mapa;
}

// Devoluções, guardadas por pedido (fica a mais recente).
async function devolucoes(ctx: Ctx, inicio: number, fim: number, avisos: string[]): Promise<Map<string, Dados>> {
  const mapa = new Map<string, Dados>();
  // CONFERIR: a doc diz que o filtro é pela data do pedido; por via das dúvidas, olha até 30 dias além do período.
  const ate = Math.min(fim + 30 * DIA, agoraS());
  let primeira = 0;  // CONFERIR: a doc diz que page_no começa em 0; os SDKs usam 1. Repetidos são ignorados.
  try {
    for (const [de, a] of janelas(inicio, ate)) {
      for (let pagina = primeira; pagina < primeira + 200; pagina++) {
        if (semTempo(ctx)) { avisos.push("Devoluções não conferidas por falta de tempo. Busque um período menor."); return mapa; }
        let j: Dados;
        try {
          j = await daLoja(ctx, "/api/v2/returns/get_return_list", {
            query: { page_no: pagina, page_size: 100, create_time_from: de, create_time_to: a },
          });
        } catch (e) {
          if (pagina === 0 && e instanceof ErroShopee && e.codigo === "error_param") { primeira = 1; continue; }
          throw e;
        }
        const lista = j.response?.return ?? [];
        for (const d of lista) {
          const ja = mapa.get(d.order_sn);
          if (!ja || Number(d.update_time) > Number(ja.update_time)) mapa.set(d.order_sn, d);
        }
        if (!j.response?.more || !lista.length) break;
      }
    }
  } catch (e) {
    if (!(e instanceof ErroShopee)) throw e;
    avisos.push(`Não deu para ler as devoluções agora (${e.codigo}).`);
  }
  return mapa;
}

// Pedido no formato do Nexos, em reais. Taxas e valor a receber só existem com o escrow (pedido concluído).
function normalizar(o: Dados, statusLista: string | undefined, esc: Dados | undefined, dev: Dados | undefined) {
  const renda = esc?.order_income;
  const doEscrow = new Map<string, Dados>();
  for (const x of renda?.items ?? []) doEscrow.set(`${x.item_id}:${x.model_id ?? 0}`, x);
  let total = 0;
  const itens = (o.item_list ?? []).map((i: Dados) => {
    const qtd = Number(i.model_quantity_purchased) || 0;
    const e = doEscrow.get(`${i.item_id}:${i.model_id ?? 0}`);
    // O escrow traz o preço já com desconto de pacote; no pedido, item de pacote (bundle) vem com preço 0.
    const unit = e && Number(e.quantity_purchased) > 0
      ? (Number(e.discounted_price) || 0) / Number(e.quantity_purchased)
      : Number(i.model_discounted_price) || Number(i.model_original_price) || 0;
    total += unit * qtd;
    return { item_id: i.item_id, model_id: i.model_id ?? 0, sku: i.model_sku || i.item_sku || "", nome: i.item_name ?? "",
      variacao: i.model_name ?? "", qtd, preco_unit: n2(unit) };
  });
  const totalProdutos = n2(total);
  let taxas: Dados | null = null, valor: number | null = null, frete: number | null = null;
  if (renda) {
    const v = (k: string) => Number(renda[k]) || 0;
    const comissao = n2(v("commission_fee"));
    const servico = n2(v("service_fee"));
    const transacao = n2(v("seller_transaction_fee"));
    // Frete que ficou com a vendedora: custo real - pago pelo comprador - subsídio da Shopee + frete de devolução.
    const freteVendedor = n2(v("actual_shipping_fee") - v("buyer_paid_shipping_fee") - v("shopee_shipping_rebate")
      - v("shipping_fee_discount_from_3pl") + v("reverse_shipping_fee") + v("final_return_to_seller_shipping_fee")
      - v("rsf_seller_protection_fee_claim_amount"));
    valor = n2(v("escrow_amount") + v("total_adjustment_amount"));  // CONFERIR: ajustes que a Shopee lança depois
    // "outras" fecha a conta: cupons da loja, moedas, programas de frete, afiliados, anúncios, ajustes.
    // Negativo = crédito da Shopee (desconto que ela bancou). CONFERIR com pedidos reais.
    taxas = { comissao, servico, transacao, frete_vendedor: freteVendedor,
      outras: n2(totalProdutos - valor - comissao - servico - transacao - freteVendedor) };
    frete = n2(v("buyer_paid_shipping_fee"));
  }
  const status = o.order_status || statusLista || "";
  const retornos: unknown[] = esc?.return_order_sn_list ?? [];
  const devolucao = dev
    ? { return_sn: String(dev.return_sn ?? ""), status: dev.status ?? "", valor_reembolso: n2(dev.refund_amount),
        solucao: dev.return_solution === 1 ? "so_reembolso" : "devolucao_e_reembolso", criado_em: iso(dev.create_time) }
    : status === "TO_RETURN" || retornos.length
    ? { return_sn: retornos.length ? String(retornos[0]) : null, status: "EM_ANDAMENTO", valor_reembolso: null, solucao: null, criado_em: null }
    : null;
  return {
    order_sn: o.order_sn, status, criado_em: iso(o.create_time), pago_em: iso(o.pay_time),
    itens, total_produtos: totalProdutos, frete_pago_pelo_comprador: frete, taxas, valor_a_receber: valor,
    cancelado: status === "CANCELLED", devolucao,
  };
}

async function pedidos(ctx: Ctx, b: Dados) {
  exigeApp(ctx.cfg);
  const data = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!data(b.de) || !data(b.ate)) throw new Falha("Informe as datas no formato AAAA-MM-DD.");
  // Datas no horário de Brasília (UTC-3, sem horário de verão desde 2019).
  const inicio = Date.parse(`${b.de}T00:00:00-03:00`) / 1000;
  const fim = Math.min(Date.parse(`${b.ate}T23:59:59-03:00`) / 1000, agoraS());
  if (!(inicio <= fim)) throw new Falha("Período inválido: a data inicial vem antes da final e não pode ser futura.");
  if (fim - inicio > MAX_DIAS * DIA) throw new Falha(`Escolha no máximo ${MAX_DIAS} dias por vez.`);
  const por = b.por === "atualizado" ? "atualizado" : "criado";
  const avisos: string[] = [];
  await tokenDaLoja(ctx);  // renova uma vez só, antes de começar, se precisar

  // 1. Números dos pedidos: janelas de até 15 dias, páginas de até 100 (cursor).
  const lista = new Map<string, string>();
  for (const [de, ate] of janelas(inicio, fim)) {
    let cursor = "";
    for (let pagina = 0; pagina < 500; pagina++) {
      const j = await daLoja(ctx, "/api/v2/order/get_order_list", {
        query: { time_range_field: por === "atualizado" ? "update_time" : "create_time", time_from: de, time_to: ate,
          page_size: 100, cursor, response_optional_fields: "order_status" },
      });
      for (const o of j.response?.order_list ?? []) lista.set(o.order_sn, o.order_status ?? "");
      if (!j.response?.more || !j.response?.next_cursor) break;
      cursor = j.response.next_cursor;
    }
  }
  // 2. Detalhes em lotes de 50 (itens, preços, datas, cancelamento).
  const lotes = await emParalelo(fatiar([...lista.keys()], 50), 3, (lote) =>
    daLoja(ctx, "/api/v2/order/get_order_detail", { query: { order_sn_list: lote.join(","), response_optional_fields: CAMPOS_DETALHE } }));
  const detalhes: Dados[] = lotes.flatMap((j) => j.response?.order_list ?? []);
  if (detalhes.length < lista.size) avisos.push(`${lista.size - detalhes.length} pedido(s) vieram sem detalhe da Shopee.`);
  // 3. Valores (escrow) dos concluídos.  4. Devoluções.
  const concluidos = detalhes.filter((o) => o.order_status === "COMPLETED").map((o) => o.order_sn);
  const valores = await escrows(ctx, concluidos, avisos);
  const devol = await devolucoes(ctx, inicio, fim, avisos);
  const saida = detalhes
    .map((o) => normalizar(o, lista.get(o.order_sn), valores.get(o.order_sn), devol.get(o.order_sn)))
    .sort((x, y) => String(x.criado_em).localeCompare(String(y.criado_em)));
  await gravar(ctx.admin, { ultima_sincronizacao: new Date().toISOString() });
  return { pedidos: saida, total: saida.length, periodo: { de: b.de, ate: b.ate, por }, avisos };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido." }, 405);
  try {
    const autorizacao = req.headers.get("Authorization") ?? "";
    if (!/^Bearer\s+\S+/i.test(autorizacao)) return json({ erro: "Entre no Nexos para usar a Shopee." }, 401);
    // Confere quem chama com o próprio login dela: só a equipe passa.
    const usuario = createClient(SB_URL, SB_PUBLICA, {
      global: { headers: { Authorization: autorizacao } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: acesso, error: eA } = await usuario.rpc("entrar");
    if (eA || acesso !== "ok") return json({ erro: "Acesso só para a equipe do Nexos." }, 403);

    const b: Dados = (await req.json().catch(() => null)) ?? {};
    const admin = createClient(SB_URL, SB_SERVICO, { auth: { persistSession: false, autoRefreshToken: false } });
    const ctx: Ctx = { admin, cfg: await ler(admin), inicio: Date.now() };
    switch (b.acao) {
      case "status":
        return json(situacao(ctx.cfg));
      case "configurar": {
        const { data: u } = await usuario.auth.getUser(autorizacao.replace(/^Bearer\s+/i, ""));
        return json(await configurar(ctx, b, u?.user?.id));
      }
      case "link":
        return json(await link(ctx, b));
      case "conectar": {
        const { data: u } = await usuario.auth.getUser(autorizacao.replace(/^Bearer\s+/i, ""));
        return json(await conectar(ctx, b, u?.user?.id));
      }
      case "pedidos":
        return json(await pedidos(ctx, b));
      default:
        return json({ erro: "Ação desconhecida." }, 400);
    }
  } catch (e) {
    if (e instanceof Falha) return json({ erro: e.message }, e.status);
    if (e instanceof ErroShopee) {
      console.error("shopee", e.codigo, e.requestId);
      const status = CONEXAO_ENCERRADA.has(e.codigo) ? 409 : CREDENCIAL_ERRADA.has(e.codigo) || e.codigo.startsWith("invalid_") ? 400 : 502;
      return json({ erro: mensagem(e), codigo: e.codigo, request_id: e.requestId }, status);
    }
    console.error("shopee", e);
    return json({ erro: "Não foi possível falar com a Shopee agora. Tente de novo." }, 500);
  }
});
