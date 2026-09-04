// Monta a pagina do Radar em UM arquivo so, para publicar como artefato.
//
// O site em docs/ e servido pelo GitHub Pages: o index.html pede pdf.js,
// pdf-le.js e dados.json por HTTP. Num artefato nao ha esses vizinhos — a
// pagina e um arquivo isolado — entao aqui os tres entram embutidos.
//
// O que muda em relacao ao site: os dados ficam congelados na varredura que
// gerou o arquivo (o site recarrega o dados.json todo dia sozinho). O resto,
// inclusive o download do resumo em PDF, funciona igual.
//
// Uso: node artefato.mjs [saida.html]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const doc = (...p) => fs.readFileSync(path.join(DIR, 'docs', ...p), 'utf8');

let html = doc('index.html');
const dados = JSON.parse(doc('dados.json'));

// Um script embutido nao pode conter a sequencia que fecha a tag; nem o codigo
// do pdf.js nem o JSON tem motivo para conter, mas quebrar aqui daria uma
// pagina em branco sem aviso, entao a troca e feita mesmo assim.
const seguro = s => s.replace(/<\/script/gi, '\\u003c/script');

for (const arq of ['pdf.js', 'pdf-le.js']) {
  const tag = '<script src="' + arq + '"></script>';
  if (!html.includes(tag)) throw new Error('nao achei a tag de ' + arq + ' no index.html');
  html = html.replace(tag, '<script>\n/* ' + arq + ' embutido */\n' + seguro(doc(arq)) + '\n</script>');
}

// O carregamento continua passando pelo mesmo .then do site: trocamos so a
// origem dos bytes. Assim o tratamento de erro e o preenchimento dos filtros
// seguem sendo o codigo que roda em producao, e nao uma copia que envelhece.
const chamada = 'fetch("dados.json?v=" + Date.now(), {cache:"no-store"})';
if (!html.includes(chamada)) throw new Error('nao achei a chamada do dados.json no index.html');
html = html.replace(chamada,
  'var RADAR_DADOS = ' + JSON.stringify(dados).replace(/</g, '\\u003c') + ';\n'
  + 'Promise.resolve({ ok:true, json:function(){ return RADAR_DADOS; } })');

const saida = process.argv[2] || path.join(DIR, 'radar-artefato.html');
fs.writeFileSync(saida, html, 'utf8');
console.log('artefato: ' + saida + ' · ' + (html.length / 1024).toFixed(0) + ' KB · '
  + dados.editais.length + ' editais da varredura de '
  + dados.meta.varredura.split('-').reverse().join('/'));
