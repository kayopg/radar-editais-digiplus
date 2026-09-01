// Confere o seletor de paginas contra editais reais: mostra o que ele escolheu
// e, quando informado, compara com a selecao feita a mao.
//
// Uso: node testa-selecao.mjs <busca> [paginas-esperadas-do-oficial]
//   node testa-selecao.mjs Leopoldo 2,25,26,27,28,29,30,31
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { urlArquivo, buscaTodosItens } from './resumo-pdf.mjs';
import { textoDasPaginas, escolhePaginas } from './paginas-uteis.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LE = createRequire(import.meta.url)(path.join(DIR, 'docs', 'pdf-le.js'));
const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));

const busca = process.argv[2];
const r = dados.editais.find(e => (e[0] + '/' + e[1]).toLowerCase().includes(busca.toLowerCase()));
if (!r) { console.error('nao achei'); process.exit(1); }

console.log(r[0] + '/' + r[1], '·', r[3]);
const itens = await buscaTodosItens(r);
const le = await LE.abre(new Uint8Array(await (await fetch(urlArquivo(r))).arrayBuffer()));
const paginas = await textoDasPaginas(le);
const vazias = paginas.filter(p => !p).length;
console.log(`${le.total} paginas no oficial · ${itens ? itens.length : 0} itens · ${vazias} pagina(s) sem texto extraido`);

const sel = escolhePaginas(r, itens, paginas);
const um = a => a.map(i => i + 1);          // 0-based -> numero da pagina
console.log('\nobjeto  : pagina', sel.objeto === null ? '(nao achou)' : sel.objeto + 1);
console.log('tabela  : paginas', um(sel.tabela).join(', ') || '(nenhuma)');
console.log('escolhidas:', um(sel.escolhidas).join(', '), `(${sel.escolhidas.length} de ${le.total})`);
console.log('cobertura do pico:', sel.cobertura);

const esperado = process.argv[3];
if (esperado) {
  const alvo = esperado.split(',').map(x => Number(x.trim())).filter(Boolean).sort((a, b) => a - b);
  const obtido = um(sel.escolhidas);
  const faltou = alvo.filter(p => !obtido.includes(p));
  const sobrou = obtido.filter(p => !alvo.includes(p));
  console.log('\nesperado :', alvo.join(', '));
  console.log('obtido   :', obtido.join(', '));
  console.log('faltou   :', faltou.join(', ') || '—');
  console.log('sobrou   :', sobrou.join(', ') || '—');
  console.log(faltou.length === 0 && sobrou.length === 0 ? '\nIGUAL a selecao manual'
    : `\ndiferenca: ${faltou.length} faltando, ${sobrou.length} a mais`);
}
