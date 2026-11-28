'use strict';
/* Nexos — cadastros: telas de Produtos, Filamentos, Compras e Insumos, a lista O que comprar e o Acertar estoque.
   Outros arquivos chamam: cadEditarProduto(id) (sem id = produto novo), cadNovaCompra(filamentoId) e cadReporInsumo(id) (as
   janelas já preenchidas com a última compra), cadListaComprar('painel' | 'compras') e cadAcertar('fil' | 'ins' | 'prod', id).
   Tudo que é global neste arquivo começa com "cad". A matemática de custo, estoque e preço médio fica em calc.js.
   O peso e o tempo do arquivo do fatiador vêm de lerArquivoFatiado(file), de fatiador.js, quando ele está carregado. */

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
    const c = custoProduto(p), est = num(p.estoque), minimo = num(p.estoqueMinimo);
    const canais = canaisDoProduto(p).filter(x => x.vende);
    const busca = cadNorm((p.nome || '') + ' ' + (p.categoria || '') + ' ' + (p.sku || ''));
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
    const sub = [p.categoria ? esc(p.categoria) : '', p.sku ? 'SKU ' + esc(p.sku) : ''].filter(Boolean).join(' · ');
    const acabamento = p.acabamento ? `<span title="${esc(p.etapasAcabamento || 'Passa por acabamento depois de imprimir')}">${selo('Acabamento', 'info')}</span>` : '';
    /* estoque mínimo: "mín. N" embaixo do estoque e o selo quando está abaixo dele */
    const estMin = minimo > 0 ? `<small>mín. ${nf(minimo)}</small>${est < minimo ? selo('Abaixo do mínimo', 'warn') : ''}` : '';
    return `<tr data-busca="${esc(busca)}"${mostra ? '' : ' hidden'}>
      <td><div class="comfoto">${foto}<div style="min-width:110px;max-width:240px"><b>${esc(p.nome)}</b>${sub ? `<small>${sub}</small>` : ''}${acabamento}</div></div></td>
      <td><span class="nowrap">${pontos}</span><small class="nowrap">${gramas(c.pesoG)} · ${horasFmt(c.horas)}</small>${c.semFilamento ? selo('Sem filamento', 'warn') : ''}</td>
      <td class="right num">${brl(c.custo)}</td>
      <td>${precos}</td>
      <td class="right num${est < 0 ? ' neg' : ''}">${nf(est)}${estMin}</td>
      <td><div class="stack" style="gap:6px">${usar ? `<div class="rowbtns">${usar}</div>` : ''}<div class="rowbtns">${cuidar}</div></div></td>
    </tr>`;
  }).join('');
  const semFilamento = S.filamentos.length ? '' :
    '<div class="panel"><span class="aviso">Nenhum filamento cadastrado.</span> Sem filamento não dá para calcular o custo das peças. <a href="#filamentos">Cadastrar filamento</a></div>';
  return topo + semFilamento + `<div class="panel">
    <div class="filtros"><div class="espaco" style="max-width:380px">
      <label for="cadBuscaProd">Buscar produto</label>
      <input id="cadBuscaProd" type="search" autocomplete="off" placeholder="Nome, categoria ou SKU" value="${esc(cadBusca)}" oninput="cadFiltrarProdutos(this.value)">
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
  /* o SKU não vai junto: cada código do marketplace liga um produto só */
  const copia = { ...p, nome: (p.nome || '') + ' (cópia)', foto: null, arquivo: null, estoque: 0, sku: '' };
  delete copia.id;
  cadFormProduto(null, copia);
}
function cadExcluirProduto(id) {
  const p = byId('produtos', id);
  if (!p) return;
  const abertas = S.ordens.filter(o => o.produtoId === id && ORDEM_ABERTA(o)).length;   // fila, impressora e acabamento
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
  /* quem faz cada etapa da mão de obra: vazio = valor geral da hora (Configuração) */
  const pesOpts = [['', `Valor geral (${brl(S.config.maoObraHora)}/h)`],
    ...cadPorNome(S.pessoas).map(p => [p.id, `${p.nome} (${brl(valorHora(p.id))}/h)`])];
  /* Se o produto cita um filamento, insumo ou pessoa que foi excluído, a opção continua na lista:
     assim nada é trocado sem a pessoa ver. */
  (b.materiais || []).forEach(m => { if (m.filamentoId && !filOpts.some(o => o[0] === m.filamentoId)) filOpts.push([m.filamentoId, 'Filamento excluído — escolha outro']); });
  (b.insumos || []).forEach(x => { if (x.insumoId && !insOpts.some(o => o[0] === x.insumoId)) insOpts.push([x.insumoId, 'Insumo excluído — escolha outro']); });
  linhasMaoObra(b).forEach(l => { if (l.pessoaId && !pesOpts.some(o => o[0] === l.pessoaId)) pesOpts.push([l.pessoaId, 'Pessoa excluída (vale o valor geral)']); });
  const leFatiado = typeof lerArquivoFatiado === 'function';
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
    { k: 'arquivo', type: 'file', label: 'Modelo 3D (STL, 3MF…)', pasta: 'modelos', accept: '.stl,.3mf,.obj,.step,.stp,.gcode,.gco,.zip',
      /* arquivo do fatiador (.3mf, .gcode): o peso e o tempo são lidos enquanto ele é enviado */
      ...(leFatiado ? { hint: 'Com o arquivo .3mf ou .gcode do fatiador, o peso e o tempo são lidos sozinhos', aoEscolher: file => cadAoEscolherModelo(file) } : {}) },
    { type: 'titulo', label: 'Impressão' },
    ...(leFatiado ? [{ type: 'html', html: cadBlocoFatiado() }] : []),
    { k: 'materiais', type: 'rows', label: 'Filamento usado em uma peça', min: 1, add: '+ Outra cor ou material',
      cols: [
        { k: 'filamentoId', label: 'Filamento', type: 'select', options: filOpts, w: '2fr' },
        { k: 'pesoG', label: 'Peso (g)', type: 'number' },
      ],
      novo: () => ({ filamentoId: filOpts[0] ? filOpts[0][0] : '' }) },
    { k: 'horas', type: 'number', tempo: 'h', label: 'Tempo de impressão', hint: 'Em horas. Pode digitar 2,5 ou 2h30' },
    { k: 'extras', type: 'number', label: 'Outros custos por peça (R$)' },
    campoInsumos,
    { type: 'titulo', label: 'Mão de obra e acabamento' },
    { k: 'maoObra', type: 'rows', label: 'Mão de obra em uma peça', add: '+ Etapa',
      cols: [
        { k: 'etapa', label: 'Etapa', ph: 'Ex.: Acabamento', w: '1.3fr' },
        { k: 'pessoaId', label: 'Quem faz', type: 'select', options: pesOpts, w: '1.5fr' },
        { k: 'minutos', label: 'Minutos', type: 'number', tempo: 'min' },
      ],
      novo: () => ({ etapa: '', pessoaId: '', minutos: '' }),
      hint: 'Cada etapa usa o valor da hora de quem faz. As pessoas ficam na Configuração. Pode digitar 15 ou 1h30' },
    { k: 'acabamento', type: 'check', label: 'Passa por acabamento depois de imprimir: lixar, pintar, montar…' },
    { k: 'etapasAcabamento', label: 'Etapas do acabamento', ph: 'Ex.: lixar, pintar e montar',
      hint: 'A ordem vai para "Em acabamento" quando a impressão termina e só entra no estoque quando o acabamento fica pronto' },
    { type: 'titulo', label: 'Estoque e marketplace' },
    { k: 'estoque', type: 'number', neg: true, label: 'Peças prontas em estoque', hint: 'Ajuste manual; a produção e as vendas mexem aqui sozinhas' },
    { k: 'estoqueMinimo', type: 'number', step: 1, label: 'Estoque mínimo de peças prontas', hint: '0 para produto sob encomenda. Abaixo do mínimo o sistema sugere a ordem de produção' },
    { k: 'sku', label: 'Código na Shopee / Mercado Livre (SKU)', full: true, hint: 'Liga as vendas que vierem do marketplace a este produto' },
    { type: 'titulo', label: 'Preço de venda em cada canal' },
    ...camposPreco,
  ];
}
/* Prévia do formulário de produto: custo de uma peça e o resultado em cada canal, com o preço sugerido. */
function cadPreviaProduto(d, insumosFixos) {
  const tmp = {
    materiais: (d.materiais || []).filter(m => m.pesoG > 0),
    horas: d.horas,
    maoObra: (d.maoObra || []).filter(l => l.minutos > 0),
    insumos: d.insumos ? d.insumos.filter(x => x.qtd > 0) : insumosFixos,
    extras: d.extras,
  };
  const c = custoProduto(tmp);
  const linha = (rotulo, valor, cls) => `<div${cls ? ` class="${cls}"` : ''}><span>${rotulo}</span><b>${brl(valor)}</b></div>`;
  /* uma linha por etapa: minutos × valor da hora de quem faz */
  const maoObra = c.mo.length
    ? c.mo.map(l => linha('Mão de obra' + (l.etapa ? ': ' + esc(l.etapa) : '') + (l.pessoa ? ' · ' + esc(l.pessoa.nome) : '') +
        ' (' + nf(l.minutos, 1) + ' min × ' + brl(l.valorHora) + '/h)', l.custo)).join('')
    : linha('Mão de obra (nenhuma etapa)', 0);
  let html = `<div class="calc"><h4>Custo de uma peça</h4>
    ${linha('Filamento (' + gramas(c.pesoG) + ')', c.filamento)}
    ${linha('Energia (' + horasFmt(c.horas) + ' de impressão)', c.energia)}
    ${linha('Desgaste e manutenção da máquina', c.maquina)}
    ${linha('Gastos fixos rateados', c.fixos)}
    ${linha('Reserva para falhas (' + pct(c.falhaPct) + (c.falhaReal ? ', taxa real' : '') + ')', c.falhas)}
    ${maoObra}
    ${linha('Insumos', c.insumos)}
    ${linha('Outros custos', c.extras)}
    ${linha('Custo de produção', c.custo, 'tot')}
  </div>`;
  if (!tmp.materiais.length) return html + '<p class="hint" style="margin-top:10px">Informe o peso de pelo menos um filamento para ver o lucro e o preço sugerido em cada canal.</p>';
  if (c.semFilamento) html += '<p class="aviso txt-sm" style="margin-top:10px">Um dos filamentos foi excluído. Escolha outro para o custo ficar certo.</p>';
  if (!S.canais.length) return html;
  const linhas = S.canais.map(canal => {
    const x = precoNoCanal(tmp, canal, d['preco_' + canal.id], c.custo), cls = x.lucro < 0 ? 'neg' : 'pos';
    /* cada canal tem a sua margem desejada (sem margem própria, vale a geral da Configuração) */
    const sugerido = x.sugerido > 0
      ? `<div class="rowbtns" style="align-items:center"><div class="num">${brl(x.sugerido)}<small>margem de ${pct(x.margemAlvo)}</small></div>
          <button type="button" class="btn ghost sm" data-campo="preco_${esc(canal.id)}" data-valor="${x.sugerido.toFixed(2)}" onclick="setCampo(this.dataset.campo, this.dataset.valor)">Usar</button></div>`
      : `<span class="muted txt-sm">As taxas e a margem de ${pct(x.margemAlvo)} passam de 100%</span>`;
    return `<tr><td class="nowrap">${esc(canal.nome)}</td>${x.vende
      ? `<td class="right num">${brl(x.preco)}</td><td class="right num">${brl(x.taxa)}</td><td class="right num">${brl(x.frete)}</td>
         <td class="right num">${brl(x.imposto)}</td><td class="right num ${cls}">${brl(x.lucro)}</td><td class="right num ${cls}">${pct(x.margem)}</td>`
      : '<td colspan="6" class="muted">Sem preço: o produto não é vendido neste canal</td>'}<td class="right">${sugerido}</td></tr>`;
  }).join('');
  return html + `<div class="calc"><h4>Resultado de uma peça em cada canal</h4>
    <section>${tabela(['Canal', { t: 'Preço', r: 1 }, { t: 'Taxa do canal', r: 1 }, { t: 'Frete', r: 1 }, { t: 'Imposto', r: 1 }, { t: 'Lucro', r: 1 }, { t: 'Margem', r: 1 },
      { t: 'Preço sugerido', r: 1 }], linhas)}</section>
    <p class="hint">O preço sugerido cobre o custo, a taxa do canal, o frete e o imposto, e ainda deixa a margem desejada de cada canal. Clique em Usar para preencher.</p>
  </div>`;
}
/* orig: produto em edição (ou null); base: valores iniciais (o próprio produto, uma cópia ou null). */
function cadFormProduto(orig, base) {
  if (!S.filamentos.length) { toast('Cadastre um filamento antes de cadastrar um produto.'); ir('filamentos'); return; }
  const temInsumos = S.insumos.length > 0;
  const aoAbrir = orig ? { ...orig } : null;
  const insumosFixos = ((base || {}).insumos || []).map(x => ({ ...x }));   // valem quando o campo de insumos não aparece
  const vals = base ? { ...base } : { estoque: 0, estoqueMinimo: 0 };
  /* mão de obra em linhas (produto antigo, só com minutos, vira uma linha no valor geral); produto novo começa com uma etapa */
  vals.maoObra = base
    ? linhasMaoObra(base).map(l => ({ etapa: l.etapa || '', pessoaId: l.pessoaId || '', minutos: num(l.minutos) }))
    : [{ etapa: 'Preparo e embalagem', pessoaId: '', minutos: 10 }];
  S.canais.forEach(c => { const v = num((vals.precos || {})[c.id]); vals['preco_' + c.id] = v > 0 ? v : ''; });
  cadFatiadoAtual = null; cadFatiadoSeq++;    // leitura do fatiador de uma janela anterior não vale para esta
  openForm({
    title: orig ? 'Editar produto' : base ? 'Novo produto (cópia)' : 'Novo produto',
    registro: orig ? ['produtos', orig.id] : null,
    wide: true,
    fields: cadCamposProduto(base, temInsumos),
    vals,
    preview: d => cadPreviaProduto(d, insumosFixos),
    save: d => {
      if (!d.nome) { toast('Informe o nome do produto.', 'bad'); return false; }
      const materiais = (d.materiais || []).filter(m => m.filamentoId && m.pesoG > 0).map(m => ({ filamentoId: m.filamentoId, pesoG: m.pesoG }));
      if (!materiais.length) { toast('Informe o peso de pelo menos um filamento.', 'bad'); return false; }
      /* o SKU liga as vendas do marketplace a um produto só: dois produtos com o mesmo código confundiriam a ligação */
      const sku = String(d.sku || '').trim();
      const outro = sku ? S.produtos.find(x => (!orig || x.id !== orig.id) && cadNorm(x.sku).trim() === cadNorm(sku)) : null;
      if (outro) { toast(`O código ${sku} já está no produto "${outro.nome}". Cada código só pode ligar um produto.`, 'bad'); return false; }
      const maoObra = (d.maoObra || []).filter(l => l.minutos > 0).map(l => ({ etapa: l.etapa, pessoaId: l.pessoaId, minutos: l.minutos }));
      const atual = orig ? byId('produtos', orig.id) : null;
      const precos = {};
      S.canais.forEach(c => { const v = num(d['preco_' + c.id]); if (v > 0) precos[c.id] = v; });
      const rec = {
        ...(atual || {}),
        nome: d.nome, categoria: d.categoria, foto: d.foto || null, arquivo: d.arquivo || null,
        materiais, horas: d.horas, maoObra, maoObraMin: soma(maoObra, 'minutos'),
        insumos: d.insumos ? d.insumos.filter(x => x.insumoId && x.qtd > 0).map(x => ({ insumoId: x.insumoId, qtd: x.qtd })) : insumosFixos,
        extras: d.extras,
        acabamento: !!d.acabamento, etapasAcabamento: d.etapasAcabamento || '',
        estoque: Math.round(num(cadValorAtual(d, 'estoque', aoAbrir, atual))),
        estoqueMinimo: Math.max(0, Math.round(num(d.estoqueMinimo))),
        sku,
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

/* ---------- Arquivo do fatiador: peso e tempo de impressão ----------
   lerArquivoFatiado(file) fica em fatiador.js. Com uma placa, o tempo e os filamentos são preenchidos na hora; com
   várias, a pessoa escolhe a placa no quadro #cadFatiado. O que foi lido vale só para a janela que está aberta. */
let cadFatiadoAtual = null;   // { form, nome, origem, placas, avisos, escolhida, pecas, lig }
let cadFatiadoSeq = 0;        // cada leitura nova invalida a anterior que ainda não terminou
const cadCorParecida = 100;   // distância de cor (vai de 0 a 441) até onde duas cores contam como parecidas
const cadSemMovimento = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
/* Botão, campo de arquivo escondido e quadro informativo, dentro do formulário de produto. */
function cadBlocoFatiado() {
  return `<div class="inline">
      <button type="button" class="btn ghost sm" onclick="cadEscolherFatiado()">Ler peso e tempo do arquivo do fatiador</button>
      <span class="hint" style="margin:0">Arquivo .3mf ou .gcode. Só lê: o arquivo não é enviado.</span>
      <input type="file" id="cadFatiadoArq" hidden accept=".3mf,.gcode,.gco" onchange="event.stopPropagation(); cadArquivoFatiado(this)">
    </div>
    <div id="cadFatiado" class="calc cad-fatiado" hidden aria-live="polite"></div>`;
}
function cadEscolherFatiado() { const el = $('#cadFatiadoArq'); if (el) el.click(); }
function cadArquivoFatiado(el) {
  const file = el.files && el.files[0];
  el.value = '';                                   // deixa escolher o mesmo arquivo de novo
  if (file) cadLerFatiado(file, true);
}
/* Modelo 3D escolhido no formulário (aoEscolher do campo): se for arquivo do fatiador, lê o peso e o tempo. */
function cadAoEscolherModelo(file) {
  if (file && /\.(3mf|gcode|gco)$/i.test(String(file.name || ''))) return cadLerFatiado(file, false);
}
/* Lê o arquivo. manual: veio do botão "Ler peso e tempo" (erro em vermelho); senão, do campo Modelo 3D, onde um
   modelo que não foi fatiado também é um arquivo válido (o aviso é mais leve). */
async function cadLerFatiado(file, manual) {
  if (typeof lerArquivoFatiado !== 'function' || !FORM) return;
  const meuForm = FORM, seq = ++cadFatiadoSeq;
  cadFatiadoPintar(`<p class="inline"><span class="spin"></span><span>Lendo ${esc(file.name)}…</span></p>`);
  let r;
  try { r = await lerArquivoFatiado(file); }
  catch (e) { console.error(e); r = { ok: false, erro: 'Não foi possível ler este arquivo.' }; }
  if (FORM !== meuForm || seq !== cadFatiadoSeq) return;          // a janela fechou ou outra leitura começou
  /* só valem as placas que trazem o tempo ou o peso */
  const placas = r && r.ok && Array.isArray(r.placas)
    ? r.placas.filter(pl => pl && typeof pl === 'object' && (num(pl.horas) > 0 || cadFilamentosDaPlaca(pl).length > 0))
    : [];
  if (!placas.length) {
    const erro = r && !r.ok && r.erro ? String(r.erro) : 'O arquivo não traz o peso nem o tempo da impressão.';
    if (manual) {                                                  // o motivo fica no formulário, para dar tempo de ler
      cadFatiadoPintar(`<h4>Não deu para ler este arquivo</h4><p class="aviso txt-sm" style="margin:0">${esc(erro)}</p>`);
      toast('Não deu para ler o arquivo. O motivo está no formulário.', 'bad');
    } else {
      cadFatiadoRepintar();                                        // volta o que estava antes (ou esconde o quadro)
      toast('Este arquivo não traz o peso e o tempo. Para preencher sozinho, use "Ler peso e tempo do arquivo do fatiador" com o arquivo fatiado.');
    }
    return;
  }
  cadFatiadoAtual = {
    form: meuForm, nome: String(file.name || 'arquivo'), origem: String(r.origem || ''), placas,
    avisos: (Array.isArray(r.avisos) ? r.avisos : []).map(a => String(a ?? '')).filter(Boolean), escolhida: -1, pecas: 1, lig: [],
  };
  if (placas.length === 1) cadUsarPlaca(0);
  else { cadFatiadoRepintar(); toast(`O arquivo tem ${placas.length} placas. Escolha a deste produto no formulário.`); }
  const box = $('#cadFatiado');
  if (box && box.scrollIntoView) box.scrollIntoView({ block: 'nearest', behavior: cadSemMovimento() ? 'auto' : 'smooth' });
}
/* Filamentos da placa que têm peso. Sem a divisão por filamento, o peso total da placa vale como um filamento só. */
function cadFilamentosDaPlaca(pl) {
  const todos = (Array.isArray(pl.filamentos) ? pl.filamentos : []).filter(f => f && typeof f === 'object');
  const comPeso = todos.filter(f => num(f.gramas) > 0);
  if (comPeso.length || !(num(pl.gramas) > 0)) return comPeso;
  const f0 = todos[0] || {};
  return [{ tipo: f0.tipo || '', cor: f0.cor || '', gramas: num(pl.gramas) }];
}
/* "#rgb", "#rrggbb" ou "#rrggbbaa" → [r, g, b]; qualquer outra coisa → null. */
function cadRGB(c) {
  let h = String(c ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3,4}$/i.test(h)) h = h.slice(0, 3).split('').map(x => x + x).join('');
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) return null;
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
/* Liga um filamento do arquivo a um filamento cadastrado: o do mesmo tipo (PLA, PETG…) com a cor mais parecida; sem
   nenhum do mesmo tipo, a cor mais parecida entre todos. atuais: filamentos já escolhidos no formulário, que desempatam
   quando o arquivo não diz a cor. Devolve { alvo, incerto, porque: [motivos da dúvida] }. */
function cadLigarFilamento(f, atuais) {
  const todos = cadPorNome(S.filamentos);
  const tipo = cadNorm(f.tipo).trim();
  const mesmoTipo = tipo ? todos.filter(x => cadNorm(x.tipo).trim() === tipo) : [];
  const grupo = mesmoTipo.length ? mesmoTipo : todos;
  const rgb = cadRGB(f.cor);
  let alvo = null, dist = Infinity;
  if (rgb) {
    grupo.forEach(x => {
      const c = cadRGB(x.cor), d = c ? Math.hypot(rgb[0] - c[0], rgb[1] - c[1], rgb[2] - c[2]) : Infinity;
      if (d < dist) { dist = d; alvo = x; }
    });
  }
  if (!alvo) alvo = grupo.find(x => (atuais || []).includes(x.id)) || grupo[0] || null;
  const porque = [];
  if (!tipo) porque.push('o arquivo não diz o material');
  else if (!mesmoTipo.length) porque.push(`não há ${String(f.tipo).trim()} cadastrado`);
  if (!rgb) porque.push('o arquivo não diz a cor');
  else if (dist > cadCorParecida) porque.push('a cor cadastrada mais parecida ainda é diferente');
  return { alvo, incerto: porque.length > 0, porque };
}
/* Escolhe uma placa: liga cada filamento do arquivo a um filamento cadastrado e preenche o formulário. */
function cadUsarPlaca(i) {
  const L = cadFatiadoAtual;
  if (!L || !FORM || L.form !== FORM) return;
  const k = Math.round(num(i)), pl = L.placas[k];
  if (!pl) return;
  const atuais = $$('[data-rows="materiais"] [data-col="filamentoId"]', FORM.form).map(el => el.value);
  L.lig = cadFilamentosDaPlaca(pl).map(f => ({ f, ...cadLigarFilamento(f, atuais) }));
  L.escolhida = k; L.pecas = 1;
  cadAplicarPlaca(false);
  const temTempo = num(pl.horas) > 0, temPeso = L.lig.some(x => x.alvo);
  toast(temTempo && temPeso ? 'Tempo e filamento preenchidos com o arquivo do fatiador. Confira antes de salvar.'
    : temTempo ? 'Tempo preenchido com o arquivo do fatiador. O peso do filamento não veio no arquivo.'
      : temPeso ? 'Filamento preenchido com o arquivo do fatiador. O tempo não veio no arquivo.'
        : 'Não deu para ligar os filamentos do arquivo aos filamentos cadastrados.');
}
/* Quantas peças a placa tem: o tempo e o peso preenchidos são divididos por elas. */
function cadMudarPecas(v) {
  const L = cadFatiadoAtual;
  if (!L || !FORM || L.form !== FORM || !L.placas[L.escolhida]) return;
  L.pecas = Math.max(1, Math.round(num(v)) || 1);
  cadAplicarPlaca(true);
  const campoPecas = $('#cadFatiado [data-pecas]');
  if (campoPecas) campoPecas.focus();              // o quadro foi redesenhado: o foco continua no campo de peças
}
/* Volta para a lista de placas do arquivo (o formulário fica como está até escolher outra). */
function cadMostrarPlacas() {
  const L = cadFatiadoAtual;
  if (!L || !FORM || L.form !== FORM) return;
  L.escolhida = -1;
  cadFatiadoRepintar();
}
/* Preenche o tempo e os filamentos de UMA peça com a placa escolhida. manter: só mudou o número de peças; se as linhas
   de filamento continuam as mesmas, ficam os filamentos que a pessoa escolheu nelas. */
function cadAplicarPlaca(manter) {
  const L = cadFatiadoAtual, pl = L && L.placas[L.escolhida];
  if (!pl || !FORM || L.form !== FORM) return;
  const n = L.pecas, usados = L.lig.filter(x => x.alvo);
  const atuais = $$('[data-rows="materiais"] [data-col="filamentoId"]', FORM.form).map(el => el.value);
  if (manter && atuais.length === usados.length) {
    usados.forEach((x, j) => {
      const f = byId('filamentos', atuais[j]);
      if (f && f.id !== x.alvo.id) Object.assign(x, { alvo: f, incerto: false, porque: [] });
    });
  }
  if (num(pl.horas) > 0) setCampo('horas', arred(num(pl.horas) / n, 2));
  if (usados.length) setLinhas('materiais', usados.map(x => ({ filamentoId: x.alvo.id, pesoG: arred(num(x.f.gramas) / n, 1) })));
  cadFatiadoRepintar();
}
/* De onde veio o arquivo, em palavras que a pessoa entende. */
const cadOrigens = { 'bambu-3mf': 'arquivo fatiado do Bambu Studio / OrcaSlicer', 'gcode-bambu': 'G-code do Bambu Studio', 'gcode-orca': 'G-code do OrcaSlicer',
  'gcode-prusa': 'G-code do PrusaSlicer', 'gcode-cura': 'G-code do Cura', gcode: 'G-code' };
function cadFatiadoPintar(html) {
  const box = $('#cadFatiado');
  if (!box) return;
  box.innerHTML = html || '';
  box.hidden = !html;
}
/* Desenha o quadro: a lista de placas para escolher ou o que foi preenchido com a placa escolhida, com cada filamento
   do arquivo e o filamento cadastrado ligado a ele (e o aviso quando a escolha é incerta). */
function cadFatiadoRepintar() {
  const L = cadFatiadoAtual;
  if (!L || !FORM || L.form !== FORM) return cadFatiadoPintar('');
  const nomePlaca = (pl, i) => esc(pl.nome || 'Placa ' + (i + 1));
  /* nome do arquivo (e da placa escolhida, quando há várias) numa linha que quebra: nomes longos não estouram no celular */
  const escolhida = L.escolhida >= 0 && L.placas.length > 1 ? ' · ' + nomePlaca(L.placas[L.escolhida], L.escolhida) : '';
  const titulo = `<h4>Lido do arquivo do fatiador</h4>
    <p class="muted txt-sm" style="margin:0 0 6px;overflow-wrap:anywhere">${esc(L.nome)}${cadOrigens[L.origem] ? ' · ' + esc(cadOrigens[L.origem]) : ''}${escolhida}</p>`;
  const avisos = L.avisos.map(a => `<p class="aviso txt-sm">${esc(a)}</p>`).join('');
  if (L.escolhida < 0) {
    const itens = L.placas.map((pl, i) => {
      const resumo = [num(pl.horas) > 0 ? horasFmt(pl.horas) : '', num(pl.gramas) > 0 ? gramas(pl.gramas) : ''].filter(Boolean).join(' · ');
      return `<li><div style="flex:1;min-width:0"><b>${nomePlaca(pl, i)}</b>${resumo ? `<div class="muted txt-sm">${resumo}</div>` : ''}</div>
        <button type="button" class="btn ghost sm" data-i="${i}" onclick="cadUsarPlaca(this.dataset.i)">Usar esta</button></li>`;
    }).join('');
    return cadFatiadoPintar(`${titulo}<p class="hint" style="margin:0">O arquivo tem ${L.placas.length} placas. Escolha a deste produto:</p>
      <ul class="lista">${itens}</ul>${avisos}`);
  }
  const pl = L.placas[L.escolhida], n = L.pecas, porPeca = n > 1 ? ' por peça' : '';
  const peso = soma(L.lig, x => num(x.f.gramas));
  const ligados = L.lig.map(x => `<li><div style="flex:1;min-width:0">
      <span class="nowrap">${cadRGB(x.f.cor) ? cor(x.f.cor) : ''}${esc(x.f.tipo || 'Filamento')} · ${gramas(num(x.f.gramas) / n)}</span> →
      ${x.alvo ? `${cadPonto(x.alvo.cor)}<b>${esc(x.alvo.nome)}</b>` : '<span class="neg">nenhum filamento cadastrado</span>'}
      ${x.incerto ? `<div class="aviso txt-sm">Confira: ${esc(x.porque.join(' e '))}.</div>` : ''}
    </div>${x.alvo && !x.incerto ? selo('Ok', 'ok') : selo('Confira', 'warn')}</li>`).join('');
  return cadFatiadoPintar(`${titulo}
    <div><span>Peças nesta placa</span><input data-pecas class="status" style="width:5.5em;text-align:right" type="text" inputmode="numeric" value="${n}" aria-label="Peças nesta placa" onchange="cadMudarPecas(this.value)" onkeydown="if (event.key === 'Enter') { event.preventDefault(); this.blur(); }"></div>
    <div><span>Tempo de impressão${porPeca}</span><b>${num(pl.horas) > 0 ? horasFmt(num(pl.horas) / n) : 'não veio no arquivo'}</b></div>
    <div><span>Filamento${porPeca}</span><b>${peso > 0 ? gramas(peso / n) : 'não veio no arquivo'}</b></div>
    ${ligados ? `<ul class="lista">${ligados}</ul>` : ''}
    <p class="hint">O tempo e os filamentos de uma peça já estão no formulário. Se a placa tem várias peças, escolha quantas: o sistema divide o tempo e o peso.</p>
    ${L.placas.length > 1 ? '<p class="mt"><button type="button" class="btn ghost sm" onclick="cadMostrarPlacas()">Usar outra placa</button></p>' : ''}
    ${avisos}`);
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
  /* o estoque fica logo depois do nome (no celular, à vista sem arrastar a tabela) e o próprio número abre o Acertar estoque;
     Comprei abre a compra já preenchida com a última (vira Chegou quando alguém marcou "Já pedi"); Acertar vem no fim da linha */
  const linhas = cadPorNome(S.filamentos).map(f => {
    const est = num(f.estoqueG);
    return `<tr>
      <td class="nowrap">${cadPonto(f.cor)}<b>${esc(f.nome)}</b>${f.pedidoEm ? `<small class="cad-pedido">${cadPedidoTxt({ em: f.pedidoEm, por: f.pedidoPor })}</small>` : ''}</td>
      <td class="right num${est <= alerta ? ' neg' : ''}">${cadNumEstoque('fil', f, gramas(est))}</td>
      <td>${esc(f.tipo || '—')}</td>
      <td class="right num">${brl(f.precoKg)}</td>
      <td class="right num">${brl(valorDe(f))}</td>
      <td class="num">${ultima.has(f.id) ? esc(dataBR(ultima.get(f.id))) : '—'}</td>
      <td><div class="rowbtns">
        ${f.pedidoEm ? cadBtnChegou('fil', f) : cadBtn('Comprei', 'cadNovaCompra', f.id)}
        ${cadBtn('Editar', 'cadEditarFilamento', f.id)}
        ${cadBtn('Excluir', 'cadExcluirFilamento', f.id, 'danger')}
        ${cadBtnAcertar('fil', f.id)}
      </div></td>
    </tr>`;
  }).join('');
  return topo + `<div class="cards">
      ${kpi('Em estoque', gramas(soma(S.filamentos, f => Math.max(0, num(f.estoqueG)))), cadPlural(S.filamentos.length, 'filamento', 'filamentos'))}
      ${kpi('Valor em estoque', brl(soma(S.filamentos, valorDe)), 'pelo preço médio de cada um')}
      ${kpi('Abaixo do alerta', nf(baixos), 'com ' + gramas(alerta) + ' ou menos', baixos ? 'neg' : '')}
    </div>
    <div class="panel">${tabela(['Filamento', { t: 'Estoque', r: 1 }, 'Tipo', { t: 'Preço médio / kg', r: 1 }, { t: 'Valor em estoque', r: 1 }, 'Última compra', ''], linhas)}</div>`;
};
function cadEditarFilamento(id) {
  const f = id ? byId('filamentos', id) : null;
  if (id && !f) return toast('Este filamento não existe mais.', 'bad');
  const aoAbrir = f ? { ...f } : null;
  const tipos = [...cadTiposFilamento];
  if (f && f.tipo && !tipos.includes(f.tipo)) tipos.push(f.tipo);
  openForm({
    title: f ? 'Editar filamento' : 'Novo filamento',
    registro: f ? ['filamentos', f.id] : null,
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
    ${S.filamentos.length || S.insumos.length ? cadListaComprar('compras') : ''}
    <div class="panel"><h2>Compras${lista.length ? `<small>${cadPlural(lista.length, 'registro', 'registros')}</small>` : ''}</h2>${painelCompras}</div>
    <div class="panel"><h2>Fornecedores</h2>${painelFornecedores}</div>`;
};
/* ---------- Comprei: a janela de sempre, já preenchida com a última compra ----------
   A compra (e a reposição de insumo) de um item vem com o fornecedor, o peso (a quantidade) e o valor da última compra
   (reposição) dele, marcados "igual à última"; o cursor fica no valor, selecionado, para conferir ou digitar por cima (no
   celular o teclado não abre sozinho: é só conferir e tocar em Registrar; tocar num número já preenchido seleciona o número
   inteiro). Mudou um campo: a marca dele vira "última: ...". Mudou o peso (a quantidade) e o valor ainda é o que a janela pôs: o
   valor acompanha, pelo preço da última (2 rolos de 1 kg a R$ 104,50 dão R$ 209,00), marcado "pelo preço da última"; nunca fica o
   valor de 1 rolo para 2. A última que ficou fora do comum (alguém confirmou um valor errado assim mesmo) não é repetida: o valor
   vem em branco, com um aviso. Trocou o filamento na janela: o que a pessoa ainda não mexeu passa a ser o da última compra do
   novo. Valor fora do comum (o dobro do preço médio ou mais, a metade ou menos, ou zero; ex.: 1045 no lugar de 104,50) aparece em
   vermelho e pergunta antes de gravar. O Enter que chega logo depois de a janela abrir não grava (esperaEnter). A conta é a de
   sempre (registrarCompra e reporInsumo, em calc.js). Sem Desfazer: excluir a compra não refaz o preço médio. */
const cadDin = v => num(v).toFixed(2).replace('.', ',');                 // dinheiro dentro de um campo: 104,50
/* "PLA Preto", "PLA Preto e Caixa", "PLA Preto, Caixa e Ímã" */
const cadJuntar = l => (l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1]);
/* A marca embaixo de cada campo preenchido: "igual à última (20/11)" enquanto a pessoa não mexe; "pelo preço da última: ..."
   (auto) quando a janela refez o valor para o peso de agora; um aviso (aviso); depois que a pessoa mexe, "última: ...". */
function cadMarcarIgual(form, campos) {
  campos.forEach(c => {
    const el = campoDoForm(form, c.k), caixa = el && el.parentElement;
    if (!caixa) return;
    el.classList.toggle('cad-igual', !!(c.igual || c.auto));
    const marca = c.igual ? `<span class="cad-igual-txt">Igual à última${c.quando ? ' (' + c.quando + ')' : ''}</span>` : c.auto ? `<span class="cad-igual-txt">${maiuscula(c.auto)}</span>`
      : c.aviso ? `<span class="aviso">${maiuscula(c.aviso)}</span>` : c.ultima ? 'última: ' + c.ultima : '';
    const partes = [marca, c.base || ''].filter(Boolean);
    let dica = $('.hint', caixa);
    if (!dica && partes.length) { dica = document.createElement('div'); dica.className = 'hint'; caixa.appendChild(dica); }
    if (dica) dica.innerHTML = partes.length ? maiuscula(partes.join(' · ')) : '';
  });
}
/* O valor pelo preço da última: o mesmo preço por kg (por unidade) para o peso (a quantidade) de agora. Ex.: a última foi 1000 g
   por R$ 104,50 e agora são 2000 g: R$ 209,00. '' quando não dá para saber. */
const cadValorPelaUltima = (uValor, uQtd, qtd) => (num(uQtd) > 0 && num(qtd) > 0 ? arred(num(uValor) * num(qtd) / num(uQtd), 2) : '');
/* No celular, tocar num número já preenchido destas janelas seleciona o número inteiro: digitar troca o valor (como no
   computador, onde o cursor já começa no número, selecionado). Sem isso, o cursor cai onde o dedo tocou e os dígitos se juntam
   ("104,50109,90"). */
function cadTocarSeleciona(form) {
  if (!form || !('ontouchstart' in window)) return;
  $$('input[data-num]', form).forEach(el => {
    let entrou = false;
    const seleciona = e => { if (entrou && el.value) { if (e && e.type === 'mouseup' && e.cancelable) e.preventDefault(); el.select(); } entrou = false; };
    el.addEventListener('focus', () => { entrou = true; });
    el.addEventListener('blur', () => { entrou = false; });
    // o toque põe o cursor onde o dedo caiu; o fim do mesmo toque seleciona o número inteiro. Vale no mouseup, e não só no clique: o
    // toque logo depois de a janela abrir, no mesmo lugar do toque que a abriu, tem o clique barrado pela trava do toque repetido
    el.addEventListener('mouseup', seleciona);
    el.addEventListener('click', seleciona);
  });
}
/* Dinheiro no campo com os centavos (104,50), mantendo o texto selecionado quando o cursor estava nele. */
function cadValorNoCampo(form, k, v) {
  const el = campoDoForm(form, k);
  if (!el) return;
  const selecionado = document.activeElement === el;
  el.value = v === '' || v === null || v === undefined ? '' : cadDin(v);
  validarNumero(el);
  if (selecionado) el.select();
}
/* Quantas vezes o preço médio, em palavras: "10 vezes o preço médio" ou "29% do preço médio". */
const cadVezes = r => (r >= 2 ? `${nf(r, r < 10 ? 1 : 0)} vezes o preço médio` : `${pct(r * 100)} do preço médio`);
/* O preço fora do comum em palavras (r de precoForaDoComum): "R$ 1.045,00 por kg é 10 vezes o preço médio (R$ 104,43)" ou, sem
   custo, "R$ 0,00 por kg (sem custo) faz o preço médio cair (R$ 100,00)". */
const cadForaTxt = (r, unitTxt, medioTxt) => (r === 0 ? `${unitTxt} (sem custo) faz o preço médio cair (${medioTxt})` : `${unitTxt} é ${cadVezes(r)} (${medioTxt})`);
/* O aviso vermelho da prévia quando o preço desta compra está fora do comum (precoForaDoComum, em calc.js). */
function cadAvisoValor(unit, medio, fmt, un) {
  const r = precoForaDoComum(unit, medio);
  return r !== null ? `<div class="cad-conf" role="alert"><b>Confira o valor.</b> ${cadForaTxt(r, fmt(unit) + ' ' + un, fmt(medio))}.</div>` : '';
}
/* Valor fora do comum ao salvar: pergunta antes, com o cursor em "Corrigir o valor" (o Enter de quem nem olhou não grava). */
function cadConferirValor(texto, gravar) {
  perguntar('Confira o valor', texto + ' O valor está certo?', [
    { rotulo: 'Registrar assim mesmo', fn: gravar },
    { rotulo: 'Corrigir o valor', cls: '', foco: true, fn: () => { const v = FORM && campoDoForm(FORM.form, 'valor'); if (v) { v.focus(); v.select(); } } },
  ]);
}
/* Janela aberta pelo Chegou (com a marca do "Já pedi" que ela viu, em) cujo item saiu de A caminho: o outro aparelho registrou a
   chegada (a última compra é depois da marca) ou tirou a marca. Devolve null (o item continua a caminho, com a mesma marca) ou
   { txt, outra } para o aviso e a pergunta (outra: a chegada já foi registrada, e gravar aqui seria outra compra). */
function cadSaiuDoCaminho(t, id, em) {
  const r = byId(cadColDe(t), id);
  if (!em || !r || r.pedidoEm === em) return null;
  const u = t === 'ins' ? ultimaReposicao(r) : ultimaCompra(id);
  if (u && String(u.criadoEm || '') > String(em)) {
    return { outra: true, txt: `Outro aparelho já registrou a chegada de ${r.nome} (${t === 'ins' ? nf(u.qtd, 2) + ' ' + (r.unidade || 'un') : gramas(u.pesoG)}, ${brl(u.valor)}).` };
  }
  return { outra: false, txt: r.pedidoEm ? `${r.nome} foi marcado como pedido de novo no outro aparelho.` : `${r.nome} não está mais a caminho: o outro aparelho tirou a marca.` };
}
/* A janela do Chegou ia gravar a compra de um item que saiu de A caminho enquanto ela estava aberta: pergunta antes, com o cursor
   (e o Enter) em "Não registrar". Não registrar fecha a janela (no Chegou tudo, segue para a próxima). */
function cadPerguntarChegou(saiu, registrar, opc) {
  perguntar('Confira a chegada', esc(saiu.txt) + (saiu.outra ? ' Registrar outra compra?' : ' Registrar a compra assim mesmo?'), [
    { rotulo: saiu.outra ? 'Registrar outra' : 'Registrar assim mesmo', fn: registrar },
    { rotulo: 'Não registrar', cls: '', foco: true, fn: () => { if (FORM) FORM.sujo = false; fecharForm(); if (opc.chegou) cadProximoChegou(); } },
  ]);
}
/* O que a janela de compra traz do filamento: o fornecedor, o peso e o valor da última compra dele (sem compra: 1 kg e o valor
   em branco, como sempre foi). fora: a última ficou fora do comum quando foi registrada (o valor dela não é repetido). */
function cadPreCompra(filamentoId) {
  const u = ultimaCompra(filamentoId), fora = compraForaDoComum(u);
  return { u, fora, fornecedorId: u && byId('fornecedores', u.fornecedorId) ? u.fornecedorId : '', pesoG: u && num(u.pesoG) > 0 ? num(u.pesoG) : 1000, valor: u && !fora ? num(u.valor) : '' };
}
/* Abre o formulário de compra de filamento (já com o filamento escolhido, se vier o id), preenchido com a última compra dele.
   Também é chamado por outras telas. Sem filamento escolhido (Registrar compra, + Nova compra), a janela abre como sempre (o valor
   em branco) e só se preenche quando a pessoa escolhe o filamento. opc.chegou: "2 de 3" (Chegou tudo: uma compra de cada vez; ao
   registrar, abre a próxima). opc.em: aberta pelo Chegou, com a marca do "Já pedi" que a tela mostrava (se ela sumir com a janela
   aberta, pergunta antes de gravar). */
function cadNovaCompra(filamentoId, opc = {}) {
  if (!S.filamentos.length) { toast('Cadastre um filamento antes de registrar uma compra.'); ir('filamentos'); return; }
  const filamentos = cadPorNome(S.filamentos), vistos = codigosNaTela('compras');   // as compras na tela ao abrir a janela
  const escolhido = !!byId('filamentos', filamentoId), ini = escolhido ? filamentoId : filamentos[0].id, aberta = Date.now(), mexeu = new Set();
  let pre = escolhido ? cadPreCompra(ini) : { u: null, fora: false, fornecedorId: '', pesoG: 1000, valor: '' }, valorConferido = false, outraConfirmada = false;
  const pesoDoCampo = form => numTexto((campoDoForm(form, 'pesoG') || {}).value);
  // o peso de agora é outro que o da última (e dá para saber o preço por kg dela)
  const outroPeso = form => { const u = pre.u, g = pesoDoCampo(form); return !!u && num(u.pesoG) > 0 && isFinite(g) && g > 0 && g !== num(u.pesoG); };
  // o valor que a janela põe enquanto a pessoa não mexe nele: o da última ou, com outro peso, pelo preço da última
  const valorAuto = form => (!pre.u || pre.fora ? '' : outroPeso(form) ? cadValorPelaUltima(pre.u.valor, pre.u.pesoG, pesoDoCampo(form)) : num(pre.u.valor));
  // o texto que a janela pôs no campo do valor: enquanto ele estiver lá, a pessoa não mexeu no valor
  let valorPosto = '';
  const porValor = (form, v) => { cadValorNoCampo(form, 'valor', v); valorPosto = (campoDoForm(form, 'valor') || {}).value; };
  const valorIntacto = form => !mexeu.has('valor') && (campoDoForm(form, 'valor') || {}).value === valorPosto;
  const marcar = form => {
    const u = pre.u, quando = u ? dataCurta(u.data) : '', auto = !!u && !pre.fora && valorIntacto(form);
    cadMarcarIgual(form, [
      { k: 'fornecedorId', igual: !!u && !!pre.fornecedorId && !mexeu.has('fornecedorId'), quando, ultima: u ? nomeDe('fornecedores', u.fornecedorId, 'sem fornecedor') : '' },
      { k: 'pesoG', igual: !!u && !mexeu.has('pesoG'), quando, ultima: u ? gramas(u.pesoG) : '', base: 'em gramas: 1 kg = 1000' },
      { k: 'valor', igual: auto && !outroPeso(form), auto: auto && outroPeso(form) ? `pelo preço da última: ${brl(num(u.valor) / (num(u.pesoG) / 1000))} o kg (${quando})` : '',
        aviso: u && pre.fora && valorIntacto(form) ? `a última (${brl(u.valor)}, ${quando}) ficou fora do comum: digite o valor` : '',
        quando, ultima: u ? `${brl(u.valor)} (${quando})` : '', base: 'inclua o frete' },
    ]);
  };
  openForm({
    title: 'Registrar compra de filamento' + (opc.chegou ? ` (${opc.chegou})` : ''),
    saveLabel: 'Registrar compra',
    foco: 'valor', esperaEnter: 500,
    fields: [
      { k: 'data', label: 'Data da compra', type: 'date' },
      { k: 'filamentoId', label: 'Filamento', type: 'select', req: true, options: filamentos.map(f => [f.id, f.nome]) },
      { k: 'fornecedorId', label: 'Fornecedor', type: 'select', options: [['', '— sem fornecedor —'], ...cadPorNome(S.fornecedores).map(f => [f.id, f.nome])] },
      { k: 'pesoG', label: 'Peso comprado (g)', type: 'number', req: true, hint: 'Em gramas: 1 kg = 1000' },
      { k: 'valor', label: 'Valor total pago (R$)', type: 'number', req: true, hint: 'Inclua o frete' },
      { k: 'obs', label: 'Observação' },
    ],
    vals: { data: hoje(), filamentoId: ini, fornecedorId: pre.fornecedorId, pesoG: pre.pesoG, valor: pre.valor },
    change: (el, form) => {
      if (el.name === 'filamentoId') {
        pre = cadPreCompra(el.value);
        if (!mexeu.has('fornecedorId')) campoDoForm(form, 'fornecedorId').value = pre.fornecedorId;
        if (!mexeu.has('pesoG')) { campoDoForm(form, 'pesoG').value = paraCampo(pre.pesoG); validarNumero(campoDoForm(form, 'pesoG')); }
        if (valorIntacto(form)) porValor(form, valorAuto(form));
      } else if (['fornecedorId', 'pesoG', 'valor'].includes(el.name)) {
        // o peso mudou e o valor ainda é o que a janela pôs: ele acompanha, pelo preço da última (nunca fica o valor de 1 rolo para 2)
        if (el.name === 'pesoG' && valorIntacto(form) && valorAuto(form) !== '') porValor(form, valorAuto(form));
        else if (!valorIntacto(form)) mexeu.add('valor');
        mexeu.add(el.name);
      }
      marcar(form);
    },
    preview: (d, form) => {
      const f = byId('filamentos', d.filamentoId), g = num(d.pesoG), valor = num(d.valor);
      if (!f) return '';
      /* campo de valor ainda em branco não é o mesmo que R$ 0,00 digitado (brinde): só calcula depois de preenchido */
      const semValor = !!(form && form.elements.valor && form.elements.valor.value.trim() === '');
      if (!(g > 0) || semValor) return '<p class="hint" style="margin-top:10px">Informe o peso e o valor pago para ver como ficam o estoque e o preço médio.</p>';
      /* mesma conta de registrarCompra (calc.js): média ponderada com o que já havia, sem contar estoque negativo */
      const est = num(f.estoqueG), base = Math.max(0, est);
      const novoPreco = arred((base / 1000 * num(f.precoKg) + valor) / ((base + g) / 1000), 2);
      const porKg = valor / (g / 1000), fila = situacaoMaterial('fil', f).fila, depois = arred(est + g - fila, 3);
      return cadAvisoValor(porKg, num(f.precoKg), brl, 'por kg') + `<div class="calc">
        <div><span>Preço por kg desta compra</span><b>${brl(porKg)}</b></div>
        <div><span>Estoque depois da compra (hoje: ${gramas(est)})</span><b>${gramas(arred(est + g))}</b></div>
        ${fila > 0 ? `<div><span>Depois da fila (ela usa ${gramas(fila)})</span><b class="${depois < 0 ? 'neg' : ''}">${depois >= 0 ? 'sobram ' + gramas(depois) : 'ainda faltam ' + gramas(-depois)}</b></div>` : ''}
        <div class="tot"><span>Novo preço médio por kg (hoje: ${brl(f.precoKg)})</span><b>${brl(novoPreco)}</b></div>
      </div>` + (g < 50 ? '<p class="aviso txt-sm" style="margin-top:10px">Confira o peso: ele é em gramas (1 kg = 1000).</p>' : '');
    },
    save: d => {
      if (opc.depois && Date.now() - aberta < 800) return false;       // Chegou tudo: o 2º toque (ou Enter) na anterior não grava esta
      if (!byId('filamentos', d.filamentoId)) { toast('Escolha o filamento comprado.', 'bad'); return false; }
      if (!(d.pesoG > 0)) { toast('Informe o peso comprado, em gramas.', 'bad'); return false; }
      if (!(d.valor >= 0)) { toast('O valor pago não pode ser negativo.', 'bad'); return false; }
      // aberta pelo Chegou: o item saiu de A caminho com a janela aberta (o outro aparelho registrou a chegada ou tirou a marca)
      const saiu = opc.em && d.filamentoId === filamentoId && !outraConfirmada ? cadSaiuDoCaminho('fil', filamentoId, opc.em) : null;
      if (saiu) { cadPerguntarChegou(saiu, () => { outraConfirmada = true; FORM.form.requestSubmit(); }, opc); return false; }
      // código fixo (material, dia, peso, valor e um contador que pula só as compras que já estavam na tela ao abrir a janela):
      // a mesma compra salva nos dois aparelhos entra uma vez só, mesmo quando a do outro chega com esta janela aberta. Quem
      // confirmou "Registrar outra" grava outra compra: o contador pula também as que estão na tela agora
      const id = codigoCompra(d, outraConfirmada ? codigosNaTela('compras') : vistos), ja = byId('compras', id), f = byId('filamentos', d.filamentoId);
      if (ja) { toast(`Outro aparelho já registrou esta compra (${gramas(ja.pesoG)}${f ? ' de ' + f.nome : ''}, ${brl(ja.valor)}) enquanto esta janela estava aberta. Nada foi gravado em dobro: confira em Compras e registre de novo, se for outra.`, 'bad'); return; }
      // valor fora do comum: pergunta antes (depois de ver que a compra ainda não entrou: não pergunta à toa)
      const conferido = valorConferido, porKg = d.valor / (d.pesoG / 1000), r = precoForaDoComum(porKg, num(f.precoKg));
      valorConferido = false;
      if (r !== null && !conferido) {
        cadConferirValor(r === 0 ? `<b>${esc(f.nome)}</b> sem custo (${brl(0)}) faz o preço médio cair (${brl(f.precoKg)} por kg).`
          : `<b>${esc(f.nome)}</b> a <b>${brl(porKg)} por kg</b> é ${cadVezes(r)} (${brl(f.precoKg)}).`, () => { valorConferido = true; FORM.form.requestSubmit(); });
        return false;
      }
      registrarCompra({ ...d, id });
      toast('Compra registrada. Estoque e preço médio atualizados.');
      if (opc.chegou) cadProximoChegou();
    },
  });
  porValor(FORM.form, pre.valor);
  marcar(FORM.form);
  cadTocarSeleciona(FORM.form);
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
    registro: f ? ['fornecedores', f.id] : null,
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
  const topo = head('Insumos', 'Embalagens, ímãs, parafusos e outros itens usados nas peças. A baixa acontece quando a impressão termina.', novo);
  if (!S.insumos.length) {
    return topo + `<div class="panel">${vazio('Nenhum insumo cadastrado. Cadastre embalagens, ímãs, parafusos e outros itens para eles entrarem no custo das peças.', novo)}</div>`;
  }
  const usos = new Map();   // insumo -> em quantos produtos aparece
  S.produtos.forEach(p => { new Set((p.insumos || []).map(x => x.insumoId)).forEach(id => usos.set(id, (usos.get(id) || 0) + 1)); });
  /* o estoque (com a unidade) fica logo depois do nome e o próprio número abre o Acertar estoque; Repor abre a reposição já
     preenchida com a última (vira Chegou quando alguém marcou "Já pedi"); Acertar vem no fim da linha */
  const linhas = cadPorNome(S.insumos).map(i => {
    const est = num(i.estoque), minimo = num(i.minimo), n = usos.get(i.id) || 0;
    return `<tr>
      <td style="min-width:150px"><b>${esc(i.nome)}</b>${i.pedidoEm ? `<small class="cad-pedido">${cadPedidoTxt({ em: i.pedidoEm, por: i.pedidoPor })}</small>` : ''}</td>
      <td class="right num${est < 0 || (minimo > 0 && est <= minimo) ? ' neg' : ''}">${cadNumEstoque('ins', i, nf(est, 2) + ' ' + esc(i.unidade || 'un'))}</td>
      <td class="right num">${cadCusto(i.custo)}</td>
      <td class="right num">${minimo > 0 ? nf(minimo, 2) : '—'}</td>
      <td>${n ? cadPlural(n, 'produto', 'produtos') : '<span class="muted">Nenhum produto</span>'}</td>
      <td><div class="rowbtns">
        ${i.pedidoEm ? cadBtnChegou('ins', i) : cadBtn('Repor', 'cadReporInsumo', i.id)}
        ${cadBtn('Editar', 'cadEditarInsumo', i.id)}
        ${cadBtn('Excluir', 'cadExcluirInsumo', i.id, 'danger')}
        ${cadBtnAcertar('ins', i.id)}
      </div></td>
    </tr>`;
  }).join('');
  return topo + `<div class="panel">${tabela(['Insumo', { t: 'Estoque', r: 1 }, { t: 'Custo por unidade', r: 1 }, { t: 'Mínimo', r: 1 }, 'Usado em', ''], linhas)}</div>`;
};
function cadEditarInsumo(id) {
  const i = id ? byId('insumos', id) : null;
  if (id && !i) return toast('Este insumo não existe mais.', 'bad');
  const aoAbrir = i ? { ...i } : null;
  const unidades = [...cadUnidades];
  if (i && i.unidade && !unidades.includes(i.unidade)) unidades.push(i.unidade);
  openForm({
    title: i ? 'Editar insumo' : 'Novo insumo',
    registro: i ? ['insumos', i.id] : null,
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
/* Repor insumo: a janela de sempre, já preenchida com a quantidade e o valor da última reposição dele (lida do lançamento que a
   reposição grava no Financeiro: ultimaReposicao, em calc.js), como a compra de filamento: mudou a quantidade e o valor ainda é o
   que a janela pôs, ele acompanha pelo preço da última; a última que ficou fora do comum não é repetida. Sem reposição com valor,
   vem em branco, como sempre foi. opc.chegou: "2 de 3" (Chegou tudo). opc.em: aberta pelo Chegou (ver cadNovaCompra). */
function cadReporInsumo(id, opc = {}) {
  const i = byId('insumos', id);
  if (!i) return;
  const vistos = codigosNaTela('lancamentos');                // os lançamentos na tela ao abrir a janela
  const u = ultimaReposicao(i), fora = reposicaoForaDoComum(u), un = i.unidade || 'un', aberta = Date.now(), mexeu = new Set();
  let valorConferido = false, outraConfirmada = false;
  const qtdDoCampo = form => numTexto((campoDoForm(form, 'qtd') || {}).value);
  const outraQtd = form => { const q = qtdDoCampo(form); return !!u && isFinite(q) && q > 0 && q !== u.qtd; };
  const valorAuto = form => (!u || fora ? '' : outraQtd(form) ? cadValorPelaUltima(u.valor, u.qtd, qtdDoCampo(form)) : u.valor);
  // o texto que a janela pôs no campo do valor: enquanto ele estiver lá, a pessoa não mexeu no valor
  let valorPosto = '';
  const porValor = (form, v) => { cadValorNoCampo(form, 'valor', v); valorPosto = (campoDoForm(form, 'valor') || {}).value; };
  const valorIntacto = form => !mexeu.has('valor') && (campoDoForm(form, 'valor') || {}).value === valorPosto;
  const marcar = form => {
    const quando = u ? dataCurta(u.data) : '', auto = !!u && !fora && valorIntacto(form);
    cadMarcarIgual(form, [
      { k: 'qtd', igual: !!u && !mexeu.has('qtd'), quando, ultima: u ? nf(u.qtd, 2) + ' ' + esc(un) : '' },
      { k: 'valor', igual: auto && !outraQtd(form), auto: auto && outraQtd(form) ? `pelo preço da última: ${cadCusto(u.valor / u.qtd)} por ${esc(un)} (${quando})` : '',
        aviso: u && fora && valorIntacto(form) ? `a última (${brl(u.valor)}, ${quando}) ficou fora do comum: digite o valor` : '',
        quando, ultima: u ? `${brl(u.valor)} (${quando})` : '', base: 'entra no Financeiro como gasto de Insumos e atualiza o custo médio' },
    ]);
  };
  openForm({
    title: 'Repor ' + i.nome + (opc.chegou ? ` (${opc.chegou})` : ''),
    saveLabel: 'Registrar reposição',
    foco: u ? 'valor' : 'qtd', esperaEnter: 500,
    fields: [
      { k: 'qtd', label: 'Quantidade comprada (' + un + ')', type: 'number', req: true },
      { k: 'valor', label: 'Valor total pago (R$)', type: 'number', hint: 'Entra no Financeiro como gasto de Insumos e atualiza o custo médio' },
      { k: 'data', label: 'Data', type: 'date' },
    ],
    vals: { data: hoje(), ...(u ? { qtd: u.qtd, valor: fora ? '' : u.valor } : {}) },
    change: (el, form) => {
      if (el.name !== 'qtd' && el.name !== 'valor') return;
      // a quantidade mudou e o valor ainda é o que a janela pôs: ele acompanha, pelo preço da última
      if (el.name === 'qtd' && valorIntacto(form) && valorAuto(form) !== '') porValor(form, valorAuto(form));
      else if (!valorIntacto(form)) mexeu.add('valor');
      mexeu.add(el.name);
      marcar(form);
    },
    preview: d => {
      const a = byId('insumos', id) || i, qtd = num(d.qtd), valor = num(d.valor), un = esc(a.unidade || 'un');
      if (!(qtd > 0)) return '';
      /* mesma conta de reporInsumo (calc.js): o custo médio só muda quando há valor pago */
      const base = Math.max(0, num(a.estoque));
      const novoCusto = valor > 0 ? arred((base * num(a.custo) + valor) / (base + qtd), 4) : num(a.custo);
      return (valor > 0 ? cadAvisoValor(valor / qtd, num(a.custo), cadCusto, 'por ' + un) : '') + `<div class="calc">
        ${valor > 0 ? `<div><span>Custo por unidade nesta compra</span><b>${cadCusto(valor / qtd)}</b></div>` : ''}
        <div><span>Estoque depois (hoje: ${nf(a.estoque, 2)} ${un})</span><b>${nf(arred(num(a.estoque) + qtd, 3), 2)} ${un}</b></div>
        <div class="tot"><span>Custo médio por unidade (hoje: ${cadCusto(a.custo)})</span><b>${cadCusto(novoCusto)}</b></div>
      </div>` + (valor > 0 ? '' : '<p class="hint" style="margin-top:10px">Sem valor pago, o custo médio não muda e nada entra no Financeiro.</p>');
    },
    save: d => {
      if (opc.depois && Date.now() - aberta < 800) return false;       // Chegou tudo: o 2º toque (ou Enter) na anterior não grava esta
      if (!(d.qtd > 0)) { toast('Informe a quantidade comprada.', 'bad'); return false; }
      const atual = byId('insumos', id);
      if (!atual) { toast('Este insumo não existe mais.', 'bad'); return false; }
      // aberta pelo Chegou: o insumo saiu de A caminho com a janela aberta (o outro aparelho registrou a chegada ou tirou a marca)
      const saiu = opc.em && !outraConfirmada ? cadSaiuDoCaminho('ins', id, opc.em) : null;
      if (saiu) { cadPerguntarChegou(saiu, () => { outraConfirmada = true; FORM.form.requestSubmit(); }, opc); return false; }
      // código fixo no lançamento do gasto (o contador pula só os lançamentos que já estavam na tela ao abrir a janela): a mesma
      // reposição salva nos dois aparelhos entra uma vez só, mesmo quando a do outro chega com esta janela aberta (quem confirmou
      // "Registrar outra" grava outra: o contador pula também os que estão na tela agora)
      const cod = d.valor > 0 ? codigoReposicao(atual.id, d.qtd, d.valor, d.data, outraConfirmada ? codigosNaTela('lancamentos') : vistos) : '', ja = cod ? byId('lancamentos', cod) : null;
      if (ja) { toast(`Outro aparelho já registrou esta reposição (${nf(d.qtd, 2)} ${atual.unidade || 'un'} de ${atual.nome}, ${brl(ja.valor)}) enquanto esta janela estava aberta. Nada foi gravado em dobro: confira em Insumos e registre de novo, se for outra.`, 'bad'); return; }
      // valor fora do comum: pergunta antes (depois de ver que a reposição ainda não entrou). Sem valor pago o custo médio não muda
      const conferido = valorConferido, r = d.valor > 0 ? precoForaDoComum(d.valor / d.qtd, num(atual.custo)) : null;
      valorConferido = false;
      if (r !== null && !conferido) {
        cadConferirValor(`<b>${esc(atual.nome)}</b> a <b>${cadCusto(d.valor / d.qtd)} por ${esc(un)}</b> é ${cadVezes(r)} (${cadCusto(atual.custo)}).`, () => { valorConferido = true; FORM.form.requestSubmit(); });
        return false;
      }
      reporInsumo(atual, d.qtd, d.valor, d.data, cod);
      toast('Reposição registrada.');
      if (opc.chegou) cadProximoChegou();
    },
  });
  porValor(FORM.form, u && !fora ? u.valor : '');
  marcar(FORM.form);
  cadTocarSeleciona(FORM.form);
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

/* ---------- O que comprar (Painel e Compras) ----------
   Do mais urgente para o menos (materiaisParaComprar, em calc.js, que conta a fila inteira): "faltam 207 g · tem 165 g", com
   Comprei (filamento) ou Repor (insumo) e Já pedi em cada linha. Embaixo, A caminho: o que alguém já marcou como pedido (quando e
   por quem, mesmo esquecido há dias), com Chegou (a compra já preenchida) e, em Compras, Não veio. Copiar lista monta o texto para
   o WhatsApp e oferece "Marcar tudo como pedido". A linha recém-marcada fica no lugar até trocar de tela (não pula debaixo do dedo),
   com "desfazer". Lista longa: os mais urgentes e "Ver mais". Só o Já pedi (e o Não veio) grava; o resto só lê. Os botões são
   op-acao: esperam 1 s quando a lista mudou pelo outro aparelho (fim de views-operacao.js). */
const cadRecentes = new Map();         // 't:id' -> { em, tela, aviso }: marcado aqui como pedido, nesta visita à tela
const cadColDe = t => (t === 'ins' ? 'insumos' : 'filamentos');
const cadRecente = m => { const r = m.pedido && cadRecentes.get(m.t + ':' + m.id); return !!r && r.tela === paginaAtual() && r.em === m.pedido.em; };
const cadQtdMat = (m, v) => `<span class="nowrap">${m.t === 'fil' ? gramas(v) : nf(v, 2) + ' ' + esc(m.un)}</span>`;
const cadPontoMat = m => (m.t === 'fil' ? cadPonto(m.r.cor) : `<span class="cad-ico">${icone('insumos')}</span>`);
const cadBtnMat = (rotulo, fn, m, cls = 'ghost', em = '') =>
  `<button type="button" class="btn ${cls} sm op-acao" data-t="${m.t}" data-id="${esc(m.id)}"${em ? ` data-em="${esc(em)}"` : ''} onclick="${fn}(this.dataset.t, this.dataset.id${em ? ', this.dataset.em' : ''})">${rotulo}</button>`;
/* Chegou leva a marca do "Já pedi" que a tela mostra: se o item já saiu de A caminho quando o clique chega (o outro aparelho
   registrou a chegada e esta tela ainda não redesenhou), pergunta antes de abrir a compra. */
const cadBtnChegouMat = m => cadBtnMat('Chegou', 'cadComprei', m, 'ghost', m.pedido ? m.pedido.em : '');
/* Chegou na linha da tabela (Filamentos e Insumos), com a marca vista na tela, como na lista O que comprar. */
const cadBtnChegou = (t, r) => `<button type="button" class="btn ghost sm" data-t="${t}" data-id="${esc(r.id)}" data-em="${esc(r.pedidoEm)}" onclick="cadComprei(this.dataset.t, this.dataset.id, this.dataset.em)">Chegou</button>`;
/* Acertar na linha da tabela: no fim, depois dos botões de sempre (eles continuam onde estavam na versão 18 e cabem nas mesmas
   larguras); no celular fica escondido, porque o próprio número do estoque abre o Acertar (à vista, sem arrastar a tabela). */
const cadBtnAcertar = (t, id) => `<button type="button" class="btn ghost sm cad-acertar" data-t="${t}" data-id="${esc(id)}" onclick="cadAcertar(this.dataset.t, this.dataset.id)">Acertar</button>`;
/* "pedido hoje por Ana", "pedido há 2 dias por você" (HTML). Esquecido há uma semana ou mais: em amarelo. */
function cadPedidoTxt(p) {
  const em = String((p && p.em) || ''), dia = /T/.test(em) ? (isFinite(Date.parse(em)) ? dataLocal(new Date(em)) : '') : em.slice(0, 10);
  const d = EH_DATA.test(dia) ? Math.round((Date.parse(hoje() + 'T12:00:00') - Date.parse(dia + 'T12:00:00')) / 864e5) : NaN;
  const quando = !isFinite(d) ? '' : d <= 0 ? ' hoje' : d === 1 ? ' ontem' : ' há ' + d + ' dias';
  return `<span${d >= 7 ? ' class="aviso"' : ''}>pedido${quando}${p && p.por ? ' por ' + esc(p.por) : ''}</span>`;
}
/* A última compra (reposição) do material, para a lista de Compras. */
function cadUltimaTxt(m) {
  if (m.t === 'fil') { const u = ultimaCompra(m.id), fo = u && byId('fornecedores', u.fornecedorId); return u ? `última: ${brl(u.valor)}${fo ? ' na ' + esc(fo.nome) : ''} (${dataCurta(u.data)})` : ''; }
  const u = ultimaReposicao(m.r);
  return u ? `última: ${nf(u.qtd, 2)} ${esc(m.un)} por ${brl(u.valor)} (${dataCurta(u.data)})` : '';
}
/* O que diz a linha. completo (em Compras): também o que a fila usa e a última compra. */
function cadSubComprar(m, completo) {
  const q = v => cadQtdMat(m, v), limite = m.t === 'fil' ? 'aviso em ' + gramas(m.minimo) : m.minimo > 0 ? 'mínimo ' + nf(m.minimo, 2) : '';
  const usa = m.fila > 0 ? 'a fila usa ' + q(m.fila) : '';
  // no Painel, frase curta: o insumo mostra o mínimo; o filamento, o que a fila usa (ou, sem fila, onde o aviso começa)
  const curto = m.t === 'ins' && limite ? limite : usa || limite;
  const partes = m.nivel === 'falta' ? [`<span class="neg">faltam ${q(m.falta)}</span>`, 'tem ' + q(m.tem), completo ? usa : '']
    : m.nivel === 'acabou' ? ['<span class="neg">acabou</span>', limite]
      : m.nivel === 'acabando' ? [`<span class="aviso">tem ${q(m.tem)}</span>`, ...(completo ? [limite, usa] : [curto])]
        : [`<span class="info">vão sobrar ${q(m.sobra)}</span>`, 'tem ' + q(m.tem), completo ? usa : ''];
  if (completo) partes.push(cadUltimaTxt(m));
  return partes.filter(Boolean).join(' · ');
}
/* A linha recém-marcada: "pedido hoje por você", com Chegou e "desfazer" à direita, no lugar de Comprei e Já pedi (logo depois de
   uma ação, o aviso do computador fica no canto de baixo à esquerda: os botões da linha, à direita, nunca ficam embaixo dele). */
function cadLinhaComprar(m, completo) {
  const marcado = cadRecente(m), tom = marcado ? 'info' : m.nivel === 'falta' || m.nivel === 'acabou' ? 'bad' : m.nivel === 'acabando' ? 'warn' : 'info';
  const sub = marcado ? cadPedidoTxt(m.pedido) : cadSubComprar(m, completo);
  const bts = marcado ? cadBtnChegouMat(m) + cadBtnMat('desfazer', 'cadDesmarcar', m, 'ghost cad-fraco cad-desf')
    : cadBtnMat(m.t === 'fil' ? 'Comprei' : 'Repor', 'cadComprei', m) + cadBtnMat('Já pedi', 'cadPedi', m, 'ghost cad-fraco');
  return `<li class="${tom}"><div class="op-t"><b>${cadPontoMat(m)}${esc(m.nome)}</b><small>${sub}</small></div><div class="cad-bts">${bts}</div></li>`;
}
function cadLinhaCaminho(m, completo) {
  const sub = [cadPedidoTxt(m.pedido), 'tem ' + cadQtdMat(m, m.tem), m.falta ? `<span class="neg">faltam ${cadQtdMat(m, m.falta)}</span>` : ''].filter(Boolean).join(' · ');
  return `<li class="info"><div class="op-t"><b>${cadPontoMat(m)}${esc(m.nome)}</b><small>${sub}</small></div><div class="cad-bts">${cadBtnChegouMat(m)}${completo ? cadBtnMat('Não veio', 'cadNaoVeio', m, 'ghost cad-fraco') : ''}</div></li>`;
}
/* onde: 'painel' (no lugar da lista Material acabando da versão 18: #op-material, aonde o 3º ícone do celular leva) ou 'compras'
   (a lista completa, com o que a fila usa, a última compra e Não veio). No Painel, A caminho também mostra os primeiros e "Ver
   mais". "Tem material para a fila inteira" (com o visto) só quando nada falta, nem o que está a caminho; com tudo já pedido, a
   lista diz que falta chegar. */
function cadListaComprar(onde) {
  const completo = onde === 'compras', { todos, caminho: pedidos } = materiaisParaComprar();
  const comprar = todos.filter(m => (m.nivel !== 'ok' && !m.pedido) || cadRecente(m)), caminho = pedidos.filter(m => !cadRecente(m));
  const base = completo ? (opNoCelular() ? 6 : 10) : opNoCelular() ? 4 : 5, lim = comprar.length === base + 1 ? comprar.length : base;
  const max = opListaAberta.comprar ? comprar.length : lim, n = comprar.filter(m => !m.pedido).length;
  const graves = comprar.some(m => !m.pedido && (m.nivel === 'falta' || m.nivel === 'acabou'));
  const mais = cls => (comprar.length > lim ? `<button type="button" class="${cls}" onclick="opAlternarLista('comprar')">${opListaAberta.comprar ? 'Mostrar menos' : 'Ver mais ' + nf(comprar.length - lim)}</button>` : '');
  const baseC = opNoCelular() ? 4 : 5, limC = completo || caminho.length <= baseC + 1 ? caminho.length : baseC, maxC = opListaAberta.caminho ? caminho.length : limC;
  const maisC = cls => (caminho.length > limC ? `<button type="button" class="${cls}" onclick="opAlternarLista('caminho')">${opListaAberta.caminho ? 'Mostrar menos' : 'Ver mais ' + nf(caminho.length - limC)}</button>` : '');
  const copiar = n ? '<button type="button" class="link txt-sm cad-copiar" onclick="cadCopiarLista()">Copiar lista</button>' : '';
  const certo = caminho.some(m => m.nivel !== 'ok') ? '<div class="op-certo cad-espera"><span>Tudo já foi pedido. Falta chegar o que está em A caminho.</span></div>'
    : `<div class="op-certo">${opSvg('ok')}<span>Nada para comprar: tem material para a fila inteira.</span></div>`;
  const chegouTudo = caminho.length > 1 ? '<button type="button" class="btn ghost sm op-acao" onclick="cadChegouTudo()">Chegou tudo</button>' : '';
  const corpo = (comprar.length ? `<ul class="op-lista">${comprar.slice(0, max).map(m => cadLinhaComprar(m, completo)).join('')}</ul>${mais('op-mais')}` : certo) +
    (caminho.length ? `<div class="cad-grupo"><span>A caminho</span>${maisC('op-mais-topo') || chegouTudo ? `<div class="cad-grupo-dir">${maisC('op-mais-topo')}${chegouTudo}</div>` : ''}</div><ul class="op-lista">${caminho.slice(0, maxC).map(m => cadLinhaCaminho(m, completo)).join('')}</ul>${maisC('op-mais')}` : '');
  const dir = copiar + mais('op-mais-topo');
  return `<section class="panel op-bloco cad-comprar" id="${completo ? 'cad-comprar' : 'op-material'}"><div class="panel-head"><h2>O que comprar${n ? ` <small class="${graves ? 'neg' : ''}">${nf(n)}</small>` : ''}</h2>${dir ? `<div class="op-dir">${dir}</div>` : ''}</div>${corpo}</section>`;
}
/* Comprei, Repor e Chegou: a janela de sempre, já preenchida com a última compra (reposição). em: o Chegou, com a marca do "Já
   pedi" que a tela mostrava. Se o item já saiu de A caminho (o outro aparelho registrou a chegada e esta tela ainda não tinha
   redesenhado: o mouse parado em cima do botão segura o redesenho), pergunta antes, com o cursor em "Não registrar". */
function cadComprei(t, id, em) {
  if (!byId(cadColDe(t), id)) return opRenderDaqui();
  const abrir = opc => (t === 'ins' ? cadReporInsumo(id, opc) : cadNovaCompra(id, opc));
  const saiu = em ? cadSaiuDoCaminho(t, id, em) : null;
  if (!saiu) return abrir(em ? { em } : {});
  opRenderDaqui();
  perguntar('Confira a chegada', esc(saiu.txt) + (saiu.outra ? ' Registrar outra compra?' : ' Registrar a compra assim mesmo?'), [
    { rotulo: saiu.outra ? 'Registrar outra' : 'Registrar assim mesmo', fn: () => abrir({}) },
    { rotulo: 'Não registrar', cls: '', foco: true },
  ]);
}
/* O banco não aceitou tirar a marca do "Já pedi" (Desfazer, Não veio): ela mudou no outro aparelho e o aviso ainda não tinha chegado
   aqui (o banco confere o número da marca). O aviso conta como ficou. total: quantas o mesmo toque tirou (o Desfazer do Marcar
   tudo); desfazer: foi um Desfazer. */
function cadExplicarTirar(desfazer, total = 1) {
  return recusas => {
    if (recusas.some(x => x.motivo !== 'mudou')) return false;                    // excluído no outro aparelho: o aviso de sempre
    const nomes = cadJuntar(recusas.map(x => (x.d && x.d.nome) || '?')), varios = recusas.length > 1, ok = total - recusas.length;
    const comMarca = recusas.filter(x => x.d && x.d.pedidoEm), quem = cadJuntar([...new Set(comMarca.map(x => x.d.pedidoPor || 'outra pessoa'))]);
    const como = comMarca.length === recusas.length ? `${nomes} continua${varios ? 'm' : ''} a caminho: ${quem} marcou como pedido pouco antes.`
      : `${nomes} já tinha${varios ? 'm' : ''} saído de A caminho no outro aparelho.`;
    const feito = ok > 0 ? `Desfeito: ${ok === 1 ? '1 item voltou' : nf(ok) + ' itens voltaram'} para a lista do que comprar. ` : '';
    toast(feito + como + (desfazer && ok <= 0 ? ' Nada foi desfeito.' : ''), 'warn');
    return true;
  };
}
const cadGrupoAgora = () => (grupoAtual && grupoAtual.ops.size ? grupoAtual : null);
/* Já pedi: 1 toque marca que foi pedido, por quem e quando (marcarPedido, em calc.js). A linha fica no lugar, com "desfazer",
   até trocar de tela; o aviso tem Desfazer por 8 s. */
function cadPedi(t, id) {
  const col = cadColDe(t), r = byId(col, id);
  if (!r) return opRenderDaqui();
  if (r.pedidoEm) { opRenderDaqui(); return toast(`${r.nome} já estava marcado como pedido.`); }
  const marca = marcaDesfazer(), em = marcarPedido(col, id, quemUsa());
  const aviso = avisoDesfazer(`Marcado como pedido: ${r.nome}.`, marca, () => cadDesmarcar(t, id, em));
  cadRecentes.set(t + ':' + id, { em, tela: paginaAtual(), aviso });
  opRenderDaqui();
}
/* Desfaz o Já pedi daqui: só se a marca ainda for a que este aparelho pôs (aqui e no banco: tirarPedido, em calc.js). */
function cadDesmarcar(t, id, em) {
  const col = cadColDe(t), r = byId(col, id), rec = cadRecentes.get(t + ':' + id), meu = em || (rec && rec.em);
  if (rec && rec.aviso && rec.aviso.isConnected && rec.aviso._sair) rec.aviso._sair();
  if (!r || !meu || r.pedidoEm !== meu) { opRenderDaqui(); return toast('Isto já mudou depois. Nada foi desfeito.', 'bad'); }
  tirarPedido(col, id, meu);
  const g = cadGrupoAgora();
  if (g) g.explicar = cadExplicarTirar(true);
  cadRecentes.delete(t + ':' + id);
  opRenderDaqui();
  toast(`Desfeito: ${r.nome} voltou para a lista do que comprar.`);
}
/* Não veio (Compras, em A caminho): tira a marca esquecida (só se no banco ela ainda for essa), com Desfazer. O Desfazer não
   devolve a marca se a compra (reposição) do item entrou depois, ou se o estoque mudou: aqui (o que já chegou) e no banco (o que o
   outro aparelho gravou e ainda não chegou aqui). */
function cadNaoVeio(t, id) {
  const col = cadColDe(t), r = byId(col, id);
  if (!r || !r.pedidoEm) return opRenderDaqui();
  const campo = t === 'ins' ? 'estoque' : 'estoqueG', ultimaDe = x => { const u = t === 'ins' ? ultimaReposicao(x) : ultimaCompra(id); return u ? u.id : ''; };
  const antes = { em: r.pedidoEm, por: r.pedidoPor || '', n: r.pedidoN, est: num(r[campo]), u: ultimaDe(r) }, marca = marcaDesfazer();
  tirarPedido(col, id, antes.em);
  const g = cadGrupoAgora();
  if (g) g.explicar = cadExplicarTirar(false);
  opRenderDaqui();
  avisoDesfazer(`${r.nome} voltou para a lista do que comprar.`, marca, () => {
    const b = byId(col, id);
    if (!b || b.pedidoEm || ultimaDe(b) !== antes.u || num(b[campo]) !== antes.est) return opJaMudou();
    b.pedidoEm = antes.em; b.pedidoPor = antes.por;
    if (typeof antes.n === 'number') b.pedidoN = antes.n;
    put(col, b, { confere: { pedidoN: null, [campo]: antes.est } });
    const gv = cadGrupoAgora();
    if (gv) gv.explicar = recusas => { if (recusas.some(x => x.motivo !== 'mudou')) return false; toast(`Isto já mudou no outro aparelho: ${b.nome} não voltou para A caminho.`, 'warn'); return true; };
    opRenderDaqui();
    toast(`Desfeito: ${b.nome} voltou para A caminho.`);
  });
}
/* Copiar lista: o texto para colar no WhatsApp do sócio ou do fornecedor (o que comprar, com a quantidade sugerida e a última
   compra). Depois oferece "Marcar tudo como pedido". */
function cadTextoLista(lista) {
  const linha = m => {
    const s = sugestaoCompra(m), fo = m.t === 'fil' && s.u ? byId('fornecedores', s.u.fornecedorId) : null;
    return `• ${m.nome}: ${m.t === 'fil' ? gramas(s.q) : nf(s.q, 2) + ' ' + m.un}${s.u ? ` (última: ${brl(s.u.valor)}${fo ? ', ' + fo.nome : ''})` : ''}`;
  };
  const fs = lista.filter(m => m.t === 'fil'), is = lista.filter(m => m.t === 'ins');
  return [`Lista de compras — ${S.perfil.empresa || 'Nexos'} (${dataBR(hoje())})`, fs.length ? 'Filamento\n' + fs.map(linha).join('\n') : '',
    is.length ? 'Insumos\n' + is.map(linha).join('\n') : ''].filter(Boolean).join('\n\n');
}
async function cadCopiarLista() {
  const lista = materiaisParaComprar().comprar.slice();
  if (!lista.length) return toast('Nada para comprar agora.');
  const txt = cadTextoLista(lista);
  if (!(await copiarTexto(txt, false))) return cadMostrarLista(txt);
  toast('Lista copiada. Cole no WhatsApp.', '', { rotulo: 'Marcar tudo como pedido', grupos: [], fn: () => cadMarcarTudo(lista) });
}
/* Sem área de transferência (navegador antigo ou bloqueado): o texto numa janela, para copiar à mão. */
function cadMostrarLista(txt) {
  abrirModal(`<p class="muted" style="margin-bottom:12px">Não deu para copiar sozinho. Copie o texto abaixo e cole no WhatsApp.</p>
    <textarea id="cadListaTxt" readonly rows="10" aria-label="Lista de compras">${esc(txt)}</textarea>
    <div class="actions"><button type="button" class="btn ghost" onclick="fecharModal()">Fechar</button><button type="button" class="btn" onclick="copiarTexto($('#cadListaTxt').value)">Copiar texto</button></div>`, { title: 'Lista de compras' });
}
/* Marcar tudo como pedido: cada marca numa gravação (um item que o outro aparelho excluiu fica de fora sozinho; os outros
   entram, e o aviso conta os dois). O Desfazer também tira uma de cada vez, cada uma só se ainda for a deste aparelho. */
function cadMarcarTudo(lista) {
  const marca = marcaDesfazer(), quem = quemUsa(), feitos = [];
  lista.forEach(m => { novoGrupo(); const em = marcarPedido(cadColDe(m.t), m.id, quem); if (em) feitos.push({ t: m.t, id: m.id, em }); });
  if (!feitos.length) { opRenderDaqui(); return toast('Já estava tudo marcado como pedido.'); }
  const grupos = FILA.filter(g => g.n > marca && g.ops.size);
  const desfazer = () => {
    const gs = [];
    let n = 0;
    feitos.forEach(x => {
      novoGrupo();
      if (!tirarPedido(cadColDe(x.t), x.id, x.em)) return;
      n++; cadRecentes.delete(x.t + ':' + x.id);
      const g = cadGrupoAgora();
      if (g) gs.push(g);
    });
    const explicar = cadExplicarTirar(true, n);
    gs.forEach(g => { g.explicar = explicar; });
    opRenderDaqui();
    toast(n ? `Desfeito: ${n === 1 ? '1 item voltou' : nf(n) + ' itens voltaram'} para a lista do que comprar.` : 'Isto já mudou depois. Nada foi desfeito.', n ? '' : 'bad');
  };
  const aviso = avisoDesfazer(`${feitos.length === 1 ? '1 item marcado' : nf(feitos.length) + ' itens marcados'} como pedido.`, marca, desfazer);
  // a marca de um item não entrou (o outro aparelho o excluiu pouco antes): o aviso diz quantos foram marcados e qual ficou de fora,
  // e o Desfazer continua para os que entraram
  const explicar = (recusas, naTela) => {
    const ok = feitos.length - recusas.length, nomes = cadJuntar(recusas.map(x => (x.d && x.d.nome) || '?')), varios = recusas.length > 1;
    const fora = `${nomes} ficou${varios ? 'aram' : ''} de fora: outro aparelho ${recusas.every(x => x.motivo === 'apagado') ? 'excluiu' : 'mudou'} pouco antes.`;
    if (ok <= 0) { toast(`Nada foi marcado como pedido. ${fora}`, 'warn'); return true; }
    const aceitos = grupos.filter(g => !recusas.some(x => x.g === g));
    toast(`${ok === 1 ? '1 item marcado' : nf(ok) + ' itens marcados'} como pedido. ${fora}`, 'warn', naTela ? { rotulo: 'Desfazer', grupos: aceitos, fn: desfazer } : undefined);
    return true;
  };
  grupos.forEach(g => { g.explicar = explicar; });
  feitos.forEach(x => cadRecentes.set(x.t + ':' + x.id, { em: x.em, tela: paginaAtual(), aviso }));
  opRenderDaqui();
}
/* Chegou tudo (mais de um a caminho): uma compra de cada vez, cada janela já preenchida com a última; registrar uma abre a
   próxima, e fechar a janela para por ali (o que faltou continua em A caminho). Abre só o que está em A caminho na tela (a linha
   marcada agora há pouco, que ainda está no alto da lista, fica de fora), com a marca de cada um no toque. */
let cadFilaChegou = [];
function cadChegouTudo() {
  const lista = materiaisParaComprar().caminho.filter(m => !cadRecente(m));
  cadFilaChegou = lista.map((m, i) => ({ t: m.t, id: m.id, em: m.pedido.em, n: i + 1, de: lista.length }));
  if (!cadFilaChegou.length) return opRenderDaqui();
  cadProximoChegou(false);
}
/* depois = true: a janela abre logo depois de registrar a anterior (o 2º toque ou Enter de quem registrou não grava esta). O que
   saiu de A caminho depois do toque em Chegou tudo (o outro aparelho registrou a chegada ou tirou a marca) fica de fora, com aviso:
   nada entra em dobro. */
function cadProximoChegou(depois = true) {
  for (let x = cadFilaChegou.shift(); x; x = cadFilaChegou.shift()) {
    if (!byId(cadColDe(x.t), x.id)) continue;
    const saiu = cadSaiuDoCaminho(x.t, x.id, x.em);
    if (saiu) { toast(`${saiu.txt} Esta compra ficou de fora, para não entrar em dobro.`, 'warn'); continue; }
    const opc = { chegou: x.n + ' de ' + x.de, depois, em: x.em };
    return x.t === 'ins' ? cadReporInsumo(x.id, opc) : cadNovaCompra(x.id, opc);
  }
}
// ao trocar de tela, a linha marcada agora há pouco vai para A caminho
DEPOIS_RENDER.push(trocou => { if (trocou) cadRecentes.clear(); });

/* ---------- Acertar estoque (rolo, insumo e peça pronta): janela de um campo ----------
   Um número grande (quanto tem de verdade), menos e mais e, no rolo, atalhos (acabou, ¼, ½, 1 e 2 rolos) e "pesei com o
   carretel" (desconta o carretel vazio, lembrado neste aparelho). Na peça pronta, 1 campo no lugar dos 19 da janela do produto.
   Usa a proteção da versão 16: o número digitado só vale se ninguém mexeu no estoque com a janela aberta (se mexeu, nada é
   gravado e o aviso explica). Desfazer por 8 s volta o número de antes, se o estoque ainda estiver como o acerto deixou. A janela
   lembra: perdeu na impressão é Falhou; chegou rolo é Comprei. */
const CAD_ROLOS = [[0, 'acabou'], [250, '¼ de rolo'], [500, '½ rolo'], [1000, '1 rolo'], [2000, '2 rolos']];
const cadAcerto = { passo: 1 };
const cadDoTipo = t => (t === 'fil' ? ['filamentos', 'estoqueG', 2] : t === 'ins' ? ['insumos', 'estoque', 3] : ['produtos', 'estoque', 0]);
const cadTxtEstoque = (t, r, v) => (t === 'fil' ? gramas(v) : t === 'ins' ? nf(v, 3) + ' ' + (r.unidade || 'un') : cadPlural(v, 'peça', 'peças'));
/* O número do estoque na linha da tabela. No celular é um botão que abre o Acertar estoque (fica à vista, sem arrastar a tabela);
   no computador é só o número, e o Acertar fica com os outros botões, à direita da linha: logo depois de salvar, o aviso aparece no
   canto de baixo à esquerda e não fica em cima de botão nenhum. */
const cadNumEstoque = (t, r, txt) => `<span class="cad-num-txt">${txt}</span><button type="button" class="cad-num" data-t="${t}" data-id="${esc(r.id)}" title="Acertar o estoque" onclick="cadAcertar(this.dataset.t, this.dataset.id)">${txt}</button>`;
/* t: 'fil' | 'ins' | 'prod' */
function cadAcertar(t, id) {
  const [col, campo, casas] = cadDoTipo(t), r = byId(col, id);
  if (!r) { toast('Este item não existe mais.', 'bad'); return render(); }
  const atual = num(r[campo]), m = t === 'prod' ? null : situacaoMaterial(t, r), txt = v => cadTxtEstoque(t, r, v);
  cadAcerto.passo = t === 'fil' ? 50 : 1;
  const ponto = t === 'fil' ? cadPonto(r.cor) : `<span class="cad-ico">${icone(t === 'ins' ? 'insumos' : 'produtos')}</span>`;
  const pergunta = t === 'fil' ? 'Quanto tem de verdade, em gramas?' : t === 'ins' ? `Quanto tem de verdade (${esc(r.unidade || 'un')})?` : 'Quantas peças prontas tem de verdade?';
  const fichas = t === 'fil' ? `<div class="cad-fichas">${CAD_ROLOS.map(([v, l]) => `<button type="button" class="cad-ficha" onclick="setCampo('novo', ${v})">${l}</button>`).join('')}<button type="button" class="cad-ficha fraca" onclick="cadPesar()">pesei com o carretel</button></div><div id="cadBalanca" hidden></div>` : '';
  openForm({
    title: 'Acertar estoque', registro: [col, id], saveLabel: 'Salvar', foco: 'novo',
    fields: [
      { type: 'html', html: `<div class="cad-cab">${ponto}<b>${esc(r.nome)}</b><span>no sistema: ${esc(txt(atual))}${m && m.fila ? ' · a fila usa ' + esc(txt(m.fila)) : ''}</span></div>` },
      { type: 'html', html: `<label class="cad-conta-rot" for="cadNovo">${pergunta}</label><div class="cad-conta"><button type="button" class="btn ghost" aria-label="Menos" onclick="cadPasso(-1)">−</button><input id="cadNovo" name="novo" type="text" inputmode="${t === 'prod' ? 'numeric' : 'decimal'}" autocomplete="off" data-num="1"${t === 'prod' ? ' data-int="1"' : ''} required value="${esc(paraCampo(atual))}"><button type="button" class="btn ghost" aria-label="Mais" onclick="cadPasso(1)">+</button></div>${fichas}` },
    ],
    preview: (d, form) => {
      const el = campoDoForm(form, 'novo'), v = numTexto(el ? el.value : ''), dif = isFinite(v) ? arred(v - atual, casas) : 0;
      const lembra = t === 'prod' ? 'Não é venda nem produção: só corrige a contagem.' : t === 'fil' ? 'Só corrige a contagem. Perdeu numa impressão? Use Falhou. Chegou rolo? Use Comprei.'
        : 'Só corrige a contagem. Chegou mais? Use Repor.';
      return `<p class="hint cad-dif">${dif ? `Diferença: <b>${dif > 0 ? '+' : '−'}${esc(txt(Math.abs(dif)))}</b>. ` : ''}${lembra}</p>`;
    },
    save: (d, form) => {
      const a = byId(col, id), el = campoDoForm(form, 'novo'), v = numTexto(el ? el.value : '');
      if (!a) { toast('Este item não existe mais.', 'bad'); return; }
      if (!isFinite(v) || v < 0) { toast('Informe quanto tem.', 'bad'); return false; }
      const novo = t === 'prod' ? Math.round(v) : arred(v, casas);
      // o estoque mudou com a janela aberta (o outro aparelho acertou, vendeu, comprou...): nada é gravado (e o banco confere de
      // novo, como na versão 16, o que ainda não chegou aqui)
      if (num(a[campo]) !== atual) { toast(`Outro aparelho mudou o estoque de ${a.nome} enquanto esta janela estava aberta (agora: ${txt(num(a[campo]))}). Nada foi gravado: confira e acerte de novo, se ainda precisar.`, 'bad'); return; }
      if (novo === atual) { toast(`Nada mudou: ${a.nome} continua com ${txt(novo)}.`); return; }
      const marca = marcaDesfazer();
      put(col, { ...a, [campo]: novo });
      avisoDesfazer(`${a.nome}: agora tem ${txt(novo)}.`, marca, () => cadDesfazerAcerto(t, id, novo, atual));
    },
  });
  cadTocarSeleciona(FORM.form);
  // no celular o teclado numérico abre direto, com o número selecionado: é o único campo, e digitar troca o número (sem isso, o
  // toque punha o cursor no meio dos dígitos e "1275" virava "1287075")
  if ('ontouchstart' in window) { const el = campoDoForm(FORM.form, 'novo'); if (el) { el.focus(); el.select(); } }
}
function cadPasso(s) {
  const el = FORM && campoDoForm(FORM.form, 'novo');
  if (!el) return;
  const v = numTexto(el.value);
  setCampo('novo', Math.max(0, arred((isFinite(v) ? v : 0) + s * cadAcerto.passo, 3)));
}
/* Pesei com o carretel: o peso na balança menos o carretel vazio (o último usado fica lembrado neste aparelho). */
const cadCarretel = () => { try { const v = num(localStorage.getItem('nexos-carretel')); return v > 0 ? v : 200; } catch (e) { return 200; } };
function cadPesar() {
  const b = $('#cadBalanca');
  if (!b) return;
  b.hidden = false;
  b.innerHTML = `<div class="cad-balanca"><div><label for="cadB1">Na balança (g)</label><input id="cadB1" type="text" inputmode="decimal" autocomplete="off" data-num="1" oninput="cadPesou()"></div><span aria-hidden="true">−</span>
    <div><label for="cadB2">Carretel vazio (g)</label><input id="cadB2" type="text" inputmode="decimal" autocomplete="off" data-num="1" value="${esc(paraCampo(cadCarretel()))}" oninput="cadPesou()"></div><span aria-hidden="true">=</span>
    <div><span class="rotulo">Filamento</span><output id="cadB3">—</output></div></div>`;
  $('#cadB1').focus();
}
function cadPesou() {
  const a = num(($('#cadB1') || {}).value), c = num(($('#cadB2') || {}).value), g = Math.max(0, arred(a - c, 1));
  if (!(a > 0)) { $('#cadB3').textContent = '—'; return; }
  try { localStorage.setItem('nexos-carretel', String(c)); } catch (e) { /* sem armazenamento: vale só agora */ }
  $('#cadB3').textContent = gramas(g);
  setCampo('novo', g);
}
/* Desfazer do acerto: volta o número de antes, só se o estoque ainda estiver como o acerto deixou (aqui e no banco). */
function cadDesfazerAcerto(t, id, novo, antes) {
  const [col, campo] = cadDoTipo(t), b = byId(col, id);
  if (!b || num(b[campo]) !== novo) return opJaMudou();
  putConferindo(col, { ...b, [campo]: antes }, { [campo]: novo });
  render();
  toast(`Desfeito: ${b.nome} voltou para ${cadTxtEstoque(t, b, antes)}.`);
}
