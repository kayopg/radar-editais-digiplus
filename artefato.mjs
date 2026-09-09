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

// O texto do Termo de Referencia entra embutido pelo mesmo caminho. Sem ele o
// resumo baixado do artefato sai com uma pagina so: o sandbox nao deixa a
// pagina buscar nem o descritivos.json nem o arquivo no PNCP.
const chamadaDesc = 'fetch("descritivos.json?v=" + Date.now(), {cache:"no-store"})';
if (!html.includes(chamadaDesc)) throw new Error('nao achei a chamada do descritivos.json no index.html');
let descritivos = { editais: {} };
try { descritivos = JSON.parse(doc('descritivos.json')); }
catch { console.error('aviso: docs/descritivos.json nao encontrado — o resumo sai sem o Termo de Referencia'); }

// Enxuga o que vai embutido, sem perder nenhum item.
//
// O peso nao esta na lista de itens: esta no descritivo completo de cada um,
// que so os itens cotados usam. Os demais entram como topico resumido no
// resumo (pedido do usuario em 08/09/2026), e para isso basta o nome — entao
// deles vao so o numero e o comeco da descricao. Guardar tudo levava a pagina
// a 4,8 MB; assim fica em pouco mais de 3.
{
  const C = dados.colunas.reduce((o, n, i) => (o[n] = i, o), {});
  const uma = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const enxuto = {};
  for (const e of dados.editais) {
    const v = descritivos.editais[e[C.path]];
    if (!v) continue;
    const querNum = new Set(e[C.itens].map(it => it[5]).filter(Boolean));
    const querDesc = new Set(e[C.itens].map(it => uma(it[3])));
    // O texto das secoes fica de fora: 1,73 MB que a pagina carregava para
    // imprimir as folhas finais do resumo, retiradas em 09/09/2026. Ele
    // continua no docs/descritivos.json, porque e dele que o
    // descritivo-por-item.mjs recorta a especificacao de cada item — mas isso
    // acontece aqui, antes de publicar, e o navegador nao precisa dele.
    const { secoes, ...semSecoes } = v;
    enxuto[e[C.path]] = {
      ...semSecoes,
      total: (v.itens || []).length,
      itens: (v.itens || []).map(x => (querNum.has(x[0]) || querDesc.has(uma(x[1])))
        ? x
        : [x[0], String(x[1] || '').slice(0, 80)])
    };
  }
  descritivos = { ...descritivos, editais: enxuto };
}

// A constante entra no TOPO do script, e nao no lugar da chamada: aquele fetch
// esta depois de um "return", e "return var X = ..." e erro de sintaxe. Deu
// pagina em branco na primeira tentativa, com o script inteiro sem executar.
const ancora = 'var D=[];';
if (!html.includes(ancora)) throw new Error('nao achei a ancora "' + ancora + '" no index.html');
html = html.replace(ancora,
  'var RADAR_DESCRITIVOS = ' + JSON.stringify(descritivos).replace(/</g, '\\u003c') + ';\n' + ancora);
html = html.replace(chamadaDesc,
  'Promise.resolve({ ok:true, json:function(){ return RADAR_DESCRITIVOS; } })');

// As folhas de abertura, pelo mesmo caminho. Sao a maior parte do peso da
// pagina: cada uma e um PDF de uma folha em base64, com as fontes do orgao
// dentro. O teto do artefato e 16 MB, entao o publicador avisa quando chega
// perto.
const chamadaAber = 'fetch("aberturas.json?v=" + Date.now(), {cache:"no-store"})';
if (!html.includes(chamadaAber)) throw new Error('nao achei a chamada do aberturas.json no index.html');
let aberturas = { editais: {} };
try { aberturas = JSON.parse(doc('aberturas.json')); }
catch { console.error('aviso: docs/aberturas.json nao encontrado — o resumo sai sem a folha de abertura'); }

// ORCAMENTO, e nao teto fixo por folha.
//
// O peso esta nas capas escaneadas: o orgao imprime, assina, digitaliza e sobe
// a foto, e uma pagina dessas chega a 3,5 MB (Jaraguari/MS) contra 240 KB de
// uma folha com texto. Todas as folhas juntas passam de 20 MB, e o
// visualizador recusa acima de 16.
//
// As que ficam de fora nao se perdem: o lote local em resumos/ nao tem teto e
// anexa as paginas originais de todos os editais. O corte vale so para o que
// roda dentro do navegador.
//
// O teto fixo teve de ser mudado tres vezes em dois dias — 400, 450, 500 — e
// na varredura de 09/09, com 12 editais a mais, os mesmos 500 KB levaram a
// pagina a 16,79 MB e a publicacao seria recusada. Teto fixo nao sabe quantos
// editais existem; orcamento sabe.
//
// A regra agora: as folhas entram da mais leve para a mais pesada ate encher o
// orcamento. Isso maximiza a QUANTIDADE de folhas, que e o que o usuario quer,
// e garante que o arquivo cabe sem ninguem recalcular teto a cada rodada.
//
// O limite por folha continua existindo, alto, so para uma capa escaneada
// gigante nao comer o orcamento sozinha: a de Jaraguari/MS tem 3,5 MB, que
// sozinha valeria por dez folhas com texto.
const ORCAMENTO_MB = 14;
const LIMITE_FOLHA = 800 * 1024;
{
  const todas = Object.entries(aberturas.editais || {})
    .map(([k, v]) => [k, v, Math.round((v.b64 || '').length * 0.75)])
    .sort((a, b) => a[2] - b[2]);

  const dentro = {};
  let usado = 0, fora = 0;
  for (const [k, v, bytes] of todas) {
    // base64 infla um terco: o orcamento e medido no tamanho que vai na pagina
    const naPagina = bytes * 4 / 3;
    if (bytes > LIMITE_FOLHA || usado + naPagina > ORCAMENTO_MB * 1024 * 1024) { fora++; continue; }
    dentro[k] = v;
    usado += naPagina;
  }
  aberturas = { ...aberturas, editais: dentro };
  console.log(`folhas de abertura: ${Object.keys(dentro).length} embutidas (${(usado / 1024 / 1024).toFixed(1)} MB`
    + ` de ${ORCAMENTO_MB} MB de orcamento), ${fora} fora`);
}
html = html.replace(ancora,
  'var RADAR_ABERTURAS = ' + JSON.stringify(aberturas).replace(/</g, '\\u003c') + ';\n' + ancora);
html = html.replace(chamadaAber,
  'Promise.resolve({ ok:true, json:function(){ return RADAR_ABERTURAS; } })');

const saida = process.argv[2] || path.join(DIR, 'radar-artefato.html');
fs.writeFileSync(saida, html, 'utf8');
const mb = html.length / 1024 / 1024;
console.log('artefato: ' + saida + ' · ' + (html.length / 1024).toFixed(0) + ' KB · '
  + dados.editais.length + ' editais da varredura de '
  + dados.meta.varredura.split('-').reverse().join('/'));

// O visualizador recusa acima de 16 MB, e a recusa vem na hora de publicar,
// depois de todo o trabalho. Como as folhas de abertura crescem com a lista de
// editais, o aviso fica aqui: baixar o TETO_FOLHA e o jeito de voltar a caber.
const TETO_ARTEFATO = 16;
if (mb > TETO_ARTEFATO) {
  console.error(`\nERRO: ${mb.toFixed(2)} MB passa do teto de ${TETO_ARTEFATO} MB do artefato.`);
  console.error(`Baixe o TETO_FOLHA (hoje ${TETO_FOLHA / 1024} KB) e gere de novo.`);
  process.exit(1);
}
if (mb > TETO_ARTEFATO - 1.5) {
  console.error(`\naviso: ${mb.toFixed(2)} MB, a ${(TETO_ARTEFATO - mb).toFixed(2)} MB do teto.`
    + ` Na proxima varredura com mais editais isso estoura — considere baixar o TETO_FOLHA.`);
}
