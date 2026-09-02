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
  'sempre que possivel', 'preferencialmente', 'quando for o caso',
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
];

// Acima disso o verbo quase certamente pertence a outra frase. Sem esse teto,
// "podera solicitar carta de solidariedade" a 257 caracteres virava exigencia.
const MAX_DIST_EXIGE = 200;

const JANELA = 320;      // caracteres de contexto de cada lado do termo

// Uma ocorrencia: onde esta, o contexto e o veredito.
function julga(texto, pos, termo) {
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

  // Ordem importa. Sancao e condicional vem ANTES de qualquer conclusao de
  // exigencia: os dois usam os mesmos verbos ("apresentar amostra") e sem essa
  // precedencia o edital cai por uma clausula de penalidade que ele nem aplica.
  let veredito;
  if (sanDist <= 130) veredito = 'sancao';
  else if (conDist <= 100) veredito = 'condicional';
  else if (negDist <= 90) veredito = 'dispensa';      // negacao colada no termo
  else if (exiDist <= 120) veredito = 'exige';
  else if (negDist < exiDist) veredito = "dispensa";
  else if (exiDist <= MAX_DIST_EXIGE) veredito = "exige";
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
        ocorrencias.push({ termo, ...julga(texto, i, termo) });
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
    };
  }
  saida.bloqueia = REGRAS.filter(r => saida[r.chave].exige).map(r => r.rotulo);
  return saida;
}
