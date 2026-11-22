/* Nexos — telas comerciais: Vendas e estoque, Orçamentos e Clientes.
   Aqui só se monta a tela: as contas de venda, estoque e fila ficam em calc.js.
   Tudo que é global neste arquivo começa com "com".
   Outros arquivos podem chamar comNovaVenda(produtoId) e comEditarCliente(id). */
'use strict';

let comMes = mesAtual();       // mês mostrado em "Vendas e estoque"
let comBusca = '';             // texto da busca de clientes (continua valendo depois de um render)
let comTituloAba = null;       // título da aba, guardado enquanto um orçamento é impresso

/* ---------- Ajudantes ---------- */
const comSituacaoOrc = { aberto: ['Aberto', 'info'], aprovado: ['Aprovado', 'ok'], recusado: ['Recusado', 'mute'] };
const comSituacaoOrdem = { fila: ['Na fila', 'mute'], imprimindo: ['Imprimindo', 'info'], concluido: ['Concluída', 'ok'] };
const comSemCanal = { id: '', nome: 'Sem canal', pct: 0, fixa: 0, frete: 0 };
const comPlural = (n, um, varios) => nf(n) + ' ' + (num(n) === 1 ? um : varios);
const comSinal = v => (num(v) < 0 ? 'neg' : num(v) > 0 ? 'pos' : '');
const comMenos = v => brl(num(v) > 0 ? -num(v) : 0);                       // valor que sai da conta, com sinal de menos
const comNorm = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();    // minúsculas e sem acento
const comPorNome = lista => lista.slice().sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
const comStatusOrc = o => (o.status === 'aprovado' || o.status === 'recusado' ? o.status : 'aberto');
const comSeloOrc = o => selo(...comSituacaoOrc[comStatusOrc(o)]);
const comNomeVenda = v => (byId('produtos', v.produtoId) || {}).nome || v.produtoNome || 'Produto excluído';
const comClienteOrc = o => (byId('clientes', o.clienteId) || {}).nome || o.clienteNome || '';
const comDescItem = i => i.descricao || (byId('produtos', i.produtoId) || {}).nome || 'Item';
/* Botão de linha de tabela. O id vai em data-id (nunca dentro do código do onclick). cls: 'ghost' | 'danger' | '' */
const comBotao = (rotulo, fn, id, cls = 'ghost') =>
  `<button type="button" class="btn${cls ? ' ' + cls : ''} sm" data-id="${esc(id)}" onclick="${fn}(this.dataset.id)">${rotulo}</button>`;
/* Linha de uma prévia (div.calc). cls pinta só o valor: 'pos' | 'neg' | 'aviso'. tot: linha de total. */
const comLinha = (rotulo, valor, cls = '', tot = false) =>
  `<div${tot ? ' class="tot"' : ''}><span>${rotulo}</span><b>${cls ? `<span class="${cls}">${valor}</span>` : valor}</b></div>`;

/* ---------- Tela: Vendas e estoque ---------- */
VIEWS.vendas = function () {
  /* Mês: a lista de meses da base funciona em qualquer navegador; sem ela, vale o campo de mês do próprio navegador. */
  const filtroMes = typeof seletorMes === 'function' ? seletorMes(comMes, 'comTrocarMes')
    : `<div><label for="comMesIn">Mês</label><input id="comMesIn" type="month" value="${esc(comMes)}" placeholder="AAAA-MM" onchange="comTrocarMes(this.value)"></div>`;
  return head('Vendas e estoque', 'Peças prontas para vender e o resultado de cada venda',
    '<button class="btn" onclick="comNovaVenda()">+ Nova venda</button>') + `
    <div class="filtros">${filtroMes}</div>
    <div class="cards" id="comCartoes">${comCartoesMes()}</div>
    ${comPecasProntas()}
    <div class="panel" id="comPainelMes">${comVendasMes()}</div>`;
};
/* Troca o mês e refaz só o que depende dele (cartões e tabela de vendas). O campo do mês continua
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
    kpi('Peças vendidas', nf(r.qtd), comPlural(r.n, 'venda', 'vendas'));
}
function comPecasProntas() {
  const prontos = comPorNome(S.produtos.filter(p => num(p.estoque) !== 0));
  if (!prontos.length) {
    return `<div class="panel"><h2>Peças prontas</h2>${vazio('Nenhuma peça pronta. Conclua uma ordem na Produção.',
      '<a class="btn ghost" href="#producao">Ir para a Produção</a>')}</div>`;
  }
  const temFoto = prontos.some(p => p.foto && p.foto.path);
  let pecas = 0, valor = 0, positivos = 0;                     // o total conta só o que existe de verdade (estoque negativo fica de fora)
  const linhas = prontos.map(p => {
    const est = num(p.estoque), custo = est > 0 ? custoProduto(p).custo * est : 0;
    if (est > 0) { pecas += est; valor += custo; positivos++; }
    const foto = p.foto && p.foto.path ? `<img class="mini" data-path="${esc(p.foto.path)}" alt="">`
      : temFoto ? '<span style="width:40px;flex:none" aria-hidden="true"></span>' : '';
    return `<tr>
      <td><div class="comfoto">${foto}<div><b>${esc(p.nome)}</b>${p.categoria ? `<small>${esc(p.categoria)}</small>` : ''}</div></div></td>
      <td class="right num${est < 0 ? ' neg' : ''}">${nf(est)}${est < 0 ? '<small>vendeu mais do que tinha</small>' : ''}</td>
      <td class="right num">${est > 0 ? brl(custo) : '—'}</td>
      <td><div class="rowbtns">${comBotao('Vender', 'comNovaVenda', p.id, '')}</div></td></tr>`;
  }).join('');
  const total = positivos > 1
    ? `<tr class="total"><td>Total</td><td class="right num">${nf(pecas)}</td><td class="right num">${brl(valor)}</td><td></td></tr>` : '';
  return `<div class="panel"><h2>Peças prontas</h2>${tabela(['Produto', { t: 'Em estoque', r: 1 }, { t: 'Valor a preço de custo', r: 1 }, ''], linhas + total)}</div>`;
}
/* Miolo do painel "Vendas de <mês>": título, tabela com as vendas mais recentes primeiro e a linha de totais. */
function comVendasMes() {
  const mes = esc(nomeMesLongo(comMes));
  const lista = vendasDoMes(comMes).sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) ||
    String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
  if (!lista.length) {
    return `<h2>Vendas de ${mes}</h2>` + vazio(`Nenhuma venda em ${mes}.`, '<button class="btn" onclick="comNovaVenda()">+ Nova venda</button>');
  }
  const r = resumoVendas(lista);
  const linhas = lista.map(v => `<tr>
      <td class="num">${esc(dataBR(v.data))}</td>
      <td>${esc(comNomeVenda(v))}${v.obs ? `<small>${esc(v.obs)}</small>` : ''}</td>
      <td class="right num">${nf(v.qtd)}</td>
      <td>${esc(v.canalNome || 'Sem canal')}</td>
      <td>${nomeDe('clientes', v.clienteId)}</td>
      <td class="right num">${brl(v.precoUnit)}</td>
      <td class="right num">${brl(v.bruto)}</td>
      <td class="right num">${brl(v.taxa)}</td>
      <td class="right num">${brl(v.frete)}</td>
      <td class="right num">${brl(v.imposto)}</td>
      <td class="right num ${comSinal(v.lucro)}">${brl(v.lucro)}</td>
      <td><div class="rowbtns">${comBotao('Excluir', 'comExcluirVenda', v.id, 'danger')}</div></td></tr>`).join('');
  const total = `<tr class="total"><td colspan="2">Total do mês</td>
      <td class="right num">${nf(r.qtd)}</td><td colspan="3"></td>
      <td class="right num">${brl(r.bruto)}</td>
      <td class="right num">${brl(r.taxas)}</td>
      <td class="right num">${brl(r.frete)}</td>
      <td class="right num">${brl(r.imposto)}</td>
      <td class="right num ${comSinal(r.lucro)}">${brl(r.lucro)}</td><td></td></tr>`;
  return `<h2>Vendas de ${mes} <small>${comPlural(r.n, 'venda', 'vendas')}</small></h2>` +
    tabela(['Data', 'Produto', { t: 'Qtd', r: 1 }, 'Canal', 'Cliente', { t: 'Preço un.', r: 1 }, { t: 'Total', r: 1 },
      { t: 'Taxas', r: 1 }, { t: 'Frete', r: 1 }, { t: 'Imposto', r: 1 }, { t: 'Lucro', r: 1 }, ''], linhas + total);
}

/* Formulário de venda. produtoId (opcional) já deixa o produto escolhido. */
function comNovaVenda(produtoId) {
  if (!S.produtos.length) {
    toast('Cadastre um produto antes de registrar uma venda.');
    ir('produtos');
    return;
  }
  const produtos = comPorNome(S.produtos);
  const prodIni = byId('produtos', produtoId) ? produtoId : produtos.length === 1 ? produtos[0].id : '';
  const canalIni = S.canais.length ? S.canais[0].id : '';
  const digitado = { precoUnit: false, frete: false };       // o que a pessoa preencheu à mão não é trocado sozinho
  const padrao = (pid, cid) => {
    const p = byId('produtos', pid), c = byId('canais', cid), preco = p ? num((p.precos || {})[cid]) : 0;
    return { precoUnit: preco > 0 ? preco : '', frete: c ? num(c.frete) : 0 };
  };
  const ini = padrao(prodIni, canalIni);
  openForm({
    title: 'Nova venda',
    fields: [
      { k: 'data', label: 'Data', type: 'date', req: true },
      { k: 'produtoId', label: 'Produto', type: 'select', req: true,
        options: [['', '— escolha o produto —'], ...produtos.map(p => [p.id, `${p.nome} (${nf(p.estoque)} em estoque)`])] },
      { k: 'canalId', label: 'Canal de venda', type: 'select',
        options: S.canais.length ? S.canais.map(c => [c.id, c.nome]) : [['', 'Sem canal']] },
      { k: 'qtd', label: 'Quantidade', type: 'number' },
      { k: 'precoUnit', label: 'Preço por unidade (R$)', type: 'number' },
      { k: 'frete', label: 'Frete pago pela Nexos neste pedido (R$)', type: 'number', hint: 'Já vem com o frete do canal. Mude se neste pedido foi diferente.' },
      { k: 'clienteId', label: 'Cliente', type: 'select', full: true,
        options: [['', '— sem cliente —'], ...comPorNome(S.clientes).map(c => [c.id, c.nome])] },
      { k: 'obs', label: 'Observação', type: 'textarea', rows: 2 },
    ],
    vals: { data: hoje(), produtoId: prodIni, canalId: canalIni, qtd: 1, precoUnit: ini.precoUnit, frete: ini.frete, clienteId: '', obs: '' },
    change(el, form) {
      if (el.name === 'precoUnit' || el.name === 'frete') { digitado[el.name] = el.value.trim() !== ''; return; }   // apagou o campo: volta a preencher sozinho
      if (el.name !== 'produtoId' && el.name !== 'canalId') return;
      const s = padrao(form.elements.produtoId.value, form.elements.canalId.value);
      if (!digitado.precoUnit) form.elements.precoUnit.value = paraCampo(s.precoUnit);
      if (!digitado.frete) form.elements.frete.value = paraCampo(s.frete);
    },
    preview(d) {
      const p = byId('produtos', d.produtoId);
      if (!p) return '<div class="calc"><div><span>Escolha o produto para ver o resultado da venda.</span></div></div>';
      const canal = byId('canais', d.canalId) || comSemCanal;
      const qtd = Math.max(1, Math.round(num(d.qtd))), est = num(p.estoque);
      // a conta vem de simularVenda (calc.js), a mesma que registrarVenda grava
      const { bruto, taxa, frete, imposto, custo, lucro, margem } = simularVenda(d);
      const regra = [num(canal.pct) ? pct(canal.pct) : '', num(canal.fixa) ? brl(canal.fixa) + ' por peça' : ''].filter(Boolean).join(' + ');
      let dica = '';
      if (!(num(d.precoUnit) > 0)) {
        const cadastrado = num((p.precos || {})[canal.id]), sugerido = precoNoCanal(p, canal).sugerido;
        dica = cadastrado > 0 ? `Preço cadastrado neste canal: ${brl(cadastrado)}.`
          : sugerido > 0 ? `Este produto não tem preço cadastrado neste canal. Preço sugerido: ${brl(sugerido)}.`
            : 'Informe o preço por unidade.';
      }
      return `<div class="calc">
        ${comLinha('Estoque disponível', comPlural(est, 'peça', 'peças') + (qtd > est ? ' — faltam ' + nf(qtd - est) : ''), qtd > est ? 'neg' : '')}
        ${comLinha('Total da venda', brl(bruto))}
        ${comLinha('Taxa do canal' + (regra ? ` (${regra})` : ''), comMenos(taxa))}
        ${comLinha('Frete', comMenos(frete))}
        ${comLinha(`Imposto (${pct(S.config.imposto)})`, comMenos(imposto))}
        ${comLinha('Custo das peças', comMenos(custo))}
        ${comLinha(`Lucro (margem ${pct(margem)})`, brl(lucro), comSinal(lucro), true)}
      </div>${dica ? `<p class="hint">${dica}</p>` : ''}`;
    },
    save(d) {
      const p = byId('produtos', d.produtoId);
      if (!p) { toast('Escolha o produto.', 'bad'); return false; }
      if (d.qtd < 1 || d.qtd !== Math.round(d.qtd)) { toast('A quantidade precisa ser um número inteiro, a partir de 1.', 'bad'); return false; }
      if (!(d.precoUnit > 0)) { toast('Informe o preço por unidade.', 'bad'); return false; }
      const est = num(p.estoque);
      if (d.qtd > est && !confirmar(`Estoque insuficiente: há ${nf(est)} em estoque e a venda é de ${nf(d.qtd)}.\n\nRegistrar mesmo assim? O estoque vai ficar negativo.`)) return false;
      registrarVenda(d);
      if (/^\d{4}-(0[1-9]|1[0-2])-/.test(d.data)) comMes = d.data.slice(0, 7);      // a tela de vendas abre no mês desta venda
      toast('Venda registrada.');
    },
  });
}
function comExcluirVenda(id) {
  const v = byId('vendas', id);
  if (!v) return;
  const volta = !!byId('produtos', v.produtoId);
  if (!confirmar(`Excluir a venda de ${nf(v.qtd)}× ${comNomeVenda(v)} (${dataBR(v.data)})?${volta ? '\n\nAs peças voltam para o estoque.' : ''}`)) return;
  excluirVenda(v);
  render();
  toast(volta ? 'Venda excluída. As peças voltaram para o estoque.' : 'Venda excluída.');
}

/* ---------- Tela: Orçamentos ---------- */
VIEWS.orcamentos = function () {
  const novo = '<button class="btn" onclick="comEditarOrcamento()">+ Novo orçamento</button>';
  const topo = head('Orçamentos', 'Para encomendas: gere o PDF ou o texto pronto para o WhatsApp', novo);
  if (!S.orcamentos.length) {
    return topo + `<div class="panel">${vazio('Nenhum orçamento ainda. Crie o primeiro para enviar ao cliente em PDF ou pelo WhatsApp.', novo)}</div>`;
  }
  const dia = hoje();
  const linhas = S.orcamentos.slice().sort((a, b) => num(b.numero) - num(a.numero) || String(b.data || '').localeCompare(String(a.data || ''))).map(o => {
    const itens = o.itens || [], status = comStatusOrc(o);
    const vencido = status === 'aberto' && !!o.validade && o.validade < dia;
    const produz = status === 'aprovado' && !o.ordensGeradas && itens.some(i => byId('produtos', i.produtoId));
    return `<tr>
      <td class="num"><b>${esc(o.numero)}</b></td>
      <td class="num">${esc(dataBR(o.data))}</td>
      <td>${esc(comClienteOrc(o)) || '—'}</td>
      <td>${comPlural(itens.length, 'item', 'itens')}${itens[0] ? `<small>${esc(comDescItem(itens[0]))}</small>` : ''}</td>
      <td class="right num">${brl(totalOrcamento(o).total)}</td>
      <td class="num">${o.validade ? esc(dataBR(o.validade)) : '—'}${vencido ? ' ' + selo('Vencido', 'warn') : ''}</td>
      <td>${comSeloOrc(o)}${o.ordensGeradas ? '<small>Ordens de produção criadas</small>' : ''}${comOrcVendido(o) ? '<small>Venda registrada</small>' : ''}</td>
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
/* Formulário de orçamento (sem id = novo). */
function comEditarOrcamento(id) {
  const o = byId('orcamentos', id);
  const cliente = o ? byId('clientes', o.clienteId) : null;
  const vals = o
    ? { ...o, clienteId: cliente ? cliente.id : '', clienteNome: cliente ? '' : (o.clienteNome || ''), status: comStatusOrc(o) }
    : { clienteId: '', clienteNome: '', data: hoje(), validade: addDias(hoje(), 7), prazo: '', pagamento: '', itens: [], desconto: '', status: 'aberto', obs: '' };
  openForm({
    title: o ? 'Orçamento nº ' + o.numero : 'Novo orçamento',
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
      { k: 'status', label: 'Situação', type: 'select', options: [['aberto', 'Aberto'], ['aprovado', 'Aprovado'], ['recusado', 'Recusado']] },
      { k: 'obs', label: 'Observações', type: 'textarea' },
    ],
    vals,
    change(el) {
      if (el.dataset.col !== 'produtoId') return;                 // só quando troca o produto de uma linha de item
      const linha = el.closest('.row'), p = byId('produtos', el.value);
      if (!linha || !p) return;
      const preco = comPrecoOrcamento(p), qtd = $('[data-col="qtd"]', linha);
      $('[data-col="descricao"]', linha).value = p.nome;
      $('[data-col="precoUnit"]', linha).value = preco > 0 ? paraCampo(preco) : '';
      if (!(num(qtd.value) > 0)) qtd.value = 1;
    },
    preview(d) {
      const itens = comItensOrc(d.itens), t = totalOrcamento({ itens, desconto: d.desconto });
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
      return `<div class="calc">
        ${comLinha('Subtotal', brl(t.subtotal))}
        ${comLinha('Desconto', comMenos(t.desconto))}
        ${comLinha('Total do orçamento', brl(t.total), '', true)}
        ${catalogo ? `<h4 style="margin-top:14px">Para produzir os itens do catálogo</h4>
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
      const cli = byId('clientes', d.clienteId);
      const numero = o && num(o.numero) > 0 ? o.numero : proximoNumeroOrcamento();
      put('orcamentos', {
        // parte da versão mais nova do registro: a janela pode ter ficado aberta enquanto outro aparelho aprovava
        // ou criava as ordens. A situação só muda se a pessoa mexeu nela neste formulário.
        ...((o && byId('orcamentos', o.id)) || o || { id: uid(), ordensGeradas: false }),
        numero, data: d.data || hoje(), validade: d.validade, clienteId: cli ? cli.id : '', clienteNome: cli ? cli.nome : d.clienteNome,
        prazo: d.prazo, pagamento: d.pagamento, itens, desconto: d.desconto, obs: d.obs,
        status: o && comStatusOrc(d) === comStatusOrc(vals) ? comStatusOrc(byId('orcamentos', o.id) || o) : comStatusOrc(d),
      });
      toast(`Orçamento nº ${numero} ${o ? 'atualizado' : 'criado'}.`);
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
/* Abre a impressão do orçamento (no navegador: "Salvar como PDF"). */
function comOrcamentoPDF(id) {
  const o = byId('orcamentos', id);
  if (!o) return;
  const pf = S.perfil, empresa = pf.empresa || 'Nexos', cli = byId('clientes', o.clienteId), t = totalOrcamento(o);
  const nome = comClienteOrc(o), contato = cli ? [cli.telefone, cli.email].filter(Boolean).join(' · ') : '';
  const digitos = String(pf.cnpj || '').replace(/\D/g, '').length;
  const documento = pf.cnpj ? (digitos === 11 ? 'CPF ' : digitos === 14 ? 'CNPJ ' : 'CNPJ/CPF ') + pf.cnpj : '';
  const dadosEmpresa = [`<b>${esc(empresa)}</b>`, esc(documento), esc(pf.telefone), esc(pf.email), esc(pf.cidade)].filter(Boolean).join('<br>');
  const bloco = (rotulo, valor) => `<div><span>${rotulo}</span>${esc(valor) || '—'}</div>`;
  const linhas = (o.itens || []).map(i => {
    const q = num(i.qtd), pu = num(i.precoUnit);
    return `<tr><td>${esc(comDescItem(i))}</td><td class="right">${nf(q, 2)}</td><td class="right">${brl(pu)}</td><td class="right">${brl(q * pu)}</td></tr>`;
  }).join('');
  const rodape = [o.validade ? 'Orçamento válido até ' + dataBR(o.validade) : '', empresa, pf.telefone, pf.email].filter(Boolean).map(x => esc(x)).join(' · ');
  const html = `<div class="doc">
    <div class="doc-head">${logoSegura(pf.logo) ? `<img src="${esc(logoSegura(pf.logo))}" alt="">` : `<div class="doc-marca">${comMarca(empresa)}</div>`}<div class="doc-empresa">${dadosEmpresa}</div></div>
    <h1 class="doc-titulo">Orçamento nº ${esc(o.numero)}</h1>
    <div class="doc-sub">Emitido em ${esc(dataBR(o.data))}${o.validade ? ' · Válido até ' + esc(dataBR(o.validade)) : ''}</div>
    <div class="doc-grid">${bloco('Cliente', nome)}${bloco('Contato', contato)}${bloco('Prazo de entrega', o.prazo)}${bloco('Forma de pagamento', o.pagamento)}</div>
    <table><thead><tr><th>Descrição</th><th class="right">Qtd</th><th class="right">Valor un.</th><th class="right">Total</th></tr></thead><tbody>${linhas}</tbody></table>
    <div class="doc-total">
      <div><span>Subtotal</span><span>${brl(t.subtotal)}</span></div>
      ${t.desconto > 0 ? `<div><span>Desconto</span><span>${brl(-t.desconto)}</span></div>` : ''}
      <div class="final"><span>Total</span><b>${brl(t.total)}</b></div>
    </div>
    ${o.obs ? `<div class="doc-obs"><b>Observações</b><br>${esc(o.obs)}</div>` : ''}
    <div class="doc-rodape">${rodape}</div>
  </div>`;
  // o navegador usa o título da aba como nome do arquivo PDF; ele volta ao normal quando a impressão fecha
  if (comTituloAba === null) comTituloAba = document.title;
  document.title = `Orçamento ${o.numero}${nome ? ' - ' + nome : ''} - ${empresa}`;
  window.addEventListener('afterprint', comVoltarTitulo, { once: true });
  imprimir(html);
}
/* Texto do orçamento para colar no WhatsApp (os asteriscos viram negrito lá). */
function comTextoOrc(o) {
  const t = totalOrcamento(o), nome = comClienteOrc(o);
  const linhas = [`*Orçamento nº ${o.numero} — ${String(S.perfil.empresa || 'Nexos').toUpperCase()}*`];
  if (nome) linhas.push('Cliente: ' + nome);
  linhas.push('');
  (o.itens || []).forEach(i => {
    const q = num(i.qtd), pu = num(i.precoUnit);
    linhas.push(`• ${nf(q, 2)}× ${comDescItem(i)} — ${brl(pu)} cada = ${brl(q * pu)}`);
  });
  linhas.push('', 'Subtotal: ' + brl(t.subtotal));
  if (t.desconto > 0) linhas.push('Desconto: ' + brl(-t.desconto));
  linhas.push(`*Total: ${brl(t.total)}*`);
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
function comOrcamentoTexto(id) {
  const o = byId('orcamentos', id);
  if (!o) return;
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
  render();
  toast(`Orçamento nº ${o.numero} aprovado.`);
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
  itens.forEach(i => novaOrdem({ produtoId: i.produtoId, qtd: i.qtd, clienteId, obs: 'Orçamento nº ' + o.numero }));
  o.ordensGeradas = true;
  put('orcamentos', o);
  toast((itens.length === 1 ? '1 ordem criada' : nf(itens.length) + ' ordens criadas') + ' na fila de produção.');
  render();
}
/* O orçamento já virou venda? (vale enquanto existir alguma venda ligada a ele) */
const comOrcVendido = o => S.vendas.some(v => v.orcamentoId === o.id);
/* Itens do orçamento prontos para virar venda: o desconto é repartido entre os itens na proporção do valor
   e quantidade quebrada (ex.: 1,5 hora de modelagem) vira 1 unidade com o valor cheio. */
function comItensParaVenda(o) {
  const t = totalOrcamento(o), fator = t.subtotal > 0 ? t.total / t.subtotal : 1;
  return comItensOrc(o.itens).map(i => {
    const inteiro = Number.isInteger(i.qtd) && i.qtd >= 1;
    return { produtoId: i.produtoId, descricao: i.descricao, qtd: inteiro ? i.qtd : 1, precoUnit: (inteiro ? i.precoUnit : i.precoUnit * i.qtd) * fator };
  });
}
/* Registra a venda de um orçamento aprovado: uma venda por item, com o preço combinado, o cliente e o
   canal escolhido. As peças do catálogo saem do estoque de prontas; o frete entra uma vez só. */
function comFaturarOrcamento(id) {
  const o = byId('orcamentos', id);
  if (!o) return;
  if (comOrcVendido(o)) { toast('A venda deste orçamento já foi registrada.'); return; }
  const itens = comItensParaVenda(o);
  if (!itens.length) { toast('Este orçamento não tem itens.'); return; }
  const canais = comPorNome(S.canais);
  const padrao = byId('canais', 'direta') || canais[0] || comSemCanal;
  let freteDigitado = false;
  const simular = d => itens.map((i, n) => simularVenda({
    produtoId: i.produtoId, qtd: i.qtd, precoUnit: i.precoUnit, canalId: d.canalId, frete: n === 0 ? d.frete : 0,
    custoUnit: i.produtoId ? undefined : 0,
  }));
  openForm({
    title: `Registrar a venda do orçamento nº ${o.numero}`,
    fields: [
      { k: 'data', label: 'Data da venda', type: 'date', req: true },
      { k: 'canalId', label: 'Por onde foi vendido', type: 'select', options: canais.length ? canais.map(c => [c.id, c.nome]) : [['', 'Sem canal']] },
      { k: 'frete', label: 'Frete pago pela Nexos neste pedido (R$)', type: 'number', hint: 'Deixe 0 se o cliente pagou ou retirou' },
    ],
    vals: { data: hoje(), canalId: padrao.id, frete: num(padrao.frete) },
    saveLabel: 'Registrar venda',
    // o frete acompanha o canal escolhido, até a pessoa digitar um valor (mesma regra de Nova venda)
    change(el, form) {
      if (el.name === 'frete') { freteDigitado = el.value.trim() !== ''; return; }
      if (el.name !== 'canalId' || freteDigitado) return;
      const c = byId('canais', el.value);
      form.elements.frete.value = paraCampo(c ? num(c.frete) : 0);
    },
    preview: d => {
      const s = simular(d), total = soma(s, 'bruto'), lucro = soma(s, 'lucro');
      const falta = itens.filter(i => i.produtoId && num((byId('produtos', i.produtoId) || {}).estoque) < i.qtd);
      return `<div class="calc"><h4>Resumo da venda</h4>
        ${itens.map(i => comLinha(`${nf(i.qtd)}× ${esc(i.descricao)}`, brl(i.precoUnit * i.qtd))).join('')}
        ${comLinha('Total cobrado do cliente', brl(total), '', true)}
        ${comLinha('Taxa do canal', comMenos(soma(s, 'taxa')))}
        ${comLinha('Frete pago', comMenos(soma(s, 'frete')))}
        ${comLinha('Imposto', comMenos(soma(s, 'imposto')))}
        ${comLinha('Custo das peças', comMenos(soma(s, 'custo')))}
        ${comLinha('Lucro', `${brl(lucro)} · ${pct(total > 0 ? lucro / total * 100 : 0)}`, comSinal(lucro), true)}
        </div>${falta.length ? `<p class="hint aviso">Ainda não há peças prontas suficientes de: ${esc(falta.map(i => i.descricao).join(', '))}. Dá para registrar mesmo assim; o estoque fica negativo até a produção terminar.</p>` : ''}
        <p class="hint">Cada item vira uma venda em Vendas e estoque, ligada a este cliente. Itens que não são do catálogo entram sem custo de peça.</p>`;
    },
    save: d => {
      if (!d.data) { toast('Informe a data da venda.'); return false; }
      const atual = byId('orcamentos', id);
      if (!atual || comOrcVendido(atual)) { toast('A venda deste orçamento já foi registrada.'); return; }
      const clienteId = byId('clientes', atual.clienteId) ? atual.clienteId : '';
      itens.forEach((i, n) => registrarVenda({
        data: d.data, produtoId: i.produtoId, produtoNome: i.descricao, qtd: i.qtd, precoUnit: i.precoUnit, canalId: d.canalId,
        frete: n === 0 ? d.frete : 0, clienteId, obs: 'Orçamento nº ' + atual.numero, orcamentoId: atual.id,
        custoUnit: i.produtoId ? undefined : 0,
      }));
      toast(`Venda do orçamento nº ${atual.numero} registrada.`);
    },
  });
}
function comExcluirOrcamento(id) {
  const o = byId('orcamentos', id);
  if (!o) return;
  const nome = comClienteOrc(o);
  if (!confirmar(`Excluir o orçamento nº ${o.numero}${nome ? ' de ' + nome : ''}?${o.ordensGeradas ? '\n\nAs ordens de produção já criadas continuam na fila.' : ''}`)) return;
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
  const linhas = comPorNome(S.clientes).map(c => {
    const h = historicoCliente(c.id);
    const busca = comNorm([c.nome, c.telefone, String(c.telefone || '').replace(/\D/g, ''), c.email, c.cidade].join(' '));
    const contato = c.telefone ? esc(c.telefone) + (c.email ? `<small>${esc(c.email)}</small>` : '') : c.email ? esc(c.email) : '—';
    return `<tr data-busca="${esc(busca)}">
      <td><b>${esc(c.nome)}</b>${c.cidade ? `<small>${esc(c.cidade)}</small>` : ''}</td>
      <td>${contato}</td>
      <td class="right num">${nf(h.vendas.length)}</td>
      <td class="right num">${brl(h.total)}</td>
      <td class="num">${h.ultima ? esc(dataBR(h.ultima)) : '—'}</td>
      <td><div class="rowbtns">
        ${comBotao('Histórico', 'comHistoricoCliente', c.id)}
        ${comBotao('Editar', 'comEditarCliente', c.id)}
        ${comBotao('Excluir', 'comExcluirCliente', c.id, 'danger')}
      </div></td></tr>`;
  }).join('');
  return topo + `
    <div class="filtros">
      <div class="espaco" style="max-width:420px"><label for="comBuscaIn">Buscar cliente</label><input id="comBuscaIn" type="search" value="${esc(comBusca)}" placeholder="Nome, telefone, e-mail ou cidade" autocomplete="off" oninput="comFiltrarClientes(this.value)"></div>
    </div>
    <div class="panel" id="comClientes">
      ${tabela(['Cliente', 'Contato', { t: 'Pedidos', r: 1 }, { t: 'Total comprado', r: 1 }, 'Última compra', ''], linhas)}
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
    fields: [
      { k: 'nome', label: 'Nome', req: true, full: true },
      { k: 'telefone', label: 'Telefone / WhatsApp', type: 'tel', ph: '(11) 99999-9999' },
      { k: 'email', label: 'E-mail', type: 'email' },
      { k: 'cidade', label: 'Cidade / UF', full: true },
      { k: 'obs', label: 'Observações', type: 'textarea' },
    ],
    vals: c || {},
    save(d) {
      if (!d.nome) { toast('Informe o nome do cliente.', 'bad'); return false; }
      put('clientes', { ...(c || { id: uid() }), nome: d.nome, telefone: d.telefone, email: d.email, cidade: d.cidade, obs: d.obs });
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
    h.vendas.length ? comPlural(h.vendas.length, 'venda', 'vendas') : '',
    h.orcamentos.length ? comPlural(h.orcamentos.length, 'orçamento', 'orçamentos') : '',
    h.ordens.length ? comPlural(h.ordens.length, 'ordem de produção', 'ordens de produção') : '',
  ].filter(Boolean).join(', ');
  const aviso = partes ? `\n\nEste cliente tem ${partes} no histórico. Esses registros continuam, mas as vendas e as ordens ficam sem o nome do cliente.` : '';
  if (!confirmar(`Excluir o cliente ${c.nome}?${aviso}`)) return;
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
  const vendas = h.vendas.length
    ? tabela(['Data', 'Produto', { t: 'Qtd', r: 1 }, 'Canal', { t: 'Total', r: 1 }], h.vendas.map(v => `<tr>
        <td class="num">${esc(dataBR(v.data))}</td>
        <td>${esc(comNomeVenda(v))}</td>
        <td class="right num">${nf(v.qtd)}</td>
        <td>${esc(v.canalNome || 'Sem canal')}</td>
        <td class="right num">${brl(v.bruto)}</td></tr>`).join(''))
    : vazio('Nenhuma venda para este cliente.');
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
    </div>
    <h2>Vendas</h2>${vendas}
    <h2 class="mt">Orçamentos</h2>${orcamentos}
    <h2 class="mt">Ordens de produção</h2>${ordens}
    <div class="actions"><button type="button" class="btn ghost" onclick="fecharModal()">Fechar</button></div>`,
  { title: 'Histórico de ' + c.nome, wide: true });
}
