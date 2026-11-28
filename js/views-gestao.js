'use strict';
/* Nexos — telas de Gestão: Financeiro, Relatórios e Configuração.
   A tela "Perfil e equipe" fica em js/auth.js e a de contas a pagar e receber em js/views-contas.js.
   As contas vêm de js/calc.js; aqui só se monta a tela. Outros arquivos usam gesCategorias (categorias de gasto). */

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
/* Categorias de gasto (também usadas nas contas a pagar). A retirada dos sócios é um tipo de lançamento, não uma categoria. */
const gesCategorias = ['Aluguel', 'Energia', 'Internet', 'Software', 'Anúncios', 'Embalagens', 'Insumos', 'Frete', 'Contador', 'Equipamentos', 'Outros'];
/* Tipo do lançamento: 'gasto' (dinheiro que saiu), 'retirada' (o que os sócios tiraram) ou 'entrada' (dinheiro que
   entrou fora das vendas). Registro antigo sem tipo é gasto, como no cálculo do caixa. */
const gesTipoLanc = t => (t === 'retirada' || t === 'entrada' ? t : 'gasto');
const gesExemploLanc = { gasto: 'Ex.: Aluguel da sala', retirada: 'Ex.: Retirada do mês', entrada: 'Ex.: Reembolso de frete' };
/* Nome do sócio de uma retirada ('1' ou '2', com os nomes da Configuração). */
const gesNomeSocio = n => { const s = socios().find(x => x.n === String(n || '')); return s ? esc(s.nome) : '<span class="muted">Sem sócio definido</span>'; };
/* Lançamento criado ao pagar uma conta (que ainda está paga e ligada a ele): só muda desfazendo o pagamento. Um lançamento
   que perdeu a ligação (por exemplo, a mesma conta paga em dois aparelhos) volta a ser editável aqui. */
const gesDeConta = l => { const c = l && l.contaId && byId('contas', l.contaId); return !!(c && c.pagoEm && (!c.lancamentoId || c.lancamentoId === l.id)); };

VIEWS.financeiro = function () {
  const c = caixaDoMes(gesMes), mesNome = esc(nomeMesLongo(gesMes)), ant = addMeses(gesMes, -1);
  const saidas = c.imposto + c.compras + c.manutencao + c.gastos + c.devolucoes;
  const temEntradas = arred(c.entradas, 2) > 0, temDevolucoes = arred(c.devolucoes, 2) > 0;

  /* Demonstrativo: cada saída em uma linha "(−)" e cada entrada em uma "(+)"; os totais levam a cor do resultado. */
  const linha = (rotulo, valor, cls = '') => `<tr><td>${rotulo}</td><td class="right num ${cls}">${gesBrl(valor)}</td></tr>`;
  const menos = (rotulo, valor) => linha('(−) ' + rotulo, valor, arred(valor, 2) > 0 ? 'neg' : 'muted');
  const mais = (rotulo, valor) => linha('(+) ' + rotulo, valor, arred(valor, 2) > 0 ? 'pos' : 'muted');
  const total = (rotulo, valor) => `<tr class="total"><td>${rotulo}</td><td class="right num ${gesSinal(valor)}">${gesBrl(valor)}</td></tr>`;
  const categorias = Object.keys(c.porCategoria).map(k => ({ nome: k, valor: c.porCategoria[k] }))
    .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'));
  const devolvidas = num(c.vendas.devolvidas) > 0 ? ' · ' + gesPlural(c.vendas.devolvidas, 'devolvida', 'devolvidas') : '';
  const qtdVendas = c.vendas.n ? `<small>${gesPlural(c.vendas.n, 'venda', 'vendas')} · ${gesPlural(c.vendas.qtd, 'peça', 'peças')}${devolvidas}</small>` : '';
  const demonstrativo = tabela(['Descrição', { t: 'Valor', r: 1 }],
    linha('Vendas' + qtdVendas, c.bruto) +
    menos('Taxas dos canais', c.taxas) +
    menos('Frete pago', c.frete) +
    (arred(c.aPrazo, 2) > 0 ? menos('Vendas a prazo (contam no caixa quando o cliente paga)', c.aPrazo) : '') +
    (arred(c.recebidoContas, 2) > 0 ? mais('Recebido de contas a receber (pedidos e sinais)', c.recebidoContas) : '') +
    total('Recebido das vendas', c.liquido) +
    mais('Outras entradas', c.entradas) +
    menos('Impostos (Simples, estimado)', c.imposto) +
    (temDevolucoes ? menos('Devoluções (frete de volta e outros gastos)', c.devolucoes) : '') +
    menos('Compras de filamento', c.compras) +
    menos('Manutenção', c.manutencao) +
    (categorias.length ? categorias.map(x => menos(esc(x.nome), x.valor)).join('') : menos('Gastos lançados', 0)) +
    total('Resultado do caixa', c.resultado) +
    menos('Retiradas dos sócios', c.retiradas) +
    total('Saldo do mês', c.saldo));

  /* Lançamentos do mês, mais recentes primeiro. O que veio de uma conta paga só muda pela tela de contas. */
  const lancs = [...c.lancamentos].sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) ||
    String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')) || String(b.id).localeCompare(String(a.id)));
  const selos = { gasto: selo('Gasto'), retirada: selo('Retirada', 'info'), entrada: selo('Entrada', 'ok') };
  const linhasLanc = lancs.map(l => {
    const tipo = gesTipoLanc(l.tipo), conta = gesDeConta(l);
    const categoria = tipo === 'retirada' ? gesNomeSocio(l.socio) : esc(tipo === 'entrada' ? 'Outras entradas' : l.categoria || 'Outros');
    // cópia de fixo paga em outro mês (adiantada ou atrasada): diz de que mês ela é, para não parecer repetida
    const deMes = mesDaCopiaFixo(l), outroMes = deMes && deMes !== String(l.data || '').slice(0, 7) ? deMes : '';
    const botoes = conta
      ? gesBotao(tipo === 'entrada' ? 'Desfazer recebimento' : 'Desfazer pagamento', 'ctaDesfazer', l.contaId)
      : gesBotao('Editar', 'gesEditarLancamento', l.id) + gesBotao('Excluir', 'gesExcluirLancamento', l.id, 'danger');
    return `<tr>
      <td class="num">${esc(dataBR(l.data))}</td>
      <td>${selos[tipo]}</td>
      <td>${categoria}</td>
      <td style="min-width:180px">${esc(l.descricao)}${conta ? `<small>${tipo === 'entrada' ? 'Conta recebida' : 'Conta paga'}</small>` : ''}${outroMes ? `<small>Referente a ${esc(nomeMesLongo(outroMes))}</small>` : ''}</td>
      <td>${l.fixo ? selo('Todo mês') : ''}</td>
      <td class="right num${tipo === 'entrada' ? ' pos' : ''}">${gesBrl(l.valor)}</td>
      <td><div class="rowbtns">${botoes}</div></td></tr>`;
  }).join('');
  const resumoLanc = `Gastos: ${gesBrl(c.gastos)} · Retiradas: ${gesBrl(c.retiradas)}` + (temEntradas ? ` · Entradas: ${gesBrl(c.entradas)}` : '');
  // o que a cópia faria neste mês vazio: uma por série do mês anterior cuja cópia deste mês ainda não existe
  const fixosAnt = new Set(fixosDoMes(ant).filter(l => !byId('lancamentos', idCopiaFixo(l, gesMes))).map(serieFixo)).size;
  const semLancamentos = vazio(`Nenhum gasto, retirada ou entrada em ${mesNome}. Lance aqui aluguel, internet, anúncios, o que os sócios retirarem e o dinheiro que entrar fora das vendas.`,
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
     <button type="button" class="btn ghost" onclick="gesNovoLancamento('entrada')">+ Entrada</button>
     <button type="button" class="btn ghost" onclick="gesCopiarFixos()">Copiar gastos fixos do mês anterior</button>`) + `
    <div class="filtros">
      ${seta(-1, 'Mês anterior', '‹')}
      ${filtroMes}
      ${seta(1, 'Próximo mês', '›')}
      ${gesMes === mesAtual() ? '' : '<button type="button" class="btn ghost" data-ges-mes="0" onclick="gesMoverMes(0)">Voltar para este mês</button>'}
    </div>
    <div class="cards">
      ${kpi('Recebido das vendas', gesBrl(c.liquido), (temEntradas ? 'sem taxas e frete · outras entradas: ' + gesBrl(c.entradas) : 'já sem taxas e frete') +
        (arred(c.aPrazoAberto, 2) > 0 ? ' · ' + gesBrl(c.aPrazoAberto) + ' ainda a receber' : ''), c.liquido < 0 ? 'neg' : '')}
      ${kpi('Saídas', gesBrl(saidas), temDevolucoes ? 'impostos, compras, manutenção, gastos e devoluções' : 'impostos, compras, manutenção e gastos')}
      ${kpi('Resultado do caixa', gesBrl(c.resultado), temEntradas ? 'recebido + outras entradas − saídas' : 'recebido menos saídas', gesSinal(c.resultado))}
      ${kpi('Saldo após retiradas', gesBrl(c.saldo), c.retiradas > 0 ? 'retiradas: ' + gesBrl(c.retiradas) : 'sem retiradas no mês', gesSinal(c.saldo))}
    </div>
    <div class="panel"><h2>Demonstrativo de ${mesNome}</h2>
      <div style="max-width:680px">${demonstrativo}
        <p class="muted txt-sm mt">O lucro mostrado no Painel e nos Relatórios usa o custo de cada peça vendida. Aqui é o dinheiro que entrou e saiu no mês, por isso os números podem ser diferentes.</p>
      </div>
    </div>
    ${gesPainelSocios()}
    <div class="panel">
      <div class="panel-head"><h2>Lançamentos</h2>${lancs.length ? `<span class="muted txt-sm">${resumoLanc}</span>` : ''}</div>
      ${lancs.length ? tabela(['Data', 'Tipo', 'Categoria ou sócio', { t: 'Descrição', nome: 1 }, 'Repete', { t: 'Valor', r: 1 }, ''], linhasLanc) : semLancamentos}
      ${avisoRateio}
      <p class="hint" style="margin-top:12px">Compras de filamento, reposição de insumos, manutenções, devoluções e contas pagas entram sozinhas no demonstrativo. Não precisa lançar de novo aqui.</p>
    </div>`;
};

/* Divisão do resultado do caixa entre os sócios: no mês da tela e no ano até esse mês. Sócio com 0% e sem retiradas
   no período não aparece (numa empresa de um dono só, o sócio 2 fica com 0%). */
function gesPainelSocios() {
  const somaPct = arred(soma(socios(), 'pct'), 2);
  const bloco = (titulo, d) => {
    const linhas = d.socios.filter(s => s.pct > 0 || arred(s.retirado, 2) > 0).map(s => {
      const saldo = arred(s.saldo, 2);
      const nota = saldo < 0 ? `<small class="neg">${arred(s.retirado, 2) > 0 ? 'retirou a mais' : 'resultado negativo'}</small>` : '';
      return `<tr><td>${esc(s.nome)}</td>
        <td class="right num">${pct(s.pct)}</td>
        <td class="right num">${gesBrl(s.parte)}</td>
        <td class="right num">${gesBrl(s.retirado)}</td>
        <td class="right num ${gesSinal(saldo)}">${gesBrl(saldo)}${nota}</td></tr>`;
    }).join('') + (arred(d.semSocio, 2) > 0 ? `<tr><td colspan="3">Retiradas sem sócio<small>edite a retirada e escolha o sócio</small></td>
        <td class="right num">${gesBrl(d.semSocio)}</td><td></td></tr>` : '');
    return `<div class="calc"><h4>${esc(titulo)}</h4>
        <div><span>Resultado do caixa</span><b class="${gesSinal(d.resultado)}">${gesBrl(d.resultado)}</b></div>
        ${linhas ? tabela(['Sócio', { t: '%', r: 1 }, { t: 'Parte do resultado', r: 1 }, { t: 'Já retirou', r: 1 }, { t: 'Saldo', r: 1 }], linhas)
          : '<div><span>Nenhum sócio com parte definida.</span></div>'}
      </div>`;
  };
  return `<div class="panel"><h2>Divisão entre os sócios</h2>
      <p class="muted txt-sm">A base é o resultado do caixa antes das retiradas. Nomes e percentuais ficam na <a href="#config">Configuração</a>.</p>
      ${somaPct !== 100 ? `<p class="aviso txt-sm" style="margin-top:6px">As partes dos sócios somam ${pct(somaPct)}. O certo é somar 100%.</p>` : ''}
      <div class="cols" style="margin-bottom:0">
        ${bloco('Em ' + nomeMesLongo(gesMes), divisaoSocios(gesMes, gesMes))}
        ${bloco('No ano, até ' + nomeMesLongo(gesMes), divisaoSocios(gesMes.slice(0, 4) + '-01', gesMes))}
      </div>
    </div>`;
}

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

/* Formulário de lançamento: gasto, retirada dos sócios ou entrada (l = lançamento existente; sem l = novo do tipo informado). */
function gesFormLancamento(l, tipoNovo) {
  const tipo = gesTipoLanc(l ? l.tipo : tipoNovo);
  const vals = l ? { ...l, tipo, socio: String(l.socio || '') } : {
    tipo, data: gesMes === mesAtual() ? hoje() : gesMes + '-01', categoria: 'Outros', socio: '', descricao: '', valor: '', fixo: false,
  };
  /* a categoria só vale no gasto; nos outros tipos o campo fica escondido com "Outros", para o caso de virar gasto */
  if (tipo !== 'gasto' || !vals.categoria) vals.categoria = 'Outros';
  /* categoria antiga fora da lista continua disponível, para não ser trocada sem querer ao editar */
  const categorias = gesCategorias.includes(vals.categoria) ? gesCategorias : [...gesCategorias, vals.categoria];
  openForm({
    title: l ? 'Editar lançamento' : { gasto: 'Novo gasto', retirada: 'Nova retirada', entrada: 'Nova entrada' }[tipo],
    registro: l ? ['lancamentos', l.id] : null,
    fields: [
      { k: 'tipo', label: 'Tipo', type: 'select', options: [['gasto', 'Gasto'], ['retirada', 'Retirada dos sócios'], ['entrada', 'Entrada (fora das vendas)']],
        hint: 'Entrada é dinheiro que entrou fora das vendas, como um reembolso.' },
      { k: 'data', label: 'Data', type: 'date', req: true },
      { k: 'categoria', label: 'Categoria', type: 'select', options: categorias.map(x => [x, x]) },
      { k: 'socio', label: 'Sócio', type: 'select', options: [...socios().map(s => [s.n, s.nome]), ['', 'Sem sócio definido']],
        hint: 'Quem retirou. Entra na divisão entre os sócios.' },
      { k: 'valor', label: 'Valor (R$)', type: 'number', req: true },
      { k: 'descricao', label: 'Descrição', req: true, full: true, ph: gesExemploLanc[tipo] },
      { k: 'fixo', label: 'Repete todo mês', type: 'check', full: true,
        hint: 'No mês seguinte, use “Copiar gastos fixos do mês anterior” para repetir este lançamento.' },
    ],
    vals,
    change(el, form) { if (el.name === 'tipo') gesAjustarLancamento(form); },
    save(d) {
      const tipoFinal = gesTipoLanc(d.tipo), valor = arred(d.valor, 2);
      if (!/^20\d{2}-\d{2}-\d{2}$/.test(d.data)) { toast('Confira a data do lançamento.', 'bad'); return false; }
      if (!d.descricao) { toast('Escreva uma descrição.', 'bad'); return false; }
      if (!(valor > 0)) { toast('Informe um valor maior que zero.', 'bad'); return false; }
      const rec = { ...((l && byId('lancamentos', l.id)) || l || { id: uid(), criadoEm: agoraISO() }),
        tipo: tipoFinal, data: d.data, descricao: d.descricao, valor, fixo: !!d.fixo,
        categoria: tipoFinal === 'retirada' ? 'Retirada' : tipoFinal === 'entrada' ? 'Outras entradas' : d.categoria || 'Outros' };
      if (tipoFinal === 'retirada') rec.socio = d.socio === '1' || d.socio === '2' ? d.socio : '';
      else delete rec.socio;
      put('lancamentos', rec);
      const mes = d.data.slice(0, 7);
      if (mes === gesMes) toast('Lançamento salvo.');
      else { gesMes = mes; toast('Lançamento salvo em ' + nomeMesLongo(mes) + '. A tela foi para esse mês.'); }
    },
  });
  gesAjustarLancamento(FORM && FORM.form);
}
/* Mostra no formulário só o que vale para o tipo escolhido: a categoria no gasto e o sócio na retirada. */
function gesAjustarLancamento(form) {
  if (!form || !form.elements.tipo) return;
  const tipo = gesTipoLanc(form.elements.tipo.value);
  const mostrar = (nome, sim) => { const el = form.elements[nome]; if (el && el.parentElement) el.parentElement.hidden = !sim; };
  mostrar('categoria', tipo === 'gasto');
  mostrar('socio', tipo === 'retirada');
  if (form.elements.descricao) form.elements.descricao.placeholder = gesExemploLanc[tipo];
}
function gesNovoLancamento(tipo) { gesFormLancamento(null, tipo); }
function gesEditarLancamento(id) {
  const l = byId('lancamentos', id);
  if (!l) return toast('Esse lançamento não existe mais.', 'bad');
  if (gesDeConta(l)) return toast('Este lançamento veio de uma conta paga. Para mudar, desfaça o pagamento em Contas a pagar e receber.', 'bad');
  gesFormLancamento(l);
}
function gesExcluirLancamento(id) {
  const l = byId('lancamentos', id);
  if (!l) return;
  if (gesDeConta(l)) return toast('Este lançamento veio de uma conta paga. Para tirar, desfaça o pagamento em Contas a pagar e receber.', 'bad');
  if (!confirmar(`Excluir o lançamento “${l.descricao || 'sem descrição'}” de ${gesBrl(l.valor)}?`)) return;
  rm('lancamentos', id); render(); toast('Lançamento excluído.');
}
/* Abre a tela de contas na aba das pagas, onde o pagamento pode ser desfeito. */
function gesVerEmContas() {
  if (typeof ctaMostrar === 'function') ctaMostrar('pagas');
  else ir('contas');
}
function gesCopiarFixos() {
  const ant = addMeses(gesMes, -1), antNome = nomeMesLongo(ant), info = {};
  const haviaFixos = fixosDoMes(ant).length > 0;
  const n = copiarFixos(gesMes, info);
  const lista = nomes => nomes.map(t => '“' + (t || 'sem descrição') + '”').join(', ');
  if (n) toast(gesPlural(n, 'lançamento fixo copiado', 'lançamentos fixos copiados') + ' de ' + antNome + '.');
  else if (haviaFixos && !info.fora.length) toast('Nada novo para copiar: os gastos fixos de ' + antNome + ' já estão neste mês.');
  else if (!haviaFixos) {
    // nada é do mês anterior; um fixo datado nele só pode ser a cópia de outro mês, paga lá (atrasada ou adiantada)
    const deOutro = S.lancamentos.filter(l => l.fixo && noPeriodo(l.data, ant, ant));
    if (deOutro.length) toast(`Nada copiado: ${antNome} ainda não tem a cópia dos gastos fixos dele. O que aparece lá como “Todo mês” (${lista(deOutro.map(l => l.descricao))}) é de outro mês, pago em ${antNome}. Copie primeiro em ${antNome} e depois volte aqui.`, 'warn');
    else toast('Não há gastos marcados como “Repete todo mês” em ' + antNome + '.');
  }
  // a cópia deste mês existe, mas com a data em outro mês (paga adiantada ou atrasada): não copia de novo e diz onde está
  if (info.fora.length) toast('Não copiado: ' + info.fora.map(f => `“${f.descricao || 'sem descrição'}” (a cópia deste mês está em ${dataBR(f.data)})`).join(', ') + '.', 'warn');
  if (info.iguais.length) toast(`Em ${antNome} havia lançamentos fixos iguais (mesma descrição, dia e valor): ${lista(info.iguais)}. Todos foram copiados; se algum era repetido, exclua a cópia que sobrou.`, 'warn');
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
/* grade: arranjo próprio do painel (nos sócios, nome e parte de cada um ficam lado a lado). */
const gesPaineisConfig = [
  { id: 'impostos', titulo: 'Impostos e margem', campos: [
    { k: 'imposto', type: 'number', label: 'Imposto sobre a venda — Simples Nacional (%)', hint: 'Use a alíquota efetiva do seu Simples. Confirme com o contador.' },
    { k: 'margem', type: 'number', label: 'Margem de lucro desejada (%)', hint: 'Usada no preço sugerido dos canais sem margem própria' },
    { k: 'impostoConfirmado', type: 'check', full: true, label: 'Já confirmei a alíquota com o contador' },
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
    { k: 'maoObraHora', type: 'number', label: 'Valor geral da hora de mão de obra (R$)', hint: 'Usado nas etapas sem pessoa escolhida' },
    { k: 'custosFixos', type: 'number', label: 'Gastos fixos mensais (R$)', hint: 'Aluguel, internet, softwares… rateados por hora impressa' },
    { k: 'horasMes', type: 'number', label: 'Horas de impressão por mês', hint: 'Divide os gastos fixos' },
    { k: 'alertaEstoque', type: 'number', label: 'Avisar quando o filamento chegar em (g)' },
  ] },
  { id: 'metas', titulo: 'Metas do mês', campos: [
    { k: 'metaFat', type: 'number', label: 'Meta de faturamento (R$)' },
    { k: 'metaLucro', type: 'number', label: 'Meta de lucro (R$)' },
  ] },
  { id: 'socios', titulo: 'Sócios', grade: 'grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr));max-width:640px', campos: [
    { k: 'socio1Nome', label: 'Nome do sócio 1' },
    { k: 'socio1Pct', type: 'number', label: 'Parte do sócio 1 no resultado (%)' },
    { k: 'socio2Nome', label: 'Nome do sócio 2' },
    { k: 'socio2Pct', type: 'number', label: 'Parte do sócio 2 no resultado (%)' },
  ] },
];
const gesCamposConfig = gesPaineisConfig.flatMap(p => p.campos);
/* Valor do formulário igual ao salvo? Sim/não compara ligado com desligado, número compara o valor e texto compara o texto. */
const gesIgualCampo = (f, a, b) => (f.type === 'check' ? !!a === !!b : f.type === 'number' ? num(a) === num(b) : String(a ?? '') === String(b ?? ''));
/* Aviso quando as partes dos sócios não somam 100% ('' quando somam). */
const gesTextoSomaSocios = v => { const t = arred(num(v.socio1Pct) + num(v.socio2Pct), 2); return t === 100 ? '' : `As partes somam ${pct(t)}. O certo é somar 100%.`; };

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
  const somaSocios = gesTextoSomaSocios(valores);
  /* data-ges-aviso-imposto e data-ges-soma-socios mudam enquanto a pessoa digita (gesRascunhar) */
  const extras = {
    impostos: `<p class="aviso txt-sm mt" data-ges-aviso-imposto${valores.impostoConfirmado ? ' hidden' : ''}>Confirme a alíquota com o contador: ela entra no preço sugerido e no lucro de cada venda.</p>`,
    falhas: gesTextoFalha(),
    metas: '<p class="hint" style="margin-top:10px">As metas aparecem no Painel, comparadas com as vendas do mês. Deixe 0 para não usar.</p>',
    socios: `<p class="aviso txt-sm mt" data-ges-soma-socios${somaSocios ? '' : ' hidden'}>${esc(somaSocios)}</p>
      <p class="hint" style="margin-top:10px">A parte de cada sócio no resultado do caixa aparece no Financeiro, junto com o que cada um já retirou.</p>`,
  };
  const paineis = gesPaineisConfig.map(p => `<div class="panel"><h2>${esc(p.titulo)}</h2>
      <div class="grid3" style="${p.grade || gesGradeConfig}">${p.campos.map(f => campo(dicas[f.k] ? { ...f, hint: dicas[f.k] } : f, valores[f.k])).join('')}</div>${extras[p.id] || ''}</div>`).join('');
  const oculto = gesRascunho ? '' : ' hidden';
  return head('Configuração', 'Tudo que entra no cálculo de custo e lucro') + `
    <form onsubmit="gesSalvarConfig(event)" oninput="gesRascunhar(this, event)" style="margin-bottom:22px">
      ${paineis}
      ${gesResumoHora()}
      <div class="actions">
        <span class="aviso txt-sm" data-ges-rascunho style="align-self:center"${oculto}>Há alterações que ainda não foram salvas.</span>
        <button type="button" class="btn ghost" data-ges-rascunho onclick="gesDescartarConfig()"${oculto}>Descartar alterações</button>
        <button class="btn">Salvar configuração</button>
      </div>
    </form>
    ${gesPainelPessoas()}
    ${gesPainelCanais()}
    ${typeof shopeePainelConfig === 'function' ? shopeePainelConfig() : ''}`;
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

/* Guarda só os campos em que a pessoa mexeu (e que ficaram diferentes do valor salvo) e mostra o aviso de alterações
   pendentes. Um campo que outro aparelho mudou enquanto esta tela estava aberta não entra: ao salvar, ele não volta
   ao valor velho. Também atualiza, enquanto a pessoa digita, o aviso da alíquota e a soma das partes dos sócios. */
function gesRascunhar(form, ev) {
  const v = lerCampos(form, gesCamposConfig), el = ev && ev.target, f = el && el.name ? gesCamposConfig.find(c => c.k === el.name) : null;
  if (f && f.k in v) {
    const dif = { ...(gesRascunho || {}) };
    if (gesIgualCampo(f, v[f.k], S.config[f.k])) delete dif[f.k]; else dif[f.k] = v[f.k];
    gesRascunho = Object.keys(dif).length ? dif : null;
  }
  $$('[data-ges-rascunho]', form).forEach(el => { el.hidden = !gesRascunho; });
  const imposto = $('[data-ges-aviso-imposto]', form), somaEl = $('[data-ges-soma-socios]', form), txt = gesTextoSomaSocios(v);
  if (imposto) imposto.hidden = !!v.impostoConfirmado;
  if (somaEl) { somaEl.textContent = txt; somaEl.hidden = !txt; }
}
function gesDescartarConfig() { gesRascunho = null; render(); }
/* Salva só o que a pessoa mudou nesta tela (o rascunho); o resto da configuração fica como estiver no banco. */
function gesSalvarConfig(e) {
  e.preventDefault();
  const tela = lerCampos(e.target, gesCamposConfig), mexidos = Object.keys(gesRascunho || {}).filter(k => k in tela);
  if (!mexidos.length) { gesRascunho = null; render(); return toast('Nada mudou na configuração.'); }
  const v = { ...S.config };
  mexidos.forEach(k => { v[k] = tela[k]; });
  if (num(v.imposto) + num(v.margem) >= 100) {
    return toast('Imposto e margem juntos precisam ficar abaixo de 100%. A margem é a parte do preço de venda que fica como lucro.', 'bad');
  }
  const somaSocios = arred(num(v.socio1Pct) + num(v.socio2Pct), 2);
  if (somaSocios > 100 && !confirmar(`As partes dos sócios somam ${pct(somaSocios)}, mais que 100%. Assim a divisão no Financeiro reparte mais do que o resultado.\n\nSalvar mesmo assim?`)) return;
  mexidos.forEach(k => { S.config[k] = tela[k]; });
  gesRascunho = null;
  saveMeta('config'); render(); toast('Configuração salva.');
}

/* ---------- Pessoas da mão de obra ---------- */
/* Produtos que têm a pessoa em alguma etapa da mão de obra. */
const gesProdutosDaPessoa = id => S.produtos.filter(p => linhasMaoObra(p).some(l => l.pessoaId === id));

function gesPainelPessoas() {
  const geral = brl(S.config.maoObraHora);
  const pessoas = [...S.pessoas].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  const linhas = pessoas.map(p => {
    const n = gesProdutosDaPessoa(p.id).length, eu = !DEMO && !!EU.id && p.acesso === EU.id;
    return `<tr>
      <td style="min-width:150px"><b>${esc(p.nome)}</b>${eu ? ' <span class="muted">(você)</span>' : ''}${n ? `<small>em ${gesPlural(n, 'produto', 'produtos')}</small>` : ''}</td>
      <td class="right num">${num(p.valorHora) > 0 ? brl(p.valorHora) : `<span class="muted">valor geral (${geral})</span>`}</td>
      <td><div class="rowbtns">${gesBotao('Editar', 'gesEditarPessoa', p.id)}${gesBotao('Excluir', 'gesExcluirPessoa', p.id, 'danger')}</div></td></tr>`;
  }).join('');
  return `<div class="panel">
      <div class="panel-head"><h2>Pessoas da mão de obra</h2><button type="button" class="btn sm" onclick="gesEditarPessoa()">+ Nova pessoa</button></div>
      ${pessoas.length
        ? tabela(['Pessoa', { t: 'Valor da hora', r: 1 }, ''], linhas)
        : vazio(`Nenhuma pessoa cadastrada. Cadastre quem faz acabamento, montagem ou embalagem, com o valor da hora de cada um. Sem pessoa, vale o valor geral de ${geral} por hora.`,
          '<button type="button" class="btn" onclick="gesEditarPessoa()">+ Nova pessoa</button>')}
      <p class="hint" style="margin-top:12px">No cadastro do produto, cada etapa da mão de obra pode ter a sua pessoa e os seus minutos.</p>
    </div>`;
}
/* Formulário de pessoa (sem id = nova). "É o meu acesso" liga a pessoa ao login de quem está usando o aparelho: o nome dela
   aparece no lugar do e-mail onde o sistema diz quem fez (ex.: "pedido por Ana", em O que comprar). Uma pessoa por acesso. */
function gesEditarPessoa(id) {
  const p = id ? byId('pessoas', id) : null;
  if (id && !p) return toast('Essa pessoa não existe mais.', 'bad');
  const comAcesso = !DEMO && !!EU.id;
  openForm({
    title: p ? 'Editar pessoa' : 'Nova pessoa',
    registro: p ? ['pessoas', p.id] : null,
    fields: [
      { k: 'nome', label: 'Nome', req: true, full: true, ph: 'Ex.: Ana (acabamento)' },
      { k: 'valorHora', label: 'Valor da hora (R$)', type: 'number', hint: `Deixe 0 para usar o valor geral de ${brl(S.config.maoObraHora)} por hora.` },
      ...(comAcesso ? [{ k: 'meuAcesso', label: 'É o meu acesso (esta pessoa sou eu)', type: 'check', full: true, hint: `O nome aparece no lugar de ${String(EU.email || '').split('@')[0]} onde o sistema diz quem fez, como “pedido por”.` }] : []),
    ],
    vals: p ? { ...p, valorHora: num(p.valorHora) > 0 ? p.valorHora : '', meuAcesso: comAcesso && p.acesso === EU.id } : { nome: '', valorHora: '', meuAcesso: false },
    preview(d) {
      const propria = num(d.valorHora) > 0, vh = propria ? num(d.valorHora) : num(S.config.maoObraHora);
      return `<p class="hint">Exemplo: 30 minutos de trabalho custam ${brl(vh / 2)}${propria ? '' : ' (valor geral)'}.</p>`;
    },
    save(d) {
      if (!d.nome) { toast('Informe o nome da pessoa.', 'bad'); return false; }
      const nome = d.nome.toLowerCase();
      if (S.pessoas.some(x => x.id !== (p ? p.id : '') && String(x.nome || '').trim().toLowerCase() === nome)) {
        toast('Já existe uma pessoa com esse nome.', 'bad'); return false;
      }
      const rec = { ...((p && byId('pessoas', p.id)) || p || {}), nome: d.nome, valorHora: arred(d.valorHora, 2), id: p ? p.id : uid() };
      if (comAcesso) { if (d.meuAcesso) rec.acesso = EU.id; else if (rec.acesso === EU.id) delete rec.acesso; }
      put('pessoas', rec);
      if (comAcesso && d.meuAcesso) S.pessoas.filter(x => x.id !== rec.id && x.acesso === EU.id).forEach(x => { const y = { ...x }; delete y.acesso; put('pessoas', y); });
      toast(p ? 'Pessoa atualizada.' : 'Pessoa cadastrada.');
    },
  });
}
function gesExcluirPessoa(id) {
  const p = byId('pessoas', id);
  if (!p) return;
  const n = gesProdutosDaPessoa(id).length;
  let msg = `Excluir “${p.nome}” da lista de pessoas?`;
  if (n) msg += `\n\nEssa pessoa aparece na mão de obra de ${gesPlural(n, 'produto', 'produtos')}. Essas etapas passam a usar o valor geral da hora (${brl(S.config.maoObraHora)}).`;
  if (!confirmar(msg)) return;
  rm('pessoas', id); render(); toast('Pessoa excluída.');
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
      <td class="right num">${pct(margemDoCanal(c))}${num(c.margem) > 0 ? '' : ' <span class="muted">(geral)</span>'}</td>
      <td><div class="rowbtns">${gesBotao('Editar', 'gesEditarCanal', c.id)}${gesBotao('Excluir', 'gesExcluirCanal', c.id, 'danger')}</div></td></tr>`;
  }).join('');
  return `<div class="panel">
      <div class="panel-head"><h2>Canais de venda e taxas</h2><button type="button" class="btn sm" onclick="gesEditarCanal()">+ Novo canal</button></div>
      ${canais.length
        ? tabela(['Canal', { t: 'Comissão (%)', r: 1 }, { t: 'Taxa fixa por unidade', r: 1 }, { t: 'Frete pago por pedido', r: 1 }, { t: 'Margem', r: 1 }, ''], linhas)
        : vazio('Nenhum canal de venda cadastrado. Cadastre onde você vende (Instagram, Shopee, Mercado Livre…) para ver o preço e o lucro em cada um.',
          '<button type="button" class="btn" onclick="gesEditarCanal()">+ Novo canal</button>')}
      <p class="hint" style="margin-top:12px">As taxas dos marketplaces mudam de tempos em tempos. Vale conferir no painel do vendedor de cada um e atualizar aqui.</p>
    </div>`;
}
/* Formulário de canal (sem id = novo). Margem vazia ou 0 usa a margem geral da Configuração. */
function gesEditarCanal(id) {
  const c = id ? byId('canais', id) : null;
  if (id && !c) return toast('Esse canal não existe mais.', 'bad');
  openForm({
    title: c ? 'Editar canal' : 'Novo canal',
    registro: c ? ['canais', c.id] : null,
    fields: [
      { k: 'nome', label: 'Nome do canal', req: true, full: true, ph: 'Ex.: Shopee, Mercado Livre, Feira' },
      { k: 'pct', label: 'Comissão (%)', type: 'number' },
      { k: 'fixa', label: 'Taxa fixa por unidade vendida (R$)', type: 'number' },
      { k: 'frete', label: 'Frete pago pela Nexos por pedido (R$)', type: 'number', hint: '0 se o cliente paga o frete' },
      { k: 'margem', label: 'Margem desejada neste canal (%)', type: 'number', hint: `Vazio ou 0 usa a margem geral de ${pct(S.config.margem)}.` },
      { type: 'html', html: '<p class="hint">Mudanças nas taxas valem para as próximas vendas. As vendas já registradas guardam as taxas do dia em que foram feitas.</p>' },
    ],
    vals: c ? { ...c, margem: num(c.margem) > 0 ? c.margem : '' } : { nome: '', pct: 0, fixa: 0, frete: 0, margem: '' },
    preview(d) {
      const canal = { id: '', pct: d.pct, fixa: d.fixa, frete: d.frete, margem: d.margem };
      const x = precoNoCanal({}, canal, 100, 0), semSugestao = !(precoNoCanal({}, canal, null, 1).sugerido > 0);
      return `<div class="calc"><h4>Exemplo: pedido com uma peça de ${brl(x.preco)}</h4>
        <div><span>Comissão e taxa fixa do canal</span><b>${brl(x.taxa)}</b></div>
        <div><span>Frete pago no pedido</span><b>${brl(x.frete)}</b></div>
        <div><span>Imposto (${pct(S.config.imposto)})</span><b>${brl(x.imposto)}</b></div>
        <div class="tot"><span>Sobra para o custo da peça e o lucro</span><b>${gesBrl(x.lucro)}</b></div></div>
        <p class="hint">Margem usada no preço sugerido deste canal: ${pct(x.margemAlvo)}${num(d.margem) > 0 ? '' : ' (a geral)'}.</p>
        ${semSugestao ? '<p class="aviso txt-sm" style="margin-top:8px">Comissão, imposto e margem somam 100% ou mais: não dá para sugerir preço neste canal.</p>' : ''}`;
    },
    save(d) {
      if (!d.nome) { toast('Dê um nome ao canal.', 'bad'); return false; }
      if (d.pct >= 100) { toast('A comissão precisa ser menor que 100%.', 'bad'); return false; }
      if (d.margem >= 100) { toast('A margem precisa ser menor que 100%.', 'bad'); return false; }
      const nome = d.nome.toLowerCase();
      if (S.canais.some(x => x.id !== (c ? c.id : '') && String(x.nome || '').trim().toLowerCase() === nome)) {
        toast('Já existe um canal com esse nome.', 'bad'); return false;
      }
      put('canais', { ...(c || {}), ...d, margem: arred(d.margem, 2), id: c ? c.id : uid() });
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
