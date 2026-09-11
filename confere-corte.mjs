// Descritivo que termina no meio por causa da quebra de pagina.
//
// O usuario relata, desde o comeco, itens "cortados por conta da quebra de
// pagina do edital original". Esta auditoria procura exatamente isso: celula
// que termina sem fechar a frase E cujo texto CONTINUA no edital logo depois.
//
// Nao basta olhar a pontuacao final: muita celula termina em "220V" ou "60 cm"
// sem ponto nenhum e esta completa. O que denuncia o corte e a continuacao —
// se o que vem depois comeca em minuscula, ou emenda a palavra que ficou pela
// metade, entao aquilo fazia parte da mesma frase.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const dd = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));
const de = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'descritivos.json'), 'utf8'));
const C = dd.colunas.reduce((o, n, i) => (o[n] = i, o), {});

// Fecha a frase: ponto, ponto e virgula, dois pontos, fecha parenteses.
const FECHADA = /[.;:)\]]\s*$/;

// O que vem depois e continuacao da MESMA frase, e nao um item novo.
//
// Comeca em minuscula, em "e"/"ou"/"com", ou emenda direto a palavra cortada.
// Linha nova de tabela sempre abre com numero, unidade ou nome em caixa alta,
// entao nada disso e confundido com o item seguinte.
const CONTINUA = /^[a-zà-ÿ(]/;

// Marca de rodape e de cabecalho de pagina. Quando ela aparece bem no ponto do
// corte, a causa e a virada de folha e nao o fim do item.
const VIRADA = /p[áa]gina\s+\d|www\.|cep[:\s]*\d{5}|assinad|prefeitura|munic[íi]pio|estado de|cnpj|termo de refer|anexo\s+[ivx]/i;

const achado = (cel, fonte) => {
  const cabeca = cel.slice(0, Math.min(50, cel.length));
  const k = fonte.indexOf(cabeca);
  if (k < 0) return null;
  const rabo = cel.slice(-Math.min(40, cel.length));
  const r = fonte.indexOf(rabo, k);
  if (r < 0) return null;
  return { fim: r + rabo.length };
};

let total = 0, cortados = 0;
const linhas = [];
for (const ed of dd.editais) {
  const v = de.editais[ed[C.path]] || {};
  const fonte = (v.secoes || []).map(s => s.texto).join('  ').replace(/\s+/g, ' ');
  if (!fonte) continue;
  for (const it of ed[C.itens]) {
    const x = (v.itens || []).find(y => y[0] === it[5]) || [];
    if (!x[6]) continue;
    total++;
    const cel = String(x[6]).replace(/\s+/g, ' ').trim();
    if (FECHADA.test(cel)) continue;
    const a = achado(cel, fonte);
    if (!a) continue;
    const depois = fonte.slice(a.fim, a.fim + 160).replace(/^\s+/, '');
    if (!CONTINUA.test(depois)) continue;
    cortados++;
    linhas.push('  ' + (ed[C.municipio] + '/' + ed[C.uf]).padEnd(28) + 'item ' + String(it[5]).padStart(3) +
      (VIRADA.test(depois.slice(0, 90)) ? '  [virada de folha]' : '') +
      '\n      ate aqui: ...' + JSON.stringify(cel.slice(-70)) +
      '\n      continua: ' + JSON.stringify(depois.slice(0, 90)));
  }
}

console.log(cortados + ' de ' + total + ' descritivos do radar terminam no meio de uma frase\n');
for (const l of linhas) console.log(l);
