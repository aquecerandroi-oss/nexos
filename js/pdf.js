/* Nexos — PDF do orçamento feito no próprio navegador: um arquivo .pdf de verdade, que baixa direto (no celular dá
   para mandar pelo WhatsApp), sem depender da janela de impressão e sem biblioteca de fora (a CSP só deixa rodar
   arquivos do próprio site). Monta um PDF 1.4 com as fontes padrão Helvetica e Helvetica-Bold, que todo leitor de
   PDF tem, na codificação WinAnsi (tem todos os acentos do português), mais linhas, retângulos e a logo em JPEG.
   Tudo que é global neste arquivo começa com "pdf". */
'use strict';

/* Largura de cada caractere, em milésimos do tamanho da letra, para os códigos 32 a 255 da WinAnsi (métricas
   oficiais AFM da Helvetica e da Helvetica-Bold). Servem para alinhar à direita e para quebrar as linhas. */
const pdfLarguras = (() => {
  const r = (v, n) => Array(n).fill(v);
  return {
    F1: [
      278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, ...r(556, 10), 278, 278, 584, 584, 584, 556, 1015,
      667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
      278, 278, 278, 469, 556, 333,
      556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
      334, 260, 334, 584, 0,
      556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0,
      0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667,
      278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333,
      400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611,
      ...r(667, 6), 1000, 722, ...r(667, 4), ...r(278, 4), 722, 722, ...r(778, 5), 584, 778, ...r(722, 4), 667, 667, 611,
      ...r(556, 6), 889, 500, ...r(556, 4), ...r(278, 4), 556, 556, ...r(556, 5), 584, 611, ...r(556, 4), 500, 556, 500,
    ],
    F2: [
      278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, ...r(556, 10), 333, 333, 584, 584, 584, 611, 975,
      722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
      333, 278, 333, 584, 556, 333,
      556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500,
      389, 280, 389, 584, 0,
      556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0,
      0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667,
      278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333,
      400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611,
      ...r(722, 6), 1000, 722, ...r(667, 4), ...r(278, 4), 722, 722, ...r(778, 5), 584, 778, ...r(722, 4), 667, 667, 611,
      ...r(556, 6), 889, 556, ...r(556, 4), ...r(278, 4), 611, 611, ...r(611, 5), 584, 611, ...r(611, 4), 556, 611, 556,
    ],
  };
})();

/* Caracteres fora do Latin-1 que a WinAnsi tem (aspas curvas, travessão, reticências, euro…) e equivalentes. */
const pdfWinAnsi = new Map([
  [0x20AC, 128], [0x201A, 130], [0x0192, 131], [0x201E, 132], [0x2026, 133], [0x2020, 134], [0x2021, 135], [0x02C6, 136],
  [0x2030, 137], [0x0160, 138], [0x2039, 139], [0x0152, 140], [0x017D, 142], [0x2018, 145], [0x2019, 146], [0x201C, 147],
  [0x201D, 148], [0x2022, 149], [0x2013, 150], [0x2014, 151], [0x02DC, 152], [0x2122, 153], [0x0161, 154], [0x203A, 155],
  [0x0153, 156], [0x017E, 158], [0x0178, 159],
  [0x2212, 45], [0x2010, 45], [0x2011, 45], [0x2012, 150], [0x2015, 151],                       // sinais de menos e traços
  [0x2002, 32], [0x2003, 32], [0x2004, 32], [0x2005, 32], [0x2006, 32], [0x2008, 32], [0x2009, 32], [0x200A, 32],
  [0x205F, 32], [0x3000, 32], [0x2007, 160], [0x202F, 160],                                     // espaços (os que não quebram seguem sem quebrar)
]);
/* Símbolos que a WinAnsi não tem, trocados por um equivalente legível (já em códigos WinAnsi; \x95 é o marcador •). */
const pdfEquivalentes = new Map([
  [0x2248, '~'], [0x2192, '->'], [0x2190, '<-'], [0x2194, '<->'], [0x21D2, '=>'], [0x2264, '<='], [0x2265, '>='], [0x2260, '<>'],
  [0x2713, '\x95'], [0x2714, '\x95'], [0x2611, '\x95'], [0x2705, '\x95'], [0x25AA, '\x95'], [0x25A0, '\x95'], [0x25CF, '\x95'],
  [0x25E6, '\x95'], [0x25CB, '\x95'], [0x25B8, '\x95'], [0x25BA, '\x95'], [0x2717, 'x'], [0x2718, 'x'], [0x274C, 'x'],
  [0x2605, '*'], [0x2606, '*'], [0x2032, "'"], [0x2033, '"'], [0x2044, '/'], [0x2215, '/'], [0x2236, ':'],
  [0x03BC, '\xb5'], [0x2300, '\xd8'], [0x2205, '\xd8'], [0x2610, '[ ]'], [0x25A1, '[ ]'], [0x2191, '^'], [0x2193, 'v'],
  [0x221E, 'inf.'], [0x221A, 'raiz de '], [0x03A9, 'Ohm'], [0x03C0, 'pi'], [0x0394, 'Delta'], [0x2261, '='], [0x21D0, '<='],
  [0x21D4, '<=>'], [0x25B2, '\x95'], [0x25BC, '\x95'], [0x25C6, '\x95'], [0x2023, '\x95'], [0x2043, '\x95'],
]);
const pdfInvisiveis = new Set([0x00AD, 0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x2060, 0xFEFF]);
const pdfMarcas = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36F) + ']');   // acentos soltos (NFKD)
/* Emoji não existe nas fontes padrão do PDF: some do texto em vez de virar "?". (Navegador antigo que não conhece
   essas classes de caractere fica só com os seletores de variação.) */
const pdfEmoji = (() => {
  try { return new RegExp('\\p{Extended_Pictographic}|\\p{Emoji_Modifier}|\\p{Regional_Indicator}|[\\uFE0E\\uFE0F\\u20E3]|[\\u{E0020}-\\u{E007F}]', 'u'); }
  catch (e) { return new RegExp('[' + String.fromCharCode(0xFE0E, 0xFE0F, 0x20E3) + ']'); }
})();
const pdfCod = c => ((c >= 32 && c <= 126) || (c >= 160 && c <= 255) ? c : (pdfWinAnsi.has(c) ? pdfWinAnsi.get(c) : -1));
/* Um caractere -> texto WinAnsi: ele mesmo, um equivalente legível, ou null. */
const pdfUm = c => { const k = pdfCod(c); return k >= 0 ? String.fromCharCode(k) : (pdfEquivalentes.has(c) ? pdfEquivalentes.get(c) : null); };
/* Texto -> códigos WinAnsi (0-255). O que não existe na WinAnsi vira um equivalente (≈ -> ~), a forma simples
   (ŭ -> u, ﬁ -> fi, ⅓ -> 1/3), some (emoji) ou vira "?". Quebra de linha e tabulação viram espaço (quem precisa
   de linhas separadas usa pdfQuebrar). */
function pdfCodificar(txt) {
  let out = '';
  for (const ch of String(txt ?? '').normalize('NFC')) {
    const c = ch.codePointAt(0);
    if (c === 9 || c === 10 || c === 13) { out += ' '; continue; }
    if (c < 32 || (c >= 127 && c < 160) || pdfInvisiveis.has(c)) continue;
    let s = pdfUm(c);
    if (s === null) {
      const partes = [...ch.normalize('NFKD')].filter(x => !pdfMarcas.test(x)).map(x => pdfUm(x.codePointAt(0)));
      s = partes.length && partes.every(p => p !== null) ? partes.join('') : (pdfEmoji.test(ch) ? '' : '?');
    }
    out += s;
  }
  return out;
}
const pdfEscapar = s => s.replace(/[\\()]/g, '\\$&');
/* Largura em pontos de um texto já codificado. tc = espaço extra entre as letras (não conta depois da última). */
function pdfMedir(cod, fonte, tam, tc = 0) {
  const L = pdfLarguras[fonte];
  let w = 0;
  for (let i = 0; i < cod.length; i++) w += L[cod.charCodeAt(i) - 32] || 0;
  return w * tam / 1000 + (cod.length > 1 ? tc * (cod.length - 1) : 0);
}
/* Quebra o texto em linhas que cabem na largura (em pontos), respeitando as quebras de linha digitadas e o recuo
   do começo de cada linha (uma lista recuada continua recuada, inclusive nas linhas que quebram). A palavra que
   sozinha não cabe é cortada. Devolve as linhas já codificadas (linha digitada em branco continua em branco). */
function pdfQuebrar(txt, fonte, tam, largura) {
  const linhas = [];
  String(txt ?? '').replace(/\r\n?/g, '\n').split('\n').forEach(par => {
    const m = /^[ \t]+/.exec(par);
    const recuo = m ? '\xa0'.repeat(Math.min(24, m[0].replace(/\t/g, '    ').length)) : '';
    const larg = Math.max(largura / 2, largura - pdfMedir(recuo, fonte, tam));
    const palavras = pdfCodificar(m ? par.slice(m[0].length) : par).split(/ +/).filter(Boolean);
    if (!palavras.length) { linhas.push(''); return; }
    const fecha = l => linhas.push(recuo + l);
    let atual = '';
    for (let p of palavras) {
      const junto = atual ? atual + ' ' + p : p;
      if (pdfMedir(junto, fonte, tam) <= larg) { atual = junto; continue; }
      if (atual) fecha(atual);
      while (p.length > 1 && pdfMedir(p, fonte, tam) > larg) {
        let n = p.length - 1;
        while (n > 1 && pdfMedir(p.slice(0, n), fonte, tam) > larg) n--;
        fecha(p.slice(0, n));
        p = p.slice(n);
      }
      atual = p;
    }
    if (atual) fecha(atual);
  });
  return linhas;
}
/* Texto fora do conteúdo da página (título e autor do arquivo): UTF-16 com marca, aceita qualquer caractere. */
const pdfTextoUnicode = s => {
  s = String(s ?? '');
  let h = '<FEFF';
  for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
  return h + '>';
};
const pdfDataArquivo = (t = new Date()) => {
  const z = v => String(v).padStart(2, '0'), off = -t.getTimezoneOffset(), a = Math.abs(off);
  return `D:${t.getFullYear()}${z(t.getMonth() + 1)}${z(t.getDate())}${z(t.getHours())}${z(t.getMinutes())}${z(t.getSeconds())}${off >= 0 ? '+' : '-'}${z(Math.floor(a / 60))}'${z(a % 60)}'`;
};
/* Nome de arquivo que todo sistema aceita: sem \ / : * ? " < > | nem controles, e com .pdf no fim. */
const pdfNomeArquivo = t => (String(t ?? '').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f\x7f]+/g, '-')
  .replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 120).trim() || 'Orçamento') + '.pdf';

/* ---------- Página e montagem do arquivo ---------- */
/* Página A4 em pontos. y conta de cima para baixo, como na tela (o PDF conta de baixo para cima). */
function pdfDocumento() {
  const W = 595.28, H = 841.89, paginas = [];
  let ops = null;
  const n = v => String(Math.round(v * 100) / 100);
  const rgb = c => c.map(v => n(v / 255)).join(' ');
  return {
    W, H, paginas,
    novaPagina() { ops = []; paginas.push(ops); },
    irPara(i) { ops = paginas[i]; },
    texto(x, yBase, cod, o = {}) {
      if (!cod) return;
      const fonte = o.fonte || 'F1', tam = o.tam || 10, tc = o.tc || 0;
      const w = o.alinha ? pdfMedir(cod, fonte, tam, tc) : 0;
      const x0 = o.alinha === 'dir' ? x - w : o.alinha === 'meio' ? x - w / 2 : x;
      ops.push(`BT /${fonte} ${n(tam)} Tf ${n(tc)} Tc ${rgb(o.cor || [17, 17, 17])} rg ${n(x0)} ${n(H - yBase)} Td (${pdfEscapar(cod)}) Tj ET`);
    },
    linha(x1, y1, x2, y2, larg, cor) { ops.push(`${rgb(cor)} RG ${n(larg)} w ${n(x1)} ${n(H - y1)} m ${n(x2)} ${n(H - y2)} l S`); },
    retangulo(x, y, w, h, cor) { ops.push(`${rgb(cor)} rg ${n(x)} ${n(H - y - h)} ${n(w)} ${n(h)} re f`); },
    /* retângulo de cantos arredondados, só a borda */
    contorno(x, y, w, h, r, larg, cor) {
      const k = r * 0.5523, x1 = x + w, yb = H - y - h, yt = H - y;
      const p = [[x + r, yt, 'm'], [x1 - r, yt, 'l'], [x1 - r + k, yt, x1, yt - r + k, x1, yt - r, 'c'], [x1, yb + r, 'l'],
        [x1, yb + r - k, x1 - r + k, yb, x1 - r, yb, 'c'], [x + r, yb, 'l'], [x + r - k, yb, x, yb + r - k, x, yb + r, 'c'],
        [x, yt - r, 'l'], [x, yt - r + k, x + r - k, yt, x + r, yt, 'c']];
      ops.push(`${rgb(cor)} RG ${n(larg)} w ` + p.map(s => s.slice(0, -1).map(n).join(' ') + ' ' + s[s.length - 1]).join(' ') + ' h S');
    },
    imagem(nome, x, y, w, h) { ops.push(`q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(H - y - h)} cm /${nome} Do Q`); },
  };
}
/* Junta páginas, fontes e imagens num arquivo PDF 1.4 (tabela xref com a posição exata de cada objeto). */
function pdfMontar(paginas, imagens, info) {
  const objs = [];
  const add = s => { objs.push(s); return objs.length; };
  const catalogo = add(''), arvore = add('');
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const xobj = imagens.map(im => `/${im.nome} ${add(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.dados.length} >>\nstream\n${im.dados}\nendstream`)} 0 R`).join(' ');
  const recursos = `<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${xobj ? ` /XObject << ${xobj} >>` : ''} /ProcSet [/PDF /Text${xobj ? ' /ImageC' : ''}] >>`;
  const kids = paginas.map(ops => {
    const conteudo = ops.join('\n');
    const c = add(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`);
    return add(`<< /Type /Page /Parent ${arvore} 0 R /MediaBox [0 0 595.28 841.89] /Resources ${recursos} /Contents ${c} 0 R >>`);
  });
  objs[arvore - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  objs[catalogo - 1] = `<< /Type /Catalog /Pages ${arvore} 0 R /Lang (pt-BR) >>`;
  const infoN = add(`<< /Title ${pdfTextoUnicode(info.titulo)} /Author ${pdfTextoUnicode(info.autor)} /Creator (Nexos) /Producer (Nexos) /CreationDate (${pdfDataArquivo()}) >>`);
  const b = new Uint8Array(16);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  const id = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const pos = [];
  objs.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + pos.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogo} 0 R /Info ${infoN} 0 R /ID [<${id}> <${id}>] >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
}

/* ---------- Logo ---------- */
function pdfCarregarImagem(src) {
  return new Promise(resolve => {
    const img = new Image();
    const desiste = setTimeout(() => resolve(null), 8000);
    img.onload = () => { clearTimeout(desiste); resolve(img.naturalWidth && img.naturalHeight ? img : null); };
    img.onerror = () => { clearTimeout(desiste); resolve(null); };
    img.src = src;
  });
}
function pdfCanvasJPEG(c) {
  const url = c.toDataURL('image/jpeg', 0.92);
  if (!/^data:image\/jpeg;base64,/.test(url)) return null;                 // navegador que não gera JPEG
  return { dados: atob(url.slice(url.indexOf(',') + 1)), w: c.width, h: c.height };
}
/* Logo pronta para o PDF (JPEG não tem transparência): a da empresa (Perfil) sobre fundo branco, ou a da Nexos
   dentro da caixa escura de cantos arredondados, como na impressão. null se a imagem não carregar. */
async function pdfMontarLogo(propria) {
  try {
    const img = await pdfCarregarImagem(propria || 'img/logo.webp');
    if (!img) return null;
    const c = document.createElement('canvas'), g = c.getContext('2d');
    if (propria) {
      const k = Math.min(1, 720 / Math.max(img.naturalWidth, img.naturalHeight));
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      const j = pdfCanvasJPEG(c);
      if (!j) return null;
      const s = Math.min(170 / j.w, 64 / j.h);
      return { ...j, larguraPt: j.w * s, alturaPt: j.h * s };
    }
    const HB = 180, lh = 138, lw = Math.round(lh * img.naturalWidth / img.naturalHeight), px = 33, r = 24;
    c.width = lw + 2 * px; c.height = HB;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#0b0b0e';
    g.beginPath();
    g.moveTo(r, 0); g.arcTo(c.width, 0, c.width, HB, r); g.arcTo(c.width, HB, 0, HB, r); g.arcTo(0, HB, 0, 0, r); g.arcTo(0, 0, c.width, 0, r);
    g.closePath(); g.fill();
    g.drawImage(img, px, (HB - lh) / 2, lw, lh);
    const j = pdfCanvasJPEG(c);
    return j ? { ...j, larguraPt: j.w * 60 / HB, alturaPt: 60 } : null;
  } catch (e) { console.warn('Logo fora do PDF', e); return null; }
}
/* A logo fica pronta uma vez só e é reaproveitada nos próximos PDFs (a tela de Orçamentos já começa a prepará-la).
   Se não carregar, sai da memória para tentar de novo no próximo PDF. */
const pdfLogos = new Map();
function pdfPrepararLogo(logoPerfil) {
  const propria = logoSegura(logoPerfil), chave = propria || 'nexos';
  if (!pdfLogos.has(chave)) {
    if (pdfLogos.size >= 3) pdfLogos.delete(pdfLogos.keys().next().value);
    pdfLogos.set(chave, pdfMontarLogo(propria).then(r => { if (!r) pdfLogos.delete(chave); return r; }));
  }
  return pdfLogos.get(chave);
}

/* ---------- O orçamento ---------- */
/* d: os dados já formatados (comDadosOrcamento). logo: pdfPrepararLogo ou null. Devolve os bytes do arquivo. */
function pdfOrcamento(d, logo) {
  const doc = pdfDocumento(), { W, H } = doc, C = pdfCodificar;
  const ML = 42, XR = W - 42, CW = XR - ML, TOPO = 42, FIM = H - 62;
  const PRETO = [17, 17, 17], TEXTO = [51, 51, 51], CINZA = [85, 85, 85], ROTULO = [119, 119, 119], FIO = [221, 221, 221],
    VERMELHO = [227, 24, 45], BRANCO = [255, 255, 255];
  let y = TOPO;
  const pagina = () => { doc.novaPagina(); y = TOPO; };
  pagina();

  // Cabeçalho: a logo (sem ela, o nome da empresa em destaque) à esquerda e os dados da empresa à direita
  let nomeGrande = null, larguraEsq, hEsq;
  if (logo) { larguraEsq = logo.larguraPt; hEsq = logo.alturaPt; }
  else {
    let tam = 16, ls = pdfQuebrar(d.empresa, 'F2', tam, CW * 0.48);
    while (ls.length > 2 && tam > 11) { tam -= 1; ls = pdfQuebrar(d.empresa, 'F2', tam, CW * 0.48); }
    if (ls.length > 3) ls = [ls[0], ls[1], ls[2].replace(/.?$/, '\x85')];
    nomeGrande = { ls, tam };
    larguraEsq = Math.max(...ls.map(l => pdfMedir(l, 'F2', tam)));
    hEsq = ls.length * tam * 1.22;
  }
  const larguraEmp = Math.max(140, CW - larguraEsq - 24);
  const linhasEmp = [
    ...(logo ? pdfQuebrar(d.empresa, 'F2', 11, larguraEmp).map(t => ({ t, fonte: 'F2', tam: 11, cor: PRETO })) : []),
    ...d.empresaLinhas.flatMap(x => pdfQuebrar(x, 'F1', 9, larguraEmp)).map(t => ({ t, fonte: 'F1', tam: 9, cor: [68, 68, 68] })),
  ];
  const hEmp = linhasEmp.length * 13, hCab = Math.max(hEsq, hEmp, 26);
  if (logo) doc.imagem('Im1', ML, y + (hCab - hEsq) / 2, logo.larguraPt, logo.alturaPt);
  else nomeGrande.ls.forEach((l, i) => doc.texto(ML, y + (hCab - hEsq) / 2 + nomeGrande.tam * 0.95 + i * nomeGrande.tam * 1.22, l, { fonte: 'F2', tam: nomeGrande.tam, cor: PRETO }));
  linhasEmp.forEach((l, i) => doc.texto(XR, y + (hCab - hEmp) / 2 + 10 + i * 13, l.t, { fonte: l.fonte, tam: l.tam, cor: l.cor, alinha: 'dir' }));
  y += hCab + 12;
  doc.linha(ML, y, XR, y, 2.6, VERMELHO);
  y += 26;

  doc.texto(ML, y + 14, C(`Orçamento nº ${d.numero}`), { fonte: 'F2', tam: 19, cor: PRETO });
  y += 22;
  doc.texto(ML, y + 9, C(`Emitido em ${d.emitido}${d.validade ? ' · Válido até ' + d.validade : ''}`), { tam: 9.5, cor: CINZA });
  y += 24;

  // Cliente, contato, prazo e pagamento em duas colunas
  const colW = (CW - 24) / 2;
  const celula = (x, rotulo, valor) => {
    const linhas = pdfQuebrar(String(valor ?? '').trim() || '—', 'F1', 10, colW);
    return {
      altura: 13 + linhas.length * 13,
      desenhar: y0 => {
        doc.texto(x, y0 + 7, C(rotulo.toUpperCase()), { tam: 7, cor: ROTULO, tc: 0.7 });
        linhas.forEach((l, i) => doc.texto(x, y0 + 21 + i * 13, l, { tam: 10, cor: PRETO }));
      },
    };
  };
  [[['Cliente', d.cliente], ['Contato', d.contato]], [['Prazo de entrega', d.prazo], ['Forma de pagamento', d.pagamento]]].forEach(([a, b]) => {
    const ca = celula(ML, a[0], a[1]), cb = celula(ML + colW + 24, b[0], b[1]), h = Math.max(ca.altura, cb.altura);
    if (y + h > FIM) pagina();
    ca.desenhar(y); cb.desenhar(y);
    y += h + 8;
  });
  y += 6;

  // Itens: o cabeçalho da tabela se repete em cada página; item longo continua na página seguinte
  const wQ = 52, wU = 88, wT = 92, wD = CW - wQ - wU - wT;
  const xQ = ML + wD + wQ - 8, xU = ML + wD + wQ + wU - 8, xT = XR - 9;
  const cabecalho = () => {
    doc.retangulo(ML, y, CW, 22, PRETO);
    const o = { fonte: 'F2', tam: 7.5, cor: BRANCO, tc: 0.5 };
    doc.texto(ML + 9, y + 14.2, C('DESCRIÇÃO'), o);
    doc.texto(xQ, y + 14.2, C('QTD'), { ...o, alinha: 'dir' });
    doc.texto(xU, y + 14.2, C('VALOR UN.'), { ...o, alinha: 'dir' });
    doc.texto(xT, y + 14.2, C('TOTAL'), { ...o, alinha: 'dir' });
    y += 22;
  };
  const altura = n => n * 13 + 14;
  const itens = (d.itens || []).map(it => ({ it, linhas: pdfQuebrar(it.descricao, 'F1', 10, wD - 18) }));
  // a tabela só começa onde cabe junto com o primeiro item (ou com 4 linhas dele): nada de cabeçalho sozinho
  if (y + 22 + altura(itens.length ? Math.min(itens[0].linhas.length, 4) : 1) > FIM) pagina();
  cabecalho();
  itens.forEach(({ it, linhas }) => {
    let i = 0;
    do {
      const resto = linhas.length - i, cabem = Math.floor((FIM - y - 14) / 13);
      // item curto não se divide; item longo só se divide deixando pelo menos 3 linhas no fim da página
      if (cabem < resto && (resto <= 4 || cabem < 3)) { pagina(); cabecalho(); continue; }
      const parte = linhas.slice(i, i + Math.max(1, cabem));
      parte.forEach((l, k) => doc.texto(ML + 9, y + 16.5 + k * 13, l, { tam: 10, cor: PRETO }));
      if (i === 0) {
        const o = { tam: 10, cor: PRETO, alinha: 'dir' };
        doc.texto(xQ, y + 16.5, C(it.qtd), o);
        doc.texto(xU, y + 16.5, C(it.unit), o);
        doc.texto(xT, y + 16.5, C(it.total), o);
      }
      y += altura(parte.length);
      i += parte.length;
      if (i < linhas.length) { pagina(); cabecalho(); }
    } while (i < linhas.length);
    doc.linha(ML, y, XR, y, 0.6, FIO);
  });

  // Totais, alinhados à direita
  const hTot = 18 + (d.desconto ? 18 : 0) + 10 + 24 + (d.sinal ? 34 : 0);
  y += 14;
  if (y + hTot > FIM) pagina();
  const x0 = XR - 236;
  const linhaTot = (rotulo, valor, tam = 9.5, cor = TEXTO) => {
    doc.texto(x0, y + 12, C(rotulo), { tam, cor });
    doc.texto(XR, y + 12, C(valor), { tam, cor, alinha: 'dir' });
  };
  linhaTot('Subtotal', d.subtotal); y += 18;
  if (d.desconto) { linhaTot('Desconto', d.desconto); y += 18; }
  doc.linha(x0, y + 3, XR, y + 3, 1.6, PRETO);
  y += 10;
  doc.texto(x0, y + 15, C('Total'), { fonte: 'F2', tam: 14, cor: PRETO });
  doc.texto(XR, y + 15, C(d.total), { fonte: 'F2', tam: 14, cor: VERMELHO, alinha: 'dir' });
  y += 24;
  if (d.sinal) {
    linhaTot(d.sinal.rotulo, d.sinal.valor, 9, [68, 68, 68]); y += 17;
    linhaTot('Restante na entrega', d.sinal.restante, 9, [68, 68, 68]); y += 17;
  }

  // Observações numa caixa; se não couberem, continuam na página seguinte
  const obsTxt = String(d.obs ?? '').replace(/^\s*\n|\s+$/g, '');
  const obs = obsTxt ? pdfQuebrar(obsTxt, 'F1', 9.5, CW - 24) : [];
  if (obs.length) {
    y += 16;
    let i = 0, primeira = true;
    while (i < obs.length) {
      const cabem = Math.floor((FIM - y - 20 - (primeira ? 16 : 0)) / 13);
      if (cabem < 1) { pagina(); continue; }
      const parte = obs.slice(i, i + cabem), h = 20 + (primeira ? 16 : 0) + parte.length * 13;
      doc.contorno(ML, y, CW, h, 6, 0.75, FIO);
      let yy = y + 10;
      if (primeira) { doc.texto(ML + 12, yy + 9.5, C('Observações'), { fonte: 'F2', tam: 9.5, cor: PRETO }); yy += 16; }
      parte.forEach((l, k) => doc.texto(ML + 12, yy + 9.5 + k * 13, l, { tam: 9.5, cor: TEXTO }));
      y += h; i += parte.length; primeira = false;
      if (i < obs.length) pagina();
    }
  }

  // Rodapé em todas as páginas ("Página 1 de 2" quando tem mais de uma). Rodapé comprido: a letra diminui até
  // caber em 2 linhas; se nem assim, termina em "…". Nunca sobra um "·" solto na ponta da linha.
  const total = doc.paginas.length, larguraRod = total > 1 ? CW - 120 : CW;
  let tamRod = 8, rodape = pdfQuebrar(d.rodape, 'F1', tamRod, larguraRod);
  while (rodape.length > 2 && tamRod > 6.5) { tamRod -= 0.5; rodape = pdfQuebrar(d.rodape, 'F1', tamRod, larguraRod); }
  const limpa = l => l.replace(/^[ \xa0\xb7]+|[ \xa0\xb7]+$/g, '');
  rodape = rodape.map(limpa);
  if (rodape.length > 2) {
    let l = rodape[1];
    while (l && pdfMedir(l + ' \x85', 'F1', tamRod) > larguraRod) l = l.slice(0, -1);
    rodape = [rodape[0], limpa(l) + ' \x85'];
  }
  const centro = total > 1 ? ML + larguraRod / 2 : W / 2;
  for (let p = 0; p < total; p++) {
    doc.irPara(p);
    doc.linha(ML, H - 46, XR, H - 46, 0.6, FIO);
    rodape.forEach((l, k) => doc.texto(centro, H - 33 + k * 10, l, { tam: tamRod, cor: [102, 102, 102], alinha: 'meio' }));
    if (total > 1) doc.texto(XR, H - 33, C(`Página ${p + 1} de ${total}`), { tam: 8, cor: ROTULO, alinha: 'dir' });
  }

  const imagens = logo ? [{ nome: 'Im1', dados: logo.dados, w: logo.w, h: logo.h }] : [];
  return pdfMontar(doc.paginas, imagens, { titulo: d.titulo, autor: d.empresa });
}

/* ---------- Entrega do arquivo ---------- */
/* No computador baixa direto. No celular, quando o navegador sabe compartilhar arquivo, abre uma janela com
   "Enviar" (WhatsApp, e-mail…) e "Baixar": compartilhar precisa de um toque da pessoa. aviso: texto extra
   (por exemplo, que a logo não carregou). */
let pdfPronto = null;
function pdfEntregar(bytes, nome, aviso = '') {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  let arquivo = null, compartilha = false;
  try { arquivo = new File([blob], nome, { type: 'application/pdf' }); } catch (e) { arquivo = null; }
  try {
    const toque = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    compartilha = toque && !!arquivo && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] });
  } catch (e) { compartilha = false; }
  // outra janela aberta enquanto o PDF era montado (um formulário, por exemplo): não abre por cima, baixa direto
  if (!compartilha || document.querySelector('#modal.open')) return pdfBaixar(blob, nome, aviso);
  pdfPronto = { blob, arquivo, nome, aviso };
  abrirModal(`<p>O orçamento está pronto em PDF.</p><p class="hint">${esc(nome)} · ${tamanhoFmt(blob.size)}</p>${aviso ? `<p class="hint">${esc(aviso)}</p>` : ''}
    <div class="rowbtns mt"><button type="button" class="btn" onclick="pdfCompartilhar()">Enviar (WhatsApp, e-mail…)</button>
    <button type="button" class="btn ghost" onclick="pdfBaixarPronto()">Baixar</button></div>`, { title: 'PDF do orçamento' });
}
let pdfCompartilhando = false;
async function pdfCompartilhar() {
  const p = pdfPronto;
  if (!p) return fecharModal();
  if (pdfCompartilhando) return;                                           // toque repetido enquanto a lista de apps abre
  pdfCompartilhando = true;
  try {
    await navigator.share({ files: [p.arquivo], title: p.nome.replace(/\.pdf$/i, '') });
    pdfPronto = null;
    fecharModal();
  } catch (e) {
    // fechou a lista de apps (ou um compartilhamento anterior ainda estava aberto): a janela continua
    if (e && (e.name === 'AbortError' || e.name === 'InvalidStateError')) return;
    console.warn('Não foi possível compartilhar o PDF', e);
    pdfBaixarPronto();
  } finally {
    pdfCompartilhando = false;
  }
}
function pdfBaixarPronto() {
  const p = pdfPronto;
  pdfPronto = null;
  fecharModal();
  if (p) pdfBaixar(p.blob, p.nome, p.aviso);
}
function pdfBaixar(blob, nome, aviso = '') {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = nome; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast(`PDF baixado: ${nome}${aviso ? ' ' + aviso : ''}`);
}
