// Prova que o PDF nao altera o descritivo de nenhum produto.
//
// O descritivo e o que a Digiplus usa para cotar: se o gerador cortar, truncar
// ou trocar um caractere, a cotacao sai errada. Este teste roda os 3 pontos por
// onde o texto passa e falha se qualquer um deles mexer no conteudo.
//
// Uso: node testa-descritivo.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// fileURLToPath e nao o pathname cru: o import.meta.url vem percent-encoded,
// entao uma pasta de usuario com acento no nome virava Usu%C3%A1rio e o
// require nao achava nada. So aparece fora do Actions, onde o caminho e ASCII.
const DIR = path.dirname(fileURLToPath(import.meta.url));
const PDF = createRequire(import.meta.url)(path.join(DIR, 'docs', 'pdf.js'));
const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));

const itens = [];
for (const e of dados.editais)
  for (const it of e[8]) itens.push({ mun: e[0] + '/' + e[1], d: it[3] });

console.log('descritivos a conferir:', itens.length);
console.log('maior:', Math.max(...itens.map(i => i.d.length)), 'caracteres');
console.log();

let falhas = 0;

// -------------------------------------------------------------- 1. quebra
// Concatenar as linhas quebradas, ignorando espacos, tem que devolver
// exatamente o texto original sem espacos. Pega caractere perdido na quebra,
// inclusive no caminho que parte palavra maior que a coluna.
const semEspaco = s => s.replace(/\s+/g, '');
let piorLinhas = 0;
for (const { mun, d } of itens) {
  for (const larg of [120, 240, 515]) {          // coluna estreita, media e pagina inteira
    const linhas = PDF.quebra(d, 9.5, false, larg);
    if (linhas.length > piorLinhas) piorLinhas = linhas.length;
    const volta = semEspaco(linhas.join(''));
    if (volta !== semEspaco(d)) {
      falhas++;
      console.log('QUEBRA ALTEROU (' + mun + ', largura ' + larg + '):');
      console.log('  original:', JSON.stringify(d.slice(0, 90)));
      console.log('  voltou  :', JSON.stringify(linhas.join(' ').slice(0, 90)));
      break;
    }
  }
}
console.log('1. quebra de linha  :', falhas === 0 ? 'OK, nenhum caractere perdido' : falhas + ' FALHAS');
console.log('   (maior item ocupou', piorLinhas, 'linhas na coluna estreita)');

// ------------------------------------------------------- 2. codificacao
// bytesDe troca por "?" o que nao existe em WinAnsi. Se algum descritivo tiver
// caractere fora dessa tabela, ele SAI TROCADO no PDF — e isso e alteracao.
const CP_OK = new Set([0x20AC,0x201A,0x0192,0x201E,0x2026,0x2020,0x2021,0x02C6,0x2030,
  0x0160,0x2039,0x0152,0x017D,0x2018,0x2019,0x201C,0x201D,0x2022,0x2013,0x2014,
  0x02DC,0x2122,0x0161,0x203A,0x0153,0x017E,0x0178]);
const fora = new Map();
for (const { mun, d } of itens) {
  for (const ch of d) {
    const c = ch.codePointAt(0);
    if (c < 32 || c < 256 || CP_OK.has(c)) continue;
    if (!fora.has(ch)) fora.set(ch, { n: 0, onde: mun });
    fora.get(ch).n++;
  }
}
if (fora.size === 0) {
  console.log('2. codificacao      : OK, todo caractere cabe em WinAnsi');
} else {
  falhas += fora.size;
  console.log('2. codificacao      :', fora.size, 'caractere(s) sairiam como "?"');
  for (const [ch, info] of fora)
    console.log('   U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'),
                JSON.stringify(ch), '-', info.n + 'x, ex.:', info.onde);
}

// ------------------------------------------ 3. ida e volta pelo PDF real
// Gera o PDF do pior caso e confere que o texto extraido de volta contem o
// descritivo inteiro. Fecha o ciclo: nao basta a quebra estar certa, o
// literal PDF (escape de parenteses e barra) tambem tem que preservar tudo.
const pior = itens.reduce((a, b) => (b.d.length > a.d.length ? b : a));
const doc = PDF.novo({});
doc.texto(pior.d, { tam: 9.5, alturaLinha: 13 });
const bytes = doc.bytes();
fs.writeFileSync(path.join(DIR, 'teste-descritivo.pdf'), bytes);

// extrai os literais do fluxo e remonta o texto
const bruto = Buffer.from(bytes).toString('latin1');
const literais = [...bruto.matchAll(/\(((?:\\.|[^()\\])*)\) Tj/g)]
  .map(m => m[1].replace(/\\([()\\])/g, '$1'));
const remontado = semEspaco(literais.join(''));
const esperado = semEspaco(pior.d);
// startsWith e nao igualdade: o bytes() acrescenta o rodape "pagina X de N"
// depois do texto, e ele nao faz parte do descritivo.
const okIda = remontado.startsWith(esperado);
console.log('3. PDF ida e volta  :', okIda ? 'OK, ' + pior.d.length + ' caracteres preservados'
                                           : 'FALHOU');
if (!okIda) {
  falhas++;
  console.log('   esperado:', esperado.length, 'chars | veio:', remontado.length);
  for (let i = 0; i < Math.max(esperado.length, remontado.length); i++)
    if (esperado[i] !== remontado[i]) {
      console.log('   diverge na posicao', i, JSON.stringify(esperado.slice(i - 30, i + 30)),
                  'vs', JSON.stringify(remontado.slice(i - 30, i + 30)));
      break;
    }
}
console.log('   (pior caso:', pior.mun + ',', pior.d.length, 'caracteres,', doc.paginas(), 'pagina)');

console.log();
console.log(falhas === 0
  ? 'TUDO OK - o descritivo sai integro no PDF'
  : 'ATENCAO: ' + falhas + ' problema(s)');
process.exit(falhas === 0 ? 0 : 1);
