// Casos da leitura de lotes (lotes.mjs): se o edital e por lote, e cada jeito
// de achar o lote de cada item — e o que cada um tem de recusar.
// Uso: node testa-lotes.mjs   (sai com codigo 1 se algum caso falhar)
import { lotesPelaTabelaDeGrupo, vendaPorLote, lotesPeloRotulo, lotesPelaColunaDoLote, lotesPelaLinhaComLote, lotesPorFaixa, lotesPorSecao,
  totaisPorLote, lotesPelosTotais, lotesLoteUnico, lotesPelaTabelaLoteItem, lotesPeloTextoDoItem, lotesPorFaixaDeItens, lotesPorSecaoComItem,
  lotesPelaLinhaLoteNome, lotesUmItemPorLote, lotesPelaTabelaLoteItemNome, lotesPeloCabecalhoDoGrupo } from './lotes.mjs';

// beneficio e quantidade de cada item, na ordem
const itens = (...b) => b.map(([benef, qtd], k) => ({ n: k + 1, benef, qtd }));
const divisao = m => typeof m === 'string' ? m : m ? [...m.entries()].map(([n, g]) => n + ':' + g).join(' ') : null;

// a tabela de Caxias do Sul/RS, pregao 145/2026 (09/10/2026), com as duas copias
// do edital: no termo, as linhas da grade sem o numero da linha de cima
const CAXIAS = 'ANEXO I - DO TERMO DE REFERENCIA GRUPO ITEM COD. GRP DESCRICAO DO(S) ITEM(NS) UN. QTD. PRECO MAXIMO UNITARIO PARTICIPACAO LC N.o 123/06 '
  + '1 1 61264 APARELHO DE AR CONDICIONADO TIPO SPLIT 9.000 BTU/H UN 24 R$ 3.203,02 Nao se aplica 2 67021 GRADE DE FERRO PARA PROTECAO UN 24 R$ 469,21 Nao se aplica '
  + '2 3 61265 APARELHO DE AR CONDICIONADO TIPO SPLIT 12.000 BTU/H UN 1 R$ 3.286,24 Exclusivo 4 67021 GRADE DE FERRO PARA PROTECAO UN 1 R$ 469,21 Exclusivo '
  + '1.1.1. Da divisao da licitacao: Adjudicacao por grupo. (minuta) Grupo Item Codigo GRP Descricao do objeto Un. Qtd. Valor Unitario '
  + '1 1 61264 APARELHO DE AR CONDICIONADO TIPO SPLIT 9.000 BTU/H UN 24 24 2 67021 GRADE DE FERRO PARA PROTECAO UN 24 '
  + '2 3 61265 APARELHO DE AR CONDICIONADO TIPO SPLIT 12.000 BTU/H UN 1 1 4 67021 GRADE DE FERRO PARA PROTECAO UN 1';

const CASOS = [
  ['Caxias do Sul 145: grupo 1 = itens 1 e 2, grupo 2 = itens 3 e 4', lotesPelaTabelaDeGrupo(itens(['N', 24], ['N', 24], ['E', 1], ['E', 1]), CAXIAS), '1:1 2:1 3:2 4:2'],
  // o grupo exclusivo de ME/EPP e todo exclusivo: beneficio misturado recusa
  ['beneficio misturado no grupo recusa', lotesPelaTabelaDeGrupo(itens(['N', 24], ['E', 24], ['E', 1], ['E', 1]), CAXIAS), null],
  // item do PNCP que a tabela nao traz recusa
  ['item a mais no PNCP recusa', lotesPelaTabelaDeGrupo(itens(['N', 24], ['N', 24], ['E', 1], ['E', 1], ['E', 1]), CAXIAS), null],
  // "Sem grupo" na coluna (Instituto Federal, 10648539000105/2026/227)
  ['"Sem grupo" recusa', lotesPelaTabelaDeGrupo(itens(['N', 2], ['N', 2]), 'GRUPO ITEM CATMAT DESCRICAO DETALHADA UNIDADE QUANTIDADE Sem grupo 1 451529 Refresqueira industrial UNIDADE 2 R$5.933,33 Sem grupo 2 304634 Descascador industrial UNIDADE 2'), null],
  // a quantidade 2 da linha de cima antes do item 2: grupo ou quantidade? recusa
  ['quantidade igual ao proximo grupo recusa', lotesPelaTabelaDeGrupo(itens(['N', 2], ['N', 2]), 'GRUPO ITEM COD 1 1 61264 APARELHO DE AR UN 2 2 67021 GRADE DE FERRO UN 2'), null],
  // copias que discordam recusam
  ['copias que discordam recusam', lotesPelaTabelaDeGrupo(itens(['N', 5], ['N', 3], ['N', 1], ['N', 1]),
    'GRUPO ITEM COD 1 1 61264 APARELHO DE AR UN 5 2 2 67021 GRADE DE FERRO UN 3 7 3 61265 APARELHO DE AR UN 1 4 67021 GRADE UN 1 '
    + 'GRUPO ITEM COD 1 1 61264 APARELHO DE AR UN 5 7 2 67021 GRADE DE FERRO UN 3 2 3 61265 APARELHO DE AR UN 1 4 67021 GRADE UN 1'), null],
  // --- se o edital e por lote: vale o criterio que ele DECLARA (09/10/2026)
  ['"menor preco por item" declarado, com a lei citada sobre grupo: nao e por lote', vendaPorLote('o criterio de julgamento de menor preco por grupo de itens somente podera ser adotado quando demonstrada a inviabilidade. o criterio de julgamento sera o menor preco por item.') ? 'sim' : null, null],
  ['"julgamento: menor preco global por lote": e por lote', vendaPorLote('6.1 julgamento: menor preco global por lote, conforme anexo i') ? '1:1' : null, '1:1'],
  ['"nao se justifica a adjudicacao por grupo" + "menor preco por item": nao e por lote', vendaPorLote('nao se justifica a adjudicacao por grupo. tipo: menor preco por item') ? 'sim' : null, null],
  // --- o lote no nome do item (Cruzaltense/RS)
  ['rotulo "LOTE 9 - ..." em todos os itens', lotesPeloRotulo([{ n: 1, rot: 'LOTE 9 - Telha de fibrocimento' }, { n: 2, rot: 'LOTE 2 - Fogao industrial - 6 bocas' }, { n: 3, rot: 'LOTE 2 - Botijao' }]), '1:9 2:2 3:2'],
  ['um rotulo sem o lote recusa', lotesPeloRotulo([{ n: 1, rot: 'LOTE 1 - Mesa' }, { n: 2, rot: 'Fogao industrial' }]), null],
  // --- a coluna do lote (Sapiranga/RS)
  ['coluna "Lote Un Quant": linha k = item k com a mesma quantidade', lotesPelaColunaDoLote([{ n: 1, qtd: 2 }, { n: 2, qtd: 3 }, { n: 3, qtd: 1 }], 'Lote Un Quant. Descricao dos Itens 1 Un 02 APARELHO DE AR CONDICIONADO 2 Un 03 AUTOCLAVE HORIZONTAL 2 Un 01 SELADORA'), '1:1 2:2 3:2'],
  ['quantidade diferente recusa', lotesPelaColunaDoLote([{ n: 1, qtd: 2 }, { n: 2, qtd: 4 }], 'Lote Un Quant. Descricao 1 Un 02 APARELHO DE AR 2 Un 03 AUTOCLAVE'), null],
  // --- a linha com o lote e a numeracao do edital (Tupi Paulista/SP)
  ['linha "LOTE04 81 02.01333 - NOME QTD UN Ampla", pelo nome e pela quantidade', lotesPelaLinhaComLote([{ n: 1, rot: 'LAMPADA LED 20 W', qtd: 528 }, { n: 2, rot: 'VENTILADOR TETO 3 PAS', qtd: 20 }],
    'LOTE01 129 02.06330 - LAMPADA LED 20 W 528 PÇ Ampla Concorrencia LOTE04 81 02.01333 - VENTILADOR TETO 3 PAS 20 UN Ampla Concorrencia lote06 3 02.0001 - OUTRO 1 UN Ampla Concorrencia'), '1:1 2:4'],
  ['quantidade que nao bate recusa', lotesPelaLinhaComLote([{ n: 1, rot: 'LAMPADA LED 20 W', qtd: 500 }, { n: 2, rot: 'VENTILADOR TETO 3 PAS', qtd: 20 }],
    'LOTE01 129 02.06330 - LAMPADA LED 20 W 528 PÇ Ampla Concorrencia LOTE04 81 02.01333 - VENTILADOR TETO 3 PAS 20 UN Ampla Concorrencia'), null],
  // --- as faixas de itens (Sao Paulo/SP, pregao 33)
  ['faixas "1 01 ao 03" e "02 Itens 04 ao 06"', lotesPorFaixa([1, 2, 3, 4, 5, 6].map(n => ({ n, benef: n <= 3 ? 'E' : 'S' })),
    'LOTE ITEM OBJETO VALOR 1 01 ao 03 Materiais Permanentes 25% EXCLUSIVA LOTE ITEM OBJETO 02 Itens 04 ao 06 Materiais 75% AMPLA'), '1:1 2:1 3:1 4:2 5:2 6:2'],
  ['beneficio misturado no lote recusa', lotesPorFaixa([1, 2, 3, 4, 5, 6].map(n => ({ n, benef: n === 2 ? 'S' : 'E' })),
    'LOTE ITEM OBJETO 1 01 ao 03 Materiais LOTE ITEM OBJETO 02 Itens 04 ao 06 Materiais'), null],
  // --- as secoes com os itens renumerados (Ivai/PR): no lote 2 a ordem do
  // edital nao e a do PNCP (freezer antes da batedeira)
  ['secoes "LOTE 01 - TITULO" com "1. NOME", ordem trocada dentro do lote', lotesPorSecao([{ n: 1, rot: 'COMPUTADOR COMPLETO' }, { n: 2, rot: 'NOTEBOOK CORPORATIVO' }, { n: 3, rot: 'BATEDEIRA PLANETARIA' }, { n: 4, rot: 'FREEZER VERTICAL' }],
    'LOTE 01 - INFORMATICA ITEM PRODUTO 1. COMPUTADOR COMPLETO memoria 2. NOTEBOOK CORPORATIVO tela LOTE 02 - COZINHA ITEM PRODUTO 1. FREEZER VERTICAL tipo 2. BATEDEIRA PLANETARIA tipo'), '1:1 2:1 3:2 4:2'],
  ['posicao pulada na secao recusa', lotesPorSecao([{ n: 1, rot: 'COMPUTADOR COMPLETO' }, { n: 2, rot: 'FREEZER VERTICAL' }],
    'LOTE 01 - INFORMATICA 2. COMPUTADOR COMPLETO memoria LOTE 02 - COZINHA 1. FREEZER VERTICAL tipo'), null],
  // --- as formas de 21/10/2026
  // o total geral depois do ultimo lote nao e o total dele (Mondai/SC)
  ['total geral depois do ultimo cabecalho nao vira o lote', lotesPelosTotais([{ n: 1, total: 10 }, { n: 2, total: 20 }],
    totaisPorLote('LOTE 1 1 ARADO UN 1 R$ 10,00 LOTE 2 1 GRADE UN 1 R$ 20,00 TOTAL 30,00')), null],
  // a lista "Lote 01 - R$ ... Lote 02 - R$ ..." (Santos/SP)
  ['lista "Lote 01 - R$ x. Lote 02 - R$ y."', lotesPelosTotais([{ n: 1, total: 10 }, { n: 2, total: 5 }, { n: 3, total: 7 }],
    totaisPorLote('Valor total estimado da Contratacao: Lote 01 - R$ 15,00. Lote 02 - R$ 7,00. Criterio')), '1:1 2:1 3:2'],
  ['"lote unico" (Santa Cruz do Sul/RS)', lotesLoteUnico([{ n: 1 }, { n: 2 }], 'A licitacao sera realizada em lote unico, formados por 2 itens'), '1:1 2:1'],
  ['"nao havera lote unico" recusa', lotesLoteUnico([{ n: 1 }, { n: 2 }], 'nao havera lote unico nesta licitacao'), null],
  ['tabela "LOTE ITEM" com o lote em toda linha (Sao Carlos/SP)', lotesPelaTabelaLoteItem([{ n: 1 }, { n: 2 }, { n: 3 }],
    'LOTE ITEM DESCRICAO UNIDADE QTD. 1 1 Fritadeira eletrica UN 2 1 2 Forno eletrico UN 1 2 3 Geladeira UN 1'), '1:1 2:1 3:2'],
  ['lote no texto do item, "[LOTE 02]" (Embrapa 45)', lotesPeloTextoDoItem([{ n: 1, rot: 'FORNO [LOTE 01]' }, { n: 2, rot: 'GELADEIRA', x: [2, '', 1, 'UN', 1, '', 'Item 2 do TR – Lote 02. Especificacao'] }]), '1:1 2:2'],
  ['faixas "GRUPO 1 – ... – itens 1 a 2 e 4" (Embrapa 10)', lotesPorFaixaDeItens([1, 2, 3, 4].map(n => ({ n })),
    'GRUPO 1 – Material eletrico – ND 3.3.90.30.26 – itens 1 a 2 e 4 GRUPO 2 – Material de copa – itens 3'), '1:1 2:1 3:2 4:1'],
  ['item sem faixa recusa', lotesPorFaixaDeItens([1, 2, 3].map(n => ({ n })), 'GRUPO 1 – Material – itens 1 a 2'), null],
  // os "ITENS NAO AGRUPADOS" do fim nao sao do ultimo grupo (Pelotas/RS)
  ['secoes "GRUPO N - TITULO ITEM DESCRICAO n" e os nao agrupados (Pelotas)', lotesPorSecaoComItem([1, 2, 3, 4, 5].map(n => ({ n })),
    'GRUPO 2 - MESAS ITEM DESCRIÇÃO 2 MESA DE TRABALHO GRUPO 3 - BEBEDOUROS ITEM DESCRIÇÃO 3 BEBEDOURO TIPO PRESSAO 4 BEBEDOURO DE GARRAFAO ITENS NÃO AGRUPADOS E ACESSÓRIOS ITEM DESCRIÇÃO 5 AQUECEDOR'), '1:1 2:2 3:3 4:3 5:0'],
  // "Grupo N ITEM DESCRICAO", a folha antes do primeiro item e os avulsos entre os grupos (Codevasf, Brasilia/DF, edital 85)
  ['cabecalho "Grupo N ITEM DESCRICAO" e itens avulsos (Codevasf 85)', lotesPeloCabecalhoDoGrupo([1, 2, 3, 4, 5, 6].map(n => ({ n })),
    'distribuídos em 2 (dois) grupos e 2 (dois) itens avulsos Grupo 1 ITEM DESCRIÇÃO CATMAT/CATSER UNIDADE QUANTIDADE 1 Rede Pesca und 199 2 Balança und 1 Itens Avulsos ITEM DESCRIÇÃO UNIDADE QUANTIDADE 3 Aerador und 9 Grupo 2 ITEM DESCRIÇÃO UNIDADE QUANTIDADE e-DOC A55A Territorial 6 4 Rede Pesca und 9 5 Balança und 1 Itens Avulsos ITEM DESCRIÇÃO UNIDADE QUANTIDADE 6 Aerador'), '1:1 2:1 3:0 4:2 5:2 6:0'],
  ['grupos com o avulso sem cabecalho recusa (Codevasf 65)', lotesPeloCabecalhoDoGrupo([1, 2, 3].map(n => ({ n })),
    'distribuídos em 2 (dois) grupos e 1 (um) itens Grupo 1 10 ITEM CATMAT DESCRIÇÃO UNIDADE 1 614017 Ralador Grupo 2 1 ITEM CATMAT DESCRIÇÃO 2 614017 Ralador 3 Maquinas'), null],
  // "LOTE N 1 NOME", o lote de varios itens e o numero da folha no meio (Mondai/SC)
  ['linha "LOTE N 1 NOME" e "k NOME" (Mondai)', lotesPelaLinhaLoteNome([{ n: 1, rot: 'ARADO ALEIRADOR DE DISCO' }, { n: 2, rot: 'GUINDASTE (CANIVETE) ARTICULADO' }, { n: 3, rot: 'CACAMBA BASCULANTE PARA CAMINHAO' }, { n: 4, rot: 'TRITURADOR PARA CAMA DE AVIARIO' }],
    'LOTE 1 1 ARADO ALEIRADOR DE DISCO, com estrutura UN 05 R$ 7.952,19 LOTE 2 1 GUINDASTE (CANIVETE) ARTICULADO UN 1 2 CACAMBA BASCULANTE PARA CAMINHAO UN 1 LOTE 3 49 1 TRITURADOR PARA CAMA DE AVIARIO'), '1:1 2:2 3:2 4:3'],
  ['um item por lote, "LOTE k NOME" (Rio Branco do Ivai)', lotesUmItemPorLote([{ n: 1, rot: 'CAPOTRASTE BRACADEIRA' }, { n: 2, rot: 'PALHETA 1.2MM' }, { n: 3, rot: 'ESTANTE DE PARTITURA' }],
    'LOTE 1 CAPOTRASTE BRACADEIRA UNID 21 LOTE 2 PALHETA 1.2MM MATERIAL UNID 100 LOTE 3 ESTANTE EM PARTITURA'), '1:1 2:2 3:3'],
  ['lote de dois itens nao e "um item por lote"', lotesUmItemPorLote([{ n: 1, rot: 'CAPOTRASTE BRACADEIRA' }, { n: 2, rot: 'PALHETA 1.2MM' }],
    'LOTE 1 ITEM DESCRICAO 1 CAPOTRASTE BRACADEIRA 2 PALHETA 1.2MM'), null],
  ['tabela "LOTE ITEM" com o lote so na primeira linha e o nome abreviado (Cocal do Sul)', lotesPelaTabelaLoteItemNome([{ n: 1, rot: 'CALHA FLUORESCENTE 1 X 20W' }, { n: 2, rot: 'CALHA FLUOR. 40W' }, { n: 3, rot: 'CANALETA PVC' }, { n: 4, rot: 'INTER. EMB.' }],
    'LOTE ITEM DESCRICAO QTD UN VALOR 1 1 CALHA FLUORESCENTE SOBREPOR 50 PC 23,60 1.180,00 R$ 2.637,00 2 CALHA FLUORESCENTE 1 X 40W 50 PC 29,14 1.457,00 2 3 CANALETA PVC COM TAMPA 1500 BR 16,83 25.245,00 R$ 25.939,00 4 INTERUPTOR EMBUTIR 50 UN 13,88 694,00'), '1:1 2:1 3:2 4:2'],
  ['"divisao dos itens em grupos constitui a alternativa": e por grupo (Pelotas)', vendaPorLote('a analise realizada indicou que a divisao dos itens em grupos constitui a alternativa mais adequada') ? '1:1' : null, '1:1'],
  ['"por item" declarado mais vezes que um "por lote" de outro processo colado no PDF (Palmas): nao e', vendaPorLote('tipo de julgamento: menor preco por item. criterio de julgamento: menor preco por item. politica publica compra mercedes tipo: menor preco por lote objeto') ? 'sim' : null, null],
  ['"nao havera agrupamento dos itens em lotes": nao e',vendaPorLote('1.3. do agrupamento de itens em lotes nao havera agrupamento dos itens em lotes, sendo adotado') ? 'sim' : null, null],
];

let erros = 0;
for (const [nome, res, esperado] of CASOS) {
  const ok = divisao(res) === esperado;
  if (!ok) erros++;
  console.log(`${ok ? 'ok   ' : 'ERRO '} ${nome}${ok ? '' : `\n        saiu    : ${divisao(res)}\n        esperado: ${esperado}`}`);
}
console.log(`\n${CASOS.length - erros} de ${CASOS.length} corretos`);
process.exit(erros ? 1 : 0);
