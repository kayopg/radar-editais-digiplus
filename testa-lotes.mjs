// Casos da leitura de lotes (lotes.mjs): o grupo pela tabela do termo de
// referencia e o que ele tem de recusar.
// Uso: node testa-lotes.mjs   (sai com codigo 1 se algum caso falhar)
import { lotesPelaTabelaDeGrupo } from './lotes.mjs';

// beneficio e quantidade de cada item, na ordem
const itens = (...b) => b.map(([benef, qtd], k) => ({ n: k + 1, benef, qtd }));
const divisao = m => m ? [...m.entries()].map(([n, g]) => n + ':' + g).join(' ') : null;

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
];

let erros = 0;
for (const [nome, res, esperado] of CASOS) {
  const ok = divisao(res) === esperado;
  if (!ok) erros++;
  console.log(`${ok ? 'ok   ' : 'ERRO '} ${nome}${ok ? '' : `\n        saiu    : ${divisao(res)}\n        esperado: ${esperado}`}`);
}
console.log(`\n${CASOS.length - erros} de ${CASOS.length} corretos`);
process.exit(erros ? 1 : 0);
