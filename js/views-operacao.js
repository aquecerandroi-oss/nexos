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
/* Data e hora em palavras: "hoje às 18:09", "amanhã às 08:30", "ontem às 22:10" ou "qua, 25/11 12:33". */
function opQuandoHora(d) {
  d = new Date(d);
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), dia = dataLocal(d);
  return dia === hoje() ? 'hoje às ' + hm : dia === addDias(hoje(), 1) ? 'amanhã às ' + hm : dia === addDias(hoje(), -1) ? 'ontem às ' + hm : dataHora(d);
}
const opQuandoCurto = d => opQuandoHora(d).replace(' às ', ' ');
/* Dia de um prazo: "hoje", "amanhã", "ontem" ou "25/11". */
const opDia = iso => (!iso ? '' : iso === hoje() ? 'hoje' : iso === addDias(hoje(), 1) ? 'amanhã' : iso === addDias(hoje(), -1) ? 'ontem' : dataCurta(iso));
/* Há quanto tempo: "agora", "há 5 min", "há 2 h" ou "há 3 dias". */
function opHa(iso) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return !iso || isNaN(m) ? '' : m < 1 ? 'agora' : m < 60 ? 'há ' + m + ' min' : m < 1440 ? 'há ' + Math.floor(m / 60) + ' h' : 'há ' + opPl(Math.floor(m / 1440), 'dia', 'dias');
}
/* Redesenha a tela mantendo a rolagem lateral das tabelas (no celular os botões ficam no fim da linha). */
function opRender() {
  const pos = [];
  $$('#main .panel[id] .scroll').forEach(s => { if (s.scrollLeft) pos.push([s.closest('.panel').id, s.scrollLeft]); });
  render();
  pos.forEach(([id, x]) => { const p = document.getElementById(id), s = p && $('.scroll', p); if (s) s.scrollLeft = x; });
}
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
      <button type="button" class="btn ghost sm" data-id="${esc(s.p.id)}" data-qtd="${esc(s.falta)}" data-cod="${esc(codigoSugestao(s.p.id))}" onclick="opCriarSugerida(this.dataset.id, this.dataset.qtd, this.dataset.cod)">Criar ordem</button></li>`).join('');
  return `<ul class="lista">${itens}</ul>${resto > 0 ? `<p class="muted txt-sm mt">E mais ${opPl(resto, 'produto', 'produtos')} abaixo do mínimo.</p>` : ''}`;
}
/* Criar ordem de uma sugestão: a janela de sempre, já com a quantidade, e a ordem ganha código fixo (codigoSugestao): os dois
   aparelhos que criarem a ordem da mesma sugestão não criam duas. cod: o código como estava na tela quando o botão foi
   desenhado (se a ordem do outro aparelho chegou com a tela parada embaixo do mouse, a janela pergunta antes de criar outra). */
function opCriarSugerida(id, qtd, cod) { opFormOrdem(null, id, '', num(qtd), cod || true); }
/* "Criar ordem" na lista do Painel: um clique cria a ordem da sugestão, com Desfazer. O código fixo (cod, o da sugestão como
   estava na tela) faz os dois aparelhos não criarem duas: se a ordem dela (ou uma ordem igual, feita à mão) já chegou do outro
   aparelho com a tela parada, a pergunta de ordem igual aparece antes, como na janela de sempre; se as duas saírem juntas, o
   banco grava a primeira e a outra volta com aviso. A sugestão é conferida de novo na hora: só cria se o produto ainda estiver
   abaixo do mínimo, com a quantidade de agora. */
function opCriarDaSugestao(id, qtd, cod) {
  const p = byId('produtos', id), q = Math.max(1, Math.round(num(qtd)));
  if (!p) return render();
  const codigo = codigoDaSugestao(id, cod), ja = byId('ordens', codigo);
  const criar = (idNovo, quantas) => {
    const marca = marcaDesfazer(), n = novaOrdem({ id: idNovo, produtoId: id, qtd: quantas });
    opRender();
    avisoDesfazer('Ordem criada: ' + opOrdemTxt(n) + '. Ela entrou no fim da fila.', marca, () => {
      const a = byId('ordens', n.id);
      if (!a || a.status !== 'fila') return opJaMudou();
      excluirOrdem(a);
      opRender();
      toast('Desfeito: a ordem saiu da fila.');
    });
  };
  const igual = ja || ordemIgualRecente({ produtoId: id, qtd: q, clienteId: '' });
  if (igual) return opPerguntarIgual(igual, () => criar(ja ? codigoSugestao(id) : codigo, q));
  const s = sugestoesProducao().find(x => x.p.id === id);
  if (!s) { opRender(); return toast(`${p.nome} já não está abaixo do estoque mínimo (outra ordem entrou ou o estoque mudou). Nada foi criado.`, 'warn'); }
  criar(codigo, s.falta);
}

/* ---------- Agora na impressora: Próxima > Na impressora > Em acabamento ----------
   Um bloco igual no Painel e na Produção, no caminho da peça. O botão vermelho diz o que vai acontecer. As contas são as de
   sempre (filaProducao, materialDaFila em calc.js); aqui só se monta o bloco. Os botões op-acao esperam 1 s quando quem mudou
   a tela foi o outro aparelho (ver "A tela mudou pelo outro aparelho", no fim deste arquivo). */
const opIc = {
  mais: '<g fill="currentColor" stroke="none"><circle cx="4.5" cy="12" r="2.1"/><circle cx="12" cy="12" r="2.1"/><circle cx="19.5" cy="12" r="2.1"/></g>',
  ok: '<path d="M4.5 12.5l5 5L20 6.5"/>', aviso: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>', modelo: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
};
const opSvg = k => `<svg class="op-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${opIc[k] || ''}</svg>`;
let opAcabTodos = false;                 // Produção: "Mostrar as outras" no Em acabamento (vale até recarregar)
/* O que falta da impressão, pela previsão (só mostra: a conta da fila é a de sempre). */
function opAndamento(x) {
  const ini = Date.parse(x.o.inicio), tot = x.horas * 36e5, agora = Date.now();
  if (!(tot > 0) || !isFinite(ini)) return { semConta: true, pct: 0, falta: 0, passou: 0, prev: null };
  const prev = ini + tot;
  return { semConta: false, pct: Math.min(100, Math.max(0, (agora - ini) / tot * 100)), falta: Math.max(0, prev - agora), passou: Math.max(0, agora - prev), prev: new Date(prev) };
}
function opFoto(p, cls = '') {
  if (p && p.foto && p.foto.path) return `<img class="op-foto ${cls}" data-path="${esc(p.foto.path)}" alt="">`;
  const f = p && (p.materiais || []).map(m => byId('filamentos', m.filamentoId)).find(Boolean);
  return `<span class="op-foto vazia ${cls}" style="--c:${corSegura(f && f.cor)}">${icone('producao')}</span>`;
}
/* A peça aparece de baixo para cima, como sai da impressora: a parte já feita fica acesa. */
function opFotoViva(p, parte) {
  const f = p && (p.materiais || []).map(m => byId('filamentos', m.filamentoId)).find(Boolean);
  const miolo = p && p.foto && p.foto.path ? `<img data-path="${esc(p.foto.path)}" alt=""><img class="acesa" data-path="${esc(p.foto.path)}" alt="">`
    : `<span class="op-cubo" style="color:${corSegura(f && f.cor)}">${icone('producao')}</span>`;
  return `<div class="op-viva" style="--p:${Math.max(0, Math.min(100, parte)).toFixed(1)}%" aria-hidden="true">${miolo}${parte > 0 && parte < 100 ? '<i></i>' : ''}</div>`;
}
const opTemModelo = p => !!(p && p.arquivo && p.arquivo.path);
/* Botão do bloco e das listas do Painel (espera 1 s quando a tela mudou pelo outro aparelho). */
const opBtnAcao = (rotulo, fn, id, cls = 'ghost', extra = '') =>
  `<button type="button" class="btn op-acao ${cls}" data-id="${esc(id)}" ${extra} onclick="${fn}(this.dataset.id)">${rotulo}</button>`;
const opBtnMais = (tipo, id) => `<button type="button" class="op-ic" data-id="${esc(id)}" data-i="${tipo}" title="Mais opções" aria-label="Mais opções" onclick="opMais(this.dataset.id, this.dataset.i)">${opSvg('mais')}</button>`;
const opFaltaFil = r => (r ? r.fils.filter(x => x.falta) : []);
/* Um filamento da ordem: o peso e um visto, ou "falta 15 g" (já descontando o que as ordens da frente vão gastar). O ponto da
   cor fica junto do nome (na fila estreita, o peso e o "falta" é que descem para a linha de baixo). Filamento excluído do
   cadastro: sem o visto (a conclusão não baixaria nada dele), como a prévia da ordem. */
const opFio = x => `<span class="op-fio${!x.f ? ' sem' : x.falta ? ' falta' : ''}"><span class="n">${x.f ? cor(x.f.cor) : '<span class="dot"></span>'}${x.f ? esc(x.f.nome) : 'Filamento excluído'}</span> <b>${gramas(x.g)}</b> ${!x.f ? '<em>confira o cadastro</em>' : x.falta ? `<em>falta ${gramas(x.falta)}</em>` : opSvg('ok')}</span>`;
const opFioIns = x => `<span class="op-fio leve"><span class="n">${esc(x.i.nome)}</span> <b>falta ${nf(x.falta, 2)} ${esc(x.i.unidade || 'un')}</b></span>`;
function opFios(r) {
  const ins = r ? r.ins.filter(x => x.falta) : [];
  return r && (r.fils.length || ins.length) ? `<div class="op-fios">${r.fils.map(opFio).join('')}${ins.map(opFioIns).join('')}</div>` : '';
}
const opSubOrdem = o => { const c = byId('clientes', o.clienteId); return [c ? esc(c.nome) : '', esc(o.obs)].filter(Boolean).join(' · '); };
const opSeloPrazo = x => (x.prazo === 'atrasada' ? selo('Atrasada', 'bad') : x.prazo === 'hoje' ? selo('Vence hoje', 'warn') : x.estouraPrazo ? selo('Passa do prazo', 'warn') : '');
const opLinhaSub = (sub, x) => (sub || x.o.prazo ? `<div class="op-sub op-linha-sub"><span>${[sub, x.o.prazo ? 'prazo ' + esc(opDia(x.o.prazo)) : ''].filter(Boolean).join(' · ')}</span>${x.o.prazo ? opSeloPrazo(x) : ''}</div>` : '');
const opSeloFalhou = o => { const n = falhasDaOrdem(o); return n > 0 ? selo('Falhou ' + (n === 1 ? '1 vez' : nf(n) + ' vezes'), 'warn') : ''; };
const opDestino = (p, q) => (!p ? 'o produto foi excluído' : p.acabamento ? (num(q) === 1 ? 'vai para o acabamento' : 'vão para o acabamento')
  : (num(q) === 1 ? '1 peça entra no estoque' : nf(q) + ' peças entram no estoque'));
const opNomeOrdem = (o, cls = '') => `<button type="button" class="op-nome${cls}" data-id="${esc(o.id)}" onclick="opEditarOrdem(this.dataset.id)" title="Editar a ordem">${nf(o.qtd)}× ${opProduto(o.produtoId)}</button>`;
/* Falta filamento: Comprei (a janela de compra de hoje, já com aquele filamento) e Escolher outra (outra ordem da fila passa
   para a frente). */
const opAlertaFalta = (quem, falta) => `<div class="op-alerta">${opSvg('aviso')}<div>${quem} precisa de mais ${falta.map(f => `<b>${gramas(f.falta)} de ${esc(f.f.nome)}</b>`).join(' e ')}.</div>
  <span class="op-alerta-b"><button type="button" class="btn ghost sm" data-id="${esc(falta[0].id)}" onclick="cadNovaCompra(this.dataset.id)">Comprei</button><button type="button" class="btn ghost sm" onclick="opEscolherOutra()">Escolher outra</button></span></div>`;
function opTempo(a, x) {
  if (a.semConta) return `<div class="op-tempo"><b>imprimindo</b> <span>${x.o.inicio ? 'iniciou ' + opQuandoHora(x.o.inicio) : ''}${x.horas > 0 ? '' : (x.o.inicio ? ' · ' : '') + 'sem tempo no cadastro'}</span></div>`;
  if (a.passou) return `<div class="op-tempo passou"><b>passou ${horasFmt(a.passou / 36e5)}</b> <span>era ${opQuandoCurto(a.prev)}</span></div>`;
  return `<div class="op-tempo"><b>faltam ${horasFmt(Math.max(1 / 60, a.falta / 36e5))}</b> <span>termina ${opQuandoCurto(a.prev)}</span></div>`;
}
/* Uma ordem imprimindo. Com a próxima e filamento para ela: "Concluir e iniciar a próxima"; senão, só Concluir. */
function opCardImpressora(x, prox, mat) {
  const a = opAndamento(x), o = x.o, p = x.p, faltaProx = prox ? opFaltaFil(mat.por.get(prox.o.id)) : [], segue = !!prox && !faltaProx.length;
  const principal = segue
    ? `<button type="button" class="btn op-btn op-acao" data-id="${esc(o.id)}" data-prox="${esc(prox.o.id)}" onclick="opConcluirEIniciar(this.dataset.id, this.dataset.prox)">Concluir e iniciar a próxima<small>${opDestino(p, o.qtd)} · inicia ${nf(prox.o.qtd)}× ${opProduto(prox.o.produtoId)}</small></button>`
    : `<button type="button" class="btn op-btn op-acao" data-id="${esc(o.id)}" onclick="opConcluir(this.dataset.id)">Concluir<small>${opDestino(p, o.qtd)}</small></button>`;
  const situacao = a.semConta ? selo('Imprimindo', 'info') : a.passou ? selo('Passou da hora', 'warn') : selo(Math.floor(a.pct) + '%', 'info');
  return `<article class="op-card foco" id="op-imp"><div class="op-top"><span class="op-rot">Na impressora</span>${opSeloFalhou(o)}${situacao}${opBtnMais('imp', o.id)}</div>
    <div class="op-peca">${opFotoViva(p, a.semConta ? 100 : a.pct)}<div class="op-peca-t">${opNomeOrdem(o)}${opLinhaSub(opSubOrdem(o), x)}${opTempo(a, x)}
      ${a.semConta ? '' : medidor(a.pct, a.passou ? 'warn' : '')}${opFios(mat.por.get(o.id))}</div></div>
    <div class="op-acoes">${principal}<div class="op-sec">${segue ? opBtnAcao('Só concluir', 'opConcluir', o.id) : ''}${opBtnAcao('Falhou', 'opFalhou', o.id)}</div>
      ${faltaProx.length ? opAlertaFalta(`A próxima (${nf(prox.o.qtd)}× ${opProduto(prox.o.produtoId)})`, faltaProx) : ''}</div></article>`;
}
/* Duas (ou mais) imprimindo: cada uma com o seu Concluir e o seu Falhou. A previsão continua supondo uma impressora. */
function opCardVarias(imp) {
  return `<article class="op-card foco" id="op-imp"><div class="op-top"><span class="op-rot">Na impressora</span>${selo(nf(imp.length) + ' ordens imprimindo', 'info')}</div><div class="op-var">${imp.map(x => {
    const a = opAndamento(x), o = x.o;
    return `<div><div class="op-quem">${opFoto(x.p)}<div>${opNomeOrdem(o, ' menor')}<div class="op-sub">${a.semConta ? (o.inicio ? 'iniciou ' + opQuandoHora(o.inicio) : 'imprimindo') : a.passou ? 'já devia ter terminado' : 'termina ' + opQuandoHora(a.prev)}</div></div>${opSeloFalhou(o)}${opBtnMais('imp', o.id)}</div>
      ${a.semConta ? '' : `<div class="op-tempo${a.passou ? ' passou' : ''}"><b>${a.passou ? 'passou ' + horasFmt(a.passou / 36e5) : 'faltam ' + horasFmt(Math.max(1 / 60, a.falta / 36e5))}</b></div>${medidor(a.pct, a.passou ? 'warn' : '')}`}
      <div class="op-sec">${opBtnAcao('Concluir', 'opConcluir', o.id, '')}${opBtnAcao('Falhou', 'opFalhou', o.id)}</div></div>`;
  }).join('')}</div></article>`;
}
/* Nada imprimindo: a primeira da fila, pronta para iniciar (ou "Nenhuma ordem na fila"). */
function opCardLivre(prox, mat) {
  if (!prox) {
    return `<article class="op-card foco" id="op-imp"><div class="op-top"><span class="op-rot">Impressora livre</span></div><div class="op-peca"><p class="op-vazio">${S.produtos.length ? 'Nenhuma ordem na fila.' : 'Para criar ordens, cadastre primeiro um produto.'}</p></div>
      <div class="op-acoes">${S.produtos.length ? '<button type="button" class="btn op-btn" onclick="opNovaOrdem()">+ Nova ordem</button>' : '<a class="btn op-btn" href="#produtos">Cadastrar produto</a>'}</div></article>`;
  }
  const o = prox.o, falta = faltaParaIniciar(o);
  const ultima = S.ordens.map(x => x.fimImpressaoEm || '').sort().pop(), parada = ultima && Date.now() - Date.parse(ultima) < 7 * 864e5 ? opHa(ultima) : '';
  return `<article class="op-card foco" id="op-imp"><div class="op-top"><span class="op-rot">Impressora livre</span>${opSeloFalhou(o)}${opBtnMais('fila', o.id)}</div>
    <div class="op-peca">${opFotoViva(prox.p, 0)}<div class="op-peca-t">${opNomeOrdem(o)}${opLinhaSub(opSubOrdem(o), prox)}
      <div class="op-tempo"><b>${parada === 'agora' ? 'livre agora' : parada ? 'parada ' + parada : 'pronta para iniciar'}</b> <span>${prox.p ? horasFmt(prox.horas) : ''}</span></div>${medidor(0)}${opFios(mat.por.get(o.id))}</div></div>
    <div class="op-acoes"><button type="button" class="btn op-btn op-acao" data-id="${esc(o.id)}" onclick="opIniciar(this.dataset.id)">Iniciar<small>termina ${opQuandoHora(Date.now() + prox.horas * 36e5)}${falta.length ? ' · falta filamento' : ''}</small></button>
      ${opTemModelo(prox.p) ? `<div class="op-sec"><button type="button" class="btn ghost" data-id="${esc(prox.p.id)}" onclick="opModelo(this.dataset.id)">${opSvg('modelo')}Modelo</button></div>` : ''}
      ${falta.length ? opAlertaFalta(`Esta ordem (${nf(o.qtd)}× ${opProduto(o.produtoId)})`, falta) : ''}</div></article>`;
}
function opCardProxima(x, resto, mat, livre, total) {
  const rot = livre ? 'Depois dela' : 'Próxima';
  if (!x) return `<article class="op-card" id="op-prox"><div class="op-top"><span class="op-rot">${rot}</span></div><p class="op-vazio">Nada na fila depois desta.</p><div class="op-acoes fim"><button type="button" class="btn ghost" onclick="opNovaOrdem()">+ Nova ordem</button></div></article>`;
  const o = x.o, sub = opSubOrdem(o);
  const marca = y => { const f = opFaltaFil(mat.por.get(y.o.id))[0]; return f ? `<em class="neg">falta ${gramas(f.falta)}</em>` : y.prazo === 'atrasada' ? '<em class="neg">atrasada</em>' : y.prazo === 'hoje' ? '<em class="aviso">vence hoje</em>' : ''; };
  const ver = `<a class="op-ver" href="#producao">Ver a fila (${nf(total)})</a>`;
  const depois = resto.length ? `<ol class="op-depois">${resto.slice(0, 2).map(y => `<li><span>${nf(y.o.qtd)}× ${opProduto(y.o.produtoId)}</span>${marca(y)}</li>`).join('')}<li>${ver}</li></ol>` : '';
  return `<article class="op-card${livre ? '' : ' ocupada'}" id="op-prox"><div class="op-top"><span class="op-rot">${rot}</span>${o.prazo ? opSeloPrazo(x) : ''}</div>
    <div class="op-quem">${opFoto(x.p)}<div>${opNomeOrdem(o)}<div class="op-sub">${[x.p ? horasFmt(x.horas) : '', o.prazo ? 'prazo ' + esc(opDia(o.prazo)) : 'termina ' + opQuandoCurto(x.fim)].filter(Boolean).join(' · ')}</div>${sub ? `<div class="op-sub op-uma">${sub}</div>` : ''}</div></div>
    ${opFios(mat.por.get(o.id))}${falhasDaOrdem(o) ? `<div class="op-marcas">${opSeloFalhou(o)}</div>` : ''}${depois}
    <div class="op-acoes fim"><div class="op-sec">${opBtnAcao('Iniciar', 'opIniciar', o.id)}${opTemModelo(x.p) ? `<button type="button" class="btn ghost" data-id="${esc(x.p.id)}" title="${esc('Baixar ' + (x.p.arquivo.nome || 'o modelo'))}" onclick="opModelo(this.dataset.id)">${opSvg('modelo')}Modelo</button>` : ''}</div>${resto.length ? `<span class="op-ver-cel">${ver}</span>` : ''}</div></article>`;
}
/* Em acabamento: Pronto em cada ordem; Peças estragaram, Voltar para a fila, Editar e Excluir no "Mais opções". */
function opCardAcabamento(acab, onde) {
  const max = opAcabTodos ? 99 : onde === 'painel' ? 2 : 3, lista = acab.length === max + 1 && onde !== 'painel' ? acab : acab.slice(0, max);
  const li = o => {
    const p = byId('produtos', o.produtoId), c = byId('clientes', o.clienteId), st = statusPrazo(o);
    const quem = [...new Set((p ? linhasMaoObra(p) : []).map(l => (byId('pessoas', l.pessoaId) || {}).nome).filter(Boolean))].map(esc).join(', ');
    const sub = [p && p.etapasAcabamento ? esc(p.etapasAcabamento) : '', quem, o.fimImpressaoEm ? `<span class="nowrap">${opHa(o.fimImpressaoEm)}</span>` : '', c ? esc(c.nome) : '',
      o.prazo && st === 'ok' ? `<span class="nowrap">prazo ${esc(opDia(o.prazo))}</span>` : ''].filter(Boolean).join(' · ');
    return `<li><div><b>${nf(o.qtd)}× ${opProduto(o.produtoId)}</b>${st === 'atrasada' ? ' ' + selo('Atrasada', 'bad') : st === 'hoje' ? ' ' + selo('Vence hoje', 'warn') : ''}${sub ? `<div class="op-sub">${sub}</div>` : ''}</div>
      <div class="op-bts">${opBtnAcao('Pronto', 'opAcabamentoPronto', o.id, 'ghost', 'title="As peças entram no estoque de prontas"')}${opBtnMais('acab', o.id)}</div></li>`;
  };
  const resto = acab.length - lista.length;
  return `<article class="op-card" id="op-emacab"><div class="op-top"><span class="op-rot">Em acabamento</span>${acab.length ? selo(opPl(soma(acab, 'qtd'), 'peça', 'peças')) : ''}</div>${acab.length
    ? `<ul class="op-ac">${lista.map(li).join('')}</ul>${resto > 0 ? (onde === 'painel' ? `<a class="op-ver" href="#producao">Ver ${resto === 1 ? 'a outra' : 'as outras ' + nf(resto)}</a>`
      : `<div class="op-acoes fim"><button type="button" class="btn ghost" onclick="opAcabTodos = true; opRenderDaqui()">Mostrar ${resto === 1 ? 'a outra' : 'as outras ' + nf(resto)}</button></div>`) : ''}`
    : '<p class="op-vazio">Nada esperando. Quando a impressão de um produto com acabamento termina, ele aparece aqui.</p>'}</article>`;
}
/* onde: 'painel' | 'producao'. Livre: no meio, a primeira da fila; à esquerda, a que vem depois dela. */
function opBloco(onde) {
  const fila = filaProducao(), imp = fila.filter(x => x.o.status === 'imprimindo'), naFila = fila.filter(x => x.o.status === 'fila'), mat = materialDaFila(), acab = ordensEmAcabamento();
  const livre = !imp.length, comAcab = acab.length > 0 || S.produtos.some(p => p.acabamento);
  const centro = livre ? opCardLivre(naFila[0], mat) : imp.length === 1 ? opCardImpressora(imp[0], naFila[0], mat) : opCardVarias(imp);
  const esq = livre && !naFila.length ? '' : livre ? opCardProxima(naFila[1], naFila.slice(2), mat, true, naFila.length) : opCardProxima(naFila[0], naFila.slice(1), mat, false, naFila.length);
  return `<section class="op-agora em-${onde}${comAcab ? '' : ' dois'}${esq ? '' : ' sem-prox'}${acab.length ? ' tem-acab' : ''}" id="op-agora" aria-label="Agora na impressora">${esq}${centro}${comAcab ? opCardAcabamento(acab, onde) : ''}</section>`;
}
/* "Mais opções" de uma ordem do bloco: o que hoje está na linha da tabela continua aqui, em botões grandes. */
function opMais(id, tipo) {
  const o = byId('ordens', id);
  if (!o) return render();
  const p = byId('produtos', o.produtoId), modelo = opTemModelo(p) ? [{ rotulo: 'Baixar o modelo 3D', fn: () => opModelo(p.id) }] : [];
  const editar = { rotulo: 'Editar a ordem', fn: () => opEditarOrdem(id) }, excluir = { rotulo: 'Excluir a ordem', cls: 'danger', fn: () => opExcluirOrdem(id) };
  const itens = tipo === 'acab'
    ? [{ rotulo: 'Peças estragaram: imprimir de novo', fn: () => opRefazer(id) }, { rotulo: 'Voltar para a fila (marquei por engano)', fn: () => opVoltarFila(id) }, editar, excluir]
    : tipo === 'fila' ? [editar, ...modelo, excluir]
      : [editar, ...modelo, { rotulo: 'Voltar para a fila', fn: () => opVoltarFila(id) }, excluir];
  perguntar(opOrdemTxt(o), 'O que fazer com esta ordem?', [...itens, { rotulo: 'Fechar' }]);
}
function opModelo(id) {
  const p = byId('produtos', id);
  if (!p || !opTemModelo(p)) return toast('Este produto não tem modelo 3D guardado.');
  cadBaixarModelo(id);
  toast('Baixando ' + (p.arquivo.nome || 'o modelo') + '.');
}
/* Escolher outra para vir agora (falta filamento para a próxima): as ordens da fila em botões grandes, com o filamento de cada
   uma se ela começasse agora; a escolhida passa para a frente (com Desfazer). */
function opEscolherOutra() {
  const fila = filaProducao(), naFila = fila.filter(x => x.o.status === 'fila'), imp = fila.find(x => x.o.status === 'imprimindo');
  if (naFila.length < 2) return toast('Não há outra ordem na fila.');
  const cores = x => (x && x.p ? (x.p.materiais || []).map(k => k.filamentoId).sort().join() : ''), atual = cores(imp);
  abrirModal(`<p class="pergunta-txt" style="margin-bottom:12px">A escolhida passa para a frente da fila.</p><div class="op-escolhas">${naFila.map((x, i) => `<button type="button" class="op-esc" data-id="${esc(x.o.id)}" data-i="${i}" onclick="opEscolher(this.dataset.id)">${opFoto(x.p, 'pq')}
    <span class="op-esc-t"><b>${nf(x.o.qtd)}× ${opProduto(x.o.produtoId)}</b><span class="op-sub">${[x.p ? horasFmt(x.horas) : '', x.o.prazo ? 'prazo ' + esc(opDia(x.o.prazo)) : ''].filter(Boolean).join(' · ')}</span>${opFios({ fils: gastoSeIniciar(x.o).fils, ins: [] })}</span>
    <span class="op-esc-selos">${i === 0 ? selo('É a próxima', 'info') : ''}${x.prazo === 'atrasada' ? selo('Atrasada', 'bad') : x.prazo === 'hoje' ? selo('Vence hoje', 'warn') : ''}${atual && cores(x) === atual ? selo('Mesma cor da atual', 'ok') : ''}</span></button>`).join('')}</div>`, { title: 'Qual vem agora?' });
}
function opEscolher(id) { fecharModal(); opFrente(id); }

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
/* ---------- Painel: Precisa de atenção, Contas e Material acabando, com o botão que resolve ----------
   Os avisos são os de sempre (alertas(), em calc.js): os de ordem, manutenção, sugestão, estoque negativo e alíquota ficam em
   Precisa de atenção (mais os orçamentos aprovados sem ordens); os de conta, em Contas; os de filamento e insumo, em Material
   acabando. Cada linha tem o botão que resolve: Feito, Na frente, Pronto, Criar ordem, Produzir, Pagar e Receber (Feito,
   Produzir, Pagar e Receber abrem as janelas de sempre); o resto abre a tela do aviso. No celular as listas ficam embaixo do
   bloco, e três ícones no alto do Painel pulam até elas. */
const opListaAberta = {};                // "Ver mais" de cada lista (vale até recarregar)
const opNoCelular = () => matchMedia('(max-width:860px)').matches;
/* Mostra 5 (4 no celular); se só sobraria uma escondida, mostra todas. */
const opMaxLista = total => { const m = opNoCelular() ? 4 : 5; return total === m + 1 ? total : m; };
function opAlternarLista(k) { opListaAberta[k] = !opListaAberta[k]; opRenderDaqui(); }
/* Linha de uma lista: { tom: 'bad' | 'warn' | '', titulo (HTML), sub (HTML), b: { rotulo, fn, id, qtd, cod }, link: tela } */
function opLinhaLista(x) {
  const extra = x.b && x.b.qtd !== undefined ? ` data-qtd="${esc(x.b.qtd)}" data-cod="${esc(x.b.cod || '')}"` : '';
  const b = x.b ? `<button type="button" class="btn ghost sm op-acao" data-id="${esc(x.b.id)}"${extra} onclick="${x.b.fn}(this.dataset.id${extra ? ', this.dataset.qtd, this.dataset.cod' : ''})">${x.b.rotulo}</button>`
    : x.link ? `<a class="btn ghost sm" href="#${esc(x.link)}">Abrir</a>` : '';
  return `<li class="${x.tom || ''}"><div class="op-t"><b>${x.titulo}</b><small>${x.sub}</small></div>${b}</li>`;
}
/* "Ver mais" nunca fica onde aparece o botão da linha seguinte (o segundo toque cairia nele): no computador fica no alto da lista,
   à direita (o aviso fica no canto de baixo à esquerda); no celular, embaixo e à esquerda (o aviso fica no alto), em cima do
   texto da linha que aparece. */
function opBlocoLista(id, titulo, itens, k, vazioTxt, direita = '') {
  const max = opListaAberta[k] ? itens.length : opMaxLista(itens.length), graves = itens.some(x => x.tom === 'bad');
  const mais = cls => (itens.length > opMaxLista(itens.length) ? `<button type="button" class="${cls}" onclick="opAlternarLista('${k}')">${opListaAberta[k] ? 'Mostrar menos' : 'Ver mais ' + nf(itens.length - opMaxLista(itens.length))}</button>` : '');
  return `<section class="panel op-bloco" id="${id}"><div class="panel-head"><h2>${titulo}${itens.length ? ` <small class="${graves ? 'neg' : ''}">${nf(itens.length)}</small>` : ''}</h2>${direita || mais('op-mais-topo') ? `<div class="op-dir">${direita}${mais('op-mais-topo')}</div>` : ''}</div>${itens.length
    ? `<ul class="op-lista">${itens.slice(0, max).map(opLinhaLista).join('')}</ul>${mais('op-mais')}`
    : `<div class="op-certo">${opSvg('ok')}<span>${vazioTxt}</span></div>`}</section>`;
}
/* Ordem: o mais grave primeiro; no empate, a ordem destes tipos. */
const opPeso = { 'manut-vencida': 0, atrasada: 0.1, negativo: 0.2, hoje: 1, orcamento: 1.1, estoura: 2, minimo: 4, 'manut-proxima': 5, aliquota: 6 };
function opItensAtencao() {
  const fila = filaProducao(), primeira = (fila.find(x => x.o.status === 'fila') || { o: {} }).o.id, sug = new Map(sugestoesProducao().map(s => [s.p.id, s])), r = [];
  alertas().forEach(a => {
    if (a.k === 'atrasada' || a.k === 'hoje' || a.k === 'estoura') {
      const o = byId('ordens', a.id);
      if (!o) return;
      // a que imprime e a primeira da fila já estão no bloco, acima: a linha leva à Produção
      const b = o.status === 'fila' && o.id !== primeira ? { rotulo: 'Na frente', fn: 'opFrente', id: o.id } : o.status === 'acabamento' ? { rotulo: 'Pronto', fn: 'opAcabamentoPronto', id: o.id } : null;
      const onde = o.status === 'acabamento' ? ' · em acabamento' : o.status === 'imprimindo' ? ' · imprimindo' : '';
      r.push({ k: a.k, tom: a.k === 'atrasada' ? 'bad' : 'warn', titulo: esc(opOrdemTxt(o)), b, link: a.pg,
        sub: esc((a.k === 'atrasada' ? 'atrasada · prazo ' + opDia(o.prazo) : a.k === 'hoje' ? 'vence hoje' : 'pela fila passa do prazo (' + opDia(o.prazo) + ')') + onde) });
    } else if (a.k === 'manut-vencida' || a.k === 'manut-proxima') {
      const i = byId('manutItens', a.id);
      if (!i) return;
      const s = statusManutencao(i);
      r.push({ k: a.k, tom: a.k === 'manut-vencida' ? 'bad' : '', titulo: esc(i.nome), b: { rotulo: 'Feito', fn: 'opFeito', id: i.id },
        sub: a.k === 'manut-vencida' ? `manutenção vencida · ${nf(s.usadoH)} h de ${nf(i.intervaloH)} h` : `manutenção daqui a ${nf(s.faltaH)} h` });
    } else if (a.k === 'minimo') {
      const s = sug.get(a.id);
      if (!s) return;
      r.push({ k: a.k, tom: '', titulo: esc(`${nf(s.falta)}× ${s.p.nome}`), b: { rotulo: 'Criar ordem', fn: 'opCriarDaSugestao', id: s.p.id, qtd: s.falta, cod: codigoSugestao(s.p.id) },
        sub: `produzir: tem ${nf(s.estoque)}, mínimo ${nf(s.minimo)}${s.emProducao ? `, ${nf(s.emProducao)} em produção` : ''}` });
    } else if (a.k === 'negativo') {
      const p = byId('produtos', a.id);
      if (p) r.push({ k: a.k, tom: 'bad', titulo: esc(p.nome), sub: `estoque negativo (${nf(p.estoque)})`, link: a.pg });
    } else if (a.k === 'aliquota') r.push({ k: a.k, tom: '', titulo: 'Alíquota do Simples', sub: `confirme com o contador (hoje ${pct(S.config.imposto)})`, link: a.pg });
  });
  // orçamento aprovado que ainda não virou ordem (ninguém via): Produzir abre a pergunta de sempre
  if (typeof comStatusOrc === 'function') S.orcamentos.forEach(o => {
    if (comStatusOrc(o) !== 'aprovado' || o.ordensGeradas || comOrcVendido(o) || !(o.itens || []).some(i => byId('produtos', i.produtoId))) return;
    const cli = comClienteOrc(o);
    r.push({ k: 'orcamento', tom: 'warn', titulo: esc(`Orçamento nº ${o.numero}${cli ? ' · ' + cli : ''}`), sub: `aprovado, sem ordens · ${brl(totalOrcamento(o).total)}`, b: { rotulo: 'Produzir', fn: 'comProduzirOrcamento', id: o.id } });
  });
  return r.map((x, i) => [x, i]).sort((a, b) => opPeso[a[0].k] - opPeso[b[0].k] || a[1] - b[1]).map(x => x[0]);
}
/* Contas: a pagar vencidas, de hoje e dos próximos 7 dias; a receber atrasadas e de hoje. */
function opItensContas() {
  const lim = addDias(hoje(), 7), ordem = { vencida: 0, hoje: 1, aberta: 2 };
  return S.contas.filter(c => {
    if (c.pagoEm) return false;
    const st = situacaoConta(c);
    return c.tipo === 'pagar' ? st === 'vencida' || st === 'hoje' || (st === 'aberta' && !!c.vencimento && c.vencimento <= lim) : c.tipo === 'receber' && (st === 'vencida' || st === 'hoje');
  }).map(c => ({ c, st: situacaoConta(c) }))
    .sort((a, b) => ((a.st === 'aberta') - (b.st === 'aberta')) || ((a.c.tipo !== 'pagar') - (b.c.tipo !== 'pagar')) || ordem[a.st] - ordem[b.st] || opCmp(String(a.c.vencimento), String(b.c.vencimento)))
    .map(({ c, st }) => {
      const pagar = c.tipo === 'pagar', cli = byId('clientes', c.clienteId);
      const quando = st === 'vencida' ? (pagar ? 'venceu ' : 'atrasada, era ') + opDia(c.vencimento) : st === 'hoje' ? (pagar ? 'vence hoje' : 'para receber hoje') : 'vence ' + opDia(c.vencimento);
      return { tom: st === 'vencida' ? (pagar ? 'bad' : 'warn') : st === 'hoje' ? 'warn' : '', pagar, st, valor: num(c.valor), titulo: esc(c.descricao || 'Conta'),
        sub: `<span class="num${pagar ? '' : ' pos'}">${brl(c.valor)}</span> · ${esc(quando)}${cli ? ' · ' + esc(cli.nome) : ''}`, b: { rotulo: pagar ? 'Pagar' : 'Receber', fn: 'ctaPagar', id: c.id } };
    });
}
/* Filamento e insumo no limite do aviso (o mesmo de hoje: 200 g por padrão e o mínimo de cada insumo). */
function opItensMaterial() {
  return alertas().filter(a => a.k === 'filamento' || a.k === 'insumo').map(a => {
    const fil = a.k === 'filamento', r = byId(fil ? 'filamentos' : 'insumos', a.id);
    if (!r) return null;
    const tem = num(fil ? r.estoqueG : r.estoque), acabou = tem <= 0;
    return { tom: acabou ? 'bad' : 'warn', titulo: (fil ? cor(r.cor) : '') + esc(r.nome), link: a.pg,
      sub: (acabou ? '<span class="neg">acabou</span>' : `<span class="aviso">tem ${fil ? gramas(tem) : nf(tem, 2) + ' ' + esc(r.unidade || 'un')}</span>`) +
        (fil ? ` · aviso em ${gramas(S.config.alertaEstoque)}` : ` · mínimo ${nf(r.minimo, 2)}`) };
  }).filter(Boolean).sort((a, b) => (a.tom === 'bad' ? 0 : 1) - (b.tom === 'bad' ? 0 : 1));
}
/* No celular as listas ficam embaixo do bloco: estes ícones pulam até elas. */
function opIrBloco(id) {
  const b = document.getElementById(id);
  if (b) window.scrollTo({ top: b.getBoundingClientRect().top + scrollY - 74, behavior: typeof visMovimento !== 'undefined' && visMovimento ? 'smooth' : 'auto' });
}
const opSalto = (id, ic, rotulo, n, grave) => (n ? `<button type="button" class="op-salto" aria-label="${rotulo}: ${n}" onclick="opIrBloco('${id}')">${icone(ic)}<em class="pill${grave ? '' : ' calma'}">${n > 99 ? '99' : n}</em></button>` : '');
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
/* O formulário de venda mora em views-comercial.js; se ele não estiver carregado, só abre a tela. */
function opAbrirVenda() {
  if (typeof comNovaVenda === 'function') comNovaVenda(); else ir('vendas');
}
/* Painel: a impressora na frente (o bloco), depois as listas com o botão que resolve, os números do mês, as metas e as últimas
   vendas. */
VIEWS.painel = function () {
  const mes = mesAtual(), rv = resumoVendas(vendasDoMes(mes)), fila = filaProducao();
  const prontas = soma(S.produtos, p => Math.max(0, num(p.estoque))), comEstoque = S.produtos.filter(p => num(p.estoque) > 0).length;
  const atencao = opItensAtencao(), contas = opItensContas(), material = opItensMaterial();
  const aPagar = contas.filter(x => x.pagar && x.st !== 'aberta');
  const saltos = `<div class="op-saltos" role="group" aria-label="Ir para">${opSalto('op-atencao', 'falhas', 'Precisa de atenção', atencao.length, atencao.some(x => x.tom === 'bad'))}${opSalto('op-contas', 'contas', 'Contas', contas.length, contas.some(x => x.tom === 'bad'))}${opSalto('op-material', 'filamentos', 'Material acabando', material.length, material.some(x => x.tom === 'bad'))}</div>`;
  return `<div class="head op-head"><div><h1>Painel</h1><p>Resumo de ${esc(nomeMesLongo(mes))}</p></div><div class="head-acoes">${saltos}</div></div>` +
    (!S.filamentos.length && !S.produtos.length ? opPainelPassos() : '') +
    opBloco('painel') +
    `<div class="op-blocos"><div class="op-col">${opBlocoLista('op-atencao', 'Precisa de atenção', atencao, 'atencao', 'Tudo em dia.')}</div>
      <div class="op-col">${opBlocoLista('op-contas', 'Contas', contas, 'contas', 'Nada para pagar nos próximos 7 dias.',
        aPagar.length ? `<span class="txt-sm muted">até hoje: <b class="num">${brl(soma(aPagar, 'valor'))}</b></span>` : '<a class="link txt-sm" href="#contas">Ver todas</a>')}
      ${opBlocoLista('op-material', 'Material acabando', material, 'material', 'Nenhum filamento ou insumo no limite do aviso.')}</div></div>
    <div class="cards">
      ${kpi('Faturamento do mês', brl(rv.bruto), opPl(rv.qtd, 'peça vendida', 'peças vendidas'))}
      ${kpi('Lucro do mês', brl(rv.lucro), 'margem ' + pct(rv.margem), rv.lucro > 0 ? 'pos' : rv.lucro < 0 ? 'neg' : '')}
      ${kpi('Na impressora e na fila', opPl(soma(fila, x => x.o.qtd), 'peça', 'peças'), fila.length ? 'termina ' + dataHora(Math.max(...fila.map(x => x.fim))) : 'fila vazia')}
      ${kpi('Peças prontas', nf(prontas), opPl(comEstoque, 'produto com estoque', 'produtos com estoque'), prontas < 0 ? 'neg' : '')}
    </div>
    <div class="cols">${opPainelMetas(rv)}${opPainelVendas()}</div>`;
};

/* ---------- Tela: Produção ---------- */
const opSeta = (o, dir, pode) => {
  const txt = (dir < 0 ? 'Subir' : 'Descer') + ' na fila';
  return `<button type="button" class="btn ghost sm" data-id="${esc(o.id)}" data-mover="${dir}" onclick="opMover(this.dataset.id, ${dir})" title="${txt}" aria-label="${txt}"${pode ? '' : ' disabled'}>${dir < 0 ? '↑' : '↓'}</button>`;
};
/* Uma ordem da fila (a que imprime fica no bloco, acima). destaque: Iniciar em vermelho na primeira da fila com a impressora
   livre. r: o que ela gasta de cada filamento, já descontando o que as ordens da frente (e a que imprime) vão usar
   (materialDaFila): um visto, ou "falta 15 g". */
function opLinhaFila(x, naFila, destaque, r) {
  const o = x.o, cliente = byId('clientes', o.clienteId);
  const sub = [cliente ? esc(cliente.nome) : '', esc(o.obs)].filter(Boolean).join(' · ');
  /* a ordem já tem falha registrada (aqui ou no outro aparelho): quem vai registrar outra vê antes */
  const seloFalhou = opSeloFalhou(o), falhou = seloFalhou ? `<div>${seloFalhou}</div>` : '';
  const i = naFila.indexOf(x);
  const acoes = `<div class="rowbtns">${opBtn('Iniciar', 'opIniciar', o.id, destaque ? '' : 'ghost')}${opSeta(o, -1, i > 0)}${opSeta(o, 1, i >= 0 && i < naFila.length - 1)}${opBtn('Editar', 'opEditarOrdem', o.id)}${opBtn('Excluir', 'opExcluirOrdem', o.id, 'danger')}</div>`;
  return `<tr>
    <td${opColNome}><b>${opProduto(o.produtoId)}</b>${sub ? `<small>${sub}</small>` : ''}${o.status === 'imprimindo' ? `<div>${selo('Imprimindo', 'info')}</div>` : ''}${falhou}</td>
    <td class="right num">${nf(o.qtd)}</td>
    <td class="right num">${x.p ? horasFmt(x.horas) : '—'}</td>
    <td class="op-mat">${opFios(r) || '<span class="muted">—</span>'}</td>
    <td class="num">${dataHora(x.fim)}</td>
    <td>${opPrazo(x)}</td>
    <td>${acoes}</td></tr>`;
}
function opLinhaFeita(o) {
  /* quem passou pelo acabamento volta para "Em acabamento" ao reabrir; as outras voltam a imprimir ou para a fila */
  const sub = [o.passouAcabamento ? 'Passou pelo acabamento' : '', esc(o.obs)].filter(Boolean).join(' · ');
  const reabrir = opBtn('Reabrir', 'opReabrir', o.id, 'ghost', o.passouAcabamento ? 'Volta para Em acabamento' : 'Volta a imprimir ou para a fila');
  return `<tr>
    <td class="num">${esc(dataBR(o.fim))}</td>
    <td${opColNome}><b>${opProduto(o.produtoId)}</b>${sub ? `<small>${sub}</small>` : ''}</td>
    <td class="right num">${nf(o.qtd)}</td>
    <td class="right num">${gramas(soma(o.consumo, 'g'))}</td>
    <td class="right num">${brl(num(o.custoUnit) * num(o.qtd))}</td>
    <td>${nomeDe('clientes', o.clienteId)}</td>
    <td><div class="rowbtns">${reabrir}${opBtn('Editar', 'opEditarOrdem', o.id)}${opBtn('Excluir', 'opExcluirOrdem', o.id, 'danger')}</div></td></tr>`;
}
/* Produção: o bloco (o que imprime, a próxima e o acabamento, com os botões), as sugestões, a fila com o filamento de cada ordem
   e as concluídas. */
VIEWS.producao = function () {
  const fila = filaProducao(), naFila = fila.filter(x => x.o.status === 'fila'), mat = materialDaFila(), sug = sugestoesProducao();
  const feitas = opRecentes(S.ordens.filter(o => o.status === 'concluido'), 'fim');
  const resumo = naFila.length ? `${opPl(naFila.length, 'ordem', 'ordens')} · a fila toda termina ${dataHora(Math.max(...fila.map(x => x.fim)))}` : '';
  const proxima = naFila.length && naFila.length === fila.length ? naFila[0] : null;   // nada imprimindo: a primeira da fila é a próxima
  return head('Produção', 'A previsão considera a impressora rodando sem parar, uma ordem por vez.', opBtnNovaOrdem) +
    opBloco('producao') +
    (sug.length ? `<div class="panel" id="op-sug"><h2>Sugestões de produção <small>${opPl(sug.length, 'produto abaixo', 'produtos abaixo')} do estoque mínimo</small></h2>${opListaSugestoes(sug)}</div>` : '') +
    `<div class="panel" id="op-fila"><h2>Fila da impressora${resumo ? ` <small>${resumo}</small>` : ''}</h2>${naFila.length
      ? tabela(['Produto', { t: 'Qtd', r: 1 }, { t: 'Tempo', r: 1 }, 'Filamento', 'Previsão de término', 'Prazo', ''], naFila.map(x => opLinhaFila(x, naFila, x === proxima, mat.por.get(x.o.id))).join(''))
      : fila.length ? '<p class="op-vazio">Nada na fila depois do que está imprimindo.</p>' : opVazioFila()}</div>` +
    `<div class="panel" id="op-feitas"><h2>Concluídas${feitas.length > 30 ? ` <small>as 30 mais recentes de ${nf(feitas.length)}</small>` : ''}</h2>${feitas.length
      ? tabela(['Data', 'Produto', { t: 'Qtd', r: 1 }, { t: 'Filamento usado', r: 1 }, { t: 'Custo', r: 1 }, 'Cliente', ''], feitas.slice(0, 30).map(o => opLinhaFeita(o)).join(''))
      : vazio('Nenhuma ordem concluída ainda. Quando a impressão terminar, clique em Concluir para as peças entrarem no estoque.')}</div>`;
};

/* ---------- Desfazer (8 s, no aviso) ----------
   Cada ação guarda a ordem como estava antes e como ficou; o Desfazer devolve o estoque com as funções de sempre
   (reabrirOrdem, excluirOrdem...) e põe de volta o que era cada campo mexido pela ação ou por essa volta (desfazer um Concluir
   mantém a hora de início). Se a ordem já não está como a ação deixou (aqui ou no outro aparelho), nada é desfeito. */
const opJaMudou = () => { opRender(); toast('Isto já mudou depois. Nada foi desfeito.', 'bad'); };
/* volta(a): devolve o estoque (reabrirOrdem). antes e depois: cópias da ordem antes e depois da ação. Se, nesse meio-tempo, o
   outro aparelho iniciou outra ordem ou usou as peças que a ação pôs no estoque, pergunta antes, como o Iniciar e o Reabrir. */
function opDesfazerOrdem(id, antes, depois, volta, msg) {
  const a = byId('ordens', id);
  if (!a || a.status !== depois.status) return opJaMudou();
  const avisos = opAvisosDesfazer(a, antes, depois, [id]);
  if (avisos.length && !confirmar(`${avisos.join('\n\n')}\n\nDesfazer mesmo assim?`)) return;
  opVoltarCampos(a, antes, depois, volta);
  opRender();
  toast(msg);
}
/* O que pode surpreender ao desfazer: outra ordem imprimindo (fora as que esta volta mexe) ou peças já usadas do estoque. */
function opAvisosDesfazer(a, antes, depois, ids) {
  const avisos = [], outra = antes.status === 'imprimindo' && S.ordens.find(x => x.status === 'imprimindo' && !ids.includes(x.id));
  if (outra) avisos.push(`Já existe outra ordem imprimindo (${opOrdemTxt(outra)}). Desfazendo, as duas ficam imprimindo.`);
  if (depois.status === 'concluido' && antes.status !== 'concluido') { const neg = opAvisoNegativo(a).trim(); if (neg) avisos.push(neg); }
  return avisos;
}
/* Devolve o estoque (volta) e põe de volta cada campo que a ação mexeu (o que ninguém mexeu fica como está). */
function opVoltarCampos(a, antes, depois, volta) {
  const agora = copia(a);
  volta(a);
  const voltou = copia(a);
  new Set([...Object.keys(antes), ...Object.keys(depois), ...Object.keys(voltou)]).forEach(k => {
    if (k === 'id' || (iguais(antes[k], depois[k]) && iguais(agora[k], voltou[k]))) return;   // campo que ninguém mexeu fica como está
    if (k in antes) a[k] = copia(antes[k]); else delete a[k];
  });
  put('ordens', a);
}

/* Ações da fila */
/* Iniciar. Falta filamento (o estoque menos o que as que já imprimem vão gastar) ou a impressora está ocupada: pergunta antes,
   em botões grandes. passo: o que já foi respondido (1 = o filamento, 2 = a impressora ocupada). Na impressora ocupada, o cursor
   começa em "Deixar as duas imprimindo" (o OK de antes): concluir uma impressão pela metade só com um toque de propósito. */
function opIniciar(id, passo = 0) {
  const o = byId('ordens', id);
  if (!o || o.status !== 'fila') return render();
  if (passo < 1) {
    const falta = faltaParaIniciar(o);
    if (falta.length) {
      const partes = falta.map(x => `${gramas(x.falta)} de ${cor(x.f.cor)}<b>${esc(x.f.nome)}</b> (precisa ${gramas(x.g)})`);
      return perguntar('Falta filamento', `Para <b>${esc(opOrdemTxt(o))}</b> falta${falta.length > 1 ? 'm' : ''} ${partes.join(' e ')}.`, [
        { rotulo: 'Comprei ' + falta[0].f.nome, cls: '', fn: () => cadNovaCompra(falta[0].id) },
        { rotulo: 'Iniciar assim mesmo', fn: () => opIniciar(id, 1) },
        { rotulo: 'Cancelar' }]);
    }
  }
  const outra = passo < 2 && S.ordens.find(x => x.status === 'imprimindo' && x.id !== o.id);
  if (outra) {
    return perguntar('A impressora está ocupada', `<b>${esc(opOrdemTxt(outra))}</b> está imprimindo.`, [
      { rotulo: 'Concluir a atual e iniciar esta', cls: '', fn: () => opConcluirEIniciar(outra.id, id) },
      { rotulo: 'Deixar as duas imprimindo', fn: () => opIniciar(id, 2), foco: true },
      { rotulo: 'Cancelar' }]);
  }
  const antes = copia(o), marca = marcaDesfazer();
  iniciarOrdem(o);
  const depois = copia(o);
  opRender();
  avisoDesfazer('Impressão iniciada: ' + opOrdemTxt(o) + '.', marca,
    () => opDesfazerOrdem(id, antes, depois, a => reabrirOrdem(a, 'fila'), 'Desfeito: a ordem voltou para a fila.'));
}
/* Concluir uma ordem que iniciou há menos de 2 minutos quase sempre é toque errado: pergunta antes (devolve true se perguntou).
   Não pergunta quando a impressão inteira leva até 6 minutos ou o produto não tem tempo cadastrado. */
function opComecouAgora(o, seguir) {
  const ms = Date.now() - (Date.parse(o.inicio) || 0), p = byId('produtos', o.produtoId);
  if (o.status !== 'imprimindo' || !o.inicio || ms > 120000 || !(p && num(p.horas) * num(o.qtd) > 0.1)) return false;
  const ha = ms < 60000 ? 'há ' + opPl(Math.max(1, Math.round(ms / 1000)), 'segundo', 'segundos') : 'há 1 minuto';
  perguntar('Iniciou agora mesmo', `<b>${esc(opOrdemTxt(o))}</b> iniciou ${ha}. Já terminou mesmo?`,
    [{ rotulo: 'Não, foi engano', foco: true }, { rotulo: 'Sim, concluir', cls: '', fn: seguir }]);
  return true;
}
/* Fim da impressão. Produto com acabamento: a ordem vai para "Em acabamento"; os outros: as peças entram no estoque. */
function opConcluir(id, certeza) {
  const o = byId('ordens', id);
  if (!o || !ORDEM_ATIVA(o)) return render();      // já impressa (em outro aparelho, por exemplo): só redesenha
  if (certeza !== true && opComecouAgora(o, () => opConcluir(id, true))) return;
  const temProduto = !!byId('produtos', o.produtoId), antes = copia(o), marca = marcaDesfazer();
  concluirOrdem(o);
  const depois = copia(o), usado = gramas(soma(o.consumo, 'g'));
  opRender();
  const msg = !temProduto ? 'Ordem concluída. O produto foi excluído, por isso o estoque não mudou.'
    : o.status === 'acabamento' ? `Impressão terminada: a ordem foi para Em acabamento. Filamento usado: ${usado}.`
      : `${opPl(o.qtd, 'peça entrou', 'peças entraram')} no estoque de prontas. Filamento usado: ${usado}.`;
  avisoDesfazer(msg, marca, () => opDesfazerOrdem(id, antes, depois, a => reabrirOrdem(a, antes.status === 'imprimindo' ? 'imprimindo' : 'fila'),
    antes.status === 'imprimindo' ? 'Desfeito: a ordem voltou a imprimir, com a mesma hora de início.' : 'Desfeito: a ordem voltou para a fila.'));
}
/* Concluir a que imprime e iniciar a próxima, em 1 clique: duas gravações separadas (se o outro aparelho já concluiu, o início
   da próxima entra assim mesmo). Desfazer volta as duas, conferindo antes se nada mudou. Na hora de fazer, confere de novo se
   outra ordem passou a imprimir (iniciada no outro aparelho com a pergunta ou a tela parada): então esta é concluída, como foi
   pedido, e a próxima pergunta antes (a impressora está ocupada). */
function opConcluirEIniciar(id, prox, certeza) {
  const o = byId('ordens', id), p = byId('ordens', prox);
  const jaConcluida = !!o && ORDEM_IMPRESSA(o);          // o outro aparelho concluiu antes (e a tela ainda não tinha mudado)
  if (!o || (o.status !== 'imprimindo' && !jaConcluida)) return render();
  if (!jaConcluida && certeza !== true && opComecouAgora(o, () => opConcluirEIniciar(id, prox, true))) return;
  const outra = !!p && p.status === 'fila' && S.ordens.find(x => x.status === 'imprimindo' && x.id !== id && x.id !== prox);
  if (outra) {
    if (!jaConcluida) opConcluir(id, true);
    else { opRender(); toast(`A ordem de ${opOrdemTxt(o)} já tinha sido concluída em outro aparelho.`, 'warn'); }
    return opIniciar(prox, 1);
  }
  const temProduto = !!byId('produtos', o.produtoId), antesA = copia(o), marca = marcaDesfazer();
  if (!jaConcluida) concluirOrdem(o);
  const depoisA = copia(o);
  novoGrupo();
  const inicia = !!p && p.status === 'fila', antesB = inicia ? copia(p) : null;
  if (inicia) iniciarOrdem(p);
  const depoisB = inicia ? copia(p) : null;
  opRender();
  if (jaConcluida && !inicia) return;
  const txtA = opOrdemTxt(antesA), txtB = inicia ? opOrdemTxt(p) : '';
  const feito = jaConcluida ? 'A ordem já tinha sido concluída em outro aparelho.' : !temProduto ? 'Ordem concluída.'
    : o.status === 'acabamento' ? `${txtA} foi para Em acabamento.` : `${opPl(o.qtd, 'peça entrou', 'peças entraram')} no estoque de prontas.`;
  avisoDesfazer(`${feito}${inicia ? ' Iniciou: ' + txtB + '.' : ''}`, marca, () => {
    const a = byId('ordens', id), b = inicia ? byId('ordens', prox) : null;
    if ((inicia && (!b || b.status !== 'imprimindo')) || (!jaConcluida && (!a || a.status !== depoisA.status))) return opJaMudou();
    const avisos = jaConcluida ? [] : opAvisosDesfazer(a, antesA, depoisA, [id, prox]);
    if (avisos.length && !confirmar(`${avisos.join('\n\n')}\n\nDesfazer mesmo assim?`)) return;
    // a próxima volta para a fila e a ordem volta a imprimir em gravações separadas: se a conclusão não valeu (o outro aparelho
    // já tinha concluído), a volta dela também não vale, e a da próxima vale assim mesmo
    if (b) { opVoltarCampos(b, antesB, depoisB, x => reabrirOrdem(x, 'fila')); novoGrupo(); }
    if (!jaConcluida) opVoltarCampos(a, antesA, depoisA, x => reabrirOrdem(x, 'imprimindo'));
    opRender();
    toast(jaConcluida ? 'Desfeito: a próxima voltou para a fila.' : `Desfeito: ${inicia ? 'a próxima voltou para a fila e ' : ''}a ordem voltou a imprimir, com a mesma hora de início.`);
  });
  // só uma das duas gravações não valeu (o outro aparelho mexeu antes): o aviso conta como as duas ordens ficaram, e o Desfazer
  // fica para a parte que entrou
  const gs = FILA.filter(g => g.n > marca), gA = gs.find(g => g.ops.has('ordens/' + id)), gB = gs.find(g => g.ops.has('ordens/' + prox));
  if (gA && gB) gA.explicar = gB.explicar = (recusas, naTela) => opExplicarConcluirEIniciar(recusas, naTela, { id, prox, gA, gB, txtA, txtB, feito, antesA, depoisA, antesB, depoisB });
}
/* A ordem recusada é lida da cópia do banco (como o outro aparelho a deixou: na tela ela ainda pode estar com um Desfazer daqui que
   não vai valer); a outra, da tela (com o Desfazer daqui, se houve). */
function opExplicarConcluirEIniciar(recusas, naTela, x) {
  if (recusas.length !== 1) return false;                         // as duas não valeram: o aviso de sempre
  const doBanco = id => (BASE.get('ordens/' + id) || {}).d || null, deA = recusas[0].g === x.gA;
  const a = deA ? doBanco(x.id) : byId('ordens', x.id), b = deA ? byId('ordens', x.prox) : doBanco(x.prox);
  const imp = S.ordens.filter(o => o.id !== x.id && o.id !== x.prox && o.status === 'imprimindo').length + [a, b].filter(o => o && o.status === 'imprimindo').length;
  const duas = imp > 1 ? ` Agora há ${nf(imp)} ordens imprimindo: confira.` : '';
  if (deA) {
    // a conclusão não valeu; o início da próxima, sim (a não ser que já tenha sido desfeito)
    const situ = !a ? `Outro aparelho excluiu a ordem de ${x.txtA} pouco antes.` : ORDEM_IMPRESSA(a) ? `A ordem de ${x.txtA} já tinha sido concluída em outro aparelho.`
      : a.status === 'imprimindo' ? `Outro aparelho mexeu na ordem de ${x.txtA} pouco antes, e ela continua imprimindo.` : `Outro aparelho voltou a ordem de ${x.txtA} para a fila pouco antes.`;
    const iniciou = !!b && b.status === 'imprimindo' && b.inicio === x.depoisB.inicio;
    const msg = `${situ}${iniciou ? ` Iniciou: ${x.txtB}.` : b && b.status === 'fila' ? ` ${x.txtB} está na fila.` : ''}${duas}`;
    if (!iniciou || !naTela) { toast(msg, 'warn'); return true; }
    toast(msg, 'warn', { rotulo: 'Desfazer', grupos: [x.gB], fn: () => {
      const y = byId('ordens', x.prox);
      if (!y || y.status !== 'imprimindo') return opJaMudou();
      opVoltarCampos(y, x.antesB, x.depoisB, z => reabrirOrdem(z, 'fila'));
      opRender();
      toast('Desfeito: a próxima voltou para a fila.');
    } });
    return true;
  }
  // a conclusão valeu e o início da próxima não
  const msg = `${x.feito} ${x.txtB} não foi iniciada: outro aparelho mexeu nela pouco antes, e a tela já mostra como ela ficou.${duas}`;
  if (!a || a.status !== x.depoisA.status || !naTela) { toast(msg, 'warn'); return true; }
  toast(msg, 'warn', { rotulo: 'Desfazer', grupos: [x.gA], fn: () => opDesfazerOrdem(x.id, x.antesA, x.depoisA, z => reabrirOrdem(z, 'imprimindo'), 'Desfeito: a ordem voltou a imprimir, com a mesma hora de início.') });
  return true;
}
/* Passar na frente: só a posição desta ordem muda (fica menor que a de todas as que usam a impressora). Desfazer devolve o lugar. */
function opFrente(id) {
  const o = byId('ordens', id), fila = filaProducao().filter(x => x.o.status === 'fila');
  if (!o || o.status !== 'fila' || !fila.length || fila[0].o.id === id) return render();
  const antes = o.ordem, marca = marcaDesfazer();
  o.ordem = Math.min(...S.ordens.filter(ORDEM_ATIVA).map(x => num(x.ordem))) - 1;
  put('ordens', o);
  opRender();
  avisoDesfazer('Passou para a frente: ' + opOrdemTxt(o) + '. É a próxima.', marca, () => {
    const a = byId('ordens', id);
    if (!a || a.status !== 'fila') return opJaMudou();
    a.ordem = antes;
    put('ordens', a);
    opRender();
    toast('Desfeito: a ordem voltou para o lugar de antes.');
  });
}
/* Acabamento terminado: as peças entram no estoque de prontas (o material já tinha saído no fim da impressão). */
function opAcabamentoPronto(id) {
  const o = byId('ordens', id);
  if (!o || o.status !== 'acabamento') return render();
  const temProduto = !!byId('produtos', o.produtoId), antes = copia(o), marca = marcaDesfazer();
  concluirOrdem(o);
  const depois = copia(o);
  opRender();
  avisoDesfazer(temProduto ? `Acabamento pronto: ${opPl(o.qtd, 'peça entrou', 'peças entraram')} no estoque de prontas.` : 'Acabamento pronto. O produto foi excluído, por isso o estoque não mudou.',
    marca, () => opDesfazerOrdem(id, antes, depois, a => reabrirOrdem(a, 'acabamento'), 'Desfeito: a ordem voltou para Em acabamento.'));
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
/* Falhou em 3 toques (ordem imprimindo, de produto com filamento): o motivo em 8 botões, as gramas já calculadas pelo tempo
   impresso (à vista e dá para trocar: a estimativa pelo tempo pode não bater com a balança) e a saída no próprio botão:
   Imprimir de novo agora, Voltar para a fila ou Continua imprimindo. Cada filamento perdido vira uma falha com o código fixo
   da etapa de antes (codigoFalha: a ordem, o filamento e o n de quando a janela abriu, nCodigoFalha), e a perda dos dois
   filamentos de uma peça de duas cores conta como uma falha só. O cursor começa no primeiro motivo (no computador). Outra ordem,
   ou ordem sem filamento: a janela de sempre. */
const opMatsDaOrdem = (p, q) => {
  const m = new Map();
  (p.materiais || []).forEach(x => { if (byId('filamentos', x.filamentoId) && num(x.pesoG) > 0) m.set(x.filamentoId, num(m.get(x.filamentoId)) + num(x.pesoG) * q); });
  return [...m].map(([id, g]) => ({ f: byId('filamentos', id), id, g }));
};
function opFalhou(id, avulsaTambem) {
  const o = byId('ordens', id);
  if (!o) return render();
  const p = byId('produtos', o.produtoId), q = num(o.qtd), mats = p ? opMatsDaOrdem(p, q) : [];
  if (!mats.length || o.status !== 'imprimindo') { const m = p && (p.materiais || [])[0]; return opNovaFalha(o.produtoId, m ? m.filamentoId : '', o.id); }
  const x = filaProducao().find(y => y.o.id === id), a = opAndamento(x), fr = a.semConta ? 1 : Math.min(1, Math.max(0.02, a.pct / 100)), uma = opMatsDaOrdem(p, 1);
  // como a ordem estava ao abrir a janela: o código das falhas e a conferência de que nada mudou no outro aparelho
  const n0 = falhasDaOrdem(o), nCod = nCodigoFalha(o), vistos = codigosNaTela('falhas'), inicio0 = o.inicio;
  const mostra = f => mats.map(m => gramas(Math.round(m.g * f))).join(' + ');
  const ultima = S.falhas.filter(f => f.ordemId === o.id).sort((u, v) => String(v.criadoEm || '').localeCompare(String(u.criadoEm || '')))[0];
  const jaTem = !n0 ? '' : `<p class="aviso txt-sm" style="margin:0">Esta ordem já tem ${opPl(n0, 'falha registrada', 'falhas registradas')}${ultima
    ? `: a última, ${gramas(ultima.gramas)}${byId('filamentos', ultima.filamentoId) ? ' de ' + esc(byId('filamentos', ultima.filamentoId).nome) : ''}, ${opQuando(ultima)}` : ''}. Registre de novo só se for outra.</p>`;
  const chip = (i, html, modo, on) => `<button type="button" class="op-chip${on ? ' on' : ''}" data-i="${i}" data-modo="${modo}" onclick="opChipPerda(this)">${html}</button>`;
  const perdas = `<div class="op-rot2">Quanto se perdeu</div><div class="op-chips tres">${a.semConta ? '' : chip('t', `${pct(Math.round(fr * 100))} já impresso<small>${mostra(fr)}</small>`, 'peloTempo', true)}${q > 1 ? chip('u', `1 peça<small>${uma.map(m => gramas(m.g)).join(' + ')}</small>`, 'uma', false) : ''}${chip('a', `${q > 1 ? 'A ordem toda' : 'A peça inteira'}<small>${mostra(1)}</small>`, 'tudo', a.semConta)}</div>
    <div class="op-perdas">${mats.map((m, i) => `<div class="op-perda"><span>${cor(m.f.cor)}${esc(m.f.nome)} <span class="muted txt-sm">tem ${gramas(m.f.estoqueG)}</span></span><span class="op-un" data-un="g"><input type="text" inputmode="decimal" autocomplete="off" name="g${i}" data-num="1" data-perda="1" data-pelo-tempo="${m.g * fr}" data-uma="${(uma[i] || m).g}" data-tudo="${m.g}" aria-label="Gramas de ${esc(m.f.nome)}" value="${Math.round(m.g * fr)}"></span></div>`).join('')}</div>`;
  openForm({
    title: 'Falhou: ' + opOrdemTxt(o), saveLabel: 'Imprimir de novo agora', foco: 'op-motivo-1',
    extra: '<div class="op-rodape">E a ordem? Escolha e a falha já fica registrada.</div><button type="button" class="btn ghost op-manter" data-i="continua" onclick="opSaidaFalha(this.dataset.i)">Continua imprimindo</button><button type="button" class="btn ghost op-manter" data-i="fila" onclick="opSaidaFalha(this.dataset.i)">Voltar para a fila</button>',
    fields: [
      ...(avulsaTambem ? [{ type: 'html', html: '<div class="op-sub">Não foi esta? <button type="button" class="link" onclick="opFalhaAvulsa()">Registrar falha de outra peça</button></div>' }] : []),
      ...(jaTem ? [{ type: 'html', html: jaTem }] : []),
      { type: 'html', html: `<div class="op-rot2">O que aconteceu?</div><div class="op-chips" id="op-motivos">${opMotivos.map((m, i) => `<button type="button" class="op-chip"${i ? '' : ' name="op-motivo-1"'} data-i="m${i}" data-v="${esc(m)}" onclick="opChipMotivo(this)">${esc(m)}</button>`).join('')}</div>` },
      { type: 'html', html: perdas },
      { type: 'html', html: `<details class="op-det"><summary>Data e observação</summary><div class="grid"><div><label for="op-fdata">Data</label><input id="op-fdata" type="date" name="data" min="2000-01-01" max="2099-12-31" value="${hoje()}"></div><div><label for="op-fobs">Observação</label><input id="op-fobs" type="text" name="obs"></div></div></details><input type="hidden" name="motivo" value=""><input type="hidden" name="saida" value="denovo">` },
    ],
    save: (d, form) => {
      const el = form.elements, motivo = el.namedItem('motivo').value, saida = el.namedItem('saida').value || 'denovo';
      el.namedItem('saida').value = 'denovo';                         // o próximo Enter volta a ser o botão vermelho
      if (!motivo) { $('#op-motivos', form).classList.add('erro'); toast('Toque no que aconteceu.', 'bad'); return false; }
      const ls = mats.map((m, i) => ({ ...m, g: num(el.namedItem('g' + i).value) })).filter(m => m.g > 0);
      if (!ls.length) { toast('Informe quantos gramas se perderam.', 'bad'); return false; }
      // o outro aparelho já registrou esta mesma falha com a janela aberta: nada em dobro
      const codigos = ls.map(m => codigoFalha({ id }, m.id, nCod, vistos)), ja = codigos.map(c => byId('falhas', c)).find(Boolean);
      if (ja) {
        const f = byId('filamentos', ja.filamentoId);
        toast(`Outro aparelho já registrou esta falha (${gramas(ja.gramas)}${f ? ' de ' + f.nome : ''}) enquanto esta janela estava aberta. Nada foi gravado em dobro: confira em Falhas e registre de novo, se for outra.`, 'bad');
        return;
      }
      const at = byId('ordens', id);
      if (!at || at.status !== 'imprimindo' || at.inicio !== inicio0 || falhasDaOrdem(at) !== n0 || at.produtoId !== p.id || num(at.qtd) !== q) {
        toast('Outro aparelho mexeu nesta ordem enquanto esta janela estava aberta. Nada foi gravado: confira e registre de novo, se ainda precisar.', 'bad');
        return;
      }
      const antes = copia(at), marca = marcaDesfazer();
      // a saída da ordem primeiro, já com a contagem de falhas, numa gravação que confere a versão que este aparelho conhece (se o
      // outro aparelho mexeu na ordem antes, só ela não vale); depois as falhas e a baixa do filamento, numa gravação sem a
      // ordem, que entram de qualquer jeito (o filamento se perdeu). Continua imprimindo: a contagem sozinha (putContagem).
      const muda = saida !== 'continua';
      if (muda) { reabrirOrdem(at, 'fila'); if (saida === 'denovo') iniciarOrdem(at); at.falhas = n0 + 1; put('ordens', at); novoGrupo(); }
      const dados = { data: el.namedItem('data').value || hoje(), produtoId: p.id, motivo, obs: el.namedItem('obs').value.trim(), ordemId: id, contada: muda };
      const ids = [];
      ls.forEach((m, i) => ids.push(registrarFalha({ ...dados, id: codigos[i], filamentoId: m.id, gramas: m.g, evento: ids[0] || '' }).id));
      const depois = copia(byId('ordens', id) || at), feito = `Falha registrada (${gramas(soma(ls, 'g'))}, ${motivo}).`;
      avisoDesfazer(`${feito} ${saida === 'denovo' ? 'A impressão recomeçou agora.' : saida === 'fila' ? 'A ordem voltou para a fila.' : 'A ordem continua imprimindo.'}`,
        marca, () => opDesfazerFalha(id, ids, antes, depois));
      // a ordem tinha mudado no outro aparelho e este ainda não sabia: a falha entrou e só a saída da ordem não valeu. O aviso conta
      // isso (sem mandar repetir) e a falha que entrou continua com Desfazer
      const gs = FILA.filter(g => g.n > marca), gOrdem = muda ? gs.find(g => g.ops.has('ordens/' + id)) : null;
      const gFalha = gs.find(g => [...g.ops.keys()].some(k => k.startsWith('falhas/')));
      if (gOrdem && gFalha) gOrdem.explicar = gFalha.explicar = (recusas, naTela) => {
        if (recusas.length !== 1 || recusas[0].g !== gOrdem) return false;
        // a ordem como o outro aparelho a deixou (a cópia do banco); as falhas, como estão na tela (com o Desfazer daqui, se houve)
        const a = (BASE.get('ordens/' + id) || {}).d, vivas = ids.filter(n => byId('falhas', n));
        const ordem = !a ? 'Outro aparelho excluiu esta ordem pouco antes.' : `A ordem de ${opOrdemTxt(a)} não mudou: outro aparelho mexeu nela pouco antes, e a tela já mostra como ela ficou.`;
        if (!vivas.length) toast(`Desfeito: a falha saiu. ${ordem}`, 'warn');
        else if (!naTela) toast(`${feito} ${ordem}`, 'warn');
        else toast(`${feito} ${ordem}`, 'warn', { rotulo: 'Desfazer', grupos: [gFalha], fn: () => opDesfazerSoFalha(ids) });
        return true;
      };
    },
  });
  FORM.form.classList.add('op-falha');
}
function opChipMotivo(el) {
  const g = el.closest('.op-chips'), c = FORM && FORM.form && campoDoForm(FORM.form, 'motivo');
  $$('.op-chip', g).forEach(x => x.classList.toggle('on', x === el));
  g.classList.remove('erro');
  if (c) c.value = el.dataset.v;
  if (FORM) FORM.sujo = true;
}
function opChipPerda(el) {
  $$('.op-chip', el.closest('.op-chips')).forEach(x => x.classList.toggle('on', x === el));
  $$('[data-perda]', FORM.form).forEach(i => { i.value = paraCampo(Math.round(num(i.dataset[el.dataset.modo]))); validarNumero(i); });
  FORM.sujo = true;
}
/* A saída escolhida no rodapé: a falha já fica registrada com ela. */
function opSaidaFalha(saida) {
  const c = FORM && FORM.form && campoDoForm(FORM.form, 'saida');
  if (!c) return;
  c.value = saida;
  FORM.form.requestSubmit();
}
/* Desfazer o Falhou: as falhas saem (o filamento volta) e a ordem volta como estava, se nada mudou depois. As falhas e a ordem
   voltam em gravações separadas: se a saída da ordem não tinha valido (o outro aparelho mexeu nela antes), a volta dela também
   não vale (a ordem fica como o outro deixou), e a das falhas vale assim mesmo. */
function opDesfazerFalha(id, ids, antes, depois) {
  const b = byId('ordens', id);
  if (!b || b.status !== depois.status || b.inicio !== depois.inicio) return opJaMudou();
  ids.forEach(n => { const z = byId('falhas', n); if (z) excluirFalha(z); });
  novoGrupo();
  b.status = antes.status; b.inicio = antes.inicio;
  if ('falhas' in antes) b.falhas = antes.falhas; else delete b.falhas;
  put('ordens', b);
  opRender();
  toast('Desfeito: a falha saiu e a ordem voltou como estava.');
}
/* Desfazer só as falhas (a saída da ordem não tinha valido: ela ficou como o outro aparelho deixou). */
function opDesfazerSoFalha(ids) {
  const vivas = ids.map(n => byId('falhas', n)).filter(Boolean);
  if (!vivas.length) return opJaMudou();
  vivas.forEach(excluirFalha);
  opRender();
  toast('Desfeito: a falha saiu e o filamento voltou para o estoque.');
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
  const antes = copia(o), marca = marcaDesfazer();
  reabrirOrdem(o, 'fila');
  const depois = copia(o);
  opRender();
  avisoDesfazer('A ordem voltou para a fila.', marca,
    () => opDesfazerOrdem(id, antes, depois, a => reabrirOrdem(a, 'imprimindo'), 'Desfeito: a ordem voltou a imprimir, com a mesma hora de início.'));
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
/* Reabrir uma concluída, com duas saídas claras: Voltar a imprimir (guarda a hora em que ela iniciou: reabrirOrdem já faz isso)
   ou Voltar para a fila. A que passou pelo acabamento volta para ele (as peças saem do estoque e o material continua usado).
   Voltar a imprimir com outra ordem imprimindo (conferido na hora: o outro aparelho pode ter iniciado uma com a pergunta aberta)
   pergunta antes, como o Iniciar. */
function opReabrir(id) {
  const o = byId('ordens', id);
  if (!o || o.status !== 'concluido') return render();
  const texto = t => `<b>${esc(opOrdemTxt(o))}</b>: ${esc(t.replace(/\s*\n+\s*/g, ' '))}`;
  const volta = (st, msg, mesmoOcupada) => () => {
    const a = byId('ordens', id);
    if (!a || a.status !== 'concluido') { opRender(); return toast('Esta ordem mudou enquanto a pergunta estava aberta. Nada foi reaberto: confira a Produção.', 'bad'); }
    const outra = st === 'imprimindo' && !mesmoOcupada && S.ordens.find(x => x.status === 'imprimindo' && x.id !== id);
    if (outra) {
      return perguntar('A impressora está ocupada', `<b>${esc(opOrdemTxt(outra))}</b> está imprimindo.`, [
        { rotulo: 'Voltar para a fila', cls: '', fn: volta('fila', 'Ordem reaberta. Ela voltou para a fila.') },
        { rotulo: 'Deixar as duas imprimindo', fn: volta('imprimindo', msg, true) },
        { rotulo: 'Cancelar' }]);
    }
    reabrirOrdem(a, st);
    opRender();
    toast(msg);
  };
  if (o.passouAcabamento) {
    const q = num(o.qtd);
    return perguntar('Reabrir a ordem', texto(`${q === 1 ? 'A peça sai' : 'As ' + nf(q) + ' peças saem'} do estoque de prontas. O material continua usado.` + opAvisoNegativo(o)), [
      { rotulo: 'Voltar para o acabamento', cls: '', fn: volta('acabamento', 'Ordem reaberta. Ela voltou para Em acabamento.') },
      { rotulo: 'Cancelar' }]);
  }
  perguntar('Reabrir a ordem', texto(opAvisoDesfazer(o)), [
    ...(o.inicio ? [{ rotulo: `Voltar a imprimir (iniciou ${opQuandoHora(o.inicio)})`, cls: '', fn: volta('imprimindo', 'Ordem reaberta. Ela voltou a imprimir, com a mesma hora de início.') }] : []),
    { rotulo: 'Voltar para a fila', ...(o.inicio ? {} : { cls: '' }), fn: volta('fila', 'Ordem reaberta. Ela voltou para a fila.') },
    { rotulo: 'Cancelar' }]);
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
function opFormOrdem(o, produtoId, clienteId, qtd, sugestao) {
  if (!o && !S.produtos.length) { toast('Cadastre um produto primeiro.'); ir('produtos'); return; }
  /* código da ordem da sugestão: o que o botão levava, ou contado ao abrir a janela (vale só se o produto continuar o da
     sugestão) */
  const codSug = !o && sugestao && byId('produtos', produtoId) ? codigoDaSugestao(produtoId, sugestao) : '';
  let criarMesmoIgual = false;
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
        // nada em dobro: ordem igual que acabou de entrar (ou a desta sugestão, criada no outro aparelho) pergunta antes
        const daSug = codSug && d.produtoId === produtoId, sugUsada = daSug ? byId('ordens', codSug) : null;
        const igual = criarMesmoIgual ? null : sugUsada || ordemIgualRecente(d);
        criarMesmoIgual = false;
        if (igual) { opPerguntarIgual(igual, () => { criarMesmoIgual = true; FORM.form.requestSubmit(); }); return false; }
        const marca = marcaDesfazer();
        const n = novaOrdem({ ...d, id: daSug && !sugUsada ? codSug : '' });
        avisoDesfazer('Ordem criada. Ela entrou no fim da fila.', marca, () => {
          const a = byId('ordens', n.id);
          if (!a || a.status !== 'fila') return opJaMudou();
          excluirOrdem(a);
          opRender();
          toast('Desfeito: a ordem saiu da fila.');
        });
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
/* Ordem igual a uma que acabou de entrar (aqui ou no outro aparelho): pergunta com botões grandes antes de criar outra. O
   cursor (e o Enter) fica em "Não criar", o botão vermelho, embaixo, onde estava o Salvar no celular: nem o segundo Enter nem
   o segundo toque de quem apertou duas vezes no Salvar criam em dobro (escolha do dono, 27/11). Criar a repetida é de
   propósito: tocar em "Criar mais uma". Não criar avisa que nada entrou. */
function opPerguntarIgual(x, criar) {
  const min = Math.round((Date.now() - Date.parse(x.criadoEm || '')) / 60000);
  const quando = !(min >= 1) ? 'agora há pouco' : 'há ' + opPl(min, 'minuto', 'minutos');
  const situacao = { imprimindo: ' (já imprimindo)', acabamento: ' (já em acabamento)', concluido: ' (já concluída)' }[x.status] || '';
  perguntar('Ordem igual', `Acabou de entrar uma ordem igual: <b>${esc(opOrdemTxt(x))}</b>${x.clienteId ? ' para ' + nomeDe('clientes', x.clienteId) : ''}, criada ${quando}${situacao}. Criar mais uma?`, [
    { rotulo: 'Criar mais uma', fn: criar },
    { rotulo: 'Não criar', cls: '', foco: true, fn: () => { if (FORM) FORM.sujo = false; fecharForm(); toast('Nada foi criado. Fica só a ordem que já tinha entrado.'); } },
  ]);
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
  const botao = '<button type="button" class="btn" onclick="opRegistrarFalha()">+ Registrar falha</button>';
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
/* Quando um registro entrou, em palavras: "agora há pouco", "há 5 minutos", "há 2 horas" ou "em 20/11/2026". */
function opQuando(r) {
  const min = Math.round((Date.now() - Date.parse(r.criadoEm || '')) / 60000);
  if (!isFinite(min) || min >= 1440) return r.data ? 'em ' + dataBR(r.data) : 'há mais de um dia';
  return min < 1 ? 'agora há pouco' : min < 60 ? 'há ' + opPl(min, 'minuto', 'minutos') : 'há ' + opPl(Math.floor(min / 60), 'hora', 'horas');
}
/* "+ Registrar falha": com uma ordem imprimindo, já abre o Falhou dela (com o link para a falha de outra peça); com mais de uma,
   pergunta qual; sem nenhuma, a falha avulsa. */
function opRegistrarFalha() {
  if (!S.filamentos.length) { toast('Cadastre um filamento primeiro.'); ir('filamentos'); return; }
  const imp = S.ordens.filter(o => o.status === 'imprimindo');
  if (imp.length === 1) return opFalhou(imp[0].id, true);
  if (!imp.length) return opNovaFalha();
  perguntar('Qual falhou?', 'Há mais de uma ordem imprimindo.', [...imp.map(o => ({ rotulo: opOrdemTxt(o), fn: () => opFalhou(o.id) })), { rotulo: 'Outra peça', fn: () => opNovaFalha() }]);
}
function opFalhaAvulsa() { if (FORM) FORM.sujo = false; fecharForm(); opNovaFalha(); }
/* A janela de falha de sempre (avulsa, de um produto ou de uma ordem que não está imprimindo). Avulsa: nenhum filamento vem
   marcado por engano (a pessoa escolhe). */
function opNovaFalha(produtoId, filamentoId, ordemId) {
  if (!S.filamentos.length) { toast('Cadastre um filamento primeiro.'); ir('filamentos'); return; }
  const p = byId('produtos', produtoId), fils = opPorNome(S.filamentos);
  const doProduto = p ? (p.materiais || []).find(m => byId('filamentos', m.filamentoId)) : null;
  const escolhido = byId('filamentos', filamentoId) ? filamentoId : doProduto ? doProduto.filamentoId : '';
  // falha de uma ordem: código fixo (a ordem, o filamento e o n de nCodigoFalha), contado ao abrir a janela
  const ordem = byId('ordens', ordemId), nFalhas = ordem ? falhasDaOrdem(ordem) : 0, nCod = ordem ? nCodigoFalha(ordem) : 0, vistos = ordem ? codigosNaTela('falhas') : null;
  // a ordem já tem falha registrada (aqui ou no outro aparelho): a janela mostra antes de registrar outra
  const ultima = ordem ? S.falhas.filter(x => x.ordemId === ordem.id).sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')))[0] : null;
  const jaTem = !nFalhas ? '' : `<p class="aviso txt-sm" style="margin:0">Esta ordem já tem ${opPl(nFalhas, 'falha registrada', 'falhas registradas')}${ultima
    ? `: a última, ${gramas(ultima.gramas)}${byId('filamentos', ultima.filamentoId) ? ' de ' + esc(byId('filamentos', ultima.filamentoId).nome) : ''}, ${opQuando(ultima)}` : ''}. Registre de novo só se for outra.</p>`;
  openForm({
    title: 'Registrar falha',
    fields: [
      ...(jaTem ? [{ type: 'html', html: jaTem }] : []),
      { k: 'data', label: 'Data', type: 'date', req: true },
      { k: 'produtoId', label: 'Produto', type: 'select', options: [['', '— não sei / avulsa —']].concat(opPorNome(S.produtos).map(x => [x.id, x.nome])) },
      { k: 'filamentoId', label: 'Filamento perdido', type: 'select', req: true, options: (escolhido ? [] : [['', '— escolha o filamento —']]).concat(fils.map(f => [f.id, f.nome])) },
      { k: 'gramas', label: 'Quanto se perdeu (g)', type: 'number', req: true, hint: 'Peso aproximado do que foi para o lixo' },
      { k: 'motivo', label: 'Motivo', type: 'select', options: opMotivos.map(m => [m, m]), full: true },
      { k: 'obs', label: 'Observação', type: 'textarea', rows: 2 },
    ],
    vals: { data: hoje(), produtoId: p ? p.id : '', gramas: '', motivo: opMotivos[0], obs: '', filamentoId: escolhido },
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
      if (ordem) {
        // o código desta falha, com o filamento escolhido. Se ele entrou com a janela aberta (o outro aparelho registrou a
        // mesma falha), não registra em dobro
        const id = codigoFalha(ordem, d.filamentoId, nCod, vistos), ja = byId('falhas', id);
        if (ja) { toast(`Outro aparelho já registrou esta falha (${gramas(ja.gramas)} de ${f.nome}) enquanto esta janela estava aberta. Nada foi gravado em dobro: confira em Falhas e registre de novo, se for outra.`, 'bad'); return; }
        registrarFalha({ ...d, id, ordemId: ordem.id });
      } else registrarFalha(d);
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

/* ---------- A tela mudou pelo outro aparelho: os botões que mudaram esperam 1 s ----------
   Quando o que chega do outro aparelho muda um botão do bloco ou das listas do Painel (outra ordem imprimindo, outra próxima, uma
   linha a mais ou a menos) ou o tira do lugar, por 1 s ele não vale: o toque de quem ia apertar o botão de antes cai no vazio, em
   vez de fazer outra coisa (provado no estudo: 60 e 300 ms depois não valem, 1.300 ms vale). Vale também no desenho que acontece
   ao fechar uma janela (o que chegou com ela aberta, que a pessoa ainda não viu). Um botão igual e no mesmo lugar continua
   valendo. Não espera o desenho que este aparelho causou: uma ação (algo gravado aqui até 0,9 s antes), Ver mais, Mostrar as
   outras, a troca de tela. Pelo teclado nada muda. #main.op-espera: há botão esperando. */
let opBotoesAntes = new Map(), opEsperaAte = new Map(), opEsperaTimer = 0, opRedesenhoDaqui = false;
function opRenderDaqui() { opRedesenhoDaqui = true; try { render(); } finally { opRedesenhoDaqui = false; } }
function opMarcarEspera() {
  const agora = Date.now(), main = $('#main');
  if (!main) return;
  let fim = 0;
  $$('.op-acao', main).forEach(b => { const ate = opEsperaAte.get(b._opK) || 0; b.classList.toggle('op-espera', ate > agora); if (ate > agora) fim = Math.max(fim, ate); });
  main.classList.toggle('op-espera', fim > agora);
  opEsperaAte.forEach((ate, k) => { if (ate <= agora) opEsperaAte.delete(k); });
  clearTimeout(opEsperaTimer);
  if (fim) opEsperaTimer = setTimeout(opMarcarEspera, fim - agora + 20);
}
/* Cada botão op-acao à vista: a chave (o que ele faz, a ordem e quantas vezes ela já apareceu) e o lugar dentro da área de
   trabalho, pelo desenho da página (não muda com a rolagem nem com a animação de entrada dos cartões). O que está escondido (ex.:
   o Iniciar da Próxima no celular) não conta. */
function opLugaresDosBotoes() {
  const main = $('#main'), r = new Map(), vezes = new Map();
  if (!main) return r;
  $$('.op-acao', main).forEach(b => {
    const base = [b.getAttribute('onclick'), b.dataset.id, b.dataset.prox || ''].join('|'), n = (vezes.get(base) || 0) + 1;
    vezes.set(base, n);
    b._opK = base + '#' + n;
    if (!b.offsetParent) return;
    let x = 0, y = 0, e = b;
    while (e && e !== main && main.contains(e)) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
    r.set(b._opK, [x, y]);
  });
  return r;
}
DEPOIS_RENDER.push(trocou => {
  const daqui = trocou || opRedesenhoDaqui || Date.now() - ultimaAcao <= 900, agora = opLugaresDosBotoes();
  if (trocou) opEsperaAte.clear();
  if (!daqui) agora.forEach((lugar, k) => { const antes = opBotoesAntes.get(k); if (!antes || Math.abs(antes[0] - lugar[0]) > 3 || Math.abs(antes[1] - lugar[1]) > 3) opEsperaAte.set(k, Date.now() + 1000); });
  opBotoesAntes = agora;
  opMarcarEspera();
});
// a fonte terminou de carregar depois do desenho (o texto mudou de tamanho e os botões de lugar): o lugar de agora é o que vale
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { opBotoesAntes = opLugaresDosBotoes(); });
