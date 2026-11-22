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

/* ---------- Banco: nuvem (Supabase) e demonstração (navegador) ---------- */
let sb = null;
const DBNuvem = {
  async carregar() {
    // Lê em páginas 'depois do último lido' (e não por posição): se outro aparelho gravar ou apagar
    // durante a leitura, nenhuma linha vem repetida nem é pulada.
    const out = [], N = 1000, q = v => '"' + String(v).replace(/["\\]/g, '') + '"';   // valor entre aspas, sem aspas nem barras dentro
    let ultimo = null;
    for (;;) {
      let c = sb.from('registros').select('colecao,id,dados,atualizado_em').order('colecao').order('id').limit(N);
      if (ultimo) c = c.or('colecao.gt.' + q(ultimo.colecao) + ',and(colecao.eq.' + q(ultimo.colecao) + ',id.gt.' + q(ultimo.id) + ')');
      const { data, error } = await c;
      if (error) throw error;
      out.push(...data);
      if (data.length < N) break;
      ultimo = data[data.length - 1];
    }
    return out;
  },
  async gravar(rows) {
    const out = [];
    for (let i = 0; i < rows.length; i += 200) {
      const { data, error } = await sb.from('registros').upsert(rows.slice(i, i + 200), { onConflict: 'colecao,id' })
        .select('colecao,id,atualizado_em');
      if (error) throw error;
      out.push(...data);
    }
    return out;
  },
  async apagar(keys) {
    for (const k of keys) {
      const { error } = await sb.from('registros').delete().eq('colecao', k.colecao).eq('id', k.id);
      if (error) throw error;
    }
  },
  assinar(cb, aoReconectar) {
    let jaConectou = false;
    sb.channel('nexos-registros')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registros' }, p => {
        if (p.eventType === 'DELETE') cb({ tipo: 'DELETE', colecao: p.old.colecao, id: p.old.id });
        else cb({ tipo: 'UPSERT', colecao: p.new.colecao, id: p.new.id, dados: p.new.dados, atualizado_em: p.new.atualizado_em });
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') { if (jaConectou) aoReconectar(); jaConectou = true; }
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
const DEMO_KEY = 'nexos-demo-v2';
const demoBlobs = new Map();
const DBDemo = {
  _ler() { try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || {}; } catch (e) { return {}; } },
  async carregar() { const m = this._ler(); return Object.keys(m).map(k => { const [colecao, ...r] = k.split('/'); return { colecao, id: r.join('/'), dados: m[k], atualizado_em: null }; }); },
  async gravar(rows) { const m = this._ler(); rows.forEach(r => { m[r.colecao + '/' + r.id] = JSON.parse(JSON.stringify(r.dados)); }); localStorage.setItem(DEMO_KEY, JSON.stringify(m)); return rows.map(r => ({ colecao: r.colecao, id: r.id, atualizado_em: new Date().toISOString() })); },
  async apagar(keys) { const m = this._ler(); keys.forEach(k => { delete m[k.colecao + '/' + k.id]; }); localStorage.setItem(DEMO_KEY, JSON.stringify(m)); },
  assinar() {},
  async enviarArquivo(path, blob) { demoBlobs.set(path, URL.createObjectURL(blob)); },
  async urlsArquivos(paths) { const m = {}; paths.forEach(p => { if (demoBlobs.has(p)) m[p] = demoBlobs.get(p); }); return m; },
  async urlDownload(path) { return demoBlobs.get(path) || ''; },
  async removerArquivos(paths) { paths.forEach(p => demoBlobs.delete(p)); },
};
const DB = DEMO ? DBDemo : DBNuvem;

/* ---------- Sincronização: gravação em lote + mudanças vindas de outros aparelhos ---------- */
const PEND = new Map(), PEND_DEL = new Map(), EM_VOO = new Set(), VER = new Map();
let salvando = false, flushTimer = null, retryTimer = null, tentativas = 0, syncEstado = 'ok', avisarFalha = false;

function put(col, rec) {
  const lista = S[col];
  if (!lista) throw new Error('Coleção desconhecida: ' + col);
  if (!rec.id) rec.id = uid();
  const i = lista.findIndex(x => x.id === rec.id);
  if (i >= 0) lista[i] = rec; else lista.push(rec);
  const k = col + '/' + rec.id;
  PEND_DEL.delete(k);
  PEND.set(k, { colecao: col, id: rec.id, dados: rec });
  REV++; agendarGravacao();
  return rec;
}
function rm(col, id) {
  const lista = S[col];
  const i = lista.findIndex(x => x.id === id);
  if (i >= 0) lista.splice(i, 1);
  const k = col + '/' + id;
  PEND.delete(k);
  PEND_DEL.set(k, { colecao: col, id });
  REV++; agendarGravacao();
}
function saveMeta(qual) {
  PEND.set('meta/' + qual, { colecao: 'meta', id: qual, dados: S[qual] });
  REV++; agendarGravacao();
}
const temPendencias = () => PEND.size > 0 || PEND_DEL.size > 0 || salvando;
function agendarGravacao() { avisarFalha = true; if (!flushTimer) flushTimer = setTimeout(descarregar, 40); }
async function descarregar() {
  flushTimer = null;
  if (salvando || (!PEND.size && !PEND_DEL.size)) return;
  salvando = true;
  clearTimeout(retryTimer);
  const up = [...PEND.values()], del = [...PEND_DEL.values()];
  PEND.clear(); PEND_DEL.clear();
  up.forEach(r => EM_VOO.add(r.colecao + '/' + r.id));
  del.forEach(r => EM_VOO.add(r.colecao + '/' + r.id));
  mostrarSync('salvando');
  let ok = false, semPermissao = false;
  try {
    if (up.length) {
      const res = await DB.gravar(up);
      res.forEach(r => VER.set(r.colecao + '/' + r.id, Date.parse(r.atualizado_em) || Date.now()));
    }
    if (del.length) {
      await DB.apagar(del);
      del.forEach(r => VER.delete(r.colecao + '/' + r.id));
    }
    ok = true; tentativas = 0;
  } catch (e) {
    console.error('Falha ao salvar na nuvem', e);
    // devolve para a fila o que não foi salvo, sem passar por cima de mudanças mais novas
    up.forEach(r => { const k = r.colecao + '/' + r.id; if (!PEND.has(k) && !PEND_DEL.has(k)) PEND.set(k, r); });
    del.forEach(r => { const k = r.colecao + '/' + r.id; if (!PEND.has(k) && !PEND_DEL.has(k)) PEND_DEL.set(k, r); });
    semPermissao = !!e && e.code === '42501';                               // o banco recusou: a regra de acesso não deixou gravar
  }
  EM_VOO.clear();
  salvando = false;
  if (ok) {
    if (PEND.size || PEND_DEL.size) agendarGravacao();
    else { mostrarSync('ok'); if (recarregarDepois) { recarregarDepois = false; recarregar(); } }
  } else {
    if (semPermissao) {
      if (await perdeuOAcesso()) return;
      if (salvando || (!PEND.size && !PEND_DEL.size)) return;              // enquanto conferia, outra gravação já cuidou da fila
    }
    tentativas++;
    mostrarSync('erro');
    if (avisarFalha) { avisarFalha = false; toast('Sem conexão: as últimas alterações ainda NÃO foram salvas. Deixe esta página aberta até a conexão voltar.', 'bad'); }
    retryTimer = setTimeout(descarregar, Math.min(60000, 4000 * tentativas));
  }
}
/* Gravação recusada por falta de permissão: confere com o servidor se esta conta ainda é da equipe. Se não é, larga
   o que estava na fila (não pode ser gravado mais tarde por cima dos dados dos outros) e volta para a entrada. */
async function perdeuOAcesso() {
  if (DEMO || !sb) return false;
  try {
    const { data, error } = await sb.rpc('entrar');
    if (error || data !== 'sem_acesso') return false;                       // sem resposta clara, ou ainda é da equipe: segue tentando
  } catch (e) { return false; }
  PEND.clear(); PEND_DEL.clear();
  if (FORM) FORM.sujo = false;
  saindoSemAcesso = true;                                                   // não há o que salvar: sai sem a pergunta do navegador
  location.reload();
  return true;
}
let saindoSemAcesso = false;
function mostrarSync(estado) {
  syncEstado = estado;
  const txt = { ok: DEMO ? 'Demonstração (só neste navegador)' : 'Tudo salvo na nuvem', salvando: 'Salvando…', erro: 'Sem conexão — clique para tentar de novo' }[estado];
  $$('.sync').forEach(el => { el.className = 'sync s-' + estado; el.title = txt; const t = $('.sync-txt', el); if (t) t.textContent = txt; });
}
window.addEventListener('online', () => { if (PEND.size || PEND_DEL.size) descarregar(); });
window.addEventListener('beforeunload', e => { if (!saindoSemAcesso && (temPendencias() || (FORM && FORM.sujo))) { e.preventDefault(); e.returnValue = ''; } });

let renderPendente = false, renderTimer = null;
function aplicarRemoto(ev) {
  const k = ev.colecao + '/' + ev.id;
  if (PEND.has(k) || PEND_DEL.has(k) || EM_VOO.has(k)) return;           // há mudança local mais nova a caminho
  if (ev.tipo === 'DELETE') {
    VER.delete(k);
    const lista = S[ev.colecao];
    if (Array.isArray(lista)) { const i = lista.findIndex(x => x.id === ev.id); if (i >= 0) lista.splice(i, 1); }
  } else {
    const t = Date.parse(ev.atualizado_em) || 0;
    if (VER.has(k) && t <= VER.get(k)) return;                             // eco de uma gravação nossa ou evento antigo
    VER.set(k, t);
    if (ev.colecao === 'meta') {
      if (ev.id === 'config') S.config = { ...CONFIG_PADRAO, ...soSimples(ev.dados) };
      else if (ev.id === 'perfil') S.perfil = perfilLimpo(ev.dados);
    } else if (Array.isArray(S[ev.colecao]) && registroValido(ev.dados) && ev.dados.id === ev.id) {
      const lista = S[ev.colecao], i = lista.findIndex(x => x.id === ev.id);
      if (i >= 0) lista[i] = ev.dados; else lista.push(ev.dados);
    }
  }
  REV++; pedirRender();
}
function pedirRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    // não redesenha por baixo de quem está digitando: espera a janela fechar ou o campo perder o foco
    const ae = document.activeElement;
    const digitando = ae && ae.closest && ae.closest('#main') && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName);
    if ($('#modal.open') || digitando) renderPendente = true;
    else if (paginaAtual() === 'perfil' && typeof renderMantendoPerfil === 'function') renderMantendoPerfil();   // não perde o que foi digitado e não salvo
    else render();
  }, 200);
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
  let temConfig = false;
  VER.clear();
  rows.forEach(r => {
    const k = r.colecao + '/' + r.id;
    if (vistos.has(k)) return;
    vistos.add(k);
    if (r.atualizado_em) VER.set(k, Date.parse(r.atualizado_em) || 0);
    if (r.colecao === 'meta') {
      if (r.id === 'config') { Object.assign(s.config, soSimples(r.dados)); temConfig = true; }
      else if (r.id === 'perfil') s.perfil = perfilLimpo(r.dados);
    } else if (Array.isArray(s[r.colecao]) && registroValido(r.dados) && r.dados.id === r.id) s[r.colecao].push(r.dados);
  });
  S = s; REV++;
  // Primeiro uso: grava os padrões. Só na abertura do sistema, logo depois de a entrada confirmar que a conta é da
  // equipe; numa atualização com o sistema aberto nunca, para não passar os padrões por cima dos dados de verdade.
  if (!temConfig && !recarga) {
    saveMeta('config'); saveMeta('perfil');
    CANAIS_PADRAO.forEach(c => { if (!byId('canais', c.id)) put('canais', { ...c }); });
  }
}
let escondidoEm = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { escondidoEm = Date.now(); return; }
  if (escondidoEm && Date.now() - escondidoEm > 60000 && $('#main')) recarregar();
  conferirVersao();
});

/* ---------- Versão nova publicada ----------
   Uma aba aberta continua na versão antiga até ser recarregada. Ao voltar para a aba (no máximo a cada 5 minutos) e a
   cada 30 minutos, confere o número da versão publicada e, se houver uma mais nova, oferece atualizar. */
const VERSAO = 14;
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
  let velho = false;
  try { velho = (await carregarTudo(true)) === false; if (!velho) pedirRender(); }
  catch (e) { console.warn('Não foi possível atualizar agora', e); }
  recarregando = false;
  const deNovo = recarregarDeNovo; recarregarDeNovo = false;
  if (velho && tentativa < 3) setTimeout(() => recarregar(tentativa + 1), 1500);
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
/* tabela(['Data', { t: 'Valor', r: 1 }], linhasHTML) — r: 1 alinha a coluna à direita */
const tabela = (cols, linhas) => `<div class="scroll"><table><thead><tr>${cols.map(c => typeof c === 'string' ? `<th>${c}</th>` : `<th class="${c.r ? 'right' : ''}">${c.t}</th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table></div>`;
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

function toast(msg, tipo = '') {
  let cx = $('#toasts');
  if (!cx) { cx = document.createElement('div'); cx.id = 'toasts'; cx.setAttribute('role', 'status'); cx.setAttribute('aria-live', 'polite'); document.body.appendChild(cx); }
  const t = document.createElement('div');
  t.className = 'toast ' + tipo; t.textContent = msg;
  cx.appendChild(t);
  setTimeout(() => t.remove(), tipo === 'bad' ? 6000 : 3200);
}
const confirmar = msg => window.confirm(msg);

/* ---------- Janela (modal) e formulários ---------- */
let FORM = null;
/* Faz a janela se comportar como diálogo: o resto da tela fica inerte (teclado e leitor de tela não passam por trás)
   e o foco volta para onde estava quando ela fecha. */
let focoAntes = null;
function marcarJanela(m, titulo) {
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
  FORM = null;
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
/* openForm({ title, fields, vals, save(d, form), preview(d, form), change(el, form), wide, saveLabel, extra })
   - save pode ser async; devolver false mantém a janela aberta (ex.: validação).
   - preview devolve HTML mostrado abaixo dos campos e é recalculado a cada digitação.
   - change(el, form) é chamado quando um campo muda (el.name nos campos comuns, el.dataset.col nas linhas). */
function openForm(o) {
  const m = $('#modal'), vals = o.vals || {};
  FORM = { o, files: {}, orig: [], novos: [], sujo: false, enviando: 0 };
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
    try {
      const r = await o.save(d, form);
      if (r === false) { meuForm.salvando = false; return; }
    } catch (err) {
      console.error(err);
      meuForm.salvando = false;
      return toast('Não foi possível salvar: ' + (err.message || err), 'bad');
    }
    if (FORM !== meuForm) {                         // a janela foi fechada ou trocada enquanto salvava
      if ($('#modal.open')) renderPendente = true; else render();
      return;
    }
    limparArquivosDoForm(true);
    fecharModal(); render();
  });
  atualizar();
  hidratarImagens(m);
  if (!('ontouchstart' in window)) { const p = $('input:not([type=file]):not([type=checkbox]),select,textarea', form); if (p) p.focus(); }
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
  if (FORM) fecharForm(); else fecharModal();
});
document.addEventListener('mousedown', e => {
  if (e.target.id !== 'modal' || e.offsetX >= e.target.clientWidth) return;      // clique na barra de rolagem não fecha
  if (FORM) { if (!FORM.sujo) fecharForm(); } else fecharModal();
});

/* ---------- Impressão (orçamento em PDF pelo "Salvar como PDF" do navegador) ---------- */
function imprimir(html) {
  const p = $('#print');
  p.innerHTML = html;
  const limpar = () => { p.innerHTML = ''; window.removeEventListener('afterprint', limpar); };
  window.addEventListener('afterprint', limpar);
  const imgs = $$('img', p).filter(i => !i.complete);
  const vai = () => window.print();
  if (!imgs.length) return setTimeout(vai, 50);
  let n = imgs.length;
  const pronto = () => { if (--n <= 0) vai(); };
  imgs.forEach(i => { i.onload = pronto; i.onerror = pronto; });
  setTimeout(() => { if (n > 0) { n = 0; vai(); } }, 2500);
}
async function copiarTexto(txt) {
  try { await navigator.clipboard.writeText(txt); toast('Texto copiado.'); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Texto copiado.'); } catch (er) { toast('Copie o texto manualmente.', 'bad'); }
    ta.remove();
  }
}
