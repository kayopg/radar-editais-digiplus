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
  // a secao da amostra que obriga, com o procedimento depois: o procedimento
  // continua barrando
  ['8 – das amostras 8.1. sera exigida do licitante classificado em primeiro lugar amostra dos produtos para analise. 8.2. o prazo para entrega da amostra e de 3 (tres) dias uteis a contar da solicitacao do pregoeiro, sob pena de desclassificacao.', ['Amostra']],
  ['8 – das amostras 8.1. o licitante classificado em primeiro lugar devera apresentar amostra dos itens 1 a 3. 8.2. o prazo para entrega da amostra e de 3 (tres) dias uteis, sob pena de desclassificacao.', ['Amostra']],
  // os que exigiam de verdade entre os 34 barrados em 06/10/2026
  ['19.1 sera feita a avaliacao das amostras: 19.1.1 a(s) licitante(s) classificada(s) em 1º lugar para o objeto do presente pregao devera apresentar 1 (uma) amostra de cada item, em ate 03 (tres) dias a contar da sessao e que for apurada a classificacao. 19.1.4 a nao apresentacao da(s) amostra(s) acarretara na desclassificacao da empresa para o(s) respectivo(s) item(ns).', ['Amostra']],   // Santo Antonio do Paraiso/PR
  ['15.1. o objeto desta contratacao nao se enquadra como sendo de bem de luxo, conforme decreto municipal nº 065/2024. 15.2. sera exigida garantia contratual, nos termos dos arts. 96 e seguintes da lei nº 14.133/21, tendo em vista a natureza do objeto.', ['Garantia contratual']],   // Santa Rita do Araguaia/GO
  ['4. requisitos da contratacao da exigencia de carta de solidariedade 4.1. em caso de fornecedor revendedor ou distribuidor, sera exigida carta de solidariedade emitida pelo fabricante, que assegure a execucao do contrato. garantia da contratacao 4.2. sera exigida a garantia da contratacao de que tratam os arts. 96 e seguintes da lei nº 14.133, de 2021.', ['Carta de solidariedade', 'Garantia contratual']],   // Sao Paulo/SP, 3842
  ['5. requisitos da contratacao da exigencia de amostra 5.1. havendo o aceite da proposta quanto ao valor, o interessado classificado provisoriamente em primeiro lugar devera apresentar amostra, que tera data, local e horario de sua realizacao divulgada por mensagem no sistema.', ['Amostra']],   // Bela Vista do Paraiso/PR
  ['7.13. considerando a exigencia de execucao de prova de conceito na documentacao que integra este edital como anexo, por ocasiao do julgamento das propostas, sera exigido do licitante classificado em primeiro lugar a sua realizacao.', ['Amostra']],   // Guarulhos/SP
  // a secao que dispensa para uns itens e exige para outros: o X.2 exige
  ['9. das amostras 9.1. nao sera exigida amostra para os itens 1 a 5. 9.2. para os itens 6 a 10, o licitante classificado em primeiro lugar devera apresentar amostra em 3 (tres) dias uteis, sob pena de desclassificacao.', ['Amostra']],
  // a condicao da secao e de OUTRA coisa (o catalogo), nao da amostra
  ['9. das amostras 9.1. caso necessario, o pregoeiro podera solicitar catalogo do produto ofertado, com fotografias, dimensoes, peso e as especificacoes tecnicas completas do fabricante, em lingua portuguesa. 9.2. o licitante vencedor devera apresentar amostra do item em 3 (tres) dias uteis, sob pena de desclassificacao.', ['Amostra']],
];
const PASSA = [
  // os barrados por engano em 06/10/2026 (24 dos 34 do dia)
  '12. dotacao orcamentaria 13. garantia contratual 13.1 nos termos do artigo 96 da lei federal nº 14.133/2021 foi analisado a necessidade de exigencia de garantia contratual. 13.2 considerando que o objeto consiste na aquisicao de bens comuns, de baixa complexidade operacional e entrega imediata, conclui-se pela nao exigencia de garantia contratual.',   // General Carneiro/PR
  'para garantir temperaturas e armazenamentos adequados para a preservacao de amostras a serem analisadas, contribuindo para a excelencia nas atividades de pesquisa e ensino da nossa universidade.',   // Florianopolis/SC
  'referencia de qualidade: modelo bremen importadora cod. 6740 ou equivalente/superior. garantia contratual: exigencia de garantia tecnica minima de 12 (doze) meses contra defeitos de fabricacao, contados a partir do recebimento definitivo do bem.',   // Vicosa/MG, 207
  '5.3.4. seja o material da mesma marca e oferecida na proposta inicial, possua as mesmas caracteristicas da amostra enviada, sob pena de devolucao; 5.3.5. seja entregue em embalagem original.',   // Alfenas/MG
  '10. da garantia da contratacao [em caso de nao haver garantia] 10.1 nao havera exigencia de garantia contratual da execucao. ou [em caso de haver garantia] 10.1 a contratacao conta com garantia de execucao em valor correspondente a x% (xxxx por cento) do valor inicial/total/anual do contrato (lei 14.133/2021, art. 96).',   // Vitorino/PR
  '3.1.8. os equipamentos eletronicos, de informatica e climatizacao deverao seguir os prazos de garantia contratual minimos fixados em suas especificacoes tecnicas individuais, prevalecendo o prazo de 12 (doze) meses sempre que este for superior.',   // Almenara/MG
  'o qual devera manifestar-se no prazo de 72 (setenta e duas) horas. em caso de exigencia de amostra 9.12. o licitante classificado em primeiro lugar devera apresentar amostra dos produtos relacionados no termo de referencia, sob pena de nao aceitacao da proposta. 9.12.1. os materiais para os quais foram solicitadas amostras deverao estar acondicionados nas embalagens fechadas/lacradas.',   // Capanema/PR
  '12.1.2.3. pedirparaserdesclassificadoquandoencerradaaetapacompetitiva;ou 12.1.2.4. deixardeapresentar amostra; 12.1.2.5. apresentar proposta ouamostraemdesacordocomasespecificapfiesdoedital;',   // Jardim/MS, texto grudado
  '5.3. os produtos ofertados deverao ser de marcas que comprovadamente atendam as especificacoes, sem prejuizo da possibilidade de solicitacao de catalogo, ficha tecnica ou amostra para comprovacao da conformidade. 5.4. os produtos deverao ser entregues devidamente acondicionados.',   // Alto Piquiri/PR
  '4.22. da exigencia de amostras 4.22.1. considerando que a contratacao abrange diversidade de materiais de consumo e bens permanentes, a eventual exigencia de amostras devera restringir-se as hipoteses em que a conformidade do produto nao puder ser suficientemente aferida pela documentacao tecnica. 4.22.2. a exigencia de amostra, quando estabelecida, devera ocorrer somente em relacao ao licitante provisoriamente classificado em primeiro lugar.',   // Divinopolis de Goias/GO
  'optou-se pela nao exigencia de garantia da contratacao prevista nos artigos 96 e seguintes da lei nº 14.133/2021, considerando que a natureza do objeto apresenta baixo risco de inadimplemento.',   // Extrema/MG
  '1.8.6. a exigencia de amostra nao sera automatica nem aplicada indistintamente a todos os itens, devendo restringir-se as situacoes em que a analise da documentacao tecnica nao seja suficiente para aferir a conformidade do produto ofertado.',   // Faxinal/PR
  'limpa, integra e em perfeitas condicoes de uso e manuseio. naoseraonecessariasamostrasnesteprocesso no entanto no momento das propostas deverao as empresas juntarem catalogos.',   // Cascavel/PR, texto grudado
  'ii – 10% (dez por cento) sobre o valor contratado, em caso de recusa do adjudicatario em efetuar o reforco de garantia contratual; iii – 20% (vinte por cento) sobre o valor da parcela do objeto nao executada.',   // Curitiba/PR, PCE 32
  '5.1.2 nao ha necessidade de apresentacao de amostras dos itens. 5.2 subcontratacao 5.2.1 nao e admitida a subcontratacao do objeto contratual.',   // Jatai/GO
  'por meio das especificacoes tecnicas, ficha tecnica, catalogo e, quando excepcionalmente necessario, amostra. 9.24. sera exigida declaracao de que o licitante tomou conhecimento das condicoes locais.',   // Anapolis/GO
  'os criterios e procedimentos previstos no decreto municipal, especialmente quanto a composicao da cesta de precos, analise critica das amostras e definicao do valor estimado da contratacao.',   // Anapolis/GO
  '10.3. a [fase de apresentacao de amostra(s) / de execucao de prova de conceito que seja exigida na documentacao que integra este edital, quando houver, e a] habilitacao dos licitantes que comporao o cadastro de reserva sera(ao) efetuada(s) quando houver necessidade.',   // Sao Jose dos Campos/SP
  'outro ponto observado e a previsao de apresentacao de amostras quando a compatibilidade com as especificacoes, padroes de qualidade e desempenho nao puder ser aferida por catalogos, fichas tecnicas ou documentos equivalentes.',   // Assis Chateaubriand/PR
  '4.32. a ausencia de exigencia de garantia da contratacao nao afasta a obrigacao da contratada de cumprir integralmente as condicoes estabelecidas neste termo de referencia.',   // Assis Chateaubriand/PR
  '19.2.2 - no caso de apresentacao de amostras, a mesma se dara nos termos ja definidos no edital. 19.2.3 - a convocacao para apresentacao da proposta de precos observara as regras do portal.',   // Joinville/SC
  '6.5 caso se trate de licitacao com apresentacao de amostras, os licitantes serao convocados para a apresentacao das amostras apos o encerramento da fase de lances.',   // Rancho Alegre/PR
  '6.3 da exigencia de amostras 6.3.1 para esta contratacao, em decorrencia do alto valor da maioria dos itens, a administracao julga nao ser viavel a exigencia de amostras, entretanto, e indispensavel que o arrematante forneca toda documentacao comprobatoria.',   // Paranagua/PR
  'pela conformidade, compatibilidade, garantia e assiste ncia te cnica dos produtos fornecidos. 4.7. da exigencia de garantia da contratacao 4.7.1. na o havera necessidade de exige ncia de garantia contratual. 4.8. indicacao de marcas ou modelos 4.8.1. na presente contrataca o na o sera exigida a indicaca o da marca e modelo. 4.9. da exigencia de amostra 4.9.1. nao ha necessidade de apresentacao de amostra.',   // Uniao da Vitoria/PR, texto partido
  '6.1.4 - podera ser exigido do fornecedor que o mesmo comprove a procedencia dos produtos a serem fornecidos. 6.2 – das amostras 6.2.1 - poderao ser exigidas, das empresas vencedores, amostras de todos os produtos licitados, para fins de afericao da qualidade. 6.2.2 - as amostras deverao ser entregues em ate 48 (quarenta e oito) horas apos a solicitacao. 6.2.8 - sera desclassificada a proposta do licitante que tiver amostra rejeitada ou nao a entregar no prazo estabelecido.',   // Rio Novo/MG
  // o titulo da secao com a negacao logo depois, e o "se for o caso" (Caxias do Sul/RS, 06/10/2026)
  '5.2.1.3. o nao atendimento a qualquer um dos requisitos acima implicara desclassificacao do item/grupo. 5.3. apresentacao de amostra(s) 5.3.1. nao havera a exigencia de amostra(s) nesta etapa da contratacao. 6. da habilitacao 6.1. a habilitacao da(s) licitante(s) sera verificada por meio do sicaf.',
  'b) a nova apresentacao devera atender a todas as exigencias deste termo de referencia e, se for o caso, obter parecer favoravel da amostra emitido pela secretaria requisitante de acordo com os criterios de avaliacao estabelecidos neste termo de referencia.',
  // o titulo com "marcas e" antes, e a amostra que "podera ser exigida" (Vacaria/RS)
  'a merenda escolar refletem finalidades distintas da contratacao. 2.5. marcas e apresentacao de amostras para os itens que possuam marca previamente aprovada ou referencia expressamente indicada no dfd e/ou neste termo de referencia, deverao ser observadas as condicoes estabelecidas no instrumento convocatorio. para os itens que nao possuam marca pre-aprovada, podera ser exigida a apresentacao de amostra do produto ofertado, para analise e aprovacao pela administracao. as amostras, quando exigidas, deverao corresponder integralmente aos produtos que serao efetivamente fornecidos.',
  // a amostra que talvez haja, no custo da proposta (Borrazopolis/PR, 06/10/2026)
  '15.1. os proponentes assumem todos os custos de preparacao e apresentacao de seus documentos de habilitacao e eventuais amostras. esta municipalidade nao sera, em nenhum caso, responsavel por esses custos.',
  // a secao da amostra que abre facultativa (Manhumirim/MG, 06/10/2026)
  '7.10. somente serao disponibilizados para acesso publico os documentos de habilitacao do licitante cuja proposta atenda ao edital de licitacao. 8 – das amostras 8.1. apos a fase de habilitacao, podera ser solicitada da empresa que tiver apresentado/ofertado menor proposta/preco para cada item, amostra dos produtos para analise e aprovacao pela secretaria municipal de administracao; 8.2. caso seja solicitada amostra dos produtos, a mesma devera ser ser entregue com embalagem original, lacrada e identificada com nome da licitante, numero do pregao e do item a que se refere; 8.3. o prazo para entrega da amostra e de 3 (tres) dias uteis a contar da solicitacao do pregoeiro, sob pena de desclassificacao se assim nao fizer; 8.4. a amostra sera analisada pela secretaria municipal de administracao, no prazo de 02 (dois) dias uteis, na qual emitira laudo de avaliacao da(s) amostra(s) nos termos da legislacao em vigor; 8.5. sendo a amostra aprovada, sera a empresa declarada vencedora do respectivo item no certame.',
  // ... e com "podera, no que couber, ser exigido" (Borrazopolis/PR, 06/10/2026)
  '8.10.12. da amostra: 8.10.12.1. podera, no que couber, ser exigido do licitante vencedor na fase de julgamento das propostas a apresentacao de amostras das (marcas) de todos ou parcial do(s) item(ns) vencido(s), que devera no prazo de maximo 03 (tres) dias uteis, contados a partir do horario de encerramento da sessao, serem encaminhadas ao departamento de licitacao, sediado na prefeitura do municipio de borrazopolis, e deverao estar corretamente identificadas com o numero do processo e do pregao, bem como identificacao da empresa. 8.10.12.2. as amostras devem ser apresentadas devidamente com rotulagem contendo informacoes corretas, claras, precisas e ostensivas sobre suas caracteristicas, sob pena de desclassificacao da proposta.',
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
