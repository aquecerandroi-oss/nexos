// Nexos — cadastro de conta sem e-mail de confirmação.
// Só cria (ou redefine a senha de) uma conta em dois casos, sempre com um código:
//  1. primeira conta do sistema (a dona): código de primeiro acesso;
//  2. e-mail convidado por alguém da equipe (Perfil > Equipe): código do convite, válido por 7 dias.
// A senha da conta dona nunca é trocada por convite: só com o código de primeiro acesso, que serve de
// chave de recuperação para quem administra o sistema. Toda conta criada aqui recebe a marca
// app_metadata.nexos = true, que o banco exige para liberar o acesso.
// Publicada com verify_jwt = false: quem chama ainda não tem conta, e as regras acima fazem a proteção.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
// Chave de serviço: a nova (SUPABASE_SECRET_KEYS, um JSON com a chave "default") quando existir; senão a antiga,
// que o Supabase desliga no fim de 2026.
function chaveServico(): string {
  try {
    const k = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default;
    if (k) return k;
  } catch { /* projeto só com as chaves antigas */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido." }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, chaveServico(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { count, error: eM } = await admin.from("membros").select("user_id", { count: "exact", head: true });
    if (eM) throw eM;
    const primeiro = (count ?? 0) === 0;

    // a tela de cadastro pergunta se ainda falta criar a primeira conta, para explicar qual código pedir
    if (body.consulta === true) return json({ primeiro });

    // no máximo 30 tentativas por minuto vindas do mesmo endereço de internet
    // endereço de verdade de quem chama: o da Cloudflare (que ninguém consegue forjar) ou o último da cadeia de proxies
    const cadeia = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? cadeia[cadeia.length - 1] ?? "sem-ip";
    const { data: liberado, error: eLim } = await admin.rpc("cadastro_limite", { p_ip: ip });
    if (eLim) throw eLim;
    if (liberado === false) return json({ erro: "Muitas tentativas seguidas. Espere um minuto e tente de novo." }, 429);

    const mail = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const codigo = String(body.codigo ?? "").slice(0, 40);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail) || mail.length > 200) return json({ erro: "E-mail inválido." }, 400);
    if (password.length < 8 || password.length > 72) return json({ erro: "A senha precisa ter de 8 a 72 caracteres." }, 400);

    let recuperaDona = false;
    if (primeiro) {
      const { data: situacao, error: eK } = await admin.rpc("confere_codigo", { p: codigo });
      if (eK) throw eK;
      if (situacao !== "ok") return json({ erro: "Código de primeiro acesso incorreto.", precisaCodigo: true }, 403);
    } else {
      const { data: situacao, error: eC } = await admin.rpc("confere_convite", { p_email: mail, p_codigo: codigo });
      if (eC) throw eC;
      if (situacao === "vencido") return json({ erro: "Este convite venceu. Peça um convite novo em Perfil → Equipe.", precisaCodigo: true }, 403);
      if (situacao !== "ok") {
        // sem convite válido: só passa se for a conta dona com o código de primeiro acesso (recuperação de senha)
        const { data: dona, error: eDo } = await admin.from("membros").select("user_id").eq("email", mail).eq("papel", "dono").maybeSingle();
        if (eDo) throw eDo;
        if (dona) {
          const { data: chave, error: eCh } = await admin.rpc("confere_codigo", { p: codigo });
          if (eCh) throw eCh;
          recuperaDona = chave === "ok";
        }
        if (!recuperaDona) {
          return json({ erro: "E-mail não convidado ou código incorreto. Confira com quem convidou você.", precisaCodigo: true }, 403);
        }
      }
    }

    // acha a conta pelo e-mail direto no banco (sem limite de quantidade de contas)
    const { data: uid, error: eU } = await admin.rpc("usuario_por_email", { p: mail });
    if (eU) throw eU;
    let existente: { id: string; app_metadata?: Record<string, unknown> } | null = null;
    if (uid) {
      const { data: achado, error: eG } = await admin.auth.admin.getUserById(String(uid));
      if (eG) throw eG;
      existente = achado.user;
    }
    if (existente) {
      if (!primeiro && !recuperaDona) {
        const { data: m, error: eD } = await admin.from("membros").select("papel").eq("user_id", existente.id).maybeSingle();
        if (eD) throw eD;
        if (m && m.papel === "dono") return json({ erro: "A senha da conta dona não é redefinida por convite." }, 403);
      }
      const { error } = await admin.auth.admin.updateUserById(existente.id, {
        password, email_confirm: true, app_metadata: { ...(existente.app_metadata ?? {}), nexos: true },
      });
      if (error) throw error;
    } else {
      const { error } = await admin.auth.admin.createUser({ email: mail, password, email_confirm: true, app_metadata: { nexos: true } });
      if (error) throw error;
    }
    return json({ ok: true });
  } catch (e) {
    console.error("cadastro", e);
    return json({ erro: "Não foi possível criar a conta agora. Tente de novo." }, 500);
  }
});
