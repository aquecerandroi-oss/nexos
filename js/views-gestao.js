'use strict';
/* Nexos — telas de Gestão: Financeiro, Relatórios e Configuração.
   A tela "Perfil e equipe" fica em js/auth.js. As contas vêm de js/calc.js; aqui só se monta a tela. */

/* ---------- Ajudantes deste arquivo ---------- */
/* R$ sem "-R$ 0,00": arredonda nos centavos antes de formatar. */
const gesBrl = v => brl(arred(v, 2) + 0);
/* Cor de um resultado: verde quando sobra, vermelho quando falta, neutro quando zera. */
const gesSinal = v => { const r = arred(v, 2); return r > 0 ? 'pos' : r < 0 ? 'neg' : ''; };
const gesPlural = (n, um, varios) => (num(n) === 1 ? '1 ' + um : nf(n) + ' ' + varios);
/* Só cor em hexadecimal entra em style (a cor do filamento vem dos dados). */
const gesCorSegura = c => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? String(c) : '#888');
/* Botão de linha de tabela: o id viaja em data-id, nunca dentro do código do onclick. */
const gesBotao = (rotulo, fn, id, cls = 'ghost') =>
  `<button type="button" class="btn ${cls} sm" data-id="${esc(id)}" onclick="${fn}(this.dataset.id)">${rotulo}</button>`;
/* Devolve o foco ao controle que acabou de ser usado, depois de a tela ser redesenhada. */
const gesFocar = seletor => { const el = $(seletor); if (el) el.focus({ preventScroll: true }); };

/* ====================== Financeiro ====================== */
let gesMes = mesAtual();
const gesCategorias = ['Aluguel', 'Energia', 'Internet', 'Software', 'Anúncios', 'Embalagens', 'Insumos', 'Frete', 'Contador', 'Equipamentos', 'Retirada', 'Outros'];

VIEWS.financeiro = function () {
  const c = caixaDoMes(gesMes), mesNome = esc(nomeMesLongo(gesMes)), ant = addMeses(gesMes, -1);
  const saidas = c.imposto + c.compras + c.manutencao + c.gastos;

  /* Demonstrativo: cada saída em uma linha "(−)"; os totais levam a cor do resultado. */
  const linha = (rotulo, valor, cls = '') => `<tr><td>${rotulo}</td><td class="right num ${cls}">${gesBrl(valor)}</td></tr>`;
  const menos = (rotulo, valor) => linha('(−) ' + rotulo, valor, arred(valor, 2) > 0 ? 'neg' : 'muted');
  const total = (rotulo, valor) => `<tr class="total"><td>${rotulo}</td><td class="right num ${gesSinal(valor)}">${gesBrl(valor)}</td></tr>`;
  const categorias = Object.keys(c.porCategoria).map(k => ({ nome: k, valor: c.porCategoria[k] }))
    .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'));
  const qtdVendas = c.vendas.n ? `<small>${gesPlural(c.vendas.n, 'venda', 'vendas')} · ${gesPlural(c.vendas.qtd, 'peça', 'peças')}</small>` : '';
  const demonstrativo = tabela(['Descrição', { t: 'Valor', r: 1 }],
    linha('Vendas' + qtdVendas, c.bruto) +
    menos('Taxas dos canais', c.taxas) +
    menos('Frete pago', c.frete) +
    total('Recebido das vendas', c.liquido) +
    menos('Impostos (Simples, estimado)', c.imposto) +
    menos('Compras de filamento', c.compras) +
    menos('Manutenção', c.manutencao) +
    (categorias.length ? categorias.map(x => menos(esc(x.nome), x.valor)).join('') : menos('Gastos lançados', 0)) +
    total('Resultado do caixa', c.resultado) +
    menos('Retiradas dos sócios', c.retiradas) +
    total('Saldo do mês', c.saldo));

  /* Lançamentos do mês, mais recentes primeiro. */
  const lancs = [...c.lancamentos].sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) ||
    String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')) || String(b.id).localeCompare(String(a.id)));
  const linhasLanc = lancs.map(l => {
    const retirada = l.tipo === 'retirada';
    return `<tr>
      <td class="num">${esc(dataBR(l.data))}</td>
      <td>${selo(retirada ? 'Retirada' : 'Gasto', retirada ? 'info' : 'mute')}</td>
      <td>${esc(retirada ? 'Retirada' : l.categoria || 'Outros')}</td>
      <td style="min-width:180px">${esc(l.descricao)}</td>
      <td>${l.fixo ? selo('Todo mês') : ''}</td>
      <td class="right num">${gesBrl(l.valor)}</td>
      <td><div class="rowbtns">${gesBotao('Editar', 'gesEditarLancamento', l.id)}${gesBotao('Excluir', 'gesExcluirLancamento', l.id, 'danger')}</div></td></tr>`;
  }).join('');
  const fixosAnt = S.lancamentos.filter(l => l.fixo && noPeriodo(l.data, ant, ant)).length;
  const semLancamentos = vazio(`Nenhum gasto ou retirada em ${mesNome}. Lance aqui aluguel, internet, anúncios e o que os sócios retirarem.`,
    `<div class="inline" style="justify-content:center"><button type="button" class="btn" onclick="gesNovoLancamento('gasto')">+ Gasto</button>${fixosAnt
      ? `<button type="button" class="btn ghost" style="white-space:normal" onclick="gesCopiarFixos()">Copiar ${gesPlural(fixosAnt, 'lançamento fixo', 'lançamentos fixos')} de ${esc(nomeMesLongo(ant))}</button>` : ''}</div>`);

  /* Gastos fixos do mês diferentes do valor usado no rateio do custo das peças. */
  const fixosMes = arred(c.fixos, 2), rateio = arred(S.config.custosFixos, 2);
  const avisoRateio = fixosMes > 0 && fixosMes !== rateio ? `<div class="inline mt">
      <span style="flex:1 1 260px">Gastos fixos deste mês: <b>${gesBrl(fixosMes)}</b>. O rateio no custo das peças usa <b>${gesBrl(rateio)}</b>.</span>
      <button type="button" class="btn ghost sm" onclick="gesUsarFixosNoRateio()">Usar ${gesBrl(fixosMes)} no rateio</button></div>` : '';

  /* Mês: a lista da base funciona em qualquer navegador; sem ela, vale o campo de mês do próprio navegador. */
  const filtroMes = typeof seletorMes === 'function' ? seletorMes(gesMes, 'gesTrocarMes')
    : `<div><label for="gesMesIn">Mês</label><input id="gesMesIn" type="month" value="${esc(gesMes)}" placeholder="AAAA-MM" onchange="gesTrocarMes(this.value)"></div>`;
  const seta = (n, rotulo, sinal) => `<button type="button" class="btn ghost" style="font-size:17px;line-height:20px" data-ges-mes="${n}" title="${rotulo}" aria-label="${rotulo}" onclick="gesMoverMes(${n})">${sinal}</button>`;

  return head('Financeiro', 'O que entrou e o que saiu do caixa no mês',
    `<button type="button" class="btn" onclick="gesNovoLancamento('gasto')">+ Gasto</button>
     <button type="button" class="btn ghost" onclick="gesNovoLancamento('retirada')">+ Retirada</button>
     <button type="button" class="btn ghost" onclick="gesCopiarFixos()">Copiar gastos fixos do mês anterior</button>`) + `
    <div class="filtros">
      ${seta(-1, 'Mês anterior', '‹')}
      ${filtroMes}
      ${seta(1, 'Próximo mês', '›')}
      ${gesMes === mesAtual() ? '' : '<button type="button" class="btn ghost" data-ges-mes="0" onclick="gesMoverMes(0)">Voltar para este mês</button>'}
    </div>
    <div class="cards">
      ${kpi('Recebido das vendas', gesBrl(c.liquido), 'já sem taxas e frete', c.liquido < 0 ? 'neg' : '')}
      ${kpi('Saídas', gesBrl(saidas), 'impostos, compras, manutenção e gastos')}
      ${kpi('Resultado do caixa', gesBrl(c.resultado), 'recebido menos saídas', gesSinal(c.resultado))}
      ${kpi('Saldo após retiradas', gesBrl(c.saldo), c.retiradas > 0 ? 'retiradas: ' + gesBrl(c.retiradas) : 'sem retiradas no mês', gesSinal(c.saldo))}
    </div>
    <div class="panel"><h2>Demonstrativo de ${mesNome}</h2>
      <div style="max-width:680px">${demonstrativo}
        <p class="muted txt-sm mt">O lucro mostrado no Painel e nos Relatórios usa o custo de cada peça vendida. Aqui é o dinheiro que entrou e saiu no mês, por isso os números podem ser diferentes.</p>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Lançamentos</h2>${lancs.length ? `<span class="muted txt-sm">Gastos: ${gesBrl(c.gastos)} · Retiradas: ${gesBrl(c.retiradas)}</span>` : ''}</div>
      ${lancs.length ? tabela(['Data', 'Tipo', 'Categoria', 'Descrição', 'Repete', { t: 'Valor', r: 1 }, ''], linhasLanc) : semLancamentos}
      ${avisoRateio}
      <p class="hint" style="margin-top:12px">Compras de filamento, reposição de insumos e manutenções entram sozinhas no demonstrativo. Não precisa lançar de novo aqui.</p>
    </div>`;
};

function gesTrocarMes(v) {
  v = String(v || '').trim();
  const br = v.match(/^(\d{1,2})\/(\d{4})$/);            // campo de mês digitado à mão: aceita 11/2026
  if (br) v = br[2] + '-' + br[1].padStart(2, '0');
  if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(v)) gesMes = v;
  else if (v) toast('Não entendi o mês. Escreva assim: 11/2026.', 'bad');
  render();
  if (!('ontouchstart' in window)) gesFocar('#main .filtros select, #gesMesIn');
}
/* n: -1 mês anterior, 1 próximo mês, 0 volta para o mês atual. */
function gesMoverMes(n) {
  gesMes = n ? addMeses(gesMes, n) : mesAtual();
  render();
  gesFocar(`[data-ges-mes="${n}"]`);
}

/* Formulário de gasto ou retirada (l = lançamento existente; sem l = novo do tipo informado). */
function gesFormLancamento(l, tipoNovo) {
  const tipo = (l ? l.tipo : tipoNovo) === 'retirada' ? 'retirada' : 'gasto';
  const vals = l ? { ...l, tipo } : {
    tipo, data: gesMes === mesAtual() ? hoje() : gesMes + '-01',
    categoria: tipo === 'retirada' ? 'Retirada' : 'Outros', descricao: '', valor: '', fixo: false,
  };
  if (tipo === 'retirada') vals.categoria = 'Retirada';
  else if (!vals.categoria) vals.categoria = 'Outros';
  /* categoria antiga fora da lista continua disponível, para não ser trocada sem querer ao editar */
  const categorias = gesCategorias.includes(vals.categoria) ? gesCategorias : [...gesCategorias, vals.categoria];
  openForm({
    title: l ? 'Editar lançamento' : tipo === 'retirada' ? 'Nova retirada' : 'Novo gasto',
    fields: [
      { k: 'tipo', label: 'Tipo', type: 'select', options: [['gasto', 'Gasto'], ['retirada', 'Retirada dos sócios']] },
      { k: 'data', label: 'Data', type: 'date', req: true },
      { k: 'categoria', label: 'Categoria', type: 'select', options: categorias.map(x => [x, x]) },
      { k: 'valor', label: 'Valor (R$)', type: 'number', req: true },
      { k: 'descricao', label: 'Descrição', req: true, full: true, ph: tipo === 'retirada' ? 'Ex.: Retirada do mês' : 'Ex.: Aluguel da sala' },
      { k: 'fixo', label: 'Repete todo mês (gasto fixo)', type: 'check', full: true,
        hint: 'No mês seguinte, use “Copiar gastos fixos do mês anterior” para repetir este lançamento.' },
    ],
    vals,
    change(el, form) {                                   // tipo e categoria andam juntos: "Retirada" é só o que os sócios retiram
      const tipoEl = form.elements.tipo, cat = form.elements.categoria;
      if (el.name === 'tipo') {
        if (el.value === 'retirada') cat.value = 'Retirada';
        else if (cat.value === 'Retirada') cat.value = 'Outros';
      } else if (el.name === 'categoria') {
        tipoEl.value = el.value === 'Retirada' ? 'retirada' : 'gasto';
      }
    },
    save(d) {
      const valor = arred(d.valor, 2), retirada = d.tipo === 'retirada' || d.categoria === 'Retirada';
      if (!/^20\d{2}-\d{2}-\d{2}$/.test(d.data)) { toast('Confira a data do lançamento.', 'bad'); return false; }
      if (!d.descricao) { toast('Escreva uma descrição.', 'bad'); return false; }
      if (!(valor > 0)) { toast('Informe um valor maior que zero.', 'bad'); return false; }
      put('lancamentos', { ...(l || { id: uid(), criadoEm: agoraISO() }), ...d, valor,
        tipo: retirada ? 'retirada' : 'gasto', categoria: retirada ? 'Retirada' : d.categoria });
      const mes = d.data.slice(0, 7);
      if (mes === gesMes) toast('Lançamento salvo.');
      else { gesMes = mes; toast('Lançamento salvo em ' + nomeMesLongo(mes) + '. A tela foi para esse mês.'); }
    },
  });
}
function gesNovoLancamento(tipo) { gesFormLancamento(null, tipo); }
function gesEditarLancamento(id) {
  const l = byId('lancamentos', id);
  if (!l) return toast('Esse lançamento não existe mais.', 'bad');
  gesFormLancamento(l);
}
function gesExcluirLancamento(id) {
  const l = byId('lancamentos', id);
  if (!l) return;
  if (!confirmar(`Excluir o lançamento “${l.descricao || 'sem descrição'}” de ${gesBrl(l.valor)}?`)) return;
  rm('lancamentos', id); render(); toast('Lançamento excluído.');
}
function gesCopiarFixos() {
  const ant = addMeses(gesMes, -1), antNome = nomeMesLongo(ant);
  const haviaFixos = S.lancamentos.some(l => l.fixo && noPeriodo(l.data, ant, ant));
  const n = copiarFixos(gesMes);
  if (n) toast(gesPlural(n, 'lançamento fixo copiado', 'lançamentos fixos copiados') + ' de ' + antNome + '.');
  else if (haviaFixos) toast('Nada novo para copiar: os gastos fixos de ' + antNome + ' já estão neste mês.');
  else toast('Não há gastos marcados como “Repete todo mês” em ' + antNome + '.');
  render();
}
function gesUsarFixosNoRateio() {
  const x = arred(caixaDoMes(gesMes).fixos, 2);
  if (!(x > 0)) return;
  S.config.custosFixos = x;
  if (gesRascunho) { delete gesRascunho.custosFixos; if (!Object.keys(gesRascunho).length) gesRascunho = null; }
  saveMeta('config'); render();
  toast('Rateio atualizado: ' + gesBrl(x) + ' de gastos fixos por mês.');
}

/* ====================== Relatórios ====================== */
let gesPeriodo = 6;

VIEWS.relatorios = function () {
  const meses = ultimosMeses(gesPeriodo), ini = meses[0], fim = meses[meses.length - 1];
  const serie = serieMensal(gesPeriodo), rotulos = serie.map(s => s.rotulo);
  const r = resumoVendas(S.vendas.filter(v => noPeriodo(v.data, ini, fim)));
  const produtos = rankingProdutos(ini, fim), canais = rankingCanais(ini, fim);
  const consumoG = soma(serie, 'consumoG');

  /* Um filtro só, acima de tudo que ele afeta. */
  const abas = `<div class="tabs" role="group" aria-label="Período dos relatórios" style="max-width:440px">${[3, 6, 12].map(n =>
    `<button type="button" class="${n === gesPeriodo ? 'on' : ''}" aria-pressed="${n === gesPeriodo}" onclick="gesTrocarPeriodo(${n})">${n} meses</button>`).join('')}</div>`;

  const cartoes = `<div class="cards">
      ${kpi('Faturamento', gesBrl(r.bruto), r.n ? gesPlural(r.n, 'venda', 'vendas') : 'nenhuma venda no período')}
      ${kpi('Lucro', gesBrl(r.lucro), r.n ? 'margem de ' + pct(r.margem) : 'sem vendas no período', gesSinal(r.lucro))}
      ${kpi('Peças vendidas', nf(r.qtd), r.n ? gesPlural(produtos.length, 'produto diferente', 'produtos diferentes') : '')}
      ${kpi('Ticket médio', r.n ? gesBrl(r.bruto / r.n) : '—', 'valor médio de cada venda')}
    </div>`;

  let corpo;
  if (!r.n) {
    corpo = `<div class="panel">${vazio(
      `Nenhuma venda nos últimos ${gesPeriodo} meses. Os gráficos de evolução, produtos e canais aparecem depois das primeiras vendas.` +
      (S.vendas.length && gesPeriodo < 12 ? ' Existem vendas mais antigas: experimente um período maior.' : ''),
      `<button type="button" class="btn" onclick="ir('vendas')">Registrar uma venda</button>`)}</div>` +
      (consumoG > 0 ? gesPainelConsumo(serie, ini, fim) : '');
  } else {
    const linhasMes = serie.map(s => {
      const m = resumoVendas(vendasDoMes(s.mes));
      return `<tr><td>${esc(s.rotulo)}</td>
        <td class="right num">${gesBrl(s.fat)}</td>
        <td class="right num">${gesBrl(s.custos)}</td>
        <td class="right num ${arred(s.lucro, 2) < 0 ? 'neg' : ''}">${gesBrl(s.lucro)}</td>
        <td class="right num">${m.n ? pct(m.margem) : '—'}</td>
        <td class="right num">${nf(s.qtd)}</td></tr>`;
    }).join('') + `<tr class="total"><td>Total</td>
        <td class="right num">${gesBrl(r.bruto)}</td>
        <td class="right num">${gesBrl(r.bruto - r.lucro)}</td>
        <td class="right num ${gesSinal(r.lucro)}">${gesBrl(r.lucro)}</td>
        <td class="right num">${pct(r.margem)}</td>
        <td class="right num">${nf(r.qtd)}</td></tr>`;
    corpo = `<div class="panel"><h2>Evolução mês a mês</h2>
        ${graficoLinhas({ titulo: 'Evolução mês a mês', rotulos, series: [
          { nome: 'Faturamento', cor: CORES.azul, valores: serie.map(s => s.fat) },
          { nome: 'Custos', cor: CORES.laranja, valores: serie.map(s => s.custos) },
          { nome: 'Lucro', cor: CORES.verde, valores: serie.map(s => s.lucro) }], fmt: brl })}
        <div class="mt">${tabela(['Mês', { t: 'Faturamento', r: 1 }, { t: 'Custos', r: 1 }, { t: 'Lucro', r: 1 }, { t: 'Margem', r: 1 }, { t: 'Peças', r: 1 }], linhasMes)}</div>
        <p class="hint" style="margin-top:10px">Custos: custo das peças vendidas, taxas dos canais, frete e impostos. O mês atual ainda está em andamento.</p>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Produtos mais lucrativos</h2>${produtos.length > 10 ? `<span class="muted txt-sm">os 10 primeiros de ${nf(produtos.length)} produtos vendidos</span>` : ''}</div>
        ${barrasRank(produtos.slice(0, 10).map(p => ({ nome: p.nome, valor: p.lucro,
          detalhe: nf(p.qtd) + ' un · faturou ' + brl(p.fat) + ' · margem ' + pct(p.margem) })), { vazio: 'Nenhum produto vendido no período.' })}
      </div>
      <div class="panel"><h2>Lucro por canal</h2>
        ${barrasRank(canais.map(x => ({ nome: x.nome, valor: x.lucro,
          detalhe: gesPlural(x.n, 'venda', 'vendas') + ' · faturou ' + brl(x.fat) + ' · taxas ' + brl(x.taxas) })), { vazio: 'Nenhuma venda no período.' })}
      </div>` + gesPainelConsumo(serie, ini, fim);
  }
  return head('Relatórios', `Últimos ${gesPeriodo} meses · ${esc(nomeMes(ini))} a ${esc(nomeMes(fim))}`) + abas + cartoes + corpo;
};

function gesTrocarPeriodo(n) {
  gesPeriodo = [3, 6, 12].includes(n) ? n : 6;
  render();
  gesFocar('#main .tabs .on');
}

/* Filamento usado por mês (peças boas + falhas) e por material, no mesmo período da tela. */
function gesPainelConsumo(serie, ini, fim) {
  const totalG = soma(serie, 'consumoG'), materiais = consumoPorMaterial(ini, fim);
  if (!(totalG > 0)) {
    return `<div class="panel"><h2>Consumo de filamento</h2>${vazio(
      'Nenhum filamento consumido neste período. O consumo aparece quando uma ordem de produção é concluída ou uma falha é registrada.',
      `<button type="button" class="btn ghost" onclick="ir('producao')">Ir para Produção</button>`)}</div>`;
  }
  return `<div class="panel">
      <div class="panel-head"><h2>Consumo de filamento</h2><span class="muted txt-sm">${gramas(totalG)} no período, somando peças boas e falhas</span></div>
      ${graficoLinhas({ titulo: 'Consumo de filamento por mês', rotulos: serie.map(s => s.rotulo),
        series: [{ nome: 'Filamento usado', cor: CORES.azul, valores: serie.map(s => s.consumoG) }], fmt: gramas })}
      <p class="hint">Eixo do gráfico em gramas.</p>
      <div class="mt">${tabela(['Mês', ...serie.map(s => ({ t: esc(s.rotulo), r: 1 }))],
        `<tr><td style="white-space:nowrap">Filamento usado</td>${serie.map(s => `<td class="right num">${gramas(s.consumoG)}</td>`).join('')}</tr>`)}</div>
      <h2 style="margin-top:20px">Por material</h2>
      ${barrasRank(materiais.map(m => ({ nome: m.nome, valor: m.g, cor: gesCorSegura(m.cor),
        detalhe: brl(m.custo) + (m.falhaG ? ' · ' + gramas(m.falhaG) + ' em falhas' : '') })), { fmt: gramas, vazio: 'Nenhum material consumido no período.' })}
    </div>`;
}

/* ====================== Configuração ====================== */
/* Campos alterados e ainda não salvos. Ficam guardados para não sumirem quando a tela é redesenhada
   (por exemplo, ao salvar um canal de venda logo abaixo do formulário). */
let gesRascunho = null;
const gesGradeConfig = 'grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr))';
const gesPaineisConfig = [
  { id: 'impostos', titulo: 'Impostos e margem', campos: [
    { k: 'imposto', type: 'number', label: 'Imposto sobre a venda — Simples Nacional (%)', hint: 'Use a alíquota efetiva do seu Simples. Confirme com o contador.' },
    { k: 'margem', type: 'number', label: 'Margem de lucro desejada (%)', hint: 'Usada para calcular o preço sugerido' },
  ] },
  { id: 'falhas', titulo: 'Falhas de impressão', campos: [
    { k: 'falha', type: 'number', label: 'Taxa fixa de falhas (%)' },
    { k: 'falhaAuto', type: 'check', full: true, label: 'Usar a taxa medida quando houver dados suficientes' },
  ] },
  { id: 'impressora', titulo: 'Energia e impressora', campos: [
    { k: 'kwh', type: 'number', label: 'Energia (R$ por kWh)' },
    { k: 'potencia', type: 'number', label: 'Consumo médio da impressora (W)' },
    { k: 'valorImpressora', type: 'number', label: 'Valor da impressora (R$)' },
    { k: 'vidaUtil', type: 'number', label: 'Vida útil da impressora (horas)', hint: 'Valor ÷ vida útil = desgaste por hora' },
    { k: 'manutencaoHora', type: 'number', label: 'Manutenção (R$ por hora)' },
    { k: 'horimetroInicial', type: 'number', label: 'Horas que a impressora já tinha', hint: 'Somadas às horas das ordens concluídas para os avisos de manutenção' },
  ] },
  { id: 'fixos', titulo: 'Mão de obra e gastos fixos', campos: [
    { k: 'maoObraHora', type: 'number', label: 'Mão de obra (R$ por hora)' },
    { k: 'custosFixos', type: 'number', label: 'Gastos fixos mensais (R$)', hint: 'Aluguel, internet, softwares… rateados por hora impressa' },
    { k: 'horasMes', type: 'number', label: 'Horas de impressão por mês', hint: 'Divide os gastos fixos' },
    { k: 'alertaEstoque', type: 'number', label: 'Avisar quando o filamento chegar em (g)' },
  ] },
  { id: 'metas', titulo: 'Metas do mês', campos: [
    { k: 'metaFat', type: 'number', label: 'Meta de faturamento (R$)' },
    { k: 'metaLucro', type: 'number', label: 'Meta de lucro (R$)' },
  ] },
];
const gesCamposConfig = gesPaineisConfig.flatMap(p => p.campos);
const gesIgualCampo = (f, a, b) => (f.type === 'check' ? !!a === !!b : num(a) === num(b));

VIEWS.config = function () {
  if (gesRascunho) {                                   // tira do rascunho o que já ficou igual ao valor salvo
    gesCamposConfig.forEach(f => { if (f.k in gesRascunho && gesIgualCampo(f, gesRascunho[f.k], S.config[f.k])) delete gesRascunho[f.k]; });
    if (!Object.keys(gesRascunho).length) gesRascunho = null;
  }
  const valores = { ...S.config, ...(gesRascunho || {}) }, mr = manutencaoRealHora();
  const dicas = {
    manutencaoHora: mr.horas > 0
      ? `Custo real medido: ${brl(mr.porHora)} por hora (${brl(mr.custo)} em ${horasFmt(mr.horas)} de impressão)`
      : 'Custo real medido: ainda não há horas impressas para calcular',
  };
  const extras = {
    falhas: gesTextoFalha(),
    metas: '<p class="hint" style="margin-top:10px">As metas aparecem no Painel, comparadas com as vendas do mês. Deixe 0 para não usar.</p>',
  };
  const paineis = gesPaineisConfig.map(p => `<div class="panel"><h2>${esc(p.titulo)}</h2>
      <div class="grid3" style="${gesGradeConfig}">${p.campos.map(f => campo(dicas[f.k] ? { ...f, hint: dicas[f.k] } : f, valores[f.k])).join('')}</div>${extras[p.id] || ''}</div>`).join('');
  const oculto = gesRascunho ? '' : ' hidden';
  return head('Configuração', 'Tudo que entra no cálculo de custo e lucro') + `
    <form onsubmit="gesSalvarConfig(event)" oninput="gesRascunhar(this)" style="margin-bottom:22px">
      ${paineis}
      ${gesResumoHora()}
      <div class="actions">
        <span class="aviso txt-sm" data-ges-rascunho style="align-self:center"${oculto}>Há alterações que ainda não foram salvas.</span>
        <button type="button" class="btn ghost" data-ges-rascunho onclick="gesDescartarConfig()"${oculto}>Descartar alterações</button>
        <button class="btn">Salvar configuração</button>
      </div>
    </form>
    ${gesPainelCanais()}`;
};

/* Taxa de falhas medida hoje e qual das duas (medida ou fixa) está valendo no custo. */
function gesTextoFalha() {
  const tf = taxaFalha();
  const medida = tf.prodG > 0
    ? `Taxa medida nos últimos ${tf.dias} dias: <b>${pct(tf.realPct)}</b> (${gramas(tf.falhaG)} perdidos em falhas para ${gramas(tf.prodG)} usados em peças boas).`
    : `Ainda não há peças concluídas nos últimos ${tf.dias} dias para medir a taxa.`;
  let emUso = `Em uso hoje no custo das peças: a taxa ${tf.real ? 'medida' : 'fixa'}, <b>${pct(tf.pct)}</b>.`;
  if (!tf.real && S.config.falhaAuto) {
    emUso += ` A medida passa a valer quando as peças boas dos últimos ${tf.dias} dias somarem ${gramas(tf.minG)} de filamento` +
      (tf.prodG > 0 ? ` (faltam ${gramas(tf.minG - tf.prodG)})` : '') + '.';
  }
  return `<p class="muted mt">${medida}<br>${emUso}</p>`;
}

/* Quanto custa uma hora de impressora ligada, com os valores já salvos. A conta é a mesma do custo das
   peças (custoProduto, em calc.js), feita para uma hora sem material nem mão de obra. */
function gesResumoHora() {
  const c = S.config, h = custoProduto({ horas: 1 });
  const manutencao = Math.min(num(c.manutencaoHora), h.maquina), desgaste = h.maquina - manutencao;
  const avisos = [];
  if (num(c.valorImpressora) > 0 && !(num(c.vidaUtil) > 0)) avisos.push('O desgaste da impressora está fora do custo: informe a vida útil em horas.');
  if (num(c.custosFixos) > 0 && !(num(c.horasMes) > 0)) avisos.push('Os gastos fixos estão fora do custo: informe as horas de impressão por mês.');
  return `<div class="calc"><h4>Custo de uma hora de impressão hoje</h4>
      <div><span>Energia (${nf(c.potencia)} W × ${brl(c.kwh)} por kWh)</span><b>${brl(h.energia)}</b></div>
      <div><span>Desgaste da impressora (${brl(c.valorImpressora)} ÷ ${nf(c.vidaUtil)} h)</span><b>${brl(desgaste)}</b></div>
      <div><span>Manutenção</span><b>${brl(manutencao)}</b></div>
      <div><span>Gastos fixos rateados (${brl(c.custosFixos)} ÷ ${nf(c.horasMes)} h por mês)</span><b>${brl(h.fixos)}</b></div>
      <div class="tot"><span>Total por hora</span><b>${brl(h.energia + h.maquina + h.fixos)}</b></div>
    </div>
    ${avisos.map(a => `<p class="aviso txt-sm" style="margin-top:8px">${a}</p>`).join('')}
    <p class="hint">Conta feita com os valores já salvos. No custo de cada peça entram também o filamento, a mão de obra, os insumos e a taxa de falhas.</p>`;
}

/* Guarda só o que está diferente do valor salvo e mostra o aviso de alterações pendentes. */
function gesRascunhar(form) {
  const v = lerCampos(form, gesCamposConfig), dif = {};
  gesCamposConfig.forEach(f => { if (f.k in v && !gesIgualCampo(f, v[f.k], S.config[f.k])) dif[f.k] = v[f.k]; });
  gesRascunho = Object.keys(dif).length ? dif : null;
  $$('[data-ges-rascunho]', form).forEach(el => { el.hidden = !gesRascunho; });
}
function gesDescartarConfig() { gesRascunho = null; render(); }
function gesSalvarConfig(e) {
  e.preventDefault();
  const v = lerCampos(e.target, gesCamposConfig);
  if (v.imposto + v.margem >= 100) {
    return toast('Imposto e margem juntos precisam ficar abaixo de 100%. A margem é a parte do preço de venda que fica como lucro.', 'bad');
  }
  Object.assign(S.config, v);
  gesRascunho = null;
  saveMeta('config'); render(); toast('Configuração salva.');
}

/* ---------- Canais de venda ---------- */
function gesPainelCanais() {
  const canais = [...S.canais].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  const linhas = canais.map(c => {
    const semSugestao = !(precoNoCanal({}, c, null, 1).sugerido > 0);   // imposto + margem + comissão chegam a 100%
    return `<tr>
      <td style="min-width:150px"><b>${esc(c.nome)}</b>${semSugestao ? '<small class="aviso">Sem preço sugerido: imposto, margem e comissão somam 100% ou mais</small>' : ''}</td>
      <td class="right num">${pct(c.pct)}</td>
      <td class="right num">${brl(c.fixa)}</td>
      <td class="right num">${brl(c.frete)}</td>
      <td><div class="rowbtns">${gesBotao('Editar', 'gesEditarCanal', c.id)}${gesBotao('Excluir', 'gesExcluirCanal', c.id, 'danger')}</div></td></tr>`;
  }).join('');
  return `<div class="panel">
      <div class="panel-head"><h2>Canais de venda e taxas</h2><button type="button" class="btn sm" onclick="gesEditarCanal()">+ Novo canal</button></div>
      ${canais.length
        ? tabela(['Canal', { t: 'Comissão (%)', r: 1 }, { t: 'Taxa fixa por unidade', r: 1 }, { t: 'Frete pago por pedido', r: 1 }, ''], linhas)
        : vazio('Nenhum canal de venda cadastrado. Cadastre onde você vende (Instagram, Shopee, Mercado Livre…) para ver o preço e o lucro em cada um.',
          '<button type="button" class="btn" onclick="gesEditarCanal()">+ Novo canal</button>')}
      <p class="hint" style="margin-top:12px">As taxas dos marketplaces mudam de tempos em tempos. Vale conferir no painel do vendedor de cada um e atualizar aqui.</p>
    </div>`;
}
/* Formulário de canal (sem id = novo). */
function gesEditarCanal(id) {
  const c = id ? byId('canais', id) : null;
  if (id && !c) return toast('Esse canal não existe mais.', 'bad');
  openForm({
    title: c ? 'Editar canal' : 'Novo canal',
    fields: [
      { k: 'nome', label: 'Nome do canal', req: true, full: true, ph: 'Ex.: Shopee, Mercado Livre, Feira' },
      { k: 'pct', label: 'Comissão (%)', type: 'number' },
      { k: 'fixa', label: 'Taxa fixa por unidade vendida (R$)', type: 'number' },
      { k: 'frete', label: 'Frete pago pela Nexos por pedido (R$)', type: 'number', hint: '0 se o cliente paga o frete' },
      { type: 'html', html: '<p class="hint">Mudanças nas taxas valem para as próximas vendas. As vendas já registradas guardam as taxas do dia em que foram feitas.</p>' },
    ],
    vals: c || { nome: '', pct: 0, fixa: 0, frete: 0 },
    preview(d) {
      const x = precoNoCanal({}, { id: '', pct: d.pct, fixa: d.fixa, frete: d.frete }, 100, 0);
      return `<div class="calc"><h4>Exemplo: pedido com uma peça de ${brl(x.preco)}</h4>
        <div><span>Comissão e taxa fixa do canal</span><b>${brl(x.taxa)}</b></div>
        <div><span>Frete pago no pedido</span><b>${brl(x.frete)}</b></div>
        <div><span>Imposto (${pct(S.config.imposto)})</span><b>${brl(x.imposto)}</b></div>
        <div class="tot"><span>Sobra para o custo da peça e o lucro</span><b>${gesBrl(x.lucro)}</b></div></div>`;
    },
    save(d) {
      if (!d.nome) { toast('Dê um nome ao canal.', 'bad'); return false; }
      if (d.pct >= 100) { toast('A comissão precisa ser menor que 100%.', 'bad'); return false; }
      const nome = d.nome.toLowerCase();
      if (S.canais.some(x => x.id !== (c ? c.id : '') && String(x.nome || '').trim().toLowerCase() === nome)) {
        toast('Já existe um canal com esse nome.', 'bad'); return false;
      }
      put('canais', { ...(c || {}), ...d, id: c ? c.id : uid() });
      toast(c ? 'Canal atualizado.' : 'Canal criado.');
    },
  });
}
function gesExcluirCanal(id) {
  const c = byId('canais', id);
  if (!c) return;
  const nProd = S.produtos.filter(p => num((p.precos || {})[id]) > 0).length;
  const nVend = S.vendas.filter(v => v.canalId === id).length;
  let msg = `Excluir o canal “${c.nome}”?`;
  if (nProd) msg += '\n\n' + gesPlural(nProd, 'produto tem', 'produtos têm') + ' preço neste canal. Esses preços deixam de aparecer.';
  if (nVend) msg += '\n\n' + gesPlural(nVend, 'venda já registrada continua', 'vendas já registradas continuam') + ' nos relatórios.';
  if (!confirmar(msg)) return;
  rm('canais', id); render(); toast('Canal excluído.');
}
