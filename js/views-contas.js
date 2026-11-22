'use strict';
/* Nexos — tela "Contas a pagar e receber": boletos, aluguel e outras contas com vencimento, e o que os clientes
   ainda vão pagar. As regras (pagar, desfazer, conta do mês seguinte, lançamento no Financeiro) ficam em js/calc.js;
   aqui só se monta a tela. Tudo que é global neste arquivo começa com "cta".
   Outros arquivos podem chamar ctaEditar(id, tipo) (sem id = conta nova 'pagar' | 'receber') e ctaMostrar(aba). */

let ctaAba = 'pagar';              // aba aberta: 'pagar' | 'receber' | 'pagas'
const ctaAbas = ['pagar', 'receber', 'pagas'];
let ctaQtdPagas = 50;              // quantas contas pagas e recebidas aparecem (o botão "Mostrar mais" aumenta)

/* ---------- Ajudantes ---------- */
const ctaPorNome = lista => [...(lista || [])].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' }));
/* Botão de linha de tabela: o id viaja em data-id, nunca dentro do código do onclick. cls: 'ghost' | 'danger' | '' (principal) */
const ctaBotao = (rotulo, fn, id, cls = 'ghost') =>
  `<button type="button" class="btn${cls ? ' ' + cls : ''} sm" data-id="${esc(id)}" onclick="${fn}(this.dataset.id)">${rotulo}</button>`;
const ctaDataOk = v => /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(v || ''));
/* Valor da conta: o que foi pago (ou recebido) ou, em aberto, o previsto. */
const ctaValor = c => (c.pagoEm && num(c.valorPago) > 0 ? num(c.valorPago) : num(c.valor));
/* Categorias das contas a pagar: as mesmas dos gastos do Financeiro (js/views-gestao.js). */
const ctaCategorias = () => (typeof gesCategorias !== 'undefined' && Array.isArray(gesCategorias) ? gesCategorias : ['Outros']);
/* Em aberto: a que vence primeiro fica em cima. Pagas: a paga por último fica em cima. */
const ctaPorVencimento = lista => [...lista].sort((a, b) => String(a.vencimento || '9999').localeCompare(String(b.vencimento || '9999')) ||
  String(a.criadoEm || '').localeCompare(String(b.criadoEm || '')));
const ctaPorPagamento = lista => [...lista].sort((a, b) => String(b.pagoEm || '').localeCompare(String(a.pagoEm || '')) ||
  String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));

/* Selo da situação. Para o que se vai receber, "Atrasada" e "Recebida" dizem melhor que "Vencida" e "Paga". */
function ctaSelo(c) {
  const st = situacaoConta(c), receber = c.tipo === 'receber';
  if (st === 'paga') return selo(receber ? 'Recebida' : 'Paga', 'ok');
  if (st === 'vencida') return selo(receber ? 'Atrasada' : 'Vencida', 'bad');
  if (st === 'hoje') return selo('Vence hoje', 'warn');
  return selo('Em aberto');
}
/* De onde veio a conta: { texto: 'Sinal do orçamento nº 3', pg: 'orcamentos' }, ou null quando ela é avulsa. */
function ctaOrigem(c) {
  if (!c.origemId || (c.origem !== 'orcamento' && c.origem !== 'venda')) return null;
  let nome;
  if (c.origem === 'orcamento') {
    const o = byId('orcamentos', c.origemId);
    nome = o ? 'orçamento nº ' + o.numero : 'orçamento excluído';
  } else {
    const v = byId('vendas', c.origemId);
    nome = !v ? 'pedido excluído' : num(v.numero) > 0 ? 'pedido nº ' + v.numero : 'pedido de ' + dataBR(v.data);
  }
  const parte = c.parte === 'sinal' ? 'Sinal do ' : c.parte === 'saldo' ? 'Restante do ' : '';
  return { texto: parte ? parte + nome : nome.charAt(0).toUpperCase() + nome.slice(1), pg: c.origem === 'orcamento' ? 'orcamentos' : 'vendas' };
}
/* Linha pequena embaixo da descrição: categoria, fornecedor ou cliente, se repete e de onde veio. */
function ctaDetalhes(c) {
  const partes = [];
  if (c.tipo === 'receber') {
    const cli = byId('clientes', c.clienteId);
    if (cli) partes.push(esc(cli.nome));
  } else {
    partes.push(esc(c.categoria || 'Outros'));
    const f = byId('fornecedores', c.fornecedorId);
    if (f) partes.push(esc(f.nome));
    if (c.recorrente) partes.push('Repete todo mês');
  }
  const o = ctaOrigem(c);
  if (o) partes.push(`<a href="#${o.pg}">${esc(o.texto)}</a>`);
  return partes.length ? `<small>${partes.join(' · ')}</small>` : '';
}
/* Uma linha da lista: vencimento e situação, descrição com os detalhes, valor e os botões. */
function ctaLinha(c) {
  const paga = !!c.pagoEm, receber = c.tipo === 'receber', valor = ctaValor(c);
  const quando = paga ? `<small>${receber ? 'recebida' : 'paga'} em ${esc(dataBR(c.pagoEm))}</small>` : '';
  const previsto = paga && arred(valor, 2) !== arred(c.valor, 2) ? `<small>previsto ${brl(c.valor)}</small>` : '';
  const botoes = paga
    ? ctaBotao('Desfazer', 'ctaDesfazer', c.id) + ctaBotao('Excluir', 'ctaExcluir', c.id, 'danger')
    : ctaBotao(receber ? 'Receber' : 'Pagar', 'ctaPagar', c.id, '') + ctaBotao('Editar', 'ctaEditar', c.id) + ctaBotao('Excluir', 'ctaExcluir', c.id, 'danger');
  return `<tr>
      <td class="num">${c.vencimento ? esc(dataBR(c.vencimento)) : '—'} ${ctaSelo(c)}${quando}</td>
      <td style="min-width:200px"${c.obs ? ` title="${esc(c.obs)}"` : ''}><b>${esc(c.descricao || 'Conta')}</b>${ctaDetalhes(c)}</td>
      <td class="right num${paga && receber ? ' pos' : ''}">${brl(valor)}${previsto}</td>
      <td><div class="rowbtns">${botoes}</div></td></tr>`;
}

/* ---------- Tela ---------- */
VIEWS.contas = function () {
  const r = resumoContas(), aba = ctaAbas.includes(ctaAba) ? ctaAba : 'pagar';
  const pagar = ctaPorVencimento(contasAbertas('pagar')), receber = ctaPorVencimento(contasAbertas('receber'));
  const pagas = ctaPorPagamento(S.contas.filter(c => c.pagoEm));
  const fimMes = addDias(addMeses(mesAtual(), 1) + '-01', -1);
  const novaPagar = cls => `<button type="button" class="btn${cls}" onclick="ctaEditar('', 'pagar')">+ Conta a pagar</button>`;
  const novaReceber = cls => `<button type="button" class="btn${cls}" onclick="ctaEditar('', 'receber')">+ Conta a receber</button>`;

  const cartoes = `<div class="cards">
      ${kpi('A pagar', brl(r.pagar), r.pagarVencidas > 0 ? `<span class="neg">${brl(r.pagarVencidas)} vencidas</span>` : 'nada vencido')}
      ${kpi('Vence até o fim do mês', brl(r.pagarMes), 'até ' + dataCurta(fimMes) + (r.pagarVencidas > 0 ? ', com as vencidas' : ''))}
      ${kpi('A receber', brl(r.receber), r.receberAtrasado > 0 ? `<span class="aviso">${brl(r.receberAtrasado)} atrasado</span>` : 'nada atrasado')}
      ${kpi('Pago / recebido no mês', brl(r.pagoMes), `pagos · ${brl(r.recebidoMes)} recebidos`)}
    </div>`;

  const abas = `<div class="tabs" role="group" aria-label="Quais contas mostrar" style="max-width:560px">${[
    ['pagar', 'A pagar', pagar.length], ['receber', 'A receber', receber.length], ['pagas', 'Pagas e recebidas', 0],
  ].map(([k, rotulo, n]) => `<button type="button" class="${k === aba ? 'on' : ''}" aria-pressed="${k === aba}" data-cta-aba="${k}" onclick="ctaTrocarAba('${k}')">${rotulo}${n ? ' (' + nf(n) + ')' : ''}</button>`).join('')}</div>`;

  const cols = ['Vencimento', 'Descrição', { t: 'Valor', r: 1 }, ''];
  let titulo, corpo;
  if (aba === 'pagas') {
    const mostra = pagas.slice(0, ctaQtdPagas);
    titulo = 'Pagas e recebidas';
    corpo = pagas.length
      ? tabela(cols, mostra.map(ctaLinha).join('')) + (pagas.length > mostra.length
        ? `<div class="inline" style="margin-top:10px"><span class="hint" style="margin:0">Mostrando as ${nf(mostra.length)} mais recentes de ${nf(pagas.length)} contas pagas e recebidas.</span>
            <button type="button" class="btn ghost sm" onclick="ctaMaisPagas()">Mostrar mais</button></div>` : '')
      : vazio('Nenhuma conta paga ou recebida ainda. Quando você marcar uma conta como paga ou recebida, ela aparece aqui.');
  } else {
    const lista = aba === 'pagar' ? pagar : receber;
    const total = lista.length > 1
      ? `<tr class="total"><td colspan="2">Total em aberto</td><td class="right num">${brl(soma(lista, 'valor'))}</td><td></td></tr>` : '';
    titulo = aba === 'pagar' ? 'Contas a pagar em aberto' : 'Contas a receber em aberto';
    corpo = lista.length ? tabela(cols, lista.map(ctaLinha).join('') + total)
      : aba === 'pagar'
        ? vazio('Nenhuma conta a pagar em aberto. Cadastre aqui boletos, aluguel e outras contas com vencimento, para não esquecer de pagar.', novaPagar(''))
        : vazio('Nenhuma conta a receber em aberto. Aqui ficam os valores que os clientes ainda vão pagar, como o restante de uma encomenda.', novaReceber(''));
  }
  return head('Contas a pagar e receber', 'O que a empresa tem para pagar e o que ainda vai receber', novaPagar('') + novaReceber(' ghost')) +
    cartoes + abas + `<div class="panel"><h2>${titulo}</h2>${corpo}</div>`;
};

function ctaMaisPagas() { ctaQtdPagas += 50; render(); }
function ctaTrocarAba(aba) {
  ctaAba = ctaAbas.includes(aba) ? aba : 'pagar';
  render();
  const b = $(`[data-cta-aba="${ctaAba}"]`);
  if (b) b.focus({ preventScroll: true });
}
/* Abre a tela de contas já na aba pedida (o Financeiro usa para mostrar as contas pagas). */
function ctaMostrar(aba) {
  ctaAba = ctaAbas.includes(aba) ? aba : 'pagar';
  ir('contas');
}

/* ---------- Formulários e ações ---------- */
/* Formulário de conta. Sem id = conta nova do tipo informado ('pagar' | 'receber'). A conta ligada a um orçamento ou
   pedido continua ligada a ele: origem, origemId e parte não mudam ao editar. */
function ctaEditar(id, tipo) {
  const c = id ? byId('contas', id) : null;
  if (id && !c) return toast('Essa conta não existe mais.', 'bad');
  if (c && c.pagoEm) return toast('Esta conta já foi paga. Para mudar, use Desfazer primeiro.', 'bad');
  const t = (c ? c.tipo : tipo) === 'receber' ? 'receber' : 'pagar', pagar = t === 'pagar';
  const vals = c ? { ...c } : { descricao: '', valor: '', vencimento: hoje(), categoria: 'Outros', fornecedorId: '', clienteId: '', recorrente: false, obs: '' };
  if (!vals.categoria) vals.categoria = 'Outros';
  /* categoria antiga fora da lista continua disponível, para não ser trocada sem querer ao editar */
  const cats = ctaCategorias(), categorias = cats.includes(vals.categoria) ? cats : [...cats, vals.categoria];
  const origem = c ? ctaOrigem(c) : null;
  openForm({
    title: c ? (pagar ? 'Editar conta a pagar' : 'Editar conta a receber') : (pagar ? 'Nova conta a pagar' : 'Nova conta a receber'),
    fields: [
      ...(origem ? [{ type: 'html', html: `<p class="hint">Ligada a: ${esc(origem.texto)}.</p>` }] : []),
      { k: 'descricao', label: 'Descrição', req: true, full: true, ph: pagar ? 'Ex.: Aluguel de dezembro' : 'Ex.: Restante da encomenda de chaveiros' },
      { k: 'valor', label: 'Valor (R$)', type: 'number', req: true },
      { k: 'vencimento', label: 'Vencimento', type: 'date', req: true, hint: pagar ? '' : 'Dia em que o cliente combinou de pagar' },
      ...(pagar ? [
        { k: 'categoria', label: 'Categoria', type: 'select', options: categorias.map(x => [x, x]), hint: 'Ao pagar, o gasto entra no Financeiro nesta categoria' },
        { k: 'fornecedorId', label: 'Fornecedor (opcional)', type: 'select', options: [['', '— sem fornecedor —'], ...ctaPorNome(S.fornecedores).map(f => [f.id, f.nome])] },
        { k: 'recorrente', label: 'Repete todo mês', type: 'check', full: true, hint: 'Ao pagar, a conta do mês seguinte já fica criada, no mesmo dia do mês.' },
        { k: 'jaNoCaixa', label: 'Já entra no caixa por outro caminho (compra registrada em Compras ou reposição de insumo)', type: 'check', full: true,
          hint: 'Marque para o pagamento não lançar o gasto de novo no Financeiro: compras de filamento e reposições de insumo já entram sozinhas.' },
      ] : [
        { k: 'clienteId', label: 'Cliente (opcional)', type: 'select', full: true, options: [['', '— sem cliente —'], ...ctaPorNome(S.clientes).map(x => [x.id, x.nome])] },
      ]),
      { k: 'obs', label: 'Observação', type: 'textarea', rows: 2 },
    ],
    vals,
    save(d) {
      const valor = arred(d.valor, 2);
      if (!d.descricao) { toast('Escreva uma descrição.', 'bad'); return false; }
      if (!(valor > 0)) { toast('Informe um valor maior que zero.', 'bad'); return false; }
      if (!ctaDataOk(d.vencimento)) { toast('Confira a data de vencimento.', 'bad'); return false; }
      const campos = { descricao: d.descricao, valor, vencimento: d.vencimento, diaVenc: Number(d.vencimento.slice(8, 10)), obs: d.obs || '' };
      if (pagar) Object.assign(campos, { categoria: d.categoria || 'Outros', fornecedorId: byId('fornecedores', d.fornecedorId) ? d.fornecedorId : '', recorrente: !!d.recorrente, jaNoCaixa: !!d.jaNoCaixa });
      else campos.clienteId = byId('clientes', d.clienteId) ? d.clienteId : '';
      if (!c) {
        criarConta({ tipo: t, ...campos });
        ctaAba = t;                                         // a lista mostra a conta que acabou de entrar
        toast(pagar ? 'Conta a pagar criada.' : 'Conta a receber criada.');
        return;
      }
      const atual = byId('contas', c.id);                   // a versão mais nova: pode ter mudado em outro aparelho
      if (!atual) { toast('Esta conta foi excluída enquanto a janela estava aberta.', 'bad'); return; }
      if (atual.pagoEm) { toast('Esta conta foi paga enquanto a janela estava aberta. Para mudar, use Desfazer primeiro.', 'bad'); return; }
      put('contas', { ...atual, ...campos });
      toast('Conta atualizada.');
    },
  });
}
/* Marca a conta como paga (ou recebida). Data e valor já vêm preenchidos; o valor muda se houve juros ou desconto. */
function ctaPagar(id) {
  const c = byId('contas', id);
  if (!c) return toast('Essa conta não existe mais.', 'bad');
  const receber = c.tipo === 'receber';
  if (c.pagoEm) return toast(receber ? 'Esta conta já foi recebida.' : 'Esta conta já foi paga.');
  const origem = ctaOrigem(c);
  const resumo = `<p><b>${esc(c.descricao || 'Conta')}</b><br><span class="muted">${brl(c.valor)}` +
    `${c.vencimento ? ' · vencimento ' + esc(dataBR(c.vencimento)) : ''}${origem ? ' · ' + esc(origem.texto) : ''}</span></p>`;
  const efeito = !receber
    ? (c.jaNoCaixa ? 'Não lança gasto no Financeiro: esta compra já entrou no caixa por Compras ou Insumos.'
      : `O gasto entra no Financeiro na data do pagamento, na categoria ${esc(c.categoria || 'Outros')}.`) +
      (c.recorrente && !ctaProximaCriada(c) ? ' A conta do mês seguinte já fica criada.' : '')
    : !c.origemId ? 'O valor entra no Financeiro como Outras entradas, na data em que foi recebido.'
      : 'O valor entra no caixa do Financeiro na data em que foi recebido (venda a prazo só conta no caixa quando o dinheiro chega).';
  openForm({
    title: receber ? 'Receber conta' : 'Pagar conta',
    saveLabel: receber ? 'Marcar como recebida' : 'Marcar como paga',
    fields: [
      { type: 'html', html: resumo },
      { k: 'data', label: receber ? 'Data em que recebeu' : 'Data do pagamento', type: 'date', req: true },
      { k: 'valor', label: receber ? 'Valor recebido (R$)' : 'Valor pago (R$)', type: 'number', req: true,
        hint: receber ? 'Se o cliente pagou só uma parte, escreva o que entrou.' : 'Mude se pagou só uma parte, com juros ou com desconto.' },
      { k: 'resto', label: 'Se o valor for menor que o da conta', type: 'select', full: true,
        options: [['aberto', 'O que falta continua em aberto (foi só uma parte)'], ['desconto', 'Foi desconto: não falta nada']] },
      { type: 'html', html: `<p class="hint">${efeito}</p>` },
    ],
    vals: { data: hoje(), valor: c.valor, resto: 'aberto' },
    preview(d) {
      const falta = arred(num(c.valor) - num(d.valor), 2);
      if (!(num(d.valor) > 0) || falta <= 0) return '';
      return `<p class="hint aviso">${d.resto === 'desconto'
        ? `A conta fecha com ${brl(d.valor)}: os ${brl(falta)} de diferença ficam como desconto.`
        : `Os ${brl(falta)} que faltam ficam em ${receber ? 'Contas a receber' : 'Contas a pagar'}, numa conta "(restante)".`}</p>`;
    },
    save(d) {
      const valor = arred(d.valor, 2);
      if (!ctaDataOk(d.data)) { toast('Confira a data.', 'bad'); return false; }
      if (!(valor > 0)) { toast('Informe um valor maior que zero.', 'bad'); return false; }
      const atual = byId('contas', id);
      if (!atual || atual.pagoEm) { toast('Esta conta mudou enquanto a janela estava aberta. Confira a lista.', 'bad'); return; }
      const falta = arred(num(atual.valor) - valor, 2), parcial = falta > 0 && d.resto !== 'desconto';
      const proxima = pagarConta(atual, { data: d.data, valor, parcial });
      const resto = parcial ? ` Os ${brl(falta)} que faltam continuam em aberto.` : '';
      if (atual.tipo !== 'receber') {
        toast((atual.jaNoCaixa ? 'Conta paga.' : 'Conta paga. O gasto entrou no Financeiro.') + resto +
          (proxima ? ` A de ${nomeMesLongo(String(proxima.vencimento).slice(0, 7))} já foi criada.` : ''));
      } else toast((atual.origemId ? 'Recebido. O valor entrou no caixa do Financeiro.' : 'Recebido. A entrada foi para o Financeiro.') + resto);
    },
  });
}
/* A conta do mês seguinte (de uma conta a pagar que repete) já existe? Mesma conferência de pagarConta, em calc.js. */
function ctaProximaCriada(c) {
  if (c.tipo !== 'pagar' || !c.recorrente) return false;
  const mes = addMesesData(c.vencimento || c.pagoEm || hoje(), 1).slice(0, 7);
  return !!byId('contas', ((c.serie || c.id) + '-' + mes.replace('-', '')).slice(0, 64)) ||
    S.contas.some(x => x.id !== c.id && x.tipo === 'pagar' && x.recorrente && x.descricao === c.descricao && String(x.vencimento || '').slice(0, 7) === mes);
}
/* Volta a conta para "em aberto"; o lançamento que o pagamento criou no Financeiro sai junto. */
function ctaDesfazer(id) {
  const c = byId('contas', id);
  if (!c || !c.pagoEm) return;
  const receber = c.tipo === 'receber', temLanc = lancamentosDaConta(c).length > 0;
  let msg = `Desfazer o ${receber ? 'recebimento' : 'pagamento'} de “${c.descricao || 'Conta'}” (${brl(ctaValor(c))})?\n\nA conta volta para ${receber ? 'A receber' : 'A pagar'}.`;
  if (temLanc) msg += receber ? ' A entrada sai do Financeiro.' : ' O gasto sai do Financeiro.';
  else if (contaDeVenda(c)) msg += ' O valor sai do caixa do Financeiro.';
  if (ctaProximaCriada(c)) msg += '\n\nA conta do mês seguinte, que já foi criada, continua na lista.';
  if (!confirmar(msg)) return;
  desfazerPagamento(c);
  render();
  toast(receber ? 'Recebimento desfeito. A conta voltou para A receber.' : 'Pagamento desfeito. A conta voltou para A pagar.');
}
function ctaExcluir(id) {
  const c = byId('contas', id);
  if (!c) return;
  let msg = `Excluir a conta “${c.descricao || 'Conta'}” (${brl(ctaValor(c))})?`;
  if (c.pagoEm && lancamentosDaConta(c).length) msg += `\n\nEla já foi ${c.tipo === 'receber' ? 'recebida' : 'paga'}: o lançamento dela no Financeiro sai junto.`;
  else if (c.pagoEm && contaDeVenda(c)) msg += '\n\nEla já foi recebida: o valor dela sai do caixa do Financeiro.';
  if (ctaOrigem(c)) msg += '\n\nO orçamento ou pedido ligado a ela continua como está.';
  if (!confirmar(msg)) return;
  excluirConta(c);
  render();
  toast('Conta excluída.');
}
