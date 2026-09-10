// Extrai de cada edital o texto das secoes que descrevem os produtos — Termo de
// Referencia, Descricao dos Itens, Descricao Detalhada, Especificacao dos Bens —
// e guarda em docs/descritivos.json.
//
// Por que isto existe: o resumo baixado PELA PAGINA saia com uma pagina so. A
// pagina nao consegue buscar o arquivo do edital no PNCP — o endpoint devolve o
// cabecalho de CORS errado ("access-control-allow-origin: *, *") e o navegador
// recusa; dentro do artefato do claude.ai nem isso, o sandbox bloqueia qualquer
// busca externa. Entao o texto e extraido AQUI, onde nao ha navegador no
// caminho, e viaja junto com os dados. O PDF baixado passa a trazer o
// descritivo completo sem depender de rede nenhuma.
//
// O lote de PDFs (resumos.mjs) continua anexando as PAGINAS originais, que sao
// melhores: tem tabela, carimbo e diagramacao. Este arquivo e o que da para
// entregar dentro do navegador.
//
// Uso:
//   node descritivos.mjs               -> todos os editais do dados.json
//   node descritivos.mjs --limite 5    -> so os cinco primeiros, para testar
//   node descritivos.mjs --uf PR       -> so um estado
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { textoDasPaginas, escolhePaginas, textoUtil, coberturaItens, CABECALHOS } from './paginas-uteis.mjs';
import { arquivosPublicados, fontesDe, buscaTodosItens } from './resumo-pdf.mjs';
import { textoDocx, textoDoc } from './arquivo-oficial.mjs';
import { createRequire } from 'node:module';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LE = createRequire(import.meta.url)(path.join(DIR, 'docs', 'pdf-le.js'));

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(nome);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
};
const UF = (arg('--uf', '') || '').toUpperCase();
const LIMITE = Number(arg('--limite', 0));

// Teto por edital.
//
// Eram 60 mil caracteres, escolhidos quando este texto viajava embutido na
// pagina do artefato. Desde 09/09/2026 ele nao viaja mais — o resumo deixou de
// imprimir as folhas com os trechos do edital — e o teto virou so um limite de
// extracao, sem contrapartida.
//
// E ele estava cortando fundo: 23 dos 60 editais batiam nele. Em Bueno
// Brandao/MG a tabela de itens comeca na posicao 54.700, entao quase toda ela
// caia fora, e "frigobar" e "geladeira" simplesmente nao existiam no texto que
// sobrava. Era a maior causa de item sem descritivo — maior que a ancora.
//
// 250 mil cobre o edital inteiro na quase totalidade dos casos.
const TETO = 250000;

const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));
const C = dados.colunas.reduce((o, n, i) => (o[n] = i, o), {});

let alvos = dados.editais;
if (UF) alvos = alvos.filter(e => e[C.uf] === UF);
if (LIMITE) alvos = alvos.slice(0, LIMITE);

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Texto que saiu embaralhado da extracao nao pode ser entregue como descritivo.
//
// Alguns PDFs usam fonte com codificacao propria e o extrator devolve
// "CÁmara Nacional de LicitaÆÔes" no lugar de "Câmara Nacional de Licitações".
// No lote isso nao aparecia, porque ali se copiam as PAGINAS do PDF e nao o
// texto; aqui o texto e o produto, entao lixo tem de ser recusado — melhor
// dizer que nao deu do que entregar descritivo ilegivel para cotar em cima.
// O sinal e maiuscula acentuada colada depois de minuscula — "ReferÉncia",
// "dispÔe", "LicitaÆÔes". Em portugues escrito isso nao acontece: acentuada em
// caixa alta so aparece em inicio de palavra ou em palavra inteira maiuscula.
// Contar so os caracteres estranhos nao bastava, porque "É" e legitimo em
// "É necessario" e o limiar deixava passar Caceres/MT inteiro.
const RUIM = /[a-z][ÁÉÍÓÚÂÊÎÔÛÀÈÌÒÙÃÕÇÆØ]|\$ü/g;
// Densidade de palavra portuguesa comum. Texto de verdade tem varias por linha;
// texto de fonte com codificacao propria nao tem nenhuma.
const LEGIVEL = /\b(?:de|da|do|dos|das|para|com|que|nao|sera|deve|item|valor|unidade|conforme|sendo|pelo|pela)\b/gi;

// Uma coisa e o texto embaralhado, que traz marca; outra e o texto que nao diz
// nada. O edital de Aparecida do Taboado/MS entregava 250 mil caracteres de
// tabulacoes e sinais de pontuacao soltos, sem nenhuma marca de RUIM: passava
// direto e ocupava o teto inteiro sem servir para nada.
function ehPortugues(t) {
  if (!t || t.length < 500) return true;
  return (t.match(LEGIVEL) || []).length / (t.length / 100) >= 0.5;
}

function embaralhado(t) {
  if (!t || t.length < 200) return false;
  const n = (t.match(RUIM) || []).length;
  if (!(n > 4 && n / t.length > 0.0012)) return false;
  // O limiar de RUIM e proporcional e, num documento longo, o acaso o alcanca:
  // o .doc de Diamante D'Oeste/PR tem 270 mil caracteres perfeitamente legiveis
  // e foi recusado inteiro, deixando os 8 itens sem descritivo. Texto que tem
  // densidade normal de palavra portuguesa nao esta embaralhado, por mais
  // marcas que junte.
  const boas = (t.match(LEGIVEL) || []).length;
  // 0,8 e o piso. Medido nos 48 textos que temos: os legitimos vao de 1,0
  // (Santa Rita do Passa Quatro/SP) a 3,6, com mediana 2,3; o .doc de Diamante
  // D'Oeste/PR fica em 1,48 porque a extracao de DOC junta as passagens de 8
  // bits e as de 16 e deixa ruido entre as palavras. Texto de fonte com
  // codificacao propria fica em zero.
  return boas / (t.length / 100) < 0.8;
}

// A codificacao quebrada e por FONTE, nao por documento: em Caceres/MT o
// cabecalho do orgao sai limpo e o corpo sai embaralhado, no mesmo PDF.
// Descartar o edital inteiro por causa de algumas paginas jogava fora
// descritivo bom, entao a pagina ruim vira vazia e as demais seguem. O indice
// e preservado porque o seletor de paginas trabalha por posicao.
// Antes de jogar a pagina fora, tenta consertar.
//
// Boa parte do que parecia "fonte com codificacao propria" e so o acento
// deslocado 33 posicoes: "LicitaÆÔes" e "Licitações", "GestÂo" e "Gestão",
// "ReferÉncia" e "Referência" — c6->e7, d4->f5, c2->e3, c9->ea, todos +33. As
// letras sem acento sempre estiveram certas, entao o texto servia e ia para o
// lixo inteiro: Governador Valadares/MG perdia 56 das 64 paginas, Santa
// Maria/RS 26 das 48, e com elas o descritivo dos itens.
//
// Tres passadas porque o par sai grudado ("aÆÔ"): a primeira troca o Æ, e so
// entao o Ô fica precedido de letra.
function desloca(t) {
  let x = t;
  for (let n = 0; n < 3; n++) {
    x = x.replace(/([A-Za-zÀ-ÿ])([\u00C0-\u00DF])/g,
      (m, a, c) => a + String.fromCharCode(c.charCodeAt(0) + 33));
  }
  return x.replace(/\$ü/g, '-');
}

// So aceita o conserto se ele produzir portugues: sem esta prova, um texto
// legitimo cheio de maiuscula acentuada sairia estragado.
const PORTUGUES = /ção|ções|ão|ência|ário|ível|não/gi;
function conserta(t) {
  const x = desloca(t);
  const antes = (t.match(PORTUGUES) || []).length;
  const depois = (x.match(PORTUGUES) || []).length;
  return depois > antes + 2 ? x : t;
}

const limpaPaginas = paginas => paginas.map(p => {
  // O conserto e sempre tentado, e nao so quando a pagina parece embaralhada:
  // ele tem prova propria (so vale se produzir mais portugues) e, desde que o
  // embaralhado() passou a exigir tambem baixa densidade de palavra comum, as
  // paginas de acento deslocado deixaram de ser marcadas — e saiam sem conserto,
  // com "Capacidade RefrigeraÆÂo" no descritivo de Governador Valadares/MG.
  const c = conserta(p);
  return embaralhado(c) ? '' : c;
});

// Corta o texto nos cabecalhos que abrem secao de descritivo, e devolve cada
// pedaco com o rotulo COMO ESTA NO EDITAL — "ANEXO I - TERMO DE REFERENCIA" e
// mais util do que um rotulo inventado por nos.
// Rotula as secoes pela CLASSIFICACAO DAS PAGINAS, nao por cabecalho no texto.
//
// Cacar cabecalho no texto corrido nao funciona bem: textoDasPaginas achata os
// espacos e o comeco de linha se perde, entao nao da para separar o titulo da
// secao de uma citacao no meio de um paragrafo. Exigir caixa alta ajudou, mas
// muito edital escreve "Termo de Referência" em caixa mista, e ai o resumo
// inteiro saia num bloco unico de 60 mil caracteres — sem nenhuma das secoes
// que o usuario pediu.
//
// O escolhePaginas ja separa as paginas por papel e essa parte e testada: qual
// e a pagina do objeto, quais citam os descritivos dos itens, qual e a faixa do
// Termo de Referencia. Os rotulos saem dai. Quando a pagina traz um cabecalho
// de verdade em caixa alta, ele ganha — e melhor mostrar "ANEXO I - TERMO DE
// REFERENCIA" como o edital escreveu do que um rotulo nosso.
function rotuloDaPagina(texto, i, sel) {
  const plano = norm(texto);
  for (const c of CABECALHOS) {
    const k = plano.indexOf(c);
    if (k < 0) continue;
    const bruto = texto.slice(k, k + c.length);
    if (bruto === bruto.toUpperCase()) return bruto.replace(/\s+/g, ' ').trim().toUpperCase();
  }
  if ((sel.tabela || []).includes(i)) return 'DESCRIÇÃO DOS ITENS';
  if ((sel.tr || []).includes(i)) return 'TERMO DE REFERÊNCIA';
  if (sel.objeto === i) return 'OBJETO DO EDITAL';
  if (i <= 1) return 'ABERTURA DO EDITAL';
  return 'TRECHO DO EDITAL';
}

function secoesPorPagina(paginas, quais, sel) {
  const secoes = [];
  for (const i of quais) {
    const t = (paginas[i] || '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const rotulo = rotuloDaPagina(paginas[i], i, sel);
    const ultima = secoes[secoes.length - 1];
    // Paginas seguidas com o mesmo papel viram uma secao so, para nao repetir
    // "TERMO DE REFERENCIA" doze vezes no PDF.
    if (ultima && ultima.rotulo === rotulo) ultima.texto += ' ' + t;
    else secoes.push({ rotulo, texto: t });
  }
  return secoes.filter(s => s.texto.length > 120);
}

function secoesDe(texto, rotuloInicial) {
  const plano = norm(texto);
  const achados = [];
  for (const c of CABECALHOS) {
    let de = 0;
    for (;;) {
      const k = plano.indexOf(c, de);
      if (k < 0) break;
      de = k + c.length;
      // So conta como CABECALHO o que esta em caixa alta no original. Sem isso
      // o corte acontecia em qualquer MENCAO ao termo, e as secoes comecavam no
      // meio de uma frase: "Termo de Referencia, assumindo o proponente o
      // compromisso de executar os servicos nos seus termos" virava uma secao
      // rotulada TERMO DE REFERENCIA cheia de habilitacao. O edital escreve o
      // titulo da secao em maiuscula e a citacao no corpo em caixa mista.
      const bruto = texto.slice(k, k + c.length);
      if (bruto !== bruto.toUpperCase()) continue;
      achados.push({ pos: k, tam: c.length });
    }
  }
  achados.sort((a, b) => a.pos - b.pos);

  // Cabecalhos coladinhos (o mesmo titulo no indice e na secao) viram um so.
  const cortes = [];
  for (const a of achados) {
    if (!cortes.length || a.pos - cortes[cortes.length - 1].pos > 400) cortes.push(a);
  }

  const secoes = [];
  const poe = (rotulo, ini, fim) => {
    const t = texto.slice(ini, fim).replace(/\s+/g, ' ').trim();
    if (t.length > 120) secoes.push({ rotulo, texto: t });
  };

  if (!cortes.length) { poe(rotuloInicial, 0, texto.length); return secoes; }
  poe(rotuloInicial, 0, cortes[0].pos);
  for (let i = 0; i < cortes.length; i++) {
    const ini = cortes[i].pos;
    const fim = i + 1 < cortes.length ? cortes[i + 1].pos : texto.length;
    // O rotulo sai do texto original, no lugar exato onde o cabecalho casou.
    const rotulo = texto.slice(ini, ini + cortes[i].tam).replace(/\s+/g, ' ').trim();
    poe(rotulo.toUpperCase(), ini, fim);
  }
  return secoes;
}

// Corta no teto sem partir palavra, e avisa que cortou.
function limita(secoes) {
  let usado = 0;
  const saida = [];
  for (const s of secoes) {
    if (usado >= TETO) break;
    const sobra = TETO - usado;
    if (s.texto.length <= sobra) { saida.push(s); usado += s.texto.length; continue; }
    const corte = s.texto.slice(0, sobra);
    const fim = corte.lastIndexOf(' ');
    saida.push({ rotulo: s.rotulo, texto: corte.slice(0, fim > 0 ? fim : corte.length), cortado: true });
    usado = TETO;
  }
  return saida;
}

async function extrai(e) {
  const tropecos = [];
  const cands = await arquivosPublicados(e);
  const itens = await buscaTodosItens(e) || [];

  // Junta TODOS os arquivos publicados num texto so, na ordem em que o PNCP os
  // pesa (edital primeiro, termo de referencia depois).
  //
  // Parar no primeiro arquivo nao serve aqui. Em Severinia/SP o PDF do edital
  // tem 26 paginas e nenhuma delas descreve item: cita seis vezes "ANEXO I -
  // Termo de Referencia", que e OUTRO arquivo. Sozinho ele dava cobertura zero
  // e o descritivo ficava de fora — justamente o que o usuario precisa.
  let paginas = [], textoWord = null, formato = null;
  // O que se chama de Termo de Referencia vai na frente, e leem-se oito
  // arquivos, nao quatro.
  //
  // Chapadao do Sul/MS publica 27 arquivos e o "4__Termo_de_referncia" fica em
  // decimo; com quatro leituras o edital entrava sem a tabela de itens e os 8
  // itens ficavam sem descritivo. O mesmo em Montes Claros/MG e Pouso Alegre/MG.
  const ehTR = a => /termo|referencia|refer[eê]ncia|anexo|especifica|memorial|planilha/i.test(String(a.titulo || ''));
  const ordem = [...cands.filter(ehTR), ...cands.filter(a => !ehTR(a))];
  for (const c of ordem.slice(0, 8)) {
    let f;
    try { f = await fontesDe(c, tropecos); } catch (err) { tropecos.push(err.message); continue; }
    for (const p of f.pdfs) {
      try { paginas = paginas.concat(await textoDasPaginas(await LE.abre(p.bytes))); }
      catch (err) { tropecos.push(err.message); }
    }
    if (!textoWord && f.texto) {
      try {
        const bytes = await baixaDe(c);
        textoWord = f.texto.formato === 'DOC' ? textoDoc(bytes) : textoDocx(bytes);
        formato = f.texto.formato;
      } catch (err) { tropecos.push(err.message); }
    }
  }

  if (paginas.length) {
    const boas = limpaPaginas(paginas);
    const perdidas = boas.filter((p, i) => !p && paginas[i]).length;
    if (!textoUtil(paginas)) tropecos.push('PDF sem texto extraivel (imagem)');
    else if (!ehPortugues(paginas.join(' '))) tropecos.push('texto do PDF nao e legivel (fonte com codificacao propria)');
    else if (!boas.some(p => p.length > 200)) tropecos.push('texto do PDF saiu embaralhado (fonte com codificacao propria)');
    else {
      paginas = boas;
      const sel = escolhePaginas(e, itens, paginas);
      const cobre = coberturaItens(e, paginas, sel.escolhidas);
      // Mesma regra do anexo: selecao que nao cobre os itens nao serve, e ai
      // vale mais mandar o documento inteiro do que perder descritivo.
      const quais = (cobre >= 0.6 && (sel.tabela.length || (sel.tr && sel.tr.length)))
        ? sel.escolhidas : paginas.map((_, i) => i);
      return { fonte: 'PDF', paginas: quais.length, total: paginas.length,
               cobertura: +cobre.toFixed(2), ilegiveis: perdidas || undefined,
               secoes: limita(secoesPorPagina(paginas, quais, sel)) };
    }
  }

  if (textoWord) textoWord = conserta(textoWord);
  if (textoWord && !embaralhado(textoWord)) {
    return { fonte: formato, paginas: null, total: null,
             secoes: limita(secoesDe(textoWord, 'ABERTURA DO EDITAL')) };
  }
  return { fonte: null, secoes: [], motivo: tropecos[0] || 'nao foi possivel ler o arquivo' };
}

// fontesDe ja baixou os bytes, mas nao os devolve no caminho de texto; para
// DOC/DOCX vale mais rebaixar do que mudar a assinatura dela e mexer no anexo,
// que esta funcionando.
async function baixaDe(c) {
  const r = await fetch(c.url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

console.log(`${alvos.length} edital(is) · teto de ${(TETO / 1000)} mil caracteres por edital\n`);

const saida = {};
let ok = 0, vazios = 0, erros = 0, chars = 0;

async function pool(itens, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < itens.length) { const k = i++; await fn(itens[k], k); }
  }));
}

// Concorrencia 2, e nao 4: aqui cada edital baixa ate quatro arquivos, e com
// quatro em paralelo o PNCP passou a responder 503 em tudo. O lote de PDFs
// aguenta 4 porque baixa um arquivo por edital.
await pool(alvos, 2, async (e) => {
  await new Promise(x => setTimeout(x, 400));
  const chave = e[C.path];
  try {
    const r = await extrai(e);
    saida[chave] = r;
    const n = r.secoes.reduce((s, x) => s + x.texto.length, 0);
    chars += n;
    if (r.secoes.length) ok++; else vazios++;
    console.log(`  ${e[C.municipio]}/${e[C.uf]} · ${r.fonte || 'sem fonte'} · `
      + `${r.secoes.length} secao(oes) · ${(n / 1000).toFixed(1)} mil chars`
      + (r.motivo ? ' · ' + r.motivo : ''));
  } catch (err) {
    erros++;
    saida[chave] = { fonte: null, secoes: [], motivo: err.message };
    console.log(`  [erro] ${e[C.municipio]}/${e[C.uf]}: ${err.message}`);
  }
});

const arquivo = path.join(DIR, 'docs', 'descritivos.json');
fs.writeFileSync(arquivo, JSON.stringify({ varredura: dados.meta.varredura, editais: saida }), 'utf8');
const kb = fs.statSync(arquivo).size / 1024;
console.log(`\n${ok} com secoes · ${vazios} sem · ${erros} erro(s)`);
console.log(`docs/descritivos.json: ${kb.toFixed(0)} KB · ${(chars / 1000).toFixed(0)} mil caracteres`);
