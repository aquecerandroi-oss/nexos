'use strict';
/* Nexos — cadastros: telas de Produtos, Filamentos, Compras e Insumos.
   Outros arquivos chamam: cadEditarProduto(id) (sem id = produto novo) e cadNovaCompra(filamentoId).
   Tudo que é global neste arquivo começa com "cad". A matemática de custo, estoque e preço médio fica em calc.js. */

const cadTiposFilamento = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon', 'Outro'];
const cadUnidades = ['un', 'par', 'm', 'g', 'ml', 'folha'];
let cadBusca = '';   // o que foi digitado na busca de produtos (continua valendo depois de um render)

/* ---------- Ajudantes ---------- */
const cadNorm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const cadPalavras = txt => cadNorm(txt).split(/\s+/).filter(Boolean);
const cadPorNome = lista => [...(lista || [])].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' }));
const cadPlural = (n, um, varios) => nf(n) + ' ' + (num(n) === 1 ? um : varios);
/* R$ com até 4 casas decimais (insumo barato: R$ 0,035 por unidade). */
const cadCusto = v => num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 });
/* Bolinha de cor do filamento; só aceita cor no formato #rrggbb. */
const cadPonto = c => cor(/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '#888');
/* Botão de linha de tabela. O id vai em data-id, nunca dentro do código do onclick. */
const cadBtn = (rotulo, fn, id, cls = 'ghost', dica = '') =>
  `<button type="button" class="btn ${cls} sm" data-id="${esc(id)}"${dica ? ` title="${esc(dica)}"` : ''} onclick="${fn}(this.dataset.id)">${rotulo}</button>`;
/* Campos que também mudam sozinhos (estoque, preço médio): se a pessoa não mexeu no campo, vale o valor mais novo
   do registro — ele pode ter mudado em outro aparelho (uma venda, uma compra) enquanto a janela estava aberta. */
const cadValorAtual = (d, k, aoAbrir, atual) => (aoAbrir && atual && d[k] === num(aoAbrir[k]) ? num(atual[k]) : d[k]);
/* Link dentro de um formulário: fecha a janela (perguntando se pode descartar) e só então troca de tela. */
function cadSairPara(pg) {
  fecharForm();
  if (!$('#modal.open')) ir(pg);
}

/* ---------- Produtos ---------- */
VIEWS.produtos = function () {
  const novo = '<button class="btn" onclick="cadEditarProduto()">+ Novo produto</button>';
  const topo = head('Produtos', 'Custo de cada peça e lucro em cada canal de venda', novo);
  if (!S.produtos.length) {
    return topo + '<div class="panel">' + (S.filamentos.length
      ? vazio('Nenhum produto cadastrado. Cadastre o primeiro para ver quanto ele custa e quanto sobra em cada canal de venda.', novo)
      : vazio('Antes do primeiro produto, cadastre o filamento que ele usa: o custo da peça sai do preço por kg do filamento.', '<a class="btn" href="#filamentos">Cadastrar filamento</a>')) + '</div>';
  }
  const podeProduzir = typeof opNovaOrdem === 'function', podeVender = typeof comNovaVenda === 'function';
  const temFotos = S.produtos.some(p => p.foto && p.foto.path);
  const termo = cadPalavras(cadBusca);
  let visiveis = 0;
  const linhas = cadPorNome(S.produtos).map(p => {
    const c = custoProduto(p), est = num(p.estoque);
    const canais = canaisDoProduto(p).filter(x => x.vende);
    const busca = cadNorm((p.nome || '') + ' ' + (p.categoria || ''));
    const mostra = termo.every(t => busca.includes(t));
    if (mostra) visiveis++;
    const foto = p.foto && p.foto.path
      ? `<img class="mini" data-path="${esc(p.foto.path)}" alt="" style="flex:none">`
      : (temFotos ? '<span class="mini" style="flex:none"></span>' : '');
    const pontos = c.itens.map(i => `<span title="${esc((i.fil ? i.fil.nome : 'Filamento excluído') + ' · ' + gramas(i.g))}">${cadPonto(i.fil && i.fil.cor)}</span>`).join('');
    /* uma linha por canal, em três colunas alinhadas: canal, preço e lucro. Com pouco espaço, o nome do canal
       e a margem quebram de linha em vez de a tabela ganhar rolagem. */
    const precos = canais.length
      ? `<div style="display:grid;grid-template-columns:minmax(5.2em,auto) auto auto;justify-content:start;align-items:baseline;gap:2px 10px">${canais.map(x =>
          `<span class="muted">${esc(x.canal.nome)}</span><b class="right num">${brl(x.preco)}</b><span class="txt-sm ${x.lucro < 0 ? 'neg' : 'pos'}"><span class="nowrap">lucro ${brl(x.lucro)}</span> <span class="nowrap">(${pct(x.margem)})</span></span>`).join('')}</div>`
      : selo('Sem preço', 'warn');
    /* botões em duas linhas (usar o produto em cima, cuidar do cadastro embaixo) para a tabela caber em telas menores */
    const usar = (podeProduzir ? cadBtn('Produzir', 'cadProduzir', p.id) : '') + (podeVender ? cadBtn('Vender', 'cadVender', p.id) : '') +
      (p.arquivo && p.arquivo.path ? cadBtn('Modelo', 'cadBaixarModelo', p.id, 'ghost', 'Baixar ' + (p.arquivo.nome || 'o modelo 3D')) : '');
    const cuidar = cadBtn('Editar', 'cadEditarProduto', p.id) + cadBtn('Duplicar', 'cadDuplicarProduto', p.id) + cadBtn('Excluir', 'cadExcluirProduto', p.id, 'danger');
    return `<tr data-busca="${esc(busca)}"${mostra ? '' : ' hidden'}>
      <td><div class="comfoto">${foto}<div style="min-width:110px;max-width:240px"><b>${esc(p.nome)}</b>${p.categoria ? `<small>${esc(p.categoria)}</small>` : ''}</div></div></td>
      <td><span class="nowrap">${pontos}</span><small class="nowrap">${gramas(c.pesoG)} · ${horasFmt(c.horas)}</small>${c.semFilamento ? selo('Sem filamento', 'warn') : ''}</td>
      <td class="right num">${brl(c.custo)}</td>
      <td>${precos}</td>
      <td class="right num${est < 0 ? ' neg' : ''}">${nf(est)}</td>
      <td><div class="stack" style="gap:6px">${usar ? `<div class="rowbtns">${usar}</div>` : ''}<div class="rowbtns">${cuidar}</div></div></td>
    </tr>`;
  }).join('');
  const semFilamento = S.filamentos.length ? '' :
    '<div class="panel"><span class="aviso">Nenhum filamento cadastrado.</span> Sem filamento não dá para calcular o custo das peças. <a href="#filamentos">Cadastrar filamento</a></div>';
  return topo + semFilamento + `<div class="panel">
    <div class="filtros"><div class="espaco" style="max-width:380px">
      <label for="cadBuscaProd">Buscar produto</label>
      <input id="cadBuscaProd" type="search" autocomplete="off" placeholder="Nome ou categoria" value="${esc(cadBusca)}" oninput="cadFiltrarProdutos(this.value)">
    </div></div>
    ${tabela(['Produto', 'Materiais', { t: 'Custo', r: 1 }, 'Canais', { t: 'Estoque', r: 1 }, ''], linhas)}
    <div id="cadSemBusca"${visiveis ? ' hidden' : ''}>${vazio('Nenhum produto encontrado com essa busca.')}</div>
  </div>`;
};
/* Filtra as linhas direto na tela, sem render(), para a busca não perder o foco. */
function cadFiltrarProdutos(txt) {
  cadBusca = String(txt ?? '');
  const termo = cadPalavras(cadBusca);
  let visiveis = 0;
  $$('#main tr[data-busca]').forEach(tr => {
    const mostra = termo.every(t => (tr.dataset.busca || '').includes(t));
    tr.hidden = !mostra;
    if (mostra) visiveis++;
  });
  const sem = $('#cadSemBusca');
  if (sem) sem.hidden = visiveis > 0;
}
function cadProduzir(id) { if (typeof opNovaOrdem === 'function') opNovaOrdem(id); }
function cadVender(id) { if (typeof comNovaVenda === 'function') comNovaVenda(id); }
function cadBaixarModelo(id) {
  const p = byId('produtos', id);
  if (p && p.arquivo && p.arquivo.path) baixarArquivo(p.arquivo.path, p.arquivo.nome);
}
/* Abre o formulário de produto. Sem id = produto novo. Também é chamado por outras telas. */
function cadEditarProduto(id) {
  if (!id) return cadFormProduto(null, null);
  const p = byId('produtos', id);
  if (!p) return toast('Este produto não existe mais.', 'bad');
  cadFormProduto(p, p);
}
function cadDuplicarProduto(id) {
  const p = byId('produtos', id);
  if (!p) return;
  const copia = { ...p, nome: (p.nome || '') + ' (cópia)', foto: null, arquivo: null, estoque: 0 };
  delete copia.id;
  cadFormProduto(null, copia);
}
function cadExcluirProduto(id) {
  const p = byId('produtos', id);
  if (!p) return;
  const abertas = S.ordens.filter(o => o.produtoId === id && ORDEM_ATIVA(o)).length;
  const avisos = [];
  if (num(p.estoque) > 0) avisos.push('Há ' + cadPlural(p.estoque, 'peça pronta', 'peças prontas') + ' em estoque.');
  if (abertas) avisos.push('Há ' + cadPlural(abertas, 'ordem de produção em aberto', 'ordens de produção em aberto') + ' com este produto.');
  if (!confirmar(`Excluir o produto "${p.nome}"?` + (avisos.length ? '\n\nAtenção:\n' + avisos.join('\n') : '') + '\n\nAs vendas já registradas continuam nos relatórios.')) return;
  rm('produtos', id);
  removerArquivos([p.foto && p.foto.path, p.arquivo && p.arquivo.path]);
  render();
  toast('Produto excluído.');
}
/* Texto curto com o que o canal desconta, para a dica do campo de preço. */
function cadTaxasCanal(c) {
  const t = [];
  if (num(c.pct) > 0) t.push('comissão de ' + pct(c.pct));
  if (num(c.fixa) > 0) t.push('taxa fixa de ' + brl(c.fixa) + ' por unidade');
  if (num(c.frete) > 0) t.push('frete de ' + brl(c.frete) + ' por pedido');
  return t.length ? 'Descontos: ' + t.join(' + ') : 'Canal sem taxas';
}
function cadCamposProduto(base, temInsumos) {
  const b = base || {};
  const filOpts = cadPorNome(S.filamentos).map(f => [f.id, `${f.nome} — ${brl(f.precoKg)}/kg`]);
  const insOpts = cadPorNome(S.insumos).map(i => [i.id, `${i.nome} (${cadCusto(i.custo)} / ${i.unidade || 'un'})`]);
  /* Se o produto cita um filamento ou insumo que foi excluído, a opção continua na lista:
     assim nada é trocado sem a pessoa ver. */
  (b.materiais || []).forEach(m => { if (m.filamentoId && !filOpts.some(o => o[0] === m.filamentoId)) filOpts.push([m.filamentoId, 'Filamento excluído — escolha outro']); });
  (b.insumos || []).forEach(x => { if (x.insumoId && !insOpts.some(o => o[0] === x.insumoId)) insOpts.push([x.insumoId, 'Insumo excluído — escolha outro']); });
  const campoInsumos = temInsumos
    ? { k: 'insumos', type: 'rows', label: 'Insumos usados em uma peça', add: '+ Insumo',
        cols: [
          { k: 'insumoId', label: 'Insumo', type: 'select', options: insOpts, w: '2fr' },
          { k: 'qtd', label: 'Quantidade por peça', type: 'number' },
        ],
        novo: () => ({ insumoId: insOpts[0] ? insOpts[0][0] : '', qtd: 1 }) }
    : { type: 'html', html: `<label>Insumos usados em uma peça</label>
        <div class="hint" style="margin-top:0">Nenhum insumo cadastrado. Embalagens, ímãs e parafusos entram no custo da peça depois de cadastrados em
        <a href="#insumos" onclick="cadSairPara('insumos'); return false">Insumos</a>.</div>` };
  const camposPreco = S.canais.length
    ? S.canais.map(c => ({ k: 'preco_' + c.id, type: 'number', label: (c.nome || 'Canal') + ' (R$)', hint: cadTaxasCanal(c), ph: 'Vazio = não vende aqui' }))
    : [{ type: 'html', html: `<div class="hint" style="margin-top:0">Nenhum canal de venda cadastrado. Cadastre os canais em
        <a href="#config" onclick="cadSairPara('config'); return false">Configuração</a> para informar os preços.</div>` }];
  return [
    { k: 'nome', label: 'Nome do produto', req: true, full: true },
    { k: 'categoria', label: 'Categoria', full: true, ph: 'Ex.: Decoração' },   // linha inteira: foto e modelo ficam lado a lado logo abaixo
    { k: 'foto', type: 'file', label: 'Foto do produto', imagem: true, pasta: 'produtos', accept: 'image/*' },
    { k: 'arquivo', type: 'file', label: 'Modelo 3D (STL, 3MF…)', pasta: 'modelos', accept: '.stl,.3mf,.obj,.step,.stp,.gcode,.zip' },
    { type: 'titulo', label: 'Impressão' },
    { k: 'materiais', type: 'rows', label: 'Filamento usado em uma peça', min: 1, add: '+ Outra cor ou material',
      cols: [
        { k: 'filamentoId', label: 'Filamento', type: 'select', options: filOpts, w: '2fr' },
        { k: 'pesoG', label: 'Peso (g)', type: 'number' },
      ],
      novo: () => ({ filamentoId: filOpts[0] ? filOpts[0][0] : '' }) },
    { k: 'horas', type: 'number', tempo: 'h', label: 'Tempo de impressão', hint: 'Em horas. Pode digitar 2,5 ou 2h30' },
    { k: 'maoObraMin', type: 'number', tempo: 'min', label: 'Mão de obra (minutos)', hint: 'Preparo, acabamento e embalagem. Pode digitar 15 ou 1h30' },
    campoInsumos,
    { k: 'extras', type: 'number', label: 'Outros custos por peça (R$)' },
    { k: 'estoque', type: 'number', neg: true, label: 'Peças prontas em estoque', hint: 'Ajuste manual; a produção e as vendas mexem aqui sozinhas' },
    { type: 'titulo', label: 'Preço de venda em cada canal' },
    ...camposPreco,
  ];
}
/* Prévia do formulário de produto: custo de uma peça e o resultado em cada canal, com o preço sugerido. */
function cadPreviaProduto(d, insumosFixos) {
  const tmp = {
    materiais: (d.materiais || []).filter(m => m.pesoG > 0),
    horas: d.horas, maoObraMin: d.maoObraMin,
    insumos: d.insumos ? d.insumos.filter(x => x.qtd > 0) : insumosFixos,
    extras: d.extras,
  };
  const c = custoProduto(tmp);
  const linha = (rotulo, valor, cls) => `<div${cls ? ` class="${cls}"` : ''}><span>${rotulo}</span><b>${brl(valor)}</b></div>`;
  let html = `<div class="calc"><h4>Custo de uma peça</h4>
    ${linha('Filamento (' + gramas(c.pesoG) + ')', c.filamento)}
    ${linha('Energia (' + horasFmt(c.horas) + ' de impressão)', c.energia)}
    ${linha('Desgaste e manutenção da máquina', c.maquina)}
    ${linha('Gastos fixos rateados', c.fixos)}
    ${linha('Reserva para falhas (' + pct(c.falhaPct) + (c.falhaReal ? ', taxa real' : '') + ')', c.falhas)}
    ${linha('Mão de obra (' + nf(d.maoObraMin, 1) + ' min)', c.maoObra)}
    ${linha('Insumos', c.insumos)}
    ${linha('Outros custos', c.extras)}
    ${linha('Custo de produção', c.custo, 'tot')}
  </div>`;
  if (!tmp.materiais.length) return html + '<p class="hint" style="margin-top:10px">Informe o peso de pelo menos um filamento para ver o lucro e o preço sugerido em cada canal.</p>';
  if (c.semFilamento) html += '<p class="aviso txt-sm" style="margin-top:10px">Um dos filamentos foi excluído. Escolha outro para o custo ficar certo.</p>';
  if (!S.canais.length) return html;
  const linhas = S.canais.map(canal => {
    const x = precoNoCanal(tmp, canal, d['preco_' + canal.id], c.custo), cls = x.lucro < 0 ? 'neg' : 'pos';
    const sugerido = x.sugerido > 0
      ? `<div class="rowbtns" style="align-items:center"><span class="num">${brl(x.sugerido)}</span>
          <button type="button" class="btn ghost sm" data-campo="preco_${esc(canal.id)}" data-valor="${x.sugerido.toFixed(2)}" onclick="setCampo(this.dataset.campo, this.dataset.valor)">Usar</button></div>`
      : '<span class="muted txt-sm">As taxas e a margem passam de 100%</span>';
    return `<tr><td class="nowrap">${esc(canal.nome)}</td>${x.vende
      ? `<td class="right num">${brl(x.preco)}</td><td class="right num">${brl(x.taxa)}</td><td class="right num">${brl(x.frete)}</td>
         <td class="right num">${brl(x.imposto)}</td><td class="right num ${cls}">${brl(x.lucro)}</td><td class="right num ${cls}">${pct(x.margem)}</td>`
      : '<td colspan="6" class="muted">Sem preço: o produto não é vendido neste canal</td>'}<td class="right">${sugerido}</td></tr>`;
  }).join('');
  return html + `<div class="calc"><h4>Resultado de uma peça em cada canal</h4>
    <section>${tabela(['Canal', { t: 'Preço', r: 1 }, { t: 'Taxa do canal', r: 1 }, { t: 'Frete', r: 1 }, { t: 'Imposto', r: 1 }, { t: 'Lucro', r: 1 }, { t: 'Margem', r: 1 },
      { t: 'Preço para margem de ' + pct(S.config.margem), r: 1 }], linhas)}</section>
    <p class="hint">O preço sugerido cobre o custo, a taxa do canal, o frete e o imposto, e ainda deixa a margem desejada. Clique em Usar para preencher.</p>
  </div>`;
}
/* orig: produto em edição (ou null); base: valores iniciais (o próprio produto, uma cópia ou null). */
function cadFormProduto(orig, base) {
  if (!S.filamentos.length) { toast('Cadastre um filamento antes de cadastrar um produto.'); ir('filamentos'); return; }
  const temInsumos = S.insumos.length > 0;
  const aoAbrir = orig ? { ...orig } : null;
  const insumosFixos = ((base || {}).insumos || []).map(x => ({ ...x }));   // valem quando o campo de insumos não aparece
  const vals = base ? { ...base } : { maoObraMin: 10, estoque: 0 };
  S.canais.forEach(c => { const v = num((vals.precos || {})[c.id]); vals['preco_' + c.id] = v > 0 ? v : ''; });
  openForm({
    title: orig ? 'Editar produto' : base ? 'Novo produto (cópia)' : 'Novo produto',
    wide: true,
    fields: cadCamposProduto(base, temInsumos),
    vals,
    preview: d => cadPreviaProduto(d, insumosFixos),
    save: d => {
      if (!d.nome) { toast('Informe o nome do produto.', 'bad'); return false; }
      const materiais = (d.materiais || []).filter(m => m.filamentoId && m.pesoG > 0).map(m => ({ filamentoId: m.filamentoId, pesoG: m.pesoG }));
      if (!materiais.length) { toast('Informe o peso de pelo menos um filamento.', 'bad'); return false; }
      const atual = orig ? byId('produtos', orig.id) : null;
      const precos = {};
      S.canais.forEach(c => { const v = num(d['preco_' + c.id]); if (v > 0) precos[c.id] = v; });
      const rec = {
        ...(atual || {}),
        nome: d.nome, categoria: d.categoria, foto: d.foto || null, arquivo: d.arquivo || null,
        materiais, horas: d.horas, maoObraMin: d.maoObraMin,
        insumos: d.insumos ? d.insumos.filter(x => x.insumoId && x.qtd > 0).map(x => ({ insumoId: x.insumoId, qtd: x.qtd })) : insumosFixos,
        extras: d.extras,
        estoque: Math.round(num(cadValorAtual(d, 'estoque', aoAbrir, atual))),
        precos,
      };
      if (orig) rec.id = orig.id;
      put('produtos', rec);
      toast(orig ? 'Produto atualizado.' : 'Produto cadastrado.');
    },
  });
  /* Sugere as categorias que já existem, para não criar duas com nomes parecidos. */
  const categorias = [...new Set(S.produtos.map(p => String(p.categoria || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const elCategoria = categorias.length ? $('#modal form [name="categoria"]') : null;
  if (elCategoria) {
    elCategoria.setAttribute('list', 'cadCategorias');
    elCategoria.insertAdjacentHTML('afterend', `<datalist id="cadCategorias">${categorias.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>`);
  }
}

/* ---------- Filamentos ---------- */
VIEWS.filamentos = function () {
  const novo = '<button class="btn" onclick="cadEditarFilamento()">+ Novo filamento</button>';
  const topo = head('Filamentos', 'Estoque e preço médio por kg de cada material',
    novo + '<button class="btn ghost" onclick="cadNovaCompra()">Registrar compra</button>');
  if (!S.filamentos.length) {
    return topo + `<div class="panel">${vazio('Nenhum filamento cadastrado. Cadastre os materiais que você usa: o custo de cada peça sai do preço por kg.', novo)}</div>`;
  }
  const alerta = num(S.config.alertaEstoque);
  const valorDe = f => Math.max(0, num(f.estoqueG)) / 1000 * num(f.precoKg);   // estoque negativo não vale dinheiro
  const ultima = new Map();
  S.compras.forEach(c => { const d = String(c.data || ''); if (d > (ultima.get(c.filamentoId) || '')) ultima.set(c.filamentoId, d); });
  const baixos = S.filamentos.filter(f => num(f.estoqueG) <= alerta).length;
  const linhas = cadPorNome(S.filamentos).map(f => {
    const est = num(f.estoqueG);
    return `<tr>
      <td class="nowrap">${cadPonto(f.cor)}<b>${esc(f.nome)}</b></td>
      <td>${esc(f.tipo || '—')}</td>
      <td class="right num">${brl(f.precoKg)}</td>
      <td class="right num${est <= alerta ? ' neg' : ''}">${gramas(est)}</td>
      <td class="right num">${brl(valorDe(f))}</td>
      <td class="num">${ultima.has(f.id) ? esc(dataBR(ultima.get(f.id))) : '—'}</td>
      <td><div class="rowbtns">
        ${cadBtn('Comprar', 'cadNovaCompra', f.id)}
        ${cadBtn('Editar', 'cadEditarFilamento', f.id)}
        ${cadBtn('Excluir', 'cadExcluirFilamento', f.id, 'danger')}
      </div></td>
    </tr>`;
  }).join('');
  return topo + `<div class="cards">
      ${kpi('Em estoque', gramas(soma(S.filamentos, f => Math.max(0, num(f.estoqueG)))), cadPlural(S.filamentos.length, 'filamento', 'filamentos'))}
      ${kpi('Valor em estoque', brl(soma(S.filamentos, valorDe)), 'pelo preço médio de cada um')}
      ${kpi('Abaixo do alerta', nf(baixos), 'com ' + gramas(alerta) + ' ou menos', baixos ? 'neg' : '')}
    </div>
    <div class="panel">${tabela(['Filamento', 'Tipo', { t: 'Preço médio / kg', r: 1 }, { t: 'Estoque', r: 1 }, { t: 'Valor em estoque', r: 1 }, 'Última compra', ''], linhas)}</div>`;
};
function cadEditarFilamento(id) {
  const f = id ? byId('filamentos', id) : null;
  if (id && !f) return toast('Este filamento não existe mais.', 'bad');
  const aoAbrir = f ? { ...f } : null;
  const tipos = [...cadTiposFilamento];
  if (f && f.tipo && !tipos.includes(f.tipo)) tipos.push(f.tipo);
  openForm({
    title: f ? 'Editar filamento' : 'Novo filamento',
    fields: [
      { k: 'nome', label: 'Nome', req: true, full: true, ph: 'Ex.: PLA Preto Fosco' },
      { k: 'tipo', label: 'Tipo', type: 'select', options: tipos.map(t => [t, t]) },
      { k: 'cor', label: 'Cor', type: 'color' },
      { k: 'precoKg', label: 'Preço por kg (R$)', type: 'number', hint: 'As compras registradas atualizam este valor pela média' },
      { k: 'estoqueG', label: 'Estoque atual (g)', type: 'number', neg: true, hint: 'O que você tem hoje. Compras novas entram por "Registrar compra"' },
    ],
    vals: f || { tipo: 'PLA', cor: '#888888', estoqueG: 0 },
    save: d => {
      if (!d.nome) { toast('Informe o nome do filamento.', 'bad'); return false; }
      const atual = f ? byId('filamentos', f.id) : null;
      const rec = {
        ...(atual || {}), nome: d.nome, tipo: d.tipo, cor: d.cor,
        precoKg: cadValorAtual(d, 'precoKg', aoAbrir, atual), estoqueG: cadValorAtual(d, 'estoqueG', aoAbrir, atual),
      };
      if (f) rec.id = f.id;
      put('filamentos', rec);
      toast(f ? 'Filamento atualizado.' : 'Filamento cadastrado.');
    },
  });
}
function cadExcluirFilamento(id) {
  const f = byId('filamentos', id);
  if (!f) return;
  const usos = S.produtos.filter(p => (p.materiais || []).some(m => m.filamentoId === id)).length;
  if (usos) return toast(`Não dá para excluir: ${f.nome} é usado em ${cadPlural(usos, 'produto', 'produtos')}. Troque o filamento desses produtos antes.`, 'bad');
  if (!confirmar(`Excluir o filamento "${f.nome}"?\n\nAs compras e as falhas já registradas continuam no histórico.`)) return;
  rm('filamentos', id);
  render();
  toast('Filamento excluído.');
}

/* ---------- Compras e fornecedores ---------- */
VIEWS.compras = function () {
  const temFilamento = S.filamentos.length > 0;
  const nova = '<button class="btn" onclick="cadNovaCompra()">+ Nova compra</button>';
  const novoFornecedor = '<button class="btn ghost" onclick="cadEditarFornecedor()">+ Fornecedor</button>';
  const mes = mesAtual();
  const doMes = S.compras.filter(c => noPeriodo(c.data, mes, mes));
  const pago = soma(doMes, 'valor'), peso = soma(doMes, 'pesoG');

  const lista = [...S.compras].sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
  const linhas = lista.map(c => {
    const f = byId('filamentos', c.filamentoId);
    const porKg = num(c.precoKg) || (num(c.pesoG) > 0 ? num(c.valor) / (num(c.pesoG) / 1000) : 0);
    return `<tr>
      <td class="num">${esc(dataBR(c.data))}</td>
      <td class="nowrap">${f ? cadPonto(f.cor) + esc(f.nome) : '<span class="muted">Filamento excluído</span>'}</td>
      <td>${nomeDe('fornecedores', c.fornecedorId)}</td>
      <td class="right num">${gramas(c.pesoG)}</td>
      <td class="right num">${brl(c.valor)}</td>
      <td class="right num">${brl(porKg)}</td>
      <td class="muted"${c.obs ? ' style="min-width:160px"' : ''}>${esc(c.obs)}</td>
      <td><div class="rowbtns">${cadBtn('Excluir', 'cadExcluirCompra', c.id, 'danger')}</div></td>
    </tr>`;
  }).join('');
  const painelCompras = lista.length
    ? tabela(['Data', 'Filamento', 'Fornecedor', { t: 'Peso', r: 1 }, { t: 'Valor pago', r: 1 }, { t: 'R$/kg', r: 1 }, 'Observação', ''], linhas)
    : (temFilamento
      ? vazio('Nenhuma compra registrada. Registre cada compra de filamento: o peso entra no estoque e o preço médio por kg é atualizado.', nova)
      : vazio('Para registrar compras, cadastre primeiro um filamento.', '<a class="btn" href="#filamentos">Cadastrar filamento</a>'));

  const resumo = resumoFornecedores();                       // já vem do mais barato para o mais caro
  const comPreco = resumo.filter(x => x.precoKg > 0);
  const maisBarato = comPreco.length >= 2 && arred(comPreco[0].precoKg, 2) < arred(comPreco[1].precoKg, 2) ? comPreco[0].f.id : '';
  const linhasForn = resumo.map(x => `<tr>
      <td style="min-width:140px"${x.f.obs ? ` title="${esc(x.f.obs)}"` : ''}><b>${esc(x.f.nome)}</b>${x.f.contato ? `<small>${esc(x.f.contato)}</small>` : ''}</td>
      <td class="right num">${nf(x.compras)}</td>
      <td class="right num">${x.compras ? gramas(x.g) : '—'}</td>
      <td class="right num">${x.compras ? brl(x.valor) : '—'}</td>
      <td class="right num">${x.f.id === maisBarato ? selo('Mais barato', 'ok') + ' ' : ''}${x.precoKg > 0 ? brl(x.precoKg) : '—'}</td>
      <td class="num">${x.ultima ? esc(dataBR(x.ultima)) : '—'}</td>
      <td><div class="rowbtns">${cadBtn('Editar', 'cadEditarFornecedor', x.f.id)}${cadBtn('Excluir', 'cadExcluirFornecedor', x.f.id, 'danger')}</div></td>
    </tr>`).join('');
  const painelFornecedores = resumo.length
    ? tabela(['Fornecedor', { t: 'Compras', r: 1 }, { t: 'Total comprado', r: 1 }, { t: 'Total pago', r: 1 }, { t: 'Preço médio / kg', r: 1 }, 'Última compra', ''], linhasForn)
    : vazio('Nenhum fornecedor cadastrado. Cadastre de quem você compra e escolha o fornecedor em cada compra: assim dá para comparar o preço por kg e ver quem vende mais barato.', novoFornecedor);

  return head('Compras', 'Cada compra entra no estoque e atualiza o preço médio do filamento', nova + novoFornecedor) + `
    <div class="cards">
      ${kpi('Comprado no mês', brl(pago), nomeMesLongo(mes))}
      ${kpi('Peso comprado no mês', gramas(peso), cadPlural(doMes.length, 'compra', 'compras'))}
      ${kpi('Preço médio por kg no mês', peso > 0 ? brl(pago / (peso / 1000)) : '—', 'valor pago ÷ peso comprado')}
    </div>
    <div class="panel"><h2>Compras${lista.length ? `<small>${cadPlural(lista.length, 'registro', 'registros')}</small>` : ''}</h2>${painelCompras}</div>
    <div class="panel"><h2>Fornecedores</h2>${painelFornecedores}</div>`;
};
/* Abre o formulário de compra de filamento (já com o filamento escolhido, se vier o id). Também é chamado por outras telas. */
function cadNovaCompra(filamentoId) {
  if (!S.filamentos.length) { toast('Cadastre um filamento antes de registrar uma compra.'); ir('filamentos'); return; }
  const filamentos = cadPorNome(S.filamentos);
  openForm({
    title: 'Registrar compra de filamento',
    saveLabel: 'Registrar compra',
    fields: [
      { k: 'data', label: 'Data da compra', type: 'date' },
      { k: 'filamentoId', label: 'Filamento', type: 'select', req: true, options: filamentos.map(f => [f.id, f.nome]) },
      { k: 'fornecedorId', label: 'Fornecedor', type: 'select', options: [['', '— sem fornecedor —'], ...cadPorNome(S.fornecedores).map(f => [f.id, f.nome])] },
      { k: 'pesoG', label: 'Peso comprado (g)', type: 'number', req: true, hint: 'Em gramas: 1 kg = 1000' },
      { k: 'valor', label: 'Valor total pago (R$)', type: 'number', req: true, hint: 'Inclua o frete' },
      { k: 'obs', label: 'Observação' },
    ],
    vals: { data: hoje(), filamentoId: byId('filamentos', filamentoId) ? filamentoId : filamentos[0].id, fornecedorId: '', pesoG: 1000 },
    preview: (d, form) => {
      const f = byId('filamentos', d.filamentoId), g = num(d.pesoG), valor = num(d.valor);
      if (!f) return '';
      /* campo de valor ainda em branco não é o mesmo que R$ 0,00 digitado (brinde): só calcula depois de preenchido */
      const semValor = !!(form && form.elements.valor && form.elements.valor.value.trim() === '');
      if (!(g > 0) || semValor) return '<p class="hint" style="margin-top:10px">Informe o peso e o valor pago para ver como ficam o estoque e o preço médio.</p>';
      /* mesma conta de registrarCompra (calc.js): média ponderada com o que já havia, sem contar estoque negativo */
      const est = num(f.estoqueG), base = Math.max(0, est);
      const novoPreco = arred((base / 1000 * num(f.precoKg) + valor) / ((base + g) / 1000), 2);
      return `<div class="calc">
        <div><span>Preço por kg desta compra</span><b>${brl(valor / (g / 1000))}</b></div>
        <div><span>Estoque depois da compra (hoje: ${gramas(est)})</span><b>${gramas(arred(est + g))}</b></div>
        <div class="tot"><span>Novo preço médio por kg (hoje: ${brl(f.precoKg)})</span><b>${brl(novoPreco)}</b></div>
      </div>` + (g < 50 ? '<p class="aviso txt-sm" style="margin-top:10px">Confira o peso: ele é em gramas (1 kg = 1000).</p>' : '');
    },
    save: d => {
      if (!byId('filamentos', d.filamentoId)) { toast('Escolha o filamento comprado.', 'bad'); return false; }
      if (!(d.pesoG > 0)) { toast('Informe o peso comprado, em gramas.', 'bad'); return false; }
      if (!(d.valor >= 0)) { toast('O valor pago não pode ser negativo.', 'bad'); return false; }
      registrarCompra(d);
      toast('Compra registrada. Estoque e preço médio atualizados.');
    },
  });
}
function cadExcluirCompra(id) {
  const c = byId('compras', id);
  if (!c) return;
  const f = byId('filamentos', c.filamentoId);
  if (!confirmar(`Excluir a compra de ${gramas(c.pesoG)}${f ? ' de ' + f.nome : ''} (${brl(c.valor)}) do dia ${dataBR(c.data)}?\n\n` +
    'O peso sai do estoque do filamento. O preço médio por kg não é recalculado: se precisar, ajuste em Filamentos.')) return;
  excluirCompra(c);
  render();
  toast('Compra excluída.');
}
function cadEditarFornecedor(id) {
  const f = id ? byId('fornecedores', id) : null;
  if (id && !f) return toast('Este fornecedor não existe mais.', 'bad');
  openForm({
    title: f ? 'Editar fornecedor' : 'Novo fornecedor',
    fields: [
      { k: 'nome', label: 'Nome', req: true, full: true },
      { k: 'contato', label: 'Contato', full: true, ph: 'Site, WhatsApp…' },
      { k: 'obs', label: 'Observações', type: 'textarea' },
    ],
    vals: f || {},
    save: d => {
      if (!d.nome) { toast('Informe o nome do fornecedor.', 'bad'); return false; }
      const atual = f ? byId('fornecedores', f.id) : null;
      const rec = { ...(atual || {}), nome: d.nome, contato: d.contato, obs: d.obs };
      if (f) rec.id = f.id;
      put('fornecedores', rec);
      toast(f ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.');
    },
  });
}
function cadExcluirFornecedor(id) {
  const f = byId('fornecedores', id);
  if (!f) return;
  const n = S.compras.filter(c => c.fornecedorId === id).length;
  if (!confirmar(`Excluir o fornecedor "${f.nome}"?` +
    (n ? `\n\n${n === 1 ? 'A compra feita com ele continua' : 'As ' + nf(n) + ' compras feitas com ele continuam'} no histórico, mas sem o nome do fornecedor.` : ''))) return;
  rm('fornecedores', id);
  render();
  toast('Fornecedor excluído.');
}

/* ---------- Insumos ---------- */
VIEWS.insumos = function () {
  const novo = '<button class="btn" onclick="cadEditarInsumo()">+ Novo insumo</button>';
  const topo = head('Insumos', 'Embalagens, ímãs, parafusos e outros itens usados nas peças. A baixa acontece ao concluir a produção.', novo);
  if (!S.insumos.length) {
    return topo + `<div class="panel">${vazio('Nenhum insumo cadastrado. Cadastre embalagens, ímãs, parafusos e outros itens para eles entrarem no custo das peças.', novo)}</div>`;
  }
  const usos = new Map();   // insumo -> em quantos produtos aparece
  S.produtos.forEach(p => { new Set((p.insumos || []).map(x => x.insumoId)).forEach(id => usos.set(id, (usos.get(id) || 0) + 1)); });
  const linhas = cadPorNome(S.insumos).map(i => {
    const est = num(i.estoque), minimo = num(i.minimo), n = usos.get(i.id) || 0;
    return `<tr>
      <td style="min-width:150px"><b>${esc(i.nome)}</b></td>
      <td>${esc(i.unidade || 'un')}</td>
      <td class="right num">${cadCusto(i.custo)}</td>
      <td class="right num${est < 0 || (minimo > 0 && est <= minimo) ? ' neg' : ''}">${nf(est, 2)}</td>
      <td class="right num">${minimo > 0 ? nf(minimo, 2) : '—'}</td>
      <td>${n ? cadPlural(n, 'produto', 'produtos') : '<span class="muted">Nenhum produto</span>'}</td>
      <td><div class="rowbtns">
        ${cadBtn('Repor', 'cadReporInsumo', i.id)}
        ${cadBtn('Editar', 'cadEditarInsumo', i.id)}
        ${cadBtn('Excluir', 'cadExcluirInsumo', i.id, 'danger')}
      </div></td>
    </tr>`;
  }).join('');
  return topo + `<div class="panel">${tabela(['Insumo', 'Unidade', { t: 'Custo por unidade', r: 1 }, { t: 'Estoque', r: 1 }, { t: 'Mínimo', r: 1 }, 'Usado em', ''], linhas)}</div>`;
};
function cadEditarInsumo(id) {
  const i = id ? byId('insumos', id) : null;
  if (id && !i) return toast('Este insumo não existe mais.', 'bad');
  const aoAbrir = i ? { ...i } : null;
  const unidades = [...cadUnidades];
  if (i && i.unidade && !unidades.includes(i.unidade)) unidades.push(i.unidade);
  openForm({
    title: i ? 'Editar insumo' : 'Novo insumo',
    fields: [
      { k: 'nome', label: 'Nome', req: true, full: true, ph: 'Ex.: Caixa de papelão 10 × 10' },
      { k: 'unidade', label: 'Unidade', type: 'select', options: unidades.map(u => [u, u]) },
      { k: 'custo', label: 'Custo por unidade (R$)', type: 'number' },
      { k: 'estoque', label: 'Estoque atual', type: 'number', neg: true },
      { k: 'minimo', label: 'Avisar quando chegar em', type: 'number', hint: 'Deixe 0 para não avisar' },
    ],
    vals: i || { unidade: 'un', estoque: 0, minimo: 0 },
    save: d => {
      if (!d.nome) { toast('Informe o nome do insumo.', 'bad'); return false; }
      const atual = i ? byId('insumos', i.id) : null;
      const rec = {
        ...(atual || {}), nome: d.nome, unidade: d.unidade,
        custo: cadValorAtual(d, 'custo', aoAbrir, atual), estoque: cadValorAtual(d, 'estoque', aoAbrir, atual), minimo: d.minimo,
      };
      if (i) rec.id = i.id;
      put('insumos', rec);
      toast(i ? 'Insumo atualizado.' : 'Insumo cadastrado.');
    },
  });
}
function cadReporInsumo(id) {
  const i = byId('insumos', id);
  if (!i) return;
  openForm({
    title: 'Repor ' + i.nome,
    saveLabel: 'Registrar reposição',
    fields: [
      { k: 'qtd', label: 'Quantidade comprada (' + (i.unidade || 'un') + ')', type: 'number', req: true },
      { k: 'valor', label: 'Valor total pago (R$)', type: 'number', hint: 'Entra no Financeiro como gasto de Insumos e atualiza o custo médio' },
      { k: 'data', label: 'Data', type: 'date' },
    ],
    vals: { data: hoje() },
    preview: d => {
      const a = byId('insumos', id) || i, qtd = num(d.qtd), valor = num(d.valor), un = esc(a.unidade || 'un');
      if (!(qtd > 0)) return '';
      /* mesma conta de reporInsumo (calc.js): o custo médio só muda quando há valor pago */
      const base = Math.max(0, num(a.estoque));
      const novoCusto = valor > 0 ? arred((base * num(a.custo) + valor) / (base + qtd), 4) : num(a.custo);
      return `<div class="calc">
        ${valor > 0 ? `<div><span>Custo por unidade nesta compra</span><b>${cadCusto(valor / qtd)}</b></div>` : ''}
        <div><span>Estoque depois (hoje: ${nf(a.estoque, 2)} ${un})</span><b>${nf(arred(num(a.estoque) + qtd, 3), 2)} ${un}</b></div>
        <div class="tot"><span>Custo médio por unidade (hoje: ${cadCusto(a.custo)})</span><b>${cadCusto(novoCusto)}</b></div>
      </div>` + (valor > 0 ? '' : '<p class="hint" style="margin-top:10px">Sem valor pago, o custo médio não muda e nada entra no Financeiro.</p>');
    },
    save: d => {
      if (!(d.qtd > 0)) { toast('Informe a quantidade comprada.', 'bad'); return false; }
      const atual = byId('insumos', id);
      if (!atual) { toast('Este insumo não existe mais.', 'bad'); return false; }
      reporInsumo(atual, d.qtd, d.valor, d.data);
      toast('Reposição registrada.');
    },
  });
}
function cadExcluirInsumo(id) {
  const i = byId('insumos', id);
  if (!i) return;
  const usos = S.produtos.filter(p => (p.insumos || []).some(x => x.insumoId === id)).length;
  if (usos) return toast(`Não dá para excluir: ${i.nome} é usado em ${cadPlural(usos, 'produto', 'produtos')}. Tire o insumo desses produtos antes.`, 'bad');
  if (!confirmar(`Excluir o insumo "${i.nome}"?`)) return;
  rm('insumos', id);
  render();
  toast('Insumo excluído.');
}
