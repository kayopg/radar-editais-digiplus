// Confere, nos itens do radar, os defeitos de recorte vistos em 13/10/2026:
//  A. descritivo que termina no meio da frase (virgula, dois-pontos, palavra
//     de ligacao, ou palavra solta sem fecho) — o corte na virada de folha
//  B. preco da linha grudado no fim ("...FABRICACAO 4.104,50 32.836,00")
//  C. o item seguinte dentro do descritivo (o nome dele depois do numero)
// Uso: node audita-cortes.mjs [A|B|C] [trecho do municipio]
import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('docs/dados.json', 'utf8'));
const C = Object.fromEntries(d.colunas.map((c, i) => [c, i]));
const B = JSON.parse(fs.readFileSync('docs/descritivos.json', 'utf8')).editais;
const M = JSON.parse(fs.readFileSync('descritivos-manuais.json', 'utf8'));
const [so = '', filtro = ''] = process.argv.slice(2);
const ACENTO = { á: 'a', à: 'a', â: 'a', ã: 'a', é: 'e', ê: 'e', í: 'i', ó: 'o', ô: 'o', õ: 'o', ú: 'u', ü: 'u', ç: 'c' };
const n1 = s => String(s).toLowerCase().replace(/[^\x00-\x7f]/g, c => ACENTO[c] || c);
const LIGACAO = /(?:[,:(\-–]|\s(?:de|da|do|das|dos|com|e|ou|para|em|a|o|as|os|que|por|no|na|nos|nas|ao|aos|sem|sob|entre|ate|um|uma|pelo|pela|seu|sua|composto|composta|garantia|minimo|minima|maximo|maxima|tipo|cor|marca))$/;
const conta = { A: 0, B: 0, C: 0 };
for (const e of d.editais) {
  if (filtro && !e[C.municipio].includes(filtro)) continue;
  const v = B[e[C.path]];
  if (!v || !v.itens) continue;
  const ord = [...v.itens].sort((a, b) => a[0] - b[0]);
  for (const it of e[C.itens]) {
    if (it[0] === 'LT' || it[0] === 'ED') continue;
    const x = v.itens.find(x => x[0] === it[5]);
    if (!x || !x[6] || x[9] || (M[e[C.path]] && M[e[C.path]].itens[it[5]])) continue;
    const t = String(x[6]).trim();
    const tn = n1(t);
    const defeitos = [];
    if ((!so || so === 'A') && LIGACAO.test(tn)) defeitos.push(['A', 'termina: ...' + t.slice(-110)]);
    if ((!so || so === 'B') && /\d{1,3}(?:\.\d{3})*,\d{2,4}\s*$/.test(t)) defeitos.push(['B', 'termina: ...' + t.slice(-110)]);
    if (!so || so === 'C') {
      const prox = ord[ord.indexOf(x) + 1];
      if (prox) {
        const nome = n1(String(prox[1])).replace(/\s+/g, ' ').slice(0, 30);
        const k = nome.length >= 20 ? tn.indexOf(nome, 40) : -1;
        // o nome do seguinte dentro, quando nao e o mesmo produto do item
        if (k > 0 && !tn.startsWith(nome.slice(0, 20)) && !n1(String(x[1])).includes(nome.slice(0, 20))) defeitos.push(['C', `"${prox[1].slice(0, 40)}" dentro: ...` + t.slice(Math.max(0, k - 60), k + 80)]);
      }
    }
    for (const [tipo, txt] of defeitos) {
      conta[tipo]++;
      console.log(`${tipo} · ${e[C.municipio]}/${e[C.uf]} ${e[C.edital]} · item ${it[5]} · ${String(it[3]).slice(0, 45)}\n    ${txt}`);
    }
  }
}
console.log(`\nA (termina no meio) ${conta.A} · B (preco no fim) ${conta.B} · C (item seguinte dentro) ${conta.C}`);
