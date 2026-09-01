// Compara duas versões de docs/dados.json e imprime só o que mudou.
// Uso: node delta.mjs <anterior.json> [novo.json]
//
// No GitHub Actions o "anterior" sai do próprio git, antes de sobrescrever:
//   git show HEAD:docs/dados.json > /tmp/anterior.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath e nao o pathname cru: o import.meta.url vem percent-encoded,
// entao uma pasta de usuario com acento no nome virava Usu%C3%A1rio e o
// require nao achava nada. So aparece fora do Actions, onde o caminho e ASCII.
const DIR = path.dirname(fileURLToPath(import.meta.url));
const antesArq = process.argv[2];
const agoraArq = process.argv[3] || path.join(DIR, 'docs', 'dados.json');

const IDX = { mun: 0, uf: 1, org: 2, ed: 3, fecha: 4, qtd: 5, val: 6, path: 7, it: 8 };

function ler(p) {
  if (!p || !fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')).editais || []; } catch { return null; }
}

const agora = ler(agoraArq);
if (!agora) { console.error(`não consegui ler ${agoraArq}`); process.exit(1); }
const antes = ler(antesArq);

const brl = n => n ? n.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : 'sigiloso';
const quando = f => {
  const [d, h] = String(f).split('T');
  const [a, m, dd] = d.split('-');
  const hora = (h || '').slice(0, 5);
  const anoAtual = String(new Date().getFullYear());
  return a === anoAtual ? `${dd}/${m} ${hora}` : `${dd}/${m}/${a} ${hora}`;
};
const linha = e =>
  `| ${e[IDX.mun]} | ${e[IDX.uf]} | ${quando(e[IDX.fecha])} | ${brl(e[IDX.val])} | ${e[IDX.it].length} |`;
const cabecalho = '| Município | UF | Prazo | Valor est. | Itens |\n|---|---|---|---|---|';

console.log(`## Radar de Editais — ${agora.length} editais abertos\n`);

if (!antes) {
  console.log('_Primeira publicação: não há versão anterior para comparar._\n');
} else {
  const eram = new Set(antes.map(e => e[IDX.path]));
  const sao = new Set(agora.map(e => e[IDX.path]));
  const novos = agora.filter(e => !eram.has(e[IDX.path]));
  const saidos = antes.filter(e => !sao.has(e[IDX.path]));

  if (novos.length) {
    console.log(`### Novos (${novos.length})\n`);
    console.log(cabecalho);
    novos.forEach(e => console.log(linha(e)));
    console.log('');
  } else {
    console.log('### Nenhum edital novo desde a última varredura.\n');
  }
  console.log(`Saíram da lista (encerrados ou filtrados): ${saidos.length}\n`);
}

const limite = new Date(Date.now() + 48 * 3600 * 1000);
const em48 = agora.filter(e => new Date(e[IDX.fecha]) <= limite);
console.log(`### Fecham nas próximas 48 h (${em48.length}) — maiores valores\n`);
console.log(cabecalho);
em48.slice().sort((a, b) => b[IDX.val] - a[IDX.val]).slice(0, 15).forEach(e => console.log(linha(e)));
