// Guarda a PAGINA DE ABERTURA de cada edital — a folha original, com logo,
// moldura e diagramacao — para o resumo baixado abrir com ela.
//
// O usuario mandou essa pagina do pregao 411/2026 da UFPel em 08/09/2026: e
// onde se ve de uma olhada contratante, objeto, valor estimado, data da sessao,
// criterio de julgamento e modo de disputa. Pediu a pagina ORIGINAL, nao os
// campos remontados em texto — uma tentativa anterior remontou e foi recusada.
//
// A pagina viaja embutida porque o navegador nao consegue busca-la: o endpoint
// de arquivos do PNCP manda o CORS errado e, dentro do artefato, o sandbox
// bloqueia qualquer busca externa.
//
// Como a folha vira dado: o pdf.js monta um PDF de carona com a pagina original
// na frente (anexaExternas com "antes") e a pagina em branco que o novo() cria
// atras. No navegador so a primeira e extraida; a de tras e o custo de nao ter
// um escritor de PDF avulso, e nunca aparece.
//
// Uso:
//   node pagina-abertura.mjs                -> todos os editais
//   node pagina-abertura.mjs --limite 5     -> so os cinco primeiros, para medir
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { textoDasPaginas } from './paginas-uteis.mjs';
import { arquivosPublicados, fontesDe, PDF } from './resumo-pdf.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LE = createRequire(import.meta.url)(path.join(DIR, 'docs', 'pdf-le.js'));

const arg = (n, p) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p; };
const LIMITE = Number(arg('--limite', 0));

const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));
const C = dados.colunas.reduce((o, n, i) => (o[n] = i, o), {});
let alvos = dados.editais;
if (LIMITE) alvos = alvos.slice(0, LIMITE);

// Os campos que identificam a folha de abertura. Contam so em CAIXA ALTA: no
// quadro eles sao titulos, e em caixa mista o que se acha sao mencoes soltas
// no corpo do edital.
const CAMPOS = [
  /CONTRATANTE/, /\bUASG\b/, /\bOBJETO\b/, /VALOR\s+(?:TOTAL\s+)?ESTIMADO/,
  /SESS[ÃA]O\s+P[ÚU]BLICA/, /CRIT[ÉE]RIO\s+DE\s+JULGAMENTO/, /MODO\s+DE\s+DISPUTA/,
  /TRATAMENTO\s+FAVORECIDO/, /MARGEM\s+DE\s+PREFER[ÊE]NCIA/, /PREG[ÃA]O\s+ELETR[ÔO]NICO/,
  /PROCESSO\s+N/
];
const MIN_CAMPOS = 3;
// A folha de abertura esta no comeco. Procurar no documento inteiro acharia a
// pagina de assinaturas, que tambem repete varios desses rotulos.
const PRIMEIRAS = 6;

function achaAbertura(paginas) {
  let melhor = -1, melhorN = 0;
  for (let i = 0; i < Math.min(paginas.length, PRIMEIRAS); i++) {
    const t = paginas[i] || '';
    const n = CAMPOS.filter(re => re.test(t)).length;
    if (n > melhorN) { melhorN = n; melhor = i; }
  }
  return melhorN >= MIN_CAMPOS ? { pagina: melhor, campos: melhorN } : null;
}

async function pool(itens, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < itens.length) { const k = i++; await fn(itens[k], k); }
  }));
}

const saida = {};
let com = 0, sem = 0, erros = 0, bytesTotal = 0;

await pool(alvos, 2, async (e) => {
  const nome = e[C.municipio] + '/' + e[C.uf];
  try {
    const cands = await arquivosPublicados(e);
    let paginas = null, le = null;
    for (const c of cands.slice(0, 3)) {
      const f = await fontesDe(c, []);
      if (!f.pdfs.length) continue;
      le = await LE.abre(f.pdfs[0].bytes);
      paginas = await textoDasPaginas(le);
      break;
    }
    if (!paginas) { sem++; console.log(`  ${nome} · sem PDF legivel`); return; }

    const achado = achaAbertura(paginas);
    if (!achado) { sem++; console.log(`  ${nome} · sem folha de abertura`); return; }

    // PDF de carona: a pagina original na frente, a branca do novo() atras.
    const carona = PDF.novo({ rodape: '' });
    carona.anexaExternas(await LE.extraiPaginas(le, [achado.pagina]), true);
    const bytes = carona.bytes();
    saida[e[C.path]] = { pagina: achado.pagina + 1, campos: achado.campos,
                         b64: Buffer.from(bytes).toString('base64') };
    bytesTotal += bytes.length;
    com++;
    console.log(`  ${nome} · pagina ${achado.pagina + 1} · ${achado.campos} campos · ${(bytes.length / 1024).toFixed(0)} KB`);
  } catch (err) {
    erros++;
    console.log(`  [erro] ${nome}: ${err.message}`);
  }
});

const arquivo = path.join(DIR, 'docs', 'aberturas.json');
fs.writeFileSync(arquivo, JSON.stringify({ varredura: dados.meta.varredura, editais: saida }), 'utf8');
console.log(`\n${com} com folha de abertura · ${sem} sem · ${erros} erro(s)`);
console.log(`paginas originais: ${(bytesTotal / 1024 / 1024).toFixed(2)} MB antes do base64`);
console.log(`docs/aberturas.json: ${(fs.statSync(arquivo).size / 1024 / 1024).toFixed(2)} MB`);
