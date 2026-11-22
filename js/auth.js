/* Nexos — login, primeiro acesso, equipe e a tela "Perfil e equipe". */
'use strict';

/* ---------- Telas de entrada ---------- */
function telaAuth(conteudo) {
  if (typeof visFecharAbertura === 'function') visFecharAbertura();
  const card = $('.auth .auth-card');
  if (card) { card.innerHTML = conteudo; return; }          // mantém a logo animada; troca só o cartão
  $('#app').innerHTML = `<div class="auth">
    <div class="auth-hero">
      <video class="auth-video" muted loop playsinline preload="none" poster="img/logo-hero.jpg" aria-hidden="true" tabindex="-1"><source src="img/logo-loop.mp4" type="video/mp4"></video>
      <div class="auth-hero-in">
        <p>Produção 3D sob controle: custo real de cada peça, fila da impressora, estoque e lucro por canal.</p>
        <ul><li>Custo e preço por canal</li><li>Fila com previsão</li><li>Estoque e compras</li><li>Financeiro e metas</li></ul>
      </div></div>
    <div class="auth-painel"><div class="auth-card">${conteudo}</div></div></div>`;
  // a logo animada (vídeo leve, em loop) só roda se a pessoa não pediu menos movimento; sem ela fica a imagem parada
  const v = $('.auth-video');
  const semMovimento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (v && !semMovimento) {
    v.addEventListener('playing', () => v.classList.add('on'), { once: true });
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  }
}
/* Enquanto entra e carrega: a tela de abertura com a logo (visual.js); sem ela, um cartão simples. */
const telaCarregando = (msg = 'Carregando…') => {
  if (typeof visAbertura === 'function') return visAbertura(msg);
  telaAuth(`<div class="carregando"><span class="spin"></span>${esc(msg)}</div>`);
};
function telaLogin(aba = 'entrar', msg = '', email = '', ok = false) {
  const entrar = aba === 'entrar';
  telaAuth(`
    <div class="auth-titulo">${entrar ? 'Entrar no sistema' : 'Criar conta ou nova senha'}</div>
    <div class="auth-sub">${entrar ? 'Use o e-mail e a senha da sua conta.' : 'Para criar a conta você precisa de um código: o de primeiro acesso (primeira conta do sistema) ou o do convite que recebeu.'}</div>
    <div class="tabs"><button type="button" class="${entrar ? 'on' : ''}" onclick="telaLogin('entrar')">Entrar</button><button type="button" class="${entrar ? '' : 'on'}" onclick="telaLogin('criar')">Criar conta</button></div>
    <form onsubmit="${entrar ? 'fazerLogin' : 'fazerCadastro'}(event)">
      <div><label for="aEmail">E-mail</label><input id="aEmail" name="email" type="email" autocomplete="username" required value="${esc(email)}"></div>
      <div><label for="aSenha">Senha</label><input id="aSenha" name="senha" type="password" autocomplete="${entrar ? 'current-password' : 'new-password'}" required minlength="8" maxlength="72"></div>
      ${entrar ? '' : `<div><label for="aSenha2">Repita a senha</label><input id="aSenha2" name="senha2" type="password" autocomplete="new-password" required minlength="8" maxlength="72"></div>
      <div><label for="aCodigo" id="aCodigoRotulo">Código do convite</label><input id="aCodigo" name="codigo" required autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="20" placeholder="XXXX-XXXX" style="text-transform:uppercase;letter-spacing:.08em">
        <div class="hint" id="aCodigoDica">Quem convidou você vê o código em Perfil → Equipe. Para trocar a senha de quem administra o sistema, use o código de primeiro acesso.</div></div>`}
      <div class="auth-msg ${ok ? 'ok' : ''}" id="authMsg" role="status">${esc(msg)}</div>
      <button class="btn largo" id="authBtn">${entrar ? 'Entrar' : 'Criar conta'}</button>
      ${entrar ? '<button type="button" class="link" onclick="ajudaSenha()">Esqueci a senha</button>' : ''}
    </form>`);
  if (!entrar) consultarPrimeiroAcesso();
}
const chamarCadastro = corpo => fetch(CFG.url + '/functions/v1/cadastro', {
  method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.key }, body: JSON.stringify(corpo),
});
/* Enquanto o sistema não tem dono, o código pedido é o de primeiro acesso; depois, o do convite. */
let PRIMEIRA_CONTA = null;      // true: falta criar a conta que administra; false: já existe; null: não deu para consultar
async function consultarPrimeiroAcesso() {
  try {
    const j = await (await chamarCadastro({ consulta: true })).json();
    PRIMEIRA_CONTA = !!(j && j.primeiro);
    const rotulo = $('#aCodigoRotulo'), dica = $('#aCodigoDica'), campo = $('#aCodigo');
    if (PRIMEIRA_CONTA && rotulo && dica && campo) {
      rotulo.textContent = 'Código de primeiro acesso';
      campo.placeholder = 'XXXXX-XXXXX';
      dica.textContent = 'Esta será a conta que administra o sistema. Use o código de primeiro acesso que você recebeu: 10 letras e números, no formato XXXXX-XXXXX. Guarde-o só com você.';
    }
  } catch (e) { PRIMEIRA_CONTA = null; /* sem conexão: fica o texto do convite; o servidor explica o erro ao enviar */ }
}
/* Confere o tamanho do código antes de enviar, para explicar o formato em vez de só responder "incorreto".
   O de primeiro acesso tem 10 letras e números; o do convite, 8. Devolve '' quando o tamanho serve. */
function formatoDoCodigo(codigo) {
  const n = String(codigo || '').replace(/[^A-Za-z0-9]/g, '').length;
  if (PRIMEIRA_CONTA === true) {
    return n === 10 ? '' : 'O código de primeiro acesso tem 10 letras e números, no formato XXXXX-XXXXX.';
  }
  return n === 8 || n === 10 ? '' : 'O código do convite tem 8 letras e números, no formato XXXX-XXXX. Quem convidou você vê o código em Perfil → Equipe.';
}
const authMsg = (msg, ok = false) => { const el = $('#authMsg'); if (el) { el.textContent = msg; el.className = 'auth-msg' + (ok ? ' ok' : ''); } };
const authOcupado = sim => { const b = $('#authBtn'); if (b) { b.disabled = sim; if (sim) b.dataset.txt = b.textContent; b.textContent = sim ? 'Aguarde…' : (b.dataset.txt || b.textContent); } };
function ajudaSenha() {
  authMsg('Abra “Criar conta” e informe o seu e-mail, um código e a nova senha. Quem administra o sistema usa o código de primeiro acesso (o mesmo de quando criou a conta); esse código é só seu e ninguém deve pedi-lo a você, nem por mensagem. As outras pessoas pedem a quem administra para clicar em “Redefinir senha” no nome delas (Perfil → Equipe) e passar o código.', true);
}
async function fazerLogin(e) {
  e.preventDefault();
  const email = e.target.email.value.trim().toLowerCase(), senha = e.target.senha.value;
  authOcupado(true); authMsg('');
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) {
      authOcupado(false);
      return authMsg(/invalid|credentials/i.test(error.message) ? 'E-mail ou senha incorretos.'
        : error.status ? 'Não foi possível entrar: ' + error.message : 'Sem conexão com o servidor. Tente de novo.');
    }
    await aposLogin(data.session);
  } catch (err) { authOcupado(false); authMsg('Sem conexão com o servidor. Tente de novo.'); }
}
async function fazerCadastro(e) {
  e.preventDefault();
  const email = e.target.email.value.trim().toLowerCase(), senha = e.target.senha.value;
  if (senha !== e.target.senha2.value) return authMsg('As senhas não são iguais.');
  const codigo = e.target.codigo ? e.target.codigo.value.trim() : '';
  const formato = formatoDoCodigo(codigo);
  if (formato) { if (e.target.codigo) e.target.codigo.focus(); return authMsg(formato); }
  authOcupado(true); authMsg('');
  try {
    const r = await chamarCadastro({ email, password: senha, codigo });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      authOcupado(false);
      return authMsg(j.erro || 'Não foi possível criar a conta.');
    }
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) return telaLogin('entrar', 'Conta criada. Entre com seu e-mail e senha.', email, true);
    await aposLogin(data.session);
  } catch (err) { authOcupado(false); authMsg('Sem conexão com o servidor. Tente de novo.'); }
}
async function aposLogin(session) {
  telaCarregando('Entrando…');
  const { data, error, status } = await sb.rpc('entrar');
  if (error) return telaLogin('entrar', status ? 'Não foi possível entrar: ' + error.message : 'Sem conexão com o servidor. Tente de novo.');
  if (data !== 'ok') return telaSemAcesso(session.user.email);
  EU = { id: session.user.id, email: session.user.email, papel: '' };
  await iniciarApp();
}
function telaSemAcesso(email) {
  telaAuth(`<div class="auth-titulo">Acesso ainda não liberado</div>
    <p class="auth-sub">A conta <b>${esc(email)}</b> não faz parte da equipe. Peça a quem administra o sistema para convidar este e-mail em Perfil → Equipe e tente de novo.</p>
    <button class="btn largo" onclick="location.reload()">Tentar de novo</button>
    <button class="btn ghost largo" onclick="sair()">Sair</button>`);
}
async function iniciarApp() {
  telaCarregando('Carregando seus dados…');
  try { await carregarTudo(); }
  catch (e) {
    console.error(e);
    return telaAuth(`<div class="auth-titulo">Não foi possível carregar</div><p class="auth-sub">${esc(e.message || e)}</p><button class="btn largo" onclick="location.reload()">Tentar de novo</button>`);
  }
  montarEstrutura();
  if (DEMO) $('#app').insertAdjacentHTML('beforebegin', '<div class="demo-faixa">MODO DEMONSTRAÇÃO — os dados ficam só neste navegador</div>');
  render();
  if (typeof visFecharAbertura === 'function') visFecharAbertura();
  if (typeof shopeeAoEntrar === 'function') shopeeAoEntrar();             // volta da autorização da loja na Shopee
  DB.assinar(aplicarRemoto, recarregar);
  carregarEquipe();
}
async function sair() {
  if (temPendencias() && !confirmar('Ainda há dados sendo salvos. Sair mesmo assim?')) return;
  // signOut pode falhar sem internet e deixar a sessão guardada no aparelho; nesse caso apaga só a local
  let erro = null;
  try { erro = (await sb.auth.signOut()).error; } catch (e) { erro = e; }
  if (erro) { try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { console.warn(e); } }
  location.reload();
}
async function boot() {
  if (DEMO) { EU = { id: 'demo', email: 'demonstração', papel: 'dono' }; return iniciarApp(); }
  if (!window.supabase) {
    return telaAuth('<div class="auth-titulo">Sem conexão</div><p class="auth-sub">Não foi possível carregar o sistema. Verifique a internet e recarregue a página.</p><button class="btn largo" onclick="location.reload()">Recarregar</button>');
  }
  // O sistema só entra por e-mail e senha: a biblioteca não deve aceitar uma sessão que venha escrita no endereço
  // (um link montado por outra pessoa trocaria a conta aberta neste navegador).
  sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { detectSessionInUrl: false } });
  telaCarregando();
  try {
    const { data } = await sb.auth.getSession();
    sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && $('#main')) setTimeout(() => location.reload(), 0); });
    if (data && data.session) await aposLogin(data.session); else { telaLogin(); primeiraVisita(); }
  } catch (e) { console.error(e); telaLogin('entrar', 'Sem conexão com o servidor. Tente de novo.'); }
}
/* Se o sistema ainda não tem dono, a entrada já abre em "Criar conta", com a explicação. */
async function primeiraVisita() {
  try {
    const j = await (await chamarCadastro({ consulta: true })).json();
    const naAbaEntrar = $('#authMsg') && !$('#aSenha2') && !$('#aEmail').value;
    if (j && j.primeiro && naAbaEntrar) telaLogin('criar', 'Primeiro acesso: crie aqui a conta que vai administrar o sistema.', '', true);
  } catch (e) { /* sem conexão: fica na tela de entrar */ }
}

/* ---------- Equipe ---------- */
let EQUIPE = null;
async function carregarEquipe() {
  if (DEMO) EQUIPE = { membros: [{ user_id: 'demo', email: 'demonstração', papel: 'dono' }], convites: [] };
  else {
    const [m, c] = await Promise.all([
      sb.from('membros').select('user_id,email,papel,criado_em').order('criado_em'),
      sb.from('convites').select('email,codigo,criado_em').order('criado_em'),
    ]);
    if (m.error || c.error) EQUIPE = { erro: (m.error || c.error).message, membros: [], convites: [] };
    else {
      EQUIPE = { membros: m.data, convites: c.data };
      const eu = m.data.find(x => x.user_id === EU.id);
      if (eu) EU.papel = eu.papel;
    }
  }
  const el = $('#equipe');
  if (el) el.innerHTML = equipeHTML();
}
function equipeHTML() {
  if (!EQUIPE) return '<div class="carregando"><span class="spin"></span>Carregando equipe…</div>';
  if (EQUIPE.erro) return `<p class="neg">Não foi possível carregar a equipe: ${esc(EQUIPE.erro)}</p>`;
  const souDono = EU.papel === 'dono';
  const membros = EQUIPE.membros.map(m => `<tr>
    <td><b>${esc(m.email)}</b>${m.user_id === EU.id ? ' <span class="muted">(você)</span>' : ''}</td>
    <td>${selo(m.papel === 'dono' ? 'Administra' : 'Equipe', m.papel === 'dono' ? 'info' : 'mute')}</td>
    <td><div class="rowbtns">${!DEMO && souDono && m.papel !== 'dono' ? `<button class="btn ghost sm" data-email="${esc(m.email)}" onclick="redefinirSenha(this.dataset.email)">Redefinir senha</button>
      <button class="btn danger sm" data-id="${esc(m.user_id)}" data-email="${esc(m.email)}" onclick="removerMembro(this.dataset.id, this.dataset.email)">Remover</button>` : ''}</div></td></tr>`).join('');
  const convites = EQUIPE.convites.map(c => {
    const vencido = conviteVencido(c), jaMembro = EQUIPE.membros.some(m => m.email === c.email);
    return `<tr><td>${esc(c.email)}<small>Código <b class="num" style="letter-spacing:.08em;color:var(--text)">${esc(fmtCodigo(c.codigo))}</b> · ${vencido ? 'venceu' : 'vale até'} ${esc(dataBR(conviteValidade(c)))}</small></td>
      <td>${vencido ? selo('Convite vencido', 'bad') : selo(jaMembro ? 'Nova senha liberada' : 'Convite pendente', 'warn')}</td>
      <td><div class="rowbtns">${vencido ? '' : `<button class="btn ghost sm" data-email="${esc(c.email)}" onclick="mostrarConvite(this.dataset.email)">Ver convite</button>`}
        <button class="btn danger sm" data-email="${esc(c.email)}" onclick="cancelarConvite(this.dataset.email)">Cancelar</button></div></td></tr>`;
  }).join('');
  return tabela(['Pessoa', 'Situação', ''], membros + convites) + (DEMO ? '<p class="hint mt">No modo demonstração não há equipe.</p>' : `
    <form class="inline mt" onsubmit="convidar(event)">
      <div class="espaco" style="min-width:220px"><label for="convEmail">Convidar por e-mail</label><input id="convEmail" name="email" type="email" required placeholder="pessoa@email.com"></div>
      <button class="btn" style="align-self:flex-end">Convidar</button>
    </form>
    <p class="hint">Cada convite gera um código que vale 7 dias. Passe o e-mail e o código para a pessoa: ela abre o sistema, clica em “Criar conta” e escolhe a própria senha. ${souDono ? 'Para quem esqueceu a senha, use “Redefinir senha”: o caminho é o mesmo.' : 'Só quem administra o sistema redefine a senha de outra pessoa.'}</p>`);
}
const fmtCodigo = c => { c = String(c || ''); return c.length > 4 ? c.slice(0, 4) + '-' + c.slice(4) : c; };
const conviteValidade = c => addDias(dataLocal(new Date(c.criado_em)), 7);
const conviteVencido = c => Date.now() - new Date(c.criado_em).getTime() > 7 * 864e5;
/* Mostra o convite pronto para copiar e mandar para a pessoa. */
function mostrarConvite(email) {
  const c = EQUIPE && EQUIPE.convites.find(x => x.email === email);
  if (!c) return toast('Convite não encontrado. Atualize a tela.');
  const redefinir = EQUIPE.membros.some(m => m.email === email);
  // aberto neste computador (localhost), o endereço da tela não abre no aparelho de mais ninguém: vale o endereço público
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || location.protocol === 'file:';
  const endereco = local && CFG.site ? CFG.site : location.origin + location.pathname;
  const texto = [
    redefinir ? 'Nova senha no sistema Nexos' : 'Convite para o sistema Nexos',
    '',
    '1. Abra: ' + endereco,
    '2. Clique em "Criar conta"',
    '3. E-mail: ' + c.email,
    '4. Código: ' + fmtCodigo(c.codigo) + ' (vale até ' + dataBR(conviteValidade(c)) + ')',
    '5. Escolha a sua senha (8 caracteres ou mais)',
  ].join('\n');
  abrirModal(`<p class="muted" style="margin-bottom:12px">Mande este texto para <b>${esc(c.email)}</b>. O código é pessoal: só quem tiver o e-mail e o código consegue criar a senha.</p>
    <textarea id="conviteTexto" readonly rows="8" aria-label="Texto do convite">${esc(texto)}</textarea>
    <div class="actions"><button type="button" class="btn ghost" onclick="fecharModal()">Fechar</button>
      <button type="button" class="btn" onclick="copiarTexto($('#conviteTexto').value)">Copiar texto</button></div>`, { title: redefinir ? 'Nova senha liberada' : 'Convite criado' });
}
async function criarConvite(email, acao) {
  // convite vencido para o mesmo e-mail: sai o velho e entra um novo, com código novo
  const velho = EQUIPE && EQUIPE.convites.find(x => x.email === email);
  if (velho && conviteVencido(velho)) await sb.from('convites').delete().eq('email', email);
  const { error } = await sb.from('convites').insert({ email });
  if (error && error.code !== '23505') {
    toast(error.code === '42501' ? 'Você não tem permissão para ' + acao + '.' : 'Não foi possível ' + acao + ': ' + error.message, 'bad');
    return false;
  }
  await carregarEquipe();
  // cada pessoa só enxerga os convites que ela mesma criou (quem administra enxerga todos); se a própria leitura
  // da equipe falhou, não dá para concluir nada e vale o aviso comum de "atualize a tela"
  if (EQUIPE && !EQUIPE.erro && !EQUIPE.convites.some(x => x.email === email)) {
    toast('Já existe um convite para este e-mail, criado por outra pessoa. Peça a quem administra o sistema para reenviar.', 'bad');
    return false;
  }
  mostrarConvite(email);
  return true;
}
async function convidar(e) {
  e.preventDefault();
  const email = e.target.email.value.trim().toLowerCase();
  if (EQUIPE && EQUIPE.membros.some(m => m.email === email)) return toast('Essa pessoa já faz parte da equipe.');
  await criarConvite(email, 'convidar');
}
async function redefinirSenha(email) {
  if (!confirmar(`Liberar ${email} para escolher uma nova senha?\n\nVocê recebe um código para passar a essa pessoa. Ela abre “Criar conta”, informa o e-mail, o código e a nova senha.`)) return;
  await criarConvite(email, 'redefinir a senha');
}
async function cancelarConvite(email) {
  const { error } = await sb.from('convites').delete().eq('email', email);
  if (error) return toast('Não foi possível cancelar: ' + error.message, 'bad');
  carregarEquipe();
}
async function removerMembro(id, email) {
  if (!confirmar(`Remover ${email} da equipe? A pessoa perde o acesso ao sistema.`)) return;
  const { error } = await sb.from('membros').delete().eq('user_id', id);
  if (error) return toast('Não foi possível remover: ' + error.message, 'bad');
  toast(email + ' foi removido da equipe.');
  carregarEquipe();
}
async function trocarSenha(e) {
  e.preventDefault();
  const f = e.target, nova = f.nova.value;
  if (nova !== f.nova2.value) return toast('As senhas não são iguais.', 'bad');
  const { error } = await sb.auth.updateUser({ password: nova });
  if (error) return toast('Não foi possível trocar a senha: ' + error.message, 'bad');
  f.reset(); toast('Senha alterada.');
}

/* ---------- Tela: Perfil e equipe ---------- */
const CAMPOS_PERFIL = [
  { k: 'empresa', label: 'Nome da empresa' }, { k: 'responsavel', label: 'Responsável' }, { k: 'cnpj', label: 'CNPJ / CPF' },
  { k: 'email', label: 'E-mail de contato', type: 'email' }, { k: 'telefone', label: 'Telefone / WhatsApp', type: 'tel' }, { k: 'cidade', label: 'Cidade / UF' },
];
VIEWS.perfil = function () {
  const p = S.perfil, logo = logoSegura(p.logo);
  return head('Perfil e equipe', 'Dados da empresa, quem tem acesso e a sua conta') + `
    <form class="panel" id="perfilForm" onsubmit="salvarPerfil(event)"><h2>Empresa</h2>
      <div class="grid3">${CAMPOS_PERFIL.map(f => campo(f, p[f.k])).join('')}</div>
      <div class="mt"><label>Logo (aparece no menu e nos orçamentos)</label>
        <div class="inline">
          ${logo ? `<img src="${esc(logo)}" alt="" style="height:48px;border-radius:8px;background:#fff">` : ''}
          <button type="button" class="btn ghost sm" onclick="$('#logoIn').click()">${logo ? 'Trocar imagem' : 'Escolher imagem'}</button>
          ${logo ? '<button type="button" class="btn danger sm" onclick="removerLogo()">Remover</button>' : ''}
          <input id="logoIn" type="file" accept="image/*" hidden onchange="definirLogo(this)">
        </div></div>
      <div class="actions"><button class="btn">Salvar empresa</button></div>
    </form>
    <div class="panel"><h2>Equipe</h2><div id="equipe">${equipeHTML()}</div></div>
    ${DEMO ? '' : `<form class="panel" onsubmit="trocarSenha(event)"><h2>Minha conta</h2>
      <p class="muted" style="margin-bottom:12px">Você entrou como <b>${esc(EU.email)}</b>.</p>
      <div class="grid3">
        <div><label for="sNova">Nova senha</label><input id="sNova" name="nova" type="password" autocomplete="new-password" required minlength="8" maxlength="72"></div>
        <div><label for="sNova2">Repita a nova senha</label><input id="sNova2" name="nova2" type="password" autocomplete="new-password" required minlength="8" maxlength="72"></div>
      </div>
      <div class="actions"><button type="button" class="btn ghost" onclick="sair()">Sair do sistema</button><button class="btn">Trocar senha</button></div>
    </form>`}
    <div class="panel"><h2>Backup</h2>
      <p class="muted" style="margin-bottom:12px">Os dados ficam salvos na nuvem. O backup é uma cópia extra em arquivo, guardada com você. Fotos e modelos 3D enviados não entram no backup: guarde esses arquivos também no seu computador.</p>
      <div class="inline"><button class="btn ghost" onclick="exportarBackup()">Baixar backup</button>
      <button class="btn ghost" onclick="$('#bkpIn').click()">Restaurar de um backup</button>
      <input id="bkpIn" type="file" accept=".json,application/json" hidden onchange="importarBackup(this)"></div>
    </div>`;
};
VIEWS.perfil.depois = () => { if (!EQUIPE) carregarEquipe(); };
function salvarPerfil(e) {
  e.preventDefault();
  Object.assign(S.perfil, lerCampos(e.target, CAMPOS_PERFIL));
  saveMeta('perfil'); render(); toast('Dados da empresa salvos.');
}
function definirLogo(inp) {
  const file = inp.files[0];
  if (!file) return;
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const k = Math.min(1, 320 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    S.perfil.logo = c.toDataURL('image/png');
    saveMeta('perfil'); renderMantendoPerfil(); toast('Logo atualizada.');
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('Não foi possível ler essa imagem.', 'bad'); };
  img.src = url;
}
function removerLogo() { S.perfil.logo = ''; saveMeta('perfil'); renderMantendoPerfil(); }
/* Redesenha a tela sem perder o que já foi digitado (e ainda não salvo) nos dados da empresa. */
function renderMantendoPerfil() {
  const campos = () => $$('#main input, #main textarea').filter(el => el.type !== 'file' && el.type !== 'checkbox' && (el.id || el.name));
  const chave = el => el.id || ((el.form && el.form.id) || '') + '/' + el.name;
  const mexidos = new Map(campos().filter(el => el.value !== el.defaultValue).map(el => [chave(el), el.value]));   // só o que a pessoa mexeu
  render();
  if (mexidos.size) campos().forEach(el => { const k = chave(el); if (mexidos.has(k)) el.value = mexidos.get(k); });
}
function exportarBackup() {
  const dados = { sistema: 'nexos', versao: 2, exportadoEm: agoraISO(), config: S.config, perfil: S.perfil };
  COLS.forEach(c => { dados[c] = S[c]; });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }));
  a.download = `nexos-backup-${hoje()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function importarBackup(inp) {
  const file = inp.files[0];
  inp.value = '';
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    let d;
    try { d = JSON.parse(fr.result); } catch (e) { return toast('Arquivo de backup inválido.', 'bad'); }
    if (!d || typeof d !== 'object' || !d.config || !COLS.some(c => Array.isArray(d[c]))) return toast('Arquivo de backup inválido.', 'bad');
    const total = COLS.reduce((n, c) => n + (Array.isArray(d[c]) ? d[c].length : 0), 0);
    if (!confirmar(`Restaurar ${total} registro(s) deste backup?\n\nRegistros com o mesmo código são substituídos pelos do arquivo; os demais continuam como estão.`)) return;
    // só as chaves conhecidas entram, para um arquivo estranho não trazer nada além do esperado
    Object.keys(CONFIG_PADRAO).forEach(k => { if (Object.prototype.hasOwnProperty.call(d.config, k)) S.config[k] = d.config[k]; });
    saveMeta('config');
    if (d.perfil && typeof d.perfil === 'object') {
      const lido = perfilLimpo(d.perfil);                                    // só texto, só os campos conhecidos, logo só a gerada pelo sistema
      Object.keys(PERFIL_PADRAO).forEach(k => { if (Object.prototype.hasOwnProperty.call(d.perfil, k)) S.perfil[k] = lido[k]; });
      saveMeta('perfil');
    }
    COLS.forEach(c => { if (Array.isArray(d[c])) d[c].forEach(r => { if (registroValido(r)) put(c, r); }); });
    render(); toast('Backup restaurado.');
  };
  fr.readAsText(file);
}
