// Mede quanto o descritivo do Termo de Referencia acrescenta ao rotulo curto
// que a API do PNCP entrega. Roda sobre uma amostra de editais e mostra, item a
// item, o antes e o depois.
//
// Uso: node testa-descritivo-tr.mjs [quantos-editais]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { urlArquivo, buscaTodosItens } from './resumo-pdf.mjs';
import { textoDasPaginas, escolhePaginas, extraiDescritivo } from './paginas-uteis.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LE = createRequire(import.meta.url)(path.join(DIR, 'docs', 'pdf-le.js'));
const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));

const quantos = Number(process.argv[2] || 8);
// os que mais precisam: tem PDF e pelo menos um descritivo curto
const alvos = dados.editais.filter(e => String(e[14]).toLowerCase() === 'pdf'
  && e[8].some(i => i[3].length < 60)).slice(0, quantos);

let itens = 0, achados = 0, ganhoTotal = 0, semTexto = 0;

for (const r of alvos) {
  let le, pgs;
  try {
    le = await LE.abre(new Uint8Array(await (await fetch(urlArquivo(r))).arrayBuffer()));
    pgs = await textoDasPaginas(le);
  } catch (e) { console.log(`${r[0]}/${r[1]}: nao abriu (${e.message})`); continue; }
  if (!pgs.some(t => t.length > 40)) { semTexto++; console.log(`${r[0]}/${r[1]}: PDF sem texto`); continue; }

  const sel = escolhePaginas(r, await buscaTodosItens(r), pgs);
  const quais = sel.tabela.length ? sel.tabela : pgs.map((_, i) => i);
  console.log(`\n=== ${r[0]}/${r[1]} · ${le.total} pag · tabela em ${sel.tabela.length || 'todas'} ===`);
  for (const it of r[8]) {
    itens++;
    const spec = extraiDescritivo(pgs, quais, it[3]);
    if (spec) {
      achados++; ganhoTotal += spec.length - it[3].length;
      console.log(`  [+${spec.length - it[3].length}] "${it[3].slice(0, 34)}"`);
      console.log(`         -> ${spec.slice(0, 150)}`);
    } else {
      console.log(`  [ -- ] "${it[3].slice(0, 60)}"`);
    }
  }
}

console.log(`\n${achados} de ${itens} itens ganharam descritivo`
  + (achados ? ` · +${Math.round(ganhoTotal / achados)} caracteres em media` : '')
  + (semTexto ? ` · ${semTexto} edital(is) sem texto extraivel` : ''));
