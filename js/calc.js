/* Nexos — regras de negócio: custo, preço por canal, estoque, fila da impressora, pedidos, contas, caixa e relatórios.
   As telas chamam estas funções; nenhuma delas mexe em HTML. */
'use strict';

let _memo = { rev: -1 };
function memo(k, fn) {
  if (_memo.rev !== REV) _memo = { rev: REV };
  if (!(k in _memo)) _memo[k] = fn();
  return _memo[k];
}
/* Soma meses a uma data AAAA-MM-DD mantendo o dia (31/01 + 1 mês = 28/02). */
const addMesesData = (iso, n) => {
  const [a, m, d] = String(iso || hoje()).slice(0, 10).split('-').map(Number);
  const ultimo = new Date(a, m + n, 0).getDate();
  return dataLocal(new Date(a, m - 1 + n, Math.min(d || 1, ultimo)));
};

/* ---------- Situação das ordens ----------
   fila → imprimindo → acabamento (só produtos que passam por acabamento) → concluido */
const ORDEM_ATIVA = o => o.status === 'fila' || o.status === 'imprimindo';           // usam a impressora: entram na fila
const ORDEM_ABERTA = o => o.status !== 'concluido';                                  // ainda não viraram peça pronta
const ORDEM_IMPRESSA = o => o.status === 'concluido' || o.status === 'acabamento';   // já gastaram material e horas de máquina
const dataImpressao = o => o.fimImpressao || o.fim || '';

/* ---------- Falhas ---------- */
const DIAS_FALHA = 90, MIN_G_FALHA = 1000;
/* Taxa de falha usada no custo. Com "usar taxa real" ligado e pelo menos 1 kg produzido nos últimos
   90 dias, vale a taxa medida (gramas perdidos ÷ gramas de peças boas); senão vale a taxa fixa da Configuração. */
function taxaFalha() {
  return memo('falha', () => {
    const lim = addDias(hoje(), -DIAS_FALHA);
    let prodG = 0, falhaG = 0;
    S.ordens.forEach(o => { if (ORDEM_IMPRESSA(o) && dataImpressao(o) >= lim) prodG += soma(o.consumo, 'g'); });
    S.falhas.forEach(f => { if ((f.data || '') >= lim) falhaG += num(f.gramas); });
    const realPct = prodG > 0 ? falhaG / prodG * 100 : 0;
    const real = !!S.config.falhaAuto && prodG >= MIN_G_FALHA;
    return { pct: real ? realPct : num(S.config.falha), real, realPct, prodG, falhaG, dias: DIAS_FALHA, minG: MIN_G_FALHA };
  });
}

/* ---------- Mão de obra ---------- */
/* Valor da hora de uma pessoa. Sem pessoa (ou pessoa excluída) vale o valor geral da Configuração. */
function valorHora(pessoaId) {
  const p = byId('pessoas', pessoaId);
  return p && num(p.valorHora) > 0 ? num(p.valorHora) : num(S.config.maoObraHora);
}
/* Linhas de mão de obra de uma peça: [{ pessoaId, etapa, minutos }]. Produto cadastrado antes (só "minutos")
   vira uma linha sem pessoa, que usa o valor geral da hora. */
function linhasMaoObra(p) {
  if (Array.isArray(p.maoObra)) return p.maoObra.filter(l => l && typeof l === 'object');
  return num(p.maoObraMin) > 0 ? [{ pessoaId: '', etapa: '', minutos: num(p.maoObraMin) }] : [];
}

/* ---------- Custo e preço ---------- */
/* Custo de produção de UMA unidade do produto. */
function custoProduto(p) {
  const c = S.config, horas = num(p.horas);
  const itens = (p.materiais || []).map(m => {
    const fil = byId('filamentos', m.filamentoId), g = num(m.pesoG);
    return { fil, g, custo: fil ? g / 1000 * num(fil.precoKg) : 0 };
  });
  const filamento = soma(itens, 'custo'), pesoG = soma(itens, 'g');
  const energia = num(c.potencia) / 1000 * horas * num(c.kwh);
  const desgasteHora = num(c.vidaUtil) > 0 ? num(c.valorImpressora) / num(c.vidaUtil) : 0;
  const maquina = horas * (desgasteHora + num(c.manutencaoHora));
  const fixos = num(c.horasMes) > 0 ? horas * num(c.custosFixos) / num(c.horasMes) : 0;
  const tf = taxaFalha();
  const falhas = (filamento + energia + maquina) * tf.pct / 100;
  const mo = linhasMaoObra(p).map(l => {
    const vh = valorHora(l.pessoaId), minutos = num(l.minutos);
    return { pessoa: byId('pessoas', l.pessoaId), pessoaId: l.pessoaId || '', etapa: l.etapa || '', minutos, valorHora: vh, custo: minutos / 60 * vh };
  });
  const maoObra = soma(mo, 'custo');
  const ins = (p.insumos || []).map(x => {
    const insumo = byId('insumos', x.insumoId), qtd = num(x.qtd);
    return { insumo, qtd, custo: insumo ? qtd * num(insumo.custo) : 0 };
  });
  const insumos = soma(ins, 'custo'), extras = num(p.extras);
  return {
    itens, ins, mo, pesoG, horas, filamento, energia, maquina, fixos, falhas, falhaPct: tf.pct, falhaReal: tf.real,
    maoObra, maoObraMin: soma(mo, 'minutos'), insumos, extras,
    custo: filamento + energia + maquina + fixos + falhas + maoObra + insumos + extras,
    semFilamento: !itens.length || itens.some(i => !i.fil),
  };
}
/* Margem desejada de um canal: a do próprio canal ou, se ele não tem, a geral da Configuração. */
const margemDoCanal = canal => (canal && num(canal.margem) > 0 ? num(canal.margem) : num(S.config.margem));
/* Resultado de vender UMA unidade em um canal. preco: usa o preço cadastrado no produto para o canal,
   ou precoForcado quando informado. Taxa fixa é por unidade; frete é o que a Nexos paga por pedido. */
function precoNoCanal(p, canal, precoForcado, custoPronto) {
  const c = S.config;
  const custo = custoPronto != null ? num(custoPronto) : custoProduto(p).custo;
  const preco = precoForcado != null ? num(precoForcado) : num((p.precos || {})[canal.id]);
  const pctCanal = num(canal.pct), fixa = num(canal.fixa), freteCanal = num(canal.frete), imp = num(c.imposto);
  const margemAlvo = margemDoCanal(canal);
  const vende = preco > 0;
  const taxa = vende ? preco * pctCanal / 100 + fixa : 0;
  const frete = vende ? freteCanal : 0;
  const imposto = preco * imp / 100;
  const lucro = vende ? preco - custo - taxa - frete - imposto : 0;
  const den = 1 - (pctCanal + imp + margemAlvo) / 100;
  return {
    canal, custo, preco, vende, taxa, frete, imposto, lucro, margemAlvo,
    margem: vende ? lucro / preco * 100 : 0,
    sugerido: den > 0 ? (custo + fixa + freteCanal) / den : 0,
  };
}
const canaisDoProduto = p => { const custo = custoProduto(p).custo; return S.canais.map(c => precoNoCanal(p, c, null, custo)); };
/* Melhor resultado do produto entre os canais onde ele tem preço (ou null). */
function melhorCanal(p) {
  const v = canaisDoProduto(p).filter(x => x.vende);
  return v.length ? v.reduce((a, b) => (b.lucro > a.lucro ? b : a)) : null;
}

/* ---------- Produção ---------- */
function novaOrdem(d) {
  return put('ordens', {
    id: uid(), produtoId: d.produtoId, qtd: Math.max(1, Math.round(num(d.qtd))), data: d.data || hoje(), prazo: d.prazo || '',
    clienteId: d.clienteId || '', obs: d.obs || '', status: 'fila', criadoEm: agoraISO(),
    // posição na fila: sempre maior que todas as existentes, para ordens criadas juntas não empatarem
    ordem: S.ordens.reduce((m, x) => Math.max(m, num(x.ordem) + 1), Date.now()),
  });
}
function iniciarOrdem(o) {
  if (!ORDEM_ATIVA(o)) return;
  o.status = 'imprimindo'; o.inicio = agoraISO();
  put('ordens', o);
}
/* Tira do estoque o filamento e os insumos de uma ordem e guarda o que foi usado (acontece quando a impressão termina). */
function baixarMateriais(o, p) {
  const q = num(o.qtd);
  o.consumo = []; o.insumosUsados = []; o.horasTotal = 0; o.custoUnit = 0;
  if (!p) return;
  o.custoUnit = custoProduto(p).custo;
  (p.materiais || []).forEach(m => {
    const g = num(m.pesoG) * q;
    if (g <= 0) return;
    o.consumo.push({ filamentoId: m.filamentoId, g });
    const f = byId('filamentos', m.filamentoId);
    if (f) { f.estoqueG = arred(num(f.estoqueG) - g, 2); put('filamentos', f); }
  });
  (p.insumos || []).forEach(x => {
    const n = num(x.qtd) * q;
    if (n <= 0) return;
    o.insumosUsados.push({ insumoId: x.insumoId, qtd: n });
    const i = byId('insumos', x.insumoId);
    if (i) { i.estoque = arred(num(i.estoque) - n, 3); put('insumos', i); }
  });
  o.horasTotal = num(p.horas) * q;
}
/* Conclui a ordem: baixa filamento e insumos e soma as peças ao estoque de prontas.
   Produto que passa por acabamento: ao terminar a impressão a ordem vai para "Em acabamento" (o material já sai do
   estoque e a impressora fica livre) e só entra no estoque de prontas quando o acabamento termina.
   direto = true pula o acabamento (a peça vai direto para o estoque). */
function concluirOrdem(o, direto = false) {
  if (o.status === 'concluido') return;
  const p = byId('produtos', o.produtoId);
  if (o.status !== 'acabamento') {
    baixarMateriais(o, p);
    o.fimImpressao = hoje(); o.fimImpressaoEm = agoraISO();
    o.passouAcabamento = !!(p && p.acabamento && !direto);
    if (o.passouAcabamento) { o.status = 'acabamento'; put('ordens', o); return; }
  }
  if (p) { p.estoque = num(p.estoque) + num(o.qtd); put('produtos', p); }
  o.status = 'concluido'; o.fim = hoje(); o.fimEm = agoraISO();
  put('ordens', o);
}
/* Desfaz o que a ordem fez. status 'fila' ou 'imprimindo': devolve o material, tira as peças do estoque (se já tinham
   entrado) e a ordem volta para a fila ou para a impressão. status 'acabamento': só uma ordem concluída que passou pelo
   acabamento volta para ele (as peças saem do estoque e o material continua usado). */
function reabrirOrdem(o, status = 'fila') {
  const p = byId('produtos', o.produtoId);
  if (status === 'acabamento') {
    if (o.status !== 'concluido') return;
    if (p) { p.estoque = num(p.estoque) - num(o.qtd); put('produtos', p); }
    o.status = 'acabamento'; o.fim = ''; o.fimEm = ''; o.passouAcabamento = true;
    put('ordens', o);
    return;
  }
  if (ORDEM_IMPRESSA(o)) {
    (o.consumo || []).forEach(x => { const f = byId('filamentos', x.filamentoId); if (f) { f.estoqueG = arred(num(f.estoqueG) + num(x.g), 2); put('filamentos', f); } });
    (o.insumosUsados || []).forEach(x => { const i = byId('insumos', x.insumoId); if (i) { i.estoque = arred(num(i.estoque) + num(x.qtd), 3); put('insumos', i); } });
    if (o.status === 'concluido' && p) { p.estoque = num(p.estoque) - num(o.qtd); put('produtos', p); }
    o.consumo = []; o.insumosUsados = []; o.horasTotal = 0; o.custoUnit = 0;
    o.fim = ''; o.fimEm = ''; o.fimImpressao = ''; o.fimImpressaoEm = ''; o.passouAcabamento = false;
  }
  o.status = status === 'imprimindo' ? 'imprimindo' : 'fila';
  o.inicio = o.status === 'imprimindo' ? (o.inicio || agoraISO()) : '';
  put('ordens', o);
}
/* Edita uma ordem. Se ela já tinha baixado material (concluída ou em acabamento) e o produto ou a quantidade mudaram,
   refaz a baixa e volta ao mesmo ponto. Devolve false (sem mudar nada) quando teria de refazer a baixa de um produto
   que não existe mais. */
function editarOrdem(o, d) {
  const q = Math.max(1, Math.round(num(d.qtd)));
  const estado = o.status;
  const mudou = ORDEM_IMPRESSA(o) && (d.produtoId !== o.produtoId || q !== num(o.qtd));
  if (mudou && !byId('produtos', d.produtoId)) return false;
  const fim = o.fim, fimEm = o.fimEm, fimImp = o.fimImpressao, fimImpEm = o.fimImpressaoEm, passou = o.passouAcabamento;
  if (mudou) reabrirOrdem(o, 'fila');
  Object.assign(o, { produtoId: d.produtoId, qtd: q, data: d.data || o.data, prazo: d.prazo || '', clienteId: d.clienteId || '', obs: d.obs || '' });
  if (mudou) {
    concluirOrdem(o, estado === 'concluido');
    // ordem da versão 13 não tinha a data da impressão: vale a da conclusão, para o consumo não mudar de mês
    o.fimImpressao = fimImp || fim || o.fimImpressao; o.fimImpressaoEm = fimImpEm || fimEm || o.fimImpressaoEm;
    if (o.status === 'concluido') { o.fim = fim || o.fim; o.fimEm = fimEm || o.fimEm; if (estado === 'concluido') o.passouAcabamento = !!passou; }
  }
  put('ordens', o);
}
function excluirOrdem(o) {
  if (ORDEM_IMPRESSA(o)) reabrirOrdem(o, 'fila');
  rm('ordens', o.id);
}
/* Peças que estragaram no acabamento: o filamento usado continua gasto e entra em Falhas (sem baixar de novo), as horas
   de máquina continuam no horímetro e a ordem volta para a fila para imprimir de novo. */
function refazerOrdem(o, motivo) {
  if (o.status !== 'acabamento') return false;
  (o.consumo || []).forEach(x => {
    const f = byId('filamentos', x.filamentoId), g = num(x.g);
    if (g <= 0) return;
    put('falhas', { id: uid(), data: hoje(), produtoId: o.produtoId, filamentoId: x.filamentoId, gramas: g, motivo: motivo || 'Estragou no acabamento',
      obs: 'Peças estragaram no acabamento', custo: f ? g / 1000 * num(f.precoKg) : 0, semBaixa: true, criadoEm: agoraISO() });
  });
  // embalagem e outros insumos ainda não tinham sido usados nas peças que estragaram: voltam para o estoque
  (o.insumosUsados || []).forEach(x => { const i = byId('insumos', x.insumoId); if (i) { i.estoque = arred(num(i.estoque) + num(x.qtd), 3); put('insumos', i); } });
  o.horasPerdidas = num(o.horasPerdidas) + num(o.horasTotal);
  Object.assign(o, { consumo: [], insumosUsados: [], horasTotal: 0, custoUnit: 0, fimImpressao: '', fimImpressaoEm: '', passouAcabamento: false, status: 'fila', inicio: '' });
  put('ordens', o);
  return true;
}
/* Troca a posição da ordem na fila (dir: -1 sobe, +1 desce). */
function moverOrdem(o, dir) {
  const fila = filaProducao().filter(x => x.o.status === 'fila').map(x => x.o);
  const i = fila.findIndex(x => x.id === o.id), j = i + dir;
  if (i < 0 || j < 0 || j >= fila.length) return;
  const a = fila[i], b = fila[j], t = num(a.ordem);
  a.ordem = num(b.ordem); b.ordem = t;
  if (a.ordem === b.ordem) a.ordem += dir;
  put('ordens', a); put('ordens', b);
}
/* 'atrasada' | 'hoje' | 'ok' | '' (sem prazo ou já concluída) */
function statusPrazo(o) {
  if (!o.prazo || o.status === 'concluido') return '';
  const h = hoje();
  return o.prazo < h ? 'atrasada' : o.prazo === h ? 'hoje' : 'ok';
}
/* Fila da impressora com previsão. Considera a impressora rodando sem parar, uma ordem por vez:
   primeiro o que está imprimindo, depois a fila na ordem definida. */
function filaProducao() {
  const ativos = S.ordens.filter(ORDEM_ATIVA);
  const peso = o => (o.status === 'imprimindo' ? 0 : 1);
  ativos.sort((a, b) => peso(a) - peso(b) || num(a.ordem) - num(b.ordem) || String(a.criadoEm || '').localeCompare(String(b.criadoEm || '')));
  let t = Date.now();
  return ativos.map(o => {
    const p = byId('produtos', o.produtoId), horas = num(p ? p.horas : 0) * num(o.qtd);
    let ini = t;
    if (o.status === 'imprimindo' && o.inicio) ini = Math.min(t, Date.parse(o.inicio) || t);
    const fim = Math.max(ini + horas * 36e5, o.status === 'imprimindo' ? Date.now() : ini);
    t = Math.max(t, fim);
    return { o, p, horas, inicio: new Date(ini), fim: new Date(fim), prazo: statusPrazo(o), estouraPrazo: !!o.prazo && dataLocal(new Date(fim)) > o.prazo };
  });
}
/* Ordens já impressas esperando o acabamento, as mais antigas primeiro. */
const ordensEmAcabamento = () => S.ordens.filter(o => o.status === 'acabamento')
  .sort((a, b) => String(a.fimImpressaoEm || '').localeCompare(String(b.fimImpressaoEm || '')));
/* Horímetro: horas iniciais informadas na Configuração + horas das ordens já impressas. */
const horimetro = () => memo('hor', () => num(S.config.horimetroInicial) + soma(S.ordens.filter(ORDEM_IMPRESSA), 'horasTotal') + soma(S.ordens, 'horasPerdidas'));
/* Produtos abaixo do estoque mínimo, contando as peças que já estão em produção (fila, impressora e acabamento).
   [{ p, minimo, estoque, emProducao, falta }] — falta é quanto produzir para voltar ao mínimo. */
function sugestoesProducao() {
  return memo('sugestoes', () => S.produtos.filter(p => num(p.estoqueMinimo) > 0).map(p => {
    const emProducao = soma(S.ordens.filter(o => o.produtoId === p.id && ORDEM_ABERTA(o)), 'qtd');
    const falta = Math.ceil(num(p.estoqueMinimo) - num(p.estoque) - emProducao);
    return falta > 0 ? { p, minimo: num(p.estoqueMinimo), estoque: num(p.estoque), emProducao, falta } : null;
  }).filter(Boolean).sort((a, b) => b.falta - a.falta));
}

/* ---------- Pedidos (vendas) e estoque de peças prontas ----------
   Cada venda é um pedido com um ou mais itens. Os itens guardam o que foi vendido e as contas do dia da venda;
   os totais do pedido (qtd, bruto, taxa, frete, imposto, custo, lucro) já descontam as devoluções.
   Taxa do canal: comissão sobre o valor + taxa fixa por unidade. Frete: uma vez por pedido, repartido entre os
   itens pelo valor de cada um (para o lucro por produto). */
const SEM_CANAL = { id: '', nome: 'Sem canal', pct: 0, fixa: 0, frete: 0 };
/* Conta de um pedido SEM gravar nada (a mesma usada ao registrar; serve para a prévia do formulário).
   d: { data, canalId, frete (opcional), itens: [{ produtoId, produtoNome, qtd, precoUnit, custoUnit (opcional) }] }
   ou, como antes, um produto só: { produtoId, qtd, precoUnit, custoUnit }. custoUnit: 0 para item fora do catálogo. */
function simularVenda(d) {
  const canal = byId('canais', d.canalId) || SEM_CANAL;
  const entrada = Array.isArray(d.itens) ? d.itens
    : [{ produtoId: d.produtoId, produtoNome: d.produtoNome, qtd: d.qtd, precoUnit: d.precoUnit, custoUnit: d.custoUnit }];
  const imp = num(S.config.imposto);
  const itens = entrada.map(i => {
    const p = byId('produtos', i.produtoId);
    const qtd = Math.max(1, Math.round(num(i.qtd))), precoUnit = num(i.precoUnit);
    const custoUnit = i.custoUnit != null && i.custoUnit !== '' ? num(i.custoUnit) : (p ? custoProduto(p).custo : 0);
    const bruto = precoUnit * qtd;
    return {
      p, produtoId: p ? p.id : '', produtoNome: p ? p.nome : String(i.produtoNome || i.descricao || ''), qtd, precoUnit, custoUnit, bruto,
      taxa: bruto * num(canal.pct) / 100 + num(canal.fixa) * qtd, imposto: bruto * imp / 100, custo: custoUnit * qtd,
    };
  });
  const bruto = soma(itens, 'bruto');
  const frete = d.frete === undefined || d.frete === null || d.frete === '' ? num(canal.frete) : num(d.frete);
  // taxa de verdade cobrada pelo marketplace (pedido importado): substitui a regra do canal, repartida pelo valor de cada item
  if (d.taxaTotal !== undefined && d.taxaTotal !== null && d.taxaTotal !== '') {
    const t = Math.max(0, num(d.taxaTotal));
    itens.forEach(i => { i.taxa = bruto > 0 ? t * i.bruto / bruto : t / itens.length; });
  }
  itens.forEach(i => {
    i.frete = itens.length ? (bruto > 0 ? frete * i.bruto / bruto : frete / itens.length) : 0;
    i.lucro = i.bruto - i.custo - i.taxa - i.frete - i.imposto;
  });
  const taxa = soma(itens, 'taxa'), imposto = soma(itens, 'imposto'), custo = soma(itens, 'custo'), qtd = soma(itens, 'qtd');
  const lucro = bruto - custo - taxa - frete - imposto;
  const um = itens.length === 1 ? itens[0] : null;      // com um item só, os campos antigos continuam valendo
  return {
    canal, itens, qtd, bruto, taxa, frete, imposto, custo, lucro, margem: bruto > 0 ? lucro / bruto * 100 : 0,
    p: um ? um.p : null, precoUnit: um ? um.precoUnit : 0, custoUnit: um ? um.custoUnit : 0,
  };
}
const proximoNumeroPedido = () => S.vendas.reduce((m, v) => Math.max(m, num(v.numero)), 0) + 1;
/* Registra o pedido: as peças do catálogo saem do estoque de prontas. Guarda as contas do dia da venda,
   para os relatórios não mudarem quando a configuração mudar. Devolve o registro gravado. */
function registrarVenda(d) {
  const s = simularVenda(d);
  s.itens.forEach(i => { if (i.p) { i.p.estoque = num(i.p.estoque) - i.qtd; put('produtos', i.p); } });
  const v = {
    // id vindo de fora (pedido importado da Shopee): o mesmo em qualquer aparelho, para o pedido nunca entrar duas vezes
    id: d.id && ID_OK.test(String(d.id)) ? String(d.id) : uid(),
    numero: proximoNumeroPedido(), data: d.data || hoje(), canalId: s.canal.id, canalNome: s.canal.nome,
    clienteId: d.clienteId || '', obs: d.obs || '', orcamentoId: d.orcamentoId || '',
    itens: s.itens.map(i => ({
      produtoId: i.produtoId, produtoNome: i.produtoNome, qtd: i.qtd, precoUnit: i.precoUnit, custoUnit: i.custoUnit,
      bruto: i.bruto, taxa: i.taxa, imposto: i.imposto, frete: i.frete, custo: i.custo, lucro: i.lucro,
    })),
    devolucoes: [], criadoEm: agoraISO(),
  };
  if (d.shopeeOrderSn) v.shopeeOrderSn = String(d.shopeeOrderSn);
  recalcularVenda(v);
  return put('vendas', v);
}
/* Itens do pedido com os números que valem hoje (já descontadas as devoluções). Venda antiga (um produto) vira um item.
   Cada item: { ...o que foi vendido, qtdOriginal, devolvido, qtd (o que ficou vendido), bruto, taxa, imposto, frete,
   custo (de todas as peças feitas), custoExtra (gastos da devolução), perda, lucro }. */
function itensVenda(v) {
  const base = Array.isArray(v.itens) && v.itens.length ? v.itens : [{
    produtoId: v.produtoId, produtoNome: v.produtoNome, qtd: v.qtd, precoUnit: v.precoUnit, custoUnit: v.custoUnit,
    bruto: v.bruto, taxa: v.taxa, imposto: v.imposto, frete: v.frete, custo: num(v.custoUnit) * num(v.qtd),
  }];
  const devs = Array.isArray(v.devolucoes) ? v.devolucoes : [];
  return base.map((i, k) => {
    const meus = devs.filter(x => num(x.item) === k);
    const q = num(i.qtd), dev = Math.min(q, soma(meus, 'qtd')), fica = q > 0 ? (q - dev) / q : 0;
    const custo = i.custo != null ? num(i.custo) : num(i.custoUnit) * q, custoExtra = soma(meus, 'custoExtra');
    const bruto = num(i.bruto) * fica, taxa = num(i.taxa) * fica, imposto = num(i.imposto) * fica, frete = num(i.frete);
    return {
      ...i, qtdOriginal: q, devolvido: dev, qtd: q - dev, bruto, taxa, imposto, frete, custo, custoExtra,
      perda: (q > 0 ? custo * dev / q : 0) + custoExtra, lucro: bruto - custo - taxa - frete - imposto - custoExtra,
    };
  });
}
/* Refaz os totais do pedido a partir dos itens e das devoluções. */
function recalcularVenda(v) {
  const its = itensVenda(v);
  if (!Array.isArray(v.itens) || !v.itens.length) {
    // venda antiga: passa a guardar o produto como item, para as devoluções terem a que se referir
    v.itens = its.map(i => ({ produtoId: i.produtoId, produtoNome: i.produtoNome, qtd: i.qtdOriginal, precoUnit: i.precoUnit,
      custoUnit: i.custoUnit, bruto: num(v.bruto), taxa: num(v.taxa), imposto: num(v.imposto), frete: num(v.frete), custo: i.custo, lucro: num(v.lucro) }));
    delete v.produtoId; delete v.produtoNome; delete v.precoUnit; delete v.custoUnit;
  }
  v.qtd = soma(its, 'qtd'); v.bruto = soma(its, 'bruto'); v.taxa = soma(its, 'taxa'); v.frete = soma(its, 'frete');
  v.imposto = soma(its, 'imposto'); v.custo = soma(its, 'custo'); v.lucro = soma(its, 'lucro');
  v.devolvido = soma(its, 'devolvido'); v.perdaDevolucao = soma(its, 'perda'); v.custoDevolucao = soma(its, 'custoExtra');
  return v;
}
/* Nome curto do pedido: "Vaso" ou "Vaso + 2 itens". */
function resumoItensVenda(v) {
  const its = itensVenda(v), nome = i => (byId('produtos', i.produtoId) || {}).nome || i.produtoNome || 'Produto excluído';
  if (!its.length) return 'Pedido vazio';
  return its.length === 1 ? nome(its[0]) : `${nome(its[0])} + ${its.length - 1} ${its.length === 2 ? 'item' : 'itens'}`;
}
/* Devolução que vira perda: a venda dessas peças é desfeita (valor, taxa e imposto proporcionais saem da conta), a peça
   NÃO volta para o estoque e o custo dela fica como perda. custoExtra: frete de volta e outros gastos da devolução.
   d: { item (posição do item no pedido), qtd, motivo, custoExtra, data }. Devolve false se não havia o que devolver. */
function registrarDevolucao(v, d) {
  recalcularVenda(v);                                    // venda antiga ganha a lista de itens
  const its = itensVenda(v), k = Math.round(num(d.item)), it = its[k];
  if (!it) return false;
  const qtd = Math.min(Math.max(1, Math.round(num(d.qtd))), it.qtd);
  if (!(qtd > 0)) return false;
  const brutoAntes = num(v.bruto);
  const dev = { id: uid(), data: d.data || hoje(), item: k, qtd, motivo: d.motivo || '', custoExtra: Math.max(0, num(d.custoExtra)), criadoEm: agoraISO() };
  v.devolucoes = [...(Array.isArray(v.devolucoes) ? v.devolucoes : []), dev];
  recalcularVenda(v);
  // o cliente não deve mais o valor devolvido: abate das contas a receber deste pedido que ainda estão em aberto
  let abater = arred(brutoAntes - num(v.bruto), 2);
  const abatidas = [];
  S.contas.filter(c => c.tipo === 'receber' && c.origem === 'venda' && c.origemId === v.id && !c.pagoEm)
    .sort((a, b) => String(b.vencimento || '').localeCompare(String(a.vencimento || '')))
    .forEach(c => {
      if (abater <= 0) return;
      const tira = Math.min(abater, num(c.valor));
      abater = arred(abater - tira, 2);
      abatidas.push({ id: c.id, valor: tira });
      c.valor = arred(num(c.valor) - tira, 2);
      if (c.valor > 0) put('contas', c); else excluirConta(c);
    });
  if (abatidas.length) dev.abatidas = abatidas;
  put('vendas', v);
  return true;
}
/* Desfaz a devolução e devolve às contas a receber o que ela tinha abatido. */
function desfazerDevolucao(v, devId) {
  const lista = Array.isArray(v.devolucoes) ? v.devolucoes : [];
  const dev = lista.find(x => x.id === devId);
  v.devolucoes = lista.filter(x => x.id !== devId);
  recalcularVenda(v);
  put('vendas', v);
  ((dev && Array.isArray(dev.abatidas)) ? dev.abatidas : []).forEach(a => {
    const c = byId('contas', a.id);
    if (c && !c.pagoEm) { c.valor = arred(num(c.valor) + num(a.valor), 2); put('contas', c); }
    else criarConta({ tipo: 'receber', descricao: `Pedido nº ${v.numero || ''} (devolução desfeita)`, valor: a.valor, vencimento: hoje(),
      clienteId: v.clienteId, origem: 'venda', origemId: v.id, parte: 'saldo' });
  });
}
/* Exclui o pedido: as peças que continuavam vendidas voltam para o estoque (as devolvidas foram perdidas e não voltam)
   e as contas a receber ligadas a ele saem junto. */
function excluirVenda(v) {
  itensVenda(v).forEach(i => {
    const p = byId('produtos', i.produtoId);
    if (p && i.qtd) { p.estoque = num(p.estoque) + i.qtd; put('produtos', p); }
  });
  S.contas.filter(c => c.origem === 'venda' && c.origemId === v.id).forEach(c => excluirConta(c));
  rm('vendas', v.id);
}

/* ---------- Compras de filamento e insumos ---------- */
/* d: { data, filamentoId, fornecedorId, pesoG, valor (total pago, com frete), obs }.
   Soma ao estoque e recalcula o preço por kg pela média ponderada com o que já havia. */
function registrarCompra(d) {
  const f = byId('filamentos', d.filamentoId), g = num(d.pesoG), valor = num(d.valor);
  if (f && g > 0) {
    const est = Math.max(0, num(f.estoqueG));
    f.precoKg = arred((est / 1000 * num(f.precoKg) + valor) / ((est + g) / 1000), 2);
    f.estoqueG = arred(num(f.estoqueG) + g, 2);
    put('filamentos', f);
  }
  return put('compras', {
    id: uid(), data: d.data || hoje(), filamentoId: d.filamentoId || '', fornecedorId: d.fornecedorId || '',
    pesoG: g, valor, precoKg: g > 0 ? valor / (g / 1000) : 0, obs: d.obs || '', criadoEm: agoraISO(),
  });
}
/* Tira o peso do estoque; o preço médio do filamento não é recalculado. */
function excluirCompra(c) {
  const f = byId('filamentos', c.filamentoId);
  if (f) { f.estoqueG = arred(num(f.estoqueG) - num(c.pesoG), 2); put('filamentos', f); }
  rm('compras', c.id);
}
/* Repõe um insumo: soma ao estoque, recalcula o custo médio e lança o gasto no financeiro. */
function reporInsumo(i, qtd, valor, data) {
  qtd = num(qtd); valor = num(valor);
  if (qtd <= 0) return;
  const est = Math.max(0, num(i.estoque));
  if (valor > 0) i.custo = arred((est * num(i.custo) + valor) / (est + qtd), 4);
  i.estoque = arred(num(i.estoque) + qtd, 3);
  put('insumos', i);
  if (valor > 0) {
    put('lancamentos', { id: uid(), data: data || hoje(), tipo: 'gasto', categoria: 'Insumos', descricao: `Reposição: ${i.nome} (${nf(qtd, 2)} ${i.unidade || 'un'})`, valor, fixo: false, criadoEm: agoraISO() });
  }
}
/* Comparação de fornecedores a partir das compras. */
function resumoFornecedores() {
  return S.fornecedores.map(f => {
    const cs = S.compras.filter(c => c.fornecedorId === f.id);
    const g = soma(cs, 'pesoG'), valor = soma(cs, 'valor');
    return { f, compras: cs.length, g, valor, precoKg: g > 0 ? valor / (g / 1000) : 0, ultima: cs.map(c => c.data || '').sort().pop() || '' };
  }).sort((a, b) => (a.precoKg || Infinity) - (b.precoKg || Infinity));
}

/* ---------- Falhas e manutenção ---------- */
/* d: { data, produtoId (opcional), filamentoId, gramas, motivo, obs } — baixa o filamento perdido. */
function registrarFalha(d) {
  const f = byId('filamentos', d.filamentoId), g = num(d.gramas);
  if (f && g > 0) { f.estoqueG = arred(num(f.estoqueG) - g, 2); put('filamentos', f); }
  return put('falhas', {
    id: uid(), data: d.data || hoje(), produtoId: d.produtoId || '', filamentoId: d.filamentoId || '', gramas: g,
    motivo: d.motivo || '', obs: d.obs || '', custo: f ? g / 1000 * num(f.precoKg) : 0, criadoEm: agoraISO(),
  });
}
function excluirFalha(x) {
  const f = byId('filamentos', x.filamentoId);
  // falha de peça que estragou no acabamento não baixou filamento (a ordem já tinha baixado): excluir não devolve nada
  if (f && !x.semBaixa) { f.estoqueG = arred(num(f.estoqueG) + num(x.gramas), 2); put('filamentos', f); }
  rm('falhas', x.id);
}
/* Situação de um item de manutenção: { usadoH, faltaH, pct, estado: 'ok' | 'proxima' | 'vencida' } */
function statusManutencao(item) {
  const usadoH = Math.max(0, horimetro() - num(item.ultimaH)), intervalo = num(item.intervaloH);
  const p = intervalo > 0 ? usadoH / intervalo * 100 : 0;
  return { usadoH, faltaH: Math.max(0, intervalo - usadoH), pct: p, estado: intervalo <= 0 ? 'ok' : p >= 100 ? 'vencida' : p >= 85 ? 'proxima' : 'ok' };
}
/* d: { data, itemId (opcional), descricao, custo } — zera a contagem do item e guarda no histórico. */
function registrarManutencao(d) {
  const item = byId('manutItens', d.itemId), h = horimetro();
  if (item) { item.ultimaH = h; put('manutItens', item); }
  return put('manutHist', {
    id: uid(), data: d.data || hoje(), itemId: d.itemId || '', descricao: d.descricao || (item ? item.nome : 'Manutenção'),
    custo: num(d.custo), horimetro: h, criadoEm: agoraISO(),
  });
}
/* Custo real de manutenção por hora impressa, desde o início do registro. */
function manutencaoRealHora() {
  const horas = horimetro() - num(S.config.horimetroInicial), custo = soma(S.manutHist, 'custo');
  return { horas, custo, porHora: horas > 0 ? custo / horas : 0 };
}

/* ---------- Contas a pagar e a receber ----------
   { tipo: 'pagar' | 'receber', descricao, valor, vencimento, categoria, fornecedorId, clienteId,
     origem: '' | 'orcamento' | 'venda', origemId, parte: '' | 'sinal' | 'saldo', recorrente, obs,
     pagoEm, valorPago, lancamentoId } */
/* 'paga' | 'vencida' | 'hoje' | 'aberta' */
function situacaoConta(c) {
  if (c.pagoEm) return 'paga';
  if (!c.vencimento) return 'aberta';
  const h = hoje();
  return c.vencimento < h ? 'vencida' : c.vencimento === h ? 'hoje' : 'aberta';
}
const contasAbertas = tipo => S.contas.filter(c => c.tipo === tipo && !c.pagoEm);
function criarConta(d) {
  const receber = d.tipo === 'receber';
  const vencimento = d.vencimento || hoje();
  return put('contas', {
    // id vindo de fora: a conta do mês seguinte de uma conta que repete tem id fixo, o mesmo em qualquer aparelho
    id: d.id && ID_OK.test(String(d.id)) ? String(d.id) : uid(),
    tipo: receber ? 'receber' : 'pagar', descricao: String(d.descricao || ''), valor: arred(d.valor, 2),
    vencimento, categoria: receber ? '' : (d.categoria || 'Outros'),
    fornecedorId: d.fornecedorId || '', clienteId: d.clienteId || '', origem: d.origem || '', origemId: d.origemId || '',
    parte: d.parte || '', recorrente: !receber && !!d.recorrente, obs: d.obs || '',
    serie: d.serie || '', diaVenc: num(d.diaVenc) || Number(String(vencimento).slice(8, 10)) || 0,
    jaNoCaixa: !receber && !!d.jaNoCaixa,                  // compra já registrada em Compras/insumos: pagar não lança o gasto de novo
    pagoEm: '', valorPago: 0, lancamentoId: '', criadoEm: agoraISO(),
  });
}
/* Marca a conta como paga (ou recebida). Conta a pagar vira um gasto no Financeiro, na data do pagamento (a não ser que
   já esteja no caixa por outro caminho). Conta a receber avulsa vira uma entrada; a de um pedido ou de um sinal de
   orçamento entra no caixa (caixaDoMes) na data em que é recebida. Conta a pagar que repete todo mês já deixa criada a
   do mês seguinte, no mesmo dia do mês.
   d: { data, valor, parcial }. parcial: pagou só uma parte, e o que falta continua em aberto numa conta nova.
   Valor menor sem parcial = desconto (não falta nada). Devolve a conta do mês seguinte, quando criou uma. */
function pagarConta(c, d = {}) {
  if (c.pagoEm) return null;
  const valorOriginal = num(c.valor);
  c.pagoEm = d.data || hoje();
  c.valorPago = num(d.valor) > 0 ? arred(d.valor, 2) : valorOriginal;
  const resto = arred(valorOriginal - c.valorPago, 2);
  if (d.parcial && resto > 0) {
    c.valor = c.valorPago;                                  // esta fica com o que foi pago; o resto vira outra conta, em aberto
    criarConta({ tipo: c.tipo, descricao: String(c.descricao || 'Conta').replace(/ \(restante\)$/, '') + ' (restante)', valor: resto,
      vencimento: c.vencimento, categoria: c.categoria, fornecedorId: c.fornecedorId, clienteId: c.clienteId,
      origem: c.origem, origemId: c.origemId, parte: c.parte, obs: c.obs, jaNoCaixa: c.jaNoCaixa });
  }
  const lanc = c.tipo === 'pagar' ? (c.jaNoCaixa ? null : { tipo: 'gasto', categoria: c.categoria || 'Outros' })
    : !c.origemId ? { tipo: 'entrada', categoria: 'Outras entradas' } : null;
  if (lanc) {
    // id fixo: pagar a mesma conta em dois aparelhos grava o mesmo lançamento, nunca dois
    c.lancamentoId = put('lancamentos', {
      id: 'pg-' + c.id, data: c.pagoEm, ...lanc, descricao: c.descricao || 'Conta', valor: c.valorPago, fixo: false, contaId: c.id, criadoEm: agoraISO(),
    }).id;
  }
  put('contas', c);
  if (c.tipo === 'pagar' && c.recorrente) {
    const base = String(c.vencimento || c.pagoEm).slice(0, 10);
    const dia = num(c.diaVenc) || Number(base.slice(8, 10)) || 1;
    const venc = addMesesData(base.slice(0, 8) + String(dia).padStart(2, '0'), 1), mes = venc.slice(0, 7);
    const serie = c.serie || c.id, idProx = (serie + '-' + mes.replace('-', '')).slice(0, 64);
    const existe = byId('contas', idProx) || S.contas.some(x => x.id !== c.id && x.tipo === 'pagar' && x.recorrente &&
      x.descricao === c.descricao && String(x.vencimento || '').slice(0, 7) === mes);
    if (!existe) return criarConta({ ...c, id: idProx, serie, diaVenc: dia, vencimento: venc, valor: valorOriginal });
  }
  return null;
}
/* Lançamentos do Financeiro criados pelo pagamento da conta (inclusive um que tenha ficado de outro aparelho). */
const lancamentosDaConta = c => S.lancamentos.filter(l => l.contaId === c.id || (c.lancamentoId && l.id === c.lancamentoId));
/* Volta a conta para "em aberto" e tira do Financeiro o lançamento que o pagamento criou. */
function desfazerPagamento(c) {
  lancamentosDaConta(c).forEach(l => rm('lancamentos', l.id));
  c.pagoEm = ''; c.valorPago = 0; c.lancamentoId = '';
  put('contas', c);
}
function excluirConta(c) {
  lancamentosDaConta(c).forEach(l => rm('lancamentos', l.id));
  rm('contas', c.id);
}
/* Totais para os cartões da tela de contas. */
function resumoContas() {
  return memo('contas', () => {
    const h = hoje(), mes = mesAtual(), r = { pagar: 0, pagarVencidas: 0, nPagarVencidas: 0, pagarMes: 0, receber: 0, receberAtrasado: 0, nReceberAtrasado: 0, pagoMes: 0, recebidoMes: 0 };
    S.contas.forEach(c => {
      const v = num(c.valor);
      if (c.pagoEm) {
        if (String(c.pagoEm).slice(0, 7) === mes) r[c.tipo === 'pagar' ? 'pagoMes' : 'recebidoMes'] += num(c.valorPago) || v;
        return;
      }
      if (c.tipo === 'pagar') {
        r.pagar += v;
        if (c.vencimento && c.vencimento < h) { r.pagarVencidas += v; r.nPagarVencidas++; }
        if (String(c.vencimento || '').slice(0, 7) <= mes) r.pagarMes += v;
      } else {
        r.receber += v;
        if (c.vencimento && c.vencimento < h) { r.receberAtrasado += v; r.nReceberAtrasado++; }
      }
    });
    return r;
  });
}
/* Quanto do pedido ainda está a receber (contas abertas ligadas a ele). */
const aReceberDaVenda = v => soma(S.contas.filter(c => c.tipo === 'receber' && c.origem === 'venda' && c.origemId === v.id && !c.pagoEm), 'valor');

/* ---------- Períodos, caixa e relatórios ---------- */
const noPeriodo = (data, ini, fim) => { const m = String(data || '').slice(0, 7); return m >= ini && m <= fim; };
const ultimosMeses = n => Array.from({ length: n }, (_, i) => addMeses(mesAtual(), i - n + 1));
function resumoVendas(lista) {
  const r = { n: lista.length, qtd: 0, bruto: 0, taxas: 0, frete: 0, imposto: 0, custo: 0, lucro: 0, devolvidas: 0, perda: 0, custoDevolucao: 0 };
  lista.forEach(v => {
    r.qtd += num(v.qtd); r.bruto += num(v.bruto); r.taxas += num(v.taxa); r.frete += num(v.frete); r.imposto += num(v.imposto);
    r.custo += v.custo != null ? num(v.custo) : num(v.custoUnit) * num(v.qtd); r.lucro += num(v.lucro);
    r.devolvidas += num(v.devolvido); r.perda += num(v.perdaDevolucao); r.custoDevolucao += num(v.custoDevolucao);
  });
  r.margem = r.bruto > 0 ? r.lucro / r.bruto * 100 : 0;
  return r;
}
const vendasDoMes = mes => S.vendas.filter(v => noPeriodo(v.data, mes, mes));
/* Conta a receber ligada a um pedido ou ao sinal de um orçamento: o dinheiro dela entra no caixa quando é recebido. */
const contaDeVenda = c => c.tipo === 'receber' && !!c.origemId && (c.origem === 'venda' || c.origem === 'orcamento');
/* Caixa do mês: o que entrou das vendas (e outras entradas) e tudo que saiu (inclusive compras de material e retiradas).
   Venda à vista conta no dia do pedido. A parte de um pedido que ficou em Contas a receber sai do mês do pedido e entra
   no mês em que o cliente paga (o sinal de orçamento também, mesmo que a venda nunca aconteça). */
function caixaDoMes(mes) {
  const vm = vendasDoMes(mes), v = resumoVendas(vm);
  const idsMes = new Set(vm.map(x => x.id)), orcMes = new Set(vm.map(x => x.orcamentoId).filter(Boolean));
  const prazoMes = S.contas.filter(c => contaDeVenda(c) && (c.origem === 'venda' ? idsMes.has(c.origemId) : orcMes.has(c.origemId)));
  const aPrazo = soma(prazoMes, 'valor'), aPrazoAberto = soma(prazoMes.filter(c => !c.pagoEm), 'valor');   // aberto: o que o cliente ainda não pagou
  const recebidoContas = soma(S.contas.filter(c => contaDeVenda(c) && c.pagoEm && noPeriodo(c.pagoEm, mes, mes)), c => num(c.valorPago) || num(c.valor));
  const lanc = S.lancamentos.filter(l => noPeriodo(l.data, mes, mes));
  const gastosLista = lanc.filter(l => l.tipo !== 'retirada' && l.tipo !== 'entrada');
  const retiradasLista = lanc.filter(l => l.tipo === 'retirada'), entradasLista = lanc.filter(l => l.tipo === 'entrada');
  const porCategoria = {};
  gastosLista.forEach(l => { const k = l.categoria || 'Outros'; porCategoria[k] = (porCategoria[k] || 0) + num(l.valor); });
  const compras = soma(S.compras.filter(c => noPeriodo(c.data, mes, mes)), 'valor');
  const manutencao = soma(S.manutHist.filter(m => noPeriodo(m.data, mes, mes)), 'custo');
  const gastos = soma(gastosLista, 'valor'), retiradas = soma(retiradasLista, 'valor'), entradas = soma(entradasLista, 'valor');
  const devolucoes = v.custoDevolucao;                    // frete de volta e outros gastos das devoluções
  const liquido = v.bruto - v.taxas - v.frete - aPrazo + recebidoContas;
  const resultado = liquido + entradas - v.imposto - compras - manutencao - gastos - devolucoes;
  return {
    mes, vendas: v, bruto: v.bruto, taxas: v.taxas, frete: v.frete, aPrazo, aPrazoAberto, recebidoContas, liquido, entradas, imposto: v.imposto,
    compras, manutencao, gastos, devolucoes, porCategoria, retiradas, resultado, saldo: resultado - retiradas,
    // gastos fixos: os marcados "repete todo mês" e os que vieram de uma conta a pagar que repete
    lancamentos: lanc, fixos: soma(gastosLista.filter(l => l.fixo || (byId('contas', l.contaId) || {}).recorrente), 'valor'),
  };
}
/* Copia para o mês os gastos marcados como fixos do mês anterior que ainda não existem nele. Devolve quantos copiou. */
function copiarFixos(mes) {
  const ant = addMeses(mes, -1);
  const chave = l => [l.descricao || '', l.categoria || '', l.tipo || '', l.socio || ''].join('|');   // a retirada de cada sócio é uma
  const jaTem = new Set(S.lancamentos.filter(l => noPeriodo(l.data, mes, mes)).map(chave));
  const fixos = S.lancamentos.filter(l => l.fixo && noPeriodo(l.data, ant, ant) && !jaTem.has(chave(l)));
  fixos.forEach(l => {
    const dia = String(l.data || '').slice(8, 10) || '01';
    const ultimo = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
    put('lancamentos', { ...l, id: uid(), data: mes + '-' + String(Math.min(Number(dia), ultimo)).padStart(2, '0'), criadoEm: agoraISO() });
  });
  return fixos.length;
}
/* Sócios da Configuração: [{ n: '1' | '2', nome, pct }] */
const socios = () => [1, 2].map(n => ({ n: String(n), nome: String(S.config['socio' + n + 'Nome'] || 'Sócio ' + n), pct: num(S.config['socio' + n + 'Pct']) }));
/* Divisão do resultado do caixa entre os sócios no período (meses AAAA-MM, inclusive), com o que cada um já retirou.
   { resultado, socios: [{ n, nome, pct, parte, retirado, saldo }], semSocio } — saldo negativo: retirou mais que a parte. */
function divisaoSocios(ini, fim) {
  let resultado = 0;
  for (let m = ini; m <= fim; m = addMeses(m, 1)) resultado += caixaDoMes(m).resultado;
  const ret = S.lancamentos.filter(l => l.tipo === 'retirada' && noPeriodo(l.data, ini, fim));
  const lista = socios().map(s => {
    const retirado = soma(ret.filter(l => String(l.socio || '') === s.n), 'valor'), parte = resultado * s.pct / 100;
    return { ...s, parte, retirado, saldo: parte - retirado };
  });
  return { resultado, socios: lista, semSocio: soma(ret.filter(l => !lista.some(s => s.n === String(l.socio || ''))), 'valor') };
}
/* Um ponto por mês: faturamento, custos (tudo que foi descontado), lucro e filamento consumido. */
function serieMensal(n) {
  return ultimosMeses(n).map(mes => {
    const v = resumoVendas(vendasDoMes(mes));
    let consumoG = 0;
    S.ordens.forEach(o => { if (ORDEM_IMPRESSA(o) && noPeriodo(dataImpressao(o), mes, mes)) consumoG += soma(o.consumo, 'g'); });
    S.falhas.forEach(f => { if (noPeriodo(f.data, mes, mes)) consumoG += num(f.gramas); });
    return { mes, rotulo: nomeMes(mes), fat: v.bruto, custos: v.bruto - v.lucro, lucro: v.lucro, margem: v.margem, qtd: v.qtd, n: v.n, consumoG };
  });
}
function rankingProdutos(ini, fim) {
  const m = new Map();
  S.vendas.filter(v => noPeriodo(v.data, ini, fim)).forEach(v => itensVenda(v).forEach(i => {
    const k = i.produtoId || i.produtoNome || '?';
    const r = m.get(k) || { produtoId: i.produtoId, nome: (byId('produtos', i.produtoId) || {}).nome || i.produtoNome || 'Produto excluído', qtd: 0, fat: 0, lucro: 0, devolvidas: 0 };
    r.qtd += num(i.qtd); r.fat += num(i.bruto); r.lucro += num(i.lucro); r.devolvidas += num(i.devolvido);
    m.set(k, r);
  }));
  return [...m.values()].map(r => ({ ...r, margem: r.fat > 0 ? r.lucro / r.fat * 100 : 0 })).sort((a, b) => b.lucro - a.lucro);
}
function rankingCanais(ini, fim) {
  const m = new Map();
  S.vendas.filter(v => noPeriodo(v.data, ini, fim)).forEach(v => {
    const k = v.canalId || v.canalNome || '?';
    const r = m.get(k) || { canalId: v.canalId, nome: (byId('canais', v.canalId) || {}).nome || v.canalNome || 'Sem canal', n: 0, qtd: 0, fat: 0, taxas: 0, frete: 0, lucro: 0 };
    r.n++; r.qtd += num(v.qtd); r.fat += num(v.bruto); r.taxas += num(v.taxa); r.frete += num(v.frete); r.lucro += num(v.lucro);
    m.set(k, r);
  });
  return [...m.values()].map(r => ({ ...r, margem: r.fat > 0 ? r.lucro / r.fat * 100 : 0 })).sort((a, b) => b.lucro - a.lucro);
}
/* Filamento gasto por material no período (peças boas + falhas), com o custo ao preço atual. */
function consumoPorMaterial(ini, fim) {
  const m = new Map();
  const add = (id, g, falha) => {
    const f = byId('filamentos', id);
    const r = m.get(id || '?') || { filamentoId: id, nome: f ? f.nome : 'Filamento excluído', cor: f ? f.cor : '#888', g: 0, falhaG: 0, custo: 0 };
    r.g += g; if (falha) r.falhaG += g; r.custo += f ? g / 1000 * num(f.precoKg) : 0;
    m.set(id || '?', r);
  };
  S.ordens.forEach(o => { if (ORDEM_IMPRESSA(o) && noPeriodo(dataImpressao(o), ini, fim)) (o.consumo || []).forEach(x => add(x.filamentoId, num(x.g), false)); });
  S.falhas.forEach(f => { if (noPeriodo(f.data, ini, fim)) add(f.filamentoId, num(f.gramas), true); });
  return [...m.values()].sort((a, b) => b.g - a.g);
}

/* ---------- Clientes e orçamentos ---------- */
/* Total do orçamento, com o sinal (percentual do total) e o restante. */
function totalOrcamento(o) {
  const subtotal = soma(o.itens, i => num(i.qtd) * num(i.precoUnit)), desconto = num(o.desconto);
  const total = Math.max(0, subtotal - desconto);
  const sinalPct = Math.min(100, Math.max(0, num(o.sinalPct)));
  const sinal = arred(total * sinalPct / 100, 2);
  return { subtotal, desconto, total, sinalPct, sinal, restante: Math.max(0, total - sinal) };
}
const proximoNumeroOrcamento = () => S.orcamentos.reduce((m, o) => Math.max(m, num(o.numero)), 0) + 1;
function historicoCliente(id) {
  const vendas = S.vendas.filter(v => v.clienteId === id).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const orcamentos = S.orcamentos.filter(o => o.clienteId === id).sort((a, b) => num(b.numero) - num(a.numero));
  const ordens = S.ordens.filter(o => o.clienteId === id).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const aReceber = soma(S.contas.filter(c => c.tipo === 'receber' && c.clienteId === id && !c.pagoEm), 'valor');
  return { vendas, orcamentos, ordens, aReceber, total: soma(vendas, 'bruto'), pecas: soma(vendas, 'qtd'), ultima: vendas[0] ? vendas[0].data : '' };
}

/* ---------- Avisos ---------- */
/* Lista do que precisa de atenção: [{ tipo: 'bad' | 'warn', texto, pg }] */
function alertas() {
  return memo('alertas' + new Date().toISOString().slice(0, 13), () => {   // refaz a cada hora, pois depende do relógio
    const a = [], c = S.config;
    S.ordens.filter(ORDEM_ABERTA).forEach(o => {
      const st = statusPrazo(o), nome = (byId('produtos', o.produtoId) || {}).nome || 'Produto excluído';
      if (st === 'atrasada') a.push({ tipo: 'bad', texto: `Atrasada: ${num(o.qtd)}× ${nome} (prazo ${dataBR(o.prazo)})`, pg: 'producao' });
      else if (st === 'hoje') a.push({ tipo: 'warn', texto: `Vence hoje: ${num(o.qtd)}× ${nome}`, pg: 'producao' });
    });
    filaProducao().forEach(x => { if (x.estouraPrazo && x.prazo === 'ok') a.push({ tipo: 'warn', texto: `Pela fila, ${num(x.o.qtd)}× ${x.p ? x.p.nome : 'produto'} termina depois do prazo (${dataBR(x.o.prazo)})`, pg: 'producao' }); });
    S.manutItens.forEach(i => {
      const s = statusManutencao(i);
      if (s.estado === 'vencida') a.push({ tipo: 'bad', texto: `Manutenção vencida: ${i.nome} (${nf(s.usadoH)} h de ${nf(i.intervaloH)} h)`, pg: 'manutencao' });
      else if (s.estado === 'proxima') a.push({ tipo: 'warn', texto: `Manutenção próxima: ${i.nome} (faltam ${nf(s.faltaH)} h)`, pg: 'manutencao' });
    });
    S.filamentos.forEach(f => { if (num(f.estoqueG) <= num(c.alertaEstoque)) a.push({ tipo: num(f.estoqueG) <= 0 ? 'bad' : 'warn', texto: `Filamento acabando: ${f.nome} (${gramas(f.estoqueG)})`, pg: 'filamentos' }); });
    S.insumos.forEach(i => { if (num(i.minimo) > 0 && num(i.estoque) <= num(i.minimo)) a.push({ tipo: num(i.estoque) <= 0 ? 'bad' : 'warn', texto: `Insumo acabando: ${i.nome} (${nf(i.estoque, 2)} ${i.unidade || 'un'})`, pg: 'insumos' }); });
    S.produtos.forEach(p => { if (num(p.estoque) < 0) a.push({ tipo: 'bad', texto: `Estoque negativo: ${p.nome} (${num(p.estoque)})`, pg: 'vendas' }); });
    sugestoesProducao().forEach(s => a.push({ tipo: 'warn', texto: `Abaixo do mínimo: ${s.p.nome} (${nf(s.estoque)} de ${nf(s.minimo)}) — produzir ${nf(s.falta)}`, pg: 'producao' }));
    S.contas.forEach(x => {
      if (x.pagoEm) return;
      const st = situacaoConta(x), desc = x.descricao || 'Conta';
      if (x.tipo === 'pagar') {
        if (st === 'vencida') a.push({ tipo: 'bad', texto: `Conta vencida: ${desc} (${brl(x.valor)}, venceu ${dataBR(x.vencimento)})`, pg: 'contas' });
        else if (st === 'hoje') a.push({ tipo: 'warn', texto: `Conta vence hoje: ${desc} (${brl(x.valor)})`, pg: 'contas' });
      } else if (st === 'vencida') a.push({ tipo: 'warn', texto: `A receber atrasado: ${desc} (${brl(x.valor)}, desde ${dataBR(x.vencimento)})`, pg: 'contas' });
    });
    if (!c.impostoConfirmado) a.push({ tipo: 'warn', texto: `Confirme com o contador a alíquota do Simples (hoje ${pct(c.imposto)})`, pg: 'config' });
    return a;
  });
}
/* Quantos avisos graves por tela, para a bolinha do menu. */
function contagemAvisos() {
  const n = {};
  alertas().forEach(a => { if (a.tipo === 'bad') n[a.pg] = (n[a.pg] || 0) + 1; });
  return n;
}
