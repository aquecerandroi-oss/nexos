/* Nexos — telas comerciais: Vendas e estoque (pedidos e devoluções), Orçamentos e Clientes.
   Aqui só se monta a tela: as contas de pedido, devolução, estoque e contas a receber ficam em calc.js.
   Tudo que é global neste arquivo começa com "com".
   Outros arquivos podem chamar comNovaVenda(produtoId) e comEditarCliente(id). */
'use strict';

let comMes = mesAtual();       // mês mostrado em "Vendas e estoque"
let comBusca = '';             // texto da busca de clientes (continua valendo depois de um render)
let comTituloAba = null;       // título da aba, guardado enquanto um orçamento é impresso

/* ---------- Ajudantes ---------- */
const comSituacaoOrc = { aberto: ['Aberto', 'info'], aprovado: ['Aprovado', 'ok'], recusado: ['Recusado', 'mute'] };
const comSituacaoOrdem = { fila: ['Na fila', 'mute'], imprimindo: ['Imprimindo', 'info'], acabamento: ['Em acabamento', 'info'], concluido: ['Concluída', 'ok'] };
const comSituacaoConta = { paga: ['Recebida', 'ok'], vencida: ['Atrasada', 'bad'], hoje: ['Vence hoje', 'warn'], aberta: ['Em aberto', 'info'] };
const comMotivos = ['Defeito', 'Chegou quebrado', 'Arrependimento', 'Produto errado', 'Outro'];
const comSemCanal = { id: '', nome: 'Sem canal', pct: 0, fixa: 0, frete: 0 };
const comPlural = (n, um, varios) => nf(n) + ' ' + (num(n) === 1 ? um : varios);
const comSinal = v => (num(v) < 0 ? 'neg' : num(v) > 0 ? 'pos' : '');
const comMenos = v => brl(num(v) > 0 ? -num(v) : 0);                       // valor que sai da conta, com sinal de menos
const comMais = v => (num(v) > 0 ? '+' : '') + brl(v);                     // valor que volta para a conta, com sinal de mais
const comNorm = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();    // minúsculas e sem acento
const comPorNome = lista => lista.slice().sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
const comStatusOrc = o => (o.status === 'aprovado' || o.status === 'recusado' ? o.status : 'aberto');
const comSeloOrc = o => selo(...comSituacaoOrc[comStatusOrc(o)]);
const comClienteOrc = o => (byId('clientes', o.clienteId) || {}).nome || o.clienteNome || '';
const comDescItem = i => i.descricao || (byId('produtos', i.produtoId) || {}).nome || 'Item';
/* Nome de um item de pedido: o do cadastro, se o produto ainda existe; senão o que ficou guardado no pedido. */
const comNomeItem = i => (byId('produtos', i.produtoId) || {}).nome || i.produtoNome || 'Produto excluído';
/* "Pedido nº 12" (venda antiga, sem número: "Pedido de 05/11/2026"). É texto puro: passe por esc() antes de ir para o HTML. */
const comTituloPedido = v => (num(v.numero) > 0 ? 'Pedido nº ' + v.numero : 'Pedido de ' + dataBR(v.data));
/* O que o canal cobra, em palavras: "20% + R$ 4,00 por peça". */
const comRegraCanal = c => [num(c.pct) ? pct(c.pct) : '', num(c.fixa) ? brl(c.fixa) + ' por peça' : ''].filter(Boolean).join(' + ');
/* Coluna de nome nas tabelas largas: no celular a tabela rola de lado e o nome não fica espremido palavra por palavra. */
const comColNome = ' style="min-width:150px"';
/* Botão de linha de tabela. O id vai em data-id (nunca dentro do código do onclick). cls: 'ghost' | 'danger' | '' */
const comBotao = (rotulo, fn, id, cls = 'ghost') =>
  `<button type="button" class="btn${cls ? ' ' + cls : ''} sm" data-id="${esc(id)}" onclick="${fn}(this.dataset.id)">${rotulo}</button>`;
/* Linha de uma prévia (div.calc). cls pinta só o valor: 'pos' | 'neg' | 'aviso'. tot: linha de total. */
const comLinha = (rotulo, valor, cls = '', tot = false) =>
  `<div${tot ? ' class="tot"' : ''}><span>${rotulo}</span><b>${cls ? `<span class="${cls}">${valor}</span>` : valor}</b></div>`;
/* Subtítulo dentro de uma prévia. */
const comH4 = t => `<h4 style="margin-top:14px">${t}</h4>`;
/* Aviso em amarelo embaixo de uma prévia (recebe HTML: o que vem dos dados já passou por esc()). */
const comAviso = t => `<p class="hint"><span class="aviso">${t}</span></p>`;
/* A tela de vendas passa a mostrar o mês desta data (AAAA-MM-DD). */
function comIrParaMes(data) {
  if (/^\d{4}-(0[1-9]|1[0-2])-/.test(String(data || ''))) comMes = String(data).slice(0, 7);
}
/* Mostra o campo de vencimento só quando o pagamento fica "A receber". campo: nome do select de pagamento. */
function comMostrarVencimento(form, campo) {
  const pag = form && form.elements[campo], venc = form && form.elements.vencimento;
  if (!pag || !venc || !venc.parentElement) return;
  const mostra = pag.value === 'receber';
  venc.parentElement.hidden = !mostra;
  venc.disabled = !mostra;                                     // escondido, o campo não atrapalha a conferência ao salvar
}

/* ---------- Contas a receber ligadas a pedidos e orçamentos ---------- */
/* Contas do próprio pedido: saem junto quando ele é excluído. */
const comContasDaVenda = v => S.contas.filter(c => c.origem === 'venda' && c.origemId === v.id);
/* Para os detalhes do pedido: as contas a receber dele e, se veio de um orçamento, o sinal desse orçamento. */
const comContasLigadas = v => S.contas.filter(c => c.tipo === 'receber' && ((c.origem === 'venda' && c.origemId === v.id) ||
  (!!v.orcamentoId && c.origem === 'orcamento' && c.origemId === v.orcamentoId)))
  .sort((a, b) => String(a.vencimento || '').localeCompare(String(b.vencimento || '')));
/* Quanto o cliente ainda deve do pedido: as contas dele em aberto e o sinal em aberto do orçamento de onde ele veio. */
const comAReceberPedido = v => soma(comContasLigadas(v).filter(c => !c.pagoEm), 'valor');
/* Conta do sinal de um orçamento (lançada ao aprovar), se existir. */
const comContaSinal = o => S.contas.find(c => c.tipo === 'receber' && c.origem === 'orcamento' && c.origemId === o.id && c.parte === 'sinal');
/* Sinal que existe de verdade em Contas para o orçamento: o recebido vale pelo que entrou; o em aberto, pelo valor da conta
   (pagamento parcial do sinal cria uma conta "(restante)" com a mesma ligação, que também conta). */
const comSinalEmContas = o => soma(S.contas.filter(c => c.tipo === 'receber' && c.origem === 'orcamento' && c.origemId === o.id && c.parte === 'sinal'),
  c => (c.pagoEm && num(c.valorPago) > 0 ? num(c.valorPago) : num(c.valor)));
const comDescSinal = o => { const nome = comClienteOrc(o); return `Sinal do orçamento nº ${o.numero}${nome ? ' — ' + nome : ''}`; };

/* ---------- Tela: Vendas e estoque ---------- */
/* Gancho da integração com a Shopee (arquivo à parte): o botão só aparece quando ela está carregada. */
function comBotaoShopee() {
  try { return `${typeof shopeeBotaoVendas === 'function' ? shopeeBotaoVendas() : ''}`; }
  catch (e) { console.error(e); return ''; }
}
VIEWS.vendas = function () {
  /* Mês: a lista de meses da base funciona em qualquer navegador; sem ela, vale o campo de mês do próprio navegador. */
  const filtroMes = typeof seletorMes === 'function' ? seletorMes(comMes, 'comTrocarMes')
    : `<div><label for="comMesIn">Mês</label><input id="comMesIn" type="month" value="${esc(comMes)}" placeholder="AAAA-MM" onchange="comTrocarMes(this.value)"></div>`;
  return head('Vendas e estoque', 'Peças prontas para vender e os pedidos do mês, com o resultado de cada um',
    `${comBotaoShopee()}<button class="btn" onclick="comNovaVenda()">+ Novo pedido</button>`) + `
    <div class="filtros">${filtroMes}</div>
    <div class="cards" id="comCartoes">${comCartoesMes()}</div>
    ${comPecasProntas()}
    <div class="panel" id="comPainelMes">${comVendasMes()}</div>`;
};
/* Troca o mês e refaz só o que depende dele (cartões e tabela de pedidos). O campo do mês continua
   na tela, então o seletor não fecha nem perde o foco a cada toque. */
function comTrocarMes(valor) {
  valor = String(valor || '').trim();
  const br = /^(\d{1,2})\/(\d{4})$/.exec(valor);              // mês digitado à mão: aceita 11/2026
  if (br) valor = br[2] + '-' + br[1].padStart(2, '0');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(valor)) return;         // vazio ou incompleto: a tela fica no mês em que estava
  comMes = valor;
  const cartoes = $('#comCartoes'), painel = $('#comPainelMes');
  if (!cartoes || !painel) { render(); return; }
  cartoes.innerHTML = comCartoesMes();
  painel.innerHTML = comVendasMes();
}
function comCartoesMes() {
  const r = resumoVendas(vendasDoMes(comMes));
  return kpi('Faturamento', brl(r.bruto)) +
    kpi('Lucro', brl(r.lucro), 'margem ' + pct(r.margem), comSinal(r.lucro)) +
    kpi('Taxas e frete', brl(r.taxas + r.frete), 'imposto ' + brl(r.imposto)) +
    kpi('Peças vendidas', nf(r.qtd), comPlural(r.n, 'pedido', 'pedidos')) +
    (r.devolvidas > 0 ? kpi('Devoluções', comPlural(r.devolvidas, 'peça', 'peças'), 'perda de ' + brl(r.perda), 'aviso') : '');
}
function comPecasProntas() {
  // entram as peças em estoque e os produtos com estoque mínimo (mesmo zerados: estão abaixo do mínimo)
  const prontos = comPorNome(S.produtos.filter(p => num(p.estoque) !== 0 || num(p.estoqueMinimo) > 0));
  if (!prontos.length) {
    return `<div class="panel"><h2>Peças prontas</h2>${vazio('Nenhuma peça pronta. Conclua uma ordem na Produção.',
      '<a class="btn ghost" href="#producao">Ir para a Produção</a>')}</div>`;
  }
  const temFoto = prontos.some(p => p.foto && p.foto.path), podeProduzir = typeof opNovaOrdem === 'function';
  let pecas = 0, valor = 0, positivos = 0;                     // o total conta só o que existe de verdade (estoque negativo fica de fora)
  const linhas = prontos.map(p => {
    const est = num(p.estoque), min = num(p.estoqueMinimo), abaixo = min > 0 && est < min;
    const custo = est > 0 ? custoProduto(p).custo * est : 0;
    if (est > 0) { pecas += est; valor += custo; positivos++; }
    const foto = p.foto && p.foto.path ? `<img class="mini" data-path="${esc(p.foto.path)}" alt="">`
      : temFoto ? '<span style="width:40px;flex:none" aria-hidden="true"></span>' : '';
    return `<tr>
      <td><div class="comfoto">${foto}<div><b>${esc(p.nome)}</b>${p.categoria ? `<small>${esc(p.categoria)}</small>` : ''}</div></div></td>
      <td class="right num${est < 0 ? ' neg' : ''}">${nf(est)}${est < 0 ? '<small>vendeu mais do que tinha</small>' : ''}</td>
      <td class="right num">${min > 0 ? nf(min) : '—'}${abaixo ? `<small>${selo('Abaixo do mínimo', 'warn')}</small>` : ''}</td>
      <td class="right num">${est > 0 ? brl(custo) : '—'}</td>
      <td><div class="rowbtns">${abaixo && podeProduzir ? comBotao('Produzir', 'comProduzir', p.id) : ''}${comBotao('Vender', 'comNovaVenda', p.id, '')}</div></td></tr>`;
  }).join('');
  const total = positivos > 1
    ? `<tr class="total"><td>Total</td><td class="right num">${nf(pecas)}</td><td></td><td class="right num">${brl(valor)}</td><td></td></tr>` : '';
  return `<div class="panel"><h2>Peças prontas</h2>${tabela(['Produto', { t: 'Em estoque', r: 1 }, { t: 'Mínimo', r: 1 },
    { t: 'Valor a preço de custo', r: 1 }, ''], linhas + total)}</div>`;
}
/* Produto abaixo do mínimo: abre a ordem de produção (o formulário mora em views-operacao.js). */
function comProduzir(id) { if (typeof opNovaOrdem === 'function') opNovaOrdem(id); }
/* Miolo do painel "Pedidos de <mês>": título, tabela com os pedidos mais recentes primeiro e a linha de totais. */
function comVendasMes() {
  const mes = esc(nomeMesLongo(comMes));
  const lista = vendasDoMes(comMes).sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) ||
    String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
  if (!lista.length) {
    return `<h2>Pedidos de ${mes}</h2>` + vazio(`Nenhum pedido em ${mes}.`, '<button class="btn" onclick="comNovaVenda()">+ Novo pedido</button>');
  }
  const r = resumoVendas(lista);
  let receberMes = 0;
  const linhas = lista.map(v => {
    const receber = comAReceberPedido(v);
    receberMes += receber;
    const atrasado = receber > 0 && comContasLigadas(v).some(c => !c.pagoEm && situacaoConta(c) === 'vencida');
    const situacao = [num(v.devolvido) > 0 ? selo('Devolução', 'warn') : '',
      receber > 0 ? selo('A receber ' + brl(receber), atrasado ? 'bad' : 'info') : ''].filter(Boolean).join(' ');
    return `<tr>
      <td class="num">${num(v.numero) > 0 ? `<b>${esc(v.numero)}</b>` : '—'}</td>
      <td class="num">${esc(dataBR(v.data))}</td>
      <td${comColNome}>${esc(resumoItensVenda(v))}<small>${comPlural(v.qtd, 'peça', 'peças')}${v.obs ? ' · ' + esc(v.obs) : ''}</small></td>
      <td>${esc(v.canalNome || 'Sem canal')}</td>
      <td>${nomeDe('clientes', v.clienteId)}</td>
      <td class="right num">${brl(v.bruto)}</td>
      <td class="right num">${brl(v.taxa)}</td>
      <td class="right num">${brl(v.frete)}</td>
      <td class="right num">${brl(v.imposto)}</td>
      <td class="right num ${comSinal(v.lucro)}">${brl(v.lucro)}</td>
      <td>${situacao || '<span class="muted">—</span>'}</td>
      <td><div class="rowbtns">${comBotao('Detalhes', 'comDetalhesVenda', v.id)}${comBotao('Excluir', 'comExcluirVenda', v.id, 'danger')}</div></td></tr>`;
  }).join('');
  const total = `<tr class="total"><td colspan="5">Total do mês</td>
      <td class="right num">${brl(r.bruto)}</td>
      <td class="right num">${brl(r.taxas)}</td>
      <td class="right num">${brl(r.frete)}</td>
      <td class="right num">${brl(r.imposto)}</td>
      <td class="right num ${comSinal(r.lucro)}">${brl(r.lucro)}</td>
      <td>${receberMes > 0 ? selo('A receber ' + brl(receberMes), 'info') : ''}</td><td></td></tr>`;
  return `<h2>Pedidos de ${mes} <small>${comPlural(r.n, 'pedido', 'pedidos')}</small></h2>` +
    tabela(['Nº', 'Data', 'Itens', 'Canal', 'Cliente', { t: 'Total', r: 1 }, { t: 'Taxas', r: 1 }, { t: 'Frete', r: 1 },
      { t: 'Imposto', r: 1 }, { t: 'Lucro', r: 1 }, 'Situação', ''], linhas + total);
}

/* ---------- Novo pedido ---------- */
/* Preço do produto no canal (ou '' quando ele não tem preço lá), pronto para ir no campo. */
function comPrecoDoCanal(produtoId, canalId) {
  const p = byId('produtos', produtoId), preco = p ? num((p.precos || {})[canalId]) : 0;
  return preco > 0 ? preco : '';
}
const comItemPedido = i => ({ produtoId: i.produtoId, qtd: i.qtd, precoUnit: i.precoUnit });
/* Produtos sem peças prontas suficientes para os itens (o mesmo produto em duas linhas soma): [{ p, qtd, estoque }] */
function comFaltasEstoque(itens) {
  const m = new Map();
  (itens || []).forEach(i => {
    const p = byId('produtos', i.produtoId);
    if (p) m.set(p, (m.get(p) || 0) + Math.max(1, Math.round(num(i.qtd))));
  });
  return [...m].map(([p, qtd]) => ({ p, qtd, estoque: num(p.estoque) })).filter(x => x.qtd > x.estoque);
}
/* Dicas para os itens ainda sem preço: o preço cadastrado no canal ou, sem ele, o sugerido para a margem do canal. */
function comDicasPreco(itens, canal) {
  const vistos = new Set(), dicas = [];
  itens.forEach(i => {
    if (!i.p || i.precoUnit > 0 || vistos.has(i.p.id)) return;
    vistos.add(i.p.id);
    const nome = esc(i.p.nome), cadastrado = num((i.p.precos || {})[canal.id]), r = precoNoCanal(i.p, canal);
    dicas.push(cadastrado > 0 ? `${nome}: o preço cadastrado em ${esc(canal.nome)} é ${brl(cadastrado)}.`
      : r.sugerido > 0 ? `${nome} não tem preço cadastrado em ${esc(canal.nome)}. Preço sugerido: ${brl(r.sugerido)} (margem de ${pct(r.margemAlvo)}).`
        : `Informe o preço de ${nome}.`);
  });
  return dicas;
}
/* Formulário de pedido (um ou mais produtos). produtoId (opcional) já deixa o produto escolhido na primeira linha. */
function comNovaVenda(produtoId) {
  if (!S.produtos.length) {
    toast('Cadastre um produto antes de registrar um pedido.');
    ir('produtos');
    return;
  }
  const produtos = comPorNome(S.produtos);
  const prodIni = byId('produtos', produtoId) ? produtoId : produtos.length === 1 ? produtos[0].id : '';
  const canalIni = S.canais.length ? S.canais[0].id : '', canalObj = byId('canais', canalIni);
  let freteDigitado = false;                                   // frete que a pessoa preencheu à mão não muda sozinho
  openForm({
    title: 'Novo pedido',
    wide: true,
    fields: [
      { k: 'data', label: 'Data', type: 'date', req: true },
      { k: 'canalId', label: 'Canal de venda', type: 'select',
        options: S.canais.length ? S.canais.map(c => [c.id, c.nome]) : [['', 'Sem canal']] },
      { k: 'clienteId', label: 'Cliente', type: 'select', full: true,
        options: [['', '— sem cliente —'], ...comPorNome(S.clientes).map(c => [c.id, c.nome])] },
      { k: 'itens', label: 'Itens do pedido', type: 'rows', min: 1, add: '+ Item', novo: () => ({ qtd: 1 }),
        hint: 'O preço vem do cadastro do produto no canal escolhido. Mude se neste pedido foi diferente.',
        cols: [
          { k: 'produtoId', label: 'Produto', type: 'select', w: '2fr',
            options: [['', '— escolha o produto —'], ...produtos.map(p => [p.id, `${p.nome} (${nf(p.estoque)} em estoque)`])] },
          { k: 'qtd', label: 'Qtd', type: 'number', step: 1, min: 1, w: '.6fr' },
          { k: 'precoUnit', label: 'Preço un. (R$)', type: 'number', w: '.9fr' },
        ] },
      { k: 'frete', label: 'Frete pago pela Nexos neste pedido (R$)', type: 'number', hint: 'Já vem com o frete do canal. Mude se neste pedido foi diferente.' },
      { k: 'pagamento', label: 'Pagamento', type: 'select', options: [['recebido', 'Já recebido'], ['receber', 'A receber']] },
      { k: 'vencimento', label: 'Vencimento (quando o cliente vai pagar)', type: 'date', hint: 'O valor fica em Contas a receber até você marcar como recebido.' },
      { k: 'obs', label: 'Observação', type: 'textarea', rows: 2 },
    ],
    vals: {
      data: hoje(), canalId: canalIni, clienteId: '', itens: [{ produtoId: prodIni, qtd: 1, precoUnit: comPrecoDoCanal(prodIni, canalIni) }],
      frete: canalObj ? num(canalObj.frete) : 0, pagamento: 'recebido', vencimento: addDias(hoje(), 7), obs: '',
    },
    change(el, form) {
      const col = el.dataset ? el.dataset.col : '';
      if (col === 'precoUnit') {                               // preço digitado não muda mais sozinho (apagou: volta a mudar)
        if (el.value.trim()) el.dataset.digitado = '1'; else delete el.dataset.digitado;
        return;
      }
      if (col === 'produtoId') {                               // produto escolhido: preço dele no canal e quantidade 1
        const linha = el.closest('.row');
        if (!linha) return;
        const preco = $('[data-col="precoUnit"]', linha), qtd = $('[data-col="qtd"]', linha);
        preco.value = paraCampo(comPrecoDoCanal(el.value, form.elements.canalId.value));
        delete preco.dataset.digitado;
        validarNumero(preco);
        if (!(numTexto(qtd.value) >= 1)) { qtd.value = '1'; validarNumero(qtd); }
        return;
      }
      if (el.name === 'frete') { freteDigitado = el.value.trim() !== ''; return; }
      if (el.name === 'pagamento') { comMostrarVencimento(form, 'pagamento'); return; }
      if (el.name !== 'canalId') return;
      // canal trocado: refaz o preço das linhas que a pessoa não digitou e o frete, se ela não mudou
      $$('[data-rows="itens"] .row', form).forEach(linha => {
        const preco = $('[data-col="precoUnit"]', linha), prod = $('[data-col="produtoId"]', linha);
        if (!preco || !prod || !prod.value || preco.dataset.digitado) return;
        preco.value = paraCampo(comPrecoDoCanal(prod.value, el.value));
        validarNumero(preco);
      });
      if (!freteDigitado) {
        const c = byId('canais', el.value);
        form.elements.frete.value = paraCampo(c ? num(c.frete) : 0);
        validarNumero(form.elements.frete);
      }
    },
    preview(d) {
      const linhas = (d.itens || []).filter(i => byId('produtos', i.produtoId));
      if (!linhas.length) return '<div class="calc"><div><span>Escolha o produto para ver o resultado do pedido.</span></div></div>';
      const canal = byId('canais', d.canalId) || comSemCanal, regra = comRegraCanal(canal);
      // a conta vem de simularVenda (calc.js), a mesma que registrarVenda grava
      const s = simularVenda({ canalId: canal.id, frete: d.frete, itens: linhas.map(comItemPedido) });
      const avisos = [];
      if (linhas.some(i => !Number.isInteger(i.qtd) || i.qtd < 1)) avisos.push('Confira as quantidades: use números inteiros, a partir de 1.');
      comFaltasEstoque(linhas).forEach(f => avisos.push(`${esc(f.p.nome)}: há ${nf(f.estoque)} em estoque e o pedido tem ${nf(f.qtd)}. O estoque vai ficar negativo.`));
      const receber = d.pagamento === 'receber' && s.bruto > 0;
      return `<div class="calc">
        ${s.itens.map(i => comLinha(`${nf(i.qtd)}× ${esc(i.produtoNome)} · ${i.precoUnit > 0 ? brl(i.precoUnit) + ' cada' : '<span class="aviso">sem preço</span>'}`, brl(i.bruto))).join('')}
        ${comLinha('Total do pedido', brl(s.bruto), '', true)}
        ${comLinha('Taxa do canal' + (regra ? ` (${regra})` : ''), comMenos(s.taxa))}
        ${comLinha('Frete', comMenos(s.frete))}
        ${comLinha(`Imposto (${pct(S.config.imposto)})`, comMenos(s.imposto))}
        ${comLinha('Custo das peças', comMenos(s.custo))}
        ${comLinha(`Lucro (margem ${pct(s.margem)})`, brl(s.lucro), comSinal(s.lucro), true)}
        ${receber ? comLinha('Fica em Contas a receber', `${brl(s.bruto)} · ${d.vencimento ? 'vence ' + esc(dataBR(d.vencimento)) : 'sem vencimento'}`, 'aviso') : ''}
      </div>${avisos.map(comAviso).join('')}${comDicasPreco(s.itens, canal).map(t => `<p class="hint">${t}</p>`).join('')}`;
    },
    save(d) {
      const linhas = (d.itens || []).filter(i => i.produtoId || i.precoUnit > 0);     // linha sem produto e sem preço não conta
      if (linhas.some(i => !byId('produtos', i.produtoId))) { toast('Escolha o produto de cada item (ou tire a linha vazia no ✕).', 'bad'); return false; }
      if (!linhas.length) { toast('Inclua pelo menos um item com produto e preço.', 'bad'); return false; }
      if (linhas.some(i => !Number.isInteger(i.qtd) || i.qtd < 1)) { toast('A quantidade de cada item precisa ser um número inteiro, a partir de 1.', 'bad'); return false; }
      if (!linhas.some(i => i.precoUnit > 0)) { toast('Informe o preço por unidade dos itens.', 'bad'); return false; }
      if (d.pagamento === 'receber' && !d.vencimento) { toast('Informe quando o cliente vai pagar (vencimento).', 'bad'); return false; }
      const semPreco = [...new Set(linhas.filter(i => !(i.precoUnit > 0)).map(i => byId('produtos', i.produtoId).nome))];
      if (semPreco.length && !confirmar(`Sem preço: ${semPreco.join(', ')}.\n\n${semPreco.length === 1 ? 'Esse item entra' : 'Esses itens entram'} de graça no pedido. Registrar mesmo assim?`)) return false;
      const faltas = comFaltasEstoque(linhas);
      if (faltas.length && !confirmar(`Estoque insuficiente:\n${faltas.map(f => `• ${f.p.nome}: há ${nf(f.estoque)} em estoque e o pedido tem ${nf(f.qtd)}`).join('\n')}\n\nRegistrar mesmo assim? O estoque vai ficar negativo.`)) return false;
      const cli = byId('clientes', d.clienteId);
      const v = registrarVenda({ data: d.data, canalId: d.canalId, frete: d.frete, clienteId: cli ? cli.id : '', obs: d.obs, itens: linhas.map(comItemPedido) });
      const receber = d.pagamento === 'receber' && num(v.bruto) > 0;
      if (receber) {
        criarConta({ tipo: 'receber', descricao: `Pedido nº ${v.numero}${cli ? ' — ' + cli.nome : ''}`, valor: v.bruto, vencimento: d.vencimento,
          clienteId: cli ? cli.id : '', origem: 'venda', origemId: v.id, parte: 'saldo' });
      }
      comIrParaMes(d.data);                                    // a tela de vendas abre no mês deste pedido
      toast(`Pedido nº ${v.numero} registrado.${receber ? ` ${brl(v.bruto)} ficou em Contas a receber.` : ''}`);
    },
  });
  if (FORM && FORM.form) comMostrarVencimento(FORM.form, 'pagamento');
}

/* ---------- Detalhes do pedido e devoluções ---------- */
function comDetalhesVenda(id) {
  const v = byId('vendas', id);
  if (!v) { toast('Este pedido não existe mais.', 'bad'); return; }
  const its = itensVenda(v), devs = Array.isArray(v.devolucoes) ? v.devolucoes : [];
  const cli = byId('clientes', v.clienteId), orc = byId('orcamentos', v.orcamentoId);
  const info = [esc(dataBR(v.data)), esc(v.canalNome || 'Sem canal'), cli ? esc(cli.nome) : 'Sem cliente',
    orc ? 'Orçamento nº ' + esc(orc.numero) : '', v.shopeeOrderSn ? 'Shopee ' + esc(v.shopeeOrderSn) : ''].filter(Boolean).join(' · ');
  const devolvido = soma(its, 'devolvido');
  const tabItens = tabela(['Produto', { t: 'Vendidas', r: 1 }, { t: 'Devolvidas', r: 1 }, { t: 'Preço un.', r: 1 }, { t: 'Total', r: 1 }, { t: 'Lucro', r: 1 }],
    its.map(i => `<tr>
      <td${comColNome}><b>${esc(comNomeItem(i))}</b></td>
      <td class="right num">${nf(i.qtdOriginal)}</td>
      <td class="right num${i.devolvido ? ' aviso' : ''}">${i.devolvido ? nf(i.devolvido) : '—'}</td>
      <td class="right num">${brl(i.precoUnit)}</td>
      <td class="right num">${brl(i.bruto)}</td>
      <td class="right num ${comSinal(i.lucro)}">${brl(i.lucro)}</td></tr>`).join(''));
  const tabDev = devs.length ? tabela(['Data', 'Item', { t: 'Qtd', r: 1 }, 'Motivo', { t: 'Gasto extra', r: 1 }, ''], devs.map(x => {
    const it = its[num(x.item)];
    const desfazer = typeof x.id === 'string' && x.id
      ? `<button type="button" class="btn ghost sm" data-id="${esc(v.id)}" data-dev="${esc(x.id)}" onclick="comDesfazerDevolucao(this.dataset.id, this.dataset.dev)">Desfazer</button>` : '';
    return `<tr>
      <td class="num">${esc(dataBR(x.data)) || '—'}</td>
      <td>${it ? esc(comNomeItem(it)) : 'Item excluído'}</td>
      <td class="right num">${nf(x.qtd)}</td>
      <td>${esc(x.motivo) || '—'}</td>
      <td class="right num">${num(x.custoExtra) > 0 ? brl(x.custoExtra) : '—'}</td>
      <td><div class="rowbtns">${desfazer}</div></td></tr>`;
  }).join('')) : '';
  const contas = comContasLigadas(v);
  const tabContas = contas.length ? tabela(['Conta', { t: 'Valor', r: 1 }, 'Vencimento', 'Situação'], contas.map(c => {
    const s = comSituacaoConta[situacaoConta(c)] || comSituacaoConta.aberta;
    return `<tr>
      <td>${esc(c.descricao || 'Conta a receber')}</td>
      <td class="right num">${brl(c.pagoEm && num(c.valorPago) > 0 ? c.valorPago : c.valor)}</td>
      <td class="num">${esc(dataBR(c.vencimento)) || '—'}</td>
      <td>${selo(s[0], s[1])}${c.pagoEm ? `<small>em ${esc(dataBR(c.pagoEm))}</small>` : ''}</td></tr>`;
  }).join('')) : '';
  const t = { bruto: soma(its, 'bruto'), taxa: soma(its, 'taxa'), frete: soma(its, 'frete'), imposto: soma(its, 'imposto'),
    custo: soma(its, 'custo'), extra: soma(its, 'custoExtra'), lucro: soma(its, 'lucro'), perda: soma(its, 'perda') };
  const receber = comAReceberPedido(v), podeDevolver = its.some(i => i.qtd > 0);
  abrirModal(`
    <p class="muted">${info}</p>
    ${v.obs ? `<p class="txt-sm mt">${esc(v.obs)}</p>` : ''}
    <h2 class="mt">Itens</h2>${tabItens}
    ${devolvido ? '<p class="hint">Total e lucro já descontam as peças devolvidas.</p>' : ''}
    ${devs.length ? `<h2 class="mt">Devoluções</h2>${tabDev}` : ''}
    ${contas.length ? `<div class="panel-head mt"><h2>Contas a receber</h2>${VIEWS.contas ? '<a class="btn ghost sm" href="#contas">Ver em Contas</a>' : ''}</div>${tabContas}` : ''}
    <div class="calc">
      ${comLinha('Total do pedido', brl(t.bruto))}
      ${comLinha('Taxa do canal', comMenos(t.taxa))}
      ${comLinha('Frete', comMenos(t.frete))}
      ${comLinha('Imposto', comMenos(t.imposto))}
      ${comLinha(devolvido ? 'Custo das peças (inclusive as devolvidas)' : 'Custo das peças', comMenos(t.custo))}
      ${t.extra > 0 ? comLinha('Gastos com devolução', comMenos(t.extra)) : ''}
      ${comLinha(`Lucro (margem ${pct(t.bruto > 0 ? t.lucro / t.bruto * 100 : 0)})`, brl(t.lucro), comSinal(t.lucro), true)}
      ${devolvido ? comLinha('Perda com devoluções (peças devolvidas + gastos)', brl(t.perda), 'neg') : ''}
      ${receber > 0 ? comLinha('Ainda a receber', brl(receber), 'aviso') : ''}
    </div>
    <div class="actions">
      ${podeDevolver ? `<button type="button" class="btn ghost" data-id="${esc(v.id)}" onclick="comNovaDevolucao(this.dataset.id)">Registrar devolução</button>` : ''}
      <button type="button" class="btn danger" data-id="${esc(v.id)}" onclick="comExcluirVenda(this.dataset.id)">Excluir pedido</button>
      <button type="button" class="btn ghost" onclick="fecharModal()">Fechar</button>
    </div>`, { title: comTituloPedido(v), wide: true });
}
/* Cópia do pedido com uma devolução a mais, só para a prévia: nada é gravado. */
const comCopiaComDevolucao = (v, dev) => ({ ...v, devolucoes: [...(Array.isArray(v.devolucoes) ? v.devolucoes : []), { id: '', ...dev }] });
/* Formulário de devolução: a venda das peças é desfeita e o custo delas vira perda (a peça não volta ao estoque). */
function comNovaDevolucao(id) {
  const v = byId('vendas', id);
  if (!v) { toast('Este pedido não existe mais.', 'bad'); return; }
  const opcoes = itensVenda(v).map((i, k) => (i.qtd > 0 ? [String(k), `${comNomeItem(i)} (${comPlural(i.qtd, 'vendida', 'vendidas')})`] : null)).filter(Boolean);
  if (!opcoes.length) { toast('Todas as peças deste pedido já foram devolvidas.'); return; }
  const mes = /^\d{4}-(0[1-9]|1[0-2])/.test(String(v.data || '')) ? nomeMesLongo(String(v.data).slice(0, 7)) : '';
  const posicao = valor => (valor === '' ? -1 : Math.round(num(valor)));      // posição do item no pedido (-1: nenhum)
  openForm({
    title: 'Devolução — ' + comTituloPedido(v),
    registro: ['vendas', v.id],                       // pedido mudado em outro aparelho com a janela aberta: não grava em cima
    fields: [
      // o nome não pode ser "item": form.elements.item é uma função do navegador, não o campo
      { k: 'itemDevolvido', label: 'Item devolvido', type: 'select', full: true, options: opcoes.length > 1 ? [['', '— escolha o item —'], ...opcoes] : opcoes },
      { k: 'qtd', label: 'Quantas peças voltaram', type: 'number', step: 1, min: 1 },
      { k: 'data', label: 'Data da devolução', type: 'date', req: true },
      { k: 'motivo', label: 'Motivo', type: 'select', options: comMotivos.map(m => [m, m]) },
      { k: 'custoExtra', label: 'Gasto extra (R$)', type: 'number', hint: 'Frete de volta, embalagem e outros gastos com a devolução. Deixe vazio se não houve.' },
    ],
    vals: { itemDevolvido: opcoes.length === 1 ? opcoes[0][0] : '', qtd: 1, data: hoje(), motivo: comMotivos[0], custoExtra: '' },
    saveLabel: 'Registrar devolução',
    preview(d) {
      const atual = byId('vendas', id) || v, antes = itensVenda(atual), k = posicao(d.itemDevolvido), it = antes[k];
      if (!it || !(it.qtd > 0)) return '<div class="calc"><div><span>Escolha o item devolvido.</span></div></div>';
      if (!Number.isInteger(d.qtd) || d.qtd < 1 || d.qtd > it.qtd) {
        return `<div class="calc"><div><span>Informe quantas peças voltaram: de 1 a ${nf(it.qtd)}.</span></div></div>`;
      }
      // itensVenda é pura: a conta de "depois" sai de uma cópia do pedido com esta devolução a mais
      const extra = Math.max(0, num(d.custoExtra));
      const depois = itensVenda(comCopiaComDevolucao(atual, { item: k, qtd: d.qtd, custoExtra: extra, data: d.data, motivo: d.motivo }));
      const b = depois[k], perda = b.perda - it.perda, lucroAntes = soma(antes, 'lucro'), lucroDepois = soma(depois, 'lucro');
      const receber = aReceberDaVenda(atual);
      return `<div class="calc">
        <h4>Sai da venda</h4>
        ${comLinha(`Valor de ${comPlural(d.qtd, 'peça', 'peças')}`, comMenos(it.bruto - b.bruto), 'neg')}
        ${comLinha('Taxa do canal que deixa de ser paga', comMais(it.taxa - b.taxa))}
        ${comLinha('Imposto que deixa de ser pago', comMais(it.imposto - b.imposto))}
        ${comH4('Perda')}
        ${comLinha('Custo das peças devolvidas', brl(perda - extra))}
        ${comLinha('Gasto extra', brl(extra))}
        ${comLinha('Perda com esta devolução', brl(perda), 'neg', true)}
        ${comH4('Lucro do pedido')}
        ${comLinha('Antes da devolução', brl(lucroAntes), comSinal(lucroAntes))}
        ${comLinha('Depois da devolução', brl(lucroDepois), comSinal(lucroDepois), true)}
      </div>
      <p class="hint">A peça devolvida não volta para o estoque: o custo dela fica como perda. A devolução entra no mês da venda${mes ? ` (${esc(mes)})` : ''}, mesmo que aconteça depois.</p>
      ${receber > 0 ? comAviso(`Este pedido ainda tem ${brl(receber)} a receber: o valor devolvido (${brl(Math.min(receber, it.bruto - b.bruto))}) sai sozinho do que o cliente deve, em Contas a receber.`) : ''}`;
    },
    save(d) {
      const atual = byId('vendas', id);
      if (!atual) { toast('Este pedido não existe mais.', 'bad'); return; }
      const k = posicao(d.itemDevolvido), it = itensVenda(atual)[k];
      if (!it || !(it.qtd > 0)) { toast('Escolha o item devolvido.', 'bad'); return false; }
      if (!Number.isInteger(d.qtd) || d.qtd < 1 || d.qtd > it.qtd) { toast(`A quantidade precisa ser um número inteiro, de 1 a ${nf(it.qtd)}.`, 'bad'); return false; }
      if (!registrarDevolucao(atual, { item: k, qtd: d.qtd, motivo: d.motivo, custoExtra: d.custoExtra, data: d.data })) {
        toast('Não foi possível registrar a devolução.', 'bad');
        return false;
      }
      toast(`Devolução registrada: ${comPlural(d.qtd, 'peça', 'peças')} de ${comNomeItem(it)}.`);
      render();
      comDetalhesVenda(atual.id);                              // volta para os detalhes do pedido, já com a devolução
    },
  });
}
function comDesfazerDevolucao(id, devId) {
  const v = byId('vendas', id);
  const dev = v && (Array.isArray(v.devolucoes) ? v.devolucoes : []).find(x => x.id === devId);
  if (!dev) { toast('Esta devolução não existe mais.', 'bad'); return; }
  const it = itensVenda(v)[num(dev.item)];
  if (!confirmar(`Desfazer a devolução de ${comPlural(dev.qtd, 'peça', 'peças')}${it ? ' de ' + comNomeItem(it) : ''} (${dataBR(dev.data)})?\n\nAs peças voltam a contar como vendidas neste pedido. O estoque não muda.`)) return;
  desfazerDevolucao(v, devId);
  render();
  comDetalhesVenda(id);
  toast('Devolução desfeita.');
}
function comExcluirVenda(id) {
  const v = byId('vendas', id);
  if (!v) return;
  const its = itensVenda(v), contas = comContasDaVenda(v);
  const voltam = soma(its.filter(i => byId('produtos', i.produtoId)), 'qtd'), devolvidas = soma(its, 'devolvido');
  const avisos = [];
  if (voltam > 0) avisos.push(`${comPlural(voltam, 'peça volta', 'peças voltam')} para o estoque.`);
  if (devolvidas > 0) avisos.push(devolvidas === 1 ? 'A peça devolvida não volta (já conta como perda).' : `As ${nf(devolvidas)} peças devolvidas não voltam (já contam como perda).`);
  if (contas.length) avisos.push(contas.length === 1 ? 'A conta a receber deste pedido também será apagada.' : `As ${nf(contas.length)} contas a receber deste pedido também serão apagadas.`);
  if (!confirmar(`Excluir o ${comTituloPedido(v).replace(/^Pedido/, 'pedido')} (${resumoItensVenda(v)})?${avisos.length ? '\n\n' + avisos.join('\n') : ''}`)) return;
  excluirVenda(v);
  if ($('#modal.open')) fecharModal();
  render();
  toast(voltam > 0 ? `Pedido excluído. ${comPlural(voltam, 'peça voltou', 'peças voltaram')} para o estoque.` : 'Pedido excluído.');
}

/* ---------- Tela: Orçamentos ---------- */
VIEWS.orcamentos = function () {
  const novo = '<button class="btn" onclick="comEditarOrcamento()">+ Novo orçamento</button>';
  const topo = head('Orçamentos', 'Para encomendas: gere o PDF ou o texto pronto para o WhatsApp', novo);
  if (!S.orcamentos.length) {
    return topo + `<div class="panel">${vazio('Nenhum orçamento ainda. Crie o primeiro para enviar ao cliente em PDF ou pelo WhatsApp.', novo)}</div>`;
  }
  // deixa a logo do PDF pronta enquanto a pessoa olha a lista: o primeiro PDF sai sem esperar a imagem
  if (typeof pdfPrepararLogo === 'function') setTimeout(() => pdfPrepararLogo(S.perfil.logo), 400);
  const dia = hoje();
  const linhas = S.orcamentos.slice().sort((a, b) => num(b.numero) - num(a.numero) || String(b.data || '').localeCompare(String(a.data || ''))).map(o => {
    const itens = o.itens || [], status = comStatusOrc(o), t = totalOrcamento(o), contaSinal = comContaSinal(o);
    const vencido = status === 'aberto' && !!o.validade && o.validade < dia;
    const produz = status === 'aprovado' && !o.ordensGeradas && itens.some(i => byId('produtos', i.produtoId));
    return `<tr>
      <td class="num"><b>${esc(o.numero)}</b></td>
      <td class="num">${esc(dataBR(o.data))}</td>
      <td>${esc(comClienteOrc(o)) || '—'}</td>
      <td>${comPlural(itens.length, 'item', 'itens')}${itens[0] ? `<small>${esc(comDescItem(itens[0]))}</small>` : ''}</td>
      <td class="right num">${brl(t.total)}${t.sinal > 0 ? `<small>sinal ${brl(t.sinal)}</small>` : ''}</td>
      <td class="num">${o.validade ? esc(dataBR(o.validade)) : '—'}${vencido ? ' ' + selo('Vencido', 'warn') : ''}</td>
      <td>${comSeloOrc(o)}${o.ordensGeradas ? '<small>Ordens de produção criadas</small>' : ''}${comOrcVendido(o) ? '<small>Venda registrada</small>' : ''}${contaSinal ? `<small>Sinal ${contaSinal.pagoEm ? 'recebido' : 'a receber'}</small>` : ''}</td>
      <td><div class="rowbtns">
        ${comBotao('PDF', 'comOrcamentoPDF', o.id)}
        ${comBotao('WhatsApp', 'comOrcamentoTexto', o.id)}
        ${comBotao('Editar', 'comEditarOrcamento', o.id)}
        ${status === 'aberto' ? comBotao('Aprovar', 'comAprovarOrcamento', o.id, '') : ''}
        ${produz ? comBotao('Produzir', 'comProduzirOrcamento', o.id, '') : ''}
        ${status === 'aprovado' && !comOrcVendido(o) && itens.length ? comBotao('Registrar venda', 'comFaturarOrcamento', o.id, produz ? 'ghost' : '') : ''}
        ${comBotao('Excluir', 'comExcluirOrcamento', o.id, 'danger')}
      </div></td></tr>`;
  }).join('');
  return topo + `<div class="panel">${tabela(['Nº', 'Data', 'Cliente', 'Itens', { t: 'Total', r: 1 }, 'Validade', 'Situação', ''], linhas)}</div>`;
};
/* Itens que valem no orçamento: só os que têm descrição ou produto do catálogo. Sem quantidade vale 1. */
function comItensOrc(itens) {
  return (itens || []).map(i => {
    const p = byId('produtos', i.produtoId);
    return { produtoId: p ? p.id : '', descricao: i.descricao || (p ? p.nome : ''), qtd: num(i.qtd) > 0 ? num(i.qtd) : 1, precoUnit: num(i.precoUnit) };
  }).filter(i => i.descricao);
}
/* Preço que entra no orçamento ao escolher um produto: o da venda direta; sem ele, o primeiro preço
   cadastrado; sem nenhum, o preço sugerido para o primeiro canal. */
function comPrecoOrcamento(p) {
  const precos = p.precos || {};
  const achado = [byId('canais', 'direta'), ...S.canais].filter(Boolean).find(c => num(precos[c.id]) > 0);
  if (achado) return num(precos[achado.id]);
  return arred(precoNoCanal(p, S.canais[0] || comSemCanal).sugerido, 2);
}
/* Orçamento aprovado com sinal: pergunta se lança o sinal em Contas a receber (uma vez só por orçamento).
   Devolve true quando lançou. */
function comLancarSinal(o) {
  const t = totalOrcamento(o);
  if (!(t.sinal > 0)) return false;
  const ja = comContaSinal(o);
  if (ja) {                                                   // já lançado: só acompanha o sinal novo se a pessoa quiser
    if (!ja.pagoEm && !comOrcVendido(o) && arred(ja.valor, 2) !== arred(t.sinal, 2) &&
      confirmar(`A conta do sinal está com ${brl(ja.valor)}, mas o sinal agora é ${brl(t.sinal)}. Atualizar a conta?`)) {
      ja.valor = arred(t.sinal, 2); put('contas', ja);
    }
    return false;
  }
  if (!confirmar(`Lançar o sinal de ${brl(t.sinal)} (${pct(t.sinalPct)} do total) em Contas a receber?\n\nA conta vence hoje. Quando o cliente pagar, marque como recebida.`)) return false;
  // código fixo: aprovar o mesmo orçamento em dois aparelhos não lança o sinal duas vezes
  criarConta({ id: 'sinal-' + o.id, tipo: 'receber', descricao: comDescSinal(o), valor: t.sinal, vencimento: hoje(),
    clienteId: byId('clientes', o.clienteId) ? o.clienteId : '', origem: 'orcamento', origemId: o.id, parte: 'sinal' });
  return true;
}
/* Orçamento editado depois de lançar o sinal: a conta do sinal ainda em aberto acompanha o sinal e o cliente novos.
   Só muda o que mudou neste orçamento (um valor ajustado à mão em Contas continua valendo). Devolve um aviso curto ou ''. */
function comAjustarSinal(antes, o) {
  const c = antes && comContaSinal(o);
  if (!c || c.pagoEm) return '';
  if (comOrcVendido(o)) return 'A venda deste orçamento já foi registrada: o pedido e as contas dele não mudam com esta edição.';
  const t0 = totalOrcamento(antes), t = totalOrcamento(o);
  if (comStatusOrc(o) !== 'aprovado' || !(t.sinal > 0)) {
    return comStatusOrc(antes) === 'aprovado' && t0.sinal > 0 ? 'O sinal já lançado continua em Contas a receber; se não vale mais, apague a conta lá.' : '';
  }
  let aviso = '', mudou = false;
  if (arred(t0.sinal, 2) !== arred(t.sinal, 2)) { c.valor = arred(t.sinal, 2); mudou = true; aviso = `O sinal em Contas a receber passou para ${brl(c.valor)}.`; }
  if ((antes.clienteId || '') !== (o.clienteId || '') || comClienteOrc(antes) !== comClienteOrc(o)) {
    c.clienteId = byId('clientes', o.clienteId) ? o.clienteId : ''; c.descricao = comDescSinal(o); mudou = true;
  }
  if (mudou) put('contas', c);
  return aviso;
}
/* Formulário de orçamento (sem id = novo). */
function comEditarOrcamento(id) {
  const o = byId('orcamentos', id);
  const cliente = o ? byId('clientes', o.clienteId) : null;
  const vals = o
    ? { ...o, clienteId: cliente ? cliente.id : '', clienteNome: cliente ? '' : (o.clienteNome || ''), status: comStatusOrc(o), sinalPct: num(o.sinalPct) > 0 ? o.sinalPct : '' }
    : { clienteId: '', clienteNome: '', data: hoje(), validade: addDias(hoje(), 7), prazo: '', pagamento: '', itens: [], desconto: '', sinalPct: '', status: 'aberto', obs: '' };
  // o sinal acompanha o padrão do cliente escolhido até a pessoa digitar um valor (orçamento já salvo com sinal: vale o dele)
  let sinalDigitado = !!o && num(o.sinalPct) > 0;
  openForm({
    title: o ? 'Orçamento nº ' + o.numero : 'Novo orçamento',
    registro: o ? ['orcamentos', o.id] : null,
    wide: true,
    fields: [
      { k: 'clienteId', label: 'Cliente', type: 'select', options: [['', '— não cadastrado —'], ...comPorNome(S.clientes).map(c => [c.id, c.nome])] },
      { k: 'clienteNome', label: 'Nome do cliente (se não cadastrado)' },
      { k: 'data', label: 'Data', type: 'date', req: true },
      { k: 'validade', label: 'Válido até', type: 'date' },
      { k: 'prazo', label: 'Prazo de entrega', ph: 'Ex.: 5 dias úteis após a aprovação' },
      { k: 'pagamento', label: 'Forma de pagamento', ph: 'Pix, cartão…' },
      { k: 'itens', label: 'Itens', type: 'rows', min: 1, add: '+ Item', novo: () => ({ qtd: 1 }),
        hint: 'Escolha um produto do catálogo ou escreva um item avulso.',
        cols: [
          { k: 'produtoId', label: 'Produto', type: 'select', w: '1.2fr', options: [['', '— item avulso —'], ...comPorNome(S.produtos).map(p => [p.id, p.nome])] },
          { k: 'descricao', label: 'Descrição', w: '1.6fr' },
          { k: 'qtd', label: 'Qtd', type: 'number', w: '.6fr' },
          { k: 'precoUnit', label: 'Valor un. (R$)', type: 'number', w: '.8fr' },
        ] },
      { k: 'desconto', label: 'Desconto (R$)', type: 'number' },
      { k: 'sinalPct', label: 'Sinal para começar (%)', type: 'number', hint: 'Parte do total que o cliente paga antes de você começar. 0 = sem sinal.' },
      { k: 'status', label: 'Situação', type: 'select', options: [['aberto', 'Aberto'], ['aprovado', 'Aprovado'], ['recusado', 'Recusado']] },
      { k: 'obs', label: 'Observações', type: 'textarea' },
    ],
    vals,
    change(el, form) {
      if (el.name === 'sinalPct') { sinalDigitado = el.value.trim() !== ''; return; }   // apagou o campo: volta a seguir o cliente
      if (el.name === 'clienteId') {                              // cliente escolhido: o sinal vem do padrão dele
        if (sinalDigitado) return;
        const cli = byId('clientes', el.value), p = cli ? num(cli.sinalPct) : 0;
        form.elements.sinalPct.value = p > 0 ? paraCampo(p) : '';
        validarNumero(form.elements.sinalPct);
        return;
      }
      if (el.dataset.col !== 'produtoId') return;                 // só quando troca o produto de uma linha de item
      const linha = el.closest('.row'), p = byId('produtos', el.value);
      if (!linha || !p) return;
      const preco = comPrecoOrcamento(p), qtd = $('[data-col="qtd"]', linha);
      $('[data-col="descricao"]', linha).value = p.nome;
      $('[data-col="precoUnit"]', linha).value = preco > 0 ? paraCampo(preco) : '';
      if (!(num(qtd.value) > 0)) qtd.value = 1;
    },
    preview(d) {
      const itens = comItensOrc(d.itens), t = totalOrcamento({ itens, desconto: d.desconto, sinalPct: d.sinalPct });
      let horas = 0, pesoG = 0, custo = 0, catalogo = 0;
      itens.forEach(i => {
        const p = byId('produtos', i.produtoId);
        if (!p) return;
        const c = custoProduto(p);
        catalogo++; horas += c.horas * i.qtd; pesoG += c.pesoG * i.qtd; custo += c.custo * i.qtd;
      });
      const imposto = t.total * num(S.config.imposto) / 100, lucro = t.total - custo - imposto;
      const avisos = [];
      if (d.itens.some(i => !i.descricao && !byId('produtos', i.produtoId) && num(i.precoUnit) > 0)) avisos.push('Item sem descrição não entra no orçamento.');
      if (catalogo && catalogo < itens.length) avisos.push('Itens avulsos entram no total, mas não têm custo calculado.');
      if (num(d.sinalPct) > 100) avisos.push('O sinal vai de 0 a 100% do total.');
      // sinal já lançado em Contas a receber: avisa o que acontece com ele ao salvar
      const salvo = o ? byId('orcamentos', o.id) || o : null, cs = salvo ? comContaSinal(salvo) : null;
      if (salvo && comOrcVendido(salvo)) avisos.push('A venda deste orçamento já foi registrada: mudar itens, desconto ou sinal aqui não muda o pedido nem as contas.');
      else if (cs && cs.pagoEm) avisos.push(`O sinal de ${brl(num(cs.valorPago) || cs.valor)} já foi recebido.`);
      else if (cs && !(t.sinal > 0)) avisos.push(`O sinal de ${brl(cs.valor)} continua em Contas a receber. Se não vale mais, apague a conta lá.`);
      else if (cs && arred(t.sinal, 2) !== arred(totalOrcamento(salvo).sinal, 2)) {
        avisos.push(comStatusOrc(d) === 'aprovado' ? `Ao salvar, o sinal em Contas a receber passa de ${brl(cs.valor)} para ${brl(t.sinal)}.`
          : `O sinal em Contas a receber continua em ${brl(cs.valor)}: ele só acompanha o orçamento aprovado.`);
      }
      return `<div class="calc">
        ${comLinha('Subtotal', brl(t.subtotal))}
        ${comLinha('Desconto', comMenos(t.desconto))}
        ${comLinha('Total do orçamento', brl(t.total), '', true)}
        ${t.sinal > 0 ? comLinha(`Sinal para começar (${pct(t.sinalPct)})`, brl(t.sinal)) + comLinha('Restante na entrega', brl(t.restante)) : ''}
        ${catalogo ? `${comH4('Para produzir os itens do catálogo')}
        ${comLinha('Tempo total de impressão', horasFmt(horas))}
        ${comLinha('Filamento necessário', gramas(pesoG))}
        ${comLinha('Custo estimado', brl(custo))}
        ${comLinha(`Imposto (${pct(S.config.imposto)})`, brl(imposto))}
        ${comLinha('Lucro estimado (total − custo − imposto)', brl(lucro), comSinal(lucro), true)}` : ''}
      </div>${avisos.map(a => `<p class="hint">${a}</p>`).join('')}`;
    },
    save(d) {
      const itens = comItensOrc(d.itens);
      if (!itens.length) { toast('Inclua pelo menos um item com descrição ou produto.', 'bad'); return false; }
      if (d.sinalPct > 100) { toast('O sinal vai de 0 a 100% do total.', 'bad'); return false; }
      const cli = byId('clientes', d.clienteId);
      const numero = o && num(o.numero) > 0 ? o.numero : proximoNumeroOrcamento();
      // parte da versão mais nova do registro: a janela pode ter ficado aberta enquanto outro aparelho aprovava
      // ou criava as ordens. A situação só muda se a pessoa mexeu nela neste formulário.
      const antes = o ? byId('orcamentos', o.id) || o : null, statusAntes = antes ? comStatusOrc(antes) : '';
      const rec = put('orcamentos', {
        ...(antes || { id: uid(), ordensGeradas: false }),
        numero, data: d.data || hoje(), validade: d.validade, clienteId: cli ? cli.id : '', clienteNome: cli ? cli.nome : d.clienteNome,
        prazo: d.prazo, pagamento: d.pagamento, itens, desconto: d.desconto, sinalPct: d.sinalPct, obs: d.obs,
        status: o && comStatusOrc(d) === comStatusOrc(vals) ? statusAntes : comStatusOrc(d),
      });
      const extra = [comAjustarSinal(antes, rec)];
      if (rec.status === 'aprovado' && statusAntes !== 'aprovado' && comLancarSinal(rec)) extra.push('O sinal ficou em Contas a receber.');
      toast(`Orçamento nº ${numero} ${o ? 'atualizado' : 'criado'}.` + extra.filter(Boolean).map(x => ' ' + x).join(''));
    },
  });
}
/* Nome da empresa em maiúsculas com o X em destaque (igual à marca do menu). */
function comMarca(nome) {
  const n = String(nome || 'Nexos').toUpperCase(), i = n.indexOf('X');
  return i >= 0 ? esc(n.slice(0, i)) + '<b>X</b>' + esc(n.slice(i + 1)) : esc(n);
}
function comVoltarTitulo() {
  if (comTituloAba !== null) document.title = comTituloAba;
  comTituloAba = null;
}
/* Quantidade e valor unitário do jeito que foram digitados (até 3 casas na quantidade; fração de centavo no
   valor), para a conta de cada linha fechar no papel. */
const comQtdTxt = q => nf(q, 3);
const comPrecoTxt = v => {
  const n = num(v);
  return Math.abs(n * 100 - Math.round(n * 100)) > 1e-6 ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 }) : brl(n);
};
/* Tudo o que o documento do orçamento mostra, já formatado: o mesmo para o arquivo PDF e para a impressão. */
function comDadosOrcamento(o) {
  const pf = S.perfil, empresa = pf.empresa || 'Nexos', cli = byId('clientes', o.clienteId), t = totalOrcamento(o);
  const nome = comClienteOrc(o), contato = cli ? [cli.telefone, cli.email].filter(Boolean).join(' · ') : '';
  const digitos = String(pf.cnpj || '').replace(/\D/g, '').length;
  const documento = pf.cnpj ? (digitos === 11 ? 'CPF ' : digitos === 14 ? 'CNPJ ' : 'CNPJ/CPF ') + pf.cnpj : '';
  return {
    numero: String(o.numero ?? ''), emitido: dataBR(o.data), validade: o.validade ? dataBR(o.validade) : '',
    empresa, empresaLinhas: [documento, pf.telefone, pf.email, pf.cidade].map(x => String(x || '').trim()).filter(Boolean),
    logo: logoSegura(pf.logo),
    cliente: nome, contato, prazo: o.prazo || '', pagamento: o.pagamento || '',
    itens: (o.itens || []).map(i => {
      const q = num(i.qtd), pu = num(i.precoUnit);
      return { descricao: comDescItem(i), qtd: comQtdTxt(q), unit: comPrecoTxt(pu), total: brl(q * pu) };
    }),
    subtotal: brl(t.subtotal), desconto: t.desconto > 0 ? brl(-t.desconto) : '', total: brl(t.total),
    sinal: t.sinal > 0 ? { rotulo: `Sinal para iniciar (${pct(t.sinalPct)})`, valor: brl(t.sinal), restante: brl(t.restante) } : null,
    obs: o.obs || '',
    rodape: [o.validade ? 'Orçamento válido até ' + dataBR(o.validade) : '', empresa, pf.telefone, pf.email].filter(Boolean).join(' · '),
    titulo: `Orçamento ${o.numero}${nome ? ' - ' + nome : ''} - ${empresa}`,
  };
}
/* O orçamento em HTML, para a impressão do navegador (o plano B quando o arquivo PDF não pode ser gerado). */
function comOrcamentoHTML(d) {
  const bloco = (rotulo, valor) => `<div><span>${rotulo}</span>${esc(valor) || '—'}</div>`;
  const dadosEmpresa = [`<b>${esc(d.empresa)}</b>`, ...d.empresaLinhas.map(x => esc(x))].join('<br>');
  const linhas = d.itens.map(i => `<tr><td>${esc(i.descricao)}</td><td class="right">${esc(i.qtd)}</td><td class="right">${esc(i.unit)}</td><td class="right">${esc(i.total)}</td></tr>`).join('');
  return `<div class="doc">
    <div class="doc-head">${d.logo ? `<img src="${esc(d.logo)}" alt="">` : `<div class="doc-logo"><img src="img/logo.webp" alt="${esc(d.empresa)}"></div>`}<div class="doc-empresa">${dadosEmpresa}</div></div>
    <h1 class="doc-titulo">Orçamento nº ${esc(d.numero)}</h1>
    <div class="doc-sub">Emitido em ${esc(d.emitido)}${d.validade ? ' · Válido até ' + esc(d.validade) : ''}</div>
    <div class="doc-grid">${bloco('Cliente', d.cliente)}${bloco('Contato', d.contato)}${bloco('Prazo de entrega', d.prazo)}${bloco('Forma de pagamento', d.pagamento)}</div>
    <table><thead><tr><th>Descrição</th><th class="right">Qtd</th><th class="right">Valor un.</th><th class="right">Total</th></tr></thead><tbody>${linhas}</tbody></table>
    <div class="doc-total">
      <div><span>Subtotal</span><span>${esc(d.subtotal)}</span></div>
      ${d.desconto ? `<div><span>Desconto</span><span>${esc(d.desconto)}</span></div>` : ''}
      <div class="final"><span>Total</span><b>${esc(d.total)}</b></div>
      ${d.sinal ? `<div><span>${esc(d.sinal.rotulo)}</span><span>${esc(d.sinal.valor)}</span></div>
      <div><span>Restante na entrega</span><span>${esc(d.sinal.restante)}</span></div>` : ''}
    </div>
    ${d.obs ? `<div class="doc-obs"><b>Observações</b><br>${esc(d.obs)}</div>` : ''}
    <div class="doc-rodape">${esc(d.rodape)}</div>
  </div>`;
}
/* Abre a impressão do orçamento (no navegador: "Salvar como PDF"). */
function comOrcamentoImprimir(d) {
  // o navegador usa o título da aba como nome do arquivo PDF; ele volta ao normal quando a impressão fecha
  if (comTituloAba === null) comTituloAba = document.title;
  document.title = d.titulo;
  window.addEventListener('afterprint', comVoltarTitulo, { once: true });
  imprimir(comOrcamentoHTML(d));
}
let comGerandoPDF = null, comPdfUltimo = { id: '', em: 0 };
/* Gera o arquivo PDF do orçamento e baixa (no celular, oferece enviar pelo WhatsApp e outros apps). Se este
   navegador não conseguir montar o arquivo, abre a impressão, onde dá para escolher "Salvar como PDF".
   Enquanto o arquivo é montado, o botão mostra "Gerando…" e os outros botões de PDF ficam desligados; o do mesmo
   orçamento continua desligado mais 1 segundo (clique duplo gera um arquivo só). */
async function comOrcamentoPDF(id) {
  const o = byId('orcamentos', id);
  if (!o || (comPdfUltimo.id === id && Date.now() - comPdfUltimo.em < 1000)) return;
  if (comGerandoPDF) return toast(`Aguarde: o PDF do orçamento nº ${comGerandoPDF} ainda está sendo gerado.`);
  comAvisarNumeroProvisorio(o);
  comGerandoPDF = String(o.numero ?? '');
  const botoes = $$('button[onclick^="comOrcamentoPDF"]'), botao = botoes.find(b => b.dataset.id === id);
  botoes.forEach(b => { b.disabled = true; });
  if (botao) { botao.setAttribute('aria-busy', 'true'); botao.textContent = 'Gerando…'; }
  const d = comDadosOrcamento(o);
  try {
    const logo = await pdfPrepararLogo(d.logo);
    pdfEntregar(pdfOrcamento(d, logo), pdfNomeArquivo(d.titulo), logo ? '' : '(A logo não carregou a tempo: o PDF saiu sem ela.)');
  } catch (e) {
    console.error('Não foi possível gerar o PDF do orçamento', e);
    toast('Não deu para gerar o arquivo PDF neste navegador. Na janela que abrir, escolha "Salvar como PDF".', 'bad');
    comOrcamentoImprimir(d);
  } finally {
    comGerandoPDF = null;
    comPdfUltimo = { id, em: Date.now() };
    botoes.forEach(b => { if (b !== botao) b.disabled = false; });
    if (botao) {
      botao.textContent = 'PDF'; botao.removeAttribute('aria-busy');
      setTimeout(() => { botao.disabled = false; }, 1000);
    }
  }
}
/* Texto do orçamento para colar no WhatsApp (os asteriscos viram negrito lá). */
function comTextoOrc(o) {
  const t = totalOrcamento(o), nome = comClienteOrc(o);
  const linhas = [`*Orçamento nº ${o.numero} — ${String(S.perfil.empresa || 'Nexos').toUpperCase()}*`];
  if (nome) linhas.push('Cliente: ' + nome);
  linhas.push('');
  (o.itens || []).forEach(i => {
    const q = num(i.qtd), pu = num(i.precoUnit);
    linhas.push(`• ${comQtdTxt(q)}× ${comDescItem(i)} — ${comPrecoTxt(pu)} cada = ${brl(q * pu)}`);
  });
  linhas.push('', 'Subtotal: ' + brl(t.subtotal));
  if (t.desconto > 0) linhas.push('Desconto: ' + brl(-t.desconto));
  linhas.push(`*Total: ${brl(t.total)}*`);
  if (t.sinal > 0) linhas.push(`Sinal para iniciar (${pct(t.sinalPct)}): ${brl(t.sinal)}`, `Restante na entrega: ${brl(t.restante)}`);
  if (o.prazo) linhas.push('Prazo de entrega: ' + o.prazo);
  if (o.pagamento) linhas.push('Pagamento: ' + o.pagamento);
  if (o.validade) linhas.push('Válido até ' + dataBR(o.validade) + '.');
  if (o.obs) linhas.push('Obs: ' + o.obs);
  return linhas.join('\n');
}
/* Só os dígitos do telefone, com 55 na frente quando é um número brasileiro com DDD. Sem DDD devolve ''. */
function comFoneWhats(telefone) {
  let d = String(telefone || '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d.length >= 12 && d.length <= 15 ? d : '';
}
/* Orçamento criado sem internet ainda não chegou ao banco: o número dele pode mudar quando a conexão voltar. */
function comAvisarNumeroProvisorio(o) {
  if (!confirmadoNoBanco('orcamentos', o.id)) toast(`O orçamento nº ${o.numero} ainda não chegou à nuvem (sem internet?). O número pode mudar quando a conexão voltar; confira antes de enviar.`, 'bad');
}
function comOrcamentoTexto(id) {
  const o = byId('orcamentos', id);
  if (!o) return;
  comAvisarNumeroProvisorio(o);
  const cli = byId('clientes', o.clienteId), fone = cli ? comFoneWhats(cli.telefone) : '';
  abrirModal(`
    <p class="muted">Copie o texto e cole na conversa com o cliente.</p>
    <textarea id="comTextoCopia" class="mt" readonly rows="14">${esc(comTextoOrc(o))}</textarea>
    ${fone ? '' : '<p class="hint">Para abrir a conversa direto daqui, o cliente precisa estar cadastrado com telefone e DDD.</p>'}
    <div class="actions">
      ${fone ? `<a class="btn ghost" href="https://wa.me/${fone}" target="_blank" rel="noopener">Abrir conversa no WhatsApp</a>` : ''}
      <button type="button" class="btn" onclick="comCopiarOrcamento()">Copiar texto</button>
    </div>`, { title: 'Orçamento nº ' + o.numero + ' — texto para o WhatsApp' });
}
function comCopiarOrcamento() {
  const campoTexto = $('#comTextoCopia');
  if (campoTexto) copiarTexto(campoTexto.value);
}
function comAprovarOrcamento(id) {
  const o = byId('orcamentos', id);
  if (!o) return;
  o.status = 'aprovado';
  put('orcamentos', o);
  const lancou = comLancarSinal(o);
  render();
  toast(`Orçamento nº ${o.numero} aprovado.${lancou ? ' O sinal ficou em Contas a receber.' : ''}`);
}
/* Cria uma ordem de produção para cada item do catálogo e marca o orçamento, para não criar duas vezes. */
function comProduzirOrcamento(id) {
  const o = byId('orcamentos', id);
  if (!o) return;
  if (o.ordensGeradas) { toast('As ordens deste orçamento já foram criadas.'); return; }
  const itens = (o.itens || []).filter(i => byId('produtos', i.produtoId));
  if (!itens.length) { toast('Este orçamento não tem itens do catálogo para produzir.'); return; }
  const resumo = itens.map(i => `• ${nf(Math.max(1, Math.round(num(i.qtd))))}× ${byId('produtos', i.produtoId).nome}`).join('\n');
  if (!confirmar(`Criar as ordens de produção do orçamento nº ${o.numero}?\n\n${resumo}\n\nElas entram no fim da fila da impressora.`)) return;
  const clienteId = byId('clientes', o.clienteId) ? o.clienteId : '';
  // códigos fixos (orçamento + item): "Produzir" nos dois aparelhos ao mesmo tempo não cria as ordens em dobro
  itens.forEach((i, n) => novaOrdem({ id: ('orc-' + o.id).slice(0, 58) + '-' + n, produtoId: i.produtoId, qtd: i.qtd, clienteId,
    obs: 'Orçamento nº ' + o.numero, orcamentoId: o.id }));
  o.ordensGeradas = true;
  put('orcamentos', o);
  toast((itens.length === 1 ? '1 ordem criada' : nf(itens.length) + ' ordens criadas') + ' na fila de produção.');
  render();
}
/* O orçamento já virou venda? (vale enquanto existir algum pedido ligado a ele) */
const comOrcVendido = o => S.vendas.some(v => v.orcamentoId === o.id);
/* Itens do orçamento prontos para virar pedido: o desconto é repartido entre os itens na proporção do valor
   e quantidade quebrada (ex.: 1,5 hora de modelagem) vira 1 unidade com o valor cheio. */
function comItensParaVenda(o) {
  const t = totalOrcamento(o), fator = t.subtotal > 0 ? t.total / t.subtotal : 1;
  return comItensOrc(o.itens).map(i => {
    const inteiro = Number.isInteger(i.qtd) && i.qtd >= 1;
    return { produtoId: i.produtoId, descricao: i.descricao, qtd: inteiro ? i.qtd : 1, precoUnit: (inteiro ? i.precoUnit : i.precoUnit * i.qtd) * fator };
  });
}
/* Registra a venda de um orçamento aprovado: UM pedido com todos os itens, com o preço combinado, o cliente e o
   canal escolhido. As peças do catálogo saem do estoque de prontas. O restante (total − sinal) pode ficar a receber. */
function comFaturarOrcamento(id) {
  const o = byId('orcamentos', id);
  if (!o) return;
  if (comOrcVendido(o)) { toast('A venda deste orçamento já foi registrada.'); return; }
  const itens = comItensParaVenda(o);
  if (!itens.length) { toast('Este orçamento não tem itens.'); return; }
  // o restante sai do sinal que existe de verdade em Contas (lançado, editado ou recebido), não do sinal combinado
  const t = totalOrcamento(o), sinalReal = comSinalEmContas(o);
  const restante = Math.max(0, arred(t.total - sinalReal, 2)), temRestante = restante > 0;
  const canais = comPorNome(S.canais);
  const padrao = byId('canais', 'direta') || canais[0] || comSemCanal;
  // itens do pedido: os avulsos (fora do catálogo) entram sem custo de peça
  const itensPedido = itens.map(i => ({ produtoId: i.produtoId, produtoNome: i.descricao, qtd: i.qtd, precoUnit: i.precoUnit, custoUnit: i.produtoId ? undefined : 0 }));
  // o que esta janela mostra: se o orçamento mudar em outro aparelho com ela aberta, a venda não sai com valores velhos
  const fotoOrc = x => JSON.stringify([comItensParaVenda(x), arred(totalOrcamento(x).total, 2), arred(comSinalEmContas(x), 2)]);
  const fotoAbertura = fotoOrc(o);
  let freteDigitado = false;
  const fields = [
    { k: 'data', label: 'Data da venda', type: 'date', req: true },
    { k: 'canalId', label: 'Por onde foi vendido', type: 'select', options: canais.length ? canais.map(c => [c.id, c.nome]) : [['', 'Sem canal']] },
    { k: 'frete', label: 'Frete pago pela Nexos neste pedido (R$)', type: 'number', hint: 'Deixe 0 se o cliente pagou ou retirou' },
  ];
  if (temRestante) {
    fields.push(
      { k: 'restante', label: sinalReal > 0 ? `Restante (total − sinal em Contas): ${brl(restante)}`
        : `Pagamento do total (${brl(t.total)})${t.sinal > 0 ? ' — o sinal não foi lançado em Contas' : ''}`, type: 'select',
        options: [['recebido', 'Recebido na entrega'], ['receber', 'A receber']] },
      { k: 'vencimento', label: 'Vencimento (quando o cliente vai pagar)', type: 'date', hint: 'O valor fica em Contas a receber até você marcar como recebido.' });
  }
  openForm({
    title: `Registrar a venda do orçamento nº ${o.numero}`,
    fields,
    vals: { data: hoje(), canalId: padrao.id, frete: num(padrao.frete), restante: 'recebido', vencimento: addDias(hoje(), 7) },
    saveLabel: 'Registrar venda',
    // o frete acompanha o canal escolhido, até a pessoa digitar um valor (mesma regra do Novo pedido)
    change(el, form) {
      if (el.name === 'frete') { freteDigitado = el.value.trim() !== ''; return; }
      if (el.name === 'restante') { comMostrarVencimento(form, 'restante'); return; }
      if (el.name !== 'canalId' || freteDigitado) return;
      const c = byId('canais', el.value);
      form.elements.frete.value = paraCampo(c ? num(c.frete) : 0);
    },
    preview: d => {
      const s = simularVenda({ canalId: d.canalId, frete: d.frete, itens: itensPedido });
      const cs = comContaSinal(o), faltas = comFaltasEstoque(itens);
      const situacaoSinal = cs ? (cs.pagoEm ? 'já recebido' : 'em Contas a receber') : 'não lançado em Contas';
      return `<div class="calc"><h4>Resumo do pedido</h4>
        ${s.itens.map(i => comLinha(`${nf(i.qtd)}× ${esc(i.produtoNome)}`, brl(i.bruto))).join('')}
        ${comLinha('Total cobrado do cliente', brl(s.bruto), '', true)}
        ${comLinha('Taxa do canal', comMenos(s.taxa))}
        ${comLinha('Frete pago', comMenos(s.frete))}
        ${comLinha('Imposto', comMenos(s.imposto))}
        ${comLinha('Custo das peças', comMenos(s.custo))}
        ${comLinha('Lucro', `${brl(s.lucro)} · ${pct(s.margem)}`, comSinal(s.lucro), true)}
        ${sinalReal > 0 ? comH4('Pagamento') + comLinha(`Sinal em Contas — ${situacaoSinal}`, brl(sinalReal)) + comLinha('Restante', brl(restante))
          : t.sinal > 0 ? comH4('Pagamento') + comLinha(`Sinal combinado (${pct(t.sinalPct)}) — ${situacaoSinal}`, brl(t.sinal)) : ''}
        ${temRestante && d.restante === 'receber' ? comLinha('Fica em Contas a receber', `${brl(restante)} · ${d.vencimento ? 'vence ' + esc(dataBR(d.vencimento)) : 'sem vencimento'}`, 'aviso') : ''}
        </div>${faltas.length ? comAviso(`Ainda não há peças prontas suficientes de: ${esc(faltas.map(f => f.p.nome).join(', '))}. Dá para registrar mesmo assim; o estoque fica negativo até a produção terminar.`) : ''}
        ${temRestante ? '' : '<p class="hint">O sinal cobre o total do pedido.</p>'}
        <p class="hint">Vira um pedido em Vendas e estoque, ligado a este cliente. Itens que não são do catálogo entram sem custo de peça.</p>`;
    },
    save: d => {
      if (!d.data) { toast('Informe a data da venda.'); return false; }
      const receber = temRestante && d.restante === 'receber';
      if (receber && !d.vencimento) { toast('Informe quando o cliente vai pagar o restante (vencimento).', 'bad'); return false; }
      const atual = byId('orcamentos', id);
      if (!atual) { toast('Este orçamento foi excluído enquanto a janela estava aberta.', 'bad'); return; }
      if (comOrcVendido(atual)) { toast('A venda deste orçamento já foi registrada.'); return; }
      if (fotoOrc(atual) !== fotoAbertura) {                  // itens, desconto ou sinal mudaram: refaz a janela com o que vale agora
        toast('Este orçamento mudou em outro aparelho enquanto a janela estava aberta. Confira o resumo atualizado e registre de novo.', 'bad');
        if (FORM) FORM.sujo = false;
        fecharModal();
        comFaturarOrcamento(id);
        return false;
      }
      const clienteId = byId('clientes', atual.clienteId) ? atual.clienteId : '', nome = comClienteOrc(atual);
      const sinalAgora = comSinalEmContas(atual), resto = Math.max(0, arred(totalOrcamento(atual).total - sinalAgora, 2));
      // código fixo (o do orçamento): registrar a mesma venda em dois aparelhos não cria dois pedidos nem baixa o estoque duas vezes
      const v = registrarVenda({ id: ('ov-' + atual.id).slice(0, 64), data: d.data, canalId: d.canalId, frete: d.frete, clienteId,
        obs: 'Orçamento nº ' + atual.numero, orcamentoId: atual.id, itens: itensPedido });
      const vaiReceber = receber && resto > 0;
      if (vaiReceber) {
        criarConta({ tipo: 'receber',
          descricao: (sinalAgora > 0 ? `Restante do orçamento nº ${atual.numero} (pedido nº ${v.numero})` : `Pedido nº ${v.numero} (orçamento nº ${atual.numero})`) + (nome ? ' — ' + nome : ''),
          valor: resto, vencimento: d.vencimento, clienteId, origem: 'venda', origemId: v.id, parte: 'saldo' });
      }
      comIrParaMes(d.data);
      toast(`Venda do orçamento nº ${atual.numero} registrada (pedido nº ${v.numero}).${vaiReceber ? ` ${brl(resto)} ficou em Contas a receber.` : ''}`);
    },
  });
  if (temRestante && FORM && FORM.form) comMostrarVencimento(FORM.form, 'restante');
}
function comExcluirOrcamento(id) {
  const o = byId('orcamentos', id);
  if (!o) return;
  const nome = comClienteOrc(o);
  // orçamento que já virou pedido: o sinal ainda em aberto faz parte do pedido e continua em Contas
  const vendido = comOrcVendido(o);
  const abertas = vendido ? [] : S.contas.filter(c => c.origem === 'orcamento' && c.origemId === o.id && !c.pagoEm);
  const avisos = [];
  if (o.ordensGeradas) avisos.push('As ordens de produção já criadas continuam na fila.');
  if (vendido && S.contas.some(c => c.origem === 'orcamento' && c.origemId === o.id && !c.pagoEm)) avisos.push('O sinal ainda em aberto continua em Contas a receber: ele faz parte do pedido já registrado.');
  if (abertas.length) {
    avisos.push(abertas.length === 1 ? `A conta ainda em aberto deste orçamento (${brl(abertas[0].valor)}) também será apagada de Contas a receber.`
      : `As ${nf(abertas.length)} contas ainda em aberto deste orçamento (${brl(soma(abertas, 'valor'))}) também serão apagadas de Contas a receber.`);
  }
  if (!confirmar(`Excluir o orçamento nº ${o.numero}${nome ? ' de ' + nome : ''}?${avisos.length ? '\n\n' + avisos.join('\n') : ''}`)) return;
  abertas.forEach(c => excluirConta(c));
  rm('orcamentos', id);
  render();
  toast('Orçamento excluído.');
}

/* ---------- Tela: Clientes ---------- */
VIEWS.clientes = function () {
  const novo = '<button class="btn" onclick="comEditarCliente()">+ Novo cliente</button>';
  const topo = head('Clientes', 'Contatos e histórico de pedidos', novo);
  if (!S.clientes.length) {
    return topo + `<div class="panel">${vazio('Nenhum cliente cadastrado. Cadastre para acompanhar os pedidos de cada um.', novo)}</div>`;
  }
  const lista = comPorNome(S.clientes).map(c => ({ c, h: historicoCliente(c.id) }));
  const temReceber = lista.some(x => x.h.aReceber > 0);           // a coluna "A receber" só aparece quando alguém deve
  const linhas = lista.map(({ c, h }) => {
    const busca = comNorm([c.nome, c.telefone, String(c.telefone || '').replace(/\D/g, ''), c.email, c.cidade].join(' '));
    const contato = c.telefone ? esc(c.telefone) + (c.email ? `<small>${esc(c.email)}</small>` : '') : c.email ? esc(c.email) : '—';
    return `<tr data-busca="${esc(busca)}">
      <td><b>${esc(c.nome)}</b>${c.cidade ? `<small>${esc(c.cidade)}</small>` : ''}</td>
      <td>${contato}</td>
      <td class="right num">${nf(h.vendas.length)}</td>
      <td class="right num">${brl(h.total)}</td>
      ${temReceber ? `<td class="right num">${h.aReceber > 0 ? brl(h.aReceber) : '—'}</td>` : ''}
      <td class="num">${h.ultima ? esc(dataBR(h.ultima)) : '—'}</td>
      <td><div class="rowbtns">
        ${comBotao('Histórico', 'comHistoricoCliente', c.id)}
        ${comBotao('Editar', 'comEditarCliente', c.id)}
        ${comBotao('Excluir', 'comExcluirCliente', c.id, 'danger')}
      </div></td></tr>`;
  }).join('');
  const cols = ['Cliente', 'Contato', { t: 'Pedidos', r: 1 }, { t: 'Total comprado', r: 1 }, ...(temReceber ? [{ t: 'A receber', r: 1 }] : []), 'Última compra', ''];
  return topo + `
    <div class="filtros">
      <div class="espaco" style="max-width:420px"><label for="comBuscaIn">Buscar cliente</label><input id="comBuscaIn" type="search" value="${esc(comBusca)}" placeholder="Nome, telefone, e-mail ou cidade" autocomplete="off" oninput="comFiltrarClientes(this.value)"></div>
    </div>
    <div class="panel" id="comClientes">
      ${tabela(cols, linhas)}
      <div class="empty" id="comSemCliente" hidden>Nenhum cliente encontrado com essa busca.</div>
    </div>`;
};
VIEWS.clientes.depois = function () { if (comBusca) comFiltrarClientes(comBusca); };
/* Busca direto na tabela já montada (sem refazer a tela): esconde as linhas que não têm todas as palavras. */
function comFiltrarClientes(texto) {
  comBusca = String(texto || '');
  const termos = comNorm(comBusca).split(/\s+/).filter(Boolean);
  let achou = 0;
  $$('#comClientes tbody tr').forEach(tr => {
    const alvo = tr.dataset.busca || '', mostra = termos.every(t => alvo.includes(t));
    tr.hidden = !mostra;
    if (mostra) achou++;
  });
  const lista = $('#comClientes .scroll'), semNada = $('#comSemCliente');
  if (lista) lista.hidden = !achou;
  if (semNada) semNada.hidden = achou > 0;
}
/* Formulário de cliente (sem id = novo). */
function comEditarCliente(id) {
  const c = byId('clientes', id);
  openForm({
    title: c ? 'Editar cliente' : 'Novo cliente',
    registro: c ? ['clientes', c.id] : null,
    fields: [
      { k: 'nome', label: 'Nome', req: true, full: true },
      { k: 'telefone', label: 'Telefone / WhatsApp', type: 'tel', ph: '(11) 99999-9999' },
      { k: 'email', label: 'E-mail', type: 'email' },
      { k: 'cidade', label: 'Cidade / UF' },
      { k: 'sinalPct', label: 'Sinal padrão nas encomendas (%)', type: 'number', hint: '0 = sem sinal. Vem preenchido nos orçamentos deste cliente.' },
      { k: 'obs', label: 'Observações', type: 'textarea' },
    ],
    vals: c || {},
    save(d) {
      if (!d.nome) { toast('Informe o nome do cliente.', 'bad'); return false; }
      if (d.sinalPct > 100) { toast('O sinal vai de 0 a 100% do total.', 'bad'); return false; }
      put('clientes', { ...(c || { id: uid() }), nome: d.nome, telefone: d.telefone, email: d.email, cidade: d.cidade, sinalPct: d.sinalPct, obs: d.obs });
      if (!c) comBusca = '';                                      // cliente novo aparece na lista mesmo com uma busca feita antes
      toast(c ? 'Cliente atualizado.' : 'Cliente cadastrado.');
    },
  });
}
function comExcluirCliente(id) {
  const c = byId('clientes', id);
  if (!c) return;
  const h = historicoCliente(id);
  const partes = [
    h.vendas.length ? comPlural(h.vendas.length, 'pedido', 'pedidos') : '',
    h.orcamentos.length ? comPlural(h.orcamentos.length, 'orçamento', 'orçamentos') : '',
    h.ordens.length ? comPlural(h.ordens.length, 'ordem de produção', 'ordens de produção') : '',
  ].filter(Boolean).join(', ');
  const aviso = partes ? `\n\nEste cliente tem ${partes} no histórico. Esses registros continuam, mas os pedidos e as ordens ficam sem o nome do cliente.` : '';
  const receber = h.aReceber > 0 ? `\n\nEle ainda tem ${brl(h.aReceber)} a receber. As contas continuam em Contas a pagar e receber.` : '';
  if (!confirmar(`Excluir o cliente ${c.nome}?${aviso}${receber}`)) return;
  h.orcamentos.forEach(o => { o.clienteNome = c.nome; put('orcamentos', o); });   // o orçamento guarda o nome para continuar legível
  rm('clientes', id);
  render();
  toast('Cliente excluído.');
}
function comHistoricoCliente(id) {
  const c = byId('clientes', id);
  if (!c) return;
  const h = historicoCliente(id);
  const contato = [c.telefone, c.email, c.cidade].filter(Boolean).map(x => esc(x)).join(' · ');
  const pedidos = h.vendas.length
    ? tabela(['Nº', 'Data', 'Itens', 'Canal', { t: 'Total', r: 1 }], h.vendas.map(v => `<tr>
        <td class="num">${num(v.numero) > 0 ? esc(v.numero) : '—'}</td>
        <td class="num">${esc(dataBR(v.data))}</td>
        <td${comColNome}>${esc(resumoItensVenda(v))}<small>${comPlural(v.qtd, 'peça', 'peças')}${num(v.devolvido) > 0 ? ' · ' + comPlural(v.devolvido, 'devolvida', 'devolvidas') : ''}</small></td>
        <td>${esc(v.canalNome || 'Sem canal')}</td>
        <td class="right num">${brl(v.bruto)}</td></tr>`).join(''))
    : vazio('Nenhum pedido para este cliente.');
  const orcamentos = h.orcamentos.length
    ? tabela(['Nº', 'Data', { t: 'Total', r: 1 }, 'Situação'], h.orcamentos.map(o => `<tr>
        <td class="num">${esc(o.numero)}</td>
        <td class="num">${esc(dataBR(o.data))}</td>
        <td class="right num">${brl(totalOrcamento(o).total)}</td>
        <td>${comSeloOrc(o)}</td></tr>`).join(''))
    : vazio('Nenhum orçamento para este cliente.');
  const ordens = h.ordens.length
    ? tabela(['Data', 'Produto', { t: 'Qtd', r: 1 }, 'Situação', 'Prazo'], h.ordens.map(o => {
      const s = comSituacaoOrdem[o.status] || comSituacaoOrdem.fila, prazo = statusPrazo(o);
      return `<tr>
        <td class="num">${esc(dataBR(o.data))}</td>
        <td>${esc((byId('produtos', o.produtoId) || {}).nome || 'Produto excluído')}</td>
        <td class="right num">${nf(o.qtd)}</td>
        <td>${selo(s[0], s[1])}</td>
        <td class="num">${o.prazo ? esc(dataBR(o.prazo)) : '—'}${prazo === 'atrasada' ? ' ' + selo('Atrasada', 'bad') : prazo === 'hoje' ? ' ' + selo('Vence hoje', 'warn') : ''}</td></tr>`;
    }).join(''))
    : vazio('Nenhuma ordem de produção para este cliente.');
  abrirModal(`
    ${contato ? `<p class="muted">${contato}</p>` : ''}
    <div class="cards mt">
      ${kpi('Total comprado', brl(h.total))}
      ${kpi('Peças', nf(h.pecas))}
      ${kpi('Última compra', h.ultima ? esc(dataBR(h.ultima)) : '—')}
      ${kpi('A receber', brl(h.aReceber), h.aReceber > 0 && VIEWS.contas ? '<a href="#contas">ver em Contas</a>' : '', h.aReceber > 0 ? 'aviso' : '')}
    </div>
    <h2>Pedidos</h2>${pedidos}
    <h2 class="mt">Orçamentos</h2>${orcamentos}
    <h2 class="mt">Ordens de produção</h2>${ordens}
    <div class="actions"><button type="button" class="btn ghost" onclick="fecharModal()">Fechar</button></div>`,
  { title: 'Histórico de ' + c.nome, wide: true });
}
