// Casos da regra de exigencias (exigencias.mjs): o que barra e o que nao.
// Os que nao barram sao trechos reais de editais do RS barrados por engano em
// 05/10/2026 — 13 dos 14 do dia eram falso positivo, entre eles o pregao de
// eletrodomesticos de R$ 6,2 milhoes de Porto Alegre/RS.
// Uso: node testa-exigencias-casos.mjs
import { analisaExigencias } from './exigencias.mjs';

const BARRA = [
  ['Sera exigida a apresentacao de amostra do produto no prazo de 5 dias uteis apos a convocacao.', ['Amostra']],
  ['A amostra devera ser entregue em ate 48 horas apos a solicitacao do pregoeiro, no almoxarifado.', ['Amostra']],
  ['O licitante vencedor devera apresentar amostra dos itens 1 a 5, sob pena de desclassificacao.', ['Amostra']],
  ['As amostras deverao ser entregues no prazo de 5 dias uteis, na embalagem original, no almoxarifado central.', ['Amostra']],
  ['Sera exigida garantia de execucao do contrato de 5% do valor inicial.', ['Garantia contratual']],
  ['A contratada devera prestar garantia contratual no percentual de 5% do valor do contrato.', ['Garantia contratual']],
  ['7.2 garantia de execucao do contrato sera exigida garantia de execucao do contrato, nos moldes do arts. 96 a 102 da lei, em valor correspondente a 5 % do valor total do contrato? ( ) nao (x) sim', ['Garantia contratual']],
  ['E obrigatoria a apresentacao de carta de solidariedade do fabricante junto a proposta.', ['Carta de solidariedade']],
  // o campo do quadro-resumo respondido "sim"
  ['valor estimado r$ 100.000,00. exigencia de amostra? forma de adjudicacao sim por item itens exclusivos para me/epp? nao', ['Amostra']],
  ['garantia de execucao (caucao): sim. no percentual de 5% do valor do contrato.', ['Garantia contratual']],
];
const PASSA = [
  // quadro marcado "nao" (Redentora e Humaita/RS)
  '7.1 bens pereciveis (x) nao ( ) sim 7.2 garantia de execucao do contrato sera exigida garantia de execucao do contrato, nos moldes do arts. 96 a 102 da lei nº 14.133/21, em valor correspondente a 5 % do valor total do contrato? (x) nao ( ) sim 8 da entrega',
  // a negacao com o artigo (Terra de Areia/RS)
  '2.1. garantia da contratacao nao havera a exigencia da garantia da contratacao conforme os arts. 96 e seguintes da nllc. 2.1.2 nao devera ser adotada',
  // a garantia do produto (Porto Alegre/RS, 308)
  'o prazo de garantia e de 02 (dois) anos. 3.6. o periodo de garantia contratual sera contado a partir da data da aceitacao definitiva do(s) material(is).',
  // a clausula padrao da AGU, condicional (Mato Leitao, Tres Passos, Nao-Me-Toque/RS)
  '8.11 caso a compatibilidade com as especificacoes demandadas, sobretudo quanto a padroes de qualidade e desempenho, nao possa ser aferida pelos meios previstos nos subitens acima, o pregoeiro exigira que o licitante classificado em primeiro lugar apresente amostra, sob pena de nao aceitacao da proposta, no local a ser indicado.',
  // o destino da amostra que tiver sido pedida (Mato Leitao/RS)
  '8.11.6 apos a divulgacao do resultado final da licitacao, as amostras entregues deverao ser recolhidas pelos licitantes no prazo de 4 dias, apos o qual poderao ser descartadas pela administracao.',
  // a amostra que e o produto (Vacaria/RS)
  'saco esteril para coleta de amostras de alimentos com tarja para identificacao, destinado a coleta, identificacao, transporte e armazenamento de amostras de alimentos em cozinhas industriais.',
  // a referencia ao que foi exigido em outro lugar (Porto Alegre/RS, 340)
  '9.1. e permitida a subcontratacao, inclusive em relacao as parcelas para as quais tenha sido exigida a apresentacao de capacidade tecnica ou prova de conceito, sem prejuizo das responsabilidades.',
  // a lista de custos (Sao Joao d'Alianca/GO)
  '9.8 responsabilizarem-se pelas despesas dos tributos, encargos trabalhistas, fretes, seguros, deslocamento de pessoal, prestacao de garantia e quaisquer outras que incidam 9.9 todos os itens deverao ser transportados',
  // o quadro-resumo respondido "nao" (Codevasf, edital 53/2026)
  'valor estimado r$ 3.768.339,30 (tres milhoes, setecentos e sessenta e oito mil, trezentos e trinta e nove reais e trinta centavos). exigencia de amostra? forma de adjudicacao nao por grupo itens exclusivos para me/epp? itens com cota reservada para me/epp? dec. nº 7.174/2010? nao sim nao modo de disputa',
  'para o indice setorial foi escolhido o que representa o indicador mais proximo da efetiva variacao dos precos dos bens a serem fornecidos. garantia de execucao (caucao): nao. justifica-se por ser tratar de fornecimentos com pagamento a pronta entrega. a nao exigencia de garantia para contratos administrativos se justifica por facilitar o processo de contratacao',
];
let erros = 0;
for (const [t, esp] of BARRA) {
  const r = analisaExigencias([t]).bloqueia;
  const ok = JSON.stringify(r) === JSON.stringify(esp);
  if (!ok) erros++;
  console.log(`${ok ? 'ok  ' : 'ERRO'} barra ${JSON.stringify(r)} | ${t.slice(0, 70)}`);
}
for (const t of PASSA) {
  const r = analisaExigencias([t]).bloqueia;
  const ok = !r.length;
  if (!ok) erros++;
  console.log(`${ok ? 'ok  ' : 'ERRO'} passa ${JSON.stringify(r)} | ${t.slice(0, 70)}`);
}
console.log(`\n${BARRA.length + PASSA.length - erros} de ${BARRA.length + PASSA.length} corretos`);
process.exitCode = erros ? 1 : 0;
