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
import { textoDocx, textoDoc, abreZip } from './arquivo-oficial.mjs';
import { ehPlataformaComAnexos, anexosDaPlataforma } from './anexos-plataforma.mjs';
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

// --path: um edital so, pelo caminho do PNCP. A saida e mesclada no arquivo que
// ja existe, entao rodar filtrado nao apaga o resto — e o jeito de conferir uma
// correcao de extracao sem gastar dez minutos refazendo os sessenta.
const SOPATH = arg('--path', '');

let alvos = dados.editais;
if (SOPATH) alvos = alvos.filter(e => e[C.path] === SOPATH);
if (UF) alvos = alvos.filter(e => e[C.uf] === UF);
if (LIMITE) alvos = alvos.slice(0, LIMITE);

// --faltantes: so os editais que estao sem texto. O PNCP devolve 502 de vez em
// quando, e uma rodada de 10 minutos inteira para recuperar dois editais e
// desperdicio — pior, mexe no que ja estava bom.
if (process.argv.includes('--faltantes')) {
  let jaTem = {};
  try { jaTem = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'descritivos.json'), 'utf8')).editais || {}; } catch {}
  alvos = alvos.filter(e => !((jaTem[e[C.path]] || {}).secoes || []).length);
}

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

// Marca, no texto, o ponto em que duas folhas NAO seguidas do edital ficaram
// lado a lado.
//
// A selecao pula paginas, e o texto das secoes emendava a pagina 25 na 31 como
// se fossem uma so: a celula que atravessava a virada da 25 continuava no meio
// de outro assunto. Em Luz/MG o bebedouro seguia de "compativel com o fluxo de"
// direto para "de apoio. Dessa forma, a aplicacao do saldo remanescente...". O
// descritivo-por-item corta a celula nesta marca; o texto das secoes nao vai
// para a pagina publicada, entao ela nao aparece para ninguem.
export const PULO_DE_PAGINA = '‖‖';

function secoesPorPagina(paginas, quais, sel) {
  const secoes = [];
  let anterior = null;
  for (const i of quais) {
    let t = (paginas[i] || '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (anterior !== null && i !== anterior + 1) t = PULO_DE_PAGINA + ' ' + t;
    anterior = i;
    const rotulo = rotuloDaPagina(paginas[i], i, sel);
    const ultima = secoes[secoes.length - 1];
    // Paginas seguidas com o mesmo papel viram uma secao so, para nao repetir
    // "TERMO DE REFERENCIA" doze vezes no PDF.
    if (ultima && ultima.rotulo === rotulo) ultima.texto += ' ' + t;
    else secoes.push({ rotulo, texto: t });
  }
  // Secao curta demais e descartada, e com ela sai um pedaco do texto: a
  // seguinte ja nao continua a anterior, entao leva a marca.
  const saida = [];
  let pulou = false;
  for (const s of secoes) {
    if (s.texto.length <= 120) { pulou = true; continue; }
    if (pulou && saida.length && !s.texto.startsWith(PULO_DE_PAGINA)) s.texto = PULO_DE_PAGINA + ' ' + s.texto;
    pulou = false;
    saida.push(s);
  }
  return saida;
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

// Numero do item -> descricao, das planilhas publicadas (ver linhasXlsx no
// arquivo-oficial.mjs). O cabecalho e a linha que tem uma coluna "ITEM" e uma
// de descricao; havendo duas ("DESCCRICAO SIMPLIFICADA" e "DESCRICAO
// DETALHADA", IF Sudeste MG), vale a detalhada. Quem decide se a numeracao da
// planilha bate com a do PNCP e o descritivo-por-item.mjs, item a item.
function descricoesDaPlanilha(folhas) {
  const porItem = {};
  const curta = /simplif|resum|sucint|abrevia/;
  for (const linhas of folhas) {
    let colItem = null, colDesc = [];
    for (const l of linhas) {
      if (!colItem) {
        const cab = Object.entries(l).map(([k, t]) => [k, norm(t).trim()]);
        const it = cab.find(([, t]) => /^(?:n[º°o.]?\s*(?:do\s+)?)?item$|^item\s*n/.test(t));
        const ds = cab.filter(([, t]) => /desc+ri|especifica/.test(t));
        if (it && ds.length) {
          colItem = it[0];
          // a detalhada primeiro; a simplificada so quando a detalhada da linha
          // esta vazia (o item 30 de Juiz de Fora so tem a simplificada)
          const peso = t => (/detalhad|complet|especifica|tecnic/.test(t) ? 0 : 1) + (curta.test(t) ? 2 : 0);
          colDesc = ds.sort((a, b) => peso(a[1]) - peso(b[1])).map(([k]) => k);
        }
        continue;
      }
      const n = String(l[colItem] || '').trim();
      let d = colDesc.map(k => l[k]).find(t => t && t.length >= 30);
      // A detalhada que continua a simplificada: no item 30 de Juiz de Fora a
      // simplificada e "Fogao a Gas Material: Aco Inoxidavel ... Forno
      // ergonomico" e a detalhada comeca em "com Mesa de Inox, Acendimento...".
      const antes = d && /^[a-zà-ÿ]/.test(d) && colDesc.map(k => l[k]).find(t => t && t !== d);
      if (antes) d = antes + ' ' + d;
      if (/^\d{1,4}$/.test(n) && d && !porItem[+n]) porItem[+n] = d;
    }
  }
  return Object.keys(porItem).length ? porItem : undefined;
}

async function extrai(e) {
  const planilhas = [];
  const r = await extraiSecoes(e, planilhas);
  const planilha = descricoesDaPlanilha(planilhas);
  return planilha ? { ...r, planilha } : r;
}

async function extraiSecoes(e, planilhas) {
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
  const paginasDeTexto = [];
  for (const c of ordem.slice(0, 8)) {
    let f;
    try { f = await fontesDe(c, tropecos); } catch (err) { tropecos.push(err.message); continue; }
    planilhas.push(...(f.planilhas || []));
    for (const p of f.pdfs) {
      try { paginas = paginas.concat(await textoDasPaginas(await LE.abre(p.bytes))); }
      catch (err) { tropecos.push(err.message); }
    }
    // ODT e HTML (o edital e o termo de referencia de Caxias do Sul/RS, o edital
    // do SEI de Londrina/PR) entram como paginas de uns 3.500 caracteres, e
    // passam pela mesma selecao das paginas de PDF. Vao DEPOIS dos PDFs: o
    // edital em HTML de Londrina vinha no primeiro zip, e o cabecalho dele virou
    // a celula do item 1, que abre o lote 1 da tabela em PDF.
    for (const x of f.textos || []) paginasDeTexto.push(...emPaginas(x.texto));
    if (f.textos && f.textos.length && !f.pdfs.length) continue;
    if (!textoWord && f.texto) {
      try {
        let bytes = await baixaDe(c);
        // O Word de dentro do zip: o zip inteiro no leitor de DOCX nao dava
        // texto, e o edital de Nova Prata do Iguacu/PR ("Pregao 040 - ERRATA e
        // EDITAL.zip") ficava com os 4 mil caracteres da errata em .doc
        // publicada ao lado (18/09/2026).
        const zip = Buffer.from(bytes.slice(0, 4)).toString('hex') === '504b0304' ? abreZip(bytes) : null;
        if (zip && !zip.some(x => x.nome === 'word/document.xml')) {
          const dentro = zip.find(x => x.nome === f.texto.nome);
          if (dentro) bytes = dentro.abre();
        }
        textoWord = f.texto.formato === 'DOC' ? textoDoc(bytes) : textoDocx(bytes);
        formato = f.texto.formato;
      } catch (err) { tropecos.push(err.message); }
    }
  }
  paginas = paginas.concat(paginasDeTexto);

  // O que o PNCP nao tem, a plataforma da disputa pode ter. Em Serrana/SP o
  // PNCP trazia so o corpo do edital, e todos os itens diziam "conforme termo
  // de referencia"; o Anexo I estava so na BLL. Quando os arquivos do PNCP nao
  // cobrem os itens, entram os anexos da BLL/BNC (ver anexos-plataforma.mjs).
  const link = e[C.linkPortal];
  if (link && ehPlataformaComAnexos(link) && coberturaItens(e, paginas, paginas.map((_, i) => i)) < 0.6) {
    for (const a of await anexosDaPlataforma(link, tropecos)) {
      try { paginas = paginas.concat(await textoDasPaginas(await LE.abre(a.bytes))); }
      catch (err) { tropecos.push(err.message); }
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
      // Quantas paginas de tabela cabem na selecao: 40 e o padrao, e para o
      // edital grande e pouco.
      //
      // Quedas do Iguacu/PR publica 265 paginas para uma ata de 100 itens, e o
      // teto de 40 deixava de fora dois tercos da tabela — com eles, os
      // cabecalhos dos lotes 12 a 49 e a continuacao de varios itens. Uma pagina
      // e meia por item cobre a tabela de qualquer edital sem trazer o contrato
      // junto, e o teto de 250 mil caracteres por edital continua valendo.
      const teto = Math.max(40, Math.min(150, Math.ceil(itens.length * 1.5)));
      const sel = escolhePaginas(e, itens, paginas, { maxTabela: teto });
      const cobre = coberturaItens(e, paginas, sel.escolhidas);
      // Mesma regra do anexo: selecao que nao cobre os itens nao serve, e ai
      // vale mais mandar o documento inteiro do que perder descritivo.
      const base = (cobre >= 0.6 && (sel.tabela.length || (sel.tr && sel.tr.length)))
        ? [...sel.escolhidas] : paginas.map((_, i) => i);
      // O item do radar que nenhuma pagina escolhida cita traz as paginas que
      // citam o nome dele (a primeira palavra do rotulo do PNCP), ate tres. O
      // bebedouro de Renascenca/PR esta na pagina 31 de 82, na tabela do lote 2,
      // e a selecao de 19 paginas nao a pegava: o catalogo chama o item de
      // "Bebedouro Agua tipo: pressao conjugado" e o edital de "BEBEDOURO EM ACO
      // INOX. AGUA FILTRADA E GELADA" (22/09/2026).
      const normPag = paginas.map(p => norm(p));
      for (const it of e[C.itens] || []) {
        const w = norm(it[3]).split(/[^a-z0-9]+/).find(x => x.length >= 5);
        if (!w || base.some(i => normPag[i].includes(w))) continue;
        for (const i of normPag.map((p, i) => p.includes(w) ? i : -1).filter(i => i >= 0).slice(0, 3)) base.push(i);
      }

      // A pagina SEGUINTE de cada escolhida entra junto.
      //
      // A celula de um item nao respeita a folha: a descricao comeca no pe de
      // uma pagina e termina no alto da outra. A selecao achava a pagina em que
      // o item aparece e parava ali, entao o descritivo saia cortado no meio da
      // frase — foi o que o usuario viu no item 79 de Quedas do Iguacu/PR, onde
      // de 265 paginas so 42 entravam.
      //
      // A anterior tambem, pelo motivo simetrico: um item que comeca no fim da
      // pagina 40 tem o nome la e o corpo na 41, e se a busca casou na 41 a
      // linha abre sem o nome.
      const vizinhas = new Set();
      for (const i of base) { vizinhas.add(i); if (i > 0) vizinhas.add(i - 1); if (i + 1 < paginas.length) vizinhas.add(i + 1); }
      const quais = [...vizinhas].sort((a, b) => a - b);
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

function emPaginas(texto, tamanho = 3500) {
  const paginas = [];
  let atual = '';
  for (const linha of texto.split('\n')) {
    if (atual.length + linha.length > tamanho && atual) { paginas.push(atual); atual = ''; }
    atual += (atual ? '\n' : '') + linha;
  }
  if (atual) paginas.push(atual);
  return paginas;
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

const arquivoSaidaDesc = path.join(DIR, 'docs', 'descritivos.json');
// Parte do que ja esta gravado, e nao de um objeto vazio.
//
// Com --uf ou --limite o arquivo era reescrito so com os editais filtrados, e
// os outros sumiam: um "node descritivos.mjs --uf PR" para conferir um edital
// deixou o docs/descritivos.json com 18 dos 63. O git salvou, mas a rodada
// seguinte teria publicado a perda.
//
// No fim, o que nao esta mais no dados.json e descartado — assim o arquivo se
// limpa sozinho quando um edital encerra.
let saida = {};
try { saida = { ...(JSON.parse(fs.readFileSync(arquivoSaidaDesc, 'utf8')).editais || {}) }; } catch {}
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
const vivos = new Set(dados.editais.map(e => e[C.path]));
for (const k of Object.keys(saida)) if (!vivos.has(k)) delete saida[k];
fs.writeFileSync(arquivo, JSON.stringify({ varredura: dados.meta.varredura, editais: saida }), 'utf8');
const kb = fs.statSync(arquivo).size / 1024;
console.log(`\n${ok} com secoes · ${vazios} sem · ${erros} erro(s)`);
console.log(`docs/descritivos.json: ${kb.toFixed(0)} KB · ${(chars / 1000).toFixed(0)} mil caracteres`);
