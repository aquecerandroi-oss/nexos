'use strict';
/* Nexos — telas de Operação: Painel, Produção, Falhas e Manutenção.
   Tudo que é global neste arquivo começa com "op". Outros arquivos podem chamar
   opNovaOrdem(produtoId, clienteId) e opNovaFalha(produtoId, filamentoId).
   As contas ficam em calc.js; aqui só se monta a tela e se chama a regra certa. */

/* ---------- Ajudantes desta área ---------- */
/* opPl(3, 'peça', 'peças') devolve "3 peças". */
const opPl = (n, um, varios) => nf(n) + ' ' + (Math.round(num(n)) === 1 ? um : varios);
/* Botão pequeno de linha. O id vai em data-id e é lido com this.dataset: nunca entra no código do onclick. */
const opBtn = (rotulo, fn, id, cls = 'ghost') =>
  `<button type="button" class="btn ${cls} sm" data-id="${esc(id)}" onclick="${fn}(this.dataset.id)">${rotulo}</button>`;
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
  return `<div class="panel"${opNaGrade}><div class="panel-head"><h2>Fila da impressora</h2><a class="btn ghost sm" href="#producao">Ver produção</a></div>${corpo}</div>`;
}
function opPainelVendas() {
  const ultimas = opRecentes(S.vendas).slice(0, 5);
  const linhas = ultimas.map(v => `<tr>
      <td class="num">${esc(dataBR(v.data))}</td>
      <td>${nf(v.qtd)}× ${esc((byId('produtos', v.produtoId) || {}).nome || v.produtoNome || 'Produto excluído')}</td>
      <td>${esc((byId('canais', v.canalId) || {}).nome || v.canalNome || 'Sem canal')}</td>
      <td class="right num">${brl(v.bruto)}</td>
      <td class="right num ${num(v.lucro) < 0 ? 'neg' : 'pos'}">${brl(v.lucro)}</td></tr>`).join('');
  const corpo = ultimas.length
    ? tabela(['Data', 'Produto', 'Canal', { t: 'Total', r: 1 }, { t: 'Lucro', r: 1 }], linhas)
    : vazio('Nenhuma venda registrada ainda.', '<button type="button" class="btn" onclick="opAbrirVenda()">Registrar venda</button>');
  return `<div class="panel"${opNaGrade}><div class="panel-head"><h2>Últimas vendas</h2><a class="btn ghost sm" href="#vendas">Ver vendas</a></div>${corpo}</div>`;
}
/* O formulário de venda mora em views-comercial.js; se ele não estiver carregado, só abre a tela. */
function opAbrirVenda() {
  if (typeof comNovaVenda === 'function') comNovaVenda(); else ir('vendas');
}
VIEWS.painel = function () {
  const mes = mesAtual(), rv = resumoVendas(vendasDoMes(mes)), fila = filaProducao();
  const prontas = soma(S.produtos, p => Math.max(0, num(p.estoque))), comEstoque = S.produtos.filter(p => num(p.estoque) > 0).length;
  return head('Painel', 'Resumo de ' + nomeMesLongo(mes)) +
    (!S.filamentos.length && !S.produtos.length ? opPainelPassos() : '') +
    `<div class="cards">
      ${kpi('Faturamento do mês', brl(rv.bruto), opPl(rv.qtd, 'peça vendida', 'peças vendidas'))}
      ${kpi('Lucro do mês', brl(rv.lucro), 'margem ' + pct(rv.margem), rv.lucro > 0 ? 'pos' : rv.lucro < 0 ? 'neg' : '')}
      ${kpi('Na impressora e na fila', opPl(soma(fila, x => x.o.qtd), 'peça', 'peças'), fila.length ? 'termina ' + dataHora(Math.max(...fila.map(x => x.fim))) : 'fila vazia')}
      ${kpi('Peças prontas', nf(prontas), opPl(comEstoque, 'produto com estoque', 'produtos com estoque'), prontas < 0 ? 'neg' : '')}
    </div>
    <div class="cols">${opPainelMetas(rv)}${opPainelAlertas()}</div>
    <div class="cols">${opPainelFila(fila)}${opPainelVendas()}</div>`;
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
    acoes = `<div class="stack" style="gap:6px"><div class="rowbtns">${opBtn('Concluir', 'opConcluir', o.id, '')}${opBtn('Falhou', 'opFalhou', o.id)}${opBtn('Voltar para a fila', 'opVoltarFila', o.id)}</div><div class="rowbtns">${editarExcluir}</div></div>`;
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
  return `<tr>
    <td class="num">${esc(dataBR(o.fim))}</td>
    <td${opColNome}><b>${opProduto(o.produtoId)}</b>${o.obs ? `<small>${esc(o.obs)}</small>` : ''}</td>
    <td class="right num">${nf(o.qtd)}</td>
    <td class="right num">${gramas(soma(o.consumo, 'g'))}</td>
    <td class="right num">${brl(num(o.custoUnit) * num(o.qtd))}</td>
    <td>${nomeDe('clientes', o.clienteId)}</td>
    <td><div class="rowbtns">${opBtn('Reabrir', 'opReabrir', o.id)}${opBtn('Editar', 'opEditarOrdem', o.id)}${opBtn('Excluir', 'opExcluirOrdem', o.id, 'danger')}</div></td></tr>`;
}
VIEWS.producao = function () {
  const fila = filaProducao(), naFila = fila.filter(x => x.o.status === 'fila');
  const feitas = opRecentes(S.ordens.filter(o => o.status === 'concluido'), 'fim');
  const resumo = fila.length ? `${opPl(fila.length, 'ordem', 'ordens')} · termina ${dataHora(Math.max(...fila.map(x => x.fim)))}` : '';
  const proxima = fila.length && fila[0].o.status === 'fila' ? fila[0] : null;   // nada imprimindo: a primeira da fila é a próxima
  return head('Produção', 'A previsão considera a impressora rodando sem parar, uma ordem por vez.', opBtnNovaOrdem) +
    `<div class="panel" id="op-fila"><h2>Fila da impressora${resumo ? ` <small>${resumo}</small>` : ''}</h2>${fila.length
      ? tabela(['Produto', { t: 'Qtd', r: 1 }, { t: 'Tempo', r: 1 }, 'Situação', 'Previsão de término', 'Prazo', ''], fila.map(x => opLinhaFila(x, naFila, x === proxima)).join(''))
      : opVazioFila()}</div>
    <div class="panel" id="op-feitas"><h2>Concluídas${feitas.length > 30 ? ` <small>as 30 mais recentes de ${nf(feitas.length)}</small>` : ''}</h2>${feitas.length
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
function opConcluir(id) {
  const o = byId('ordens', id);
  if (!o || o.status === 'concluido') return render();
  const temProduto = !!byId('produtos', o.produtoId);
  concluirOrdem(o);
  opRender();
  if (!temProduto) return toast('Ordem concluída. O produto foi excluído, por isso o estoque não mudou.');
  toast(`${opPl(o.qtd, 'peça entrou', 'peças entraram')} no estoque de prontas. Filamento usado: ${gramas(soma(o.consumo, 'g'))}.`);
}
/* Abre o registro de falha já com o produto e o primeiro filamento dele; a ordem continua como está. */
function opFalhou(id) {
  const o = byId('ordens', id);
  if (!o) return render();
  const p = byId('produtos', o.produtoId), m = p && (p.materiais || [])[0];
  opNovaFalha(o.produtoId, m ? m.filamentoId : '');
}
function opVoltarFila(id) {
  const o = byId('ordens', id);
  if (!o || o.status !== 'imprimindo') return render();
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
/* Aviso comum a reabrir e a excluir uma ordem já concluída. */
function opAvisoDesfazer(o) {
  const p = byId('produtos', o.produtoId), q = num(o.qtd);
  let t = `O material usado volta para o estoque e ${q === 1 ? 'a peça sai' : 'as ' + nf(q) + ' peças saem'} do estoque de prontas.`;
  if (p && num(p.estoque) < q) t += `\n\nAtenção: hoje há ${opPl(p.estoque, 'peça pronta', 'peças prontas')} deste produto, então o estoque vai ficar negativo.`;
  return t;
}
function opReabrir(id) {
  const o = byId('ordens', id);
  if (!o || o.status !== 'concluido') return render();
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
    : `Excluir a ordem de ${opOrdemTxt(o)}?`;
  if (!confirmar(msg)) return;
  excluirOrdem(o);
  opRender();
  toast('Ordem excluída.');
}

/* Formulário de ordem (nova ou edição) */
function opNovaOrdem(produtoId, clienteId) { opFormOrdem(null, produtoId, clienteId); }
function opEditarOrdem(id) {
  const o = byId('ordens', id);
  if (!o) { toast('Esta ordem não existe mais.', 'bad'); return render(); }
  opFormOrdem(o);
}
function opFormOrdem(o, produtoId, clienteId) {
  if (!o && !S.produtos.length) { toast('Cadastre um produto primeiro.'); ir('produtos'); return; }
  const produtos = opPorNome(S.produtos), optsProd = produtos.map(p => [p.id, p.nome]);
  if (o && !byId('produtos', o.produtoId)) optsProd.unshift([o.produtoId || '', 'Produto excluído']);
  /* Ordem nova com mais de um produto e nenhum indicado: a pessoa escolhe, nada vem marcado por engano. */
  const prodIni = byId('produtos', produtoId) ? produtoId : produtos.length === 1 ? produtos[0].id : '';
  if (!o && !prodIni) optsProd.unshift(['', '— escolha o produto —']);
  const optsCli = [['', '— sem cliente —']].concat(opPorNome(S.clientes).map(c => [c.id, c.nome]));
  const concluida = !!o && o.status === 'concluido', id = o ? o.id : '';
  /* O que esta ordem já tirou do estoque (se concluída) volta quando ela é refeita ao salvar. */
  const jaBaixado = { fil: new Map(), ins: new Map() };
  if (concluida) {
    (o.consumo || []).forEach(x => jaBaixado.fil.set(x.filamentoId, num(jaBaixado.fil.get(x.filamentoId)) + num(x.g)));
    (o.insumosUsados || []).forEach(x => jaBaixado.ins.set(x.insumoId, num(jaBaixado.ins.get(x.insumoId)) + num(x.qtd)));
  }
  openForm({
    title: o ? 'Editar ordem de produção' : 'Nova ordem de produção',
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
      : { produtoId: prodIni, qtd: 1, data: hoje(), prazo: '', clienteId: byId('clientes', clienteId) ? clienteId : '', obs: '' },
    preview: d => opPreviaOrdem(d, jaBaixado, concluida),
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
      const refaz = atual.status === 'concluido' && (d.produtoId !== atual.produtoId || d.qtd !== num(atual.qtd));
      if (editarOrdem(atual, d) === false) {
        toast('O produto desta ordem foi excluído, então a baixa de estoque não pode ser refeita. Mantenha a quantidade ou escolha outro produto.', 'bad');
        return false;
      }
      toast(refaz ? 'Ordem atualizada. A baixa de estoque foi refeita.' : 'Ordem atualizada.');
    },
  });
}
/* O que a ordem precisa de cada material, comparado com o estoque. jaBaixado: o que esta mesma ordem
   já tirou do estoque (quando está concluída) e que volta se ela for refeita. */
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
function opPreviaOrdem(d, jaBaixado, concluida) {
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
    ${faltaAlgo ? `<p class="neg txt-sm" style="margin-top:8px">${concluida
    ? 'O estoque registrado não cobre esta ordem. Confira se falta lançar alguma compra.'
    : 'Falta material para esta ordem. Dá para salvar assim mesmo e repor antes de imprimir.'}</p>` : ''}
    ${concluida ? '<p class="muted txt-sm" style="margin-top:8px">Esta ordem já foi concluída: a coluna Em estoque mostra quanto havia sem a baixa dela. Se mudar o produto ou a quantidade, a baixa é refeita ao salvar.</p>' : ''}
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
    <p class="muted txt-sm" style="margin:-4px 0 18px">O horímetro soma as horas de impressão das ordens concluídas. Se a impressora já tinha horas de uso, informe o horímetro inicial na <a href="#config">Configuração</a>.</p>
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
  opSugeridos.forEach(([nome, intervaloH]) => {
    if (!S.manutItens.some(i => i.nome === nome)) put('manutItens', { id: uid(), nome, intervaloH, ultimaH: h });
  });
  render();
  toast('Itens sugeridos adicionados. Ajuste os intervalos como preferir.');
}
/* Formulário do item (sem id = novo). */
function opEditarItem(id) {
  const item = byId('manutItens', id), itemId = item ? item.id : '', h = arred(horimetro(), 1);
  openForm({
    title: item ? 'Editar item de manutenção' : 'Novo item de manutenção',
    fields: [
      { k: 'nome', label: 'O que precisa ser feito', req: true, full: true, ph: 'Ex.: Trocar o bico' },
      { k: 'intervaloH', label: 'A cada quantas horas de impressão', type: 'number', req: true },
      { k: 'ultimaH', label: 'Horímetro na última vez que foi feito', type: 'number', hint: 'Hoje o horímetro marca ' + nf(h, 1) + ' h' },
    ],
    vals: item ? { nome: item.nome, intervaloH: item.intervaloH, ultimaH: arred(item.ultimaH, 1) } : { nome: '', intervaloH: '', ultimaH: h },
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
      const ultimaH = d.ultimaH === arred(atual.ultimaH, 1) ? atual.ultimaH : d.ultimaH;
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
      registrarManutencao({ itemId, data: d.data, custo: d.custo, descricao: d.descricao });
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
