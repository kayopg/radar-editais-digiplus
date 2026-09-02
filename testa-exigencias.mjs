// Auditoria do detector de exigencias. Baixa editais reais, extrai o texto e
// mostra CADA ocorrencia com o contexto e o veredito, para conferencia humana.
//
// Nao decide nada sozinho: existe para a gente ler e julgar se o detector esta
// acertando antes de ligar o corte na varredura.
//
// Uso:
//   node testa-exigencias.mjs 10            -> audita 10 editais
//   node testa-exigencias.mjs 10 --so-exige -> so o que ele marcou como exigido
//   node testa-exigencias.mjs 10 --resumo   -> so o placar, sem os trechos
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { urlArquivo } from './resumo-pdf.mjs';
import { textoDasPaginas } from './paginas-uteis.mjs';
import { analisaExigencias, REGRAS } from './exigencias.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LE = createRequire(import.meta.url)(path.join(DIR, 'docs', 'pdf-le.js'));
const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));

const quantos = Number(process.argv[2] || 10);
const soExige = process.argv.includes('--so-exige');
const soResumo = process.argv.includes('--resumo');

const alvos = dados.editais.filter(e => String(e[14]).toLowerCase() === 'pdf').slice(0, quantos);
console.log(`auditando ${alvos.length} editais\n`);

const placar = { total: 0, semTexto: 0, erro: 0, bloqueados: 0 };
const porRegra = {};
REGRAS.forEach(r => porRegra[r.chave] = { exige: 0, dispensa: 0, indefinido: 0 });
let bytesTotal = 0, msTotal = 0;

for (const r of alvos) {
  const t0 = Date.now();
  let pgs, bytes = 0;
  try {
    const resp = await fetch(urlArquivo(r));
    const buf = new Uint8Array(await resp.arrayBuffer());
    bytes = buf.length;
    const le = await LE.abre(buf);
    pgs = await textoDasPaginas(le);
  } catch (e) {
    placar.erro++; console.log(`${r[0]}/${r[1]}: nao abriu (${e.message})\n`); continue;
  }
  const ms = Date.now() - t0;
  bytesTotal += bytes; msTotal += ms; placar.total++;

  if (!pgs.some(t => t.length > 40)) {
    placar.semTexto++;
    console.log(`${r[0]}/${r[1]}: PDF sem texto extraivel — NAO DA PARA AVALIAR\n`);
    continue;
  }

  const a = analisaExigencias(pgs);
  if (a.bloqueia.length) placar.bloqueados++;
  for (const regra of REGRAS) {
    const d = a[regra.chave];
    if (d.exige) porRegra[regra.chave].exige++;
    else if (d.total) porRegra[regra.chave].dispensa++;
    else porRegra[regra.chave].indefinido++;
  }

  if (soResumo) continue;

  const cab = `${r[0]}/${r[1]} · ${(bytes / 1024 / 1024).toFixed(1)} MB · ${(ms / 1000).toFixed(1)}s`;
  console.log('='.repeat(78));
  console.log(cab + (a.bloqueia.length ? `\n  >>> BLOQUEIA: ${a.bloqueia.join(', ')}` : '\n  (nenhuma exigencia impeditiva)'));

  for (const regra of REGRAS) {
    const d = a[regra.chave];
    if (!d.total) continue;
    if (soExige && !d.exige) continue;
    console.log(`\n  ${regra.rotulo} — ${d.total} ocorrencia(s), veredito: ${d.exige ? 'EXIGE' : 'nao exige'}`);
    for (const o of d.ocorrencias) {
      const marca = o.veredito === 'exige' ? '[X]' : o.veredito === 'dispensa' ? '[ ]' : '[?]';
      console.log(`   ${marca} "${o.termo}" (nega a ${o.negDist === Infinity ? '-' : o.negDist}, exige a ${o.exiDist === Infinity ? '-' : o.exiDist})`);
      console.log(`       ...${o.ctx.slice(Math.max(0, o.ctx.length / 2 - 150), o.ctx.length / 2 + 200)}...`);
    }
  }
  console.log();
}

console.log('='.repeat(78));
console.log(`avaliados ${placar.total} · sem texto ${placar.semTexto} · erro ${placar.erro}`);
console.log(`bloqueados por alguma exigencia: ${placar.bloqueados}`);
for (const regra of REGRAS) {
  const p = porRegra[regra.chave];
  console.log(`  ${regra.rotulo.padEnd(24)} exige ${String(p.exige).padStart(3)} · cita mas nao exige ${String(p.dispensa).padStart(3)} · nao cita ${String(p.indefinido).padStart(3)}`);
}
if (placar.total) {
  console.log(`\ncusto: ${(bytesTotal / 1024 / 1024).toFixed(0)} MB e ${(msTotal / 1000).toFixed(0)}s para ${placar.total} editais`);
  console.log(`       projetado para 250: ${(bytesTotal / placar.total * 250 / 1024 / 1024 / 1024).toFixed(1)} GB e ${(msTotal / placar.total * 250 / 60000).toFixed(0)} min`);
}
