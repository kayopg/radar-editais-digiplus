// Quebra o texto das secoes em UM DESCRITIVO POR ITEM, para o resumo sair em
// tabela como no edital: uma linha por item, com a especificacao inteira.
//
// Antes as secoes iam como texto corrido. O usuario mandou a pagina do edital
// de Salto/SP mostrando o que quer — uma tabela com item, codigo e o
// descritivo completo em cada linha ("VENTILADOR DE PAREDE, preto, 60 cm de
// diametro (minimo), movimento oscilante...") — e texto corrido nao e isso.
//
// Nao baixa nada: trabalha em cima do que o descritivos.mjs ja extraiu, usando
// o extraiDescritivo, que existe desde a primeira versao justamente para
// ancorar no rotulo curto da API e pegar a celula inteira do Termo de
// Referencia.
//
// Uso: node descritivo-por-item.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraiDescritivo } from './paginas-uteis.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const arquivo = path.join(DIR, 'docs', 'descritivos.json');
const base = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));
const C = dados.colunas.reduce((o, n, i) => (o[n] = i, o), {});

// A ancora e o rotulo curto da API, e ele quase nunca aparece inteiro no
// edital. O PNCP escreve "Fogao Industrial aplicacao: alimentacao e nutricao,
// caracteristicas adicionais: sem forno" — um cabecalho de produto seguido de
// pares campo: valor — enquanto o Termo de Referencia escreve "FOGAO
// INDUSTRIAL, em aco inoxidavel, 6 bocas...". Procurando a frase inteira nao
// casa nada: eram 93 de 336 itens.
//
// Entao a ancora encurta por etapas, da mais especifica para a mais generica, e
// para na primeira que aparece no texto. Encurtar demais e perigoso — "Fogao"
// sozinho casaria com a linha de outro fogao — por isso o piso e de tres
// palavras.
const ACENTOS = { 'á':'a','à':'a','â':'a','ã':'a','ä':'a','é':'e','è':'e','ê':'e','ë':'e',
  'í':'i','ì':'i','î':'i','ï':'i','ó':'o','ò':'o','ô':'o','õ':'o','ö':'o','ú':'u','ù':'u',
  'û':'u','ü':'u','ç':'c','ñ':'n' };
// Troca cada caractere por UM caractere: as posicoes no texto normalizado tem
// de bater com as do original, senao o recorte sai deslocado.
const normIgual = s => String(s ?? '').toLowerCase().replace(/[^\x00-\x7f]/g, c => ACENTOS[c] || c);

function ancoraDe(plano, curto) {
  const tentativas = [curto];
  const antesDoCampo = curto.split(/\s+[A-Za-zÀ-ÿ]+:\s/)[0];
  if (antesDoCampo && antesDoCampo.length >= 6 && antesDoCampo !== curto) tentativas.push(antesDoCampo);
  const palavras = curto.split(/\s+/);
  for (const n of [6, 4, 3]) {
    if (palavras.length > n) {
      const t = palavras.slice(0, n).join(' ');
      if (t.length >= 6) tentativas.push(t);
    }
  }
  for (const t of tentativas) {
    const a = normIgual(t).replace(/\s+/g, ' ').trim();
    if (a.length >= 6 && plano.includes(a)) return a;
  }
  return '';
}

// Teto por item. Existe so para o ULTIMO item da tabela, que nao tem um proximo
// para fechar a celula.
const TETO_ITEM = 1400;

// Corte de reserva, para quando o proximo item nao vira marca — porque o rotulo
// dele na API nao aparece com essas palavras no edital, e ai nao ha limite pela
// frente. Sobrou em 3 dos 545 descritivos, e os tres tinham a mesma assinatura:
// o fim da linha da tabela, "R$ unitario R$ total <numero do proximo item>".
//
//   "...tolerância. UN 1 R$ 1.005,52 R$ 1.005,52 6 Maca Veterinária - Estrutura"
//   "...,00 R$ 5,56 R$ 2.224,00 196 001.020.079 SACO PARA LIXO DOMESTICO"
//
// O segundo padrao pega a linha que comeca com numero do item + codigo de
// catalogo ("2 165.6.205"), que e como o edital de Salto/SP separa as linhas.
// O (?=\s|$) no fim e proposital: sem ele o padrao exigia um espaco depois e
// nao casava quando a sobra ficava no FIM do texto — era o caso de Salto/SP,
// que terminava em "...mínima, média e máxima. 2 165.6.205".
const FIM_DE_LINHA = [
  /R\$\s*[\d.,]+\s+R\$\s*[\d.,]+\s+\d{1,4}(?=\s|$)/,
  /\s\d{1,4}\s+\d{1,3}(?:\.\d{1,3}){2,}(?=\s|$)/,
  // "MINI SPLIT. 10 04 UND APARELHO AR CONDICIONADO..." — numero do item,
  // quantidade e unidade abrindo a linha seguinte, em Descalvado/SP.
  /\s\d{1,4}\s+\d{1,4}\s+(?:UND|UNID|UN|PCS|PC|CX|PAR|KG|LT)(?=\s|$)/,
  // Fonte com codificacao propria devolve o texto em letras soltas:
  // "& ¤ P D U D  1 D F L R Q D O  G H". Nao da para consertar, mas da para
  // nao arrastar o lixo para dentro do descritivo — corta onde comeca.
  /(?:\s\S){8,}(?=\s|$)/
];

// Rodape de pagina que cai no meio da celula quando o descritivo atravessa uma
// quebra: "Rua Jose Quirino Ribeiro, 55, Jardim Belem - Descalvado (SP) - PABX
// (19) 3583.9300 - CEP 13690-091 www.descalvado.sp.gov.br". Aqui se REMOVE em
// vez de cortar: cortar jogaria fora a continuacao da especificacao, que vem
// logo depois do rodape e e justamente o que se quer.
const RODAPE = [
  /\s*www\.[^\s]+/gi,
  /\s*CEP[:\s]*\d{5}-?\d{3}/gi,
  /\s*PABX[^A-Za-zÀ-ú]*(?:\(\d{2}\))?[\d\s.\-]{6,}/gi,
  /\s*(?:Rua|Avenida|Av\.|Praça)\s+[^,]{3,45},\s*n?º?\s*\d+[^,]{0,30},?/gi
];
function tiraRodape(txt) {
  let t = txt;
  for (const re of RODAPE) t = t.replace(re, ' ');
  return t.replace(/\s{2,}/g, ' ').replace(/\s+([.,;])/g, '$1').trim();
}

function cortaNaProximaLinha(txt) {
  const limpo = tiraRodape(txt);
  let fim = limpo.length;
  for (const re of FIM_DE_LINHA) {
    const m = re.exec(limpo);
    // > 60 para nao cortar no proprio comeco, quando o item abre com o preco
    if (m && m.index > 60 && m.index < fim) fim = m.index;
  }
  return (fim === limpo.length ? limpo : limpo.slice(0, fim)).trim();
}

// Recorta o descritivo de cada item cortando no comeco do PROXIMO item.
//
// Antes cada item era procurado sozinho e a celula terminava num padrao de
// "unidade + quantidade". Quando o edital nao usa esse padrao, o corte nao
// acontecia e o item engolia os seguintes: no edital de Salto/SP a descricao do
// item 1 (FRIGOBAR) vinha com os itens 2 a 8 dentro dela, porque ali a linha
// comeca com "2 165.6.205" e nao com "UN 5". O usuario abriu o PDF e viu a
// tabela embaralhada.
//
// Agora o texto e segmentado de uma vez: marca-se onde CADA item do edital
// aparece, ordena-se, e o descritivo de um item vai da sua marca ate a marca
// seguinte, seja de quem for. Item nenhum pode invadir o proximo, porque o
// proximo e o limite. Itens iguais repetidos (Salto lista a mesma geladeira nos
// itens 5 e 6) geram marcas separadas e recebem o mesmo texto, que e o certo.
function descritivosPorItem(secoes, itens) {
  const plano = normIgual(secoes);
  // Uma marca por POSICAO, com todos os itens que casam ali. Guardar uma marca
  // por item dava marcas repetidas na mesma posicao quando dois itens sao o
  // mesmo produto, e o trecho entre duas marcas coladas tem tamanho zero: em
  // Salto/SP a geladeira do item 5 ficava sem descritivo e a do item 6, que e
  // identica, ficava com ele.
  const porPos = new Map();
  itens.forEach((it, i) => {
    const a = ancoraDe(plano, it[1]);
    if (!a) return;
    let de = 0;
    for (;;) {
      const k = plano.indexOf(a, de);
      if (k < 0) break;
      if (!porPos.has(k)) porPos.set(k, []);
      porPos.get(k).push(i);
      de = k + a.length;
    }
  });
  const posicoes = [...porPos.keys()].sort((a, b) => a - b);

  const melhor = new Map();
  posicoes.forEach((pos, k) => {
    const proxima = k + 1 < posicoes.length ? posicoes[k + 1] : secoes.length;
    const fim = Math.min(proxima, pos + TETO_ITEM, secoes.length);
    const txt = cortaNaProximaLinha(secoes.slice(pos, fim).replace(/\s+/g, ' ').trim());
    for (const i of porPos.get(pos)) {
      const atual = melhor.get(i);
      if (!atual || txt.length > atual.length) melhor.set(i, txt);
    }
  });
  return melhor;
}

let comTexto = 0, semTexto = 0, itensTotal = 0, itensRicos = 0;

for (const e of dados.editais) {
  const v = base.editais[e[C.path]];
  if (!v || !v.itens) continue;

  const secoes = (v.secoes || []).map(s => s.texto).join('  ');
  if (!secoes) { semTexto++; continue; }
  comTexto++;

  const recortes = descritivosPorItem(secoes, v.itens);
  v.itens.forEach((it, i) => {
    itensTotal++;
    // it = [numero, descricao, quantidade, unidade, valor, beneficio]
    const completo = recortes.get(i);
    // So vale guardar o que acrescenta de verdade ao rotulo que ja temos.
    if (completo && completo.length > it[1].length + 40) { it[6] = completo; itensRicos++; }
    else if (it.length > 6) it.length = 6;
  });
}

fs.writeFileSync(arquivo, JSON.stringify(base), 'utf8');
console.log(`${comTexto} edital(is) com texto de secao · ${semTexto} sem`);
console.log(`${itensRicos} de ${itensTotal} itens ganharam descritivo completo`);
console.log(`docs/descritivos.json: ${(fs.statSync(arquivo).size / 1024).toFixed(0)} KB`);
