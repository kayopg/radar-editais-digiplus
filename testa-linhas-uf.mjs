// O que se cota em cada UF, com rotulos e descritivos reais. Uso: node
// testa-linhas-uf.mjs. Desde 20/10/2026 so MT tem restricao (LINHAS_DA_UF, no
// veto-item.mjs): os casos de AGORA, no fim, conferem isso. Os de antes conferem
// a tabela de 05/10 a 20/10 (LINHAS_DE_05_10), que fica para o caso de o usuario
// voltar a restringir alguma UF.
import fs from 'node:fs';
import { criaPosicaoDoTermo, criaCotaNaUf, LINHAS_DE_05_10 } from './veto-item.mjs';

const fonte = fs.readFileSync('varredura.mjs', 'utf8');
const iCat = fonte.indexOf('const CAT = [');
const CAT = eval(fonte.slice(iCat, fonte.indexOf('\n];', iCat) + 3).replace('const CAT = ', ''));
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
const cotaAntes = criaCotaNaUf(criaPosicaoDoTermo(CAT), LINHAS_DE_05_10);
const cotaAgora = criaCotaNaUf(criaPosicaoDoTermo(CAT));

// [uf, rotulo, descritivo, esperado, semDescritivo?]
const CASOS = [
  // DF, GO, MS e MG: ar-condicionado, bebedouro, fogao e batedeira industriais
  ['GO', 'AR CONDICIONADO SPLIT 12000 BTUS INVERTER', '', true],
  // a lavadora de alta pressao, de qualquer porte, nas cinco UFs (08/10/2026)
  ['SP', 'LAVADORA ALTA PRESSÃO - COTA RESERVADA', '', true],                       // Salto/SP
  ['MG', 'Lavadora Alta Pressão tipo: hidrolavadora, tipo motor: trifásico', '', true], // Ressaquinha/MG
  ['MS', 'LAVADORA DE ALTA PRESSÃO - ALIMENTAÇÃO: ELÉTRICA; PRESSÃO MÍNIMA: 1600 LIBRAS', '', true], // Caarapó/MS
  ['GO', 'Lavadora Alta Pressão tipo: lava-jato, modelo: monofásico, tensão: 110/220', '', true], // Itaberaí/GO
  ['SP', 'LAVADORA JATO DE ALTA PRESSÃO, para uso semi-profissional, motor: 1,6 cv', '', true], // Birigui/SP
  ['DF', 'MÁQUINA LAVADORA DE ALTA PRESSÃO 1800 PSI', '', true],
  ['SP', 'Máquina de lavar roupas automática 12 kg', '', false],                    // a de roupa continua fora
  // a mesa inox e a balanca nas cinco UFs (15/10/2026)
  ['SP', 'MESA DE TRABALHO AÇO INOX 1,90X70X70CM. TOTAL INOX 304', '', true],
  ['GO', 'Mesa Manipulação / Preparação Alimentos material tampo: aço inoxidável, material estrutura: tubular', '', true],
  ['MG', 'BALANÇA DIGITAL PARA ALIMENTOS – capacidade máxima de pesagem de 40 kg', '', true],
  ['DF', 'Balança Eletrônica Balança Eletrônica, Tipo:Digital, Tipo Painel:Cristal Líquido', '', true],
  ['MS', 'Mesa Copa/Cozinha material mesa: madeira, forma mesa: retangular', '', false],   // sem inox nao e mesa inox
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
  ['DF', 'FORNO MICRO-ONDAS 30 LITROS', '', false],
  // 09/10/2026: forno industrial, refrigeracao, liquidificador industrial e
  // climatizador entram em DF, GO, MS e MG (Joao Pinheiro/MG, edital 060/2026)
  ['GO', 'LIQUIDIFICADOR INDUSTRIAL 8 LITROS', '', true],
  ['MG', 'GELADEIRA FROST FREE 450 LITROS OU SUPERIOR', 'Especificações mínimas: - Refrigerador doméstico de duas portas; - Sistema de degelo automático tipo Frost Free', true],
  ['MG', 'GELADEIRA FROST FREE 400 LITROS', '', true],
  ['MG', 'FREEZER HORIZONTAL COMERCIAL/INDUSTRIAL CONVERSÍVEL EM REFRIGERADOR - CAPACIDADE MÍNIMA DE 540 LITROS', '', true],
  ['DF', 'FREEZER VERTICAL CONVERSÍVEL EM REFRIGERADOR - CAPACIDADE MÍNIMA DE 500 LITROS', '', true],
  ['MS', 'Refrigerador frost free 375 L', '', true],
  ['GO', 'FRIGOBAR 120 LITROS', '', true],
  ['MG', 'FORNO INDUSTRIAL A GÁS - CAPACIDADE MÍNIMA DE 98 LITROS', 'Especificações mínimas: - Capacidade mínima de 98 litros; - Funcionamento a gás GLP de baixa pressão', true],
  ['GO', 'Forno Elétrico aplicação: doméstica, voltagem: 220, capacidade: 44', '', false],
  ['MG', 'FORNO ELÉTRICO DE BANCADA 44 LITROS', 'Forno elétrico de bancada, 44 litros, 220 V, timer de 120 minutos', false],
  ['MG', 'LIQUIDIFICADOR INDUSTRIAL DE BAIXA ROTAÇÃO - CAPACIDADE MÍNIMA DE 8 LITROS', 'Liquidificador industrial de baixa rotação, destinado ao processamento de alimentos', true],
  ['GO', 'LIQUIDIFICADOR DOMÉSTICO 3 LITROS 1200W', '', false],
  ['MS', 'Liquidificador comercial 8 litros com copo inox monobloco bivolt', 'Liquidificador comercial 8 litros com copo inox monobloco bivolt', true],   // Caarapó/MS
  ['MS', 'LIQUIDIFICADOR W 4 LITROS BAIXA ROTAÇÃO - SPOLU POTÊNCIA MÁXIMA 700W', 'LIQUIDIFICADOR W 4 LITROS BAIXA ROTAÇÃO - SPOLU POTÊNCIA MÁXIMA 700W TENSÃO BIVOLT', true],
  ['MG', 'LIQUIDIFICADOR 8 LITROS, TENSAO 127 OU 220 (CHAVE DE REVERSAO), POTENCIA: 800W', 'LIQUIDIFICADOR 8 LITROS, TENSÃO 127 OU 220 (CHAVE DE REVERSÃO), POTÊNCIA: 800W, FREQUÊNCIA 60 HZ, ROTAÇÃO 3.850 RPM, CORPO: INOX, COPO: INOX', true], // Pedras de Maria da Cruz/MG
  ['MS', 'Liquidificador, 1400w, capacidade de 3,1 litros, 15 velocidades, 127V', 'Liquidificador, 1400w, capacidade de 3,1 litros, 15 velocidades, 127V', false],
  ['MG', 'LIQUIDIFICADOR Com potência mínima de 1.500 W, equipado com copo com capacidade mínima de 3 litros', 'LIQUIDIFICADOR Com potência mínima de 1.500 W, equipado com copo com capacidade mínima de 3 litros, confeccionado em polipropileno', false], // Campos Altos/MG
  ['GO', 'LIQUIDIFICADOR DE ALTA POTÊNCIA, COM POTÊNCIA MÍNIMA DE 1.000 W. JARRA COM CAPACIDADE MÍNIMA DE 3 LITROS', 'LIQUIDIFICADOR DE ALTA POTÊNCIA, com potência mínima de 1.000 W. Jarra com capacidade mínima de 3 litros, em vidro ou em plástico resistente', false], // Damolândia/GO
  ['GO', 'FORNO ELÉTRICO 220 V/ CAPACIDADE 65 L/ 4 ESTEIRAS/ COM CONTROLADOR DE TEMPERATURA', 'FORNO ELÉTRICO 220 V/ CAPACIDADE 65 L/ 4 ESTEIRAS/ COM CONTROLADOR DE TEMPERATURA E TEMPO DE COZIMENTO / TURBINA QUE DISTRIBUI O CALOR', true], // Santa Rita do Araguaia/GO
  ['MS', 'UNI FORNO ELÉTRICO 90 LITROS', 'UNI FORNO ELÉTRICO 90 LITROS - FORNO ELÉTRICO 90 LITROS: DEVE POSSUIR SISTEMA DE ABERTURA DO VIDRO TIPO GUILHOTINA', true], // Caarapó/MS
  ['MS', 'FORNO ELÉTRICO DE BANCADA – CAPACIDADE MÍNIMA DE 65 LITROS', 'FORNO ELÉTRICO DE BANCADA – CAPACIDADE MÍNIMA DE 65 LITROS – Forno elétrico de bancada, novo e de primeiro uso', false], // Bonito/MS
  ['MS', 'LIQUIDIFICADOR 2 LITROS 900W', 'Liquidificador com copo de acrílico de 2 litros, 12 velocidades', false],
  ['MG', 'CLIMATIZADOR DE AR - CAPACIDADE MÍNIMA DE 100 LITROS', '', true],
  ['DF', 'CLIMATIZADOR EVAPORATIVO PORTÁTIL 70 LITROS', '', true],
  ['GO', 'EXPOSITOR REFRIGERADO VERTICAL 2 PORTAS', '', false],
  ['MG', 'CÂMARA FRIA 6 M³', '', false],
  ['MG', 'FORNO INDUSTRIAL A GÁS 98 LITROS', '', true, true],
  ['GO', 'LIQUIDIFICADOR DOMÉSTICO 3 LITROS', '', false, true],
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
// AGORA (20/10/2026): fora de MT, tudo. Itens que a tabela antiga cortava na
// lista de 19/10.
const AGORA = [
  ['SP', 'SECADORA DE ROUPAS - 11KG, tensão 127/220V', '', true],                  // Lucelia/SP 182
  ['SP', 'MIXER DE ALIMENTOS PORTÁTIL 3 EM 1', '', true],                            // Lucelia/SP 170
  ['SP', 'Multiprocessador de alimentos 1000W de potência 110V', '', true],          // Birigui/SP 12
  ['SP', 'Geladeira / Refrigerador Duplex, com capacidade total de armazenamento', '', true], // Lucelia/SP 114
  ['SP', 'Forno Industrial tipo: elétrico, material: chapa aço inoxidável', 'Forno com convecção 4 esteiras Elétrico 55L 220V', true], // TRF3
  ['SP', 'Fogão doméstico – De 04 bocas, com pés, acendimento automático', '', true], // Lucelia/SP 88
  ['MG', 'Forno microondas capacidade: 25', '', true],                               // Uberlandia/MG 6
  ['MG', 'Processador Alimentos material corpo: aço inoxidável', '', true],          // BH 314, 31
  ['GO', 'Fritadeira elétrica sem óleo (air fryer)', '', true],                      // Damolandia/GO 24
  ['MS', 'Lavadora (lava e seca) 13 kg de capacidade de lavagem', '', true],          // Anastacio/MS 53
  ['DF', 'Forno Microondas, material: aço inoxidável', '', true],                    // Brasilia/DF 45, 13
  ['MT', 'FORNO DE MICROONDAS 34 LITROS', '', false],
  ['MT', 'AR CONDICIONADO - Split 12.000 Btus Frio 220v', '', false],
];

let erros = 0;
for (const [uf, rot, desc, esperado, semDesc, agora] of [...CASOS, ...AGORA.map(c => [...c, false, true])]) {
  const deu = (agora ? cotaAgora : cotaAntes)(uf, norm(rot), norm(desc), !!semDesc);
  const ok = deu === esperado;
  if (!ok) erros++;
  console.log(`${ok ? 'ok  ' : 'ERRO'} ${agora ? 'agora' : 'antes'} ${uf} ${deu ? 'fica' : 'sai '}${semDesc ? ' (varredura)' : ''} · ${rot.slice(0, 70)}`);
}
console.log(`\n${CASOS.length + AGORA.length - erros} de ${CASOS.length + AGORA.length} corretos`);
process.exitCode = erros ? 1 : 0;
