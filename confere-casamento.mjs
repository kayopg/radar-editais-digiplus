// O descritivo colado no item e do PRODUTO CERTO?
//
// A auditoria de contaminacao acha item dentro de item, mas nao acha o
// casamento simplesmente errado: se o recorte pegou a celula de outro produto,
// o texto e limpo e coerente — so nao e daquele item. A prova aqui e a
// sobreposicao entre o rotulo do PNCP e o comeco do descritivo.
import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('docs/descritivos.json', 'utf8'));
const dd = JSON.parse(fs.readFileSync('docs/dados.json', 'utf8'));
const C = dd.colunas.reduce((o, n, i) => (o[n] = i, o), {});
// Ignora o hifen antes de comparar: o PDF quebra palavra no fim da linha
// ("ELETROCARDIO-GRAMA", "NEBULIZA-DOR") e isso nao e divergencia de produto.
// Sem isso o auditor acusava tres casamentos certos.
const norm = s => String(s ?? '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/-\s*/g, '');
const VAZIAS = new Set(['para','com','sem','dos','das','que','por','uma','nao','tipo','material',
  'modelo','unidade','medida','aplicacao','caracteristicas','adicionais','minimo','maximo','cor',
  'voltagem','tensao','potencia','capacidade','altura','largura','comprimento','dimensoes','conforme']);
const pal = s => [...new Set(norm(s).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !VAZIAS.has(w) && !/^\d+$/.test(w)))];

let n = 0, bons = 0;
const suspeitos = [];
for (const ed of dd.editais) {
  const v = d.editais[ed[C.path]];
  if (!v || !v.itens) continue;
  for (const x of v.itens) {
    if (!x[6]) continue;
    n++;
    const alvo = pal(x[1]);
    if (!alvo.length) { bons++; continue; }
    // o comeco do descritivo tem de falar do mesmo produto
    const cabeca = norm(x[6].slice(0, 160));
    const achadas = alvo.filter(w => cabeca.includes(w)).length;
    if (achadas >= Math.min(2, alvo.length)) bons++;
    else if (suspeitos.length < 10) suspeitos.push(
      'item ' + x[0] + ' · casou ' + achadas + '/' + alvo.length
      + '\n      rotulo: ' + String(x[1]).replace(/\s+/g, ' ').slice(0, 85)
      + '\n      colado: ' + String(x[6]).replace(/\s+/g, ' ').slice(0, 85));
  }
}
console.log(bons + ' de ' + n + ' descritivos batem com o rotulo do item (' + Math.round(100 * bons / n) + '%)');
console.log((n - bons) + ' suspeitos de casamento errado:');
for (const s of suspeitos) console.log('  ' + s);
