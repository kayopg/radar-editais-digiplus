// Guarda uma copia de cada edital do dia que o orgao publicou em PDF, para o
// site baixar o arquivo com o nome no padrao das pastas do usuario (pedido de
// 14/10/2026): "19.10.2026 PE 87.2026 PM Toledo - PR" — ver nomeDoEdital() no
// docs/index.html.
//
// O link direto do PNCP nao deixa trocar o nome: o arquivo vem de outro
// dominio, o navegador ignora o nome que a pagina pede, e o PNCP manda o
// cabecalho CORS duplicado no endpoint de arquivos ("*, *"), entao a pagina
// tambem nao consegue ler os bytes e salvar ela mesma (ver ANEXAR_OFICIAL no
// docs/index.html). Com a copia servida pelo proprio site, consegue.
//
// O robo do site (.github/workflows/site.yml) roda este script com a pasta
// originais/ guardada em cache de um dia para o outro: so baixa o edital novo
// (ou o que trocou de arquivo no PNCP) e apaga o que saiu da lista. O site.mjs
// copia a pasta para o Pages. No dia 14/10/2026 eram 128 PDFs, 214 MB.
//
// O que vem em ZIP, RAR, DOC... nao entra aqui: e o edital-pdf.mjs que
// converte, e o site ja baixa esse com o nome novo.
//
// Uso: node originais.mjs [--so N]   (--so: so os N primeiros, para testar na maquina)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PASTA = path.join(DIR, 'originais');
const INDICE = path.join(PASTA, 'indice.json');
// Acima disso o card continua com o link do PNCP: e edital escaneado, raro, e
// pesa no site de todo mundo (o maior de 14/10/2026 tinha 21 MB).
const TETO_MB = 40;
const arquivoDoEdital = caminho => String(caminho).replace(/[^0-9A-Za-z]+/g, '-');

const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));
const C = Object.fromEntries(dados.colunas.map((c, i) => [c, i]));
fs.mkdirSync(PASTA, { recursive: true });
let indice = {};
try { indice = JSON.parse(fs.readFileSync(INDICE, 'utf8')); } catch { /* primeira vez */ }

// os editais em PDF do dia, com o arquivo que a varredura escolheu (o edital,
// e nao o aviso ou o anexo: ver versao-do-edital.mjs)
const queremos = new Map();
for (const e of dados.editais) {
  if (String(e[C.arquivoExtensao] || '').toLowerCase() !== 'pdf') continue;
  queremos.set(e[C.path], +e[C.arquivoSeq] || 1);
}

// a poda: o que saiu da lista, ou trocou de arquivo, sai da pasta
for (const caminho of Object.keys(indice))
  if (queremos.get(caminho) !== indice[caminho].seq) delete indice[caminho];
const ficam = new Set(Object.keys(indice).map(c => arquivoDoEdital(c) + '.pdf'));
for (const f of fs.readdirSync(PASTA))
  if (f !== 'indice.json' && !ficam.has(f)) fs.rmSync(path.join(PASTA, f), { force: true });

const so = +(process.argv[process.argv.indexOf('--so') + 1]) || Infinity;
const fila = [...queremos].filter(([caminho]) => !indice[caminho] || !fs.existsSync(path.join(PASTA, arquivoDoEdital(caminho) + '.pdf'))).slice(0, so);
let baixados = 0, falhas = 0, grandes = 0, mb = 0;
async function baixa(caminho, seq) {
  const [cnpj, ano, num] = caminho.split('/');
  const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${num}/arquivos/${seq}`;
  for (let t = 1; t <= 3; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(180000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const bytes = Buffer.from(await r.arrayBuffer());
      if (bytes.subarray(0, 1024).indexOf('%PDF') < 0) throw new Error('nao e PDF');
      return bytes;
    } catch (e) {
      if (t === 3) throw e;
      await new Promise(ok => setTimeout(ok, 3000 * t));
    }
  }
}
await Promise.all([1, 2, 3, 4].map(async () => {
  while (fila.length) {
    const [caminho, seq] = fila.shift();
    try {
      const bytes = await baixa(caminho, seq);
      if (bytes.length > TETO_MB * 1048576) { grandes++; continue; }
      fs.writeFileSync(path.join(PASTA, arquivoDoEdital(caminho) + '.pdf'), bytes);
      indice[caminho] = { seq, bytes: bytes.length };
      baixados++; mb += bytes.length / 1048576;
    } catch (e) {
      falhas++;
      console.log(`  ${caminho}: ${e.message}`);
    }
  }
}));
fs.writeFileSync(INDICE, JSON.stringify(indice), 'utf8');
console.log(`originais/: ${Object.keys(indice).length} de ${queremos.size} editais em PDF · ${baixados} baixados agora (${mb.toFixed(1)} MB)`
  + (grandes ? ` · ${grandes} acima de ${TETO_MB} MB ficam no link do PNCP` : '') + (falhas ? ` · ${falhas} falharam` : ''));
