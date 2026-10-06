// Casos reais da marca de cota reservada (cota.mjs), da lista de 29/09/2026.
// Uso: node testa-cota.mjs
import { marcaCotas, norm } from './cota.mjs';

const lava = 'MÁQUINA LAVAR ROUPA, TIPO: AUTOMÁTICA, CAPACIDADE: 11 KG, APLICAÇÃO: DOMÉSTICA, MATERIAL CESTO: AÇO INOXIDÁVEL';
const fogao = a => `Fogão Industrial com 04 bocas com 01 forno de baixa pressão a gás. Estrutura de aço carbono, com pintura Epóxi. Queimadores fabricados em ferro fundido com ${a} padrão de dureza. 02 queimadores simples e 02 queimadores duplos. Capacidade do forno mínimo de 57 Litros.`;
const vent = 'VENTILADOR DE PAREDE 60 CM ESPECIFICAÇÃO: VENTILADOR DE PAREDE OSCILANTE, MÍNIMO 60 CM DE DIÂMETRO, 220 volts OU BIVOLT, COM PROTETOR TÉRMICO';
const liq = 'LIQUIDIFICADOR, CAPACIDADE: 3 L, POTÊNCIA: 1.200 W, VOLTAGEM: 220 V, USO: DOMÉSTICO, CARACTERÍSTICAS ADICIONAIS: 12 VELOCIDADES, COPO REFORÇADO.';
const split = 'CONDICIONADOR, de ar, tipo SPLIT INVERTER, CICLO FRIO, 12.000 BTUs, 220V';

const CASOS = [
  // [nome, itens [n, rotulo, qtd, unid, valor, beneficio, descritivo], corpo, esperado {n: marca}, limpo?]
  ['Avare/SP: PNCP sem beneficio 75 e exclusivo 25',
    [[1, 'Split', 75, 'UN', 2500, 'S', split], [2, 'Split', 25, 'UN', 2500, 'E', split]], '',
    { 1: 'P:2', 2: 'R:1' }],
  ['Santos/SP: os dois sem beneficio, a cota so no TR',
    [[1, 'Ventilador', 2387, 'UN', 218.94, 'S', vent], [2, 'Ventilador', 795, 'UN', 218.94, 'S', vent]],
    '(cota principal para ampla participacao) item descricao unid. quant. maxima 01 ...',
    { 1: 'P:2', 2: 'R:1' }],
  ['Vicosa/MG: a marca copiada no principal sai do descritivo',
    [[3, 'Lavar', 20, 'UN', 1922.96, 'N', lava + ' (COTA EXCLUSIVA PARA ME / EPP) Garantia de 12 meses'],
     [4, 'Lavar', 80, 'UN', 1922.96, 'S', lava + ' (COTA EXCLUSIVA PARA ME / EPP) Garantia de 12 meses']], '',
    { 3: 'R:4', 4: 'P:3' }, { 4: lava + ' Garantia de 12 meses' }],
  ['Viamao/RS: "alta" numa linha e "alto" na outra',
    [[1, 'Fogao', 35, 'UN', 2346.19, 'S', fogao('alta')], [2, 'Fogao 6', 20, 'UN', 3472.33, 'E', fogao('alta').replace('04', '06')],
     [3, 'Fogao', 12, 'UN', 2346.19, 'E', fogao('alto')]], '',
    { 1: 'P:3', 3: 'R:1' }],
  ['IFFar: COTA RESERVADA na linha da tabela, PNCP exclusivo',
    [[25, 'Cortina Ar', 31, 'UN', 729.88, 'E', 'CORTINA DE AR DE 120 CM, PARA INSTALAÇÃO HORIZONTAL SOBRE PORTAS']],
    norm('R$ 51.282,84 2 0 1 2 25 COTA RESERVADA (BENEFÍCIO TIPO III) 448184 CORTINA DE AR DE 120 CM, PARA INSTALAÇÃO HORIZONTAL SOBRE PORTAS UNIDADE 31'),
    { 25: 'R' }],
  ['Tuneiras/PR: o PNCP diz cota reservada',
    [[2, 'Split', 10, 'UN', 2000, 'C', split]], '', { 2: 'R' }],
  ['Codevasf/DF: o PNCP poe tudo em cota reservada; o menor de cada par e que e',
    [[2, 'Fogao', 10, 'UN', 2035.23, 'C', fogao('alta')], [8, 'Fogao', 1, 'UN', 2035.23, 'C', fogao('alta')],
     [14, 'Fogao', 10, 'UN', 2035.23, 'C', fogao('alta')], [20, 'Fogao', 1, 'UN', 2035.23, 'C', fogao('alta')]],
    'os grupos 2, 4, 6, 8, 10, 12, 14, 16 e 18 sao cotas de ate 25% destinados para as microempresas',
    { 2: 'P', 8: 'R', 14: 'P', 20: 'R' }],
  // tem de ficar sem marca
  ['Minacu/GO: dois liquidificadores iguais de 3 e 10, sem cota no edital',
    [[48, 'Liq', 3, 'UN', 332.82, 'S', liq], [49, 'Liq', 10, 'UN', 332.82, 'S', liq]],
    'visando propiciar a ampla participacao de licitantes', {}],
  ['Mariopolis/PR: quantidades iguais',
    [[65, 'Liq', 6, 'UN', 900, 'E', liq], [66, 'Liq', 6, 'UN', 900, 'E', liq]], 'cota reservada', {}],
  ['os dois exclusivos, sem texto de ampla',
    [[1, 'Split', 30, 'UN', 2500, 'E', split], [2, 'Split', 10, 'UN', 2500, 'E', split]], 'cota reservada', {}],
  ['precos diferentes nao sao o mesmo item',
    [[1, 'Split', 30, 'UN', 2500, 'S', split], [2, 'Split', 10, 'UN', 3100, 'E', split]], '', {}],
  ['exclusivo do PNCP sozinho nao e cota',
    [[7, 'Split', 10, 'UN', 2500, 'E', split]], '', {}],
];

let erros = 0;
for (const [nome, itens, corpo, esperado, limpo = {}] of CASOS) {
  const { marcas, limpos } = marcaCotas(itens, corpo);
  const obtido = Object.fromEntries([...marcas].map(([n, m]) => [n, m]));
  const obtLimpo = Object.fromEntries(limpos);
  const ok = JSON.stringify(obtido) === JSON.stringify(Object.fromEntries(Object.entries(esperado)))
    && JSON.stringify(obtLimpo) === JSON.stringify(limpo);
  if (!ok) erros++;
  console.log(`${ok ? 'ok  ' : 'ERRO'} ${nome}${ok ? '' : `\n     esperado ${JSON.stringify(esperado)} ${JSON.stringify(limpo)}\n     obtido   ${JSON.stringify(obtido)} ${JSON.stringify(obtLimpo)}`}`);
}
console.log(`\n${CASOS.length - erros} de ${CASOS.length} corretos`);
process.exitCode = erros ? 1 : 0;
