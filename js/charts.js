/* Nexos — gráficos. Cores validadas para o fundo escuro (daltonismo e contraste):
   azul, laranja e verde-água, nesta ordem fixa. Texto nunca usa a cor da série. */
'use strict';

const CORES = { azul: '#3987e5', laranja: '#d95926', verde: '#199e70', negativo: '#e66767' };
const GRAF = new Map();
let grafSeq = 0;

/* graficoLinhas({ rotulos: ['jun/26', ...], series: [{ nome, cor, valores: [..] }], fmt: v => 'R$ 1,00', altura })
   Devolve o HTML; o desenho acontece depois do render (ativarGraficos). Uma série só: sem legenda e com área. */
function graficoLinhas(cfg) {
  const id = 'graf' + (++grafSeq);
  GRAF.set(id, cfg);
  const legenda = cfg.series.length > 1
    ? `<div class="g-leg">${cfg.series.map(s => `<span><i style="background:${s.cor}"></i>${esc(s.nome)}</span>`).join('')}</div>` : '';
  return `<div class="grafico" id="${id}" data-grafico>${legenda}<div class="g-plot"></div><div class="g-tip" hidden></div></div>`;
}
function escalaBonita(min, max, alvo = 4) {
  if (max === min) max = min + 1;
  const bruto = (max - min) / alvo, p10 = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map(m => m * p10).find(s => s >= bruto) || 10 * p10;
  return { min: Math.floor(min / passo) * passo, max: Math.ceil(max / passo) * passo, passo };
}
function desenharGrafico(el) {
  const cfg = GRAF.get(el.id), plot = $('.g-plot', el), tip = $('.g-tip', el);
  if (!cfg || !plot) return;
  const W = Math.max(260, Math.floor(plot.clientWidth)), H = cfg.altura || 240;
  const fmt = cfg.fmt || (v => nf(v, 2)), n = cfg.rotulos.length, uma = cfg.series.length === 1;
  const mL = 48, mR = W < 480 ? 16 : 78, mT = 14, mB = 28;
  const todos = cfg.series.flatMap(s => s.valores.map(num));
  const e = escalaBonita(Math.min(0, ...todos), Math.max(0, ...todos));
  const x = i => mL + (n <= 1 ? (W - mL - mR) / 2 : i * (W - mL - mR) / (n - 1));
  const y = v => mT + (H - mT - mB) * (1 - (num(v) - e.min) / (e.max - e.min));
  // rótulos do eixo: cfg.fmtEixo(v) quando informado (ex.: gramas); senão números redondos, em "mil" quando passam de 10 mil
  const compacto = cfg.fmtEixo || (v => (Math.abs(e.max) >= 10000 || Math.abs(e.min) >= 10000) ? nf(v / 1000, 1) + ' mil' : nf(v, e.passo < 1 ? 2 : 0));
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="${esc(cfg.titulo || 'Gráfico')} — use as setas para percorrer os meses">`;
  for (let v = e.min; v <= e.max + e.passo / 2; v += e.passo) {
    const yy = Math.round(y(v)) + 0.5, zero = Math.abs(v) < e.passo / 1e6;
    svg += `<line x1="${mL}" x2="${W - mR}" y1="${yy}" y2="${yy}" class="${zero ? 'g-eixo' : 'g-grade'}"/><text x="${mL - 8}" y="${yy + 4}" text-anchor="end" class="g-txt">${compacto(zero ? 0 : v)}</text>`;
  }
  const pulo = Math.ceil(46 / Math.max(1, (W - mL - mR) / Math.max(1, n - 1)));
  cfg.rotulos.forEach((r, i) => { if ((n - 1 - i) % pulo === 0) svg += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="g-txt">${esc(r)}</text>`; });
  cfg.series.forEach(s => {
    const pts = s.valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    if (uma && n > 1) svg += `<polygon points="${x(0).toFixed(1)},${y(0).toFixed(1)} ${pts.join(' ')} ${x(n - 1).toFixed(1)},${y(0).toFixed(1)}" fill="${s.cor}" opacity=".1"/>`;
    if (n > 1) svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  });
  // marcador e valor no último ponto; valores que colidiriam ficam só na legenda, no toque e na tabela
  const usados = [];
  cfg.series.forEach(s => {
    const v = s.valores[n - 1], yy = y(v);
    svg += `<circle cx="${x(n - 1)}" cy="${yy}" r="4.5" fill="${s.cor}" class="g-anel"/>`;
    if (mR >= 60 && !usados.some(u => Math.abs(u - yy) < 15)) { usados.push(yy); svg += `<text x="${x(n - 1) + 10}" y="${yy + 4}" class="g-val">${esc(fmt(v))}</text>`; }
  });
  svg += `<g class="g-hover" visibility="hidden"><line y1="${mT}" y2="${H - mB}" class="g-mira"/>${cfg.series.map(s => `<circle r="4.5" fill="${s.cor}" class="g-anel"/>`).join('')}</g></svg>`;
  plot.innerHTML = svg;

  const el_svg = $('svg', plot), hover = $('.g-hover', el_svg), mira = $('line', hover), dots = $$('circle', hover);
  let atual = -1;
  const mostrar = i => {
    i = Math.max(0, Math.min(n - 1, i));
    atual = i;
    hover.setAttribute('visibility', 'visible');
    mira.setAttribute('x1', x(i)); mira.setAttribute('x2', x(i));
    dots.forEach((d, k) => { d.setAttribute('cx', x(i)); d.setAttribute('cy', y(cfg.series[k].valores[i])); });
    tip.innerHTML = `<b>${esc(cfg.rotulos[i])}</b>` + cfg.series.map(s => `<div><i style="background:${s.cor}"></i><span>${esc(s.nome)}</span><strong>${esc(fmt(s.valores[i]))}</strong></div>`).join('');
    tip.hidden = false;
    const larg = tip.offsetWidth, px = plot.offsetLeft + x(i);
    tip.style.left = Math.max(0, Math.min(el.clientWidth - larg, px + (px + larg + 16 > el.clientWidth ? -larg - 12 : 12))) + 'px';
    tip.style.top = (plot.offsetTop + mT) + 'px';
  };
  const esconder = () => { atual = -1; hover.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  const indice = ev => { const r = el_svg.getBoundingClientRect(); return n <= 1 ? 0 : Math.round((ev.clientX - r.left - mL) / ((W - mL - mR) / (n - 1))); };
  el_svg.addEventListener('pointermove', ev => mostrar(indice(ev)));
  el_svg.addEventListener('pointerdown', ev => mostrar(indice(ev)));
  el_svg.addEventListener('pointerleave', esconder);
  el_svg.addEventListener('focus', () => { if (atual < 0) mostrar(n - 1); });
  el_svg.addEventListener('blur', esconder);
  el_svg.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowLeft') { mostrar((atual < 0 ? n : atual) - 1); ev.preventDefault(); }
    else if (ev.key === 'ArrowRight') { mostrar((atual < 0 ? -1 : atual) + 1); ev.preventDefault(); }
    else if (ev.key === 'Escape') esconder();
  });
}
function ativarGraficos() {
  const vivos = new Set();
  $$('[data-grafico]').forEach(el => { vivos.add(el.id); desenharGrafico(el); });
  [...GRAF.keys()].forEach(k => { if (!vivos.has(k)) GRAF.delete(k); });
}
let grafResize = null;
window.addEventListener('resize', () => { clearTimeout(grafResize); grafResize = setTimeout(() => $$('[data-grafico]').forEach(desenharGrafico), 160); });

/* barrasRank([{ nome, valor, detalhe, cor, dica }], { fmt, vazio })
   Barras horizontais ordenadas, uma por linha, com o valor escrito ao lado (a própria lista é a tabela).
   Valores negativos crescem para a esquerda da linha de base, em vermelho. */
function barrasRank(linhas, o = {}) {
  if (!linhas.length) return `<div class="empty">${esc(o.vazio || 'Sem dados no período.')}</div>`;
  const fmt = o.fmt || brl, vals = linhas.map(l => num(l.valor));
  const min = Math.min(0, ...vals), max = Math.max(0, ...vals), span = (max - min) || 1, zero = -min / span * 100;
  return `<div class="rank">${linhas.map(l => {
    const v = num(l.valor), w = Math.abs(v) / span * 100, left = v >= 0 ? zero : zero - w;
    return `<div class="rank-row"${l.dica ? ` title="${esc(l.dica)}"` : ''}>
      <div class="rank-nome">${l.cor ? `<span class="dot" style="background:${esc(l.cor)}"></span>` : ''}<span>${esc(l.nome)}</span>${l.detalhe ? `<small>${esc(l.detalhe)}</small>` : ''}</div>
      <div class="rank-bar">${min < 0 ? `<b style="left:${zero}%"></b>` : ''}<i class="${v < 0 ? 'neg' : ''}" style="left:${left}%;width:${w}%"></i></div>
      <div class="rank-val num">${esc(fmt(v))}</div></div>`;
  }).join('')}</div>`;
}
