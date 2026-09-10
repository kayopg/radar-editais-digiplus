// Conferencia ampla dos descritivos por item: procura os defeitos ja vistos e
// mais alguns que so aparecem lendo. Roda sobre todos os editais.
//
// Existe porque "0 contaminados" nao quer dizer "esta certo": um descritivo
// pode comecar no meio de uma frase, terminar no teto, vir embaralhado ou
// repetir o proprio texto, e nada disso e mistura entre itens.
import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('docs/descritivos.json', 'utf8'));
const dd = JSON.parse(fs.readFileSync('docs/dados.json', 'utf8'));
const C = dd.colunas.reduce((o, n, i) => (o[n] = i, o), {});
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
const mun = Object.fromEntries(dd.editais.map(e => [e[C.path], e[C.municipio] + '/' + e[C.uf]]));

const P = {
  'comeca no meio': x => /^[a-zà-ÿ,;.)]/.test(x[6].trim()),
  'no teto': x => x[6].length >= 5995,
  'embaralhado': x => ((x[6].match(/[a-z][ÁÉÍÓÚÂÊÎÔÛÀÈÌÒÙÃÕÇÆØ]/g) || []).length > 4),
  'letras soltas': x => /(?:\s\S){8,}(?=\s|$)/.test(x[6]),
  'rodape': x => /www\.|PABX|CEP[:\s]*\d{5}/i.test(x[6]),
  'fim de linha da tabela': x => /R\$\s*[\d.,]+\s+R\$\s*[\d.,]+\s+\d{1,4}(?=\s|$)/.test(x[6])
    || /\s\d{1,4}\s+\d{1,3}(?:\.\d{1,3}){2,}(?=\s|$)/.test(x[6])
    || /\s\d{1,4}\s+\d{1,4}\s+(?:UND|UNID|UN|PCS|PC|CX|PAR|KG|LT)(?=\s|$)/.test(x[6]),
  'repete o proprio texto': x => {
    const t = norm(x[6]); if (t.length < 200) return false;
    const meio = t.slice(0, 60);
    return t.indexOf(meio, 60) > 0;
  }
};

const achados = {};
const exemplos = {};
let total = 0;
for (const [path, v] of Object.entries(d.editais)) {
  for (const x of (v.itens || [])) {
    if (!x[6]) continue;
    total++;
    for (const [nome, teste] of Object.entries(P)) {
      if (!teste(x)) continue;
      achados[nome] = (achados[nome] || 0) + 1;
      if (!exemplos[nome]) exemplos[nome] = mun[path] + ' item ' + x[0] + ' :: ' + x[6].slice(0, 130);
    }
  }
}
console.log(total + ' descritivos conferidos');
const nomes = Object.keys(P);
for (const n of nomes) {
  console.log('  ' + String(achados[n] || 0).padStart(4) + '  ' + n);
  if (exemplos[n]) console.log('        ' + exemplos[n]);
}
