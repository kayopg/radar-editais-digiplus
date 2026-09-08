// Procura descritivo contaminado: item cujo texto contém o começo de OUTRO
// item do mesmo edital. Foi assim que a tabela de Salto/SP saiu embaralhada —
// a descrição do item 1 trazia os itens 2 a 8 dentro.
import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('docs/descritivos.json', 'utf8'));
const dd = JSON.parse(fs.readFileSync('docs/dados.json', 'utf8'));
const C = dd.colunas.reduce((o, n, i) => (o[n] = i, o), {});
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

let comDesc = 0, sujos = 0;
const casos = [];
for (const e of dd.editais) {
  const v = d.editais[e[C.path]];
  if (!v || !v.itens) continue;
  // assinatura curta de cada item: as 4 primeiras palavras significativas
  const assin = v.itens.map(x => norm(x[1]).split(' ').filter(w => w.length > 3).slice(0, 4).join(' '));
  v.itens.forEach((x, i) => {
    if (!x[6]) return;
    comDesc++;
    const txt = norm(x[6]);
    for (let j = 0; j < assin.length; j++) {
      if (j === i || !assin[j] || assin[j].length < 14 || assin[j] === assin[i]) continue;
      const k = txt.indexOf(assin[j]);
      if (k > 30) {   // > 30 para não acusar o próprio começo
        sujos++;
        if (casos.length < 12) casos.push(e[C.municipio] + '/' + e[C.uf] + ' · item ' + x[0]
          + ' contém o item ' + v.itens[j][0] + ' na posição ' + k
          + '\n      ' + x[6].slice(Math.max(0, k - 40), k + 90).replace(/\s+/g, ' '));
        break;
      }
    }
  });
}
console.log(comDesc + ' itens com descritivo · ' + sujos + ' contaminados');
for (const c of casos) console.log('  ' + c);
