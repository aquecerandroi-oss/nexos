/* Nexos — integração com a Shopee: configurar o app, conectar a loja e trazer os pedidos para Vendas.
   Toda conversa com a Shopee acontece na função de borda "shopee" (supabase/functions/shopee): a chave do app e os
   tokens da loja ficam guardados lá, nunca no navegador. Outros arquivos chamam shopeePainelConfig() (Configuração),
   shopeeBotaoVendas() (Vendas) e shopeeAoEntrar() (depois do login, para terminar a conexão da loja).
   Tudo que é global aqui começa com "shp" ou "shopee". */
'use strict';

let shpStatus = null;          // resposta da ação 'status' (ou { erro })
let shpCarregando = false;
let shpResultado = null;       // última busca de pedidos: { pedidos, periodo, avisos }
const SHP_ESTADO = 'nexos-shopee-estado';
const SHP_SITUACAO = {
  UNPAID: 'Aguardando pagamento', READY_TO_SHIP: 'Pronto para enviar', PROCESSED: 'Em preparo', RETRY_SHIP: 'Reenvio',
  SHIPPED: 'Enviado', TO_CONFIRM_RECEIVE: 'Entregue', COMPLETED: 'Concluído', IN_CANCEL: 'Cancelando', CANCELLED: 'Cancelado',
  TO_RETURN: 'Em devolução', INVOICE_PENDING: 'Nota fiscal pendente',
};
const shpNorm = s => String(s ?? '').trim().toLowerCase();

/* Endereço para onde a Shopee devolve depois da autorização (precisa estar na lista da função de borda). */
const shpVolta = () => (['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:8768/' : (CFG.site || location.origin + location.pathname));

async function shpChamar(corpo) {
  if (DEMO || !sb) throw new Error('A Shopee só funciona no sistema de verdade, não na demonstração.');
  const { data, error } = await sb.functions.invoke('shopee', { body: corpo });
  if (error) {
    if (error.name === 'FunctionsFetchError') throw new Error('Sem conexão com a internet agora. Tente de novo.');
    const status = error.context && error.context.status;
    let msg = '';
    try { const j = await error.context.json(); msg = j && j.erro; } catch (e) { /* resposta sem JSON */ }
    const falha = new Error(msg || 'Não foi possível falar com a Shopee agora. Tente de novo.');
    if (status === 404 && !msg) falha.semFuncao = true;          // a função ainda não foi publicada neste sistema
    throw falha;
  }
  return data || {};
}
async function shpCarregarStatus() {
  if (shpCarregando) return;
  shpCarregando = true;
  try { shpStatus = await shpChamar({ acao: 'status' }); } catch (e) { shpStatus = { erro: e.message || String(e), semFuncao: !!e.semFuncao }; }
  if (paginaAtual() === 'vendas' && $('#shpBotaoVendas')) $('#shpBotaoVendas').hidden = !(shpStatus && shpStatus.loja_conectada);
  shpCarregando = false;
  const el = $('#shpPainel');
  if (el) el.innerHTML = shpPainelHTML();
}

/* ---------- Painel na Configuração ---------- */
function shopeePainelConfig() {
  try {                                                   // um erro aqui nunca pode impedir a Configuração de abrir
    if (!DEMO && !shpStatus) setTimeout(shpCarregarStatus, 0);
    const conectada = shpStatus && shpStatus.loja_conectada;
    return `<div class="panel" id="shpBloco"><div class="panel-head"><h2>Integração com a Shopee</h2>${conectada ? selo('Loja conectada', 'ok') : ''}</div>
      <div id="shpPainel">${shpPainelHTML()}</div></div>`;
  } catch (e) { console.error(e); return ''; }
}
function shpPainelHTML() {
  if (DEMO) return '<p class="muted">Na demonstração a integração com a Shopee fica desligada.</p>';
  if (!shpStatus) return '<div class="carregando"><span class="spin"></span>Conferindo a Shopee…</div>';
  if (shpStatus.erro) {
    const semFuncao = !!shpStatus.semFuncao;
    return `<p class="${semFuncao ? 'muted' : 'neg'}">${esc(semFuncao ? 'A integração com a Shopee ainda não está ligada neste sistema.' : shpStatus.erro)}</p>
      <div class="actions" style="justify-content:flex-start"><button type="button" class="btn ghost sm" onclick="shpStatus=null;shpCarregarStatus()">Tentar de novo</button></div>`;
  }
  const dona = EU.papel === 'dono', s = shpStatus;
  if (!s.configurado) {
    return `<p>Com a integração, os pedidos da sua loja na Shopee entram em Vendas sem digitar, com as taxas de verdade de cada pedido.</p>
      ${shpGuia()}
      ${dona ? shpFormCredenciais() : '<p class="hint">Quem administra o sistema cola aqui o Partner ID e a Partner Key do app da Shopee.</p>'}`;
  }
  const amb = s.ambiente === 'teste' ? ' · ambiente de teste' : '';
  if (!s.loja_conectada) {
    return `<p>App da Shopee configurado (Partner ID ${esc(s.partner_id)}${amb}). Falta conectar a loja: você vai para a Shopee, entra com a conta da loja e autoriza o Nexos.</p>
      <div class="actions" style="justify-content:flex-start"><button type="button" class="btn" onclick="shpConectar()">Conectar a loja da Shopee</button>
        ${dona ? '<button type="button" class="btn ghost" onclick="shpTrocarCredenciais()">Trocar as credenciais</button>' : ''}</div>
      <div id="shpCredenciais"></div>`;
  }
  const loja = s.loja_nome ? esc(s.loja_nome) : 'Loja ' + esc(s.shop_id);
  const vale = s.autorizacao_expira_em ? ` A autorização vale até ${esc(dataBR(s.autorizacao_expira_em))}.` : '';
  const ultima = s.ultima_sincronizacao ? `Última busca de pedidos: ${esc(dataHora(s.ultima_sincronizacao))}.` : 'Nenhum pedido buscado ainda.';
  const dias = s.renovar_ate ? Math.ceil((Date.parse(s.renovar_ate) - Date.now()) / 864e5) : null;
  const cai = dias != null && dias <= 5 ? `<p class="aviso txt-sm" style="margin-top:4px">Busque os pedidos ${dias <= 1 ? 'hoje' : `nos próximos ${dias} dias`} para a conexão com a Shopee não cair.</p>` : '';
  return `<p><b>${loja}</b>${amb}.${vale}</p><p class="muted txt-sm" style="margin-top:4px">${ultima}</p>${cai}
    <div class="actions" style="justify-content:flex-start">
      <button type="button" class="btn" onclick="shpImportar()">Buscar pedidos da Shopee</button>
      <button type="button" class="btn ghost" onclick="shpConectar()">Conectar de novo</button>
      ${dona ? '<button type="button" class="btn ghost" onclick="shpTrocarCredenciais()">Trocar as credenciais</button>' : ''}</div>
    <div id="shpCredenciais"></div>
    <p class="hint">Para os pedidos entrarem no produto certo, preencha o código (SKU) de cada produto igual ao do anúncio na Shopee.</p>`;
}
function shpGuia() {
  return `<details class="shp-guia"><summary>Como conseguir o acesso na Shopee (uma vez só, leva uns 4 dias por causa das aprovações)</summary><ol>
    <li>Antes: a loja precisa ter <b>CNPJ</b>, pelo menos <b>1 pedido nos últimos 30 dias</b>, e você precisa do e-mail e do celular da loja (chega um código por SMS).</li>
    <li>Em <b>open.shopee.com</b>, clique em Log In → Sign up e crie um login com um e-mail (ele não muda depois).</li>
    <li>No Console, vá em <b>App Management → App List → Shopee Seller</b>, entre com a conta da loja e escolha <b>Registered Business Seller</b>. A Shopee aprova em até 3 dias úteis, por e-mail.</li>
    <li>Clique em <b>Create App</b> e escolha o tipo <b>Seller In House System</b>. Em <b>Live Redirect URL Domain</b> coloque <b>aquecerandroi-oss.github.io</b>.</li>
    <li>Peça o <b>Go Live</b>: System URL <b>https://aquecerandroi-oss.github.io/nexos/</b>, descrição "sistema interno que lê os pedidos da loja", uma captura de tela, dados pessoais (PII) <b>desligado</b> e, em IT Assets, <b>IP address(es) unavailable</b>. A revisão leva cerca de 24 horas.</li>
    <li>Aprovado, copie o <b>Live Partner ID</b> e a <b>Live Key</b> (em App Key) e cole abaixo. Depois clique em <b>Conectar a loja da Shopee</b> e escolha a validade de 365 dias.</li></ol>
    <p class="hint">A Partner Key é uma senha do app: cole só aqui. Ela fica guardada no servidor do Nexos e não aparece de novo na tela. Se o Nexos passar 30 dias sem buscar pedidos, a conexão cai e é só conectar de novo.</p></details>`;
}
function shpFormCredenciais() {
  return `<form class="grid3 mt" onsubmit="shpSalvarCredenciais(event)" autocomplete="off">
      <div><label for="shpPid">Partner ID</label><input id="shpPid" name="partner_id" inputmode="numeric" required placeholder="Ex.: 2001234"></div>
      <div><label for="shpKey">Partner Key</label><input id="shpKey" name="partner_key" type="password" required autocomplete="new-password" spellcheck="false"></div>
      <div><label for="shpAmb">Ambiente</label><select id="shpAmb" name="ambiente"><option value="producao">Produção (loja de verdade)</option><option value="teste">Teste (sandbox da Shopee)</option></select></div>
      <div class="full actions" style="justify-content:flex-start;margin-top:4px"><button class="btn">Salvar credenciais</button></div>
    </form>`;
}
function shpTrocarCredenciais() {
  const el = $('#shpCredenciais');
  if (el) el.innerHTML = shpFormCredenciais();
}
async function shpSalvarCredenciais(e) {
  e.preventDefault();
  const f = e.target, botao = $('button', f);
  const corpo = { acao: 'configurar', partner_id: f.partner_id.value.trim(), partner_key: f.partner_key.value.trim(), ambiente: f.ambiente.value };
  if (!/^\d{1,10}$/.test(corpo.partner_id)) return toast('O Partner ID tem só números.', 'bad');
  if (botao) botao.disabled = true;
  try {
    const r = await shpChamar(corpo);
    f.reset();
    toast(r.aviso || (r.loja_desconectada ? 'Credenciais salvas. Como o app mudou, conecte a loja de novo.' : 'Credenciais da Shopee salvas.'), r.aviso ? 'warn' : '');
    shpStatus = null; shpCarregarStatus();
  } catch (err) { toast(err.message, 'bad'); }
  if (botao) botao.disabled = false;
}
async function shpConectar() {
  try {
    const r = await shpChamar({ acao: 'link', redirect: shpVolta() });
    try { sessionStorage.setItem(SHP_ESTADO, r.estado || ''); } catch (e) { /* sem armazenamento: a Shopee devolve o estado no endereço */ }
    if (temPendencias()) await descarregar();
    location.href = r.url;
  } catch (err) { toast(err.message, 'bad'); }
}
/* Volta da autorização: a Shopee abre o Nexos com ?code=...&shop_id=...&state=... no endereço. */
async function shopeeAoEntrar() {
  if (DEMO) return;
  const q = new URLSearchParams(location.search);
  const code = q.get('code'), shopId = q.get('shop_id'), principal = q.get('main_account_id');
  if (!code || (!shopId && !principal)) return;
  let guardado = '';
  try { guardado = sessionStorage.getItem(SHP_ESTADO) || ''; sessionStorage.removeItem(SHP_ESTADO); } catch (e) { /* sem armazenamento */ }
  history.replaceState(null, '', location.pathname + location.hash);      // tira o código do endereço na hora
  toast('Conectando a loja da Shopee…');
  try {
    const r = await shpChamar({ acao: 'conectar', code, shop_id: shopId, main_account_id: principal, estado: q.get('state') || guardado });
    toast(`Loja da Shopee conectada${r.loja_nome ? ': ' + r.loja_nome : ''}.`);
  } catch (err) { toast(err.message, 'bad'); }
  shpStatus = null;
  if (paginaAtual() === 'config') render(); else shpCarregarStatus();
}

/* ---------- Pedidos: buscar e trazer para Vendas ---------- */
/* Botão em Vendas: só aparece com a loja conectada (o status é conferido uma vez, sem travar a tela). */
function shopeeBotaoVendas() {
  if (DEMO) return '';
  if (!shpStatus) setTimeout(shpCarregarStatus, 0);
  const ligada = !!(shpStatus && shpStatus.loja_conectada);
  return `<button type="button" class="btn ghost" id="shpBotaoVendas" onclick="shpImportar()"${ligada ? '' : ' hidden'}>Pedidos da Shopee</button>`;
}
/* Id do pedido da Shopee no Nexos: o mesmo em qualquer aparelho, para o pedido nunca entrar duas vezes. */
const shpIdVenda = sn => ('shp-' + String(sn || '').replace(/[^A-Za-z0-9_-]/g, '')).slice(0, 64);
/* Canal da Shopee no Nexos: o padrão (id 'shopee') ou o primeiro com Shopee no nome. */
const shpCanal = () => byId('canais', 'shopee') || S.canais.find(c => /shopee/i.test(c.nome || '')) || null;
/* Produto do Nexos com o mesmo código (SKU) do item na Shopee. */
const shpProduto = sku => (sku ? S.produtos.find(p => shpNorm(p.sku) && shpNorm(p.sku) === shpNorm(sku)) : null) || null;
async function shpImportar() {
  if (DEMO) return toast('Na demonstração a integração com a Shopee fica desligada.');
  if (!shpStatus || shpStatus.erro) await shpCarregarStatus();
  if (!shpStatus || !shpStatus.loja_conectada) { toast('Conecte a loja da Shopee na Configuração primeiro.'); ir('config'); return; }
  const ult = shpStatus.ultima_sincronizacao ? dataLocal(new Date(shpStatus.ultima_sincronizacao)) : '';
  const de = ult && ult > addDias(hoje(), -30) ? addDias(ult, -1) : addDias(hoje(), -7);
  abrirModal(`<p class="muted">Escolha o período (até 31 dias, contando o primeiro e o último). Os pedidos aparecem para você conferir antes de entrar em Vendas.</p>
    <form class="inline mt" onsubmit="shpBuscar(event)">
      <div><label for="shpDe">De</label><input id="shpDe" name="de" type="date" required value="${esc(de)}" min="2000-01-01" max="2099-12-31"></div>
      <div><label for="shpAte">Até</label><input id="shpAte" name="ate" type="date" required value="${esc(hoje())}" min="2000-01-01" max="2099-12-31"></div>
      <button class="btn" style="align-self:flex-end">Buscar pedidos</button>
    </form>
    <div id="shpLista" class="mt"></div>`, { title: 'Pedidos da Shopee', wide: true });
}
async function shpBuscar(e) {
  e.preventDefault();
  const f = e.target, de = f.de.value, ate = f.ate.value, lista = $('#shpLista');
  if (!de || !ate || de > ate) return toast('Confira as datas: a primeira vem antes da segunda.', 'bad');
  if ((Date.parse(ate) - Date.parse(de)) / 864e5 > 30) return toast('Escolha no máximo 31 dias, contando o primeiro e o último.', 'bad');
  lista.innerHTML = '<div class="carregando"><span class="spin"></span>Buscando os pedidos na Shopee… pode levar um minuto.</div>';
  try {
    shpResultado = await shpChamar({ acao: 'pedidos', de, ate });
    lista.innerHTML = shpListaHTML();
    shpStatus = null;                                                   // a última busca mudou
  } catch (err) { lista.innerHTML = `<p class="neg">${esc(err.message)}</p>`; }
}
function shpListaHTML() {
  const r = shpResultado, pedidos = (r && r.pedidos) || [];
  const avisos = ((r && r.avisos) || []).map(a => `<p class="hint aviso">${esc(a)}</p>`).join('');
  if (!pedidos.length) return vazio('Nenhum pedido neste período.') + avisos;
  const opcoes = [['', '— sem produto (entra só o valor) —'], ...S.produtos.slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')).map(p => [p.id, p.nome])];
  const linhas = pedidos.map((o, k) => {
    const ja = byId('vendas', shpIdVenda(o.order_sn)) || S.vendas.find(v => v.shopeeOrderSn && v.shopeeOrderSn === o.order_sn);
    const situ = SHP_SITUACAO[o.status] || o.status || '—';
    let acao;
    if (o.cancelado) acao = ja ? `<label class="check"><input type="checkbox" data-shp-excluir="${k}"> Tirar do Nexos</label>` : selo('Cancelado', 'mute');
    else if (ja && ja.shopeeEstimado && o.taxas) acao = `<label class="check"><input type="checkbox" data-shp-atualizar="${k}" checked> Atualizar valores</label>`;
    else if (ja) acao = selo('Já está no Nexos', 'ok');
    else acao = `<label class="check"><input type="checkbox" data-shp-novo="${k}"${o.status === 'UNPAID' ? '' : ' checked'}> Trazer</label>`;
    const itens = (o.itens || []).map((i, n) => {
      const p = shpProduto(i.sku), nome = esc(i.nome) + (i.variacao ? ` <span class="muted">(${esc(i.variacao)})</span>` : '');
      const ligar = p || ja || o.cancelado ? `<small>${p ? '→ ' + esc(p.nome) : i.sku ? 'SKU ' + esc(i.sku) : 'sem SKU'}</small>`
        : `<select class="status" data-shp-item="${k}:${n}" aria-label="Produto do Nexos">${opcoes.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select>`;
      return `<div>${nf(i.qtd)}× ${nome} · ${brl(i.preco_unit)}${ligar}</div>`;
    }).join('');
    const taxas = o.taxas ? Object.values(o.taxas).reduce((t, v) => t + num(v), 0) : null;
    return `<tr><td class="num">${esc(dataBR(o.criado_em ? dataLocal(new Date(o.criado_em)) : ''))}<small>${esc(o.order_sn)}</small></td>
      <td>${itens}${o.devolucao ? `<small class="aviso">Devolução na Shopee: registre em Detalhes do pedido.</small>` : ''}</td>
      <td>${esc(situ)}</td>
      <td class="right num">${brl(o.total_produtos)}${taxas != null ? `<small>taxas e frete ${brl(taxas)}</small>` : '<small>taxas estimadas</small>'}</td>
      <td>${acao}</td></tr>`;
  }).join('');
  return tabela(['Data', 'Itens', 'Situação', { t: 'Valor', r: 1 }, ''], linhas) + avisos +
    `<p class="hint">Pedido ainda não concluído entra com as taxas da regra do canal; quando a Shopee fechar os valores, busque de novo e marque "Atualizar valores". Item sem produto escolhido entra sem custo de peça e sem mexer no estoque.</p>
    <div class="actions"><button type="button" class="btn ghost" onclick="fecharModal()">Fechar</button><button type="button" class="btn" onclick="shpAplicar()">Trazer para Vendas</button></div>`;
}
/* Valores de verdade do pedido concluído: taxa total (comissão, serviço, transação e o resto) e o frete que ficou com a loja. */
function shpValores(o) {
  if (!o.taxas) return {};
  const t = o.taxas;
  return { taxaTotal: Math.max(0, num(t.comissao) + num(t.servico) + num(t.transacao) + num(t.outras)), frete: Math.max(0, num(t.frete_vendedor)) };
}
function shpAplicar() {
  const r = shpResultado, pedidos = (r && r.pedidos) || [];
  const canal = shpCanal();
  if (!canal) { toast('Cadastre o canal Shopee em Configuração → Canais de venda.', 'bad'); return; }
  const marcados = sel => $$(sel).filter(x => x.checked).map(x => Number(Object.values(x.dataset)[0]));
  const novos = marcados('[data-shp-novo]'), atualizar = marcados('[data-shp-atualizar]'), excluir = marcados('[data-shp-excluir]');
  if (!novos.length && !atualizar.length && !excluir.length) { toast('Marque pelo menos um pedido.'); return; }
  if (excluir.length && !confirmar(`Tirar do Nexos ${excluir.length === 1 ? '1 pedido cancelado' : excluir.length + ' pedidos cancelados'} na Shopee? As peças voltam para o estoque.`)) return;
  let n = 0, a = 0, x = 0;
  novos.forEach(k => {
    const o = pedidos[k];
    if (!o || byId('vendas', shpIdVenda(o.order_sn)) || S.vendas.some(v => v.shopeeOrderSn === o.order_sn)) return;
    const itens = (o.itens || []).map((i, j) => {
      const escolhido = $(`[data-shp-item="${k}:${j}"]`), p = shpProduto(i.sku) || (escolhido ? byId('produtos', escolhido.value) : null);
      if (p && escolhido && escolhido.value && i.sku && !shpNorm(p.sku)) { p.sku = i.sku; put('produtos', p); }   // lembra o SKU no produto
      return { produtoId: p ? p.id : '', produtoNome: i.nome + (i.variacao ? ' (' + i.variacao + ')' : ''), qtd: i.qtd, precoUnit: i.preco_unit, custoUnit: p ? undefined : 0 };
    }).filter(i => num(i.qtd) > 0);
    if (!itens.length) return;
    const v = registrarVenda({ id: shpIdVenda(o.order_sn), data: o.criado_em ? dataLocal(new Date(o.criado_em)) : hoje(), canalId: canal.id, itens, obs: 'Shopee ' + o.order_sn,
      shopeeOrderSn: o.order_sn, ...shpValores(o) });
    v.shopeeEstimado = !o.taxas; put('vendas', v);
    n++;
  });
  atualizar.forEach(k => {
    const o = pedidos[k], v = o && S.vendas.find(z => z.shopeeOrderSn === o.order_sn);
    if (!v || !o.taxas) return;
    const s = simularVenda({ canalId: v.canalId, ...shpValores(o), itens: itensVenda(v).map(i => ({ produtoId: i.produtoId, produtoNome: i.produtoNome, qtd: i.qtdOriginal, precoUnit: i.precoUnit, custoUnit: i.custoUnit })) });
    v.itens = s.itens.map(i => ({ produtoId: i.produtoId, produtoNome: i.produtoNome, qtd: i.qtd, precoUnit: i.precoUnit, custoUnit: i.custoUnit,
      bruto: i.bruto, taxa: i.taxa, imposto: i.imposto, frete: i.frete, custo: i.custo, lucro: i.lucro }));
    v.shopeeEstimado = false;
    recalcularVenda(v); put('vendas', v);
    a++;
  });
  excluir.forEach(k => {
    const o = pedidos[k], v = o && S.vendas.find(z => z.shopeeOrderSn === o.order_sn);
    if (v) { excluirVenda(v); x++; }
  });
  fecharModal(); render();
  toast([n ? `${n} pedido(s) trazido(s)` : '', a ? `${a} atualizado(s)` : '', x ? `${x} tirado(s)` : ''].filter(Boolean).join(', ') + '.');
}
