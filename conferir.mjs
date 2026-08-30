// Trava de sanidade antes de publicar. Sai com código 1 quando o resultado do dia
// parece degradado — aí o Actions falha, o dados.json de ontem continua no ar e o
// GitHub manda e-mail. Dado velho e inteiro é melhor que dado novo pela metade.
//
// Uso: node conferir.mjs <anterior.json> [novo.json]

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const antesArq = process.argv[2];
const agoraArq = process.argv[3] || path.join(DIR, 'docs', 'dados.json');

// Queda aceitável de um dia para o outro. A lista se renova aos poucos: mesmo num
// dia de muitos encerramentos ela não encolhe perto disso.
const QUEDA_MAX = 0.40;
// Proporção de buscas que podem falhar. Uma rodada saudável fica perto de 1%.
const ERRO_MAX = 0.10;

function ler(p) {
  if (!p || !fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

const agora = ler(agoraArq);
if (!agora || !Array.isArray(agora.editais)) {
  console.error(`FALHA: não consegui ler ${agoraArq}`);
  process.exit(1);
}

const meta = agora.meta || {};
const n = agora.editais.length;
const problemas = [];

// 1. a varredura não pode voltar vazia
if (n === 0) {
  problemas.push('a varredura não devolveu nenhum edital');
}

// 2. cobertura das buscas
const consultas = meta.consultas || 0;
const errBusca = meta.errBusca || 0;
if (consultas && errBusca / consultas > ERRO_MAX) {
  problemas.push(
    `${errBusca} de ${consultas} buscas falharam ` +
    `(${(errBusca / consultas * 100).toFixed(1)}%, limite ${ERRO_MAX * 100}%) — ` +
    `a lista provavelmente está incompleta`
  );
}

// 3. encolhimento brusco em relação ao que já estava publicado
const antes = ler(antesArq);
const nAntes = antes && Array.isArray(antes.editais) ? antes.editais.length : 0;
if (nAntes > 0) {
  const queda = (nAntes - n) / nAntes;
  if (queda > QUEDA_MAX) {
    problemas.push(
      `a lista caiu de ${nAntes} para ${n} editais ` +
      `(-${(queda * 100).toFixed(0)}%, limite -${QUEDA_MAX * 100}%)`
    );
  } else {
    console.log(`ok: ${nAntes} → ${n} editais (${queda >= 0 ? '-' : '+'}${Math.abs(queda * 100).toFixed(1)}%)`);
  }
} else {
  console.log(`ok: ${n} editais (primeira publicação, nada para comparar)`);
}

if (consultas) console.log(`ok: ${consultas - errBusca}/${consultas} buscas concluídas`);

if (problemas.length) {
  console.error('\nFALHA — não vou publicar:');
  problemas.forEach(p => console.error('  · ' + p));
  console.error('\nO dados.json anterior continua no ar. Rode de novo pelo "Run workflow";');
  console.error('se repetir, o PNCP provavelmente está fora do ar ou mudou a API.');
  process.exit(1);
}

console.log('\nSanidade ok, pode publicar.');
