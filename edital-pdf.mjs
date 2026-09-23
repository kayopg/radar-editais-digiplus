// O edital que o orgao publicou em ZIP, RAR, DOC, DOCX, ODT ou RTF, convertido
// para PDF — para o botao "Baixar edital" entregar sempre um PDF.
//
// O usuario pediu em 23/09/2026: "tem arquivos que estao em zip, docx, e outros
// sem ser PDF, tente passar todos para pdf". Dentro do artefato o navegador nao
// consegue buscar o arquivo no PNCP (o endpoint de arquivos manda o CORS
// errado), entao o PDF viaja embutido, como ja fazem as folhas de abertura.
//
// O que entra: UM documento por edital — o edital propriamente dito. Zip de
// prefeitura costuma trazer o edital, o termo de referencia, o ETP e a pesquisa
// de precos (o de Patrocinio/MG tem 30 MB); quem quer o pacote inteiro continua
// tendo o botao do PNCP. O termo de referencia ja chega ao usuario pelo
// descritivo de cada item.
//
// Uso:
//   node edital-pdf.mjs                -> todos os editais que nao sao PDF
//   node edital-pdf.mjs --faltantes    -> so os que ainda nao tem
//   node edital-pdf.mjs --so a/b/c     -> refaz esses
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { abreZip, abreRar, extDe } from './arquivo-oficial.mjs';
import { pdfDeDocumento, CONVERSIVEIS } from './pdf-do-documento.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LE = createRequire(import.meta.url)(path.join(DIR, 'docs', 'pdf-le.js'));

const arg = (n, p) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p; };
const FALTANTES = process.argv.includes('--faltantes');
const SO = arg('--so', '').split(',').filter(Boolean);
// Acima disto o PDF nao entra: o artefato tem teto de 64 MB por versao e as
// folhas de abertura ja ocupam a maior parte. O edital continua a um clique no
// PNCP.
const TETO_MB = Number(arg('--teto', 6));

const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));
const C = dados.colunas.reduce((o, n, i) => (o[n] = i, o), {});
const arquivoSaida = path.join(DIR, 'docs', 'editais-pdf.json');

let jaTem = {};
try { jaTem = JSON.parse(fs.readFileSync(arquivoSaida, 'utf8')).editais || {}; } catch { /* primeira vez */ }

// So o que NAO e PDF: o resto o botao ja entrega direto do PNCP.
let alvos = dados.editais.filter(e => String(e[C.arquivoExtensao] || '').toLowerCase() !== 'pdf');
if (FALTANTES) alvos = alvos.filter(e => !jaTem[e[C.path]]);
if (SO.length) alvos = alvos.filter(e => SO.includes(e[C.path]));

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Qual documento do pacote e o edital. A ordem e a mesma do resumo-pdf.mjs:
// edital, termo de referencia, o resto.
function nota(nome) {
  const s = norm(nome);
  // Decreto, portaria, parecer e matriz de risco nunca sao o edital: o pacote
  // de Corrego Danta/MG so traz o "Decreto no 978-2024 - REGIONALIZACAO", e ele
  // saia como "o edital em PDF" do botao (23/09/2026). Nota 9 e recusa: melhor
  // o card sem o botao do que com o documento errado.
  if (/(?:^|[^a-z])(?:decreto|portaria|parecer|matriz de risco|mapa de riscos?)(?:[^a-z]|$)/.test(s)) return 9;
  if (/edital|aviso de (?:licitacao|contratacao)/.test(s) && !/minuta|contrato/.test(s)) return 0;
  if (/termo de referencia|(?:^|[^a-z])tr[\s_.-]|especifica|descritiv|memorial/.test(s)) return 1;
  if (/etp|estudo tecnico|formalizacao|mapa de risco|pesquisa|cotacao|preco|planilha|media/.test(s)) return 3;
  return 2;
}

function tipoDe(bytes) {
  const b = Buffer.from(bytes.slice(0, 4)).toString('hex');
  if (b.startsWith('25504446')) return 'pdf';
  // .docx e .odt tambem comecam com PK: quem separa e o que ha dentro.
  if (b.startsWith('504b0304')) {
    let dentro = [];
    try { dentro = abreZip(bytes); } catch { return 'zip'; }
    if (dentro.some(x => x.nome === 'word/document.xml')) return 'docx';
    if (dentro.some(x => x.nome === 'content.xml') && dentro.some(x => x.nome === 'mimetype')) return 'odt';
    return 'zip';
  }
  if (b.startsWith('d0cf11e0')) return 'ole';     // .doc / .xls
  if (b.startsWith('52617221')) return 'rar';
  if (Buffer.from(bytes.slice(0, 5)).toString('latin1') === '{\\rtf') return 'rtf';
  if (/^(?:﻿)?\s*<(?:!doctype\s+html|html)/i.test(Buffer.from(bytes.slice(0, 200)).toString('utf8'))) return 'html';
  return null;
}

async function baixa(url) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(300000) });
      if (r.ok) return new Uint8Array(await r.arrayBuffer());
    } catch { /* tenta de novo */ }
    await new Promise(x => setTimeout(x, 5000));
  }
  return null;
}

// Devolve { bytes, nome, origem } com o PDF do edital, convertendo se preciso.
// fundo: quantos pacotes dentro de pacotes ainda vale abrir — Araguari/MG
// publica um zip com um .rar dentro (23/09/2026).
function doPacote(entradas, fundo = 1) {
  const uteis = entradas
    .filter(x => !/\/$/.test(x.nome))
    .map(x => ({ x, ext: extDe(x.nome), n: nota(x.nome) }))
    .filter(x => (x.ext === 'pdf' || CONVERSIVEIS.has(x.ext)) && x.n < 9)
    // PDF antes do documento de texto com a mesma nota: converter e o ultimo recurso
    .sort((a, b) => a.n - b.n || (a.ext === 'pdf' ? 0 : 1) - (b.ext === 'pdf' ? 0 : 1));
  for (const u of uteis) {
    const bytes = u.x.abre();
    if (u.ext === 'pdf') return { bytes, nome: u.x.nome, origem: 'do pacote' };
    const pdf = pdfDeDocumento(bytes, u.ext);
    if (pdf) return { bytes: pdf, nome: u.x.nome, origem: 'convertido do ' + u.ext };
  }
  if (fundo > 0) {
    for (const x of entradas) {
      const ext = extDe(x.nome);
      if (ext !== 'rar' && ext !== 'zip') continue;
      let dentro = null;
      try { dentro = ext === 'rar' ? abreRar(x.abre()) : abreZip(x.abre()); } catch { continue; }
      const achado = dentro && doPacote(dentro, fundo - 1);
      if (achado) return { ...achado, origem: achado.origem + ' (dentro do ' + ext + ')' };
    }
  }
  return null;
}

const saida = { ...jaTem };
let feitos = 0, semJeito = 0, grandes = 0, erros = 0, total = 0;
for (const e of dados.editais) {
  if (!alvos.includes(e)) continue;
  const nome = `${e[C.municipio]}/${e[C.uf]} ${e[C.edital]}`;
  const [c, a, s] = e[C.path].split('/');
  const url = `https://pncp.gov.br/pncp-api/v1/orgaos/${c}/compras/${a}/${s}/arquivos/${e[C.arquivoSeq] || 1}`;
  try {
    const bruto = await baixa(url);
    if (!bruto) { erros++; console.log(`  [erro] ${nome}: nao baixou`); continue; }
    const tipo = tipoDe(bruto);
    let achado = null;
    if (tipo === 'pdf') achado = { bytes: bruto, nome: 'arquivo publicado', origem: 'ja era PDF' };
    else if (tipo === 'zip') achado = doPacote(abreZip(bruto));
    else if (tipo === 'rar') { const d = abreRar(bruto); achado = d ? doPacote(d) : null; }
    else if (tipo === 'ole') { const p = pdfDeDocumento(bruto, 'doc'); achado = p && { bytes: p, nome: 'arquivo publicado', origem: 'convertido do doc' }; }
    else if (tipo === 'rtf' || tipo === 'html' || tipo === 'docx' || tipo === 'odt') {
      const p = pdfDeDocumento(bruto, tipo);
      achado = p && { bytes: p, nome: 'arquivo publicado', origem: 'convertido do ' + tipo };
    }
    else {
      // sem assinatura conhecida: tenta pela extensao que o PNCP anunciou
      const ext = String(e[C.arquivoExtensao] || '').toLowerCase();
      const p = pdfDeDocumento(bruto, ext);
      achado = p && { bytes: p, nome: 'arquivo publicado', origem: 'convertido do ' + ext };
    }
    if (!achado) { semJeito++; delete saida[e[C.path]]; console.log(`  ${nome} · sem como converter (${tipo || e[C.arquivoExtensao]})`); continue; }
    // Confere que o resultado abre mesmo como PDF antes de guardar.
    const le = await LE.abre(achado.bytes);
    const mb = achado.bytes.length / 1024 / 1024;
    if (mb > TETO_MB) {
      grandes++; delete saida[e[C.path]];
      console.log(`  ${nome} · ${mb.toFixed(1)} MB passa do teto de ${TETO_MB} MB — fica so o link do PNCP`);
      continue;
    }
    saida[e[C.path]] = { nome: achado.nome.split('/').pop(), origem: achado.origem, paginas: le.total,
                         de: String(e[C.arquivoExtensao] || '').toLowerCase(),
                         b64: Buffer.from(achado.bytes).toString('base64') };
    total += achado.bytes.length; feitos++;
    console.log(`  ${nome} · ${achado.origem} · ${achado.nome.split('/').pop()} · ${le.total} pag · ${(achado.bytes.length / 1024).toFixed(0)} KB`);
  } catch (err) { erros++; console.log(`  [erro] ${nome}: ${err.message}`); }
}

// So os editais da lista de hoje ficam no arquivo.
const vivos = new Set(dados.editais.map(e => e[C.path]));
for (const k of Object.keys(saida)) if (!vivos.has(k)) delete saida[k];

fs.writeFileSync(arquivoSaida, JSON.stringify({ varredura: dados.meta && dados.meta.varredura, editais: saida }), 'utf8');
console.log(`\n${feitos} edital(is) convertido(s) agora · ${semJeito} sem jeito · ${grandes} acima do teto · ${erros} erro(s)`);
console.log(`docs/editais-pdf.json: ${Object.keys(saida).length} editais · ${(fs.statSync(arquivoSaida).size / 1024 / 1024).toFixed(1)} MB`);
