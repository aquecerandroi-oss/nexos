/* Nexos — regras de negócio: custo, preço por canal, estoque, fila da impressora, caixa e relatórios.
   As telas chamam estas funções; nenhuma delas mexe em HTML. */
'use strict';

let _memo = { rev: -1 };
function memo(k, fn) {
  if (_memo.rev !== REV) _memo = { rev: REV };
  if (!(k in _memo)) _memo[k] = fn();
  return _memo[k];
}

/* ---------- Falhas ---------- */
const DIAS_FALHA = 90, MIN_G_FALHA = 1000;
/* Taxa de falha usada no custo. Com "usar taxa real" ligado e pelo menos 1 kg produzido nos últimos
   90 dias, vale a taxa medida (gramas perdidos ÷ gramas de peças boas); senão vale a taxa fixa da Configuração. */
function taxaFalha() {
  return memo('falha', () => {
    const lim = addDias(hoje(), -DIAS_FALHA);
    let prodG = 0, falhaG = 0;
    S.ordens.forEach(o => { if (o.status === 'concluido' && (o.fim || '') >= lim) prodG += soma(o.consumo, 'g'); });
    S.falhas.forEach(f => { if ((f.data || '') >= lim) falhaG += num(f.gramas); });
    const realPct = prodG > 0 ? falhaG / prodG * 100 : 0;
    const real = !!S.config.falhaAuto && prodG >= MIN_G_FALHA;
    return { pct: real ? realPct : num(S.config.falha), real, realPct, prodG, falhaG, dias: DIAS_FALHA, minG: MIN_G_FALHA };
  });
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
  const maoObra = num(p.maoObraMin) / 60 * num(c.maoObraHora);
  const ins = (p.insumos || []).map(x => {
    const insumo = byId('insumos', x.insumoId), qtd = num(x.qtd);
    return { insumo, qtd, custo: insumo ? qtd * num(insumo.custo) : 0 };
  });
  const insumos = soma(ins, 'custo'), extras = num(p.extras);
  return {
    itens, ins, pesoG, horas, filamento, energia, maquina, fixos, falhas, falhaPct: tf.pct, falhaReal: tf.real,
    maoObra, insumos, extras,
    custo: filamento + energia + maquina + fixos + falhas + maoObra + insumos + extras,
    semFilamento: !itens.length || itens.some(i => !i.fil),
  };
}
/* Resultado de vender UMA unidade em um canal. preco: usa o preço cadastrado no produto para o canal,
   ou precoForcado quando informado. Taxa fixa é por unidade; frete é o que a Nexos paga por pedido. */
function precoNoCanal(p, canal, precoForcado, custoPronto) {
  const c = S.config;
  const custo = custoPronto != null ? num(custoPronto) : custoProduto(p).custo;
  const preco = precoForcado != null ? num(precoForcado) : num((p.precos || {})[canal.id]);
  const pctCanal = num(canal.pct), fixa = num(canal.fixa), freteCanal = num(canal.frete), imp = num(c.imposto);
  const vende = preco > 0;
  const taxa = vende ? preco * pctCanal / 100 + fixa : 0;
  const frete = vende ? freteCanal : 0;
  const imposto = preco * imp / 100;
  const lucro = vende ? preco - custo - taxa - frete - imposto : 0;
  const den = 1 - (pctCanal + imp + num(c.margem)) / 100;
  return {
    canal, custo, preco, vende, taxa, frete, imposto, lucro,
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
const ORDEM_ATIVA = o => o.status === 'fila' || o.status === 'imprimindo';
function novaOrdem(d) {
  return put('ordens', {
    id: uid(), produtoId: d.produtoId, qtd: Math.max(1, Math.round(num(d.qtd))), data: d.data || hoje(), prazo: d.prazo || '',
    clienteId: d.clienteId || '', obs: d.obs || '', status: 'fila', criadoEm: agoraISO(),
    // posição na fila: sempre maior que todas as existentes, para ordens criadas juntas não empatarem
    ordem: S.ordens.reduce((m, x) => Math.max(m, num(x.ordem) + 1), Date.now()),
  });
}
function iniciarOrdem(o) {
  if (o.status === 'concluido') return;
  o.status = 'imprimindo'; o.inicio = agoraISO();
  put('ordens', o);
}
/* Conclui: baixa filamento e insumos, soma as peças ao estoque de prontas e guarda o que foi consumido. */
function concluirOrdem(o) {
  if (o.status === 'concluido') return;
  const p = byId('produtos', o.produtoId), q = num(o.qtd);
  o.consumo = []; o.insumosUsados = []; o.horasTotal = 0; o.custoUnit = 0;
  if (p) {
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
    p.estoque = num(p.estoque) + q;
    put('produtos', p);
  }
  o.status = 'concluido'; o.fim = hoje(); o.fimEm = agoraISO();
  put('ordens', o);
}
/* Desfaz a conclusão (devolve materiais, tira as peças do estoque) e volta a ordem para a fila ou impressão. */
function reabrirOrdem(o, status = 'fila') {
  if (o.status === 'concluido') {
    (o.consumo || []).forEach(x => { const f = byId('filamentos', x.filamentoId); if (f) { f.estoqueG = arred(num(f.estoqueG) + num(x.g), 2); put('filamentos', f); } });
    (o.insumosUsados || []).forEach(x => { const i = byId('insumos', x.insumoId); if (i) { i.estoque = arred(num(i.estoque) + num(x.qtd), 3); put('insumos', i); } });
    const p = byId('produtos', o.produtoId);
    if (p) { p.estoque = num(p.estoque) - num(o.qtd); put('produtos', p); }
    o.consumo = []; o.insumosUsados = []; o.horasTotal = 0; o.custoUnit = 0; o.fim = ''; o.fimEm = '';
  }
  o.status = status === 'imprimindo' ? 'imprimindo' : 'fila';
  o.inicio = o.status === 'imprimindo' ? (o.inicio || agoraISO()) : '';
  put('ordens', o);
}
/* Edita uma ordem. Se ela já estava concluída e o produto ou a quantidade mudaram, refaz a baixa de estoque.
   Devolve false (sem mudar nada) quando teria de refazer a baixa de um produto que não existe mais. */
function editarOrdem(o, d) {
  const q = Math.max(1, Math.round(num(d.qtd)));
  const mudou = o.status === 'concluido' && (d.produtoId !== o.produtoId || q !== num(o.qtd));
  if (mudou && !byId('produtos', d.produtoId)) return false;
  const fim = o.fim, fimEm = o.fimEm;
  if (mudou) reabrirOrdem(o, 'fila');
  Object.assign(o, { produtoId: d.produtoId, qtd: q, data: d.data || o.data, prazo: d.prazo || '', clienteId: d.clienteId || '', obs: d.obs || '' });
  if (mudou) { concluirOrdem(o); o.fim = fim || o.fim; o.fimEm = fimEm || o.fimEm; }
  put('ordens', o);
}
function excluirOrdem(o) {
  if (o.status === 'concluido') reabrirOrdem(o, 'fila');
  rm('ordens', o.id);
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
/* Horímetro: horas iniciais informadas na Configuração + horas das ordens concluídas. */
const horimetro = () => memo('hor', () => num(S.config.horimetroInicial) + soma(S.ordens.filter(o => o.status === 'concluido'), 'horasTotal'));

/* ---------- Vendas e estoque de peças prontas ---------- */
/* d: { data, produtoId, qtd, canalId, precoUnit, frete (opcional), clienteId, obs }. Guarda custo, taxa,
   imposto e lucro do momento da venda, para os relatórios não mudarem quando a configuração mudar. */
/* Conta de uma venda SEM gravar nada (a mesma usada ao registrar). Serve para a prévia do formulário.
   Devolve { p, canal, qtd, precoUnit, custoUnit, bruto, taxa, frete, imposto, custo, lucro, margem }. */
function simularVenda(d) {
  const p = byId('produtos', d.produtoId);
  const canal = byId('canais', d.canalId) || { id: '', nome: 'Sem canal', pct: 0, fixa: 0, frete: 0 };
  const qtd = Math.max(1, Math.round(num(d.qtd))), precoUnit = num(d.precoUnit);
  const custoUnit = d.custoUnit != null ? num(d.custoUnit) : (p ? custoProduto(p).custo : 0);
  const bruto = precoUnit * qtd;
  const taxa = bruto * num(canal.pct) / 100 + num(canal.fixa) * qtd;
  const frete = d.frete === undefined || d.frete === null || d.frete === '' ? num(canal.frete) : num(d.frete);
  const imposto = bruto * num(S.config.imposto) / 100;
  const custo = custoUnit * qtd, lucro = bruto - custo - taxa - frete - imposto;
  return { p, canal, qtd, precoUnit, custoUnit, bruto, taxa, frete, imposto, custo, lucro, margem: bruto > 0 ? lucro / bruto * 100 : 0 };
}
function registrarVenda(d) {
  const s = simularVenda(d), p = s.p;
  if (p) { p.estoque = num(p.estoque) - s.qtd; put('produtos', p); }
  return put('vendas', {
    id: uid(), data: d.data || hoje(), produtoId: p ? p.id : '', produtoNome: p ? p.nome : (d.produtoNome || ''), qtd: s.qtd,
    canalId: s.canal.id, canalNome: s.canal.nome, precoUnit: s.precoUnit, clienteId: d.clienteId || '', obs: d.obs || '',
    orcamentoId: d.orcamentoId || '', custoUnit: s.custoUnit, bruto: s.bruto, taxa: s.taxa, frete: s.frete, imposto: s.imposto,
    lucro: s.lucro, criadoEm: agoraISO(),
  });
}
function excluirVenda(v) {
  const p = byId('produtos', v.produtoId);
  if (p) { p.estoque = num(p.estoque) + num(v.qtd); put('produtos', p); }
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
  if (f) { f.estoqueG = arred(num(f.estoqueG) + num(x.gramas), 2); put('filamentos', f); }
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

/* ---------- Períodos, caixa e relatórios ---------- */
const noPeriodo = (data, ini, fim) => { const m = String(data || '').slice(0, 7); return m >= ini && m <= fim; };
const ultimosMeses = n => Array.from({ length: n }, (_, i) => addMeses(mesAtual(), i - n + 1));
function resumoVendas(lista) {
  const r = { n: lista.length, qtd: 0, bruto: 0, taxas: 0, frete: 0, imposto: 0, custo: 0, lucro: 0 };
  lista.forEach(v => {
    r.qtd += num(v.qtd); r.bruto += num(v.bruto); r.taxas += num(v.taxa); r.frete += num(v.frete);
    r.imposto += num(v.imposto); r.custo += num(v.custoUnit) * num(v.qtd); r.lucro += num(v.lucro);
  });
  r.margem = r.bruto > 0 ? r.lucro / r.bruto * 100 : 0;
  return r;
}
const vendasDoMes = mes => S.vendas.filter(v => noPeriodo(v.data, mes, mes));
/* Caixa do mês: o que entrou das vendas e tudo que saiu (inclusive compras de material e retiradas). */
function caixaDoMes(mes) {
  const v = resumoVendas(vendasDoMes(mes));
  const lanc = S.lancamentos.filter(l => noPeriodo(l.data, mes, mes));
  const gastosLista = lanc.filter(l => l.tipo !== 'retirada'), retiradasLista = lanc.filter(l => l.tipo === 'retirada');
  const porCategoria = {};
  gastosLista.forEach(l => { const k = l.categoria || 'Outros'; porCategoria[k] = (porCategoria[k] || 0) + num(l.valor); });
  const compras = soma(S.compras.filter(c => noPeriodo(c.data, mes, mes)), 'valor');
  const manutencao = soma(S.manutHist.filter(m => noPeriodo(m.data, mes, mes)), 'custo');
  const gastos = soma(gastosLista, 'valor'), retiradas = soma(retiradasLista, 'valor');
  const liquido = v.bruto - v.taxas - v.frete;
  const resultado = liquido - v.imposto - compras - manutencao - gastos;
  return {
    mes, vendas: v, bruto: v.bruto, taxas: v.taxas, frete: v.frete, liquido, imposto: v.imposto,
    compras, manutencao, gastos, porCategoria, retiradas, resultado, saldo: resultado - retiradas,
    lancamentos: lanc, fixos: soma(gastosLista.filter(l => l.fixo), 'valor'),
  };
}
/* Copia para o mês os gastos marcados como fixos do mês anterior que ainda não existem nele. Devolve quantos copiou. */
function copiarFixos(mes) {
  const ant = addMeses(mes, -1);
  const jaTem = new Set(S.lancamentos.filter(l => noPeriodo(l.data, mes, mes)).map(l => (l.descricao || '') + '|' + (l.categoria || '') + '|' + (l.tipo || '')));
  const fixos = S.lancamentos.filter(l => l.fixo && noPeriodo(l.data, ant, ant) && !jaTem.has((l.descricao || '') + '|' + (l.categoria || '') + '|' + (l.tipo || '')));
  fixos.forEach(l => {
    const dia = String(l.data || '').slice(8, 10) || '01';
    const ultimo = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
    put('lancamentos', { ...l, id: uid(), data: mes + '-' + String(Math.min(Number(dia), ultimo)).padStart(2, '0'), criadoEm: agoraISO() });
  });
  return fixos.length;
}
/* Um ponto por mês: faturamento, custos (tudo que foi descontado), lucro e filamento consumido. */
function serieMensal(n) {
  return ultimosMeses(n).map(mes => {
    const v = resumoVendas(vendasDoMes(mes));
    let consumoG = 0;
    S.ordens.forEach(o => { if (o.status === 'concluido' && noPeriodo(o.fim, mes, mes)) consumoG += soma(o.consumo, 'g'); });
    S.falhas.forEach(f => { if (noPeriodo(f.data, mes, mes)) consumoG += num(f.gramas); });
    return { mes, rotulo: nomeMes(mes), fat: v.bruto, custos: v.bruto - v.lucro, lucro: v.lucro, margem: v.margem, qtd: v.qtd, n: v.n, consumoG };
  });
}
function rankingProdutos(ini, fim) {
  const m = new Map();
  S.vendas.filter(v => noPeriodo(v.data, ini, fim)).forEach(v => {
    const k = v.produtoId || v.produtoNome || '?';
    const r = m.get(k) || { produtoId: v.produtoId, nome: (byId('produtos', v.produtoId) || {}).nome || v.produtoNome || 'Produto excluído', qtd: 0, fat: 0, lucro: 0 };
    r.qtd += num(v.qtd); r.fat += num(v.bruto); r.lucro += num(v.lucro);
    m.set(k, r);
  });
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
  S.ordens.forEach(o => { if (o.status === 'concluido' && noPeriodo(o.fim, ini, fim)) (o.consumo || []).forEach(x => add(x.filamentoId, num(x.g), false)); });
  S.falhas.forEach(f => { if (noPeriodo(f.data, ini, fim)) add(f.filamentoId, num(f.gramas), true); });
  return [...m.values()].sort((a, b) => b.g - a.g);
}

/* ---------- Clientes e orçamentos ---------- */
function totalOrcamento(o) {
  const subtotal = soma(o.itens, i => num(i.qtd) * num(i.precoUnit)), desconto = num(o.desconto);
  return { subtotal, desconto, total: Math.max(0, subtotal - desconto) };
}
const proximoNumeroOrcamento = () => S.orcamentos.reduce((m, o) => Math.max(m, num(o.numero)), 0) + 1;
function historicoCliente(id) {
  const vendas = S.vendas.filter(v => v.clienteId === id).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const orcamentos = S.orcamentos.filter(o => o.clienteId === id).sort((a, b) => num(b.numero) - num(a.numero));
  const ordens = S.ordens.filter(o => o.clienteId === id).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  return { vendas, orcamentos, ordens, total: soma(vendas, 'bruto'), pecas: soma(vendas, 'qtd'), ultima: vendas[0] ? vendas[0].data : '' };
}

/* ---------- Avisos ---------- */
/* Lista do que precisa de atenção: [{ tipo: 'bad' | 'warn', texto, pg }] */
function alertas() {
  return memo('alertas' + new Date().toISOString().slice(0, 13), () => {   // refaz a cada hora, pois depende do relógio
    const a = [], c = S.config;
    S.ordens.filter(ORDEM_ATIVA).forEach(o => {
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
    return a;
  });
}
/* Quantos avisos graves por tela, para a bolinha do menu. */
function contagemAvisos() {
  const n = {};
  alertas().forEach(a => { if (a.tipo === 'bad') n[a.pg] = (n[a.pg] || 0) + 1; });
  return n;
}
