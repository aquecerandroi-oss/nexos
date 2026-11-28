/* Nexos — base: utilitários, dados na nuvem, sincronização, estrutura da tela e formulários.
   Tudo aqui é global (scripts clássicos); as telas ficam em views-*.js e as regras em calc.js. */
'use strict';

const CFG = window.NEXOS_CFG;
/* Modo demonstração: só em localhost com ?demo — dados ficam no navegador, sem login. */
const DEMO = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('demo');

/* ---------- Utilitários ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
/* Lê um número do jeito que brasileiro digita. Devolve NaN quando o texto não é um número.
   "1.250,50" -> 1250.5   "2,5" -> 2.5   "1.500" -> 1500 (ponto de milhar)   "0.95" e "12.5" -> decimais   "R$ 10" -> 10
   Com tempo = 'h' (campo em horas) ou 'min' (campo em minutos) também aceita "2h30", "2:30" e "45min". */
function numTexto(t, tempo) {
  let s;
  try { s = String(t ?? '').trim().toLowerCase().replace(/r\$/g, '').replace(/\s+/g, ''); }
  catch (e) { return NaN; }                                                 // valor que nem vira texto (registro torto)
  if (!s) return NaN;
  if (tempo) {
    let m = s.match(/^(\d+)(?:h|:)(\d{1,2})?(?:m|min)?$/);
    if (m) { const horas = Number(m[1]) + Number(m[2] || 0) / 60; return tempo === 'min' ? Math.round(horas * 60) : horas; }
    m = s.match(/^(\d+)(?:m|min)$/);
    if (m) return tempo === 'min' ? Number(m[1]) : Number(m[1]) / 60;
  }
  if (s.includes(',')) s = s.lastIndexOf('.') > s.lastIndexOf(',') ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');   // "1,250.50" colado no formato americano também vale
  else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
}
const num = v => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = numTexto(v);
  return isFinite(n) ? n : 0;
};
/* Número pronto para ir dentro de um campo: com vírgula decimal ("12,5"). Use ao preencher campos por código. */
const paraCampo = v => (v === undefined || v === null || v === '' ? '' : String(arredSeguro(v)).replace('.', ','));
const arredSeguro = v => { const n = num(v); return Math.round(n * 1e6) / 1e6; };
const esc = s => {
  try { s = String(s ?? ''); } catch (e) { s = ''; }                        // valor que nem vira texto (registro torto)
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
};
const brl = v => { let n = num(v); if (Math.abs(n) < 0.005) n = 0; return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };   // nunca "-R$ 0,00"
const pct = v => num(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const nf = (v, d = 0) => num(v).toLocaleString('pt-BR', { maximumFractionDigits: d });
const gramas = g => { g = num(g); return Math.abs(g) >= 1000 ? nf(g / 1000, 2) + ' kg' : nf(g) + ' g'; };
const horasFmt = h => {
  const m = Math.round(num(h) * 60);
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + 'h' + (m % 60 ? String(m % 60).padStart(2, '0') : '');
};
const soma = (arr, f) => (arr || []).reduce((s, x) => s + num(typeof f === 'function' ? f(x) : x[f]), 0);
const arred = (v, d = 0) => { const m = 10 ** d; return Math.round(num(v) * m) / m; };

const dataLocal = d => { const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };
const hoje = () => dataLocal(new Date());
const agoraISO = () => new Date().toISOString();
const mesAtual = () => hoje().slice(0, 7);
const addDias = (iso, n) => { const d = new Date((iso || hoje()) + 'T12:00:00'); d.setDate(d.getDate() + n); return dataLocal(d); };
const addMeses = (mes, n) => { const [a, m] = mes.split('-').map(Number); return dataLocal(new Date(a, m - 1 + n, 1)).slice(0, 7); };
/* Só formatam o que realmente é data (AAAA-MM-DD…); qualquer outra coisa vira texto vazio. */
const EH_DATA = /^\d{4}-\d{2}-\d{2}/;
const dataBR = iso => EH_DATA.test(String(iso ?? '')) ? String(iso).slice(0, 10).split('-').reverse().join('/') : '';
const dataCurta = iso => EH_DATA.test(String(iso ?? '')) ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) : '';
const dataHora = d => {
  d = new Date(d);
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '') + ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};
const nomeMes = mes => { const [a, m] = mes.split('-').map(Number); return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + String(a).slice(2); };
const nomeMesLongo = mes => { const [a, m] = mes.split('-').map(Number); return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); };

/* ---------- Estado ---------- */
const COLS = ['canais', 'filamentos', 'fornecedores', 'compras', 'insumos', 'produtos', 'ordens', 'vendas',
  'clientes', 'orcamentos', 'falhas', 'manutItens', 'manutHist', 'lancamentos', 'pessoas', 'contas'];
const CONFIG_PADRAO = {
  kwh: 0.95, potencia: 150, valorImpressora: 2500, vidaUtil: 5000, manutencaoHora: 0.3,
  maoObraHora: 20, falha: 5, falhaAuto: true, imposto: 6, impostoConfirmado: false, margem: 40,
  custosFixos: 0, horasMes: 200, alertaEstoque: 200, horimetroInicial: 0, metaFat: 0, metaLucro: 0,
  socio1Nome: 'Sócio 1', socio1Pct: 50, socio2Nome: 'Sócio 2', socio2Pct: 50,
};
const PERFIL_PADRAO = { empresa: 'Nexos', responsavel: '', cnpj: '', email: '', telefone: '', cidade: '', logo: '' };
const CANAIS_PADRAO = [
  { id: 'direta', nome: 'Instagram / WhatsApp', pct: 0, fixa: 0, frete: 0 },
  { id: 'shopee', nome: 'Shopee', pct: 20, fixa: 4, frete: 0 },
  { id: 'ml', nome: 'Mercado Livre', pct: 12, fixa: 6, frete: 0 },
];
function novoEstado() {
  const s = { config: { ...CONFIG_PADRAO }, perfil: { ...PERFIL_PADRAO } };
  COLS.forEach(c => { s[c] = []; });
  return s;
}
let S = novoEstado();
let REV = 0;                 // muda a cada alteração de dados (invalida caches de cálculo)
let EU = { id: '', email: '', papel: '' };
/* Os ids entram em atributos e em onclick das telas; por isso só valem ids simples (como os gerados por uid()). */
const ID_OK = /^[A-Za-z0-9_-]{1,64}$/;
/* Além do id, os campos que são listas precisam ser listas de objetos: um registro torto (backup adulterado,
   gravação por fora) derrubaria as telas que somam esses campos. */
const CAMPOS_LISTA = ['materiais', 'insumos', 'consumo', 'insumosUsados', 'itens', 'maoObra', 'devolucoes'];
/* Nada que vem do banco pode trazer as chaves toString ou valueOf (nem aninhar além do razoável): um valor assim
   não vira texto nem número e derrubaria toda tela que o mostrasse. */
const semArmadilha = (v, nivel = 0) => {
  if (!v || typeof v !== 'object') return true;
  if (nivel > 12) return false;
  if (Array.isArray(v)) return v.every(x => semArmadilha(x, nivel + 1));
  return Object.keys(v).every(k => k !== 'toString' && k !== 'valueOf' && semArmadilha(v[k], nivel + 1));
};
const registroValido = r => !!r && typeof r === 'object' && !Array.isArray(r) && typeof r.id === 'string' && ID_OK.test(r.id) && semArmadilha(r) &&
  CAMPOS_LISTA.every(k => r[k] == null || (Array.isArray(r[k]) && r[k].every(x => !!x && typeof x === 'object' && !Array.isArray(x)))) &&
  (r.precos == null || (typeof r.precos === 'object' && !Array.isArray(r.precos)));
/* Configuração e perfil só guardam valores simples (texto, número, sim/não). Objeto ou lista gravado por fora do
   sistema é ignorado e vale o padrão: um registro torto não pode derrubar a tela de toda a equipe. */
const soSimples = d => {
  const o = {};
  if (d && typeof d === 'object' && !Array.isArray(d)) Object.keys(d).forEach(k => { if (d[k] === null || typeof d[k] !== 'object') o[k] = d[k]; });
  return o;
};
/* A logo só pode ser a imagem que o próprio sistema gera (data:image em base64). Qualquer outro endereço é
   descartado, para ninguém fazer o navegador da equipe buscar imagem em servidor de fora. */
const logoSegura = v => (typeof v === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : '');
/* O perfil da empresa é sempre texto e só tem os campos conhecidos. */
const perfilLimpo = d => {
  const s = soSimples(d), o = { ...PERFIL_PADRAO };
  Object.keys(PERFIL_PADRAO).forEach(k => { if (s[k] !== undefined && s[k] !== null) o[k] = String(s[k]); });
  o.logo = logoSegura(o.logo);
  return o;
};
const byId =(col, id) => (id ? (S[col] || []).find(x => x.id === id) : undefined);
const nomeDe = (col, id, vazio = '—') => { const r = byId(col, id); return r ? esc(r.nome) : vazio; };
/* Nome curto de quem usa este aparelho (ex.: "pedido por Ana"): a pessoa cadastrada para este acesso (Configuração → Pessoas,
   "É o meu acesso"), se houver; senão, a parte do e-mail antes do @. No modo demonstração, "você". */
function quemUsa() {
  if (DEMO) return 'você';
  const p = EU.id ? S.pessoas.find(x => x.acesso === EU.id && String(x.nome || '').trim()) : null;
  return p ? String(p.nome).trim().slice(0, 40) : String(EU.email || '').split('@')[0].slice(0, 40) || 'alguém';
}

/* ---------- Banco: nuvem (Supabase) e demonstração (navegador) ---------- */
let sb = null;
const DBNuvem = {
  async carregar() {
    // Lê em páginas 'depois do último lido' (e não por posição): se outro aparelho gravar ou apagar
    // durante a leitura, nenhuma linha vem repetida nem é pulada.
    const out = [], N = 1000, q = v => '"' + String(v).replace(/["\\]/g, '') + '"';   // valor entre aspas, sem aspas nem barras dentro
    let ultimo = null;
    for (;;) {
      let c = sb.from('registros').select('colecao,id,dados,atualizado_em,versao').order('colecao').order('id').limit(N);
      if (ultimo) c = c.or('colecao.gt.' + q(ultimo.colecao) + ',and(colecao.eq.' + q(ultimo.colecao) + ',id.gt.' + q(ultimo.id) + ')');
      const { data, error } = await c;
      if (error) throw error;
      out.push(...data);
      if (data.length < N) break;
      ultimo = data[data.length - 1];
    }
    return out;
  },
  /* Manda grupos de alterações para a função gravar do banco (supabase/gravacao.sql), que aplica cada grupo inteiro
     ou nada e devolve como ficou cada registro. */
  async gravarLote(grupos) {
    // sem resposta em 45 s (rede pendurada): desiste e tenta de novo; o mesmo grupo reenviado não grava duas vezes
    const ctl = typeof AbortController === 'function' ? new AbortController() : null, t = ctl && setTimeout(() => ctl.abort(), 45000);
    try {
      let q = sb.rpc('gravar', { p_grupos: grupos });
      if (ctl && typeof q.abortSignal === 'function') q = q.abortSignal(ctl.signal);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    } finally { clearTimeout(t); }
  },
  /* O grupo já entrou no banco? (true ou false; erro quando não deu para saber) */
  async grupoGravado(id) {
    // sem resposta em 10 s (rede pendurada): desiste, e o grupo segue incerto (é reenviado inteiro, sem dividir)
    const ctl = typeof AbortController === 'function' ? new AbortController() : null, t = ctl && setTimeout(() => ctl.abort(), 10000);
    try {
      let q = sb.from('registros_grupos').select('id').eq('id', id).limit(1);
      if (ctl && typeof q.abortSignal === 'function') q = q.abortSignal(ctl.signal);
      const { data, error } = await q;
      if (error) throw error;
      return Array.isArray(data) && data.length > 0;
    } finally { clearTimeout(t); }
  },
  /* Conferência leve: só a chave, a versão e o carimbo do que foi gravado ou excluído a partir de um instante, em
     páginas de 1000. Devolve null quando não dá para paginar (mais de 1000 linhas com o mesmo carimbo). */
  async mudancasDesde(iso) {
    const paginar = async (tabela, campos, coluna) => {
      const vistos = new Map();
      let desde = iso;
      for (let pag = 0; pag < 20; pag++) {
        const { data, error } = await sb.from(tabela).select(campos).gte(coluna, desde).order(coluna).limit(1000);
        if (error) throw error;
        (data || []).forEach(r => vistos.set(r.colecao + '/' + r.id, r));
        if (!data || data.length < 1000) return [...vistos.values()];
        const ultimo = data[data.length - 1][coluna];
        if (ultimo === desde) return null;
        desde = ultimo;
      }
      return null;
    };
    const linhas = await paginar('registros', 'colecao,id,versao,atualizado_em', 'atualizado_em');
    const apagados = linhas && await paginar('registros_apagados', 'colecao,id,versao,apagado_em', 'apagado_em');
    return linhas && apagados ? { linhas, apagados } : null;
  },
  /* As linhas completas de algumas chaves ({ colecao, id }), uma consulta por coleção. */
  async lerChaves(chaves) {
    const porColecao = new Map(), out = [];
    chaves.forEach(k => { if (!porColecao.has(k.colecao)) porColecao.set(k.colecao, []); porColecao.get(k.colecao).push(k.id); });
    for (const [colecao, ids] of porColecao) {
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await sb.from('registros').select('colecao,id,dados,atualizado_em,versao').eq('colecao', colecao).in('id', ids.slice(i, i + 100));
        if (error) throw error;
        out.push(...(data || []));
      }
    }
    return out;
  },
  /* Canal ao vivo: gravações (inclusões e alterações) e exclusões (pela marca que cada exclusão deixa, com a versão:
     um aviso atrasado não apaga o que foi criado de novo depois). aoConectar a cada conexão; aoCair quando cai. */
  assinar(cb, aoConectar, aoCair) {
    const linha = r => ({ tipo: 'UPSERT', colecao: r.colecao, id: r.id, dados: r.dados, versao: r.versao, atualizado_em: r.atualizado_em });
    sb.channel('nexos-registros')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'registros' }, p => cb(linha(p.new)))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'registros' }, p => cb(linha(p.new)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registros_apagados' }, p => {
        // antes da resposta do canal, a biblioteca entrega a este filtro ("*") qualquer aviso: só vale o da marca
        if (p.table && p.table !== 'registros_apagados') return;
        const a = p.new;
        if (a && a.colecao) cb({ tipo: 'DELETE', colecao: a.colecao, id: a.id, versao: a.versao, apagado_em: a.apagado_em });
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') aoConectar();
        else if (typeof aoCair === 'function') aoCair(status);
      });
  },
  async enviarArquivo(path, blob, tipo) {
    const { error } = await sb.storage.from('arquivos').upload(path, blob, { contentType: tipo || 'application/octet-stream', upsert: false });
    if (error) throw error;
  },
  async urlsArquivos(paths) {
    const { data, error } = await sb.storage.from('arquivos').createSignedUrls(paths, 3600);
    if (error) throw error;
    const m = {};
    (data || []).forEach(d => { if (d.signedUrl) m[d.path] = d.signedUrl; });
    return m;
  },
  async urlDownload(path, nome) {
    const { data, error } = await sb.storage.from('arquivos').createSignedUrl(path, 300, { download: nome || true });
    if (error) throw error;
    return data.signedUrl;
  },
  async removerArquivos(paths) {
    const { error } = await sb.storage.from('arquivos').remove(paths);
    if (error) throw error;
  },
};
/* Demonstração: o "banco" fica no navegador, com as mesmas regras da função gravar (js/banco-local.js). */
const DEMO_KEY = 'nexos-demo-v3';
const demoBlobs = new Map();
const DBDemo = {
  _ler() {
    try { const e = JSON.parse(localStorage.getItem(DEMO_KEY)); if (e && typeof e === 'object' && e.linhas) return e; } catch (e) { /* vazio ou estragado */ }
    return { seq: 0, linhas: {}, apagados: {}, grupos: {} };
  },
  async carregar() {
    const e = this._ler();
    return Object.keys(e.linhas).map(k => { const j = k.indexOf('/'), l = e.linhas[k]; return { colecao: k.slice(0, j), id: k.slice(j + 1), dados: l.d, atualizado_em: l.e, versao: l.v }; });
  },
  async gravarLote(grupos) {
    const e = this._ler(), r = bancoGravar(e, copia(grupos), new Date().toISOString());
    localStorage.setItem(DEMO_KEY, JSON.stringify(e));
    return r;
  },
  async grupoGravado(id) { return !!this._ler().grupos[id]; },
  assinar() {},
  async enviarArquivo(path, blob) { demoBlobs.set(path, URL.createObjectURL(blob)); },
  async urlsArquivos(paths) { const m = {}; paths.forEach(p => { if (demoBlobs.has(p)) m[p] = demoBlobs.get(p); }); return m; },
  async urlDownload(path) { return demoBlobs.get(path) || ''; },
  async removerArquivos(paths) { paths.forEach(p => demoBlobs.delete(p)); },
};
const DB = DEMO ? DBDemo : DBNuvem;

/* ---------- Sincronização (dois ou mais aparelhos ao mesmo tempo) ----------
   O que cada clique muda vira um GRUPO de alterações: campos trocados, campos removidos, somas de estoque e a média do
   preço de compra — nunca o registro inteiro. A função gravar do banco aplica cada grupo inteiro ou nada, sobre a
   versão mais nova: o estoque é somado lá, campo que este aparelho não mexeu não é regravado, e pedido, ordem, conta,
   orçamento, compra, falha, lançamento e manutenção só mudam se ninguém mudou antes (se mudou, o grupo volta, a tela
   mostra como ficou e um aviso explica). A tela mostra sempre a versão do banco (BASE) com os grupos ainda não
   confirmados reaplicados por cima: o que chega de outro aparelho entra na hora, menos num registro com gravação
   daqui ainda sem resposta (esse espera a resposta, ver chaveIncerta). */
const BASE = new Map();          // 'colecao/id' -> { d: dados como estão no banco (cópia só daqui), v: versão }
const APAGADOS = new Map();      // 'colecao/id' -> versão da exclusão (um aviso mais velho não ressuscita o registro)
const FILA = [];                 // grupos ainda não enviados, na ordem em que aconteceram
let VOO = [];                    // grupos enviados, esperando a resposta
const RESULTADOS = new Map();    // número do grupo -> { ok, versoes } (para os grupos seguintes que dependem dele)
const ESPERA = new Map();        // 'colecao/id' -> { l, x }: aviso de outro aparelho (linha e exclusão mais novas) à espera do resultado de um grupo daqui
const DA_TELA = new WeakSet();   // objetos que já estiveram na tela (reconhece a edição atrasada de algo já excluído)
const ULTIMO_VISTO = new Map();  // 'colecao/id' -> como o registro estava quando saiu da tela (o nome no aviso de uma recusa)
const SESSAO = uid();
let grupoAtual = null, seqGrupo = 0, MARCA_LIDA = 0, FORM_SALVANDO = null;
let flushTimer = null, retryTimer = null, tentativas = 0, syncEstado = 'ok', avisarFalha = false;
/* Estoque: somado ou subtraído no banco, nunca regravado com o número que este aparelho calculou. */
const CONTADORES = { produtos: ['estoque'], filamentos: ['estoqueG'], insumos: ['estoque'] };
/* Movimentos: só mudam (ou saem) se ninguém mudou antes. Os cadastros mesclam campo a campo. */
const COM_VERSAO = new Set(['ordens', 'vendas', 'contas', 'orcamentos', 'compras', 'falhas', 'lancamentos', 'manutHist']);
const copia = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
/* Valores iguais (texto, número, sim/não, listas e objetos), como ficariam gravados. */
function iguais(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => iguais(x, b[i]));
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && iguais(a[k], b[k]));
}
/* Deixa alvo com o mesmo conteúdo de fonte, sem trocar o objeto (quem guardou a referência continua vendo o certo). */
function igualar(alvo, fonte) {
  Object.keys(alvo).forEach(k => { if (!Object.prototype.hasOwnProperty.call(fonte, k)) delete alvo[k]; });
  Object.keys(fonte).forEach(k => { alvo[k] = fonte[k]; });
}

/* Como o registro aparece aqui: a versão do banco com os grupos ainda não confirmados aplicados por cima. */
function aplicarOp(d, op) {
  let r;
  if (op.t === 'novo') r = d || bancoAplicarPassos(copia(op.d), op.p);
  else if (op.t === 'mudar') r = d ? bancoAplicarPassos(d, op.p) : null;
  else if (op.t === 'mesclar') r = bancoAplicarPassos(d || {}, op.p);
  else if (op.t === 'trocar') r = bancoAplicarPassos(copia(op.d), op.p);
  else r = null;
  if (r && op.c !== 'meta') r.id = op.i;
  return r;
}
function vistaDe(k) {
  const b = BASE.get(k);
  let d = b ? copia(b.d) : null;
  VOO.forEach(g => { const op = g.ops.get(k); if (op) d = aplicarOp(d, op); });
  FILA.forEach(g => { const op = g.ops.get(k); if (op) d = aplicarOp(d, op); });
  return d;
}
function colocarNaTela(col, id, vista, rec) {
  const lista = S[col];
  if (!Array.isArray(lista)) return;
  const i = lista.findIndex(x => x.id === id);
  if (!vista || !registroValido(vista) || vista.id !== id) {
    if (i >= 0) {
      const k = col + '/' + id;
      ULTIMO_VISTO.delete(k); ULTIMO_VISTO.set(k, copia(lista[i]));
      if (ULTIMO_VISTO.size > 200) ULTIMO_VISTO.delete(ULTIMO_VISTO.keys().next().value);
      lista.splice(i, 1);
    }
    return;
  }
  const alvo = rec && typeof rec === 'object' ? rec : i >= 0 ? lista[i] : null;
  if (!alvo) { lista.push(vista); DA_TELA.add(vista); return; }
  if (!iguais(copia(alvo), vista)) igualar(alvo, vista);
  if (i < 0) lista.push(alvo); else if (lista[i] !== alvo) lista[i] = alvo;
  DA_TELA.add(alvo);
}
function metaNaTela(qual, vista) {
  if (qual === 'config') igualar(S.config, { ...CONFIG_PADRAO, ...soSimples(vista) });
  else if (qual === 'perfil') igualar(S.perfil, perfilLimpo(vista));
}
function refazerVista(k) {
  const j = k.indexOf('/'), col = k.slice(0, j), id = k.slice(j + 1);
  if (col === 'meta') metaNaTela(id, vistaDe(k)); else colocarNaTela(col, id, vistaDe(k), null);
}

/* Grupo do clique atual: tudo o que é gravado no mesmo instante (até o próximo await) entra junto. */
let ultimaAcao = 0;              // quando este aparelho gravou algo pela última vez (a tela não se mexe embaixo do dedo)
function grupoAberto() {
  ultimaAcao = Date.now();
  if (!grupoAtual) {
    const g = grupoAtual = { n: ++seqGrupo, id: SESSAO + '-' + seqGrupo, ops: new Map() };
    FILA.push(g);
    queueMicrotask(() => {
      if (grupoAtual === g) grupoAtual = null;
      if (!g.ops.size) { const i = FILA.indexOf(g); if (i >= 0) FILA.splice(i, 1); }
    });
  }
  return grupoAtual;
}
/* Fecha o grupo atual: o que vier depois forma outro grupo, que entra (ou volta) sozinho. Ex.: cada pedido da Shopee. */
function novoGrupo() { if (grupoAtual && grupoAtual.ops.size) grupoAtual = null; }
function ultimoGrupoCom(k, exceto) {
  for (let i = FILA.length - 1; i >= 0; i--) if (FILA[i] !== exceto && FILA[i].ops.has(k)) return FILA[i];
  for (let i = VOO.length - 1; i >= 0; i--) if (VOO[i].ops.has(k)) return VOO[i];
  return null;
}
/* Versão em que o registro precisa estar para a mudança valer: a do banco ou a que um grupo anterior vai gravar. */
function precondicao(k, g) {
  const anterior = ultimoGrupoCom(k, g);
  if (anterior) return { seGrupo: anterior.n };
  const b = BASE.get(k);
  return b ? { se: b.v } : {};
}
/* O que mudou de antes para novo. form (salvando um formulário): campo igual ao de quando a janela abriu = a pessoa
   não mexeu nele, e vale o valor mais novo (que pode ter vindo de outro aparelho). Estoque vira soma; o preço médio
   de uma compra vai como média, para o banco calcular com o estoque de lá. */
/* Campos que o op do grupo já mexeu (o salvamento de uma janela pode gravar o mesmo registro mais de uma vez). */
function jaMexidos(op) {
  const ja = new Set();
  if (!op) return ja;
  (op.p || []).forEach(p => {
    ['s', 'a', 'e'].forEach(c => Object.keys(p[c] || {}).forEach(k => ja.add(k)));
    (p.x || []).forEach(k => ja.add(k));
    (p.m || []).forEach(m => { ja.add(m.p); ja.add(m.q); });
  });
  if (op.d) Object.keys(op.d).forEach(k => ja.add(k));
  return ja;
}
/* op: o que o grupo já tem deste registro. Nas gravações seguintes do mesmo salvamento, a regra do formulário vale para
   os campos que as anteriores ainda não mexeram (ex.: editar uma ordem já impressa reabre e conclui de novo; a
   observação que a pessoa não tocou não volta ao valor de quando a janela abriu). */
function diferenca(col, antes, novo, opts, form, op) {
  const s = {}, x = [], a = {}, e = {}, conts = CONTADORES[col] || [], medias = opts.media ? [].concat(opts.media) : [];
  const snap = form && form.snap, ja = jaMexidos(op);
  new Set([...Object.keys(antes), ...Object.keys(novo)]).forEach(k => {
    if (k === 'id') return;
    const va = antes[k], vn = novo[k];
    if (iguais(va, vn)) return;
    if (snap && !ja.has(k) && iguais(vn, snap[k])) return;
    if (medias.some(m => m.p === k)) return;
    if (conts.includes(k)) {
      // estoque digitado no formulário: vale o número digitado, mas só se o banco ainda estiver com o que a janela
      // mostrava ao abrir (outra correção ou movimento no meio: o grupo volta, em vez de somar uma correção na outra)
      if (snap && !op) { s[k] = vn === undefined ? 0 : vn; e[k] = k in snap ? snap[k] : null; return; }
      const delta = bancoArred(num(vn) - num(va), 6);
      if (delta) a[k] = delta;
      return;
    }
    if (vn === undefined) x.push(k); else s[k] = vn;
  });
  // opts.confere ({ campo: número ou null }): a mudança só vale se, no banco, o campo ainda estiver com esse valor (null: sem o
  // campo). Ex.: tirar a marca do "Já pedi" só se ela ainda for a deste aparelho (o número da marca)
  if (opts.confere) Object.keys(opts.confere).forEach(k => { if (k !== 'id') e[k] = opts.confere[k]; });
  const p = {};
  if (Object.keys(e).length) p.e = e;
  if (medias.length) p.m = medias.map(m => ({ ...m }));
  if (Object.keys(s).length) p.s = s;
  if (x.length) p.x = x;
  if (Object.keys(a).length) p.a = a;
  return Object.keys(p).length ? p : null;
}
function registrarMudanca(g, col, id, antes, novo, opts, form) {
  const k = col + '/' + id, op = g.ops.get(k);
  if (opts.trocar) { g.ops.set(k, { c: col, i: id, t: 'trocar', d: novo, p: [] }); return; }
  if (!antes) {
    if (op && op.t === 'apagar') { op.t = 'trocar'; op.d = novo; op.p = []; return; }   // apagou e recriou no mesmo clique
    g.ops.set(k, { c: col, i: id, t: 'novo', d: novo, p: [], ...(opts.seExistir === 'ignorar' ? { modo: 'ignorar' } : {}) });
    return;
  }
  const passo = diferenca(col, antes, novo, opts, form, op);
  if (!passo) return;
  if (op) { if (op.t === 'novo' || op.t === 'trocar') op.d = novo; else op.p.push(passo); return; }
  const pre = COM_VERSAO.has(col) && !opts.semVersao ? (form && form.pre ? form.pre : precondicao(k, g)) : {};
  g.ops.set(k, { c: col, i: id, t: 'mudar', p: [passo], ...pre });
}
const NOME_REG = { canais: 'o canal de venda', filamentos: 'o filamento', fornecedores: 'o fornecedor', compras: 'a compra de filamento',
  insumos: 'o insumo', produtos: 'o produto', ordens: 'a ordem de produção', vendas: 'o pedido', clientes: 'o cliente',
  orcamentos: 'o orçamento', falhas: 'o registro de falha', manutItens: 'o item de manutenção', manutHist: 'a manutenção',
  lancamentos: 'o lançamento', pessoas: 'a pessoa', contas: 'a conta', meta: 'a configuração' };
function descricaoRegistro(col, d) {
  d = d || {};
  const txt = v => '“' + String(v).slice(0, 50) + '”';
  if ((col === 'vendas' || col === 'orcamentos') && d.numero) return NOME_REG[col] + ' nº ' + d.numero;
  if (col === 'ordens') { const p = byId('produtos', d.produtoId); return NOME_REG.ordens + (p ? ` de ${nf(d.qtd)}× ${p.nome}` : ''); }
  if ((col === 'contas' || col === 'lancamentos' || col === 'manutHist') && d.descricao) return NOME_REG[col] + ' ' + txt(d.descricao);
  if ((col === 'compras' && num(d.pesoG) > 0) || (col === 'falhas' && num(d.gramas) > 0)) {
    const f = byId('filamentos', d.filamentoId);
    return (col === 'compras' ? 'a compra de ' + gramas(d.pesoG) : 'a falha de ' + gramas(d.gramas)) + (f ? ' de ' + f.nome : '');
  }
  return (NOME_REG[col] || 'o registro') + (d.nome ? ' ' + txt(d.nome) : '');
}
const maiuscula = t => t.charAt(0).toUpperCase() + t.slice(1);
/* Formulário de um registro que outro aparelho excluiu enquanto a janela estava aberta: não grava nada. */
function recusarEdicaoApagada(col, id, g, antigo) {
  descartarGrupo(g);
  const msg = `Outro aparelho excluiu ${descricaoRegistro(col, antigo)} enquanto ele estava aberto aqui. Nada foi gravado.`;
  toast(msg, 'bad');
  const e = new Error(msg); e.jaAvisado = true;
  throw e;
}
function descartarGrupo(g) {
  const i = FILA.indexOf(g);
  if (i >= 0) FILA.splice(i, 1);
  if (grupoAtual === g) grupoAtual = null;
  RESULTADOS.set(g.n, { ok: false });
  [...g.ops.keys()].forEach(refazerVista);
  REV++; pedirRender();
}

/* put(colecao, registro, opções): grava o registro (novo ou alterado). A tela muda na hora; o banco recebe só o que
   mudou. Opções: media ({ p: campo do preço, q: campo do estoque, n: quantidade, v: valor pago, e: escala, k: casas }),
   seExistir: 'ignorar' (código fixo: se outro aparelho já criou, fica o dele), trocar (restauração de backup),
   semVersao (só para putContagem: a mudança não confere a versão do registro), confere ({ campo: número ou null }: só grava se
   no banco o campo ainda estiver assim; se não estiver, o grupo volta e o aviso de sempre explica). */
function put(col, rec, opts = {}) {
  const lista = S[col];
  if (!lista) throw new Error('Coleção desconhecida: ' + col);
  if (!rec.id) rec.id = uid();
  const id = String(rec.id);
  if (!ID_OK.test(id)) throw new Error('Código de registro inválido: ' + id);
  const k = col + '/' + id;
  let g = grupoAberto();
  if (opts.trocar && g.ops.size >= 100 && !g.ops.has(k)) { novoGrupo(); g = grupoAberto(); }   // restauração grande vai em partes
  // salvando a janela deste registro: vale só o que a pessoa mexeu desde que ela abriu (ver diferenca)
  const form = FORM_SALVANDO && FORM_SALVANDO.k === k ? FORM_SALVANDO : null;
  const antes = vistaDe(k);
  if (!antes && !opts.trocar && ((form && !g.ops.has(k)) || (DA_TELA.has(rec) && APAGADOS.has(k)))) recusarEdicaoApagada(col, id, g, form ? form.snap : rec);
  const novo = copia(rec);
  novo.id = id;
  registrarMudanca(g, col, id, antes, novo, opts, form);
  acompanharJanela(k, g);
  colocarNaTela(col, id, vistaDe(k), rec);
  REV++; agendarGravacao();
  return byId(col, id) || rec;
}
/* Contagem que só informa (ex.: quantas falhas a ordem já teve): vai sozinha num grupo, antes do resto do clique, e sem
   conferir a versão do registro. Assim outra mudança nele no outro aparelho não derruba o resto do clique (a falha e a baixa
   do filamento entram de qualquer jeito); e, se ela não entrar (o outro aparelho excluiu o registro), ninguém é avisado. */
function putContagem(col, rec) {
  novoGrupo();
  const g = grupoAberto();
  put(col, rec, { semVersao: true });
  if (g.ops.size) { g.semAviso = true; novoGrupo(); }
}
/* Grava o estoque de rec só se, no banco, ele ainda estiver como em esperado ({ campo: valor }): a mesma conferência do estoque
   digitado numa janela (diferenca). Ex.: o Desfazer do Acertar estoque volta o número só se ninguém mexeu nele depois; se mexeu,
   nada é gravado e o aviso de sempre explica. */
function putConferindo(col, rec, esperado) {
  const k = col + '/' + rec.id, antes = FORM_SALVANDO;
  FORM_SALVANDO = { k, snap: { ...(vistaDe(k) || {}), ...esperado } };
  try { return put(col, rec); } finally { FORM_SALVANDO = antes; }
}
/* Este aparelho mexeu (fora do salvamento da janela) no registro que a janela aberta edita: ex.: o acerto automático do
   número do pedido na conta. A janela passa a esperar a versão que esse grupo vai gravar, para não ver a mudança do
   próprio aparelho como se fosse de outro. */
function acompanharJanela(k, g) {
  if (FORM && FORM.registro && FORM.registro.k === k && FORM_SALVANDO !== FORM.registro && FORM.registro.pre && g.ops.has(k)) {
    FORM.registro.pre = { seGrupo: g.n };
  }
}
function rm(col, id) {
  if (!S[col]) throw new Error('Coleção desconhecida: ' + col);
  id = String(id);
  const k = col + '/' + id, g = grupoAberto(), op = g.ops.get(k);
  if (op && op.t === 'novo') g.ops.delete(k);                       // criado e apagado no mesmo clique: nada vai ao banco
  else if (op) { op.t = 'apagar'; op.p = []; delete op.d; delete op.modo; }
  else if (BASE.has(k) || ultimoGrupoCom(k, g)) g.ops.set(k, { c: col, i: id, t: 'apagar', p: [], ...(COM_VERSAO.has(col) ? precondicao(k, g) : {}) });
  acompanharJanela(k, g);
  colocarNaTela(col, id, vistaDe(k), null);
  REV++; agendarGravacao();
}
/* Configuração e perfil: grava só os campos que mudaram (tudo = true grava todos, no primeiro uso). */
function saveMeta(qual, opts = {}) {
  const k = 'meta/' + qual, g = grupoAberto(), bruto = vistaDe(k) || {};
  const antes = opts.tudo ? {} : qual === 'config' ? { ...CONFIG_PADRAO, ...soSimples(bruto) } : perfilLimpo(bruto);
  const passo = diferenca('meta', antes, copia(S[qual]), {}, null);
  if (passo) {
    const op = g.ops.get(k);
    if (op) op.p.push(passo); else g.ops.set(k, { c: 'meta', i: qual, t: 'mesclar', p: [passo] });
  }
  metaNaTela(qual, vistaDe(k));
  REV++; agendarGravacao();
}
/* O registro já chegou ao banco? (sem internet, um pedido ou orçamento novo ainda pode mudar de número) */
const confirmadoNoBanco = (col, id) => BASE.has(col + '/' + id);
const temPendencias = () => VOO.length > 0 || FILA.some(g => g.ops.size > 0);
function agendarGravacao() { avisarFalha = true; if (!flushTimer) flushTimer = setTimeout(descarregar, 40); }

/* Versão de um registro depois de um grupo já respondido (-1 = o grupo o excluiu); undefined = ainda sem resposta. */
function versaoDepois(op) {
  if (op.seGrupo === undefined) return op.se;
  const r = RESULTADOS.get(op.seGrupo), k = op.c + '/' + op.i;
  if (r) return r.ok && r.versoes.has(k) ? r.versoes.get(k) : null;
  return VOO.concat(FILA).some(g => g.n === op.seGrupo) ? undefined : null;
}
const esperandoOutro = op => op.seGrupo !== undefined && versaoDepois(op) === undefined;
/* Quantas alterações cabem numa chamada ao banco. O banco corta a chamada que passa de 8 s: se isso acontecer, o lote
   seguinte vai menor (e um grupo grande de restauração, cujas partes não dependem umas das outras, é dividido). Se o
   lote cortado usava mais da metade do limite que valia antes dessa sequência de cortes, o tamanho pode ser a causa, e
   os lotes não passam de 3/4 dele (tetoOps). Corte de um lote pequeno (ou cortes seguidos de uma mesma trava) só
   diminui os próximos. E o teto volta a subir quando o banco grava de fato, nesta chamada, pelo menos metade dele em
   menos de 2 s (um quarto do tempo do banco, sem contar a demora da rede, medida nas gravações pequenas; reenvio que
   volta "ja" e grupo recusado não contam): a lentidão era de momento, não do tamanho. */
let limiteOps = 300, tetoOps = 300, limiteAntesDosCortes = 0, idas = [];
const soSubstituicoes = g => g.ops.size > 1 && [...g.ops.values()].every(op => op.t === 'trocar' || op.t === 'mesclar');
function dividirGrupo(g) {
  const ops = [...g.ops.entries()], meio = Math.ceil(ops.length / 2), i = FILA.indexOf(g);
  const parte = lista => { const n = ++seqGrupo; return { n, id: SESSAO + '-' + n, ops: new Map(lista) }; };
  if (i < 0) return;
  const p1 = parte(ops.slice(0, meio)), p2 = parte(ops.slice(meio)), qual = k => (p1.ops.has(k) ? p1.n : p2.n);
  FILA.splice(i, 1, p1, p2);
  // quem esperava o grupo inteiro passa a esperar a parte que tem o seu registro
  FILA.forEach(h => h.ops.forEach((op, k) => { if (op.seGrupo === g.n) op.seGrupo = qual(k); }));
  if (FORM && FORM.registro && FORM.registro.pre && FORM.registro.pre.seGrupo === g.n) FORM.registro.pre = { seGrupo: qual(FORM.registro.k) };
}
async function descarregar() {
  flushTimer = null;
  if (VOO.length) return;                                            // um lote por vez
  clearTimeout(retryTimer);
  // grupos feitos em cima de um grupo que não foi gravado também não valem (um grupo já enviado uma vez saiu com o que
  // esperava resolvido, e só a resposta dele diz o que aconteceu)
  const perdidos = [];
  for (let i = 0; i < FILA.length; i++) {
    const g = FILA[i];
    if (g === grupoAtual) continue;
    if (!g.ops.size) { FILA.splice(i--, 1); continue; }
    if (!g.enviado && [...g.ops.values()].some(op => versaoDepois(op) === null)) { FILA.splice(i--, 1); RESULTADOS.set(g.n, { ok: false, semAviso: !!g.semAviso }); perdidos.push(g); }
  }
  if (perdidos.length) {
    perdidos.forEach(g => g.ops.forEach((op, k) => refazerVista(k)));
    REV++; pedirRender();
    // o grupo de que ele dependia foi recusado pelo banco e essa recusa já foi avisada (ex.: Desfazer clicado antes da
    // resposta de uma ação que o outro aparelho já tinha feito): um segundo aviso só confundiria
    avisarRecusados(perdidos.filter(g => !g.semAviso && !dependiaDeRecusaAvisada(g)).map(g => ({ motivo: 'depende', g })));
  }
  const lote = [], chaves = new Set();
  let nOps = 0;
  for (const g of FILA) {
    if (g === grupoAtual) break;
    const ks = [...g.ops.keys()];
    if (ks.some(k => chaves.has(k))) break;                          // depende de outro grupo deste lote: vai no próximo
    if ([...g.ops.values()].some(esperandoOutro)) break;
    if (lote.length && (lote.length >= 100 || nOps + ks.length > limiteOps)) break;
    lote.push(g); ks.forEach(k => chaves.add(k)); nOps += ks.length;
  }
  if (!lote.length) { if (!FILA.some(g => g.ops.size)) mostrarSync('ok'); return; }
  lote.forEach(g => FILA.splice(FILA.indexOf(g), 1));
  VOO = lote;
  mostrarSync('salvando');
  // o envio de cada grupo fica guardado: o reenvio (resposta perdida, banco fora do ar) manda exatamente o mesmo
  const enviar = lote.map(g => g.enviado || (g.enviado = { n: g.n, id: g.id, ops: [...g.ops.values()].map(op => {
    const o = { c: op.c, i: op.i, t: op.t }, se = versaoDepois(op);
    if (op.modo) o.modo = op.modo;
    if (op.d) o.d = copia(op.d);
    if (op.p && op.p.length) o.p = copia(op.p);
    if (typeof se === 'number') o.se = se;
    return o;
  }) }));
  let res = null, erro = null;
  const inicioLote = Date.now();
  try {
    res = await DB.gravarLote(enviar);
    if (!Array.isArray(res)) throw new Error('Resposta inesperada do banco.');
  } catch (e) { erro = e; }
  if (erro) {
    // erro com código do banco (57014 = passou do tempo, 42501 = sem permissão...): a chamada foi desfeita e nada foi
    // gravado. Sem resposta clara (a rede caiu no meio, tempo esgotado aqui, resposta estranha) ou queda da conexão com
    // o banco (08xxx, PGRST001: pode ter sido logo depois de gravar): o banco pode ter gravado, e o grupo fica incerto
    // até uma resposta dele (o reenvio volta como "ja" se já tinha entrado).
    const code = String(erro.code || ''), tempo = code === '57014' && (lote.length > 1 || soSubstituicoes(lote[0]));
    const certo = /^([0-9A-Z]{5}|PGRST\d{3})$/.test(code) && code !== 'PGRST001' && !code.startsWith('08');
    if (!certo) lote.forEach(g => { g.incerto = true; });
    let dividir = false;
    if (tempo && lote.length === 1) {
      // as partes ganham códigos novos, que o banco não reconheceria como já gravados: um grupo que talvez tenha
      // entrado num envio anterior sem resposta só é dividido depois de o banco confirmar que ele não entrou
      const g = lote[0];
      if (g.incerto && (await DB.grupoGravado(g.id).catch(() => null)) === false) g.incerto = false;
      dividir = !g.incerto;
    }
    VOO = [];
    FILA.unshift(...lote);                                           // volta para a frente da fila, na mesma ordem
    const tocadas = new Set();
    liberarEspera(tocadas);
    if (tocadas.size) { tocadas.forEach(refazerVista); REV++; pedirRender(); }
    if (tempo) {
      // passou do tempo do banco: tenta já, com menos de cada vez (o grupo incerto e inteiro volta como "ja" assim que
      // as travas do banco soltarem)
      if (!limiteAntesDosCortes) limiteAntesDosCortes = limiteOps;
      if (nOps > limiteAntesDosCortes / 2) tetoOps = Math.min(tetoOps, Math.max(10, Math.floor(nOps * 3 / 4)));
      limiteOps = Math.max(10, Math.floor(nOps / 2));
      if (dividir) dividirGrupo(lote[0]);
      flushTimer = setTimeout(descarregar, lote.length > 1 || dividir ? 50 : 2000);
      return;
    }
    console.error('Falha ao salvar na nuvem', erro);
    if (erro && erro.code === '42501') {                             // o banco recusou: esta conta ainda é da equipe?
      if (await perdeuOAcesso()) return;
      if (VOO.length) return;                                        // enquanto conferia, outra gravação já cuidou da fila
    }
    tentativas++;
    mostrarSync('erro');
    if (avisarFalha) {
      avisarFalha = false;
      // sem resposta clara (nesta chamada ou num envio anterior de um grupo do lote), o banco pode já ter gravado: o
      // aviso não diz que nada foi salvo (quem acredita repete a venda)
      toast(certo && !lote.some(g => g.incerto) ? 'Sem conexão: as últimas alterações ainda NÃO foram salvas. Deixe esta página aberta e não repita o que já fez: elas serão gravadas quando a conexão voltar.'
        : 'Sem conexão: talvez as últimas alterações ainda não tenham sido salvas. Deixe esta página aberta e não repita o que já fez: quando a conexão voltar, o sistema confere e termina sozinho, sem gravar em dobro.', 'bad');
    }
    retryTimer = setTimeout(descarregar, Math.min(60000, 4000 * tentativas));
    return;
  }
  VOO = [];
  tentativas = 0;
  limiteAntesDosCortes = 0;
  // demora da rede: a menor das 3 últimas gravações pequenas (cliques comuns), medidas antes desta
  const gastou = Date.now() - inicioLote, ida = idas.length ? Math.min(...idas) : 0;
  const aplicadosAgora = new Set(res.filter(r => r && r.ok && !r.ja).map(r => r.n));
  const opsAplicadas = lote.reduce((s, g) => s + (aplicadosAgora.has(g.n) ? g.ops.size : 0), 0);
  if (opsAplicadas >= tetoOps / 2 && gastou - ida < 2000) tetoOps = Math.min(300, tetoOps * 2);
  if (nOps <= 5) idas = [...idas.slice(-2), gastou];
  limiteOps = Math.min(tetoOps, limiteOps * 2);
  aplicarResposta(lote, res);
  if (FILA.some(g => g.ops.size)) agendarGravacao();
  else { mostrarSync('ok'); if (recarregarDepois) { recarregarDepois = false; recarregar(); } }
}
/* Atualiza a cópia do banco com uma linha { c, i, v, e, d } ou { c, i, x: true, v }. Devolve true se mudou algo. */
function atualizarBase(l) {
  if (!l || typeof l.c !== 'string' || typeof l.i !== 'string') return false;
  const k = l.c + '/' + l.i, b = BASE.get(k);
  if (l.x) {
    const v = l.v == null ? null : Number(l.v);
    if (v !== null) { if (b && b.v > v) return false; APAGADOS.set(k, Math.max(APAGADOS.get(k) || 0, v)); }
    if (!b) return false;
    BASE.delete(k);
    return true;
  }
  const v = Number(l.v) || 0;
  if (b && b.v >= v) return false;                                   // já temos esta versão ou uma mais nova
  if ((APAGADOS.get(k) || 0) > v) return false;                      // foi excluído depois desta versão
  APAGADOS.delete(k);
  BASE.set(k, { d: copia(l.d), v });
  return true;
}
function aplicarResposta(lote, res) {
  const porN = new Map(res.map(r => [r && r.n, r])), recusados = [], renumerados = [], semResposta = [], tocadas = new Set();
  lote.forEach(g => {
    const r = porN.get(g.n);
    if (!r) { semResposta.push(g); return; }
    g.ops.forEach((op, k) => tocadas.add(k));
    // recusado: o registro como este aparelho o via, lido antes das linhas da resposta (um registro excluído no outro
    // aparelho sai da cópia do banco com elas, e o aviso ficaria sem o nome dele)
    const alvoRecusa = r.ok ? '' : String(r.motivo || '').slice(String(r.motivo || '').indexOf(':') + 1);
    const vistoAntes = r.ok ? null : vistaDe(alvoRecusa) || (BASE.get(alvoRecusa) || {}).d;
    (Array.isArray(r.r) ? r.r : []).forEach(atualizarBase);
    if (r.ok) {
      // versão em que ESTE grupo deixou cada registro (num reenvio, "gv"; "r" traz como está agora, talvez já mexido
      // por outro aparelho, e um grupo seguinte que depende deste precisa conferir contra a versão dele)
      const versoes = new Map();
      (r.ja && Array.isArray(r.gv) ? r.gv : r.r || []).forEach(l => { if (l && l.c) versoes.set(l.c + '/' + l.i, l.x ? -1 : Number(l.v)); });
      RESULTADOS.set(g.n, { ok: true, versoes });
      g.ops.forEach((op, k) => {
        if (op.t !== 'novo' || (op.c !== 'vendas' && op.c !== 'orcamentos') || !op.d) return;
        const b = BASE.get(k), antigo = num(op.d.numero), novoN = b ? num(b.d.numero) : 0;
        if (antigo && novoN && antigo !== novoN) renumerados.push({ col: op.c, id: op.i, antigo, novo: novoN });
      });
    } else {
      RESULTADOS.set(g.n, { ok: false, semAviso: !!g.semAviso });
      if (g.semAviso) return;                                         // contagem que só informa: não entrou e ninguém precisa saber
      const motivo = String(r.motivo || ''), alvo = alvoRecusa, j = alvo.indexOf('/');
      const col = alvo.slice(0, j), op = g.ops.get(alvo);
      // "Feito" de manutenção: o grupo levava também o registro (e o custo) da manutenção, que não entrou
      const manut = col === 'manutItens' && [...g.ops.values()].some(o => o.c === 'manutHist' && o.t === 'novo');
      recusados.push({ motivo: motivo.split(':')[0], col, manut, g, d: vistaDe(alvo) || vistoAntes || ULTIMO_VISTO.get(alvo) || (op && op.d) || (BASE.get(alvo) || {}).d });
    }
  });
  if (semResposta.length) { semResposta.forEach(g => { g.incerto = true; }); FILA.unshift(...semResposta); }
  if (RESULTADOS.size > 3000) {
    // esquece os mais velhos, menos o de que um grupo ainda não respondido (ou a janela aberta) depende
    const usados = new Set();
    VOO.concat(FILA).forEach(h => h.ops.forEach(op => { if (op.seGrupo !== undefined) usados.add(op.seGrupo); }));
    if (FORM && FORM.registro && FORM.registro.pre && FORM.registro.pre.seGrupo !== undefined) usados.add(FORM.registro.pre.seGrupo);
    for (const n of [...RESULTADOS.keys()]) {
      if (RESULTADOS.size <= 3000) break;
      if (!usados.has(n)) RESULTADOS.delete(n);
    }
  }
  liberarEspera(tocadas);                  // avisos que esperavam esta resposta: entram agora, e a versão decide
  tocadas.forEach(refazerVista);
  REV++; pedirRender();
  avisarRecusados(recusados);
  renumerados.forEach(x => corrigirNumero(x.col, x.id, x.antigo, x.novo));
}
/* Grupo perdido que só dependia de grupos recusados pelo banco com a recusa já avisada (ou perdidos por isso). */
const dependiaDeRecusaAvisada = g => [...g.ops.values()].every(op => {
  if (versaoDepois(op) !== null) return true;
  const r = op.seGrupo !== undefined ? RESULTADOS.get(op.seGrupo) : null;
  return !!r && !r.ok && !r.semAviso;
});
/* Aviso do que não foi gravado porque outro aparelho mexeu antes. Ação de mais de uma gravação (ex.: Falhou muda a ordem e
   registra a falha): g.explicar(recusas, naTela) conta o que entrou e o que não entrou e devolve true (o aviso de sempre não
   aparece); recusas: as gravações dela recusadas agora ([{ motivo, g }]); naTela: o aviso dela (com o Desfazer) ainda estava à
   vista. */
function avisarRecusados(lista) {
  // o aviso de sucesso (e o Desfazer) de uma gravação recusada some: a tela já mostra como ficou
  const naTela = new Set();
  $$('#toasts .toast').forEach(t => { if ((t._grupos || []).some(g => { const r = RESULTADOS.get(g.n); return r && !r.ok; })) { t._grupos.forEach(g => naTela.add(g)); t._sair(); } });
  const porAcao = new Map();
  lista.forEach(x => { const fn = x.g && x.g.explicar; if (typeof fn === 'function') porAcao.set(fn, [...(porAcao.get(fn) || []), x]); });
  porAcao.forEach((xs, fn) => {
    let explicou = false;
    try { explicou = fn(xs, xs.some(x => naTela.has(x.g))) === true; } catch (e) { console.error(e); }
    if (explicou) lista = lista.filter(x => !xs.includes(x));
  });
  if (!lista.length) return;
  // "Feito" num item que o outro aparelho excluiu: a manutenção e o custo dela ficaram fora, e isso tem aviso próprio
  const manutFora = x => `Outro aparelho excluiu ${descricaoRegistro(x.col, x.d)}. A manutenção (e o custo) não foi gravada: se ela foi feita, registre em “Registrar manutenção avulsa”.`;
  if (lista.length > 1) {
    toast(`${lista.length} alterações não foram gravadas porque outro aparelho mudou ou excluiu os mesmos registros pouco antes. A tela já mostra como ficou.`, 'bad');
    lista.filter(x => x.manut && x.motivo === 'apagado').forEach(x => toast(manutFora(x), 'bad'));
    return;
  }
  const { motivo, col, d, manut } = lista[0], desc = descricaoRegistro(col, d);
  const msg = {
    mudou: `Outro aparelho mudou ${desc} pouco antes. Esta alteração não foi gravada e a tela já mostra como ficou: confira e repita, se ainda precisar.`,
    apagado: manut ? manutFora(lista[0]) : `Outro aparelho excluiu ${desc}. Esta alteração não foi gravada.`,
    existe: `Outro aparelho já tinha registrado ${desc}. Nada foi gravado em dobro; a tela já mostra o que está salvo.`,
    depende: 'Uma alteração não foi gravada porque dependia de outra que outro aparelho desfez antes. A tela já mostra como ficou.',
  }[motivo] || `O banco não aceitou uma alteração (${desc}). Ela não foi gravada.`;
  toast(msg, 'bad');
}
/* Pedido ou orçamento criado ao mesmo tempo em dois aparelhos (ou sem internet) com o mesmo número: o banco deu o
   próximo. Acerta o número nos textos ligados a ele (contas, observações) e avisa. */
function corrigirNumero(col, id, antigo, novoN) {
  const troca = (t, rot) => String(t ?? '').replace(new RegExp('(' + rot + ' nº ?)' + antigo + '(?![0-9])', 'gi'), '$1' + novoN);
  const acertar = (lista, campo, rot, colecao) => lista.forEach(r => { const novo = troca(r[campo], rot); if (novo !== String(r[campo] ?? '')) { r[campo] = novo; put(colecao, r); } });
  novoGrupo();
  if (col === 'vendas') acertar(S.contas.filter(c => c.origem === 'venda' && c.origemId === id), 'descricao', 'pedido', 'contas');
  else {
    const vendas = S.vendas.filter(v => v.orcamentoId === id), ids = new Set(vendas.map(v => v.id));
    acertar(S.contas.filter(c => (c.origem === 'orcamento' && c.origemId === id) || (c.origem === 'venda' && ids.has(c.origemId))), 'descricao', 'orçamento', 'contas');
    acertar(vendas, 'obs', 'orçamento', 'vendas');
    acertar(S.ordens.filter(o => o.orcamentoId === id), 'obs', 'orçamento', 'ordens');
  }
  novoGrupo();
  toast(`O nº ${antigo} já tinha sido usado em outro aparelho: ${col === 'vendas' ? 'o pedido' : 'o orçamento'} ficou com o nº ${novoN}.`);
}
/* Gravação recusada por falta de permissão: confere com o servidor se esta conta ainda é da equipe. Se não é, larga
   o que estava na fila (não pode ser gravado mais tarde por cima dos dados dos outros) e volta para a entrada. */
async function perdeuOAcesso() {
  if (DEMO || !sb) return false;
  try {
    const { data, error } = await sb.rpc('entrar');
    if (error || data !== 'sem_acesso') return false;                       // sem resposta clara, ou ainda é da equipe: segue tentando
  } catch (e) { return false; }
  FILA.length = 0; VOO = []; grupoAtual = null;
  if (FORM) FORM.sujo = false;
  saindoSemAcesso = true;                                                   // não há o que salvar: sai sem a pergunta do navegador
  location.reload();
  return true;
}
let saindoSemAcesso = false;
/* Canal ao vivo fora do ar há mais de 10 s (rede, antivírus ou proxy barrando): o selo avisa e o sistema confere o
   que mudou a cada minuto, até o canal voltar. */
let aoVivo = true, semAoVivo = false, aoVivoTimer = null, pollTimer = null;
function mostrarSync(estado) {
  syncEstado = estado;
  const semVivo = estado === 'ok' && semAoVivo && !DEMO, cls = semVivo ? 'semvivo' : estado;
  const txt = semVivo ? 'Tudo salvo · sem atualização ao vivo (confere a cada minuto)'
    : { ok: DEMO ? 'Demonstração (só neste navegador)' : 'Tudo salvo na nuvem', salvando: 'Salvando…', erro: 'Sem conexão — clique para tentar de novo' }[estado];
  $$('.sync').forEach(el => { el.className = 'sync s-' + cls; el.title = txt; const t = $('.sync-txt', el); if (t) t.textContent = txt; });
}
function aoConectarAoVivo() {
  aoVivo = true; semAoVivo = false;
  clearTimeout(aoVivoTimer); clearInterval(pollTimer); pollTimer = null;
  mostrarSync(syncEstado);
  conferirMudancas();                                // o que mudou enquanto o canal não estava ligado não chega por ele
}
function aoCairAoVivo() {
  aoVivo = false;
  clearTimeout(aoVivoTimer);
  aoVivoTimer = setTimeout(() => { if (!aoVivo) { semAoVivo = true; mostrarSync(syncEstado); } }, 10000);
  if (!pollTimer) pollTimer = setInterval(() => { if (!aoVivo && !document.hidden) conferirMudancas(); }, 60000);
}
window.addEventListener('online', () => { if (FILA.length) descarregar(); conferirMudancas(); });
window.addEventListener('beforeunload', e => { if (!saindoSemAcesso && (temPendencias() || (FORM && FORM.sujo))) { e.preventDefault(); e.returnValue = ''; } });

/* Confere o que outro aparelho gravou ou excluiu desde a última leitura (com folga de 15 s): na conexão do canal ao
   vivo (o que mudou antes dela não chega por ele), ao voltar para a aba, a cada 5 minutos e, com o canal fora do ar,
   a cada minuto. Baixa inteiras só as linhas mais novas que as daqui. Mudança demais: relê tudo. */
let conferindo = false, conferirDeNovo = false, conferirTimer = null;
async function conferirMudancas() {
  if (DEMO || !sb || typeof DB.mudancasDesde !== 'function' || !$('#main')) return;
  if (conferindo) { conferirDeNovo = true; return; }
  conferindo = true;
  clearTimeout(conferirTimer);
  try {
    const r = await DB.mudancasDesde(new Date(Math.max(0, MARCA_LIDA - 15000)).toISOString());
    if (!r) { recarregar(); return; }
    const mais = (k, v) => { const b = BASE.get(k); return !(b && b.v >= v) && !((APAGADOS.get(k) || 0) > v); };
    const novas = r.linhas.filter(l => mais(l.colecao + '/' + l.id, Number(l.versao) || 0));
    if (novas.length > 300) { recarregar(); return; }
    if (novas.length) (await DB.lerChaves(novas)).forEach(l => aplicarRemoto({ tipo: 'UPSERT', colecao: l.colecao, id: l.id, dados: l.dados, versao: l.versao, atualizado_em: l.atualizado_em }));
    r.apagados.forEach(a => aplicarRemoto({ tipo: 'DELETE', colecao: a.colecao, id: a.id, versao: a.versao }));
    r.linhas.forEach(l => { MARCA_LIDA = Math.max(MARCA_LIDA, Date.parse(l.atualizado_em) || 0); });
    r.apagados.forEach(a => { MARCA_LIDA = Math.max(MARCA_LIDA, Date.parse(a.apagado_em) || 0); });
  } catch (e) {
    console.warn('Não foi possível conferir o que mudou', e);
    conferirTimer = setTimeout(conferirMudancas, 15000);
  } finally {
    conferindo = false;
    if (conferirDeNovo) { conferirDeNovo = false; conferirMudancas(); }
  }
}
setInterval(() => { if (!document.hidden) conferirMudancas(); }, 5 * 60000);
let renderPendente = false, renderTimer = null;
/* Chave com grupo deste aparelho de resultado ainda desconhecido: em voo, ou de volta à fila depois de um envio sem
   resposta clara (o banco pode ter gravado). Nela, a cópia do banco fica parada até o resultado chegar: se o aviso já
   trouxer a nossa gravação (o eco chegou antes da resposta), reaplicar o grupo por cima contaria a soma do estoque e a
   média do preço duas vezes, e um custo calculado nesse intervalo seria gravado errado. */
const chaveIncerta = k => VOO.some(g => g.ops.has(k)) || FILA.some(g => g.incerto && g.ops.has(k));
function guardarAviso(k, l) {
  const e = ESPERA.get(k) || {}, campo = l.x ? 'x' : 'l';
  if (!e[campo] || (Number(l.v) || 0) >= (Number(e[campo].v) || 0)) e[campo] = l;
  ESPERA.set(k, e);
}
/* Resultado conhecido: os avisos guardados entram na cópia do banco, na ordem das versões (a resposta pode já ser mais
   nova, e então o aviso não muda nada), e a chave vai para tocadas, para a tela ser refeita. */
function liberarEspera(tocadas) {
  ESPERA.forEach((e, k) => {
    if (chaveIncerta(k)) return;
    ESPERA.delete(k);
    [e.l, e.x].filter(Boolean).sort((a, b) => (Number(a.v) || 0) - (Number(b.v) || 0)).forEach(atualizarBase);
    tocadas.add(k);
  });
}
/* Mudança que chegou de outro aparelho (canal ao vivo ou conferência): entra na cópia do banco e a tela é refeita com
   as alterações daqui que ainda não foram enviadas por cima. Eco de uma gravação nossa ou aviso velho: nada muda. */
function aplicarRemoto(ev) {
  const l = ev.tipo === 'DELETE' ? { c: ev.colecao, i: ev.id, x: true, v: ev.versao }
    : { c: ev.colecao, i: ev.id, v: ev.versao, e: ev.atualizado_em, d: ev.dados };
  if (typeof l.c !== 'string' || typeof l.i !== 'string') return;
  const k = l.c + '/' + l.i;
  if (chaveIncerta(k)) { guardarAviso(k, l); return; }             // espera a resposta da gravação daqui
  if (!atualizarBase(l)) return;
  refazerVista(k);
  REV++; pedirRender();
}
/* A tela não se mexe embaixo do dedo: o que chega do outro aparelho (e a resposta do banco) espera o dedo soltar a tela ou
   o mouse sair de cima de um botão, no máximo 2 s. Só logo depois de uma ação daqui (algo gravado neste aparelho, até 1,5 s:
   ultimaAcao, marcada em grupoAberto) o mouse parado não segura nada; um clique que só navega, num lugar neutro ou uma tecla
   não mudam isso. */
let ponteiroApertado = false, soltarTimer = null, ultimoPonteiro = '';
addEventListener('pointerdown', e => { clearTimeout(soltarTimer); ponteiroApertado = true; ultimoPonteiro = e.pointerType; }, true);
addEventListener('pointermove', e => { ultimoPonteiro = e.pointerType; }, { capture: true, passive: true });
['pointerup', 'pointercancel'].forEach(ev => addEventListener(ev, () => { clearTimeout(soltarTimer); soltarTimer = setTimeout(() => { ponteiroApertado = false; }, 60); }, true));
addEventListener('blur', () => { ponteiroApertado = false; });
const telaEmUso = () => ponteiroApertado || (ultimoPonteiro === 'mouse' && Date.now() - ultimaAcao > 1500 &&
  !!document.querySelector('#main button:hover, #main a.btn:hover'));
let renderPedidoEm = 0;
function pedirRender() {
  clearTimeout(renderTimer);
  if (!renderPedidoEm) renderPedidoEm = Date.now();
  const tentar = () => {
    // não redesenha por baixo de quem está digitando: espera a janela fechar ou o campo perder o foco
    const ae = document.activeElement;
    const digitando = ae && ae.closest && ae.closest('#main') && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName);
    if ($('#modal.open') || digitando) { renderPendente = true; renderPedidoEm = 0; return; }
    if (telaEmUso() && Date.now() - renderPedidoEm < 2000) { renderTimer = setTimeout(tentar, 120); return; }
    renderPedidoEm = 0;
    if (paginaAtual() === 'perfil' && typeof renderMantendoPerfil === 'function') renderMantendoPerfil();   // não perde o que foi digitado e não salvo
    else render();
  };
  renderTimer = setTimeout(tentar, 200);
}
document.addEventListener('focusout', () => { if (renderPendente) setTimeout(() => { if (renderPendente && !$('#modal.open')) pedirRender(); }, 400); });
/* recarga = true: atualização com o sistema já aberto. Se algo mudou aqui (ou chegou de outro aparelho) enquanto a
   leitura acontecia, o retrato lido já está velho: devolve false sem trocar nada, e quem chamou tenta de novo. */
async function carregarTudo(recarga = false) {
  const rev = REV;
  const rows = await DB.carregar();
  if (recarga && (REV !== rev || temPendencias())) return false;
  // Atualização que não enxerga NENHUM dado: esta conta perdeu o acesso (ou o navegador trocou de conta). Não troca
  // o que está na tela nem grava nada: recarrega a página, e a entrada decide o que mostrar.
  if (recarga && !rows.length) { location.reload(); return true; }
  const s = novoEstado(), vistos = new Set();
  let temConfig = false, marca = 0;
  BASE.clear(); ESPERA.clear();
  rows.forEach(r => {
    const k = r.colecao + '/' + r.id;
    if (vistos.has(k)) return;
    vistos.add(k);
    marca = Math.max(marca, Date.parse(r.atualizado_em) || 0);
    BASE.set(k, { d: copia(r.dados), v: Number(r.versao) || 0 });
    if (r.colecao === 'meta') {
      if (r.id === 'config') { Object.assign(s.config, soSimples(r.dados)); temConfig = true; }
      else if (r.id === 'perfil') s.perfil = perfilLimpo(r.dados);
    } else if (Array.isArray(s[r.colecao]) && registroValido(r.dados) && r.dados.id === r.id) { s[r.colecao].push(r.dados); DA_TELA.add(r.dados); }
  });
  S = s; REV++;
  MARCA_LIDA = Math.max(MARCA_LIDA, marca);
  // Primeiro uso: grava os padrões. Só na abertura do sistema, logo depois de a entrada confirmar que a conta é da
  // equipe; numa atualização com o sistema aberto nunca, para não passar os padrões por cima dos dados de verdade.
  if (!temConfig && !recarga) {
    saveMeta('config', { tudo: true }); saveMeta('perfil', { tudo: true });
    CANAIS_PADRAO.forEach(c => { if (!byId('canais', c.id)) put('canais', { ...c }, { seExistir: 'ignorar' }); });
  }
}
let escondidoEm = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { escondidoEm = Date.now(); return; }
  if (escondidoEm && Date.now() - escondidoEm > 60000 && $('#main')) conferirMudancas();
  conferirVersao();
});

/* ---------- Versão nova publicada ----------
   Uma aba aberta continua na versão antiga até ser recarregada. Ao voltar para a aba (no máximo a cada 5 minutos) e a
   cada 30 minutos, confere o número da versão publicada e, se houver uma mais nova, oferece atualizar. */
const VERSAO = 19;
let avisouVersao = false, conferidoEm = 0;
async function conferirVersao(forcar = false) {
  if (DEMO || avisouVersao || !$('#main') || (!forcar && Date.now() - conferidoEm < 5 * 60000)) return;
  conferidoEm = Date.now();
  try {
    const r = await fetch('index.html?versao=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const m = /js\/base\.js\?v=(\d+)/.exec(await r.text());
    if (m && Number(m[1]) > VERSAO) { avisouVersao = true; mostrarVersaoNova(); }
  } catch (e) { /* sem internet: confere de novo mais tarde */ }
}
setInterval(() => conferirVersao(true), 30 * 60000);
function mostrarVersaoNova() {
  if ($('#versaoNova')) return;
  document.body.insertAdjacentHTML('beforeend', `<div id="versaoNova" class="versao-nova" role="status">
    <span><b>Versão nova do Nexos.</b> Atualize para usar as novidades.</span>
    <button type="button" class="btn sm" onclick="atualizarVersao()">Atualizar agora</button>
    <button type="button" class="x" aria-label="Depois" onclick="adiarVersao(this)">✕</button></div>`);
}
/* "Depois": esconde o aviso agora, mas ele volta na próxima conferência (ao voltar para a aba ou a cada 30 minutos). */
function adiarVersao(botao) {
  if (botao && botao.parentNode) botao.parentNode.remove();
  avisouVersao = false; conferidoEm = Date.now();
}
function atualizarVersao() {
  if (temPendencias()) { toast('Aguarde um instante: ainda há dados sendo salvos.'); descarregar(); return; }
  if (FORM && FORM.sujo && !confirmar('Há um formulário preenchido e ainda não salvo. Atualizar mesmo assim?')) return;
  if (FORM) FORM.sujo = false;
  location.reload();
}
let recarregarDepois = false, recarregando = false, recarregarDeNovo = false;
async function recarregar(tentativa = 0) {
  if (temPendencias()) { recarregarDepois = true; descarregar(); return; }      // grava o que falta e recarrega em seguida
  if (recarregando) { recarregarDeNovo = true; return; }                        // pedido novo com uma leitura em andamento
  recarregando = true;
  let velho = false, falhou = false;
  try { velho = (await carregarTudo(true)) === false; if (!velho) pedirRender(); }
  catch (e) { falhou = true; console.warn('Não foi possível atualizar agora', e); }
  recarregando = false;
  const deNovo = recarregarDeNovo; recarregarDeNovo = false;
  // não desiste: leitura velha (algo mudou durante ela) ou sem rede tenta de novo, cada vez com mais calma
  if (velho || falhou) setTimeout(() => recarregar(tentativa + 1), Math.min(60000, (velho ? 1500 : 5000) * (tentativa + 1)));
  else if (deNovo) recarregar();
}

/* ---------- Arquivos (fotos e modelos 3D) ---------- */
const urlCache = new Map();   // path -> { url, exp }
const nomeSeguro = n => String(n || 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80);
function reduzirImagem(file, max = 1200, q = 0.85) {
  return new Promise(resolve => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return resolve(file);
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => resolve(b || file), 'image/jpeg', q);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
async function enviarArquivo(file, pasta, ehImagem) {
  const LIMITE = 50 * 1024 * 1024;
  if (file.size > LIMITE) throw new Error('Arquivo maior que 50 MB.');
  const blob = ehImagem ? await reduzirImagem(file) : file;
  const nome = ehImagem && blob !== file ? nomeSeguro(file.name).replace(/\.[^.]+$/, '') + '.jpg' : nomeSeguro(file.name);
  const path = `${pasta}/${uid()}-${nome}`;
  await DB.enviarArquivo(path, blob, blob.type || file.type);
  return { path, nome: file.name, tamanho: blob.size };
}
async function hidratarImagens(raiz = document) {
  const imgs = $$('img[data-path]', raiz).filter(i => !i.getAttribute('src'));
  if (!imgs.length) return;
  const agora = Date.now();
  const faltam = [...new Set(imgs.map(i => i.dataset.path))].filter(p => !(urlCache.has(p) && urlCache.get(p).exp > agora));
  if (faltam.length) {
    try {
      const m = await DB.urlsArquivos(faltam);
      Object.keys(m).forEach(p => urlCache.set(p, { url: m[p], exp: agora + 50 * 60000 }));
    } catch (e) { console.warn('Não foi possível carregar as imagens', e); }
  }
  imgs.forEach(i => { const c = urlCache.get(i.dataset.path); if (c) i.src = c.url; });
}
async function baixarArquivo(path, nome) {
  try {
    const url = await DB.urlDownload(path, nome);
    if (!url) throw new Error('arquivo indisponível');
    const a = document.createElement('a'); a.href = url; a.download = nome || ''; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { toast('Não foi possível baixar o arquivo.', 'bad'); }
}
function removerArquivos(paths) {
  paths = (paths || []).filter(Boolean);
  if (paths.length) DB.removerArquivos(paths).catch(e => console.warn('Arquivo não removido', e));
}
const tamanhoFmt = b => { b = num(b); return b >= 1048576 ? nf(b / 1048576, 1) + ' MB' : nf(Math.max(1, b / 1024)) + ' KB'; };

/* ---------- Estrutura da tela ---------- */
const IC = {
  painel: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  producao: '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
  falhas: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  manutencao: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  produtos: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.4"/>',
  vendas: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  orcamentos: '<path d="M6 2h8l5 5v15H6z"/><path d="M14 2v5h5M9 13h7M9 17h7"/>',
  clientes: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M16.5 4.2a4 4 0 0 1 0 7.6M19 15.5c2 .9 3 2.800 3 5.500"/>',
  filamentos: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6"/>',
  compras: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  insumos: '<path d="M3 7h18v13H3z"/><path d="m3 7 3-4h12l3 4M10 11h4"/>',
  financeiro: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M15 15h3"/>',
  contas: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M8.5 15l2.2 2.2 4.8-4.8"/>',
  relatorios: '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-9"/>',
  config: '<path d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
};
const icone = k => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k] || ''}</svg>`;
const NAV = [
  ['Operação', [['painel', 'Painel'], ['producao', 'Produção'], ['falhas', 'Falhas'], ['manutencao', 'Manutenção']]],
  ['Comercial', [['produtos', 'Produtos'], ['vendas', 'Vendas e estoque'], ['orcamentos', 'Orçamentos'], ['clientes', 'Clientes']]],
  ['Materiais', [['filamentos', 'Filamentos'], ['compras', 'Compras'], ['insumos', 'Insumos']]],
  ['Gestão', [['financeiro', 'Financeiro'], ['contas', 'Contas a pagar e receber'], ['relatorios', 'Relatórios'], ['config', 'Configuração'], ['perfil', 'Perfil e equipe']]],
];
const VIEWS = {};
const paginaAtual = () => location.hash.replace(/^#\/?/, '').split('?')[0] || 'painel';
function ir(pg) { if (paginaAtual() === pg) render(); else location.hash = pg; }
window.addEventListener('hashchange', e => {
  document.body.classList.remove('nav-open');
  if ($('#modal.open')) {
    // Voltar do navegador (ou link dentro da janela) com formulário preenchido: pergunta antes de descartar
    if (FORM && FORM.sujo && !confirmar('Descartar o que foi preenchido?')) {
      if (e.oldURL) history.pushState(null, '', e.oldURL);   // devolve a tela do formulário ao topo do histórico
      return;
    }
    limparArquivosDoForm(false); fecharModal();
  }
  render(); window.scrollTo(0, 0);
});
/* Telas que dependem do relógio (previsão da fila, prazos) se atualizam sozinhas a cada minuto. */
setInterval(() => { if (!document.hidden && $('#main') && ['painel', 'producao'].includes(paginaAtual())) pedirRender(); }, 60000);

/* Marca do menu: o símbolo e o nome da Nexos (animados pelo visual.js). Se a empresa escolheu outra logo no Perfil,
   vale a dela, com o nome da empresa em texto. */
function logoHTML() {
  const propria = logoSegura(S.perfil.logo);
  if (propria) {
    const n = String(S.perfil.empresa || 'Nexos').toUpperCase(), i = n.indexOf('X');
    const txt = i >= 0 ? esc(n.slice(0, i)) + '<b>X</b>' + esc(n.slice(i + 1)) : esc(n);
    return `<img class="brand-propria" src="${esc(propria)}" alt=""><div><div class="logo">${txt}</div><small>Produção 3D</small></div>`;
  }
  return `<span class="marca-viva" aria-hidden="true"><img src="img/marca.webp" alt="" width="44" height="44"></span>
    <span class="brand-nome"><img src="img/nome.webp" alt="Nexos 3D" width="134" height="34"><small>Produção 3D</small></span>`;
}
function montarEstrutura() {
  $('#app').innerHTML = `
    <header class="topbar">
      <button class="menu-btn" aria-label="Abrir menu" onclick="document.body.classList.toggle('nav-open')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
      <a class="brand brand-top" href="#painel"></a>
      <span class="sync" onclick="descarregar()"><i></i></span>
    </header>
    <aside class="side">
      <a class="brand brand-side" href="#painel"></a>
      <nav id="nav"></nav>
      <div class="side-foot">
        <div class="sync" onclick="descarregar()"><i></i><span class="sync-txt"></span></div>
        <div class="quem"><span id="quem"></span>${DEMO ? '' : '<button class="link" onclick="sair()">Sair</button>'}</div>
      </div>
    </aside>
    <div class="backdrop" onclick="document.body.classList.remove('nav-open')"></div>
    <main id="main"></main>`;
  mostrarSync(syncEstado);
}
let ultimaPagina = '';
/* Ganchos chamados depois de cada desenho da tela: fn(trocouDeTela, pagina). O visual.js usa para as animações de
   entrada, que só acontecem quando a pessoa troca de tela (e não a cada atualização que chega de outro aparelho). */
const DEPOIS_RENDER = [];
function render() {
  if (!$('#main')) return;
  renderPendente = false;
  const pg = VIEWS[paginaAtual()] ? paginaAtual() : 'painel';
  const trocou = pg !== ultimaPagina;
  // guarda a rolagem lateral das tabelas para devolver depois de redesenhar a mesma tela
  const rolagens = !trocou ? $$('#main .scroll').map(s => s.scrollLeft) : [];
  ultimaPagina = pg;
  // marca e avisos do menu nunca podem impedir a tela de abrir: um dado torto aqui trancaria todo mundo para fora
  // marca e menu só são trocados quando mudam: assim a logo animada não recomeça a cada atualização da tela
  try { const marca = logoHTML(); $$('.brand').forEach(b => { if (b._marca !== marca) { b.innerHTML = marca; b._marca = marca; } }); } catch (e) { console.error(e); }
  let avisos = {};
  try { if (typeof contagemAvisos === 'function') avisos = contagemAvisos() || {}; } catch (e) { console.error(e); }
  const menu = NAV.map(([grupo, itens]) => `<div class="nav-g">${grupo}</div>` + itens.map(([k, l]) =>
    `<a href="#${k}" class="${k === pg ? 'on' : ''}">${icone(k)}<span>${l}</span>${avisos[k] ? `<em class="pill">${avisos[k]}</em>` : ''}</a>`).join('')).join('');
  const nav = $('#nav');
  if (nav._html !== menu) { nav.innerHTML = menu; nav._html = menu; }
  $('#quem').textContent = DEMO ? 'Modo demonstração' : EU.email;
  let html;
  try { html = VIEWS[pg](); }
  catch (e) { console.error(e); html = `<div class="panel"><h2>Não foi possível abrir esta tela</h2><p class="muted">${esc(e.message || e)}</p></div>`; }
  $('#main').innerHTML = html;
  if (rolagens.some(x => x > 0)) { const novas = $$('#main .scroll'); if (novas.length === rolagens.length) novas.forEach((s, i) => { s.scrollLeft = rolagens[i]; }); }
  hidratarImagens($('#main'));
  if (typeof ativarGraficos === 'function') ativarGraficos(trocou);
  if (VIEWS[pg] && typeof VIEWS[pg].depois === 'function') { try { VIEWS[pg].depois(); } catch (e) { console.error(e); } }
  DEPOIS_RENDER.forEach(fn => { try { fn(trocou, pg); } catch (e) { console.error(e); } });
}

/* Pedaços de tela reutilizados pelas views */
const head = (titulo, sub, acoes = '') => `<div class="head"><div><h1>${titulo}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="head-acoes">${acoes}</div></div>`;
const vazio = (msg, acao = '') => `<div class="empty">${msg}${acao ? `<div class="empty-acao">${acao}</div>` : ''}</div>`;
const selo = (txt, tipo = 'mute') => `<span class="selo s-${tipo}">${esc(txt)}</span>`;
const corSegura = c => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? String(c) : '#888888');     // só cor em hexadecimal entra em style
const cor = c => `<span class="dot" style="background:${corSegura(c)}"></span>`;
const kpi = (rotulo, valor, detalhe = '', cls = '') => `<div class="kpi"><span>${rotulo}</span><strong class="${cls}">${valor}</strong>${detalhe ? `<em>${detalhe}</em>` : ''}</div>`;
/* tabela(['Data', { t: 'Valor', r: 1 }], linhasHTML) — r: 1 alinha a coluna à direita. No celular a tabela rola de lado e a
   coluna do nome da linha fica presa (preso-N): a marcada com nome: 1 ou a primeira que não é data, número ou tipo (em
   Compras, o filamento; em Pedidos, os itens). */
const COL_SEM_NOME = /^(Data|Nº|Vencimento|Tipo)$/;
const tabela = (cols, linhas) => {
  const rot = c => String(typeof c === 'string' ? c : (c && c.t) || '').trim();
  let preso = cols.findIndex(c => c && typeof c === 'object' && c.nome);
  if (preso < 0) preso = cols.findIndex(c => !COL_SEM_NOME.test(rot(c)));
  if (preso < 0 || preso > 3) preso = 0;
  return `<div class="scroll preso-${preso + 1}"><table><thead><tr>${cols.map(c => typeof c === 'string' ? `<th>${c}</th>` : `<th class="${c.r ? 'right' : ''}">${c.t}</th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table></div>`;
};
/* seletorMes('2026-11', 'minhaFuncao') — lista de meses (24 para trás, 1 para frente); ao trocar chama minhaFuncao('AAAA-MM').
   Usado no lugar de <input type="month">, que não funciona em todos os navegadores. */
function seletorMes(valor, fn, rotulo = 'Mês') {
  const meses = [];
  for (let i = 1; i >= -24; i--) meses.push(addMeses(mesAtual(), i));
  if (valor && !meses.includes(valor)) meses.push(valor);
  return `<div><label for="mes_${fn}">${esc(rotulo)}</label><select id="mes_${fn}" onchange="${fn}(this.value)">${meses.map(m =>
    `<option value="${m}"${m === valor ? ' selected' : ''}>${esc(nomeMesLongo(m))}</option>`).join('')}</select></div>`;
}
/* medidor(72) — barra de progresso; tipo: '' | 'warn' | 'bad' | 'ok' */
const medidor = (p, tipo = '') => `<div class="meter ${tipo}" role="img" aria-label="${pct(p)}"><i style="width:${Math.max(0, Math.min(100, num(p)))}%"></i></div>`;

/* ---------- Avisos (toast) e Desfazer ----------
   toast(texto, tipo, acao): o aviso fica o tempo de ler, longe dos botões de trabalho (no celular, no alto, ao lado do botão do
   menu, que fica livre; no computador, no canto de baixo à esquerda da área de trabalho, fora do menu e longe dos botões das
   linhas, que ficam à direita). Tocar no aviso só fecha o aviso: o toque nunca passa para o que está
   embaixo dele. tipo: '' (feito), 'warn' ou 'bad' (importantes: de 6 a 16 s conforme o tamanho do texto, com ✕ para fechar).
   acao: { rotulo, fn, grupos, mudou }: botão (o Desfazer) por 8 s, um por vez; depois de uma ação feita pelo teclado, o
   cursor vai para ele. O aviso de sucesso de uma gravação que o banco recusar some sozinho (avisarRecusados). */
let ultimoTeclado = 0;           // último botão apertado pelo teclado (Enter ou espaço)
function toast(msg, tipo = '', acao) {
  let cx = $('#toasts');
  if (!cx) { cx = document.createElement('div'); cx.id = 'toasts'; cx.setAttribute('role', 'status'); cx.setAttribute('aria-live', 'polite'); document.body.appendChild(cx); }
  const grave = tipo === 'bad' || tipo === 'warn', texto = String(msg ?? '');
  const ms = acao ? 8000 : Math.min(16000, Math.max(grave ? 6000 : 3200, 1000 + texto.length * (grave ? 62 : 45)));
  const t = document.createElement('div'), tx = document.createElement('span');
  t.className = 'toast ' + tipo; t.style.setProperty('--tempo', ms + 'ms');
  tx.textContent = texto; t.appendChild(tx);
  let fim = 0;
  const sair = () => { clearTimeout(fim); t.remove(); };
  fim = setTimeout(sair, ms);
  t._sair = sair;
  // grupos de gravação deste aviso: os da ação (Desfazer) ou o do clique em andamento
  t._grupos = acao ? (acao.grupos || []) : !grave && grupoAtual && grupoAtual.ops.size ? [grupoAtual] : [];
  t.addEventListener('click', e => { if (!e.target.closest('button')) sair(); });   // tocar no texto só fecha o aviso
  let foco = null;
  if (acao) {
    $$('.toast.com-acao', cx).forEach(x => x._sair());
    t.classList.add('com-acao');
    const b = document.createElement('button'), desde = Date.now();
    b.type = 'button'; b.className = 'btn ghost sm'; b.textContent = acao.rotulo || 'Desfazer';
    // o rótulo entra na chave do toque repetido: o 2º toque em "Marcar tudo como pedido" não cai no Desfazer que nasce no lugar dele
    b.dataset.k = b.textContent;
    // a mesma tecla repetida que fez a ação (Enter duas vezes) não desfaz na hora
    b.onclick = e => { if (e && e.isTrusted && e.detail === 0 && Date.now() - desde < 500) return; sair(); usarAcaoDoAviso(acao); };
    t.appendChild(b);
    if (Date.now() - ultimoTeclado < 1500 && !$('#modal.open')) foco = b;
  } else if (grave) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'x'; b.setAttribute('aria-label', 'Fechar aviso'); b.textContent = '✕'; b.onclick = sair;
    t.appendChild(b);
  }
  cx.appendChild(t);
  if (foco) { try { foco.focus({ preventScroll: true }); } catch (e) { /* sem foco: segue */ } }
  return t;
}
/* Os grupos de uma ação ainda estão como ela gravou? Sem resposta do banco: sim (o que vier depois espera por eles).
   Recusados: não. Gravados: só se nenhum movimento deles (ordem, pedido, conta...) mudou depois, aqui ou em outro aparelho.
   O estoque não conta: ele é somado no banco, e desfazer devolve só o que a ação somou. Movimento gravado por mais de um grupo
   da mesma ação (ex.: Falhou muda a ordem e depois a contagem de falhas dela) é conferido no último deles. */
function gravacaoValeAinda(grupos) {
  const ultimo = new Map();
  grupos.forEach(g => g.ops.forEach((op, k) => { if (!ultimo.has(k) || ultimo.get(k).n < g.n) ultimo.set(k, g); }));
  return grupos.every(g => {
    const r = RESULTADOS.get(g.n);
    if (!r) return !g.ops.size || FILA.includes(g) || VOO.includes(g);
    if (!r.ok) return false;
    return [...g.ops.keys()].filter(k => COM_VERSAO.has(k.slice(0, k.indexOf('/'))) && ultimo.get(k) === g).every(k => {
      const v = r.versoes.get(k), b = BASE.get(k);
      return v === undefined || (v === -1 ? !b : !!b && b.v === v);
    });
  });
}
function usarAcaoDoAviso(acao) {
  if (!gravacaoValeAinda(acao.grupos || [])) { render(); toast(acao.mudou || 'Isto já mudou depois. Nada foi desfeito.', 'bad'); return; }
  const marca = marcaDesfazer(), antes = new Set($$('#toasts .toast'));
  acao.fn();
  // o aviso do que foi desfeito acompanha todas as gravações do desfazer: se uma delas não valer, ele some (a tela já mostra
  // como ficou)
  const gs = FILA.filter(g => g.n > marca && g.ops.size);
  $$('#toasts .toast').forEach(t => { if (!antes.has(t) && !t.classList.contains('com-acao') && (t._grupos || []).length) t._grupos = gs; });
}
/* Desfazer por 8 s: marca = marcaDesfazer() antes da ação e, depois dela, avisoDesfazer(texto, marca, fn). Os grupos gravados
   depois da marca são os da ação; fn desfaz com as funções de sempre (reabrirOrdem, excluirOrdem...) e confere o estado. */
function marcaDesfazer() {
  novoGrupo();
  return grupoAtual ? grupoAtual.n - 1 : seqGrupo;
}
const avisoDesfazer = (msg, marca, fn, rotulo = 'Desfazer') => toast(msg, '', { rotulo, fn, grupos: FILA.filter(g => g.n > marca) });
const confirmar = msg => window.confirm(msg);

/* ---------- Pergunta curta com botões grandes (no lugar do OK/Cancelar do navegador) ----------
   perguntar(titulo, textoHTML, [{ rotulo, fn, cls, foco }]): cls '' = botão vermelho (o que vai acontecer); sem cls, discreto;
   sem fn, só fecha; foco: true = o cursor começa nele (o Enter faz o que ele diz, como o OK que a pergunta substitui; sem
   nenhum marcado, o primeiro). O cursor nunca deve começar num botão que joga fora o que a pessoa digitou. Os nomes no texto
   passam por esc(). Com um formulário aberto, a pergunta aparece no lugar dele, e o ✕ (ou Esc) volta ao formulário como
   estava. No celular a pergunta sobe do rodapé: o último botão fica onde estava o Salvar, e o segundo toque de quem tocou
   duas vezes no Salvar cai nele (ele não pode ser o que grava outra vez). */
let PERGUNTA = null;
function perguntar(titulo, texto, botoes) {
  const m = $('#modal'), form = FORM && FORM.form && m.classList.contains('open') && m.contains(FORM.form) ? FORM.form : null;
  const corpo = `<p class="pergunta-txt">${texto}</p><div class="pergunta-botoes">${botoes.map((b, i) =>
    `<button type="button" class="btn ${b.cls === undefined ? 'ghost' : b.cls}" data-i="${i}" onclick="responder(${i}, event)">${esc(b.rotulo)}</button>`).join('')}</div>`;
  if (form) {
    if (PERGUNTA && PERGUNTA.caixa) PERGUNTA.caixa.remove();
    form.hidden = true;
    const c = document.createElement('div');
    c.className = 'caixa pergunta';
    c.innerHTML = `<div class="modal-head"><h3>${esc(titulo)}</h3><button type="button" class="x" onclick="responder(-1)" aria-label="Voltar">✕</button></div>${corpo}`;
    m.appendChild(c);
    PERGUNTA = { botoes, caixa: c, form, desde: Date.now() };
    janelaAbertaEm = Date.now();                     // o mesmo toque duplo que abriu a pergunta não a fecha
  } else {
    abrirModal(corpo, { title: titulo });
    $('.caixa', m).classList.add('pergunta');
    PERGUNTA = { botoes, desde: Date.now() };
  }
  // no celular, como nas janelas, o cursor não vai para botão nenhum (o toque decide e nada fica marcado como se fosse o certo)
  const bs = $$('.pergunta-botoes .btn', m), b = bs[Math.max(0, botoes.findIndex(x => x.foco))];
  if (b && !('ontouchstart' in window)) b.focus();
}
function responder(i, e) {
  const p = PERGUNTA;
  if (!p) return;
  // Enter (ou espaço) apertado logo depois de a pergunta aparecer, sem tempo de ler, não responde: o segundo de dois Enter
  // seguidos no Salvar não fecha a pergunta que a pessoa nem viu (quem leu aperta de novo)
  if (i >= 0 && e && e.isTrusted && e.detail === 0 && Date.now() - (p.desde || 0) < 500) return;
  PERGUNTA = null;
  const b = i >= 0 ? p.botoes[i] : null;
  if (p.form) { p.caixa.remove(); p.form.hidden = false; } else fecharModal();
  if (b && b.fn) b.fn();
  else if (p.form) { const s = $('button[type=submit]', p.form); if (s) s.focus(); }
}

/* ---------- Toque repetido ----------
   Até 0,7 s depois de um toque (ou clique), outro no mesmo lugar (até 40 px) não vale se a tela mudou embaixo dele (o controle
   tocado sumiu ou foi redesenhado, ou uma janela, uma pergunta ou o menu abriu ou fechou) e ele cairia em outro controle. Ex.:
   dois toques rápidos em Iniciar não concluem a ordem. O mesmo controle redesenhado no mesmo lugar vale (de propósito), e pelo
   teclado nada muda: clique com detail 0 nunca é barrado. */
let toqueAnterior = null;
const chaveDoControle = el => [el.getAttribute('onclick') || el.getAttribute('href') || el.type || el.tagName, el.dataset.id || '',
  el.dataset.i || el.dataset.k || el.dataset.mover || el.dataset.addRow || '', el.getAttribute('aria-label') || ''].join('|');
const estadoDaTela = () => [!!$('#modal.open'), !!PERGUNTA, document.body.classList.contains('nav-open')].join('|');
document.addEventListener('click', e => {
  if (e.isTrusted && e.detail === 0 && e.target && e.target.closest && e.target.closest('button,a')) ultimoTeclado = Date.now();
  if (!e.isTrusted || !(e.detail > 0) || !e.target || !e.target.closest) return;
  const el = e.target.closest('button,a,summary,label,select,[onclick]'), agora = Date.now(), tela = estadoDaTela(), a = toqueAnterior;
  if (a && agora - a.t < 700 && Math.hypot(e.clientX - a.x, e.clientY - a.y) < 40 &&
    (!a.el.isConnected || !a.el.getClientRects().length || a.tela !== tela) && (!el || chaveDoControle(el) !== a.k)) {
    e.preventDefault(); e.stopImmediatePropagation();
    return;
  }
  if (el) toqueAnterior = { t: agora, x: e.clientX, y: e.clientY, k: chaveDoControle(el), el, tela };
}, true);

/* ---------- Janela (modal) e formulários ---------- */
let FORM = null;
/* Faz a janela se comportar como diálogo: o resto da tela fica inerte (teclado e leitor de tela não passam por trás)
   e o foco volta para onde estava quando ela fecha. */
let focoAntes = null, janelaAbertaEm = 0;
function marcarJanela(m, titulo) {
  janelaAbertaEm = Date.now();
  if (!focoAntes) focoAntes = document.activeElement;
  m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', titulo || 'Janela');
  const app = $('#app'); if (app) app.inert = true;
}
function abrirModal(html, o = {}) {
  FORM = null;
  const m = $('#modal');
  m.innerHTML = `<div class="caixa ${o.wide ? 'wide' : ''}"><div class="modal-head"><h3>${esc(o.title || '')}</h3><button type="button" class="x" onclick="fecharModal()" aria-label="Fechar">✕</button></div>${html}</div>`;
  m.classList.add('open'); document.body.classList.add('modal-aberto');
  marcarJanela(m, o.title);
  const fechar = $('.x', m); if (fechar) fechar.focus();
  hidratarImagens(m);
}
function fecharModal() {
  const m = $('#modal');
  m.classList.remove('open'); m.innerHTML = '';
  document.body.classList.remove('modal-aberto');
  FORM = null; PERGUNTA = null;
  const app = $('#app'); if (app) app.inert = false;
  if (focoAntes && document.contains(focoAntes)) { try { focoAntes.focus(); } catch (e) { /* elemento sumiu */ } }
  focoAntes = null;
  if (renderPendente) render();
}
function controle(f, v, attr) {
  const a = attr + (f.req ? ' required' : '') + (f.ph ? ` placeholder="${esc(f.ph)}"` : '');
  if (f.type === 'select') {
    return `<select ${a}>${(f.options || []).map(([val, lab]) => `<option value="${esc(val)}"${String(val) === String(v ?? '') ? ' selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;
  }
  if (f.type === 'textarea') return `<textarea ${a} rows="${f.rows || 3}">${esc(v ?? '')}</textarea>`;
  if (f.type === 'number') {
    // Campo de texto com teclado numérico: aceita "1.250,50", "1.500" e, com tempo: 'h' | 'min', "2h30".
    // Por padrão não aceita negativo (neg: true libera); min muda o mínimo; step: 1 exige número inteiro.
    return `<input ${a} type="text" inputmode="decimal" autocomplete="off" data-num="1"${f.neg ? ' data-neg="1"' : ''}${f.min != null ? ` data-min="${esc(f.min)}"` : ''}${String(f.step) === '1' ? ' data-int="1"' : ''}${f.tempo ? ` data-tempo="${esc(f.tempo)}"` : ''} value="${esc(paraCampo(v))}">`;
  }
  const faixa = f.type === 'date' ? ' min="2000-01-01" max="2099-12-31"' : '';      // sem isto o navegador aceita ano 0026 ou 20266
  return `<input ${a} type="${esc(f.type || 'text')}"${faixa} value="${esc(v ?? '')}">`;
}
function linhaHTML(f, r) {
  return `<div class="row" style="--cols:${f.cols.map(c => c.w || '1fr').join(' ')}">
    ${f.cols.map(c => `<div><label aria-hidden="true">${esc(c.label)}</label>${controle(c, (r || {})[c.k], `data-col="${esc(c.k)}" aria-label="${esc(c.label)}"`)}</div>`).join('')}
    <button type="button" class="btn danger sm" data-del-row title="Remover linha" aria-label="Remover linha">✕</button></div>`;
}
function linhasHTML(f, v) {
  const linhas = Array.isArray(v) && v.length ? v : (f.min ? [f.novo ? f.novo() : {}] : []);
  return `<div class="rows" data-rows="${f.k}"><div class="rows-body">${linhas.map(r => linhaHTML(f, r)).join('')}</div>
    <button type="button" class="btn ghost sm" data-add-row="${f.k}">${esc(f.add || '+ Adicionar')}</button></div>`;
}
function arquivoHTML(f, v) {
  const tem = v && v.path;
  return `<div class="filebox" data-file="${f.k}">
    ${f.imagem ? `<img class="thumb" alt="" ${tem ? `data-path="${esc(v.path)}"` : 'hidden'}>` : ''}
    <span class="fname">${tem ? esc(v.nome || 'arquivo') + (v.tamanho ? ' · ' + tamanhoFmt(v.tamanho) : '') : 'Nenhum arquivo'}</span>
    <button type="button" class="btn ghost sm" data-pick>${tem ? 'Trocar' : 'Escolher'}</button>
    <button type="button" class="btn danger sm" data-clear ${tem ? '' : 'hidden'}>Remover</button>
    <input type="file" hidden ${f.accept ? `accept="${esc(f.accept)}"` : ''}></div>`;
}
/* campo(f, valor): um campo com rótulo. Tipos: text (padrão), number, date, month, color, email, tel, password,
   select (options: [[valor, rótulo]]), textarea, check, rows (cols: [...]), file, titulo, html. */
function campo(f, v, pre = 'c') {
  if (f.type === 'html') return `<div class="full">${f.html}</div>`;
  if (f.type === 'titulo') return `<div class="full form-sec">${esc(f.label)}</div>`;
  const cls = f.full || f.type === 'rows' || f.type === 'textarea' ? ' class="full"' : '';
  const hint = f.hint ? `<div class="hint">${esc(f.hint)}</div>` : '';
  if (f.type === 'check') return `<div${cls}><label class="check"><input type="checkbox" name="${esc(f.k)}"${v ? ' checked' : ''}> <span>${esc(f.label)}</span></label>${hint}</div>`;
  if (f.type === 'rows' || f.type === 'file') {
    return `<div${cls}><div class="rotulo">${esc(f.label)}</div>${f.type === 'rows' ? linhasHTML(f, v) : arquivoHTML(f, v)}${hint}</div>`;
  }
  const id = `${pre}_${f.k}`;      // rótulo ligado ao campo: clicar no nome foca o campo e leitores de tela leem o nome
  return `<div${cls}><label for="${esc(id)}">${esc(f.label)}</label>${controle(f, v, `name="${esc(f.k)}" id="${esc(id)}"`)}${hint}</div>`;
}
/* Confere um campo numérico e marca a mensagem de erro que o navegador mostra ao salvar. */
function validarNumero(el) {
  const t = el.value.trim();
  let msg = '';
  if (t) {
    const n = numTexto(t, el.dataset.tempo), min = Number(el.dataset.min ?? 0);
    if (!isFinite(n)) msg = el.dataset.tempo === 'h' ? 'Digite as horas assim: 2,5 ou 2h30' : el.dataset.tempo === 'min' ? 'Digite os minutos assim: 15 ou 1h30' : 'Digite só números. Exemplo: 1.250,50';
    else if (!el.dataset.neg && n < min) msg = min === 0 ? 'O valor não pode ser negativo.' : 'O valor mínimo é ' + nf(min, 2) + '.';
    else if (el.dataset.int && !Number.isInteger(n)) msg = 'Use um número inteiro.';
  }
  el.setCustomValidity(msg);
  return !msg;
}
document.addEventListener('input', e => { if (e.target && e.target.dataset && e.target.dataset.num) validarNumero(e.target); }, true);
const lerNumero = (el, c) => { const n = numTexto(el.value, c.tempo); return isFinite(n) ? n : 0; };
/* Campo do formulário pelo nome, com namedItem: um campo chamado "item" ou "length" não se confunde com a lista. */
const campoDoForm = (form, nome) => { const els = form && form.elements; return els ? (typeof els.namedItem === 'function' ? els.namedItem(nome) : els[nome]) : null; };
function lerCampos(form, fields) {
  const o = {};
  fields.forEach(f => {
    if (!f.k || f.type === 'html' || f.type === 'titulo') return;
    if (f.type === 'rows') {
      o[f.k] = $$(`[data-rows="${f.k}"] .row`, form).map(row => {
        const r = {};
        f.cols.forEach(c => { const el = $(`[data-col="${c.k}"]`, row); r[c.k] = c.type === 'number' ? lerNumero(el, c) : el.value.trim(); });
        return r;
      });
      return;
    }
    if (f.type === 'file') { o[f.k] = (FORM && FORM.files[f.k]) || null; return; }
    // namedItem: um campo chamado "item" ou "length" não pode ser confundido com o que a lista de campos já tem
    const el = campoDoForm(form, f.k);
    if (!el) return;
    o[f.k] = f.type === 'check' ? el.checked : f.type === 'number' ? lerNumero(el, f) : el.value.trim();
  });
  return o;
}
/* openForm({ title, fields, vals, save(d, form), preview(d, form), change(el, form), wide, saveLabel, extra, esperaEnter })
   - save pode ser async; devolver false mantém a janela aberta (ex.: validação).
   - preview devolve HTML mostrado abaixo dos campos e é recalculado a cada digitação.
   - change(el, form) é chamado quando um campo muda (el.name nos campos comuns, el.dataset.col nas linhas).
   - esperaEnter (ms): janela que já abre preenchida e grava com um Enter (ex.: a compra igual à última). O Enter que chega antes
     desse tempo (o segundo de dois Enter seguidos, que abriu a janela e grava sem ela ser vista) não salva, nem o Enter segurado
     (a repetição da tecla). Quem leu aperta de novo. */
function openForm(o) {
  const m = $('#modal'), vals = o.vals || {}, abertaEm = Date.now();
  FORM = { o, files: {}, orig: [], novos: [], sujo: false, enviando: 0 };
  /* registro: [coleção, id] do registro que a janela edita. Ao salvar, só vai ao banco o que a pessoa mudou (o resto
     fica como estiver, mesmo que outro aparelho tenha mudado enquanto a janela estava aberta); pedido, ordem, conta e
     os outros movimentos só gravam se ninguém mudou o registro depois que a janela abriu; e se outro aparelho excluiu
     o registro, nada é gravado. */
  if (o.registro && o.registro[1]) {
    const [col, id] = o.registro, k = col + '/' + id;
    FORM.registro = { k, snap: vistaDe(k) || {}, pre: COM_VERSAO.has(col) ? precondicao(k, null) : null };
  }
  o.fields.forEach(f => {
    if (f.type !== 'file') return;
    const v = vals[f.k];
    FORM.files[f.k] = v && v.path ? v : null;
    if (v && v.path) FORM.orig.push(v.path);
  });
  m.innerHTML = `<form class="caixa ${o.wide ? 'wide' : ''}" novalidate>
    <div class="modal-head"><h3>${esc(o.title)}</h3><button type="button" class="x" onclick="fecharForm()" aria-label="Fechar">✕</button></div>
    <div class="grid">${o.fields.map(f => campo(f, vals[f.k], 'm')).join('')}</div>
    <div id="preview"></div>
    <div class="actions">${o.extra || ''}<button type="button" class="btn ghost" onclick="fecharForm()">Cancelar</button><button class="btn" type="submit">${esc(o.saveLabel || 'Salvar')}</button></div></form>`;
  m.classList.add('open'); document.body.classList.add('modal-aberto');
  marcarJanela(m, o.title);
  const form = $('form', m);
  const atualizar = () => {
    if (!o.preview) return;
    try { $('#preview', form).innerHTML = o.preview(lerCampos(form, o.fields), form) || ''; } catch (e) { console.error(e); }
  };
  FORM.form = form; FORM.atualizar = atualizar;
  if (o.esperaEnter) {
    form.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT' && (e.repeat || Date.now() - abertaEm < o.esperaEnter)) e.preventDefault();
    });
  }
  form.addEventListener('input', e => {
    if (e.target.type === 'file') return;
    FORM.sujo = true;
    if (o.change) { try { o.change(e.target, form); } catch (err) { console.error(err); } }
    atualizar();
  });
  form.addEventListener('click', e => {
    const add = e.target.closest('[data-add-row]'), del = e.target.closest('[data-del-row]');
    const pick = e.target.closest('[data-pick]'), clear = e.target.closest('[data-clear]');
    if (add) {
      const f = o.fields.find(x => x.k === add.dataset.addRow);
      $(`[data-rows="${f.k}"] .rows-body`, form).insertAdjacentHTML('beforeend', linhaHTML(f, f.novo ? f.novo() : {}));
      FORM.sujo = true; atualizar();
    } else if (del) {
      const caixa = del.closest('[data-rows]'), f = o.fields.find(x => x.k === caixa.dataset.rows);
      if (f && f.min && $$('.row', caixa).length <= f.min) return toast(f.min === 1 ? 'Precisa ficar pelo menos uma linha.' : `Precisam ficar pelo menos ${f.min} linhas.`);
      del.closest('.row').remove(); FORM.sujo = true; atualizar();
    } else if (pick) {
      $('input[type=file]', pick.closest('.filebox')).click();
    } else if (clear) {
      const box = clear.closest('.filebox');
      FORM.files[box.dataset.file] = null; FORM.sujo = true;
      pintarArquivo(box, null); atualizar();
    }
  });
  form.addEventListener('change', async e => {
    if (e.target.type !== 'file' || !e.target.files[0]) return;
    const box = e.target.closest('.filebox'), f = o.fields.find(x => x.k === box.dataset.file), file = e.target.files[0];
    e.target.value = '';
    // f.aoEscolher(file, form): o campo pode ler o arquivo escolhido (ex.: peso e tempo do arquivo do fatiador) enquanto ele é enviado
    if (typeof f.aoEscolher === 'function') Promise.resolve().then(() => f.aoEscolher(file, form)).catch(err => console.error(err));
    FORM.enviando++; $('.fname', box).textContent = 'Enviando ' + file.name + '…';
    const meuForm = FORM;
    try {
      const r = await enviarArquivo(file, f.pasta || 'arquivos', !!f.imagem);
      if (FORM !== meuForm) { removerArquivos([r.path]); return; }       // a janela fechou durante o envio
      FORM.novos.push(r.path); FORM.files[f.k] = r; FORM.sujo = true;
      pintarArquivo(box, r);
    } catch (err) {
      console.error(err);
      if (FORM === meuForm) { pintarArquivo(box, FORM.files[f.k]); toast('Não foi possível enviar o arquivo: ' + (err.message || err), 'bad'); }
    } finally { meuForm.enviando--; }
    if (FORM === meuForm) atualizar();
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (FORM.enviando) return toast('Aguarde o envio do arquivo terminar.');
    // a validação é feita aqui (o formulário tem novalidate), para conferir de novo os campos preenchidos por código
    $$('[data-num]', form).forEach(validarNumero);
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if (FORM.salvando) return;                      // evita gravar duas vezes com clique duplo
    FORM.salvando = true;
    const meuForm = FORM;
    const d = lerCampos(form, o.fields);
    FORM_SALVANDO = meuForm.registro || null;
    try {
      const r = await o.save(d, form);
      if (r === false) { meuForm.salvando = false; return; }
    } catch (err) {
      meuForm.salvando = false;
      if (err && err.jaAvisado) { if (FORM === meuForm) { FORM.sujo = false; fecharForm(); } render(); return; }   // já explicado na tela
      console.error(err);
      return toast('Não foi possível salvar: ' + (err.message || err), 'bad');
    } finally { FORM_SALVANDO = null; }
    if (FORM !== meuForm) {                         // a janela foi fechada ou trocada enquanto salvava
      if ($('#modal.open')) renderPendente = true; else render();
      return;
    }
    limparArquivosDoForm(true);
    fecharModal(); render();
  });
  atualizar();
  hidratarImagens(m);
  if (!('ontouchstart' in window)) {
    const p = focoInicial(form, o.foco);
    if (p) { p.focus(); if (p.dataset && p.dataset.num && p.select) p.select(); }   // número já preenchido: digitar troca o valor
  }
}
/* Onde o cursor começa ao abrir uma janela: no primeiro campo de número ou de texto que a pessoa precisa preencher (o
   obrigatório ainda vazio; senão o primeiro de cima para baixo, como a quantidade do pedido), nunca numa data: digitar "2"
   logo ao abrir Vender gravava a venda no dia 2. foco (opcional): o nome do campo em que a janela começa, quando é outro
   (ex.: o orçamento começa na lista Cliente, e digitar já escolhe o cliente; o nome avulso é só para quem não é cadastrado). */
function focoInicial(form, foco) {
  const pedido = foco ? campoDoForm(form, foco) : null;
  if (pedido && pedido.getClientRects && pedido.getClientRects().length && !pedido.disabled) return pedido;
  const campos = $$('.grid input, .grid select, .grid textarea', form).filter(e => !e.disabled && e.getClientRects().length &&
    !['date', 'month', 'hidden', 'file', 'checkbox', 'radio', 'color'].includes(e.type));
  const escrever = campos.filter(e => e.tagName !== 'SELECT');
  return escrever.find(e => e.required && !e.value.trim()) || escrever[0] || campos[0] || $('button[type=submit]', form);
}
function pintarArquivo(box, v) {
  const tem = v && v.path, img = $('.thumb', box);
  $('.fname', box).textContent = tem ? (v.nome || 'arquivo') + (v.tamanho ? ' · ' + tamanhoFmt(v.tamanho) : '') : 'Nenhum arquivo';
  $('[data-pick]', box).textContent = tem ? 'Trocar' : 'Escolher';
  $('[data-clear]', box).hidden = !tem;
  if (img) { img.removeAttribute('src'); if (tem) { img.dataset.path = v.path; img.hidden = false; hidratarImagens(box); } else { delete img.dataset.path; img.hidden = true; } }
}
function limparArquivosDoForm(salvou) {
  if (!FORM) return;
  const manter = salvou ? Object.values(FORM.files).filter(Boolean).map(f => f.path) : FORM.orig;
  removerArquivos([...new Set([...FORM.orig, ...FORM.novos])].filter(p => !manter.includes(p)));
}
function fecharForm() {
  if (FORM && FORM.sujo && !confirmar('Descartar o que foi preenchido?')) return;
  limparArquivosDoForm(false);
  fecharModal();
}
/* setCampo('preco', 12.5): altera um campo do formulário aberto e recalcula a prévia. */
function setCampo(nome, valor) {
  if (!FORM || !FORM.form) return;
  const el = campoDoForm(FORM.form, nome);
  if (!el) return;
  el.value = el.dataset && el.dataset.num ? paraCampo(valor) : valor;
  if (el.dataset && el.dataset.num) validarNumero(el);
  FORM.sujo = true; FORM.atualizar();
}
/* setLinhas('materiais', [{ filamentoId, pesoG }]): troca todas as linhas de um campo de linhas do formulário aberto. */
function setLinhas(k, linhas) {
  if (!FORM || !FORM.form) return;
  const f = FORM.o.fields.find(x => x.k === k), body = $(`[data-rows="${k}"] .rows-body`, FORM.form);
  if (!f || !body) return;
  body.innerHTML = (linhas || []).map(r => linhaHTML(f, r)).join('');
  FORM.sujo = true; FORM.atualizar();
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !$('#modal.open')) return;
  if (PERGUNTA) responder(-1); else if (FORM) fecharForm(); else fecharModal();
});
document.addEventListener('mousedown', e => {
  if (e.target.id !== 'modal' || e.offsetX >= e.target.clientWidth) return;      // clique na barra de rolagem não fecha
  if (Date.now() - janelaAbertaEm < 600) return;                                 // o mesmo toque duplo que abriu a janela não a fecha
  if (PERGUNTA) responder(-1); else if (FORM) { if (!FORM.sujo) fecharForm(); } else fecharModal();
});

/* ---------- Impressão (orçamento em PDF pelo "Salvar como PDF" do navegador) ---------- */
/* Abre a impressão uma vez só, e só da impressão mais recente: a espera pelas imagens (ou um clique duplo) não
   pode abrir uma segunda janela com a página já em branco. */
let impressaoSeq = 0;
function imprimir(html) {
  const meu = ++impressaoSeq, p = $('#print');
  p.innerHTML = html;
  const limpar = () => { window.removeEventListener('afterprint', limpar); if (meu === impressaoSeq) p.innerHTML = ''; };
  window.addEventListener('afterprint', limpar);
  let feito = false;
  const vai = () => { if (feito || meu !== impressaoSeq) return; feito = true; window.print(); };
  const imgs = $$('img', p).filter(i => !i.complete);
  if (!imgs.length) return setTimeout(vai, 50);
  let n = imgs.length;
  const pronto = () => { if (--n <= 0) vai(); };
  imgs.forEach(i => { i.onload = pronto; i.onerror = pronto; });
  setTimeout(vai, 2500);
}
/* Copia o texto para a área de transferência. avisar = false: não mostra o aviso (quem chamou mostra o seu). Devolve se copiou. */
async function copiarTexto(txt, avisar = true) {
  let copiou = false;
  try { await navigator.clipboard.writeText(txt); copiou = true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { copiou = document.execCommand('copy') !== false; } catch (er) { copiou = false; }
    ta.remove();
  }
  if (avisar) toast(copiou ? 'Texto copiado.' : 'Copie o texto manualmente.', copiou ? '' : 'bad');
  return copiou;
}
