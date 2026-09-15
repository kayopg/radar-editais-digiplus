// O numero que mostramos e o numero do EDITAL?
//
// Mostramos o numeroItem que o PNCP devolve. Quase sempre e o mesmo numero
// impresso na tabela do edital, mas "quase sempre" nao serve: cotar o item 12
// achando que e o 15 e erro que chega no fornecedor.
//
// A prova: achar o descritivo dentro do texto do edital e ler o numero que
// ABRE a linha. A primeira versao disto lia qualquer numero nos 70 caracteres
// anteriores e acusava 91 divergencias falsas — pegava "AISI 304", "340
// litros", "24.000 BTU" do item de cima. Aqui so vale numero solto encostado
// no comeco do descritivo, que e como a linha de tabela realmente abre.
// As 7 divergencias que sobram na varredura de 11/09/2026 foram abertas uma a
// uma e nenhuma e erro de numeracao:
//
//   Descalvado/SP (5) — o PNCP lista os mesmos produtos DUAS vezes, itens 1 a 8
//     e de novo 9 a 14, uma vez por secretaria; a tabela do edital tem uma linha
//     por produto. Entao o item 9 e o mesmo ar-condicionado de 12.000 BTU da
//     linha 1, e assim por diante. Quem da lance usa o numero da plataforma,
//     que e o nosso.
//   Apiai/SP (2) — a tabela do edital nao numera o relogio de parede, que na
//     plataforma e o item 9; dali para baixo a numeracao impressa fica uma
//     atras. O tanquinho e o item 10 na disputa e "09" na tabela.
//   Mariopolis/PR, edital 25 (1, varredura de 14/09/2026) — a plataforma
//     inverteu as linhas 7 e 8: no PNCP o 7 e o forno eletrico e o 8 o sofa; no
//     edital a linha 7 e o segundo ESTOFADO e a 8 o FORNO ELETRICO (as duas com
//     quantidade 1). O descritivo do item 7 e o do forno, que e o produto
//     certo; o verificador le a quantidade "1" da linha "8 1 FORNO ELETRICO".
//
// Duas correcoes no proprio verificador tiraram dez divergencias falsas:
//
//   Ele lia o ULTIMO numero antes da celula. Onde o edital escreve
//   "01 53 |UND APARELHO...", isso e a quantidade e nao o item — eram doze
//   acusacoes falsas so em Descalvado/SP. Agora, quando a celula abre com a
//   unidade, o primeiro dos dois numeros e que vale.
//
//   A agulha de busca tinha 45 caracteres, e itens do mesmo produto comecam
//   iguais: "Ar-condicionado, Split, quente e frio, 220V," abre os itens 1 e 3
//   de Pinhal Grande/RS, e o verificador media sempre pela primeira linha.
//   Com 80 caracteres entra a capacidade, que separa os dois.
//
// O erro de numeracao de verdade estava em outro lugar e ja foi corrigido: em
// 5 compras o PNCP publica o ID interno no lugar do numero do item (Santo
// Antonio do Caiua/PR saia como 7965701, 7965702, 7965703 e o edital imprime
// 01, 02, 03). Ver corrigeNumeracao() na varredura.

import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('docs/descritivos.json', 'utf8'));
const dd = JSON.parse(fs.readFileSync('docs/dados.json', 'utf8'));
const C = dd.colunas.reduce((o, n, i) => (o[n] = i, o), {});

// Normalizacao que NAO muda o comprimento: os indices tem de valer no texto
// original, senao o trecho lido antes do descritivo e outro.
const DE = 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ';
const PARA = 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN';
const norm = s => String(s ?? '').toLowerCase()
  .replace(/[^\x00-\x7f]/g, c => { const i = DE.indexOf(c); return i < 0 ? c : PARA[i].toLowerCase(); });

// O numero que abre a linha, lido de tras para frente a partir do descritivo:
//   "12 FOGAO..."            -> 12
//   "12 4589 FOGAO..."       -> 12  (numero + codigo de catalogo)
//   "ITEM 12 - FOGAO..."     -> 12
//   "12.1 FOGAO..."          -> 12  (item dentro de lote)
const ABERTURAS = [
  /(?:^|[\s|;])(\d{1,4})(?:\.\d{1,3})?\s*[-–]?\s*$/,
  /(?:^|[\s|;])(\d{1,4})(?:\.\d{1,3})?\s+\d{3,9}\s*$/,
  /\bitem\s*n?[oº°]?\.?\s*(\d{1,4})\s*[-–:]?\s*$/i,
];
// A linha "<item> <quantidade>" seguida da UNIDADE, que abre a celula:
//
//   "... Valor Total (R$) 01 53 |UND APARELHO AR CONDICIONADO ..."
//
// Aqui 01 e o item e 53 e a quantidade. Lendo o ultimo numero, como as
// ABERTURAS fazem, o verificador acusava o item 1 de estar numerado 53 — e
// repetia o engano nos doze itens de Descalvado/SP. A unidade no comeco da
// celula e o que prova qual dos dois numeros e o item.
const ITEM_QTD = /(?:^|[\s|;])(\d{1,4})\s+\d{1,4}\s*$/;
const ABRE_COM_UNIDADE = /^(?:und|unid|unidades?|un|pc|pca|peca|cx|caixa|par|kit|kg|lt)\b/i;

// A unidade e a quantidade da coluna ao lado, ENTRE o numero do item e a
// celula: "1 57651 UN 6 |AR CONDICIONADO" (Guimaranea/MG), "8 629862 Unidade
// (UN) com 1 Unidade 6 |FRITADEIRA" (Vicosa/MG), "(CATJAR) UN 2 |CATMAT..."
// (Jaraguari/MS). O ultimo numero ali e a quantidade; o item vem antes.
const UNIDADE_QTD = /\s*(?:\(catjar\)\s*)?(?:unidades?|unid|und|un)\s*(?:\(un\)\s*com\s*\d+\s*unidade)?\s*\d{1,5}\s*$/;

// Devolve as LEITURAS possiveis do numero da linha, a mais provavel primeiro.
//
// A mesma sequencia de numeros tem ordem diferente em cada edital: "1 unidade
// 3 |FORNO" em Joinville/SC e quantidade, unidade e ITEM; "1 57651 UN 6 |AR
// CONDICIONADO" em Guimaranea/MG e item, codigo, unidade e QUANTIDADE; "02 01
// |GELADEIRA" em Trabiju/SP e item e quantidade. Nenhuma regra unica le as tres.
// Entao o verificador colhe as leituras que fazem sentido e so acusa quando o
// nosso numero nao e nenhuma delas.
function numeroDaLinha(antes, celula) {
  const leituras = [];
  const poe = n => { if (Number.isInteger(n) && !leituras.includes(n)) leituras.push(n); };
  if (ABRE_COM_UNIDADE.test(String(celula).trim())) {
    const m = antes.match(ITEM_QTD);
    if (m) poe(+m[1]);
  }
  for (const re of ABERTURAS) { const m = antes.match(re); if (m) { poe(+m[1]); break; } }
  // Numero seguido de codigo: em "459967 Unidade 27 2 8720 |BATEDEIRA"
  // (Campinas/SP) o 8720 e codigo e o item e o 2.
  { const m = antes.match(ABERTURAS[1]); if (m) poe(+m[1]); }
  // Sem a unidade e a quantidade do fim.
  if (UNIDADE_QTD.test(antes)) {
    const sem = antes.replace(UNIDADE_QTD, '');
    for (const re of [ABERTURAS[1], ABERTURAS[0]]) { const m = sem.match(re); if (m) { poe(+m[1]); break; } }
  }
  // Item e quantidade sem unidade: o primeiro dos dois.
  { const m = antes.match(ITEM_QTD); if (m) poe(+m[1]); }
  return leituras.length ? leituras : null;
}

let confere = 0, semPista = 0;
const diverge = [];
for (const ed of dd.editais) {
  const v = d.editais[ed[C.path]];
  if (!v || !(v.secoes || []).length) continue;
  const txt = (v.secoes || []).map(s => s.texto).join('  ');
  const plano = norm(txt);
  for (const it of ed[C.itens]) {
    const m = (v.itens || []).find(x => x[0] === it[5]);
    if (!m || !m[6]) continue;
    // Oitenta caracteres, e nao quarenta e cinco. Itens do mesmo produto
    // comecam igual — "Ar-condicionado, Split, quente e frio, 220V," e o inicio
    // dos itens 1 e 3 de Pinhal Grande/RS — e a agulha curta achava sempre a
    // PRIMEIRA linha, fazendo o verificador acusar divergencia onde a celula
    // estava certa. Em oitenta ja entra a capacidade, que separa os dois.
    const agulha = norm(m[6]).slice(0, 80);
    // TODAS as ocorrencias, e nao so a primeira. Item de cota principal e de
    // cota reservada tem o mesmo texto: Bento Goncalves/RS imprime "08 619109
    // APARELHO..." e "09 619109 APARELHO..." com a mesma descricao, e o
    // verificador, parando na primeira, acusava o item 9 de ser o 8.
    let n = null, k = -1, antes = '';
    for (let q = plano.indexOf(agulha), voltas = 0; q >= 1 && voltas < 20; q = plano.indexOf(agulha, q + 1), voltas++) {
      const a = txt.slice(Math.max(0, q - 40), q);
      let ls = numeroDaLinha(norm(a), m[6]);
      // A linha do Jaraguari/MS poe o nome do produto ENTRE o numero e a celula:
      // "3 014.001.167 APARELHO AR CONDICIONADO - 24.000 BTUS (CATJAR) UN 2
      // |CATMAT...". O numero fica longe demais para a janela de 40 caracteres.
      // Ancorada no codigo "014.001.167": sem ele a expressao casava cedo, no
      // "12" de "garantia minima de 12 meses".
      const longe = norm(txt.slice(Math.max(0, q - 160), q))
        .match(/(?:^|[\s|;])(\d{1,4})\s+\d{3}\.\d{3}\.\d{3}\s+[^()|]{3,90}\(catjar\)\s*(?:un\s*\d{1,5})?\s*$/);
      if (longe) ls = [...(ls || []), +longe[1]];
      if (ls === null) continue;
      const nq = ls.includes(it[5]) ? it[5] : ls[0];
      if (n === null || nq === it[5]) { n = nq; k = q; antes = a; }
      if (nq === it[5]) break;
    }
    if (n === null) { semPista++; continue; }
    // Grupo que recomeca a numeracao: "Grupo 02 - Eletrodomestico Item Objeto ...
    // 1 Ventiladores de Coluna - 50cm ... Unidade 180" e o item 5 da plataforma
    // em Sao Paulo/SP (edital 1081). Vale quando o cabecalho do grupo esta logo
    // antes e a quantidade da linha e a do PNCP.
    const grupoRecomeca = n !== it[5] && k >= 0
      && /\bgrupo\s*0?\d{1,2}\b/i.test(txt.slice(Math.max(0, k - 300), k))
      && new RegExp('(?:unidade|unid\\.?|und|un)\\s+0*' + it[1] + '(?!\\d)', 'i').test(txt.slice(k, k + m[6].length + 80));
    if (n === it[5] || grupoRecomeca) confere++;
    else diverge.push({
      onde: ed[C.municipio] + '/' + ed[C.uf], path: ed[C.path],
      mostramos: it[5], edital: n,
      rotulo: String(it[3]).replace(/\s+/g, ' ').slice(0, 60),
      contexto: '...' + antes.replace(/\s+/g, ' ').slice(-38) + ' |' + m[6].replace(/\s+/g, ' ').slice(0, 34),
    });
  }
}
console.log('numero confere com o edital: ' + confere);
console.log('sem numero legivel na linha: ' + semPista);
console.log('DIVERGE                    : ' + diverge.length);
for (const c of diverge) console.log('  ' + c.onde + ' · mostramos ' + c.mostramos + ' · edital diz ' + c.edital
  + '\n      ' + c.rotulo + '\n      ' + c.contexto);
