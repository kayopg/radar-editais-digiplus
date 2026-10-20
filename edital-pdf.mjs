// O edital que o orgao publicou em ZIP, RAR, DOC, DOCX, ODT ou RTF, convertido
// para PDF — para o botao "Baixar edital" entregar sempre um PDF.
//
// O usuario pediu em 23/09/2026: "tem arquivos que estao em zip, docx, e outros
// sem ser PDF, tente passar todos para pdf". Dentro do artefato o navegador nao
// consegue buscar o arquivo no PNCP (o endpoint de arquivos manda o CORS
// errado), entao o PDF viaja embutido, como ja fazem as folhas de abertura.
//
// O que entra: ate 14/10/2026, UM documento por edital — o edital propriamente
// dito. Desde entao o ZIP e o RAR viram o pacote inteiro num PDF so, na ordem
// que o usuario pediu (ver juntaPacote, mais abaixo); acima do teto, fica so o
// edital, como antes. O DOC, DOCX, ODT e RTF avulsos sao um documento so.
//
// Uso:
//   node edital-pdf.mjs                -> todos os editais que nao sao PDF
//   node edital-pdf.mjs --faltantes    -> so os que ainda nao tem
//   node edital-pdf.mjs --so a/b/c     -> refaz esses
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
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
// O convertido guarda de que arquivo do PNCP veio ("arq"): se a varredura passa
// a apontar outro (edital republicado, versao-do-edital.mjs, 13/10/2026), ele
// e refeito mesmo com --faltantes — o robo do site guarda os convertidos em cache.
// E o convertido de versao anterior a montagem atual (VERSAO 2, 14/10/2026: o
// zip e o rar viram o pacote inteiro num PDF so) e refeito tambem.
const VERSAO = 2;
if (FALTANTES) alvos = alvos.filter(e => !jaTem[e[C.path]] || (jaTem[e[C.path]].arq !== undefined && jaTem[e[C.path]].arq !== (e[C.arquivoSeq] || 1))
  || (/^(?:zip|rar)$/.test(String(e[C.arquivoExtensao] || '').toLowerCase()) && (jaTem[e[C.path]].v || 1) < VERSAO));
// e o edital que agora aponta um PDF nao precisa mais do convertido — menos o
// PDF unico dos arquivos separados ("arqs", 16/10/2026)
for (const e of dados.editais)
  if (String(e[C.arquivoExtensao] || '').toLowerCase() === 'pdf' && !(jaTem[e[C.path]] && jaTem[e[C.path]].arqs)) delete jaTem[e[C.path]];
if (SO.length) alvos = alvos.filter(e => SO.includes(e[C.path]));

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Qual documento do pacote e o edital. A ordem e a mesma do resumo-pdf.mjs:
// edital, termo de referencia, o resto.
// Nome que e so o codigo do procedimento: "PE251-26", "PE 0492026 itens de
// cozinha", "PP_12-2026". Tem de COMECAR pelo codigo e ter numero logo depois,
// para nao pegar "PE_ETP" ou "pesquisa".
export const CODIGO_DO_PREGAO = /^(?:pe|pp|pregao|cc|tp|dl|ce|rp)\s*[-_.]?\s*n?[ºo°]?\s*\d{1,4}\s*[-_./]?\s*\d{2,4}(?!\d)/;

function nota(nome) {
  // So o nome do arquivo, sem a pasta: no zip de Brasilia/DF (pregao 107/2026)
  // tudo fica em "Edital e anexos/", e o "ANEXO I – Termo de Referencia" valia
  // como edital pela pasta (13/10/2026).
  const s = norm(String(nome).split('/').pop());
  // O anexo que comeca pelo codigo do pregao nao e o edital: "PE 226-2026 - SRP
  // - Anexo I - Termo de Referencia.pdf" passava pelo CODIGO_DO_PREGAO e saia no
  // botao no lugar do "PE 226-2026 - SRP - Edital.pdf" (Florianopolis/SC, 13/10/2026).
  const ehAnexo = /(?:^|[^a-z])(?:anexo|apendice)(?:[^a-z]|$)|termo de referencia|minuta/.test(s);
  // Decreto, portaria, parecer e matriz de risco nunca sao o edital: o pacote
  // de Corrego Danta/MG so traz o "Decreto no 978-2024 - REGIONALIZACAO", e ele
  // saia como "o edital em PDF" do botao (23/09/2026). Nota 9 e recusa: melhor
  // o card sem o botao do que com o documento errado.
  if (/(?:^|[^a-z])(?:decreto|portaria|parecer|matriz de risco|mapa de riscos?)(?:[^a-z]|$)/.test(s)) return 9;
  if (/edital|aviso de (?:licitacao|contratacao)/.test(s) && !/minuta|contrato/.test(s)) return 0;
  // O arquivo que se chama so pelo CODIGO DO PREGAO tambem e o edital: o zip de
  // Caxias do Sul/RS traz "PE251-26.odt" ao lado de "Anexo I - Termo de
  // Referencia.odt" e "Anexo II - Minuta de Termo de Contrato.odt", e sem esta
  // linha o botao "Baixar edital" entregava o Termo de Referencia (28/09/2026).
  if (CODIGO_DO_PREGAO.test(s) && !ehAnexo) return 0;
  // "TR984767_000186_2026.pdf": TR do Compras.gov com a UASG colada (ver pagina-abertura.mjs)
  if (/termo de referencia|(?:^|[^a-z])tr(?:[\s_.-]|\d{5})|especifica|descritiv|memorial/.test(s)) return 1;
  if (/etp|estudo tecnico|formalizacao|mapa de risco|pesquisa|cotacao|preco|planilha|media/.test(s)) return 3;
  return 2;
}

// ------------------------------------------------- o pacote inteiro num PDF so
// O usuario, em 14/10/2026: "quando o edital esta em zip, coloque tudo em um
// unico arquivo PDF seguindo a seguinte ordem: 1. Edital; 2. Termo de
// Referencia; 3. Declaracoes (na ordem que apresenta); 4. ATA; 5. Contrato; 6.
// Estudo Tecnico Preliminar. Exatamente nessa ordem, caso nao tenha algum desses
// arquivos, siga a ordem do mesmo jeito." O que nao e nenhum dos seis (pesquisa
// de precos, planilha, mapa de riscos, decreto) vai no fim, na ordem do pacote,
// para nada do zip ficar de fora.
export const PARTES = ['Edital', 'Termo de Referência', 'Declarações', 'Ata', 'Contrato', 'Estudo Técnico Preliminar', 'Outros'];
export function parteDoPacote(nome) {
  const s = norm(String(nome).split('/').pop());
  if (/(?:^|[^a-z])etp(?:[^a-z]|$)|estudo tecnico/.test(s)) return 5;
  // so a palavra "ata": "Edital ... para Registro de Precos" e edital
  if (/(?:^|[^a-z])ata(?:[^a-z]|$)/.test(s)) return 3;
  // (a nota de empenho faz as vezes do contrato: "Anexo II - Minuta Nota de
  // Empenho", Sao Paulo/SP, edital 395)
  if (/contrato(?!r)|nota de empenho/.test(s)) return 4;
  // (e a relacao dos itens, que e especificacao: "03 - Anexo I - Relacao dos
  // Itens da Licitacao", Fazenda Rio Grande/PR; "Anexo I - Termo de
  // Referenc.odt", nome cortado, Caxias do Sul/RS; "Anexo I - Termo Ref
  // Apendices", "Anexo VIII - Esp Tecnica PRODAUB", Uberlandia/MG; "ANEXO V-
  // Descricao detalhada dos itens", Santa Maria/RS)
  if (/termo\s+(?:de\s+)?ref|(?:^|[^a-z])tr(?:[\s_.-]|\d{5})|projeto basico|especificac|esp\.? tecnica|descritiv|descricao detalhada|memorial|relacao d[oe]s? itens/.test(s)) return 1;
  if (/declarac|modelo|proposta|procurac|credenciamento|carta (?:de|para)|formulario/.test(s)) return 2;
  if (/(?:^|[^a-z])(?:decreto|portaria|parecer|matriz de risco|mapa de riscos?)(?:[^a-z]|$)/.test(s)) return 6;
  if (/edital|aviso de (?:licitacao|contratacao|dispensa)|^aviso(?:[^a-z]|$)|dispensa eletronica/.test(s)) return 0;
  // o nome so com o codigo do pregao e o edital, menos o anexo que tambem comeca
  // por ele: "PE 226-2026 - SRP - Anexo III - Protecao de Dados" (Florianopolis/SC)
  if (CODIGO_DO_PREGAO.test(s) && !/(?:^|[^a-z])(?:anexo|apendice)(?:[^a-z]|$)/.test(s)) return 0;
  return 6;
}
// "Anexo III - Declaracoes" vem antes de "Anexo IV - Modelo de Proposta": o
// numero do anexo, em algarismo ou romano, ordena dentro do grupo; sem ele,
// a ordem em que o pacote traz.
const ROMANO = { i: 1, v: 5, x: 10, l: 50, c: 100 };
function numeroDoAnexo(nome) {
  const m = /(?:^|[^a-z])anexo\s*(?:n[ºo°.]?\s*)?([ivxlc]{1,6}|\d{1,2})(?![a-z0-9])/.exec(norm(String(nome).split('/').pop()));
  if (!m) return null;
  if (/\d/.test(m[1])) return +m[1];
  let t = 0;
  for (let i = 0; i < m[1].length; i++) { const a = ROMANO[m[1][i]], b = ROMANO[m[1][i + 1]] || 0; t += a < b ? -a : a; }
  return t;
}

// As paginas de cada documento copiadas (RadarPDFLe.extraiPaginas) e gravadas
// num PDF novo, sem pagina nossa. Cada documento ganha numeros proprios antes:
// os dois tem um objeto 5, e juntos sem isso um apontaria para o do outro.
function renumera(pacote, s) {
  const novoId = id => (typeof id === 'number' ? (s + 1) * 10000000 + id : 'S' + s + id);
  const troca = v => {
    if (LE.ehRef(v)) return LE.Ref(novoId(v.num), 0);
    if (Array.isArray(v)) return v.map(troca);
    if (v && v.__fluxo) return { __fluxo: true, dict: troca(v.dict), bruto: v.bruto };
    if (LE.ehDict(v)) { const m = {}; for (const k in v.__dict) m[k] = troca(v.__dict[k]); return LE.Dict(m); }
    return v;
  };
  return { objetos: pacote.objetos.map(o => ({ id: novoId(o.id), valor: troca(o.valor) })), paginas: pacote.paginas.map(novoId) };
}
function pdfDasPaginas(pacotes) {
  const objetos = pacotes.flatMap(p => p.objetos), paginas = pacotes.flatMap(p => p.paginas);
  const mapa = new Map();
  let prox = 3;
  for (const o of objetos) mapa.set(o.id, prox++);
  const remapeia = n => (n === -1 ? 2 : (mapa.get(n) ?? 0));
  const partes = [];
  let tam = 0;
  const offsets = [0];
  const poe = s => { const b = Buffer.from(s, 'latin1'); partes.push(b); tam += b.length; };
  poe('%PDF-1.7\n%âãÏÓ\n');
  offsets[1] = tam; poe('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  offsets[2] = tam; poe('2 0 obj\n<< /Type /Pages /Count ' + paginas.length + ' /Kids [' + paginas.map(id => mapa.get(id) + ' 0 R').join(' ') + '] >>\nendobj\n');
  for (const o of objetos) {
    const n = mapa.get(o.id);
    let v = o.valor;
    offsets[n] = tam;
    if (v && v.__fluxo) {
      const d = { ...v.dict.__dict, Length: v.bruto.length };   // o /Length da origem pode ser referencia
      poe(n + ' 0 obj\n' + LE.serializa(LE.Dict(d), remapeia) + '\nstream\n');
      const b = Buffer.from(v.bruto); partes.push(b); tam += b.length;
      poe('\nendstream\nendobj\n');
      continue;
    }
    // a pagina copiada aponta para a arvore de paginas deste PDF
    if (LE.ehDict(v) && LE.ehNome(v.__dict.Type) && v.__dict.Type.__nome === 'Page') v = LE.Dict({ ...v.__dict, Parent: LE.Ref(-1, 0) });
    poe(n + ' 0 obj\n' + LE.serializa(v, remapeia) + '\nendobj\n');
  }
  const inicioXref = tam;
  let xref = 'xref\n0 ' + prox + '\n0000000000 65535 f \n';
  for (let n = 1; n < prox; n++) xref += String(offsets[n] || 0).padStart(10, '0') + ' 00000 n \n';
  poe(xref + 'trailer\n<< /Size ' + prox + ' /Root 1 0 R >>\nstartxref\n' + inicioXref + '\n%%EOF\n');
  return new Uint8Array(Buffer.concat(partes));
}

// Os documentos do pacote (e dos pacotes de dentro dele), em PDF, na ordem do
// usuario, e o PDF unico. Sem edital nem termo de referencia no pacote,
// devolve null: o zip so de decreto (Corrego Danta/MG) nao vira "o edital".
async function juntaPacote(entradas) {
  const todas = [];
  const desce = (lista, fundo, pasta) => {
    for (const x of lista) {
      if (/\/$/.test(x.nome)) continue;
      const ext = extDe(x.nome);
      if ((ext === 'zip' || ext === 'rar') && fundo > 0) {
        let dentro = null;
        try { dentro = ext === 'rar' ? abreRar(x.abre()) : abreZip(x.abre()); } catch { dentro = null; }
        if (dentro) desce(dentro, fundo - 1, x.nome + '/');
        continue;
      }
      if (ext === 'pdf' || CONVERSIVEIS.has(ext)) todas.push({ x, ext, nome: pasta + x.nome, i: todas.length });
    }
  };
  desce(entradas, 1, '');
  // o mesmo documento em PDF e em Word ("Edital.pdf" e "Edital.docx", ou "02.7
  // - Anexo VII do TR - Modelos de Declaracao.docx" ao lado do mesmo nome com o
  // codigo do sistema no fim, em PDF — Telebras, Brasilia/DF): fica o PDF
  const base = u => norm(u.nome.split('/').pop()).replace(/\.[a-z0-9]+$/, '').trim();
  const pdfs = todas.filter(u => u.ext === 'pdf').map(base);
  // Dentro do grupo, a ordem em que o pacote apresenta: o nome do arquivo com os
  // numeros comparados como numero ("02 - Anexo A - Termo de Referencia" antes
  // de "02.1 - Anexo I do TR", "02.10" depois de "02.9"); quando os dois tem
  // numero de anexo, ele decide ("Anexo IX" depois de "Anexo V").
  const docs = todas.filter(u => u.ext === 'pdf' || !pdfs.some(p => p === base(u) || p.startsWith(base(u) + ' ')))
    .map(u => ({ ...u, parte: parteDoPacote(u.nome), anexo: numeroDoAnexo(u.nome),
      // no grupo do edital, o edital antes do aviso ("Aviso PE RP 490 2026", Uberlandia/MG)
      principal: parteDoPacote(u.nome) === 0 && !/edital/.test(norm(u.nome.split("/").pop())) ? 1 : 0 }))
    .sort((a, b) => a.parte - b.parte || a.principal - b.principal
      || (a.anexo != null && b.anexo != null ? a.anexo - b.anexo : 0)
      || a.nome.split('/').pop().localeCompare(b.nome.split('/').pop(), 'pt-BR', { numeric: true, sensitivity: 'base' })
      || a.i - b.i);
  if (!docs.some(u => u.parte <= 1)) return null;
  const pacotes = [], partes = [];
  // o mesmo arquivo duas vezes (no pacote e solto no PNCP, ou cadastrado duas
  // vezes: Goiania/GO, edital 353) entra uma vez so
  const vistos = new Set();
  for (const u of docs) {
    const h = createHash('sha1').update(u.x.abre()).digest('hex');
    if (vistos.has(h)) continue;
    vistos.add(h);
    let bytes = null;
    try { bytes = u.ext === 'pdf' ? u.x.abre() : pdfDeDocumento(u.x.abre(), u.ext); } catch { bytes = null; }
    if (!bytes) { console.log(`      (sem conversao: ${u.nome.split('/').pop()})`); continue; }
    try {
      const le = await LE.abre(bytes);
      const pac = await LE.extraiPaginas(le, Array.from({ length: le.total }, (_, k) => k));
      if (!pac.paginas.length) continue;
      pacotes.push(renumera(pac, pacotes.length));
      partes.push({ nome: u.nome.split('/').pop(), parte: PARTES[u.parte], paginas: pac.paginas.length });
    } catch (err) { console.log(`      (nao abre como PDF: ${u.nome.split('/').pop()} · ${err.message})`); }
  }
  if (!partes.some(p => p.parte === PARTES[0] || p.parte === PARTES[1])) return null;
  return { bytes: pdfDasPaginas(pacotes), nome: partes[0].nome, origem: 'pacote inteiro', partes };
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

// O PDF do edital dentro de UM arquivo baixado, seja ele qual for.
function doArquivo(bruto, e) {
  const tipo = tipoDe(bruto);
  if (tipo === 'pdf') return { tipo, achado: { bytes: bruto, nome: 'arquivo publicado', origem: 'ja era PDF' } };
  if (tipo === 'zip') return { tipo, achado: doPacote(abreZip(bruto)) };
  if (tipo === 'rar') { const d = abreRar(bruto); return { tipo, achado: d ? doPacote(d) : null }; }
  if (tipo === 'ole') { const p = pdfDeDocumento(bruto, 'doc'); return { tipo, achado: p && { bytes: p, nome: 'arquivo publicado', origem: 'convertido do doc' } }; }
  if (tipo === 'rtf' || tipo === 'html' || tipo === 'docx' || tipo === 'odt') {
    const p = pdfDeDocumento(bruto, tipo);
    return { tipo, achado: p && { bytes: p, nome: 'arquivo publicado', origem: 'convertido do ' + tipo } };
  }
  // sem assinatura conhecida: tenta pela extensao que o PNCP anunciou
  const ext = String(e[C.arquivoExtensao] || '').toLowerCase();
  const p = pdfDeDocumento(bruto, ext);
  return { tipo, achado: p && { bytes: p, nome: 'arquivo publicado', origem: 'convertido do ' + ext } };
}

// Os OUTROS arquivos publicados no mesmo edital, para quando o que o PNCP
// anuncia no "arquivoSeq" nao traz edital nenhum: Corrego Danta/MG publica dois
// zips e o anunciado so tem o "Decreto no 978-2024 - REGIONALIZACAO"; o edital
// esta no segundo (24/09/2026). Vem na ordem da nota, o edital na frente.
const arquivosDe = async (e) => {
  const [c, a, s] = e[C.path].split('/');
  try {
    const r = await fetch(`https://pncp.gov.br/api/pncp/v1/orgaos/${c}/compras/${a}/${s}/arquivos`, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) return [];
    const j = await r.json();
    return (Array.isArray(j) ? j : [])
      .map(x => ({ seq: x.sequencialDocumento, nome: String(x.titulo || '') }))
      .filter(x => x.seq && x.seq !== (e[C.arquivoSeq] || 1) && nota(x.nome) < 9)
      .sort((x, y) => nota(x.nome) - nota(y.nome));
  } catch { return []; }
};

// ------------------------------------- os documentos SEPARADOS no PNCP, juntos
// O usuario, em 16/10/2026: "quando aparecer o termo de referencia, o edital,
// etc, separados no portal, faca o mesmo esquema que voce fez com os arquivos
// .zip, organize eles em um PDF so". O orgao que publica o edital, o termo de
// referencia, o estudo tecnico e as declaracoes como arquivos separados do
// mesmo edital ganha o PDF unico, na mesma ordem do pacote (juntaPacote) — vale
// tambem para o edital publicado em PDF, que ate aqui so tinha a copia do
// arquivo principal (originais.mjs). Cada arquivo e classificado pelo titulo; o
// titulo generico ("TR", "ETP", "918/2026.pdf") vai pelo tipo de documento que o
// PNCP informa ("Termo de Referencia", "Estudo Tecnico Preliminar"). A certidao
// e o comprovante de publicacao, que o orgao as vezes cadastra como "Edital",
// ficam no fim, com o resto.
const listaDeArquivos = async e => {
  const [c, a, s] = e[C.path].split('/');
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`https://pncp.gov.br/api/pncp/v1/orgaos/${c}/compras/${a}/${s}/arquivos`, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) return null;
      const j = await r.json();
      return (Array.isArray(j) ? j : []).filter(x => x.statusAtivo !== false && x.sequencialDocumento)
        .map(x => ({ seq: +x.sequencialDocumento, titulo: String(x.titulo || ''), tipo: String(x.tipoDocumentoNome || '') }))
        .sort((x, y) => x.seq - y.seq);
    } catch { await new Promise(x => setTimeout(x, 3000)); }
  }
  return null;
};
const nomeNoPacote = (titulo, tipo) => {
  const t = String(titulo).replace(/[\\/]+/g, '-').replace(/\.(?:pdf|docx?|odt|rtf|zip|rar|html?)$/i, '').trim() || 'documento';
  if (parteDoPacote(t) !== 6 || /certid|comprovante|publicac|extrato/.test(norm(t))) return t;
  return String(tipo).replace(/[\\/]+/g, '-').trim() + ' - ' + t;
};
const chaveDosArquivos = lista => (lista || []).map(f => f.seq).join(',');
// O arquivo que o orgao cadastrou duas vezes ("353-2026 proposta.pdf" e "353-2026
// minuta de contrato.pdf" repetidos, Goiania/GO, edital 353) entra uma vez so, e
// o original que tem a versao retificada ao lado sai ("EDITAL_PE_1562026_..." e
// "EDITAL_PE_1562026_..._RETIFICADO", Palmeiras de Goias/GO, edital 156).
const semExt = t => norm(t).replace(/\.(?:pdf|docx?|odt|rtf|zip|rar|html?)$/, '').trim();
const retificado = (f, lista) => lista.some(g => g !== f && semExt(g.titulo).startsWith(semExt(f.titulo))
  && /^[\s_-]*(?:\(?\s*)?retifica/.test(semExt(g.titulo).slice(semExt(f.titulo).length)));
async function juntaSeparados(e, lista, urlDe) {
  const entradas = [];
  const vistos = new Set();
  let mb = 0;
  for (const f of lista) {
    if (retificado(f, lista)) { console.log(`      (fica so a versao retificada: ${f.titulo})`); continue; }
    const b = await baixa(urlDe(f.seq));
    if (!b) { console.log(`      (nao baixou o arquivo ${f.seq}: ${f.titulo})`); continue; }
    const h = createHash('sha1').update(b).digest('hex');
    if (vistos.has(h)) { console.log(`      (repetido: ${f.titulo})`); continue; }
    vistos.add(h);
    mb += b.length / 1048576;
    if (mb > 200) { console.log('      (mais de 200 MB de arquivos: para por aqui)'); break; }
    const tipo = tipoDe(b);
    const ext = tipo === 'ole' ? 'doc' : tipo || extDe(f.titulo);
    if (!ext) continue;
    entradas.push({ nome: nomeNoPacote(f.titulo, f.tipo) + '.' + ext, abre: () => b });
  }
  const junto = entradas.length >= 2 ? await juntaPacote(entradas) : null;
  return junto && junto.partes.length >= 2 ? { ...junto, origem: 'arquivos separados do PNCP', separados: lista.length } : null;
}

// a lista de arquivos de cada edital do dia: quem tem mais de um documento entra
// (e o de --faltantes so de novo quando a lista muda: errata, anexo novo)
const listas = new Map();
{
  const fila = dados.editais.filter(e => !SO.length || SO.includes(e[C.path]));
  for (let i = 0; i < fila.length; i += 6)
    await Promise.all(fila.slice(i, i + 6).map(async e => listas.set(e[C.path], await listaDeArquivos(e))));
}
const varios = e => (listas.get(e[C.path]) || []).length >= 2;
for (const e of dados.editais) {
  if (alvos.includes(e) || !varios(e) || (SO.length && !SO.includes(e[C.path]))) continue;
  const ja = jaTem[e[C.path]];
  if (FALTANTES && ja && ja.arqs === chaveDosArquivos(listas.get(e[C.path]))) continue;
  alvos.push(e);
}
// e o nao-PDF ja convertido que agora tem varios arquivos (ou outra lista deles)
if (FALTANTES) for (const e of dados.editais) {
  const ja = jaTem[e[C.path]];
  if (!alvos.includes(e) && varios(e) && ja && ja.arqs !== chaveDosArquivos(listas.get(e[C.path]))) alvos.push(e);
}

const saida = { ...jaTem };
let feitos = 0, semJeito = 0, grandes = 0, erros = 0, total = 0, juntados = 0;
for (const e of dados.editais) {
  if (!alvos.includes(e)) continue;
  const nome = `${e[C.municipio]}/${e[C.uf]} ${e[C.edital]}`;
  const [c, a, s] = e[C.path].split('/');
  const urlDe = seq => `https://pncp.gov.br/pncp-api/v1/orgaos/${c}/compras/${a}/${s}/arquivos/${seq}`;
  try {
    const lista = listas.get(e[C.path]);
    const ehPdf = String(e[C.arquivoExtensao] || '').toLowerCase() === 'pdf';
    // os documentos separados no PNCP, juntos
    if (lista && lista.length >= 2) {
      const junto = await juntaSeparados(e, lista, urlDe);
      if (junto && junto.bytes.length <= TETO_MB * 1024 * 1024) {
        const le = await LE.abre(junto.bytes);
        saida[e[C.path]] = { nome: junto.nome.split('/').pop(), origem: junto.origem, paginas: le.total, arq: e[C.arquivoSeq] || 1,
                             de: String(e[C.arquivoExtensao] || '').toLowerCase(), v: VERSAO, arqs: chaveDosArquivos(lista),
                             separados: junto.separados, partes: junto.partes, b64: Buffer.from(junto.bytes).toString('base64') };
        total += junto.bytes.length; feitos++; juntados++;
        console.log(`  ${nome} · ${junto.origem} (${lista.length}) · ${le.total} pag · ${(junto.bytes.length / 1024).toFixed(0)} KB\n      `
          + junto.partes.map(p => `${p.parte}: ${p.nome} (${p.paginas})`).join(' | '));
        continue;
      }
      if (junto) console.log(`  ${nome} · os ${lista.length} arquivos juntos dao ${(junto.bytes.length / 1024 / 1024).toFixed(1)} MB, passa do teto de ${TETO_MB} MB`);
      // o edital em PDF sem o PDF unico fica com a copia do arquivo principal (originais.mjs)
      if (ehPdf) { delete saida[e[C.path]]; continue; }
    }
    const bruto = await baixa(urlDe(e[C.arquivoSeq] || 1));
    if (!bruto) { erros++; console.log(`  [erro] ${nome}: nao baixou`); continue; }
    let { tipo, achado } = doArquivo(bruto, e);
    // ZIP ou RAR: o pacote inteiro num PDF so, na ordem do usuario. Acima do
    // teto fica so o edital, como antes.
    if (tipo === 'zip' || tipo === 'rar') {
      let junto = null;
      try { const d = tipo === 'rar' ? abreRar(bruto) : abreZip(bruto); junto = d && await juntaPacote(d); } catch (err) { console.log(`      (pacote nao juntou: ${err.message})`); }
      if (junto && junto.bytes.length <= TETO_MB * 1024 * 1024) achado = junto;
      else if (junto) console.log(`      pacote inteiro com ${(junto.bytes.length / 1024 / 1024).toFixed(1)} MB passa do teto de ${TETO_MB} MB — fica so o edital`);
    }
    if (!achado) for (const o of await arquivosDe(e)) {
      const outro = await baixa(urlDe(o.seq));
      if (!outro) continue;
      const r = doArquivo(outro, e);
      if (!r.achado) continue;
      achado = { ...r.achado, origem: r.achado.origem + ' (arquivo ' + o.seq + ' do PNCP)' };
      break;
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
    saida[e[C.path]] = { nome: achado.nome.split('/').pop(), origem: achado.origem, paginas: le.total, arq: e[C.arquivoSeq] || 1,
                         de: String(e[C.arquivoExtensao] || '').toLowerCase(), v: VERSAO,
                         ...(achado.partes ? { partes: achado.partes } : {}),
                         b64: Buffer.from(achado.bytes).toString('base64') };
    total += achado.bytes.length; feitos++;
    console.log(`  ${nome} · ${achado.origem} · ${achado.nome.split('/').pop()} · ${le.total} pag · ${(achado.bytes.length / 1024).toFixed(0)} KB`
      + (achado.partes ? '\n      ' + achado.partes.map(p => `${p.parte}: ${p.nome} (${p.paginas})`).join(' | ') : ''));
  } catch (err) { erros++; console.log(`  [erro] ${nome}: ${err.message}`); }
}

// So os editais da lista de hoje ficam no arquivo.
const vivos = new Set(dados.editais.map(e => e[C.path]));
for (const k of Object.keys(saida)) if (!vivos.has(k)) delete saida[k];

fs.writeFileSync(arquivoSaida, JSON.stringify({ varredura: dados.meta && dados.meta.varredura, editais: saida }), 'utf8');
console.log(`\n${feitos} edital(is) convertido(s) agora (${juntados} com os arquivos separados do PNCP juntos) · ${semJeito} sem jeito · ${grandes} acima do teto · ${erros} erro(s)`);
console.log(`docs/editais-pdf.json: ${Object.keys(saida).length} editais · ${(fs.statSync(arquivoSaida).size / 1024 / 1024).toFixed(1)} MB`);
