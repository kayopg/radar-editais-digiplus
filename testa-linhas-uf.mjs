// O que se cota em cada UF (LINHAS_DA_UF, no veto-item.mjs), com rotulos e
// descritivos reais da lista de 05/10/2026. Uso: node testa-linhas-uf.mjs
import fs from 'node:fs';
import { criaPosicaoDoTermo, criaCotaNaUf } from './veto-item.mjs';

const fonte = fs.readFileSync('varredura.mjs', 'utf8');
const iCat = fonte.indexOf('const CAT = [');
const CAT = eval(fonte.slice(iCat, fonte.indexOf('\n];', iCat) + 3).replace('const CAT = ', ''));
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
const cotaNaUf = criaCotaNaUf(criaPosicaoDoTermo(CAT));

// [uf, rotulo, descritivo, esperado, semDescritivo?]
const CASOS = [
  // DF, GO, MS e MG: ar-condicionado, bebedouro, fogao e batedeira industriais
  ['GO', 'AR CONDICIONADO SPLIT 12000 BTUS INVERTER', '', true],
  ['MG', 'CONDICIONADOR, de ar, tipo SPLIT INVERTER, CICLO FRIO, HI WALL', '', true],
  ['MS', 'APARELHO DE AR-CONDICIONADO SPLIT 9000 BTUS', '', true],
  ['MG', 'BEBEDOURO DE 150 LITROS INOX, CARACTERISTICAS: RESERVATORIO EM POLIPROPILENO', '', true],
  ['MG', 'BEBEDOURO 2 TORNEIRAS 50 LITROS AÇO INOX', 'BEBEDOURO 2 TORNEIRAS 50 LITROS AÇO INOX ESPECIFICAÇÃO: Bebedouro Água tipo: industrial, características adicionais: 2 torneiras', true],
  // o catalogo diz "tipo: industrial", o edital diz bebedouro de pressao (Dourados/MS)
  ['MS', 'Bebedouro Água tipo: industrial, características adicionais: 01 torneira e 01 torneira jato inclinado, suspenso', 'BEBEDOURO ACESSÍVEL EM INOX COM 2 TORNEIRAS Bebedouro de pressão de parede refrigerado adaptado para acessibilidade com duas torneiras', false],
  ['MS', 'Bebedouro Água tipo: industrial, características adicionais: 4 torneiras latão cromado', 'Bebedouro Industrial acessível em Inox com sensor infravermelho de acionamento da água.', true],
  ['MS', 'BEBEDOURO INDUSTRIAL 100 LITROS 3 TORNEIRAS', '', true],
  ['MG', 'BEBEDOURO DE PRESSÃO TIPO COLUNA, COM GABINETE EM AÇO INOX ESCOVADO', 'BEBEDOURO DE PRESSÃO TIPO COLUNA ... CAPACIDADE DE REFRIGERAÇÃO DE, NO MÍNIMO, 2,0 LITROS/HORA', false],
  ['GO', 'BEBEDOURO 02 TORNEIRAS: • CAPACIDADE MÍNIMA DE ARMAZENAMENTO DE 25 LITROS; • GABINETE ESTRUTURAL FABRICADO EM AÇO INOX 430', '', true],
  ['GO', 'BEBEDOURO DE COLUNA INDUSTRIAL INOX 25 LITROS 220V', '', true],
  ['MG', 'BEBEDOURO COM CAPACIDADE PARA 20 LITROS. Bebedouro refrigerado por compressor', '', false],
  ['GO', 'Bebedouro/Purificador Refrigerado Bebedouro de pressão, coluna simples, inox 30 litros/hora', '', false],
  ['GO', 'BEBEDOURO DE AGUA GELADA E NATURAL INOX TIPOS DE CARGA GARRAFAO DE 20 LITROS', '', false],
  ['GO', 'FOGÃO INDUSTRIAL 6 BOCAS COM FORNO', '', true],
  ['DF', 'Fogão Industrial características adicionais: 3 queimadores duplos', '', true],
  ['GO', 'FOGAO DE 4 BOCAS DE PISO COM ACENDIMENTO AUTOMATICO 220V', 'FOGAO DE 4 BOCAS DE PISO COM ACENDIMENTO AUTOMATICO 220V', false],
  ['MG', 'Fogão Gás material: aço inoxidável, aplicação: doméstica, tipo fogão: convencional', '', false],
  ['MG', 'BATEDEIRA PLANETÁRIA INDUSTRIAL, CAPACIDADE MÍNIMA 4 LITROS', '', true],
  ['GO', 'BATEDEIRA DOMESTICA 350W 3 VELOCIDADES 2 TIGELAS 220V', '', false],
  ['GO', 'FORNO DE MICROONDAS 34 LITROS 1300W', '', false],
  ['MG', 'VENTILADOR DE TETO 3 PÁS', '', false],
  ['GO', 'CORTINA DE AR 120 CM', '', false],
  ['GO', 'LIQUIDIFICADOR INDUSTRIAL 8 LITROS', '', false],
  ['MG', 'GELADEIRA FROST FREE 400 LITROS', '', false],
  ['DF', 'FORNO MICRO-ONDAS 30 LITROS', '', false],
  // SP: as mesmas, mais micro-ondas e ventilador
  ['SP', 'Forno Microondas capacidade: 32, potência: 900, voltagem: 220', '', true],
  ['SP', 'FORNO DE MICRO-ONDAS COM CAPACIDADE INTERNA BRUTA DE 20 LITROS', '', true],
  ['SP', 'Ventilador de teto com 3 pás de MDF, com luminária', '', true],
  ['SP', 'VENTILADOR DE PAREDE 60 CM', '', true],
  ['SP', 'Ar condicionado split 12000 BTUs', '', true],
  ['SP', 'BATEDEIRA PLANETÁRIA', 'BATEDEIRA PLANETÁRIA - Batedeira planetária de uso profissional ou semiprofissional, estrutura resistente', true],
  ['SP', 'Batedeira Doméstica capacidade: 4 a 5, características adicionais: tipo planetária', 'batedeira planetaria 600w', false],
  ['SP', 'Bebedouro de água de coluna, com capacidade de 100 litros, em aço inoxidável', '', true],
  ['SP', 'BEBEDOURO DE MESA', 'BEBEDOURO DE MESA, na cor branca, capacidade do reservatório de 2L', false],
  ['SP', 'Forno Elétrico aplicação: doméstica, voltagem: 220, capacidade: 44', '', false],
  ['SP', 'Fogão Elétrico tipo/modelo: rechaud k-pot 1/1, material: aço inoxidável', 'FOGÃO ELÉTRICO DE MESA COM 1 BOCA', false],
  ['SP', 'Climatizador evaporativo portátil com ventilador', '', false],
  ['SP', 'Refrigerador frost free 375 L', '', false],
  ['SP', 'SPLITTER OTICO 1X8 BALANCEADO COMPRIMENTO DE ONDA 1260 A 1650 NM', '', false],
  // MT: nada (saiu em 06/10/2026)
  ['MT', 'AR CONDICIONADO - Split 12.000 Btus Frio 220v', '', false],
  ['MT', 'BEBEDOURO INDUSTRIAL 100 LITROS', '', false],
  ['MT', 'CLIMATIZADOR EVAPORATIVO INDUSTRIAL', '', false],
  // RS, SC e PR: tudo
  ['RS', 'GELADEIRA FROST FREE 400 LITROS', '', true],
  ['PR', 'FORNO DE MICROONDAS 34 LITROS', '', true],
  // na varredura, sem descritivo: passa o que nao se diz domestico
  ['GO', 'BEBEDOURO 2 TORNEIRAS 50 LITROS AÇO INOX', '', true, true],
  ['GO', 'BEBEDOURO DE PRESSAO COLUNA', '', true, true],
  ['MG', 'FOGAO DOMESTICO 4 BOCAS', '', false, true],
  ['MG', 'VENTILADOR DE COLUNA 40 CM', '', false, true],
];

let erros = 0;
for (const [uf, rot, desc, esperado, semDesc] of CASOS) {
  const deu = cotaNaUf(uf, norm(rot), norm(desc), !!semDesc);
  const ok = deu === esperado;
  if (!ok) erros++;
  console.log(`${ok ? 'ok  ' : 'ERRO'} ${uf} ${deu ? 'fica' : 'sai '}${semDesc ? ' (varredura)' : ''} · ${rot.slice(0, 70)}`);
}
console.log(`\n${CASOS.length - erros} de ${CASOS.length} corretos`);
process.exitCode = erros ? 1 : 0;
