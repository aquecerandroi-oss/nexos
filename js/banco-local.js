/* Nexos — banco local do modo demonstração: as mesmas regras da função gravar do banco de verdade
   (supabase/gravacao.sql), em JavaScript, sobre um objeto { seq, linhas, apagados, grupos }:
     linhas:   'colecao/id' -> { d: dados, v: versão, e: data da gravação }
     apagados: 'colecao/id' -> { v: versão da exclusão, e: data }
     grupos:   id do grupo -> data em que foi gravado
   Também é usado pelos testes, que conferem que este arquivo e a função do banco dão o mesmo resultado. */
'use strict';

const BANCO_COLECOES = ['canais', 'filamentos', 'fornecedores', 'compras', 'insumos', 'produtos', 'ordens', 'vendas',
  'clientes', 'orcamentos', 'falhas', 'manutItens', 'manutHist', 'lancamentos', 'pessoas', 'contas', 'meta'];
const BANCO_ID = /^[A-Za-z0-9_-]{1,64}$/;
const bancoCopia = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const bancoObjeto = v => !!v && typeof v === 'object' && !Array.isArray(v);
/* Número guardado: número de verdade ou texto só com algarismos (e ponto decimal); senão, null. */
function bancoNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string' && /^\s*-?[0-9]+(\.[0-9]+)?\s*$/.test(v)) return Number(v);
  return null;
}
/* Arredonda como o banco (metade para longe do zero), sem o erro de 1,005 virar 1,00. */
function bancoArred(x, casas) {
  if (!isFinite(x)) return 0;
  const s = Math.sign(x) || 1, a = Math.abs(x);
  const r = Number(Math.round(Number(a + 'e' + casas)) + 'e-' + casas);
  return isFinite(r) ? s * r || 0 : s * Math.round(a * 10 ** casas) / 10 ** casas || 0;
}
function bancoAplicarPassos(d, passos) {
  d = bancoObjeto(d) ? d : {};
  (Array.isArray(passos) ? passos : []).forEach(p => {
    if (!bancoObjeto(p)) return;
    (Array.isArray(p.m) ? p.m : []).forEach(m => {
      if (!bancoObjeto(m) || !m.p || m.p === 'id' || !m.q) return;
      const est = Math.max(0, bancoNum(d[m.q]) ?? 0), qtd = bancoNum(m.n), valor = bancoNum(m.v) ?? 0;
      const escala = bancoNum(m.e) ?? 1, casas = Math.min(8, Math.max(0, Math.trunc(bancoNum(m.k) ?? 2)));
      if (qtd > 0 && escala > 0) d[m.p] = bancoArred((est / escala * (bancoNum(d[m.p]) ?? 0) + valor) / ((est + qtd) / escala), casas);
    });
    if (bancoObjeto(p.s)) Object.keys(p.s).forEach(k => { if (k !== 'id') d[k] = bancoCopia(p.s[k]); });
    if (Array.isArray(p.x)) p.x.forEach(k => { if (String(k) !== 'id') delete d[String(k)]; });
    if (bancoObjeto(p.a)) Object.keys(p.a).forEach(k => { if (k !== 'id') d[k] = bancoArred((bancoNum(d[k]) ?? 0) + (bancoNum(p.a[k]) ?? 0), 6); });
  });
  return d;
}
const bancoComId = (c, i, d) => { d = bancoObjeto(d) ? d : {}; if (c !== 'meta') d.id = i; return d; };
function bancoLinha(est, c, i) {
  const l = est.linhas[c + '/' + i];
  if (l) return { c, i, v: l.v, e: l.e, d: bancoCopia(l.d) };
  const a = est.apagados[c + '/' + i];
  return { c, i, x: true, v: a ? a.v : null };
}
/* Estoque digitado num formulário ("e" no passo): o campo precisa estar com o valor que a janela mostrava ao abrir.
   Devolve o nome do primeiro campo diferente (ou null), conferindo passo a passo como o banco. */
function bancoConfereEsperado(d, passos) {
  if (!Array.isArray(passos)) return null;
  d = bancoObjeto(d) ? bancoCopia(d) : {};
  for (const p of passos) {
    if (bancoObjeto(p) && bancoObjeto(p.e)) for (const k of Object.keys(p.e)) if (bancoNum(d[k]) !== bancoNum(p.e[k])) return k;
    d = bancoAplicarPassos(d, [p]);
  }
  return null;
}
/* O que o gatilho de numeração do banco faz com pedidos e orçamentos gravados pela função gravar. */
function bancoNumerar(est, c, i, d) {
  if ((c !== 'vendas' && c !== 'orcamentos') || !bancoObjeto(d)) return d;
  const antes = est.linhas[c + '/' + i], na = antes && bancoObjeto(antes.d) ? bancoNum(antes.d.numero) : null;
  if (antes) { if (na >= 1 && Number.isInteger(na)) d.numero = na; return d; }   // número dado não muda; antigo sem número fica sem
  const outros = Object.keys(est.linhas).filter(k => k.startsWith(c + '/') && k !== c + '/' + i)
    .map(k => (bancoObjeto(est.linhas[k].d) ? bancoNum(est.linhas[k].d.numero) : null)).filter(n => n !== null);
  let n = bancoNum(d.numero);
  if (n === null || n < 1 || !Number.isInteger(n) || outros.includes(n)) n = Math.max(0, ...outros.filter(x => x >= 1).map(Math.trunc)) + 1;
  d.numero = Math.trunc(n);
  return d;
}
function bancoEscrever(est, c, i, d, agora, desfazer) {
  const k = c + '/' + i;
  if (!(k in desfazer.linhas)) desfazer.linhas[k] = est.linhas[k];
  est.linhas[k] = { d: bancoNumerar(est, c, i, d), v: ++est.seq, e: agora };
}
function bancoApagar(est, c, i, agora, desfazer) {
  const k = c + '/' + i;
  if (!(k in desfazer.linhas)) desfazer.linhas[k] = est.linhas[k];
  if (!(k in desfazer.apagados)) desfazer.apagados[k] = est.apagados[k];
  delete est.linhas[k];
  est.apagados[k] = { v: ++est.seq, e: agora };
}
function bancoGravar(est, grupos, agora) {
  est.seq = est.seq || 0; est.linhas = est.linhas || {}; est.apagados = est.apagados || {}; est.grupos = est.grupos || {};
  if (!Array.isArray(grupos) || grupos.length > 200) throw Object.assign(new Error('lote inválido'), { code: '22023' });
  const saida = [];
  grupos.forEach(g => {
    const ops = Array.isArray(g && g.ops) ? g.ops : [];
    const chaves = [...new Map(ops.map(o => [String(o && o.c) + '/' + String(o && o.i), [o && o.c, o && o.i]])).values()];
    const atuais = () => chaves.map(([c, i]) => bancoLinha(est, c, i));
    if (g && g.id && est.grupos[g.id]) {
      const gv = bancoObjeto(est.grupos[g.id]) && Array.isArray(est.grupos[g.id].versoes) ? bancoCopia(est.grupos[g.id].versoes) : [];
      saida.push({ n: g.n, ok: true, ja: true, r: atuais(), gv });
      return;
    }
    const desfazer = { linhas: {}, apagados: {}, seq: est.seq }, feitos = [];
    const recusa = motivo => { throw Object.assign(new Error('recusado'), { motivo }); };
    try {
      ops.forEach(op => {
        const c = op && op.c, i = op && op.i, t = op && op.t, ignorar = op && op.modo === 'ignorar';
        const se = typeof (op && op.se) === 'number' ? op.se : null;
        if (!BANCO_COLECOES.includes(c) || typeof i !== 'string' || !BANCO_ID.test(i) || (c === 'meta' && i !== 'config' && i !== 'perfil') || !t) {
          recusa('invalido:' + (c || '') + '/' + (i || ''));
        }
        const k = c + '/' + i, l = est.linhas[k];
        if (t === 'novo') {
          if (!bancoObjeto(op.d)) recusa('invalido:' + k);
          if (l) { if (!ignorar) recusa('existe:' + k); }
          else bancoEscrever(est, c, i, bancoComId(c, i, bancoAplicarPassos(bancoCopia(op.d), op.p)), agora, desfazer);
        } else if (t === 'mudar') {
          if (!l) recusa('apagado:' + k);
          if (se !== null && l.v !== se) recusa('mudou:' + k);
          if (bancoConfereEsperado(l.d, op.p) !== null) recusa('mudou:' + k);
          bancoEscrever(est, c, i, bancoComId(c, i, bancoAplicarPassos(bancoCopia(l.d), op.p)), agora, desfazer);
        } else if (t === 'mesclar') {
          bancoEscrever(est, c, i, bancoComId(c, i, bancoAplicarPassos(l ? bancoCopia(l.d) : {}, op.p)), agora, desfazer);
        } else if (t === 'trocar') {
          if (!bancoObjeto(op.d)) recusa('invalido:' + k);
          if (se !== null && (!l || l.v !== se)) recusa((l ? 'mudou:' : 'apagado:') + k);
          bancoEscrever(est, c, i, bancoComId(c, i, bancoAplicarPassos(bancoCopia(op.d), op.p)), agora, desfazer);
        } else if (t === 'apagar') {
          if (l) { if (se !== null && l.v !== se) recusa('mudou:' + k); bancoApagar(est, c, i, agora, desfazer); }
          else if (se !== null) recusa('apagado:' + k);
        } else recusa('invalido:' + k);
        feitos.push(bancoLinha(est, c, i));
      });
      if (g && g.id) est.grupos[g.id] = { e: agora, versoes: feitos.map(l => ({ c: l.c, i: l.i, v: l.x ? -1 : l.v })) };
      saida.push({ n: g.n, ok: true, r: feitos });
    } catch (e) {
      if (!e.motivo) throw e;
      Object.keys(desfazer.linhas).forEach(k => { if (desfazer.linhas[k]) est.linhas[k] = desfazer.linhas[k]; else delete est.linhas[k]; });
      Object.keys(desfazer.apagados).forEach(k => { if (desfazer.apagados[k]) est.apagados[k] = desfazer.apagados[k]; else delete est.apagados[k]; });
      saida.push({ n: g.n, ok: false, motivo: e.motivo, r: atuais() });
    }
  });
  return saida;
}
