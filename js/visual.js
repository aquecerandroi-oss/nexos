/* Nexos — visual: tela de abertura com a logo, entrada animada ao trocar de tela, números que contam até o valor,
   cartões que acompanham o mouse, indicador do menu que desliza, onda no clique dos botões e a luz que segue o mouse.
   Tudo aqui é enfeite: se algo falhar, o sistema continua funcionando. Com "reduzir movimento" ligado, quase nada anima.
   Tudo que é global neste arquivo começa com "vis". */
'use strict';

const visMovimento = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const visMouse = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);

/* ---------- Tela de abertura ---------- */
function visAbertura(msg) {
  let s = document.getElementById('splash');
  if (!s) {
    s = document.createElement('div');
    s.id = 'splash'; s.className = 'splash'; s.setAttribute('role', 'status'); s.setAttribute('aria-live', 'polite');
    s.innerHTML = `<div class="splash-in">
        <span class="marca-viva" aria-hidden="true"><img src="img/marca.webp" alt=""></span>
        <img class="splash-nome" src="img/nome.webp" alt="Nexos 3D">
        <div class="splash-barra" aria-hidden="true"></div>
        <div class="splash-msg"></div></div>`;
    document.body.appendChild(s);
  }
  s.classList.remove('sai');
  const m = s.querySelector('.splash-msg');
  if (m) m.textContent = msg || 'Carregando…';
}
function visFecharAbertura() {
  const s = document.getElementById('splash');
  if (!s || s.classList.contains('sai')) return;
  s.classList.add('sai');
  setTimeout(() => { if (s.classList.contains('sai')) s.remove(); }, 700);
}

/* ---------- Números que contam até o valor (cartões, só ao abrir a tela) ---------- */
function visContar(el) {
  const txt = el.textContent || '';
  if (/[/:]/.test(txt)) return;                                     // datas e horas ficam como estão
  const m = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/.exec(txt);
  if (!m) return;
  const bruto = m[0], dec = (bruto.split(',')[1] || '').length;
  const alvo = Number(bruto.replace(/\./g, '').replace(',', '.'));
  if (!isFinite(alvo) || alvo < 3) return;                          // número pequeno não precisa contar
  const antes = txt.slice(0, m.index), depois = txt.slice(m.index + bruto.length);
  const fmt = v => antes + v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + depois;
  let t0 = null;
  const dur = 950;
  const passo = t => {
    if (!el.isConnected) return;
    if (t0 === null) t0 = t;                                      // conta a partir do primeiro quadro (nunca dá valor negativo)
    const p = Math.max(0, Math.min(1, (t - t0) / dur)), e = p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
    if (p >= 1) { el.textContent = txt; return; }                 // termina exatamente no texto original
    el.textContent = fmt(alvo * e);
    requestAnimationFrame(passo);
  };
  el.textContent = fmt(0);
  requestAnimationFrame(passo);
}

/* ---------- Indicador do menu que desliza até a tela aberta ---------- */
function visIndicadorMenu() {
  const side = document.querySelector('.side'), nav = document.getElementById('nav');
  if (!side || !nav) return;
  let ind = side.querySelector('.nav-ind');
  if (!ind) {
    ind = document.createElement('div');
    ind.className = 'nav-ind'; ind.setAttribute('aria-hidden', 'true');
    side.insertBefore(ind, side.firstChild);
  }
  nav.classList.add('com-ind');
  const a = nav.querySelector('a.on');
  if (!a) { ind.style.opacity = '0'; return; }
  const rs = side.getBoundingClientRect(), ra = a.getBoundingClientRect();
  ind.style.height = ra.height + 'px';
  ind.style.left = (ra.left - rs.left) + 'px';
  ind.style.width = ra.width + 'px';
  ind.style.transform = `translateY(${ra.top - rs.top + side.scrollTop}px)`;
  ind.style.opacity = '1';
}
let visTimerResize = null;
window.addEventListener('resize', () => { clearTimeout(visTimerResize); visTimerResize = setTimeout(visIndicadorMenu, 120); });

/* ---------- Entrada ao trocar de tela ---------- */
let visTimerEntra = null;
if (typeof DEPOIS_RENDER !== 'undefined') {
  DEPOIS_RENDER.push(trocou => {
    visIndicadorMenu();
    const main = document.getElementById('main');
    if (!main) return;
    if (!trocou) {
      // a mesma tela redesenhada (aba, atualização de outro aparelho): nada entra animado de novo
      clearTimeout(visTimerEntra);
      main.classList.remove('entra');
      return;
    }
    if (!visMovimento) return;
    main.classList.remove('entra');
    void main.offsetWidth;                                          // reinicia as animações
    main.classList.add('entra');
    clearTimeout(visTimerEntra);
    // tira a classe depois da entrada (o último enfeite do gráfico termina em 1,65 s)
    visTimerEntra = setTimeout(() => main.classList.remove('entra'), 1750);
    main.querySelectorAll('.kpi strong').forEach(visContar);
  });
}

/* ---------- Cartões que inclinam e acendem onde o mouse está, e a luz que segue o mouse ---------- */
if (visMouse && visMovimento) {
  const luz = document.createElement('div');
  luz.className = 'luz-mouse'; luz.setAttribute('aria-hidden', 'true');
  const montarLuz = () => { if (document.body && !luz.isConnected) document.body.appendChild(luz); };
  if (document.body) montarLuz(); else document.addEventListener('DOMContentLoaded', montarLuz);
  let ultimo = null, quadro = 0, cartao = null;
  const soltar = c => { if (c) { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); } };
  document.addEventListener('pointermove', ev => {
    ultimo = ev;
    if (quadro) return;
    quadro = requestAnimationFrame(() => {
      quadro = 0;
      const e = ultimo;
      luz.style.transform = `translate3d(${e.clientX - 320}px, ${e.clientY - 320}px, 0)`;
      const c = e.target && e.target.closest ? e.target.closest('.kpi') : null;
      if (cartao && cartao !== c) soltar(cartao);
      cartao = c;
      if (!c || document.body.classList.contains('modal-aberto')) return;
      const r = c.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      c.style.setProperty('--x', (x * 100).toFixed(1) + '%');
      c.style.setProperty('--y', (y * 100).toFixed(1) + '%');
      c.style.setProperty('--rx', ((0.5 - y) * 6).toFixed(2) + 'deg');
      c.style.setProperty('--ry', ((x - 0.5) * 8).toFixed(2) + 'deg');
    });
  }, { passive: true });
  document.addEventListener('pointerleave', () => { soltar(cartao); cartao = null; luz.style.transform = 'translate3d(-999px,-999px,0)'; });
}

/* ---------- Onda no clique dos botões ---------- */
document.addEventListener('pointerdown', e => {
  if (!visMovimento || e.button > 0) return;
  const b = e.target && e.target.closest ? e.target.closest('.btn') : null;
  if (!b || b.disabled) return;
  const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2;
  const o = document.createElement('span');
  o.className = 'onda'; o.setAttribute('aria-hidden', 'true');
  o.style.width = o.style.height = d + 'px';
  o.style.left = (e.clientX - r.left - d / 2) + 'px';
  o.style.top = (e.clientY - r.top - d / 2) + 'px';
  b.appendChild(o);
  setTimeout(() => o.remove(), 700);
}, { passive: true });

/* ---------- O símbolo da logo gira quando alguém clica nele ---------- */
document.addEventListener('click', e => {
  const mv = visMovimento && e.target && e.target.closest ? e.target.closest('.marca-viva') : null;
  if (!mv) return;
  mv.classList.remove('gira'); void mv.offsetWidth; mv.classList.add('gira');
  setTimeout(() => mv.classList.remove('gira'), 1100);
});
