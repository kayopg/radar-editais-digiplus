// Teste do gerador de PDF. Roda o MESMO docs/pdf.js que o navegador usa, gera o
// arquivo e confere que abre, pagina e mantém a acentuação.
//
// O montador vive no resumo-pdf.mjs, compartilhado com o resumos.mjs — antes
// havia uma cópia dele aqui, que envelhecia sozinha e passava a validar um
// layout que a página já não usava.
//
// Uso: node testa-pdf.mjs [busca] [paginas-do-edital-oficial]
//   node testa-pdf.mjs Gravataí      -> gera o resumo desse município
//   node testa-pdf.mjs Gravataí uteis   -> anexa so as paginas dos produtos
//   node testa-pdf.mjs Gravataí inteiro -> anexa o edital oficial inteiro
//   node testa-pdf.mjs               -> usa o edital com o descritivo mais longo
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { montaResumo, anexaOficial, buscaTodosItens, nomeArquivo, numeroEdital } from './resumo-pdf.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));
const varredura = dados.meta.varredura.split('-').reverse().join('/');

const busca = process.argv[2];
let alvo;
if (busca) {
  alvo = dados.editais.find(e => (e[0] + '/' + e[1]).toLowerCase().includes(busca.toLowerCase()));
  if (!alvo) { console.error('nao achei edital para "' + busca + '"'); process.exit(1); }
} else {
  let maior = 0;
  for (const e of dados.editais) for (const it of e[8]) {
    if (it[3].length > maior) { maior = it[3].length; alvo = e; }
  }
  console.log('descritivo mais longo da lista:', maior, 'caracteres');
}

const { doc, nDemais, nTodos } = await montaResumo(alvo, { varredura });
if (nTodos !== null) console.log('anexo  :', nTodos, 'itens no edital,', nDemais, 'fora os de interesse');

// O anexo do edital oficial só funciona aqui porque o Node não aplica CORS. No
// navegador está desligado — ver a nota do ANEXAR_OFICIAL no docs/index.html.
if (process.argv.length > 3) {
  const p = process.argv[3];
  const modo = p === 'inteiro' ? 'inteiro' : (Number(p) > 0 ? Number(p) : 'uteis');
  const a = await anexaOficial(doc, alvo, { modo, itens: await buscaTodosItens(alvo) || [] });
  console.log(a.ok ? `oficial: ${a.paginas} de ${a.total} paginas anexadas (${(a.numeros || []).join(', ')})`
                   : 'oficial: ' + a.motivo);
}

const bytes = doc.bytes();
const [ano, mes, dia] = alvo[4].slice(0, 10).split('-');
const nome = nomeArquivo('Edital - ' + alvo[0] + ' - ' + alvo[1] + ' - ' + dia + '-' + mes + '-' + ano) + '.pdf';
fs.writeFileSync(path.join(DIR, nome), bytes);
console.log('resumo :', nome, '|', (bytes.length / 1024).toFixed(1), 'KB |', doc.paginas(), 'pagina(s)');
