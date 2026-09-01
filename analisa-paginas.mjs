// Sonda: extrai o texto de cada pagina de um edital oficial para descobrir o
// que cada uma tem. Serve para achar, sem chutar, quais paginas de um edital
// carregam o descritivo dos produtos e quais sao burocracia repetida.
//
// Uso: node analisa-paginas.mjs <busca-do-municipio> [pagina-inicial] [pagina-final]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { urlArquivo } from './resumo-pdf.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LE = createRequire(import.meta.url)(path.join(DIR, 'docs', 'pdf-le.js'));
const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));

const busca = process.argv[2];
const alvo = dados.editais.find(e => (e[0] + '/' + e[1]).toLowerCase().includes(busca.toLowerCase()));
if (!alvo) { console.error('nao achei'); process.exit(1); }

const url = urlArquivo(alvo);
console.log(alvo[0] + '/' + alvo[1], '·', alvo[3]);
console.log(url + '\n');

const resp = await fetch(url);
const bytes = new Uint8Array(await resp.arrayBuffer());
const le = await LE.abre(bytes);
console.log('paginas:', le.total, '| criptografado:', le.criptografado, '\n');

// Decodifica um fluxo de conteudo. O pdf-le nao exporta o decodificador dele
// (nao precisa: ele copia bytes sem olhar), entao inflamos aqui com o zlib.
async function fluxoDe(v) {
  const alvo2 = le.ehRef(v) ? await le.obj(v.num) : v;
  if (!alvo2 || !alvo2.__fluxo) return new Uint8Array(0);
  const raw = alvo2.bruto;
  if (!raw) return new Uint8Array(0);
  const d = (alvo2.dict && alvo2.dict.__dict) || {};
  const f = d.Filter;
  const nomes = !f ? [] : (Array.isArray(f) ? f : [f]).map(x => (x && x.__nome) || '');
  if (nomes.includes('FlateDecode')) {
    try { return new Uint8Array(zlib.inflateSync(Buffer.from(raw))); }
    catch { try { return new Uint8Array(zlib.inflateRawSync(Buffer.from(raw))); } catch { return new Uint8Array(0); } }
  }
  return raw;
}

// Texto de um fluxo de conteudo: pega os operandos de Tj e TJ. Nao decodifica
// fonte, entao PDF com codificacao propria sai embaralhado — o suficiente para
// classificar a pagina, nao para reproduzir o documento.
function textoDe(u8) {
  const s = Buffer.from(u8).toString('latin1');
  const saida = [];
  const re = /\((?:\\.|[^\\()])*\)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    saida.push(m[0].slice(1, -1).replace(/\\([()\\])/g, '$1').replace(/\\[0-7]{1,3}/g, ' '));
  }
  return saida.join('').replace(/\s+/g, ' ').trim();
}

const ini = Number(process.argv[3] || 1);
const fim = Number(process.argv[4] || le.total);

for (let i = ini; i <= fim; i++) {
  const pg = le.pagina(i - 1);
  if (!pg) { console.log(`p.${i}: (sem pagina)`); continue; }
  // pagina(i) devolve { ref, dict, herdado }, e o .dict ja e o dicionario plano
  const dict = pg.dict || {};
  let conteudo = dict.Contents;
  if (le.ehRef(conteudo)) conteudo = await le.obj(conteudo.num);
  let txt = '';
  if (Array.isArray(conteudo)) {
    for (const c of conteudo) txt += textoDe(await fluxoDe(c)) + ' ';
  } else {
    txt = textoDe(await fluxoDe(conteudo));
  }
  txt = txt.replace(/\s+/g, ' ').trim();
  console.log(`p.${String(i).padStart(2)} [${String(txt.length).padStart(5)} car] ${txt.slice(0, 700)}`);
}
