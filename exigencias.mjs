// Acha no texto do edital as exigencias que impedem a Digiplus de participar:
// amostra, comprovacao de sustentabilidade, carta de solidariedade e garantia
// contratual (pagar antes para ser reembolsado depois).
//
// O problema NAO e achar a palavra — e decidir se ela esta sendo EXIGIDA ou
// DISPENSADA. Edital costuma escrever as duas coisas com as mesmas palavras:
//
//   "Sera exigida a apresentacao de amostra do produto"        -> exige
//   "Nao sera exigida a apresentacao de amostras"              -> dispensa
//   "Fica dispensada a garantia contratual"                    -> dispensa
//   "A amostra devera ser entregue em ate 48 horas"            -> exige
//
// Por isso cada ocorrencia e lida com o contexto ao redor, e a NEGACAO mais
// proxima do termo ganha. Na duvida o edital FICA na lista: sumir sem motivo e
// pior do que aparecer para conferencia.
const norm = s => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ');

export const REGRAS = [
  { chave: 'amostra', rotulo: 'Amostra',
    termos: ['amostra', 'amostras', 'prova de conceito'] },
  { chave: 'sustentabilidade', rotulo: 'Sustentabilidade',
    // So o que e COMPROVACAO. "criterios de sustentabilidade" e "sustentabilidade
    // ambiental" soltos sao texto padrao da Lei 14.133 e aparecem em quase todo
    // edital sem obrigar nada — bloqueavam Anapolis/GO a toa.
    termos: ['comprovacao de sustentabilidade', 'comprovar a sustentabilidade',
             'certificacao ambiental', 'certificado ambiental', 'selo ambiental',
             'comprovacao ambiental', 'laudo ambiental'] },
  { chave: 'solidariedade', rotulo: 'Carta de solidariedade',
    termos: ['carta de solidariedade', 'solidariedade do fabricante',
             'termo de solidariedade'] },
  { chave: 'garantia', rotulo: 'Garantia contratual',
    termos: ['garantia contratual', 'garantia da contratacao',
             'garantia de execucao', 'garantia do contrato',
             'prestacao de garantia'] },
];

// Perto do termo, qualquer um destes desarma a exigencia.
const NEGA = [
  'nao sera exigid', 'nao serao exigid', 'nao e exigid', 'nao sao exigid',
  'nao havera exigencia', 'nao ha exigencia', 'sem exigencia',
  'nao se exigira', 'nao se exige', 'nao exigira', 'nao exigimos',
  'fica dispensad', 'ficam dispensad', 'esta dispensad', 'dispensada a',
  'dispensado a', 'dispensada apresentacao', 'nao sera necessari',
  'nao obrigatori', 'nao e obrigatori', 'nao sera solicitad',
  'desnecessari', 'nao aplicavel', 'nao se aplica', 'isento de', 'isenta de',
  // Revisao dos 34 barrados em 06/10/2026 (24 eram engano): "conclui-se pela NAO
  // EXIGENCIA de garantia contratual" (General Carneiro/PR, Extrema/MG), "NAO HA
  // NECESSIDADE de apresentacao de amostras" (Jatai/GO, Uniao da Vitoria/PR),
  // "nao serao necessarias amostras" (Cascavel/PR), "a administracao julga NAO SER
  // VIAVEL a exigencia de amostras" (Paranagua/PR), "a AUSENCIA DE EXIGENCIA de
  // garantia" (Assis Chateaubriand/PR), "nao se faz necessaria" (Londrina/PR)
  'nao exigencia', 'nao ha necessidade', 'nao havera necessidade', 'nao serao necessari',
  'nao ser viavel', 'ausencia de exigencia', 'nao se faz necessari',
];

// E estes confirmam que esta sendo pedido de verdade.
const EXIGE = [
  'sera exigid', 'serao exigid', 'e exigid', 'sao exigid', 'exigir-se-a',
  'devera apresentar', 'deverao apresentar', 'devera ser apresentad',
  'deverao ser apresentad', 'obrigatoria a apresentacao', 'e obrigatori',
  'sera obrigatori', 'fica obrigad', 'exigencia de', 'exigira',
  'apresentacao de', 'apresentar a', 'entregar a', 'sob pena de desclassificacao',
  // "A amostra devera ser entregue em ate 48 horas" nao tem verbo de exigencia,
  // mas e exigencia. O "devera" solto so vale porque a janela e curta: a 120
  // caracteres do termo, ele quase sempre se refere a ele.
  'devera ser entregue', 'deverao ser entregues', 'devera ser encaminhad',
  'devera', 'deverao', 'obriga-se a', 'sob pena de',
  // Presente do indicativo. Itapevi/SP escapou na auditoria de 02/09/2026 por
  // isso: "a amostra do fogao DEVE ser apresentada com as etiquetas" exige
  // amostra, e o detector so olhava o futuro ("devera ser apresentada").
  'deve ser apresentad', 'devem ser apresentad', 'deve apresentar',
  'devem apresentar', 'deve ser entregue', 'devem ser entregues',
  'deve ser encaminhad', 'fica condicionad', 'mediante apresentacao',
];

// Lista de SANCOES. Todo edital tem uma clausula de penalidades que fala de
// amostra sem exigir nada: "deixar de apresentar amostra", "apresentar amostra
// falsificada". Na auditoria de 02/09/2026 isso bloqueou Ibituruna/MG sozinho,
// que nao exige amostra nenhuma.
const SANCAO = [
  'deixar de apresentar', 'deixar de entregar', 'sancoes', 'sancao',
  'penalidade', 'infracoes administrativas', 'declarado inidoneo',
  'impedimento de licitar', 'falsificad', 'deteriorad', 'praticar atos ilicitos',
  'em desacordo com as especificacoes', 'fraudar', 'conluio', 'multa de',
  'advertencia', 'rescisao', 'desclassificado quando',
  // a multa "sobre o valor contratado, EM CASO DE RECUSA do adjudicatario em
  // efetuar o REFORCO DE GARANTIA contratual" (Curitiba/PR, PCE 32, 06/10/2026)
  'em caso de recusa', 'reforco de garantia',
];

// Linguagem CONDICIONAL: o edital preve a hipotese mas nao obriga.
// "apresentar amostra (quando solicitado)" nao e exigencia.
const CONDICIONAL = [
  'quando solicitad', 'se solicitad', 'caso solicitad', 'quando exigivel',
  'caso exigid', 'se exigid', 'quando exigid', 'caso seja exigid',
  'se houver exigencia', 'eventualmente', 'a criterio da administracao',
  'se necessario', 'caso necessario', 'quando aplicavel', 'se aplicavel',
  // Verbo de faculdade, nao de obrigacao. Nazario/GO bloqueou por
  // "a administracao PODERA SOLICITAR carta de solidariedade" — o orgao pode,
  // nao deve. Auditoria de 02/09/2026.
  'podera solicitar', 'poderao solicitar', 'podera exigir', 'poderao exigir',
  'podera ser solicitad', 'podera ser exigid', 'facultad', 'a seu criterio',
  // Ressalva de viabilidade. Anapolis/GO bloqueou por "deverao, SEMPRE QUE
  // TECNICAMENTE VIAVEL, adotar criterios de sustentabilidade" — texto padrao
  // da Lei 14.133, que nao obriga a comprovar nada.
  'sempre que tecnicamente viavel', 'quando tecnicamente viavel',
  'sempre que possivel', 'preferencialmente', 'quando for o caso', 'se for o caso',
  'na medida do possivel', 'sempre que couber',
  // Achados na auditoria dos 30, em 02/09/2026, todos do tipo que o usuario
  // mandou manter — o orgao pode pedir, nao obriga:
  //   "o municipio RESERVA-SE NO DIREITO de solicitar amostras"
  //   "CASO o termo de referencia EXIJA a apresentacao de amostra"
  //   "a SOLICITACAO de amostras OBSERVARA criterios objetivos" (procedimento)
  //   "caso a qualidade NAO POSSA SER AFERIDA pelos meios previstos"
  'reserva-se no direito', 'reserva-se o direito', 'reservase o direito',
  'caso o termo de referencia', 'caso o projeto basico', 'caso o edital',
  'exija a apresentacao', 'exigir a apresentacao', 'vier a exigir',
  'nao possa ser aferid', 'caso nao seja possivel', 'na hipotese de',
  'se entender necessario', 'julgar necessario', 'entender necessario',
  'solicitacao de amostras observara', 'a criterio do',
  // Revisao de 05/10/2026, com os 14 editais do RS barrados no dia (13 eram
  // falso positivo): a clausula que se refere ao que JA foi exigido em outro
  // lugar ("parcelas para as quais tenha sido exigida ... prova de conceito",
  // Porto Alegre/RS, 340) e a consequencia da amostra pedida ("no caso de nao
  // haver entrega da amostra ..., a proposta sera recusada", Porto Alegre, 308
  // e 333) — as duas dependem de uma exigencia que o edital nao faz.
  'tenha sido exigid', 'para as quais foi exigid', 'no caso de nao haver entrega',
  'havendo entrega de amostra',
  // e o DESTINO da amostra que tiver sido pedida, clausula padrao da AGU: "as
  // amostras entregues deverao ser recolhidas pelos licitantes no prazo de 4
  // dias" (Mato Leitao, Tres Passos/RS), "as amostras entregues pelos
  // licitantes ... deverao ser retiradas" (Porto Alegre/RS), "a devolucao da
  // amostra devera ser ajustada"
  'amostras entregues', 'amostra entregue', 'devolucao da amostra', 'amostras aprovadas',
  'amostras reprovadas', 'deverao ser recolhid', 'deverao ser retirad', 'poderao ser descartad',
  'manuseados e desmontados', 'retirada das amostras', 'retirada da amostra',
  // "8.2. CASO SEJA SOLICITADA amostra dos produtos, a mesma devera ser
  // entregue..." (Manhumirim/MG, 06/10/2026) — a lista so tinha o "caso solicitad"
  'caso seja solicitad', 'caso sejam solicitad', 'se for solicitad', 'se forem solicitad',
  'quando for solicitad', 'quando forem solicitad',
  // "os proponentes assumem todos os custos de preparacao e apresentacao de seus
  // documentos de habilitacao e EVENTUAIS amostras" (Borrazopolis/PR, 06/10/2026)
  'eventuais amostras', 'eventual amostra',
  // e os da revisao de 06/10/2026, todos de editais barrados por engano:
  //   "EM CASO DE EXIGENCIA de amostra, 9.12 o licitante ... devera apresentar"
  //   e "os materiais PARA OS QUAIS FORAM SOLICITADAS amostras" (Capanema/PR)
  //   "sem prejuizo da POSSIBILIDADE DE SOLICITACAO de ... amostra" (Alto Piquiri/PR)
  //   "a EVENTUAL EXIGENCIA de amostras ... a exigencia de amostra, QUANDO
  //   ESTABELECIDA" (Divinopolis de Goias/GO)
  //   "a exigencia de amostra NAO SERA AUTOMATICA ... DEVENDO RESTRINGIR-SE"
  //   (Faxinal/PR)
  //   "QUANDO EXCEPCIONALMENTE NECESSARIO, amostra" (Anapolis/GO)
  //   "[fase de apresentacao de amostra(s) ... QUANDO HOUVER" (Sao Jose dos Campos/SP)
  //   "CASO SE TRATE de licitacao com apresentacao de amostras" (Rancho Alegre/PR)
  //   "NO CASO DE APRESENTACAO de amostras" (Joinville/SC)
  //   "previsao de apresentacao de amostras quando ... NAO PUDER SER AFERIDA"
  //   (Assis Chateaubriand/PR)
  //   "possua as mesmas caracteristicas da AMOSTRA ENVIADA" (Alfenas/MG)
  //   "foi ANALISADO A NECESSIDADE de exigencia de garantia" (General Carneiro/PR)
  //   "[EM CASO DE HAVER garantia] ... x% (xxxx por cento)" (Vitorino/PR)
  'em caso de exigencia', 'para os quais foram solicitad', 'para os quais forem solicitad',
  'possibilidade de solicitacao', 'possibilidade de exigencia', 'eventual exigencia',
  'quando estabelecid', 'nao sera automatica', 'devendo restringir-se',
  'quando excepcionalmente', 'quando houver', 'caso se trate de', 'no caso de apresentacao',
  'nao puder ser aferid', 'nao puder ser suficientemente aferid', 'amostra enviada',
  'amostras enviadas', 'analisado a necessidade', 'analisada a necessidade',
  'avaliada a necessidade', 'em caso de haver',
];
// O verbo de faculdade com coisa no meio: "8.10.12.1. PODERA, no que couber, SER
// EXIGIDO do licitante vencedor ... a apresentacao de amostras" (Borrazopolis/PR,
// 06/10/2026), que a lista, so com "podera ser exigid" colado, nao via.
const FACULDADE = /\bpoder(?:a|ao)\b[^.;]{0,40}?\b(?:ser\s+)?(?:solicit|exigi|requisit|requer)/;
// A amostra que pode ser trocada por documento (ver amostraOuDocumento, em julga)
// (nas duas ordens e com o "(s)": "o(s) laudo(s) tecnico(s) e/ou amostra(s)
// e/ou informacoes tecnicas devera(ao) estar identificado(s)", Goiania/GO)
const AMOSTRA_OU_DOCUMENTO = /amostras?(?:\(s\))?\s*,?\s*(?:e\/ou|ou)\s+(?:o\s+|os\s+|a\s+|as\s+|o\(s\)\s+|a\(s\)\s+)?(?:laudos?|catalogos?|fichas?|folders?|prospectos?|informac|documenta|declarac)|(?:laudos?|catalogos?|fichas?|informac\w*|documenta\w*)(?:\(s\))?(?:\s+tecnic\w*(?:\(s\))?)?\s*,?\s*e\/ou\s+(?:a\s+|as\s+|a\(s\)\s+)?amostras?/;
// A negacao escrita no meio da clausula, com o artigo: "nao havera A exigencia".
const NEGA_RE = /nao\s+(?:havera|sera|serao|devera|deverao)\s+(?:a\s+|o\s+)?(?:exigid|exigencia|adotad|solicitad|necessari|obrigatori)/;
// O que fica de uma secao quando se tira o que ela NEGA: o "nao sera exigida a
// indicacao da marca" da secao seguinte nao obriga nada (Uniao da Vitoria/PR,
// 06/10/2026, com o "na o" partido do PDF).
const semNegada = s => s.replace(/n\s?a\s?o\s+(?:sera|serao|e|sao|havera)\s+(?:a\s+|o\s+)?(?:exigid|obrigatori)\w*/g, '');
// O que obriga com todas as letras — e isso que a secao facultativa nao pode ter.
const OBRIGA = /sera exigid|serao exigid|e obrigatori|sao obrigatori|sera obrigatori|serao obrigatori|exigir-se-a|obrigatoria a apresentacao/;

// Acima disso o verbo quase certamente pertence a outra frase. Sem esse teto,
// "podera solicitar carta de solidariedade" a 257 caracteres virava exigencia.
const MAX_DIST_EXIGE = 200;

const JANELA = 320;      // caracteres de contexto de cada lado do termo

// Uma ocorrencia: onde esta, o contexto e o veredito.
function julga(texto, pos, termo, chave) {
  const de = Math.max(0, pos - JANELA);
  const ate = Math.min(texto.length, pos + termo.length + JANELA);
  const ctx = texto.slice(de, ate);
  const rel = pos - de;                       // posicao do termo dentro do contexto

  // A negacao mais proxima do termo decide. Uma negacao a 300 caracteres quase
  // sempre pertence a outra frase.
  let negDist = Infinity;
  for (const n of NEGA) {
    let i = ctx.indexOf(n);
    while (i >= 0) {
      const d = i < rel ? rel - (i + n.length) : i - (rel + termo.length);
      if (d >= 0 && d < negDist) negDist = d;
      i = ctx.indexOf(n, i + 1);
    }
  }
  let exiDist = Infinity;
  for (const e of EXIGE) {
    let i = ctx.indexOf(e);
    while (i >= 0) {
      const d = i < rel ? rel - (i + e.length) : i - (rel + termo.length);
      if (d >= 0 && d < exiDist) exiDist = d;
      i = ctx.indexOf(e, i + 1);
    }
  }

  const perto = (lista) => {
    let d = Infinity;
    for (const p of lista) {
      let i = ctx.indexOf(p);
      while (i >= 0) {
        const dd = i < rel ? rel - (i + p.length) : i - (rel + termo.length);
        if (dd >= 0 && dd < d) d = dd;
        i = ctx.indexOf(p, i + 1);
      }
    }
    return d;
  };
  const sanDist = perto(SANCAO);
  const conDist = perto(CONDICIONAL);
  // A lista de custos que o fornecedor assume: "responsabilizarem-se pelas
  // despesas dos tributos, encargos trabalhistas, [...], fretes, seguros,
  // deslocamento de pessoal, prestacao de garantia e quaisquer outras que
  // incidam" (Sao Joao d'Alianca/GO, 30/09/2026). Pagar o custo de uma garantia,
  // se houver, nao e exigencia de garantia — e o "deverao" da frase seguinte
  // derrubava o edital. So vale na enumeracao (duas virgulas ou mais desde a
  // palavra de custo): "as despesas com o envio das amostras" fica como esta.
  const custo = /(?:despesas|encargos|custos|onus)\b([^.;]*)$/.exec(ctx.slice(Math.max(0, rel - 220), rel));
  const naListaDeCustos = !!custo && (custo[1].match(/,/g) || []).length >= 2;

  // Ordem importa. Sancao e condicional vem ANTES de qualquer conclusao de
  // exigencia: os dois usam os mesmos verbos ("apresentar amostra") e sem essa
  // precedencia o edital cai por uma clausula de penalidade que ele nem aplica.
  // A CLAUSULA em que o termo esta, do numero dela (ou do ponto final) antes
  // do termo ate o seguinte. A distancia fixa nao bastava: na clausula padrao
  // da AGU — "8.11 caso ... nao possa ser aferida pelos meios previstos nos
  // subitens acima, o pregoeiro exigira que o licitante ... apresente amostra"
  // (Mato Leitao, Tres Passos, Nao-Me-Toque/RS) — a condicao fica a 110
  // caracteres da amostra, alem dos 100 da regra.
  let ini = 0, fim = ctx.length;
  for (const m of ctx.matchAll(/(?:^|\s)\d{1,2}(?:\.\d{1,2}){1,3}\.?\s|\.\s/g)) {
    const k = m.index + m[0].length;
    if (k <= rel) ini = k;
    else if (m.index >= rel + termo.length) { fim = m.index; break; }
  }
  const clausula = ctx.slice(ini, fim);
  const depois = ctx.slice(rel + termo.length, rel + termo.length + 250);
  // O quadro de marcar: "...em valor correspondente a 5 % do valor total do
  // contrato? (x) nao ( ) sim" (Redentora e Humaita/RS) — marcado nao, dispensa.
  const marcouNao = /\(\s*x\s*\)\s*nao\b/.test(depois) && !/\(\s*x\s*\)\s*sim\b/.test(depois);
  // O CAMPO do quadro-resumo com a resposta: "GARANTIA DE EXECUCAO (CAUCAO):
  // NAO." e "EXIGENCIA DE AMOSTRA? | FORMA DE ADJUDICACAO" com "NAO | POR
  // GRUPO" na linha de baixo (Codevasf, edital 53/2026, 18 fogoes industriais,
  // 06/10/2026). Nos dois-pontos a resposta vem colada; na pergunta, e o
  // primeiro sim/nao que vem depois, que a tabela poe o rotulo da coluna ao
  // lado no meio.
  let respostaDoCampo = null;
  const campo = /^(?:\s*\([^)]{0,30}\))?\s*([?:])/.exec(depois);
  if (campo) {
    const resto = depois.slice(campo[0].length);
    const m = campo[1] === '?' ? /^[^.;]{0,60}?\b(sim|nao)\b/.exec(resto) : /^\s*(sim|nao)\b/.exec(resto);
    if (m) respostaDoCampo = m[1];
  }
  // A negacao escrita no meio da clausula: "nao havera A exigencia da garantia
  // da contratacao" (Terra de Areia/RS), que a lista NEGA, sem o artigo, perdia.
  const negaNaClausula = NEGA_RE.test(clausula);
  // A garantia DO PRODUTO, e nao a de execucao do contrato: "o periodo de
  // garantia contratual sera contado a partir da aceitacao definitiva"
  // (Porto Alegre/RS, 308). A regra e a caucao do art. 96.
  const garantiaDoProduto = chave === 'garantia'
    && (/^\s*(?:sera contad|de \d|minima|dos? (?:bens|produtos|materia(?:l|is)|equipamentos|itens)|contra defeit|do fabricante|de fabrica)/.test(depois)
      // "garantia contratual: exigencia de garantia TECNICA minima de 12 meses
      // contra defeitos" (Vicosa/MG, 207), "os PRAZOS de garantia contratual
      // minimos" (Almenara/MG), "a GARANTIA LEGAL e a garantia contratual
      // ofertada" (Bela Vista do Paraiso/PR), 06/10/2026
      || /^[^.;]{0,60}(?:garantia tecnica|contra defeitos|defeitos de fabricacao)/.test(depois)
      || /(?:periodo|prazo)s? de\s*$/.test(ctx.slice(Math.max(0, rel - 40), rel))
      || /garantia (?:legal|do fabricante)[^.;]{0,20}$/.test(ctx.slice(Math.max(0, rel - 60), rel))
      // o titulo "13. DA GARANTIA DE EXECUCAO. 13.1. a contratada devera fornecer
      // garantia minima de 12 (doze) meses para todos os itens, exceto os itens
      // 16 e 19 que e de no minimo 90 dias" (Ivoti/RS, 07/10/2026): prazo em
      // meses, anos ou dias e garantia do PRODUTO; a do contrato e um percentual
      // do valor (art. 98)
      || (/^[^%]{0,80}?garantia[^.;%]{0,40}?\d+\s*(?:\([a-z ]+\)\s*)?(?:meses|anos|dias)\b/.test(depois.slice(0, 200))
        && !/%|por cento|valor (?:inicial|total|anual|global) do contrato/.test(depois.slice(0, 200))));
  // A amostra que e o PRODUTO: "saco esteril para coleta de amostras de
  // alimentos" (Vacaria/RS) estava na lista de itens.
  const amostraDoProduto = chave === 'amostra'
    && /(?:coleta|armazenamento|transporte|acondicionamento|manipulacao|preservacao|conservacao) (?:e \w+ )?(?:de |das |da )?amostras?|apos a coleta|amostras? de (?:alimentos|agua|sangue|solo)|amostras a serem analisadas|porta[- ]amostras?|amostrador|\besteril/.test(ctx.slice(Math.max(0, rel - 250), rel + termo.length + 250));
  // e a amostra da PESQUISA DE PRECOS: "a composicao da cesta de precos, ANALISE
  // CRITICA DAS AMOSTRAS e definicao do valor estimado" (Anapolis/GO, 06/10/2026)
  const amostraDePreco = chave === 'amostra' && /(?:analise critica|tratamento) d[ao]s? amostras?|cesta de precos/.test(ctx.slice(Math.max(0, rel - 120), rel + termo.length + 40));
  // A "amostra" que e CATALOGO: o titulo fala de amostra e o que se pede e
  // documento — "3.5. exigencias de amostra: 3.5.1. o licitante classificado
  // provisoriamente em primeiro lugar devera apresentar catalogo tecnico, ficha
  // tecnica ou documento equivalente" (Camboriu/SC, edital 32), "da exigencia de
  // amostra 5.10.6 cabera a administracao ... verificar a conformidade ...,
  // podendo ser solicitados catalogos, fichas tecnicas" (Sant'Ana do
  // Livramento/RS, edital 19), 09/10/2026. So quando a primeira frase depois do
  // titulo nao fala de amostra de novo.
  const aposTermo = ctx.slice(rel + termo.length, rel + termo.length + 400);
  // (o "s" do plural vem junto: o termo e "amostra")
  const primeiraFrase = (/^s?[\s:.\-–]*(?:\d{1,2}(?:\.\d{1,2}){1,3}\.?\s+)?([^]*?)(?:\.\s+\d{1,2}(?:\.\d{1,2}){1,3}\.?\s|\.\s|$)/.exec(aposTermo) || [])[1] || '';
  const amostraEhCatalogo = chave === 'amostra'
    && /^s?[\s:.\-–]*(?:\d{1,2}(?:\.\d{1,2}){1,3}\.?\s)/.test(aposTermo)
    && /\b(?:catalogos?|fichas? tecnicas?|folders?|prospectos?)\b/.test(primeiraFrase)
    && !/amostra/.test(primeiraFrase);
  // A amostra que pode ser trocada por documento: "o interessado classificado
  // provisoriamente em primeiro lugar, apresentar amostra, e/ou laudo(s)
  // tecnico(s) e/ou informacoes tecnicas em relacao ao item" (Goiania/GO,
  // edital 115, 09/10/2026)
  const amostraOuDocumento = chave === 'amostra'
    && AMOSTRA_OU_DOCUMENTO.test(ctx.slice(Math.max(0, rel - 60), rel + termo.length + 80));
  // E a REMISSAO ao termo de referencia: "5.10. serao exigidas apresentacao de
  // amostras nos termos do item 4.15 e seus subitens constantes do anexo i –
  // termo de referencia" (Sant'Ana do Livramento/RS). Quem decide e a secao do
  // termo; la, so se pedia catalogo.
  const soRemissao = chave === 'amostra'
    && /^s?\s*nos termos d[oa]s? (?:item|subitem|clausula)s?\s+[\d.]+[^.;]{0,60}?(?:anexo|termo de referencia)/.test(aposTermo);
  // O modelo de edital NAO PREENCHIDO, com as duas alternativas e o percentual em
  // branco: "[em caso de haver garantia] 10.1 a contratacao conta com garantia de
  // execucao em valor correspondente a x% (xxxx por cento)" (Vitorino/PR)
  const modeloEmBranco = /\bx\s?%|\(x+ por cento\)|\bxxxx\b/.test(clausula + ' ' + depois.slice(0, 160));
  // Texto do PDF com as palavras grudadas ou partidas: "12.1.2.4.
  // deixardeapresentar amostra" (Jardim/MS), "naoseraonecessariasamostras"
  // (Cascavel/PR), "na o havera necessidade de exige ncia de garantia" (Uniao da
  // Vitoria/PR). Sem os espacos, so na frase colada ao termo.
  const colado = (ctx.slice(Math.max(0, rel - 60), rel) + termo).replace(/\s+/g, '');
  const negaColada = NEGA.some(n => colado.includes(n.replace(/\s+/g, '')));
  const sancaoColada = SANCAO.some(n => colado.includes(n.replace(/\s+/g, '')));
  // e o verbo de obrigacao longe do termo so conta se for da MESMA clausula:
  // "14.1.1 as amostras nao serao devolvidas e nem ressarcidas" (Dois Irmaos/RS)
  // nao exige nada — o "devera" a 190 caracteres era de outra
  const exigeNaClausula = EXIGE.some(e => clausula.includes(e));
  // A SECAO da amostra que abre facultativa: "8 – DAS AMOSTRAS 8.1. Apos a fase
  // de habilitacao, podera ser solicitada ... amostra dos produtos ... 8.3. O
  // prazo para entrega da amostra e de 3 (tres) dias uteis a contar da
  // solicitacao do Pregoeiro, sob pena de desclassificacao" (Manhumirim/MG,
  // 06/10/2026). O 8.3, lido sozinho, exige; dentro da secao, e o procedimento
  // da amostra que PODE ser pedida. Vale quando o que vem do titulo da secao
  // ate o termo e facultativo e nada ali, nem na clausula do termo, obriga.
  // (o proprio TITULO, "8.10.12. Da amostra:", se le pelo que vem logo depois)
  // Desde 06/10/2026 vale para as quatro exigencias, nao so a amostra: "13.
  // GARANTIA CONTRATUAL 13.1 ... foi analisado a necessidade de exigencia de
  // garantia contratual. 13.2 ... conclui-se pela nao exigencia de garantia
  // contratual" (General Carneiro/PR).
  let secaoFacultativa = false, secaoDispensa = false;
  {
    // (o titulo: "8 – DAS AMOSTRAS", "8.10.12. Da amostra:", "7. AMOSTRA DO(S)
    // PRODUTO(S)", "5.3. Apresentacao de amostra(s)", "2.5. Marcas e apresentacao
    // de amostras" (Vacaria/RS), "6.3 Da exigencia de amostras" (Paranagua/PR),
    // "4.7. Da exigencia de garantia da contratacao" — sempre com o ponto ou o
    // travessao depois do numero, ou o numero de subitem, que "3 dias. 5
    // amostras" nao e titulo)
    // ("6.2 – DAS AMOSTRAS", Rio Novo/MG: o travessao vale depois do subitem)
    const TITULO = String.raw`(?:^|\s)\d{1,2}(?:\.\d{1,2}){0,3}(?:\.?\s*[-–—)]|\.|(?<=\d\.\d{1,2}))\s*(?:[a-z]{3,15}\s+e\s+)?(?:(?:da|das|de|do|dos)\s+)?(?:(?:exigencia|apresentacao|entrega|prestacao)\s+(?:de|da|das|do)\s+)?`;
    const palavra = termo.split(' ')[0].replace(/s$/, '') + 's?';
    let corpo = null, secao = '';
    const ehTitulo = new RegExp(TITULO + '$').test(texto.slice(Math.max(0, pos - 60), pos));
    if (ehTitulo) {
      corpo = texto.slice(pos + termo.length, pos + termo.length + 500);
      secao = texto.slice(pos, pos + 700);
    } else {
      const antes = texto.slice(Math.max(0, pos - 2500), pos);
      const cab = [...antes.matchAll(new RegExp(TITULO + palavra + '\\b', 'g'))].pop();
      if (cab) {
        corpo = antes.slice(cab.index + cab[0].length);
        secao = texto.slice(Math.max(0, pos - 2500) + cab.index, pos + 700);
      }
    }
    // A condicao tem de ser a da propria exigencia: vale a primeira frase da
    // secao que fala dela. Em "9. DAS AMOSTRAS 9.1 Caso necessario, podera
    // solicitar catalogo. 9.2 O vencedor devera apresentar amostra" a condicao e
    // do catalogo.
    if (corpo !== null) {
      const primeira = corpo.split(/(?:^|\s)\d{1,2}(?:\.\d{1,2}){1,3}\.?\s|[.;]\s/).find(f => new RegExp(palavra).test(f)) || '';
      // (e a amostra que o documento substitui: "apresentar amostra, e/ou
      // laudo(s) tecnico(s) e/ou informacoes tecnicas" vale para a secao toda,
      // procedimento de envio incluido — Goiania/GO, edital 115, 09/10/2026)
      secaoFacultativa = (CONDICIONAL.some(c => primeira.includes(c)) || FACULDADE.test(primeira) || AMOSTRA_OU_DOCUMENTO.test(primeira))
        && !OBRIGA.test(semNegada(corpo)) && !OBRIGA.test(clausula);
      // e a secao que diz que NAO exige, no comeco: "5.3. Apresentacao de
      // amostra(s) 5.3.1. Nao havera a exigencia de amostra(s) nesta etapa"
      // (Caxias do Sul/RS). Nada nela pode obrigar, e fora do titulo a clausula
      // do termo tambem nao: em "X.1 Nao sera exigida amostra para os itens 1 a
      // 5. X.2 Para os itens 6 a 10, o licitante devera apresentar amostra" o X.2
      // exige.
      const inicio = secao.slice(0, 450);
      // (sem os espacos tambem: "4.7.1. na o havera necessidade de exige ncia de
      // garantia contratual", Uniao da Vitoria/PR)
      const inicioColado = inicio.replace(/\s+/g, '');
      secaoDispensa = (NEGA.some(n => inicio.includes(n) || inicioColado.includes(n.replace(/\s+/g, ''))) || NEGA_RE.test(inicio)) && !OBRIGA.test(semNegada(secao))
        && (ehTitulo || !/\bdever(?:a|ao)\b|\bdevem?\b|sob pena/.test(clausula));
    }
  }

  let veredito;
  if (sanDist <= 130 || sancaoColada) veredito = 'sancao';
  else if (naListaDeCustos) veredito = 'custo';
  else if (garantiaDoProduto || amostraDoProduto || amostraDePreco) veredito = 'produto';
  else if (amostraEhCatalogo || amostraOuDocumento) veredito = 'catalogo';
  else if (soRemissao) veredito = 'remissao';
  else if (marcouNao) veredito = 'dispensa';
  else if (respostaDoCampo) veredito = respostaDoCampo === 'nao' ? 'dispensa' : 'exige';
  else if (conDist <= 100 || CONDICIONAL.some(c => clausula.includes(c)) || FACULDADE.test(clausula) || modeloEmBranco) veredito = 'condicional';
  else if (secaoFacultativa) veredito = 'condicional';
  else if (secaoDispensa) veredito = 'dispensa';
  else if (negaNaClausula || negaColada) veredito = 'dispensa';
  else if (negDist <= 90) veredito = 'dispensa';      // negacao colada no termo
  else if (exiDist <= 120) veredito = 'exige';
  else if (negDist < exiDist) veredito = "dispensa";
  else if (exiDist <= MAX_DIST_EXIGE && exigeNaClausula) veredito = "exige";
  else veredito = 'indefinido';                       // so citou, sem verbo

  return { veredito, ctx: ctx.replace(/\s+/g, ' ').trim(), negDist, exiDist, sanDist, conDist };
}

// Analisa o texto inteiro do edital. Devolve, por regra, o veredito final e as
// ocorrencias que sustentam a decisao.
export function analisaExigencias(textoPaginas) {
  const texto = norm(Array.isArray(textoPaginas) ? textoPaginas.join(' ') : textoPaginas);
  const saida = {};
  for (const regra of REGRAS) {
    const ocorrencias = [];
    for (const termo of regra.termos) {
      let i = texto.indexOf(termo);
      while (i >= 0) {
        ocorrencias.push({ termo, ...julga(texto, i, termo, regra.chave) });
        i = texto.indexOf(termo, i + termo.length);
      }
    }
    // Basta UMA ocorrencia exigindo para o edital estar fora: o edital pode
    // dispensar amostra num item e exigir noutro.
    const exige = ocorrencias.some(o => o.veredito === 'exige');
    saida[regra.chave] = {
      rotulo: regra.rotulo,
      exige,
      total: ocorrencias.length,
      ocorrencias: ocorrencias.slice(0, 6),
      // os trechos que barram, para a conferencia a mao (docs/barrados.json):
      // em 06/10/2026 eles ficavam alem das 6 primeiras ocorrencias e so uma
      // varredura instrumentada de 90 minutos mostrou que 24 dos 34 eram engano
      trechos: ocorrencias.filter(o => o.veredito === 'exige').slice(0, 2).map(o => o.ctx.slice(120, 520)),
    };
  }
  saida.bloqueia = REGRAS.filter(r => saida[r.chave].exige).map(r => r.rotulo);
  return saida;
}
