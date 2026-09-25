// Gera o resumo em PDF de TODOS os editais e confere cada um: abre, tem
// paginas, nao tem "?" nos literais de texto e cita o municipio.
import fs from 'node:fs';
import { montaResumo } from './resumo-pdf.mjs';

const d = JSON.parse(fs.readFileSync('docs/dados.json', 'utf8'));
const C = Object.fromEntries(d.colunas.map((c, i) => [c, i]));
const varredura = d.meta.varredura.split('-').reverse().join('/');
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let ok = 0, falhou = 0, comInterr = 0, curtos = 0;
for (const e of d.editais) {
  const q = `${e[C.municipio]}/${e[C.uf]} ${e[C.edital]}`;
  try {
    const { doc } = await montaResumo(e, { varredura });
    const bytes = doc.bytes();
    const s = Buffer.from(bytes).toString('latin1');
    const paginas = (s.match(/\/Type\s*\/Page(?![a-z])/g) || []).length;
    const lits = [...s.matchAll(/\((?:\\.|[^()\\])*\)/g)].map(m => m[0]);
    const comQ = lits.filter(l => l.includes('?') && !/https?:|www\.|\?[a-z]+=/.test(l));
    if (paginas < 1) { falhou++; console.log(`  SEM PAGINA · ${q}`); continue; }
    if (paginas < 2) { curtos++; console.log(`  so ${paginas} pagina · ${q}`); }
    if (comQ.length) {
      comInterr++;
      console.log(`  "?" no resumo · ${q} · ${comQ.length}x`);
      comQ.slice(0, 2).forEach(l => console.log(`      ${l.slice(0, 110)}`));
      continue;
    }
    const mun = norm(e[C.municipio]).replace(/[^a-z]/g, '');
    if (mun.length > 4 && !norm(s).replace(/[^a-z]/g, '').includes(mun)) {
      console.log(`  nao cita o municipio · ${q}`);
    }
    ok++;
  } catch (err) { falhou++; console.log(`  ERRO · ${q}: ${String(err.message).slice(0, 90)}`); }
}
console.log(`\n${ok} resumos gerados e conferidos · ${falhou} falharam · ${comInterr} com "?" · ${curtos} de uma pagina so`);
