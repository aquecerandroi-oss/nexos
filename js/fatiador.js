/* Nexos — leitor do arquivo que sai do fatiador (Bambu Studio, OrcaSlicer, PrusaSlicer e Cura).
   Abre o .3mf fatiado (.gcode.3mf) ou o G-code e devolve o tempo de impressão e o peso de filamento
   de cada placa, para o cadastro de produto se preencher sozinho. Sem biblioteca: o ZIP é lido aqui mesmo.
   Só duas funções ficam globais: lerArquivoFatiado(arquivo) e fatTempoTexto(texto).
   Teste: node tests/fatiador/testar.mjs */
'use strict';

(function () {
  /* ---------- Limites ---------- */
  const FAT_CABECA = 1024 * 1024;            // lido do começo do G-code (Bambu e Orca põem tempo e cores ali)
  const FAT_CAUDA = 1024 * 1024;             // lido do fim (Prusa, Orca e Cura põem os totais ali)
  const FAT_MAX_ENTRADA = 64 * 1024 * 1024;  // maior parte do .3mf que aceitamos descompactar
  const FAT_FIM_ZIP = 65557;                 // o fim do ZIP (22 bytes + comentário de até 65535) fica nesta faixa
  const FAT_DIAMETRO = 1.75, FAT_DENSIDADE = 1.24;  // fio padrão (PLA) para estimar o peso pelo comprimento

  const FAT_MSG = {
    semArquivo: 'Nenhum arquivo foi escolhido.',
    vazio: 'O arquivo está vazio.',
    abrir: 'Não consegui abrir o arquivo. Escolha o arquivo de novo.',
    estranho: 'Este arquivo não é um G-code nem um .3mf fatiado. Envie o arquivo que o fatiador exporta (.gcode ou .gcode.3mf).',
    modelo: 'Este é o modelo 3D, ainda sem fatiar. Fatie no Bambu Studio ou no OrcaSlicer e envie o G-code ou o arquivo fatiado da placa (.gcode.3mf).',
    bgcode: 'Este é um G-code binário (.bgcode) do PrusaSlicer, que ainda não sei ler. No PrusaSlicer, desligue o G-code binário nas configurações da impressora e exporte de novo.',
    danificado: 'O arquivo está danificado ou incompleto. Exporte de novo no fatiador.',
    navegador: 'Atualize o navegador para ler arquivos .3mf (este não sabe descompactar). Enquanto isso, envie o G-code.',
    protegido: 'Este .3mf está protegido por senha e não dá para ler. Envie o G-code.',
    compactacao: 'Este .3mf usa uma compactação que não sei ler. Exporte de novo no fatiador ou envie o G-code.',
    grande: 'Uma parte deste .3mf passa de 64 MB, grande demais para ler aqui. Envie o G-code.',
    gcodeGrande: 'O G-code dentro deste .3mf passa de 64 MB, grande demais para ler aqui. Exporte o G-code da placa e envie ele direto.',
    semFatiar: 'Este .3mf é o projeto, sem o resultado do fatiamento (tempo e peso). No Bambu Studio ou no OrcaSlicer, fatie e use Arquivo > Exportar para salvar o arquivo fatiado da placa (.gcode.3mf) ou o G-code, e envie esse arquivo.',
    prusa3mf: 'Este .3mf é um projeto do PrusaSlicer, que não guarda o tempo nem o peso. Exporte o G-code no PrusaSlicer e envie esse arquivo.',
    naoE3mf: 'Este arquivo compactado não é um .3mf do fatiador.',
    gcodeVazio: 'Não achei o tempo nem o peso neste G-code. Ele precisa vir do Bambu Studio, OrcaSlicer, PrusaSlicer ou Cura.',
    erro: 'Não consegui ler este arquivo. Ele pode estar danificado.',
    curaMetros: 'O Cura não informa o peso: calculei pelo comprimento do filamento, considerando PLA (1,24 g/cm³) em fio de 1,75 mm. Confira se usar outro material.',
    curaVolume: 'O Cura não informa o peso: calculei pelo volume de filamento, considerando PLA (1,24 g/cm³). Confira se usar outro material.',
    estimado: 'Parte do peso foi calculada pelo comprimento do filamento. Confira se puder.',
  };

  /* Linhas de tempo, na ordem de preferência (conferidas no código-fonte de cada fatiador). */
  const FAT_TEMPOS = [
    /^;[ \t]*model printing time:[^\n;]*;[ \t]*total estimated time:[ \t]*([^\n]+)$/im,  // Bambu e Orca, impressora Bambu
    /^;[ \t]*estimated printing time \(normal mode\)[ \t]*=[ \t]*([^\n]+)$/im,          // Prusa, Orca e Bambu (outras impressoras)
    /^;TIME:[ \t]*(\d+(?:\.\d+)?)[ \t]*$/m,                                             // Cura, em segundos
    /^;PRINT\.TIME:[ \t]*(\d+(?:\.\d+)?)[ \t]*$/m,                                      // Cura em impressora Ultimaker
  ];

  /* ---------- Entrada principal ---------- */
  /* Nunca lança erro: devolve { ok: true, origem, placas, avisos } ou { ok: false, erro }. */
  async function lerArquivoFatiado(arquivo) {
    try {
      if (!arquivo || typeof arquivo.slice !== 'function' || !(arquivo.size >= 0)) return fatErro(FAT_MSG.semArquivo);
      if (arquivo.size === 0) return fatErro(FAT_MSG.vazio);
      const ini = await fatBytes(arquivo, 0, Math.min(arquivo.size, 8192));
      if (fatComeca(ini, [0x50, 0x4b, 0x03, 0x04]) || fatComeca(ini, [0x50, 0x4b, 0x05, 0x06])) return await fatLer3mf(arquivo);
      if (fatComeca(ini, [0x47, 0x43, 0x44, 0x45])) return fatErro(FAT_MSG.bgcode);   // "GCDE"
      return await fatLerGcodeSolto(arquivo, ini);
    } catch (e) {
      if (e && e.fatAmigavel) return fatErro(e.message);
      if (e && (e.name === 'NotReadableError' || e.name === 'NotFoundError')) return fatErro(FAT_MSG.abrir);
      return fatErro(FAT_MSG.erro);
    }
  }

  /* Tempo escrito pelo fatiador -> horas decimais. "1d 2h 3m 4s", "2h 3m", "45m 10s", "1h", "3723" (segundos).
     Devolve NaN quando não entende. */
  function fatTempoTexto(txt) {
    let s;
    try { s = String(txt == null ? '' : txt).trim().toLowerCase(); } catch (e) { return NaN; }
    if (!s) return NaN;
    if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s) / 3600;
    const m = /^(?:(\d+(?:\.\d+)?)\s*d(?:ias?|ays?)?\s*)?(?:(\d+(?:\.\d+)?)\s*h(?:oras?|ours?)?\s*)?(?:(\d+(?:\.\d+)?)\s*m(?:in(?:utos?|utes?)?)?\s*)?(?:(\d+(?:\.\d+)?)\s*s(?:eg(?:undos?)?|ec(?:onds?)?)?)?$/.exec(s);
    if (!m || (m[1] === undefined && m[2] === undefined && m[3] === undefined && m[4] === undefined)) return NaN;
    const v = i => (m[i] === undefined ? 0 : Number(m[i]));
    return v(1) * 24 + v(2) + v(3) / 60 + v(4) / 3600;
  }

  /* ---------- .3mf do Bambu Studio e do OrcaSlicer ---------- */
  /* Metadata/slice_info.config: <plate> com <metadata key="index">, "prediction" (segundos inteiros),
     "weight" (gramas, 2 casas) e <filament id type color used_m used_g>. O projeto salvo normal não traz
     esses números: só o arquivo fatiado da placa (.gcode.3mf), que também guarda Metadata/plate_N.gcode. */
  async function fatLer3mf(arq) {
    const zip = await fatAbrirZip(arq);
    const achar = n => zip.get(n.toLowerCase());
    const eInfo = achar('Metadata/slice_info.config');
    const gcodes = new Map();
    zip.forEach(e => {
      const m = /^metadata\/plate_(\d+)\.gcode$/i.exec(e.nome);
      if (m && !gcodes.has(Number(m[1]))) gcodes.set(Number(m[1]), e);
    });
    if (!eInfo && !gcodes.size) {
      if (achar('Metadata/Slic3r_PE.config') || achar('Metadata/Slic3r_PE_model.config')) throw fatFalha(FAT_MSG.prusa3mf);
      if (achar('3D/3dmodel.model') || achar('[Content_Types].xml')) throw fatFalha(FAT_MSG.semFatiar);
      throw fatFalha(FAT_MSG.naoE3mf);
    }

    const infos = new Map();
    if (eInfo) for (const p of fatLerSliceInfo(await fatTextoEntrada(arq, eInfo))) if (!infos.has(p.indice)) infos.set(p.indice, p);
    const nomes = await fatNomesPlacas(arq, achar('Metadata/model_settings.config'));
    const indices = [...new Set([...infos.keys(), ...gcodes.keys()])].sort((a, b) => a - b);
    const avisos = [], placas = [];
    let gcodeGrande = false;
    for (const i of indices) {
      const info = infos.get(i), eG = gcodes.get(i);
      let horas = info ? info.horas : NaN, filamentos = info ? info.filamentos : [];
      if (info && info.estimado) fatAviso(avisos, FAT_MSG.estimado);
      // faltou número no slice_info: lê o cabeçalho do G-code que vem dentro
      if ((!(horas > 0) || !filamentos.length) && eG) {
        try {
          const g = fatLerTextoGcode(await fatTextoEntradaGcode(arq, eG));
          if (g) {
            if (!(horas > 0)) horas = g.horas;
            if (!filamentos.length) filamentos = g.filamentos;
            g.avisos.forEach(a => fatAviso(avisos, a));
          }
        } catch (e) {
          if (!e || e.fatCodigo !== 'grande') throw e;
          gcodeGrande = true;
          fatAviso(avisos, `O G-code da placa ${i} passa de 64 MB e não foi lido.`);
        }
      }
      if (!(horas > 0) && !filamentos.length) {
        fatAviso(avisos, `A placa ${i} não tem tempo nem peso no arquivo e ficou de fora.`);
        continue;
      }
      placas.push(fatMontarPlaca(i, nomes.get(i) || 'Placa ' + i, horas, filamentos, avisos, ' da placa ' + i));
    }
    if (!placas.length) throw fatFalha(gcodeGrande ? FAT_MSG.gcodeGrande : FAT_MSG.semFatiar);
    return { ok: true, origem: 'bambu-3mf', placas, avisos };
  }

  /* Lê as placas do slice_info.config. */
  function fatLerSliceInfo(xml) {
    const placas = [];
    fatBlocos(xml, 'plate').forEach((corpo, n) => {
      const meta = fatMetadados(corpo);
      const idx = parseInt(meta.index, 10);
      const seg = fatNumero(meta.prediction), peso = fatNumero(meta.weight);
      const filamentos = [];
      let estimado = false;
      for (const a of fatTags(corpo, 'filament')) {
        let g = fatNumero(a.used_g);
        const mt = fatNumero(a.used_m);
        if (!(g > 0) && !(mt > 0)) continue;
        if (!(g > 0)) { g = fatGramas(mt, FAT_DIAMETRO, FAT_DENSIDADE); estimado = true; }
        filamentos.push({ tipo: String(a.type || '').trim(), cor: fatCor(a.color), gramas: fatArred(g), metros: fatArred(mt > 0 ? mt : 0) });
      }
      // sem a lista de filamentos, vale o peso total da placa
      if (!filamentos.length && peso > 0) filamentos.push({ tipo: '', cor: '', gramas: fatArred(peso), metros: 0 });
      placas.push({ indice: idx > 0 ? idx : n + 1, horas: seg > 0 ? seg / 3600 : NaN, filamentos, estimado });
    });
    return placas;
  }

  /* Nome de cada placa (model_settings.config: plater_id e plater_name). Sem ele fica "Placa N". */
  async function fatNomesPlacas(arq, e) {
    const nomes = new Map();
    if (!e) return nomes;
    try {
      for (const corpo of fatBlocos(await fatTextoEntrada(arq, e), 'plate')) {
        const meta = fatMetadados(corpo);
        const i = parseInt(meta.plater_id, 10), nome = String(meta.plater_name || '').trim();
        if (i > 0 && nome && !nomes.has(i)) nomes.set(i, nome);
      }
    } catch (err) { /* o nome é só enfeite */ }
    return nomes;
  }

  /* ---------- G-code solto ---------- */
  /* Lê só o começo e o fim: um G-code pode ter 100 MB. */
  async function fatLerGcodeSolto(arq, ini) {
    const nome = String(arq.name || '').toLowerCase();
    if (fatBinario(ini)) {
      if (fatEhStl(arq, ini, nome)) throw fatFalha(FAT_MSG.modelo);
      throw fatFalha(/\.bgcode$/.test(nome) ? FAT_MSG.bgcode : FAT_MSG.estranho);
    }
    // 1 byte a mais em cada ponta: assim só a linha partida no corte é descartada
    const tam = arq.size, inteiro = tam <= FAT_CABECA + FAT_CAUDA + 2;
    const cab = await fatBytes(arq, 0, inteiro ? tam : FAT_CABECA + 1);
    const cau = inteiro ? null : await fatBytes(arq, tam - FAT_CAUDA - 1, tam);
    const texto = fatTextoPontas(cab, cau);
    const g = fatLerTextoGcode(texto);
    if (!g) {
      if (/\.(stl|obj|step|stp|amf|ply|f3d|blend)$/.test(nome) || (/^\s*solid\b/i.test(texto) && /facet\s+normal/i.test(texto.slice(0, 4096)))) throw fatFalha(FAT_MSG.modelo);
      throw fatFalha(fatPareceGcode(texto) ? FAT_MSG.gcodeVazio : FAT_MSG.estranho);
    }
    const avisos = g.avisos;
    return { ok: true, origem: g.origem, placas: [fatMontarPlaca(1, 'Placa 1', g.horas, g.filamentos, avisos, '')], avisos };
  }

  /* Tempo e filamentos de um texto de G-code (começo + fim). Devolve null se não achar nada. */
  function fatLerTextoGcode(bruto) {
    const texto = bruto.replace(/\r\n?/g, '\n');
    const avisos = [];
    let horas = NaN;
    for (const re of FAT_TEMPOS) {
      const m = re.exec(texto);
      if (!m) continue;
      const h = fatTempoTexto(m[1]);
      if (h > 0) { horas = h; break; }
    }
    const filamentos = fatFilamentosGcode(texto, avisos);
    if (!(horas > 0) && !filamentos.length) return null;
    return { origem: fatOrigemGcode(texto), horas, filamentos, avisos };
  }

  /* Peso, comprimento, tipo e cor de cada filamento usado. */
  function fatFilamentosGcode(texto, avisos) {
    const tipos = fatListaTextos(fatConfig(texto, 'filament_type'));
    const cores = fatListaTextos(fatConfig(texto, 'filament_colour'));
    const coresExtrusora = fatListaTextos(fatConfig(texto, 'extruder_colour'));   // Prusa usa quando a do filamento está vazia
    const dens = fatNumeros(fatConfig(texto, 'filament_density'));
    const diam = fatNumeros(fatConfig(texto, 'filament_diameter'));
    const lista = [];
    let estimado = false;
    const juntar = (id, g, mt) => {
      if (!(g > 0) && !(mt > 0)) return;    // filamento que não foi usado
      if (!(g > 0)) {
        g = fatGramas(mt, diam[id] > 0 ? diam[id] : FAT_DIAMETRO, dens[id] > 0 ? dens[id] : FAT_DENSIDADE);
        estimado = true;
      }
      lista.push({
        tipo: id >= 0 ? tipos[id] || '' : '',
        cor: id >= 0 ? fatCor(cores[id] || coresExtrusora[id]) : '',
        gramas: fatArred(g), metros: fatArred(mt > 0 ? mt : 0),
      });
    };
    // Prusa e Orca: "; filament used [g] = 3.68, 0.00" — uma posição por filamento configurado
    let g = fatNumeros(fatLinha(texto, /^;[ \t]*filament used \[g\][ \t]*=(.*)$/m));
    let mm = fatNumeros(fatLinha(texto, /^;[ \t]*filament used \[mm\][ \t]*=(.*)$/m));
    if (g.length || mm.length) {
      for (let i = 0; i < Math.max(g.length, mm.length); i++) juntar(i, g[i], mm[i] / 1000);
    } else {
      // Bambu: "; total filament weight [g] : 10.20,5.81" — só os usados, na ordem de "; filament: 1,3"
      g = fatNumeros(fatLinha(texto, /^;[ \t]*total filament weight \[g\][ \t]*:(.*)$/m));
      mm = fatNumeros(fatLinha(texto, /^;[ \t]*total filament length \[mm\][ \t]*:(.*)$/m));
      const n = Math.max(g.length, mm.length);
      if (n) {
        const usados = fatNumeros(fatLinha(texto, /^;[ \t]*filament:(.*)$/m)).map(v => v - 1);
        const ids = usados.length === n && usados.every(v => v >= 0) ? usados : n === tipos.length ? tipos.map((t, i) => i) : null;
        for (let i = 0; i < n; i++) juntar(ids ? ids[i] : -1, g[i], mm[i] / 1000);
      }
    }
    // só o total (fatiador da família Prusa sem a lista)
    if (!lista.length) {
      const total = fatNumeros(fatLinha(texto, /^;[ \t]*total filament used \[g\][ \t]*=(.*)$/m))[0];
      if (total > 0) juntar(tipos.length === 1 ? 0 : -1, total, NaN);
    }
    if (!lista.length) fatFilamentosCura(texto, lista, avisos);
    if (estimado) fatAviso(avisos, FAT_MSG.estimado);
    return lista;
  }

  /* Cura não escreve o peso: só metros (";Filament used: 1.23m"), mm³ ou volume por extrusora. */
  function fatFilamentosCura(texto, lista, avisos) {
    const area = d => Math.PI * (d / 2) * (d / 2);
    const porVolume = (v, diamMm) => ({ tipo: '', cor: '', gramas: fatArred(v * FAT_DENSIDADE / 1000), metros: fatArred(v / area(diamMm) / 1000) });
    const linha = fatLinha(texto, /^;Filament used:(.*)$/m);
    if (linha != null) {
      let porMetros = false;
      linha.split(',').forEach(item => {
        const t = item.trim(), v = parseFloat(t);
        if (!(v > 0)) return;
        if (/mm3$/i.test(t)) lista.push(porVolume(v, FAT_DIAMETRO));
        else { lista.push({ tipo: '', cor: '', gramas: fatArred(fatGramas(v, FAT_DIAMETRO, FAT_DENSIDADE)), metros: fatArred(v) }); porMetros = true; }
      });
      if (lista.length) fatAviso(avisos, porMetros ? FAT_MSG.curaMetros : FAT_MSG.curaVolume);
      return;
    }
    // Ultimaker (Griffin): volume em mm³ por extrusora; fio de 2,85 mm. UltiGCode: ;MATERIAL: e ;MATERIAL2:
    const re = /^;(?:EXTRUDER_TRAIN\.\d+\.MATERIAL\.VOLUME_USED|MATERIAL2?):[ \t]*(\d+(?:\.\d+)?)[ \t]*$/gm;
    let m;
    while ((m = re.exec(texto))) if (Number(m[1]) > 0) lista.push(porVolume(Number(m[1]), 2.85));
    if (lista.length) fatAviso(avisos, FAT_MSG.curaVolume);
  }

  function fatOrigemGcode(texto) {
    if (/^;[ \t]*(?:generated by[ \t]+)?BambuStudio\b/im.test(texto)) return 'gcode-bambu';
    if (/^;[ \t]*(?:generated by[ \t]+)?OrcaSlicer\b/im.test(texto)) return 'gcode-orca';
    if (/^;[ \t]*generated by[ \t]+PrusaSlicer\b/im.test(texto)) return 'gcode-prusa';
    if (/Cura_SteamEngine/.test(texto)) return 'gcode-cura';
    return 'gcode';
  }

  function fatPareceGcode(texto) {
    return /^[ \t]*[GM]\d{1,3}(?:\.\d)?\b/m.test(texto) || /^;[ \t]*(?:FLAVOR:|HEADER_BLOCK_START|generated by|Generated with)/im.test(texto);
  }

  /* ---------- Leitor de ZIP ---------- */
  /* Devolve um Map (nome em minúsculas -> entrada) a partir do diretório central, com ZIP64. */
  async function fatAbrirZip(arq) {
    const tam = arq.size;
    if (tam < 22) throw fatFalha(FAT_MSG.danificado);
    const ini = Math.max(0, tam - FAT_FIM_ZIP);
    const fim = await fatBytes(arq, ini, tam), dv = fatVisao(fim);
    // fim do diretório central (EOCD), procurado de trás para frente
    let p = -1, folga = -1;
    for (let i = fim.length - 22; i >= 0; i--) {
      if (dv.getUint32(i, true) !== 0x06054b50) continue;
      const fimComentario = i + 22 + dv.getUint16(i + 20, true);
      if (fimComentario === fim.length) { p = i; break; }
      if (folga < 0 && fimComentario < fim.length) folga = i;    // aceita lixo depois do fim
    }
    if (p < 0) p = folga;
    if (p < 0) throw fatFalha(FAT_MSG.danificado);
    const eocd = ini + p;
    let qtd = dv.getUint16(p + 10, true), tamDir = dv.getUint32(p + 12, true), iniDir = dv.getUint32(p + 16, true);
    let fimDir = eocd;
    // ZIP64: o localizador fica 20 bytes antes do EOCD e aponta o registro com os números de 64 bits
    if (eocd >= 20) {
      const loc = fatVisao(await fatBytes(arq, eocd - 20, eocd));
      if (loc.getUint32(0, true) === 0x07064b50) {
        const r = await fatRegistroZip64(arq, fatU64(loc, 8), eocd - 20);
        if (r) { qtd = r.qtd; tamDir = r.tamDir; iniDir = r.iniDir; fimDir = r.pos; }
      }
    }
    const mapa = new Map();
    if (tamDir === 0) return mapa;    // ZIP vazio
    if (tamDir > FAT_MAX_ENTRADA || tamDir > fimDir) throw fatFalha(FAT_MSG.danificado);
    // se o diretório não está onde o EOCD diz, o ZIP tem algo antes: acha o deslocamento
    let desl = 0;
    if (!(await fatAssinatura(arq, iniDir, 0x02014b50))) {
      desl = fimDir - tamDir - iniDir;
      if (desl <= 0 || !(await fatAssinatura(arq, iniDir + desl, 0x02014b50))) throw fatFalha(FAT_MSG.danificado);
    }
    const dir = await fatBytes(arq, iniDir + desl, iniDir + desl + tamDir), dd = fatVisao(dir);
    const dec = new TextDecoder('utf-8');
    const MAX32 = 0xFFFFFFFF;
    let q = 0;
    while (q + 46 <= dir.length && dd.getUint32(q, true) === 0x02014b50) {
      const flags = dd.getUint16(q + 8, true), metodo = dd.getUint16(q + 10, true), crc = dd.getUint32(q + 16, true);
      let tamComp = dd.getUint32(q + 20, true), tamOrig = dd.getUint32(q + 24, true), offset = dd.getUint32(q + 42, true);
      const nNome = dd.getUint16(q + 28, true), nExtra = dd.getUint16(q + 30, true), nCom = dd.getUint16(q + 32, true);
      const prox = q + 46 + nNome + nExtra + nCom;
      if (prox > dir.length) throw fatFalha(FAT_MSG.danificado);
      const nome = dec.decode(dir.subarray(q + 46, q + 46 + nNome)).replace(/\\/g, '/').replace(/^\.?\//, '');
      if (tamOrig === MAX32 || tamComp === MAX32 || offset === MAX32) {
        // campo extra ZIP64 (0x0001): traz só os valores que estouraram, nesta ordem
        let x = q + 46 + nNome;
        const xFim = x + nExtra;
        while (x + 4 <= xFim) {
          const id = dd.getUint16(x, true), n = dd.getUint16(x + 2, true);
          if (id === 1) {
            let y = x + 4;
            const yFim = Math.min(xFim, y + n);
            if (tamOrig === MAX32 && y + 8 <= yFim) { tamOrig = fatU64(dd, y); y += 8; }
            if (tamComp === MAX32 && y + 8 <= yFim) { tamComp = fatU64(dd, y); y += 8; }
            if (offset === MAX32 && y + 8 <= yFim) offset = fatU64(dd, y);
            break;
          }
          x += 4 + n;
        }
      }
      const chave = nome.toLowerCase();
      if (nome && !nome.endsWith('/') && !mapa.has(chave)) mapa.set(chave, { nome, flags, metodo, crc, tamComp, tamOrig, offset: offset + desl });
      q = prox;
    }
    if (!mapa.size && qtd > 0) throw fatFalha(FAT_MSG.danificado);
    return mapa;
  }

  /* Registro ZIP64 do fim do diretório: onde o localizador diz ou logo antes dele. */
  async function fatRegistroZip64(arq, pos, posLocalizador) {
    for (const q of [pos, posLocalizador - 56]) {
      if (!(q >= 0) || q + 56 > arq.size) continue;
      const dv = fatVisao(await fatBytes(arq, q, q + 56));
      if (dv.getUint32(0, true) !== 0x06064b50) continue;
      return { pos: q, qtd: fatU64(dv, 32), tamDir: fatU64(dv, 40), iniDir: fatU64(dv, 48) };
    }
    return null;
  }

  async function fatAssinatura(arq, pos, sig) {
    if (!(pos >= 0) || pos + 4 > arq.size) return false;
    return fatVisao(await fatBytes(arq, pos, pos + 4)).getUint32(0, true) === sig;
  }

  /* Dados comprimidos da entrada. Pula o cabeçalho local usando o tamanho do nome e do extra
     do PRÓPRIO cabeçalho local (podem diferir do diretório central). */
  async function fatDadosEntrada(arq, e) {
    const lh = await fatBytes(arq, e.offset, e.offset + 30);
    if (lh.length < 30) throw fatFalha(FAT_MSG.danificado);
    const dv = fatVisao(lh);
    if (dv.getUint32(0, true) !== 0x04034b50) throw fatFalha(FAT_MSG.danificado);
    const ini = e.offset + 30 + dv.getUint16(26, true) + dv.getUint16(28, true);
    if (ini + e.tamComp > arq.size) throw fatFalha(FAT_MSG.danificado);
    return arq.slice(ini, ini + e.tamComp);
  }

  /* Descompacta a entrada aos pedaços e confere o CRC. Tamanhos sempre do diretório central. */
  async function fatLerEntrada(arq, e, aoPedaco) {
    if (e.flags & 1) throw fatFalha(FAT_MSG.protegido);
    if (e.metodo !== 0 && e.metodo !== 8) throw fatFalha(FAT_MSG.compactacao);
    if (e.tamOrig > FAT_MAX_ENTRADA || (e.metodo === 0 && e.tamComp > FAT_MAX_ENTRADA)) throw fatFalha(FAT_MSG.grande, 'grande');
    const dados = await fatDadosEntrada(arq, e);
    let crc = 0xFFFFFFFF;
    const conferir = p => { crc = fatCrc(crc, p); aoPedaco(p); };
    if (e.metodo === 0) {
      const passo = 4 * 1024 * 1024;
      for (let o = 0; o < dados.size; o += passo) conferir(await fatBytes(dados, o, Math.min(dados.size, o + passo)));
    } else {
      await fatInflar(dados, conferir);
    }
    if (((crc ^ 0xFFFFFFFF) >>> 0) !== e.crc) throw fatFalha(FAT_MSG.danificado);
  }

  /* Deflate cru pelo próprio navegador (DecompressionStream), com limite de tamanho. */
  async function fatInflar(blob, aoPedaco) {
    let ds;
    try { ds = new DecompressionStream('deflate-raw'); } catch (e) { throw fatFalha(FAT_MSG.navegador); }
    const leitor = (typeof blob.stream === 'function' ? blob.stream() : new Response(blob).body).pipeThrough(ds).getReader();
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        total += value.length;
        if (total > FAT_MAX_ENTRADA) throw fatFalha(FAT_MSG.grande, 'grande');
        aoPedaco(value);
      }
    } catch (e) {
      leitor.cancel().catch(() => {});
      throw e && e.fatAmigavel ? e : fatFalha(FAT_MSG.danificado);
    }
  }

  async function fatTextoEntrada(arq, e) {
    const pedacos = [];
    await fatLerEntrada(arq, e, p => pedacos.push(p));
    return new TextDecoder('utf-8').decode(fatJuntar(pedacos));
  }

  /* G-code de dentro do .3mf: guarda só o começo e o fim enquanto descompacta. */
  async function fatTextoEntradaGcode(arq, e) {
    const limCab = FAT_CABECA + 1, limCau = FAT_CAUDA + 1;   // 1 byte a mais em cada ponta, como no G-code solto
    const cab = [], cau = [];
    let nCab = 0, nCau = 0, total = 0;
    await fatLerEntrada(arq, e, p => {
      total += p.length;
      if (nCab < limCab) { const q = p.subarray(0, limCab - nCab); cab.push(q); nCab += q.length; }
      cau.push(p);
      nCau += p.length;
      while (cau.length > 1 && nCau - cau[0].length >= limCau) nCau -= cau.shift().length;
    });
    const cabeca = fatJuntar(cab);
    const iniCauda = Math.max(nCab, total - limCau);
    const cauda = fatJuntar(cau).subarray(iniCauda - (total - nCau));
    return iniCauda === nCab ? fatTextoPontas(fatJuntar([cabeca, cauda]), null) : fatTextoPontas(cabeca, cauda);
  }

  /* ---------- XML (leitor por regex: funciona no navegador e no Node) ---------- */
  /* Corpo de cada <tag>...</tag>; estes arquivos não aninham tags de mesmo nome. */
  function fatBlocos(xml, tag) {
    const abre = new RegExp('<' + tag + '\\b((?:[^>"\']|"[^"]*"|\'[^\']*\')*)>', 'gi');
    const fecha = new RegExp('</' + tag + '\\s*>', 'gi');
    const r = [];
    let m;
    while ((m = abre.exec(xml))) {
      if (/\/\s*$/.test(m[1])) continue;     // <tag/> vazia
      fecha.lastIndex = abre.lastIndex;
      const f = fecha.exec(xml);
      if (!f) break;
      r.push(xml.slice(abre.lastIndex, f.index));
      abre.lastIndex = fecha.lastIndex;
    }
    return r;
  }

  /* Atributos de cada <tag ...> (com ou sem barra no fim). */
  function fatTags(xml, tag) {
    const re = new RegExp('<' + tag + '\\b((?:[^>"\']|"[^"]*"|\'[^\']*\')*)>', 'gi');
    const r = [];
    let m;
    while ((m = re.exec(xml))) r.push(fatAtributos(m[1]));
    return r;
  }

  /* <metadata key="..." value="..."/> -> { key: value } (vale o primeiro de cada chave). */
  function fatMetadados(xml) {
    const r = Object.create(null);
    for (const a of fatTags(xml, 'metadata')) if (a.key != null && !(a.key in r)) r[a.key] = a.value == null ? '' : a.value;
    return r;
  }

  function fatAtributos(s) {
    const r = Object.create(null), re = /([A-Za-z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(s))) if (!(m[1] in r)) r[m[1]] = fatDesescapar(m[2] != null ? m[2] : m[3]);
    return r;
  }

  function fatDesescapar(s) {
    const nomes = { quot: '"', apos: "'", amp: '&', lt: '<', gt: '>' };
    return s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(quot|apos|amp|lt|gt));/gi, (t, hex, dec, nome) => {
      if (nome) return nomes[nome.toLowerCase()];
      const c = hex ? parseInt(hex, 16) : parseInt(dec, 10);
      return c > 0 && c <= 0x10FFFF ? String.fromCodePoint(c) : t;
    });
  }

  /* ---------- Utilitários ---------- */
  function fatErro(erro) { return { ok: false, erro }; }
  function fatFalha(msg, codigo) { const e = new Error(msg); e.fatAmigavel = true; e.fatCodigo = codigo || ''; return e; }
  function fatAviso(lista, txt) { if (!lista.includes(txt)) lista.push(txt); }
  function fatArred(v) { return Math.round(v * 100) / 100; }
  function fatNumero(v) { const n = parseFloat(String(v == null ? '' : v).trim()); return Number.isFinite(n) ? n : NaN; }
  function fatNumeros(v) { return v == null || !v.trim() ? [] : v.split(',').map(x => parseFloat(x)); }
  function fatLinha(texto, re) { const m = re.exec(texto); return m ? m[1].trim() : null; }
  /* Linha de configuração "; chave = valor" (no cabeçalho do Bambu vem "; chave: valor"). */
  function fatConfig(texto, chave) { return fatLinha(texto, new RegExp('^;[ \\t]*' + chave + '[ \\t]*[=:][ \\t]*(.*)$', 'm')); }

  /* Lista de textos da configuração: separada por ";" e com aspas no estilo C quando precisa. */
  function fatListaTextos(v) {
    const r = [], s = String(v == null ? '' : v).trim();
    if (!s) return r;
    let i = 0;
    while (i <= s.length) {
      if (s[i] === '"') {
        let t = '';
        for (i++; i < s.length && s[i] !== '"'; i++) {
          if (s[i] === '\\' && i + 1 < s.length) { i++; t += s[i] === 'n' ? '\n' : s[i] === 'r' ? '\r' : s[i]; } else t += s[i];
        }
        r.push(t);
        while (i < s.length && s[i] !== ';') i++;
        i++;
      } else {
        let j = s.indexOf(';', i);
        if (j < 0) j = s.length;
        r.push(s.slice(i, j).trim());
        i = j + 1;
      }
    }
    return r;
  }

  /* Cor no formato #RRGGBB maiúsculo ('' se não der). Aceita #RGB e #RRGGBBAA. */
  function fatCor(c) {
    const s = String(c == null ? '' : c).trim().replace(/^#/, '');
    if (/^[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(s)) return '#' + s.slice(0, 6).toUpperCase();
    if (/^[0-9a-f]{3}$/i.test(s)) return '#' + s.replace(/./g, x => x + x).toUpperCase();
    return '';
  }

  /* Gramas a partir dos metros: metros × área do fio (mm²) × densidade (g/cm³). */
  function fatGramas(metros, diametroMm, densidade) { return metros * Math.PI * (diametroMm / 2) * (diametroMm / 2) * densidade; }

  function fatMontarPlaca(indice, nome, horas, filamentos, avisos, rotulo) {
    if (!(horas > 0)) { fatAviso(avisos, `Não achei o tempo de impressão${rotulo}; preencha à mão.`); horas = 0; }
    if (!filamentos.length) fatAviso(avisos, `Não achei o peso do filamento${rotulo}; preencha à mão.`);
    const gramas = fatArred(filamentos.reduce((s, f) => s + f.gramas, 0));
    return { indice, nome, horas, gramas, filamentos };
  }

  async function fatBytes(blob, ini, fim) {
    const parte = blob.slice(ini, fim);
    return new Uint8Array(typeof parte.arrayBuffer === 'function' ? await parte.arrayBuffer() : await new Response(parte).arrayBuffer());
  }
  function fatVisao(b) { return new DataView(b.buffer, b.byteOffset, b.byteLength); }
  function fatU64(dv, p) { return dv.getUint32(p, true) + dv.getUint32(p + 4, true) * 4294967296; }
  function fatComeca(b, sig) { return b.length >= sig.length && sig.every((x, i) => b[i] === x); }
  function fatBinario(b) { for (let i = 0; i < Math.min(b.length, 8192); i++) if (b[i] === 0) return true; return false; }
  /* STL binário: 80 bytes de cabeçalho, quantidade de triângulos e 50 bytes por triângulo. */
  function fatEhStl(arq, ini, nome) {
    if (/\.stl$/.test(nome)) return true;
    return ini.length >= 84 && arq.size === 84 + fatVisao(ini).getUint32(80, true) * 50;
  }

  function fatJuntar(lista) {
    if (lista.length === 1) return lista[0];
    let n = 0;
    for (const p of lista) n += p.length;
    const r = new Uint8Array(n);
    let o = 0;
    for (const p of lista) { r.set(p, o); o += p.length; }
    return r;
  }

  /* Junta começo e fim do G-code num texto só, sem as linhas cortadas no meio.
     Cada ponta vem com 1 byte a mais além do corte: se ele é "\n", a linha da borda está inteira e fica. */
  function fatTextoPontas(cabeca, cauda) {
    const dec = new TextDecoder('utf-8');
    if (!cauda) return dec.decode(cabeca);
    const a = dec.decode(cabeca), b = dec.decode(cauda);
    return a.slice(0, a.lastIndexOf('\n') + 1) + b.slice(b.indexOf('\n') + 1);
  }

  let fatTabelaCrc = null;
  function fatCrc(crc, p) {
    let t = fatTabelaCrc;
    if (!t) {
      t = fatTabelaCrc = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
      }
    }
    for (let i = 0; i < p.length; i++) crc = t[(crc ^ p[i]) & 0xFF] ^ (crc >>> 8);
    return crc;
  }

  globalThis.lerArquivoFatiado = lerArquivoFatiado;
  globalThis.fatTempoTexto = fatTempoTexto;
})();
