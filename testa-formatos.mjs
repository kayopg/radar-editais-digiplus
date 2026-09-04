// Sonda o que o orgao publicou nos editais que ficaram sem anexo: lista todos
// os arquivos, abre os ZIP, e mede quanto texto sai de cada DOC/DOCX.
//
// Uso: node testa-formatos.mjs [busca]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abreZip, pdfsDoZip, textoDocx, textoDoc, extDe } from './arquivo-oficial.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));
const indice = JSON.parse(fs.readFileSync(path.join(DIR, 'resumos', 'indice.json'), 'utf8'));
const C = dados.colunas.reduce((o, n, i) => (o[n] = i, o), {});

const semAnexo = new Set(indice.editais.filter(r => !/pag\. do oficial/.test(r.nota))
  .map(r => r.uf + '|' + r.mun + '|' + r.edital));
const busca = process.argv[2];
let alvos = dados.editais.filter(e => semAnexo.has(e[C.uf] + '|' + e[C.municipio] + '|' + e[C.edital]));
if (busca) alvos = alvos.filter(e => (e[C.municipio] + '/' + e[C.uf]).toLowerCase().includes(busca.toLowerCase()));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const kb = n => (n / 1024).toFixed(0) + ' KB';

for (const e of alvos) {
  const [cnpj, ano, seq] = e[C.path].split('/');
  console.log('\n### ' + e[C.municipio] + '/' + e[C.uf] + ' — ' + e[C.edital]);
  let lista = [];
  try {
    const r = await fetch(`https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/arquivos`);
    lista = await r.json();
  } catch (err) { console.log('  listagem falhou:', err.message); continue; }

  for (const a of (lista || [])) {
    const url = `https://pncp.gov.br/pncp-api/v1/orgaos/${cnpj}/compras/${ano}/${seq}/arquivos/${a.sequencialDocumento}`;
    let bytes;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      bytes = new Uint8Array(await r.arrayBuffer());
    } catch (err) { console.log('  [' + a.sequencialDocumento + '] baixar falhou:', err.message); continue; }

    // A extensao do titulo mente as vezes; o inicio do arquivo nao.
    const b = Buffer.from(bytes.slice(0, 8));
    const magica = b.slice(0, 4).toString('hex');
    const tipo = magica.startsWith('25504446') ? 'pdf'
      : magica.startsWith('504b0304') ? 'zip'
      : magica.startsWith('d0cf11e0') ? 'ole(doc/xls)'
      : magica.startsWith('7b5c7274') ? 'rtf' : 'desconhecido(' + magica + ')';
    console.log('  [' + a.sequencialDocumento + '] ' + a.tipoDocumentoNome + ' · ' + a.titulo
      + ' · ' + kb(bytes.length) + ' · real: ' + tipo);

    try {
      if (tipo === 'zip') {
        const dentro = abreZip(bytes);
        const ext = {};
        for (const d of dentro) ext[extDe(d.nome) || '?'] = (ext[extDe(d.nome) || '?'] || 0) + 1;
        console.log('      ' + dentro.length + ' arquivo(s): ' + JSON.stringify(ext));
        const pdfs = pdfsDoZip(bytes);
        for (const p of pdfs.slice(0, 6)) console.log('      pdf: ' + p.nome + ' · ' + kb(p.tamanho) + ' · peso ' + p.peso);
        // Um .docx dentro do zip tambem serve, se nao houver PDF nenhum.
        if (!pdfs.length) {
          const docs = dentro.filter(d => extDe(d.nome) === 'docx');
          for (const d of docs.slice(0, 4)) {
            const t = textoDocx(d.abre());
            console.log('      docx: ' + d.nome + ' · ' + t.length + ' chars · ' + JSON.stringify(t.slice(0, 90)));
          }
        }
      } else if (extDe(a.titulo) === 'docx' || tipo === 'zip') {
        const t = textoDocx(bytes);
        console.log('      texto: ' + t.length + ' chars · ' + JSON.stringify(t.slice(0, 120)));
      } else if (tipo === 'ole(doc/xls)') {
        const t = textoDoc(bytes);
        console.log('      texto: ' + t.length + ' chars · ' + JSON.stringify(t.slice(0, 120)));
      }
    } catch (err) { console.log('      erro ao abrir: ' + err.message); }
    await sleep(300);
  }
}
