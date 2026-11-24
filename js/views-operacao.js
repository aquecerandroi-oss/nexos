'use strict';
/* Nexos — telas de Operação: Painel, Produção, Falhas e Manutenção.
   Tudo que é global neste arquivo começa com "op". Outros arquivos podem chamar
   opNovaOrdem(produtoId, clienteId, qtd) e opNovaFalha(produtoId, filamentoId).
   As contas ficam em calc.js; aqui só se monta a tela e se chama a regra certa. */

/* ---------- Ajudantes desta área ---------- */
/* opPl(3, 'peça', 'peças') devolve "3 peças". */
const opPl = (n, um, varios) => nf(n) + ' ' + (Math.round(num(n)) === 1 ? um : varios);
/* Botão pequeno de linha. O id vai em data-id e é lido com this.dataset: nunca entra no código do onclick.
   dica: texto que aparece ao parar o mouse em cima. */
const opBtn = (rotulo, fn, id, cls = 'ghost', dica = '') =>
  `<button type="button" class="btn ${cls} sm" data-id="${esc(id)}"${dica ? ` title="${esc(dica)}"` : ''} onclick="${fn}(this.dataset.id)">${rotulo}</button>`;
const opBtnNovaOrdem = '<button type="button" class="btn" onclick="opNovaOrdem()">+ Nova ordem</button>';
const opCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/* Mais recentes primeiro pelo campo de data; no empate, o que foi lançado por último. */
const opRecentes = (lista, campoData = 'data') => (lista || []).slice().sort((a, b) =>
  opCmp(String(b[campoData] || ''), String(a[campoData] || '')) || opCmp(String(b.criadoEm || ''), String(a.criadoEm || '')));
const opPorNome = lista => (lista || []).slice().sort((a, b) =>
  String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' }));
const opProduto = id => nomeDe('produtos', id, 'Produto excluído');                   // HTML, já com esc()
const opProdutoTxt = id => (byId('produtos', id) || {}).nome || 'Produto excluído';   // texto puro, para toast e confirmar
const opOrdemTxt = o => num(o.qtd) + '× ' + opProdutoTxt(o.produtoId);
/* Redesenha a tela mantendo a rolagem lateral das tabelas (no celular os botões ficam no fim da linha). */
function opRender() {
  const pos = [];
  $$('#main .panel[id] .scroll').forEach(s => { if (s.scrollLeft) pos.push([s.closest('.panel').id, s.scrollLeft]); });
  render();
  pos.forEach(([id, x]) => { const p = document.getElementById(id), s = p && $('.scroll', p); if (s) s.scrollLeft = x; });
}
const opSituacao = o => (o.status === 'imprimindo' ? selo('Imprimindo', 'info') : selo('Na fila'));
/* Prazo de uma ordem da fila com o selo do que preocupa. x é um item de filaProducao(). */
function opPrazo(x) {
  if (!x.o.prazo) return '<span class="muted">—</span>';
  const s = x.prazo === 'atrasada' ? selo('Atrasada', 'bad')
    : x.prazo === 'hoje' ? selo('Vence hoje', 'warn')
      : x.estouraPrazo ? selo('Passa do prazo', 'warn') : '';
  return `<span class="nowrap">${esc(dataBR(x.o.prazo))}</span>${s ? ' ' + s : ''}`;
}
/* Coluna de nome nas tabelas: no celular a tabela rola de lado, e o nome não fica espremido palavra por palavra. */
const opColNome = ' style="min-width:160px"';
const opVazioFila = () => (S.produtos.length
  ? vazio('Nenhuma ordem na fila. Crie uma ordem para a impressora começar a trabalhar.', opBtnNovaOrdem)
  : vazio('Para criar ordens de produção, cadastre primeiro um produto.', '<a class="btn" href="#produtos">Cadastrar produto</a>'));
/* Produtos abaixo do estoque mínimo (lista de sugestoesProducao): "Produzir N× Produto" e o botão que já abre a ordem
   com a quantidade. max: quantos mostrar (os outros viram uma linha "E mais…"). */
function opListaSugestoes(lista, max) {
  const mostrar = max ? lista.slice(0, max) : lista, resto = lista.length - mostrar.length;
  const itens = mostrar.map(s => `<li>
      <div style="flex:1;min-width:0"><b>Produzir ${nf(s.falta)}× ${esc(s.p.nome)}</b>
        <div class="muted txt-sm">tem ${nf(s.estoque)}, mínimo ${nf(s.minimo)}, ${nf(s.emProducao)} em produção</div></div>
      <button type="button" class="btn ghost sm" data-id="${esc(s.p.id)}" data-qtd="${esc(s.falta)}" onclick="opCriarSugerida(this.dataset.id, this.dataset.qtd)">Criar ordem</button></li>`).join('');
  return `<ul class="lista">${itens}</ul>${resto > 0 ? `<p class="muted txt-sm mt">E mais ${opPl(resto, 'produto', 'produtos')} abaixo do mínimo.</p>` : ''}`;
}
function opCriarSugerida(id, qtd) { opNovaOrdem(id, '', num(qtd)); }

/* ---------- Tela: Painel ---------- */
/* Painel dentro de .cols: sem isto a tabela não rola de lado no celular e empurra a tela inteira. */
const opNaGrade = ' style="min-width:0"';
const opPassos = [
  ['config', 'Ajustar os custos', 'Energia, impressora, mão de obra, imposto e margem de lucro.'],
  ['filamentos', 'Cadastrar os filamentos', 'Preço por quilo e quanto você tem em estoque.'],
  ['produtos', 'Cadastrar os produtos', 'Peso, tempo de impressão e preço em cada canal de venda.'],
  ['producao', 'Criar as ordens de produção', 'Monte a fila da impressora e veja a previsão de término.'],
  ['vendas', 'Registrar as vendas', 'O estoque baixa sozinho e o lucro aparece aqui no Painel.'],
];
function opPainelPassos() {
  return `<div class="panel"><h2>Primeiros passos</h2>
    <ol class="lista">${opPassos.map(([pg, titulo, txt], i) => `<li><span class="selo s-info" style="min-width:26px;text-align:center">${i + 1}</span>
      <div><a href="#${pg}" style="text-decoration:underline"><b>${titulo}</b></a><div class="muted txt-sm">${txt}</div></div></li>`).join('')}</ol></div>`;
}
function opMeta(rotulo, atual, meta) {
  const p = atual / meta * 100;
  const resto = p >= 100 ? 'Meta batida' : `${pct(Math.max(0, p))} da meta · faltam ${brl(meta - atual)}`;
  return `<div class="meta"><div class="meta-top"><span>${rotulo}</span><span class="right" style="font-variant-numeric:tabular-nums">${brl(atual)} de ${brl(meta)}</span></div>
    ${medidor(p, p >= 100 ? 'ok' : '')}<div class="muted txt-sm" style="margin-top:5px">${resto}</div></div>`;
}
function opPainelMetas(rv) {
  const mf = num(S.config.metaFat), ml = num(S.config.metaLucro);
  const corpo = mf > 0 || ml > 0
    ? (mf > 0 ? opMeta('Faturamento', rv.bruto, mf) : '') + (ml > 0 ? opMeta('Lucro', rv.lucro, ml) : '')
    : '<p class="muted">Nenhuma meta definida. Escolha a meta de faturamento e a de lucro na <a href="#config">Configuração</a>.</p>';
  return `<div class="panel"${opNaGrade}><h2>Metas do mês</h2>${corpo}</div>`;
}
function opPainelAlertas() {
  const avisos = alertas().slice().sort((a, b) => (a.tipo === 'bad' ? 0 : 1) - (b.tipo === 'bad' ? 0 : 1));
  const corpo = avisos.length
    ? `<ul class="lista">${avisos.map(a => `<li>${a.tipo === 'bad' ? selo('Urgente', 'bad') : selo('Atenção', 'warn')}<a href="#${esc(a.pg)}">${esc(a.texto)}</a></li>`).join('')}</ul>`
    : vazio('Tudo em dia.');
  return `<div class="panel"${opNaGrade}><h2>Precisa de atenção${avisos.length ? ` <small>${nf(avisos.length)}</small>` : ''}</h2>${corpo}</div>`;
}
function opPainelFila(fila) {
  const itens = fila.slice(0, 5).map(x => `<li>
      <div style="flex:1;min-width:0"><b>${nf(x.o.qtd)}× ${opProduto(x.o.produtoId)}</b>
        <div class="muted txt-sm">${x.o.status === 'imprimindo' ? 'Termina' : 'Previsão de término'}: ${dataHora(x.fim)}</div>
        ${x.o.prazo ? `<div class="txt-sm">Prazo: ${opPrazo(x)}</div>` : ''}</div>
      ${opSituacao(x.o)}</li>`).join('');
  const corpo = fila.length
    ? `<ul class="lista">${itens}</ul>${fila.length > 5 ? `<p class="muted txt-sm mt">E mais ${opPl(fila.length - 5, 'ordem', 'ordens')} na fila.</p>` : ''}`
    : opVazioFila();
  /* ordens que já saíram da impressora e esperam o acabamento */
  const acab = ordensEmAcabamento();
  const emAcab = acab.length
    ? `<p class="txt-sm mt">${selo('Em acabamento', 'info')} <a href="#producao">${opPl(acab.length, 'ordem', 'ordens')}</a> · ${opPl(soma(acab, 'qtd'), 'peça esperando', 'peças esperando')} para entrar no estoque</p>` : '';
  return `<div class="panel"${opNaGrade}><div class="panel-head"><h2>Fila da impressora</h2><a class="btn ghost sm" href="#producao">Ver produção</a></div>${corpo}${emAcab}</div>`;
}
/* Últimos pedidos: número, data, o que foi vendido, canal, total e lucro (já sem as devoluções). */
function opPainelVendas() {
  const ultimas = opRecentes(S.vendas).slice(0, 5);
  const linhas = ultimas.map(v => {
    const dev = num(v.devolvido);
    return `<tr>
      <td class="num">${v.numero ? esc(v.numero) : '—'}</td>
      <td class="num">${esc(dataBR(v.data))}</td>
      <td style="min-width:140px">${esc(resumoItensVenda(v))}<small>${opPl(v.qtd, 'peça', 'peças')}${dev > 0 ? ' · ' + opPl(dev, 'devolvida', 'devolvidas') : ''}</small></td>
      <td>${esc((byId('canais', v.canalId) || {}).nome || v.canalNome || 'Sem canal')}</td>
      <td class="right num">${brl(v.bruto)}</td>
      <td class="right num ${num(v.lucro) < 0 ? 'neg' : 'pos'}">${brl(v.lucro)}</td></tr>`;
  }).join('');
  const corpo = ultimas.length
    ? tabela(['Nº', 'Data', 'Pedido', 'Canal', { t: 'Total', r: 1 }, { t: 'Lucro', r: 1 }], linhas)
    : vazio('Nenhuma venda registrada ainda.', '<button type="button" class="btn" onclick="opAbrirVenda()">Registrar venda</button>');
  return `<div class="panel"${opNaGrade}><div class="panel-head"><h2>Últimas vendas</h2><a class="btn ghost sm" href="#vendas">Ver vendas</a></div>${corpo}</div>`;
}
function opPainelSugestoes(sug) {
  return `<div class="panel"${opNaGrade}><div class="panel-head"><h2>Sugestões de produção</h2><a class="btn ghost sm" href="#producao">Ver produção</a></div>${opListaSugestoes(sug, 5)}</div>`;
}
/* Contas a pagar vencidas ou que vencem nos próximos 7 dias e contas a receber atrasadas. Sem nenhuma, não aparece. */
function opPainelContas() {
  const lim = addDias(hoje(), 7);
  const entra = c => {
    if (c.pagoEm) return false;
    const st = situacaoConta(c);
    if (c.tipo === 'pagar') return st === 'vencida' || st === 'hoje' || (st === 'aberta' && !!c.vencimento && c.vencimento <= lim);
    return c.tipo === 'receber' && st === 'vencida';
  };
  const lista = (S.contas || []).filter(entra).sort((a, b) => opCmp(String(a.vencimento || ''), String(b.vencimento || '')));
  if (!lista.length) return '';
  const pagar = soma(lista.filter(c => c.tipo === 'pagar'), 'valor'), receber = soma(lista.filter(c => c.tipo === 'receber'), 'valor');
  const resumo = [pagar > 0 ? 'A pagar: ' + brl(pagar) : '', receber > 0 ? 'A receber atrasado: ' + brl(receber) : ''].filter(Boolean).join(' · ');
  const itens = lista.slice(0, 8).map(c => {
    const st = situacaoConta(c), aPagar = c.tipo === 'pagar', venc = dataBR(c.vencimento);
    const marca = !aPagar ? selo('Atrasada', 'warn') : st === 'vencida' ? selo('Vencida', 'bad') : st === 'hoje' ? selo('Vence hoje', 'warn') : selo('Esta semana');
    const quando = !aPagar ? 'A receber · desde ' + venc : st === 'vencida' ? 'A pagar · venceu ' + venc : st === 'hoje' ? 'A pagar' : 'A pagar · vence ' + venc;
    const cliente = !aPagar && c.clienteId ? nomeDe('clientes', c.clienteId, '') : '';
    return `<li>${marca}<div style="flex:1;min-width:0"><a href="#contas">${esc(c.descricao || 'Conta')}</a>
      <div class="muted txt-sm">${esc(quando)}${cliente ? ' · ' + cliente : ''}</div></div><b class="num${aPagar ? '' : ' pos'}">${brl(c.valor)}</b></li>`;
  }).join('');
  const mais = lista.length > 8 ? `<p class="muted txt-sm mt">E mais ${opPl(lista.length - 8, 'conta', 'contas')}.</p>` : '';
  return `<div class="panel"${opNaGrade}><div class="panel-head"><h2>Contas da semana</h2><a class="btn ghost sm" href="#contas">Ver contas</a></div>
    ${resumo ? `<p class="muted txt-sm">${resumo}</p>` : ''}<ul class="lista">${itens}</ul>${mais}</div>`;
}
/* O formulário de venda mora em views-comercial.js; se ele não estiver carregado, só abre a tela. */
function opAbrirVenda() {
  if (typeof comNovaVenda === 'function') comNovaVenda(); else ir('vendas');
}
VIEWS.painel = function () {
  const mes = mesAtual(), rv = resumoVendas(vendasDoMes(mes)), fila = filaProducao();
  const prontas = soma(S.produtos, p => Math.max(0, num(p.estoque))), comEstoque = S.produtos.filter(p => num(p.estoque) > 0).length;
  /* painéis que só aparecem quando há o que mostrar */
  const sug = sugestoesProducao(), extras = (sug.length ? opPainelSugestoes(sug) : '') + opPainelContas();
  return head('Painel', 'Resumo de ' + nomeMesLongo(mes)) +
    (!S.filamentos.length && !S.produtos.length ? opPainelPassos() : '') +
    `<div class="cards">
      ${kpi('Faturamento do mês', brl(rv.bruto), opPl(rv.qtd, 'peça vendida', 'peças vendidas'))}
      ${kpi('Lucro do mês', brl(rv.lucro), 'margem ' + pct(rv.margem), rv.lucro > 0 ? 'pos' : rv.lucro < 0 ? 'neg' : '')}
      ${kpi('Na impressora e na fila', opPl(soma(fila, x => x.o.qtd), 'peça', 'peças'), fila.length ? 'termina ' + dataHora(Math.max(...fila.map(x => x.fim))) : 'fila vazia')}
      ${kpi('Peças prontas', nf(prontas), opPl(comEstoque, 'produto com estoque', 'produtos com estoque'), prontas < 0 ? 'neg' : '')}
    </div>
    <div class="cols">${opPainelMetas(rv)}${opPainelAlertas()}</div>
    <div class="cols">${opPainelFila(fila)}${opPainelVendas()}</div>` +
    (extras ? `<div class="cols">${extras}</div>` : '');
};

/* ---------- Tela: Produção ---------- */
const opSeta = (o, dir, pode) => {
  const txt = (dir < 0 ? 'Subir' : 'Descer') + ' na fila';
  return `<button type="button" class="btn ghost sm" data-id="${esc(o.id)}" data-mover="${dir}" onclick="opMover(this.dataset.id, ${dir})" title="${txt}" aria-label="${txt}"${pode ? '' : ' disabled'}>${dir < 0 ? '↑' : '↓'}</button>`;
};
/* destaque: só a próxima ação esperada fica em vermelho (Concluir, ou Iniciar na primeira da fila com a impressora livre). */
function opLinhaFila(x, naFila, destaque) {
  const o = x.o, cliente = byId('clientes', o.clienteId);
  const sub = [cliente ? esc(cliente.nome) : '', esc(o.obs)].filter(Boolean).join(' · ');
  const editarExcluir = opBtn('Editar', 'opEditarOrdem', o.id) + opBtn('Excluir', 'opExcluirOrdem', o.id, 'danger');
  let acoes;
  if (o.status === 'imprimindo') {
    /* produto com acabamento: ao terminar a impressão a ordem vai para "Em acabamento", não para o estoque */
    const concluir = x.p && x.p.acabamento
      ? opBtn('Terminou a impressão', 'opConcluir', o.id, '', 'A ordem vai para Em acabamento')
      : opBtn('Concluir', 'opConcluir', o.id, '');
    acoes = `<div class="stack" style="gap:6px"><div class="rowbtns">${concluir}${opBtn('Falhou', 'opFalhou', o.id)}${opBtn('Voltar para a fila', 'opVoltarFila', o.id)}</div><div class="rowbtns">${editarExcluir}</div></div>`;
  } else {
    const i = naFila.indexOf(x);
    acoes = `<div class="rowbtns">${opBtn('Iniciar', 'opIniciar', o.id, destaque ? '' : 'ghost')}${opSeta(o, -1, i > 0)}${opSeta(o, 1, i >= 0 && i < naFila.length - 1)}${editarExcluir}</div>`;
  }
  return `<tr>
    <td${opColNome}><b>${opProduto(o.produtoId)}</b>${sub ? `<small>${sub}</small>` : ''}</td>
    <td class="right num">${nf(o.qtd)}</td>
    <td class="right num">${x.p ? horasFmt(x.horas) : '—'}</td>
    <td>${opSituacao(o)}</td>
    <td class="num">${dataHora(x.fim)}</td>
    <td>${opPrazo(x)}</td>
    <td>${acoes}</td></tr>`;
}
function opLinhaFeita(o) {
  /* quem passou pelo acabamento volta para "Em acabamento" ao reabrir; as outras voltam para a fila */
  const sub = [o.passouAcabamento ? 'Passou pelo acabamento' : '', esc(o.obs)].filter(Boolean).join(' · ');
  const reabrir = opBtn('Reabrir', 'opReabrir', o.id, 'ghost', o.passouAcabamento ? 'Volta para Em acabamento' : 'Volta para a fila');
  return `<tr>
    <td class="num">${esc(dataBR(o.fim))}</td>
    <td${opColNome}><b>${opProduto(o.produtoId)}</b>${sub ? `<small>${sub}</small>` : ''}</td>
    <td class="right num">${nf(o.qtd)}</td>
    <td class="right num">${gramas(soma(o.consumo, 'g'))}</td>
    <td class="right num">${brl(num(o.custoUnit) * num(o.qtd))}</td>
    <td>${nomeDe('clientes', o.clienteId)}</td>
    <td><div class="rowbtns">${reabrir}${opBtn('Editar', 'opEditarOrdem', o.id)}${opBtn('Excluir', 'opExcluirOrdem', o.id, 'danger')}</div></td></tr>`;
}
/* Ordem já impressa esperando o acabamento. destaque: a mais antiga, que deve ficar pronta primeiro. */
function opLinhaAcabamento(o, destaque) {
  const p = byId('produtos', o.produtoId), cliente = byId('clientes', o.clienteId);
  const sub = [p && p.etapasAcabamento ? esc(p.etapasAcabamento) : '', cliente ? esc(cliente.nome) : '', esc(o.obs)].filter(Boolean).join(' · ');
  return `<tr>
    <td${opColNome}><b>${opProduto(o.produtoId)}</b>${sub ? `<small>${sub}</small>` : ''}</td>
    <td class="right num">${nf(o.qtd)}</td>
    <td class="num">${esc(dataBR(o.fimImpressao)) || '—'}</td>
    <td>${opPrazo({ o, prazo: statusPrazo(o), estouraPrazo: false })}</td>
    <td><div class="stack" style="gap:6px"><div class="rowbtns">${opBtn('Acabamento pronto', 'opAcabamentoPronto', o.id, destaque ? '' : 'ghost', 'As peças entram no estoque de prontas')}${opBtn('Peças estragaram', 'opRefazer', o.id, 'ghost', 'O filamento usado vai para Falhas e a ordem volta para a fila')}</div>
      <div class="rowbtns">${opBtn('Voltar para a fila', 'opVoltarFila', o.id, 'ghost', 'Só para quem marcou "Terminou a impressão" por engano: o material volta para o estoque')}${opBtn('Editar', 'opEditarOrdem', o.id)}${opBtn('Excluir', 'opExcluirOrdem', o.id, 'danger')}</div></div></td></tr>`;
}
VIEWS.producao = function () {
  const fila = filaProducao(), naFila = fila.filter(x => x.o.status === 'fila');
  const acab = ordensEmAcabamento(), sug = sugestoesProducao();
  const feitas = opRecentes(S.ordens.filter(o => o.status === 'concluido'), 'fim');
  const resumo = fila.length ? `${opPl(fila.length, 'ordem', 'ordens')} · termina ${dataHora(Math.max(...fila.map(x => x.fim)))}` : '';
  const proxima = fila.length && fila[0].o.status === 'fila' ? fila[0] : null;   // nada imprimindo: a primeira da fila é a próxima
  /* o painel de acabamento aparece quando há ordens nele ou algum produto passa por acabamento */
  const comAcabamento = acab.length > 0 || S.produtos.some(p => p.acabamento);
  return head('Produção', 'A previsão considera a impressora rodando sem parar, uma ordem por vez.', opBtnNovaOrdem) +
    (sug.length ? `<div class="panel" id="op-sug"><h2>Sugestões de produção <small>${opPl(sug.length, 'produto abaixo', 'produtos abaixo')} do estoque mínimo</small></h2>${opListaSugestoes(sug)}</div>` : '') +
    `<div class="panel" id="op-fila"><h2>Fila da impressora${resumo ? ` <small>${resumo}</small>` : ''}</h2>${fila.length
      ? tabela(['Produto', { t: 'Qtd', r: 1 }, { t: 'Tempo', r: 1 }, 'Situação', 'Previsão de término', 'Prazo', ''], fila.map(x => opLinhaFila(x, naFila, x === proxima)).join(''))
      : opVazioFila()}</div>` +
    (comAcabamento ? `<div class="panel" id="op-acab"><h2>Em acabamento${acab.length ? ` <small>${opPl(soma(acab, 'qtd'), 'peça esperando', 'peças esperando')} para entrar no estoque</small>` : ''}</h2>${acab.length
      ? tabela(['Produto', { t: 'Qtd', r: 1 }, 'Impressa em', 'Prazo', ''], acab.map((o, i) => opLinhaAcabamento(o, i === 0)).join(''))
      : vazio('Nenhuma ordem em acabamento. Quando a impressão de um produto com acabamento termina, a ordem fica aqui até o acabamento ficar pronto.')}</div>` : '') +
    `<div class="panel" id="op-feitas"><h2>Concluídas${feitas.length > 30 ? ` <small>as 30 mais recentes de ${nf(feitas.length)}</small>` : ''}</h2>${feitas.length
      ? tabela(['Data', 'Produto', { t: 'Qtd', r: 1 }, { t: 'Filamento usado', r: 1 }, { t: 'Custo', r: 1 }, 'Cliente', ''], feitas.slice(0, 30).map(o => opLinhaFeita(o)).join(''))
      : vazio('Nenhuma ordem concluída ainda. Quando a impressão terminar, clique em Concluir para as peças entrarem no estoque.')}</div>`;
};

/* Ações da fila */
function opIniciar(id) {
  const o = byId('ordens', id);
  if (!o || o.status !== 'fila') return render();
  const outra = S.ordens.find(x => x.status === 'imprimindo' && x.id !== o.id);
  if (outra && !confirmar(`Já existe uma ordem imprimindo (${opOrdemTxt(outra)}).\n\nIniciar esta também?`)) return;
  iniciarOrdem(o);
  opRender();
  toast('Impressão iniciada: ' + opOrdemTxt(o) + '.');
}
/* Fim da impressão. Produto com acabamento: a ordem vai para "Em acabamento"; os outros: as peças entram no estoque. */
function opConcluir(id) {
  const o = byId('ordens', id);
  if (!o || !ORDEM_ATIVA(o)) return render();      // já impressa (em outro aparelho, por exemplo): só redesenha
  const temProduto = !!byId('produtos', o.produtoId);
  concluirOrdem(o);
  opRender();
  if (!temProduto) return toast('Ordem concluída. O produto foi excluído, por isso o estoque não mudou.');
  const usado = gramas(soma(o.consumo, 'g'));
  if (o.status === 'acabamento') return toast(`Impressão terminada: a ordem foi para Em acabamento. Filamento usado: ${usado}.`);
  toast(`${opPl(o.qtd, 'peça entrou', 'peças entraram')} no estoque de prontas. Filamento usado: ${usado}.`);
}
/* Acabamento terminado: as peças entram no estoque de prontas (o material já tinha saído no fim da impressão). */
function opAcabamentoPronto(id) {
  const o = byId('ordens', id);
  if (!o || o.status !== 'acabamento') return render();
  const temProduto = !!byId('produtos', o.produtoId);
  concluirOrdem(o);
  opRender();
  if (!temProduto) return toast('Acabamento pronto. O produto foi excluído, por isso o estoque não mudou.');
  toast(`Acabamento pronto: ${opPl(o.qtd, 'peça entrou', 'peças entraram')} no estoque de prontas.`);
}
/* Peças que estragaram no acabamento (na pintura, na colagem…): o filamento gasto entra em Falhas, as horas de máquina
   continuam contando e a ordem volta para a fila para imprimir de novo. */
function opRefazer(id) {
  const o = byId('ordens', id);
  if (!o || o.status !== 'acabamento') return render();
  const g = soma(o.consumo, 'g');
  if (!confirmar(`As peças de ${opOrdemTxt(o)} estragaram no acabamento?\n\nO filamento usado (${gramas(g)}) continua gasto e entra em Falhas; as horas de impressão continuam no horímetro. A embalagem e os outros insumos voltam para o estoque.\n\nA ordem volta para a fila para imprimir de novo.`)) return;
  refazerOrdem(o);
  opRender();
  toast(`Registrado: ${gramas(g)} de filamento foram para Falhas e a ordem voltou para a fila.`);
}
/* Abre o registro de falha já com o produto e o primeiro filamento dele; a ordem continua como está. */
function opFalhou(id) {
  const o = byId('ordens', id);
  if (!o) return render();
  const p = byId('produtos', o.produtoId), m = p && (p.materiais || [])[0];
  opNovaFalha(o.produtoId, m ? m.filamentoId : '');
}
/* Imprimindo: volta para a fila na hora. Em acabamento: pergunta antes, porque o material volta para o estoque
   e a ordem precisa ser impressa de novo. */
function opVoltarFila(id) {
  const o = byId('ordens', id);
  if (!o || (o.status !== 'imprimindo' && o.status !== 'acabamento')) return render();
  if (o.status === 'acabamento') {
    if (!confirmar(`Voltar a ordem de ${opOrdemTxt(o)} para a fila?\n\nUse só se marcou "Terminou a impressão" por engano. Se as peças estragaram, use "Peças estragaram".\n\n${opAvisoDesfazer(o)}\n\nA ordem vai precisar ser impressa de novo.`)) return;
    reabrirOrdem(o, 'fila');
    opRender();
    return toast('A ordem voltou para a fila e o material voltou para o estoque.');
  }
  reabrirOrdem(o, 'fila');
  opRender();
  toast('A ordem voltou para a fila.');
}
function opMover(id, dir) {
  const o = byId('ordens', id);
  if (o) moverOrdem(o, dir < 0 ? -1 : 1);
  opRender();
  /* devolve o foco à seta da mesma ordem, para dar para continuar movendo pelo teclado */
  const botoes = $$('#main button[data-mover]').filter(b => b.dataset.id === id && !b.disabled);
  const alvo = botoes.find(b => Number(b.dataset.mover) === dir) || botoes[0];
  if (alvo) alvo.focus();
}
/* Aviso de estoque negativo quando as peças da ordem saem do estoque de prontas. */
function opAvisoNegativo(o) {
  const p = byId('produtos', o.produtoId), q = num(o.qtd);
  return p && num(p.estoque) < q ? `\n\nAtenção: hoje há ${opPl(p.estoque, 'peça pronta', 'peças prontas')} deste produto, então o estoque vai ficar negativo.` : '';
}
/* Aviso comum a reabrir e a excluir uma ordem já impressa (concluída ou em acabamento). */
function opAvisoDesfazer(o) {
  if (o.status === 'acabamento') return 'O material usado volta para o estoque. As peças ainda não tinham entrado no estoque de prontas.';
  const q = num(o.qtd);
  return `O material usado volta para o estoque e ${q === 1 ? 'a peça sai' : 'as ' + nf(q) + ' peças saem'} do estoque de prontas.` + opAvisoNegativo(o);
}
function opReabrir(id) {
  const o = byId('ordens', id);
  if (!o || o.status !== 'concluido') return render();
  if (o.passouAcabamento) {
    /* volta para o acabamento: as peças saem do estoque de prontas e o material continua usado */
    const q = num(o.qtd);
    const t = `${q === 1 ? 'A peça sai' : 'As ' + nf(q) + ' peças saem'} do estoque de prontas. O material continua usado.` + opAvisoNegativo(o);
    if (!confirmar(`Reabrir a ordem de ${opOrdemTxt(o)}?\n\n${t}\n\nA ordem volta para Em acabamento.`)) return;
    reabrirOrdem(o, 'acabamento');
    opRender();
    return toast('Ordem reaberta. Ela voltou para Em acabamento.');
  }
  if (!confirmar(`Reabrir a ordem de ${opOrdemTxt(o)}?\n\n${opAvisoDesfazer(o)}\n\nA ordem volta para a fila.`)) return;
  reabrirOrdem(o, 'fila');
  opRender();
  toast('Ordem reaberta. Ela voltou para a fila.');
}
function opExcluirOrdem(id) {
  const o = byId('ordens', id);
  if (!o) return render();
  const msg = o.status === 'concluido'
    ? `Excluir a ordem concluída de ${opOrdemTxt(o)}?\n\n${opAvisoDesfazer(o)}`
    : o.status === 'acabamento'
      ? `Excluir a ordem em acabamento de ${opOrdemTxt(o)}?\n\n${opAvisoDesfazer(o)}`
      : `Excluir a ordem de ${opOrdemTxt(o)}?`;
  if (!confirmar(msg)) return;
  excluirOrdem(o);
  opRender();
  toast('Ordem excluída.');
}

/* Formulário de ordem (nova ou edição). qtd (opcional): quantidade que já vem preenchida (ex.: sugestão de produção). */
function opNovaOrdem(produtoId, clienteId, qtd) { opFormOrdem(null, produtoId, clienteId, qtd); }
function opEditarOrdem(id) {
  const o = byId('ordens', id);
  if (!o) { toast('Esta ordem não existe mais.', 'bad'); return render(); }
  opFormOrdem(o);
}
function opFormOrdem(o, produtoId, clienteId, qtd) {
  if (!o && !S.produtos.length) { toast('Cadastre um produto primeiro.'); ir('produtos'); return; }
  const produtos = opPorNome(S.produtos), optsProd = produtos.map(p => [p.id, p.nome]);
  if (o && !byId('produtos', o.produtoId)) optsProd.unshift([o.produtoId || '', 'Produto excluído']);
  /* Ordem nova com mais de um produto e nenhum indicado: a pessoa escolhe, nada vem marcado por engano. */
  const prodIni = byId('produtos', produtoId) ? produtoId : produtos.length === 1 ? produtos[0].id : '';
  if (!o && !prodIni) optsProd.unshift(['', '— escolha o produto —']);
  const optsCli = [['', '— sem cliente —']].concat(opPorNome(S.clientes).map(c => [c.id, c.nome]));
  /* Ordem já impressa (concluída ou em acabamento): o material já saiu do estoque. */
  const impressa = !!o && ORDEM_IMPRESSA(o), id = o ? o.id : '';
  /* O que esta ordem já tirou do estoque (se já impressa) volta quando ela é refeita ao salvar. */
  const jaBaixado = { fil: new Map(), ins: new Map() };
  if (impressa) {
    (o.consumo || []).forEach(x => jaBaixado.fil.set(x.filamentoId, num(jaBaixado.fil.get(x.filamentoId)) + num(x.g)));
    (o.insumosUsados || []).forEach(x => jaBaixado.ins.set(x.insumoId, num(jaBaixado.ins.get(x.insumoId)) + num(x.qtd)));
  }
  openForm({
    title: o ? 'Editar ordem de produção' : 'Nova ordem de produção',
    registro: o ? ['ordens', o.id] : null,
    fields: [
      { k: 'produtoId', label: 'Produto', type: 'select', options: optsProd, req: true, full: true },
      { k: 'qtd', label: 'Quantidade de peças', type: 'number', req: true },
      { k: 'data', label: 'Data da ordem', type: 'date', req: true },
      { k: 'prazo', label: 'Prazo (opcional)', type: 'date', hint: 'Data combinada de entrega' },
      { k: 'clienteId', label: 'Cliente', type: 'select', options: optsCli },
      { k: 'obs', label: 'Observações', type: 'textarea', rows: 2 },
    ],
    vals: o
      ? { produtoId: o.produtoId, qtd: o.qtd, data: o.data, prazo: o.prazo, clienteId: o.clienteId, obs: o.obs }
      : { produtoId: prodIni, qtd: Math.max(1, Math.round(num(qtd))), data: hoje(), prazo: '', clienteId: byId('clientes', clienteId) ? clienteId : '', obs: '' },
    preview: d => opPreviaOrdem(d, jaBaixado, impressa ? o.status : ''),
    save: d => {
      const atual = id ? byId('ordens', id) : null;
      if (id && !atual) { toast('Esta ordem não existe mais.', 'bad'); return; }
      /* na edição vale manter o produto que a ordem já tinha, mesmo que ele tenha sido excluído */
      if (!byId('produtos', d.produtoId) && !(atual && d.produtoId === atual.produtoId)) { toast('Escolha o produto.', 'bad'); return false; }
      if (!(d.qtd >= 1) || d.qtd !== Math.round(d.qtd)) { toast('Informe a quantidade em peças inteiras (1 ou mais).', 'bad'); return false; }
      if (!atual) {
        novaOrdem(d);
        toast('Ordem criada. Ela entrou no fim da fila.');
        return;
      }
      const antes = atual.status;
      const refaz = ORDEM_IMPRESSA(atual) && (d.produtoId !== atual.produtoId || d.qtd !== num(atual.qtd));
      if (editarOrdem(atual, d) === false) {
        toast('O produto desta ordem foi excluído, então a baixa de estoque não pode ser refeita. Mantenha a quantidade ou escolha outro produto.', 'bad');
        return false;
      }
      /* ordem em acabamento trocada para um produto sem acabamento: as peças vão direto para o estoque */
      const direto = refaz && antes === 'acabamento' && atual.status === 'concluido';
      toast(refaz ? 'Ordem atualizada. A baixa de estoque foi refeita.' + (direto ? ' Como este produto não passa por acabamento, as peças entraram no estoque.' : '') : 'Ordem atualizada.');
    },
  });
}
/* O que a ordem precisa de cada material, comparado com o estoque. jaBaixado: o que esta mesma ordem
   já tirou do estoque (quando já foi impressa) e que volta se ela for refeita. */
function opNecessidade(p, qtd, jaBaixado) {
  const fils = new Map(), ins = new Map();
  (p.materiais || []).forEach(m => {
    const g = num(m.pesoG) * qtd;
    if (g <= 0) return;
    const r = fils.get(m.filamentoId) || { fil: byId('filamentos', m.filamentoId), precisa: 0 };
    r.precisa += g; fils.set(m.filamentoId, r);
  });
  (p.insumos || []).forEach(x => {
    const n = num(x.qtd) * qtd;
    if (n <= 0) return;
    const r = ins.get(x.insumoId) || { insumo: byId('insumos', x.insumoId), precisa: 0 };
    r.precisa += n; ins.set(x.insumoId, r);
  });
  return {
    fils: [...fils.entries()].map(([id, r]) => {
      const tem = r.fil ? num(r.fil.estoqueG) + num(jaBaixado.fil.get(id)) : 0, falta = r.precisa - tem;
      return { fil: r.fil, precisa: r.precisa, tem, falta: r.fil && falta >= 0.5 ? falta : 0 };
    }),
    ins: [...ins.entries()].map(([id, r]) => {
      const tem = r.insumo ? num(r.insumo.estoque) + num(jaBaixado.ins.get(id)) : 0, falta = r.precisa - tem;
      return { insumo: r.insumo, precisa: r.precisa, tem, falta: r.insumo && falta >= 0.005 ? falta : 0 };
    }),
  };
}
/* impressa: '' (ainda não impressa), 'acabamento' ou 'concluido' — a ordem já baixou o material. */
function opPreviaOrdem(d, jaBaixado, impressa) {
  const p = byId('produtos', d.produtoId);
  if (!p) {
    return `<div class="calc"><p class="muted">${d.produtoId
      ? 'Este produto não existe mais. Escolha outro para ver o tempo, o material e o custo.'
      : 'Escolha o produto para ver o tempo, o material e o custo desta ordem.'}</p></div>`;
  }
  const qtd = Math.max(1, Math.round(num(d.qtd))), c = custoProduto(p), n = opNecessidade(p, qtd, jaBaixado);
  const linha = (nome, precisa, tem, falta, existe) => `<tr><td>${nome}</td><td class="right num">${precisa}</td>
    <td class="right">${existe ? `<span class="num${falta ? ' neg' : ''}">${tem}</span>${falta ? `<small class="neg">em falta: ${falta}</small>` : ''}` : '<span class="muted">—</span>'}</td></tr>`;
  const linhas = n.fils.map(m => linha(m.fil ? cor(m.fil.cor) + esc(m.fil.nome) : '<span class="muted">Filamento não encontrado</span>',
    gramas(m.precisa), gramas(m.tem), m.falta ? gramas(Math.ceil(m.falta)) : '', !!m.fil)).join('') +
    n.ins.map(i => {
      const un = ' ' + esc((i.insumo && i.insumo.unidade) || 'un');
      return linha(i.insumo ? esc(i.insumo.nome) : '<span class="muted">Insumo não encontrado</span>',
        nf(i.precisa, 2) + un, nf(i.tem, 2) + un, i.falta ? nf(i.falta, 2) + un : '', !!i.insumo);
    }).join('');
  const faltaAlgo = n.fils.some(m => m.falta) || n.ins.some(i => i.falta);
  return `<div class="calc"><h4>Para imprimir ${opPl(qtd, 'peça', 'peças')}</h4>
    <div><span>Tempo total de impressão</span><b>${horasFmt(c.horas * qtd)}</b></div>
    ${linhas ? `<section style="margin:6px 0">${tabela(['Material', { t: 'Precisa', r: 1 }, { t: 'Em estoque', r: 1 }], linhas)}</section>` : ''}
    ${c.semFilamento ? '<p class="aviso txt-sm" style="margin:6px 0">Confira os filamentos no cadastro deste produto: o custo pode estar incompleto.</p>' : ''}
    <div><span>Custo por peça</span><b>${brl(c.custo)}</b></div>
    <div class="tot"><span>Custo total</span><b>${brl(c.custo * qtd)}</b></div>
    ${faltaAlgo ? `<p class="neg txt-sm" style="margin-top:8px">${impressa
    ? 'O estoque registrado não cobre esta ordem. Confira se falta lançar alguma compra.'
    : 'Falta material para esta ordem. Dá para salvar assim mesmo e repor antes de imprimir.'}</p>` : ''}
    ${impressa ? `<p class="muted txt-sm" style="margin-top:8px">${impressa === 'acabamento' ? 'Esta ordem já foi impressa' : 'Esta ordem já foi concluída'}: a coluna Em estoque mostra quanto havia sem a baixa dela. Se mudar o produto ou a quantidade, a baixa é refeita ao salvar.</p>` : ''}
    ${!impressa && p.acabamento ? `<p class="hint" style="margin-top:8px">Este produto passa por acabamento${p.etapasAcabamento ? ` (${esc(p.etapasAcabamento)})` : ''}: quando a impressão terminar, a ordem vai para Em acabamento, e as peças entram no estoque quando o acabamento ficar pronto.</p>` : ''}
  </div>`;
}

/* ---------- Tela: Falhas ---------- */
const opMotivos = ['Descolou da mesa', 'Entupimento', 'Acabou o filamento', 'Queda de energia', 'Suporte falhou', 'Camadas deslocadas', 'Erro de fatiamento', 'Outro'];
VIEWS.falhas = function () {
  const tf = taxaFalha(), limite = addDias(hoje(), -tf.dias), mes = mesAtual();
  const recentes = S.falhas.filter(f => (f.data || '') >= limite);
  const doMes = S.falhas.filter(f => String(f.data || '').slice(0, 7) === mes);
  const botao = '<button type="button" class="btn" onclick="opNovaFalha()">+ Registrar falha</button>';
  const situacao = tf.real ? 'Hoje é ela que está valendo.'
    : !S.config.falhaAuto ? 'Hoje essa opção está desligada, por isso vale a taxa fixa.'
      : `Hoje falta produzir mais ${gramas(Math.max(0, tf.minG - tf.prodG))} para ela começar a valer.`;
  const porMotivo = new Map();
  S.falhas.forEach(f => {
    const k = f.motivo || 'Sem motivo', r = porMotivo.get(k) || { nome: k, valor: 0, n: 0 };
    r.valor += num(f.gramas); r.n++;
    porMotivo.set(k, r);
  });
  const rank = [...porMotivo.values()].sort((a, b) => b.valor - a.valor)
    .map(r => ({ nome: r.nome, valor: r.valor, detalhe: opPl(r.n, 'falha', 'falhas') }));
  const lista = opRecentes(S.falhas);
  const linhas = lista.map(f => {
    const fil = byId('filamentos', f.filamentoId);
    return `<tr>
      <td class="num">${esc(dataBR(f.data))}</td>
      <td${opColNome}>${f.produtoId ? opProduto(f.produtoId) : '<span class="muted">Avulsa</span>'}</td>
      <td style="min-width:140px">${fil ? cor(fil.cor) + esc(fil.nome) : '<span class="muted">Filamento excluído</span>'}</td>
      <td class="right num">${gramas(f.gramas)}</td>
      <td class="right num">${brl(f.custo)}</td>
      <td style="min-width:140px">${esc(f.motivo) || '<span class="muted">—</span>'}</td>
      <td class="muted"${opColNome}>${esc(f.obs)}</td>
      <td><div class="rowbtns">${opBtn('Excluir', 'opExcluirFalha', f.id, 'danger')}</div></td></tr>`;
  }).join('') + (lista.length > 1
    ? `<tr class="total"><td colspan="3">Total</td><td class="right num">${gramas(soma(lista, 'gramas'))}</td><td class="right num">${brl(soma(lista, 'custo'))}</td><td colspan="3"></td></tr>` : '');
  return head('Falhas', 'Cada falha baixa o filamento perdido e ajusta a taxa usada no custo', botao) +
    `<div class="cards">
      ${kpi('Taxa em uso', pct(tf.pct), tf.real ? 'medida nos últimos ' + tf.dias + ' dias' : 'fixa da Configuração')}
      ${kpi('Taxa medida', pct(tf.realPct), gramas(tf.falhaG) + ' perdidos para ' + gramas(tf.prodG) + ' produzidos')}
      ${kpi('Perda em ' + tf.dias + ' dias', brl(soma(recentes, 'custo')), opPl(recentes.length, 'falha', 'falhas') + ' no período')}
      ${kpi('Falhas no mês', nf(doMes.length), gramas(soma(doMes, 'gramas')) + ' de filamento perdido')}
    </div>
    <p class="muted txt-sm" style="margin:-4px 0 18px">A taxa medida passa a valer sozinha quando houver pelo menos ${gramas(tf.minG)} produzido em ${tf.dias} dias e a opção estiver ligada na <a href="#config">Configuração</a>. ${situacao}</p>
    ${lista.length ? `<div class="panel"><h2>Onde mais se perde filamento <small>por motivo</small></h2>${barrasRank(rank, { fmt: gramas, vazio: 'Nenhuma falha registrada.' })}</div>` : ''}
    <div class="panel" id="op-falhas"><h2>Falhas registradas</h2>${lista.length
      ? tabela(['Data', 'Produto', 'Filamento', { t: 'Perdido', r: 1 }, { t: 'Custo', r: 1 }, 'Motivo', 'Observação', ''], linhas)
      : vazio('Nenhuma falha registrada. Quando uma impressão der errado, registre aqui para baixar o filamento perdido do estoque.', botao)}</div>`;
};
function opNovaFalha(produtoId, filamentoId) {
  if (!S.filamentos.length) { toast('Cadastre um filamento primeiro.'); ir('filamentos'); return; }
  const p = byId('produtos', produtoId), fils = opPorNome(S.filamentos);
  const doProduto = p ? (p.materiais || []).find(m => byId('filamentos', m.filamentoId)) : null;
  openForm({
    title: 'Registrar falha',
    fields: [
      { k: 'data', label: 'Data', type: 'date', req: true },
      { k: 'produtoId', label: 'Produto', type: 'select', options: [['', '— não sei / avulsa —']].concat(opPorNome(S.produtos).map(x => [x.id, x.nome])) },
      { k: 'filamentoId', label: 'Filamento perdido', type: 'select', req: true, options: fils.map(f => [f.id, f.nome]) },
      { k: 'gramas', label: 'Quanto se perdeu (g)', type: 'number', req: true, hint: 'Peso aproximado do que foi para o lixo' },
      { k: 'motivo', label: 'Motivo', type: 'select', options: opMotivos.map(m => [m, m]), full: true },
      { k: 'obs', label: 'Observação', type: 'textarea', rows: 2 },
    ],
    vals: {
      data: hoje(), produtoId: p ? p.id : '', gramas: '', motivo: opMotivos[0], obs: '',
      filamentoId: byId('filamentos', filamentoId) ? filamentoId : doProduto ? doProduto.filamentoId : fils[0].id,
    },
    /* Ao trocar o produto, já escolhe o primeiro filamento dele. */
    change: el => {
      if (el.name !== 'produtoId') return;
      const prod = byId('produtos', el.value);
      const m = prod && (prod.materiais || []).find(x => byId('filamentos', x.filamentoId));
      if (m) setCampo('filamentoId', m.filamentoId);
    },
    preview: d => {
      const prod = byId('produtos', d.produtoId), f = byId('filamentos', d.filamentoId), frases = [];
      const g = prod ? soma((prod.materiais || []).filter(m => m.filamentoId === d.filamentoId), 'pesoG') : 0;
      if (g > 0) frases.push(`Uma peça inteira de ${esc(prod.nome)} usa ${gramas(g)} deste filamento.`);
      if (f) frases.push(`Em estoque hoje: ${gramas(f.estoqueG)}.`);
      return frases.length ? `<p class="hint" style="margin-top:12px">${frases.join(' ')}</p>` : '';
    },
    save: d => {
      if (!(d.gramas > 0)) { toast('Informe quantos gramas de filamento foram perdidos.', 'bad'); return false; }
      const f = byId('filamentos', d.filamentoId);
      if (!f) { toast('Escolha o filamento que foi perdido.', 'bad'); return false; }
      registrarFalha(d);
      toast(`Falha registrada: baixa de ${gramas(d.gramas)} em ${f.nome}.`);
    },
  });
}
function opExcluirFalha(id) {
  const x = byId('falhas', id);
  if (!x) return render();
  const f = byId('filamentos', x.filamentoId);
  const volta = f ? `O filamento volta para o estoque de ${f.nome}.` : 'O filamento desta falha não existe mais, então nenhum estoque muda.';
  if (!confirmar(`Excluir esta falha de ${gramas(x.gramas)}?\n\n${volta}`)) return;
  excluirFalha(x);
  opRender();
  toast('Falha excluída.');
}

/* ---------- Tela: Manutenção ---------- */
const opSugeridos = [['Limpar e nivelar a mesa', 50], ['Lubrificar eixos e fusos', 200], ['Verificar correias', 300], ['Trocar o bico', 500]];
VIEWS.manutencao = function () {
  const h = horimetro(), real = manutencaoRealHora();
  const itens = S.manutItens.map(i => ({ i, s: statusManutencao(i) })).sort((a, b) => b.s.pct - a.s.pct);
  const vencidos = itens.filter(x => x.s.estado === 'vencida').length, proximos = itens.filter(x => x.s.estado === 'proxima').length;
  const linhasItens = itens.map(({ i, s }) => {
    const tipo = s.estado === 'vencida' ? 'bad' : s.estado === 'proxima' ? 'warn' : 'ok';
    const rotulo = s.estado === 'vencida' ? 'Vencida' : s.estado === 'proxima' ? 'Próxima' : 'Em dia';
    return `<tr>
      <td${opColNome}><b>${esc(i.nome)}</b></td>
      <td class="num">${nf(i.intervaloH)} h</td>
      <td style="min-width:140px">${medidor(s.pct, tipo)}<small style="margin-top:4px">${nf(s.usadoH, 1)} de ${nf(i.intervaloH)} h</small></td>
      <td>${selo(rotulo, tipo)}</td>
      <td><div class="rowbtns">${opBtn('Feito', 'opFeito', i.id, s.estado === 'ok' ? 'ghost' : '')}${opBtn('Editar', 'opEditarItem', i.id)}${opBtn('Excluir', 'opExcluirItem', i.id, 'danger')}</div></td></tr>`;
  }).join('');
  const hist = opRecentes(S.manutHist);
  const linhasHist = hist.map(m => `<tr>
      <td class="num">${esc(dataBR(m.data))}</td>
      <td${opColNome}>${esc(m.descricao)}</td>
      <td class="right num">${nf(m.horimetro, 1)} h</td>
      <td class="right num">${brl(m.custo)}</td>
      <td><div class="rowbtns">${opBtn('Excluir', 'opExcluirHist', m.id, 'danger')}</div></td></tr>`).join('');
  return head('Manutenção', 'Avisos por horas impressas e histórico de custos',
    '<button type="button" class="btn" onclick="opEditarItem()">+ Novo item</button><button type="button" class="btn ghost" onclick="opManutAvulsa()">Registrar manutenção avulsa</button>') +
    `<div class="cards">
      ${kpi('Horímetro', nf(h, 1) + ' h', 'horas impressas')}
      ${kpi('Gasto com manutenção', brl(soma(S.manutHist, 'custo')), opPl(S.manutHist.length, 'registro no histórico', 'registros no histórico'))}
      ${kpi('Custo real por hora', brl(real.porHora), 'na Configuração: ' + brl(S.config.manutencaoHora) + '/h')}
      ${kpi('Itens vencidos', nf(vencidos), proximos ? opPl(proximos, 'item perto de vencer', 'itens perto de vencer') : 'nenhum item perto de vencer', vencidos ? 'neg' : '')}
    </div>
    <p class="muted txt-sm" style="margin:-4px 0 18px">O horímetro soma as horas de impressão das ordens já impressas. Se a impressora já tinha horas de uso, informe o horímetro inicial na <a href="#config">Configuração</a>.</p>
    <div class="panel" id="op-itens"><h2>Itens de manutenção</h2>${itens.length
      ? tabela(['Item', 'A cada', 'Uso desde a última vez', 'Situação', ''], linhasItens)
      : vazio('Nenhum item cadastrado. Cadastre o que precisa ser feito de tempos em tempos e o sistema avisa quando chegar a hora.',
        '<button type="button" class="btn" onclick="opAdicionarSugeridos()">Adicionar itens sugeridos</button>')}</div>
    <div class="panel" id="op-hist"><h2>Histórico</h2>${hist.length
      ? tabela(['Data', 'O que foi feito', { t: 'Horímetro', r: 1 }, { t: 'Custo', r: 1 }, ''], linhasHist)
      : vazio('Nenhuma manutenção registrada ainda. Clique em Feito em um item ou registre uma manutenção avulsa.')}</div>`;
};
function opAdicionarSugeridos() {
  const h = horimetro();
  // código fixo por item sugerido: clicar nos dois aparelhos ao mesmo tempo não repete os itens
  opSugeridos.forEach(([nome, intervaloH]) => {
    const id = ('sug-' + nomeSeguro(nome).replace(/[.]/g, '-').toLowerCase()).slice(0, 64);
    if (!S.manutItens.some(i => i.nome === nome || i.id === id)) put('manutItens', { id, nome, intervaloH, ultimaH: h }, { seExistir: 'ignorar' });
  });
  render();
  toast('Itens sugeridos adicionados. Ajuste os intervalos como preferir.');
}
/* Formulário do item (sem id = novo). */
function opEditarItem(id) {
  const item = byId('manutItens', id), itemId = item ? item.id : '', h = arred(horimetro(), 1);
  // o horímetro da última vez como a janela mostrou ao abrir (o registro na tela muda se outro aparelho der "Feito")
  const ultimaMostrada = item ? arred(item.ultimaH, 1) : null;
  openForm({
    title: item ? 'Editar item de manutenção' : 'Novo item de manutenção',
    registro: item ? ['manutItens', item.id] : null,
    fields: [
      { k: 'nome', label: 'O que precisa ser feito', req: true, full: true, ph: 'Ex.: Trocar o bico' },
      { k: 'intervaloH', label: 'A cada quantas horas de impressão', type: 'number', req: true },
      { k: 'ultimaH', label: 'Horímetro na última vez que foi feito', type: 'number', hint: 'Hoje o horímetro marca ' + nf(h, 1) + ' h' },
    ],
    vals: item ? { nome: item.nome, intervaloH: item.intervaloH, ultimaH: ultimaMostrada } : { nome: '', intervaloH: '', ultimaH: h },
    save: d => {
      const agora = arred(horimetro(), 1);
      if (!d.nome) { toast('Dê um nome para o item.', 'bad'); return false; }
      if (!(d.intervaloH > 0)) { toast('Informe de quantas em quantas horas de impressão ele deve ser feito.', 'bad'); return false; }
      if (d.ultimaH > agora + 0.0001) { toast(`O horímetro está em ${nf(agora, 1)} h; a última vez não pode ser depois disso. Se a impressora já tinha horas de uso, informe o horímetro inicial na Configuração.`, 'bad'); return false; }
      /* a tela mostra o horímetro arredondado; sem mexer no campo, guarda o valor exato */
      if (!itemId) {
        put('manutItens', { id: uid(), nome: d.nome, intervaloH: d.intervaloH, ultimaH: d.ultimaH === agora ? horimetro() : d.ultimaH });
        toast('Item criado.');
        return;
      }
      const atual = byId('manutItens', itemId);
      if (!atual) { toast('Este item não existe mais.', 'bad'); return; }
      // campo como abriu: fica o valor de agora (exato, ou o "Feito" que outro aparelho deu com a janela aberta)
      const ultimaH = d.ultimaH === ultimaMostrada ? atual.ultimaH : d.ultimaH;
      put('manutItens', { ...atual, nome: d.nome, intervaloH: d.intervaloH, ultimaH });
      toast('Item atualizado.');
    },
  });
}
function opExcluirItem(id) {
  const item = byId('manutItens', id);
  if (!item) return render();
  if (!confirmar(`Excluir o item "${item.nome}"?\n\nO sistema para de avisar sobre ele. O histórico já registrado continua guardado.`)) return;
  rm('manutItens', item.id);
  opRender();
  toast('Item excluído.');
}
/* Manutenção feita em um item da lista (zera a contagem dele) ou avulsa (sem item). */
function opFeito(id) {
  const item = byId('manutItens', id);
  if (!item) { toast('Este item não existe mais.', 'bad'); return render(); }
  opFormManut(item);
}
function opManutAvulsa() { opFormManut(null); }
function opFormManut(item) {
  const itemId = item ? item.id : '';
  // código da manutenção: o item e quantos "Feito" ele já teve, contados ao abrir a janela. Dois aparelhos que abriram
  // o mesmo item chegam ao mesmo código, e o segundo "Feito" volta com aviso em vez de registrar em dobro. Cada "Feito"
  // soma 1 na contagem do item (também sem internet), e a próxima manutenção dele ganha outro código. Código já usado
  // antes de a janela abrir (ex.: item excluído e criado de novo com o mesmo código) passa para o próximo livre.
  let feitos = 0, idManut = '';
  if (item) {
    const raiz = ('mh-' + item.id).slice(0, 40) + '-';
    feitos = Math.max(0, Math.floor(num(item.feitos)));
    while (byId('manutHist', raiz + feitos)) feitos++;
    idManut = raiz + feitos;
  }
  const explica = item
    ? `O horímetro marca ${nf(horimetro(), 1)} h. Ao salvar, a contagem de <b>${esc(item.nome)}</b> volta a zero.`
    : 'Use para consertos e trocas que não estão na lista de itens. Não zera a contagem de nenhum item.';
  openForm({
    title: item ? 'Manutenção feita' : 'Registrar manutenção avulsa',
    fields: [
      { type: 'html', html: `<p class="hint" style="margin:0">${explica}</p>` },
      { k: 'data', label: 'Data', type: 'date', req: true },
      { k: 'custo', label: 'Quanto custou (R$)', type: 'number', hint: 'Peças e materiais. Deixe vazio se não gastou nada.' },
      { k: 'descricao', label: 'O que foi feito', req: !item, full: true, ph: 'Ex.: Troca do bico 0,4 mm' },
    ],
    vals: { data: hoje(), custo: '', descricao: item ? item.nome : '' },
    save: d => {
      if (!itemId) {
        if (!d.descricao) { toast('Descreva o que foi feito.', 'bad'); return false; }
        registrarManutencao({ data: d.data, descricao: d.descricao, custo: d.custo });
        toast('Manutenção registrada.');
        return;
      }
      if (!byId('manutItens', itemId)) { toast('Este item não existe mais.', 'bad'); return; }
      // outro aparelho já registrou esta mesma manutenção (abriu a janela no mesmo momento do item): não registra em dobro
      if (idManut && byId('manutHist', idManut)) { toast('Esta manutenção já foi registrada em outro aparelho. Nada foi gravado em dobro.', 'bad'); return; }
      registrarManutencao({ id: idManut, feitos, itemId, data: d.data, custo: d.custo, descricao: d.descricao });
      toast('Manutenção registrada. A contagem do item voltou a zero.');
    },
  });
}
function opExcluirHist(id) {
  const m = byId('manutHist', id);
  if (!m) return render();
  if (!confirmar(`Excluir "${m.descricao || 'Manutenção'}" de ${dataBR(m.data)} do histórico?\n\nO custo sai das contas. A contagem de horas dos itens não muda.`)) return;
  rm('manutHist', m.id);
  opRender();
  toast('Registro excluído.');
}
