/* Teste do leitor do fatiador (js/fatiador.js).
   Como rodar, na pasta do projeto: node tests/fatiador/testar.mjs   (Node 20 ou mais novo e Python 3)
   Gera os arquivos de teste com gerar_fixtures.py numa pasta temporária do sistema, carrega
   js/fatiador.js num contexto isolado (vm, como um script clássico do navegador) e confere cada
   resultado. A pasta temporária é apagada no fim; nada fica no repositório. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..', '..');
const codigo = readFileSync(path.join(raiz, 'js', 'fatiador.js'), 'utf8');
const BASE = { Blob, File, TextDecoder, Response, ReadableStream, DecompressionStream, console };

/* Contexto novo com só o que o navegador teria; "tirar" remove uma API (ex.: DecompressionStream). */
function carregar(tirar = []) {
  const ctx = { ...BASE };
  for (const k of tirar) delete ctx[k];
  vm.runInNewContext(codigo, ctx, { filename: 'js/fatiador.js' });
  return ctx;
}

function acharPython() {
  for (const cmd of [process.env.PYTHON, 'python3', 'python', 'py'].filter(Boolean)) {
    const pre = cmd === 'py' ? ['-3'] : [];
    const r = spawnSync(cmd, [...pre, '--version'], { encoding: 'utf8' });
    if (r.status === 0 && /Python 3\./.test((r.stdout || '') + (r.stderr || ''))) return [cmd, ...pre];
  }
  return null;
}

const R = [];
const ok = (nome, cond, info) => R.push({ nome, cond: !!cond, info });
const perto = (a, b, t = 1e-9) => typeof a === 'number' && Math.abs(a - b) <= t;
const fil = (tipo, cor, gramas, metros) => ({ tipo, cor, gramas, metros });
const placa = (indice, nome, horas, gramas, filamentos) => ({ indice, nome, horas, gramas, filamentos });

/* Resultados esperados (valores tirados dos arquivos gerados por gerar_fixtures.py). */
const UMA = { origem: 'bambu-3mf', placas: [placa(1, 'Chaveiro', 5318 / 3600, 16.01, [fil('PLA', '#00AE42', 16.01, 5.37)])], avisos: [] };
const DUAS = {
  origem: 'bambu-3mf', avisos: [], placas: [
    placa(1, 'Placa 1', 3723 / 3600, 10.5, [fil('PLA', '#FFFFFF', 10.5, 3.52)]),
    placa(2, 'Base & Tampa', 2, 20.25, [fil('PETG', '#000000', 20.25, 6.65)]),
  ],
};
/* Corte do fim do G-code bem numa linha: a linha inteira fica, o pedaço partido sai. */
const FRONTEIRA = origem => ({ origem, avisos: [], placas: [placa(1, 'Placa 1', 3, 2.98, [fil('', '', 2.98, 1)])] });
const TRES_FIL = [fil('PLA', '#FF0000', 5.1, 1.71), fil('PLA', '#00FF00', 3.2, 1.07), fil('PETG', '#0000FF', 1.7, 0.56)];
const SUCESSOS = [
  ['uma_placa.3mf', UMA],
  ['duas_placas.3mf', DUAS],
  ['tres_cores.3mf', { origem: 'bambu-3mf', avisos: [], placas: [placa(1, 'Logo colorido', 9999 / 3600, 10, TRES_FIL)] }],
  ['placa_fatiada.gcode.3mf', { origem: 'bambu-3mf', avisos: [], placas: [placa(1, 'Suporte', 1.55, 12.89, [fil('PLA', '#FFFFFF', 12.89, 4.32)])] }],
  ['orca_placa.gcode.3mf', {
    origem: 'bambu-3mf', avisos: [],
    placas: [placa(1, 'Placa 1', 55.5 / 60, 10.42, [fil('PLA', '#FFAA00', 7.36, 2.47), fil('PETG', '#123456', 3.06, 1)])],
  }],
  ['zip64_forcado.3mf', UMA],
  ['zip64_total.3mf', { origem: 'bambu-3mf', avisos: [], placas: [placa(1, 'Placa 1', 9999 / 3600, 10, TRES_FIL)] }],
  ['zip64_miniz.3mf', DUAS],
  ['entrada_stored.3mf', { origem: 'bambu-3mf', avisos: [], placas: [placa(1, 'Peça guardada', 600 / 3600, 2.5, [fil('PLA-CF', '#333333', 2.5, 0.84)])] }],
  ['descritor.3mf', { origem: 'bambu-3mf', avisos: [], placas: [placa(1, 'Gancho', 0.5, 7.77, [fil('PETG', '#FF8800', 7.77, 2.54)])] }],
  ['concatenado.3mf', UMA],
  ['placa_sem_dados.3mf', { origem: 'bambu-3mf', avisos: [/^A placa 2 .*ficou de fora\.$/], placas: [placa(1, 'Placa 1', 1, 5, [fil('ABS', '#FFFFFF', 5, 1.8)])] }],
  ['bambu.gcode', {
    origem: 'gcode-bambu', avisos: [],
    placas: [placa(1, 'Placa 1', 2 + 10 / 60, 16.01, [fil('PLA', '#FFFFFF', 10.2, 3.42), fil('PETG', '#FF0000', 5.81, 1.87)])],
  }],
  ['orca.gcode', { origem: 'gcode-orca', avisos: [], placas: [placa(1, 'Placa 1', 45 / 60 + 10 / 3600, 3.68, [fil('PLA', '#FFAA00', 3.68, 1.23)])] }],
  ['prusa.gcode', {
    origem: 'gcode-prusa', avisos: [],
    placas: [placa(1, 'Placa 1', 26 + 3 / 60 + 4 / 3600, 5.69, [fil('PLA', '#FF8000', 2.02, 0.68), fil('PETG', '#DB5182', 3.67, 1.2)])],
  }],
  ['cura.gcode', { origem: 'gcode-cura', avisos: [/^O Cura não informa o peso/], placas: [placa(1, 'Placa 1', 3723 / 3600, 3.68, [fil('', '', 3.68, 1.23)])] }],
  ['cura_ultimaker.gcode', { origem: 'gcode-cura', avisos: [/^O Cura não informa o peso/], placas: [placa(1, 'Placa 1', 5000 / 3600, 4.96, [fil('', '', 4.96, 0.63)])] }],
  ['fronteira.gcode', FRONTEIRA('gcode-prusa')],
  ['fronteira_isca.gcode', FRONTEIRA('gcode-prusa')],
  ['fronteira.gcode.3mf', FRONTEIRA('bambu-3mf')],
  ['fronteira_isca.gcode.3mf', FRONTEIRA('bambu-3mf')],
  ['so_tempo.gcode', { origem: 'gcode-prusa', avisos: [/^Não achei o peso do filamento/], placas: [placa(1, 'Placa 1', 1 / 6, 0, [])] }],
];

const FALHAS = [
  ['sem_fatiar.3mf', /projeto.*\.gcode\.3mf/s],
  ['gigante.gcode.3mf', /64 MB/],
  ['deflate_ruim.3mf', /danificado/],
  ['crc_errado.3mf', /danificado/],
  ['danificado.3mf', /danificado/],
  ['projeto_prusa.3mf', /PrusaSlicer/],
  ['compactado.zip', /não é um \.3mf/],
  ['texto.txt', /não é um G-code/],
  ['aleatorio.bin', /não é um G-code/],
  ['vazio.gcode', /vazio/],
  ['modelo.stl', /modelo 3D/],
  ['triangulos.dat', /modelo 3D/],
  ['binario.bgcode', /binário/],
  ['sem_dados.gcode', /Não achei o tempo nem o peso/],
];

function conferirSucesso(nome, r, esp) {
  ok(`${nome}: ok`, r && r.ok === true, r);
  if (!r || r.ok !== true) return;
  ok(`${nome}: origem`, r.origem === esp.origem, r.origem);
  ok(`${nome}: número de placas`, r.placas.length === esp.placas.length, r.placas.length);
  esp.placas.forEach((e, i) => {
    const p = r.placas[i] || {};
    ok(`${nome}: placa ${i + 1} índice e nome`, p.indice === e.indice && p.nome === e.nome, [p.indice, p.nome]);
    ok(`${nome}: placa ${i + 1} horas`, perto(p.horas, e.horas), p.horas);
    ok(`${nome}: placa ${i + 1} gramas`, perto(p.gramas, e.gramas), p.gramas);
    ok(`${nome}: placa ${i + 1} filamentos`, JSON.stringify(p.filamentos) === JSON.stringify(e.filamentos), p.filamentos);
    const soma = Math.round((p.filamentos || []).reduce((s, f) => s + f.gramas, 0) * 100) / 100;
    ok(`${nome}: placa ${i + 1} gramas = soma dos filamentos`, perto(p.gramas, soma), [p.gramas, soma]);
  });
  ok(`${nome}: avisos`, r.avisos.length === esp.avisos.length && esp.avisos.every((re, i) => re.test(r.avisos[i])), r.avisos);
}

async function principal() {
  const py = acharPython();
  if (!py) throw new Error('Python 3 não encontrado. Instale ou indique o caminho em PYTHON.');
  const pasta = mkdtempSync(path.join(tmpdir(), 'nexos-fatiador-'));
  try {
    const g = spawnSync(py[0], [...py.slice(1), '-I', path.join(aqui, 'gerar_fixtures.py'), pasta], { encoding: 'utf8' });
    if (g.status !== 0) throw new Error('gerar_fixtures.py falhou:\n' + (g.stderr || g.stdout));
    const arquivo = nome => new File([readFileSync(path.join(pasta, nome))], nome);

    // só duas globais
    const ctx = carregar();
    const novas = Object.keys(ctx).filter(k => !(k in BASE)).sort();
    ok('só duas globais: lerArquivoFatiado e fatTempoTexto', JSON.stringify(novas) === '["fatTempoTexto","lerArquivoFatiado"]', novas);

    // tempo em texto -> horas
    const T = ctx.fatTempoTexto;
    const tempos = [['1d 2h 3m 4s', 26 + 3 / 60 + 4 / 3600], ['2h 3m', 2.05], ['45m 10s', 45 / 60 + 10 / 3600], ['1h', 1],
      ['3723', 3723 / 3600], ['2h 3m 4s', 2 + 3 / 60 + 4 / 3600], ['1h 30m', 1.5], ['0.500000s', 0.5 / 3600], [' 2H 3M ', 2.05], [5400, 1.5]];
    for (const [t, h] of tempos) ok(`fatTempoTexto(${JSON.stringify(t)})`, perto(T(t), h), T(t));
    for (const t of ['', 'abc', null, undefined, '1h 2x', '-5', {}, '1:30']) ok(`fatTempoTexto(${JSON.stringify(t)}) é NaN`, Number.isNaN(T(t)), T(t));

    // arquivos que dão certo
    for (const [nome, esp] of SUCESSOS) conferirSucesso(nome, await ctx.lerArquivoFatiado(arquivo(nome)), esp);
    // Blob sem nome também serve
    conferirSucesso('uma_placa.3mf como Blob', await ctx.lerArquivoFatiado(new Blob([readFileSync(path.join(pasta, 'uma_placa.3mf'))])), UMA);

    // arquivos que devem dar erro amigável
    for (const [nome, re] of FALHAS) {
      const r = await ctx.lerArquivoFatiado(arquivo(nome));
      ok(`${nome}: erro amigável`, r && r.ok === false && re.test(r.erro), r);
    }

    // nunca lança exceção, nem com entrada estranha
    const estranhos = [['null', null], ['undefined', undefined], ['um texto', 'texto'], ['um número', 42], ['objeto vazio', {}],
      ['objeto com slice quebrado', { size: 10, slice() { throw new Error('quebrou'); } }]];
    for (const [rotulo, x] of estranhos) {
      let r;
      try { r = await ctx.lerArquivoFatiado(x); } catch (e) { r = { lancou: String(e) }; }
      ok(`não lança com ${rotulo}`, r && r.ok === false && typeof r.erro === 'string', r);
    }

    // navegador sem DecompressionStream: erro amigável no deflate, mas o que é "stored" ainda lê
    const velho = carregar(['DecompressionStream']);
    const r1 = await velho.lerArquivoFatiado(arquivo('uma_placa.3mf'));
    ok('sem DecompressionStream: pede para atualizar o navegador', r1 && r1.ok === false && /^Atualize o navegador/.test(r1.erro), r1);
    const r2 = await velho.lerArquivoFatiado(arquivo('entrada_stored.3mf'));
    conferirSucesso('sem DecompressionStream: entrada stored', r2,
      { origem: 'bambu-3mf', avisos: [], placas: [placa(1, 'Placa 1', 600 / 3600, 2.5, [fil('PLA-CF', '#333333', 2.5, 0.84)])] });
    const r3 = await velho.lerArquivoFatiado(arquivo('prusa.gcode'));
    ok('sem DecompressionStream: G-code solto continua lendo', r3 && r3.ok === true && perto(r3.placas[0].gramas, 5.69), r3);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

try {
  await principal();
} catch (e) {
  R.push({ nome: 'execução do teste', cond: false, info: String(e && e.stack || e) });
}
const falhas = R.filter(x => !x.cond);
for (const x of R) console.log((x.cond ? 'OK      ' : 'FALHOU  ') + x.nome + (x.cond ? '' : ' -> ' + (typeof x.info === 'string' ? x.info : JSON.stringify(x.info))));
console.log(`\n${R.length - falhas.length} de ${R.length} verificações passaram.`);
process.exitCode = falhas.length ? 1 : 0;
