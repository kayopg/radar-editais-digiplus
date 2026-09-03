// Orgaos que devem para a casa ou para as coligadas. Nao se cota licitacao
// deles. Fonte: "DEVEDORES atualizado julho 2026.docx", de 13/07/2026,
// informado pelo usuario em 03/09/2026. Cobre as cinco empresas da lista —
// Digiplus, VMLX, MV, MT e Medic — e nao so a Digiplus.
//
// Duas formas de casar, e a diferenca importa:
//
//   municipio: a divida e da prefeitura, entao sai TODO edital daquela cidade.
//   orgao:     a divida e de um orgao especifico. "FUNDO MUNICIPAL DE SAUDE
//              SAO PAULO" nao pode derrubar a cidade de Sao Paulo inteira —
//              so o fundo. Casa pelo nome do orgao ou da unidade.
//
// Manter os de fora dos nossos 8 estados nao custa nada e protege se a
// cobertura crescer.
export const DEVEDORES = [
  // --- Digiplus
  { tipo: 'municipio', nome: 'butia', uf: 'RS' },
  { tipo: 'municipio', nome: 'sao vicente ferrer', uf: 'PE' },
  { tipo: 'municipio', nome: 'jaguarao', uf: 'RS' },
  // --- VMLX
  { tipo: 'orgao', nome: 'assist social, traba. e renda', uf: 'PA' },
  { tipo: 'orgao', nome: 'saude de cruz das almas', uf: 'BA' },
  { tipo: 'orgao', nome: 'piaui secretaria de saude', uf: 'PI' },
  { tipo: 'municipio', nome: 'capivari', uf: 'SP' },
  { tipo: 'orgao', nome: 'saude da gameleira', uf: 'PE' },
  { tipo: 'orgao', nome: 'educacao', uf: 'PE', municipio: 'gameleira' },
  { tipo: 'municipio', nome: 'guanambi', uf: 'BA' },
  { tipo: 'municipio', nome: 'barretos', uf: 'SP' },
  // --- MV
  { tipo: 'municipio', nome: 'barra do sul', uf: 'SC' },
  { tipo: 'municipio', nome: 'quissama', uf: 'RJ' },
  { tipo: 'orgao', nome: 'educacao de tuntum', uf: 'MA' },
  { tipo: 'orgao', nome: 'saude publica de novo hamburgo', uf: 'RS' },
  { tipo: 'orgao', nome: 'saude do municipio de beberibe', uf: 'CE' },
  // --- MT
  { tipo: 'municipio', nome: 'grossos', uf: 'RN' },
  // --- Medic
  { tipo: 'municipio', nome: 'estreito', uf: 'MA' },
  { tipo: 'orgao', nome: 'fundacao estatal piauiense', uf: 'PI' },
  { tipo: 'orgao', nome: 'atencao a saude de itabuna', uf: 'BA' },
  { tipo: 'orgao', nome: 'saude', uf: 'PB', municipio: 'campina grande' },
  { tipo: 'orgao', nome: 'sesau', uf: 'AL' },
  { tipo: 'orgao', nome: 'saude do estado do piaui', uf: 'PI' },
  { tipo: 'orgao', nome: 'saude carmopolis', uf: 'SE' },
  { tipo: 'orgao', nome: 'saude', uf: 'BA', municipio: 'vera cruz' },
  { tipo: 'orgao', nome: 'saude de rodolfo fernades', uf: 'RS' },
  { tipo: 'orgao', nome: 'saude de rodolfo fernandes', uf: 'RN' },
  { tipo: 'municipio', nome: 'sao geraldo do araguaia', uf: 'PA' },
  { tipo: 'orgao', nome: 'saude de dois irmaos do buriti', uf: 'MS' },
  { tipo: 'orgao', nome: 'fundo municipal de saude', uf: 'SP', municipio: 'sao paulo' },
  { tipo: 'orgao', nome: 'saude de natal', uf: 'RN' },
  { tipo: 'municipio', nome: 'anaurilandia', uf: 'MS' },
  { tipo: 'orgao', nome: 'sao camilo de esteio', uf: 'RS' },
  { tipo: 'orgao', nome: 'saude de umarizal', uf: 'RN' },
  { tipo: 'orgao', nome: 'saude de sobral', uf: 'CE' },
  { tipo: 'municipio', nome: 'rio pardo', uf: 'RS' },
];

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Devolve o devedor que casou, ou null. O municipio precisa bater exato para
// nao confundir "Rio Pardo" com "Rio Pardo de Minas"; o orgao casa por trecho,
// porque o PNCP escreve o nome de varios jeitos.
//
// Casamento por MUNICIPIO exige esfera municipal. Sem isso, o edital da
// "SECRETARIA DE ESTADO DA SAUDE - DRS-V BARRETOS" caia junto com a divida da
// prefeitura de Barretos: o orgao e estadual e so esta sediado la. Achado ao
// conferir o impacto na lista de 02/09/2026.
export function devedorDe(municipio, uf, orgao, unidade, esfera) {
  const m = norm(municipio), o = norm(orgao) + ' ' + norm(unidade);
  const municipal = norm(esfera) === 'municipal';
  for (const d of DEVEDORES) {
    if (d.uf !== uf) continue;
    if (d.municipio && norm(d.municipio) !== m) continue;
    if (d.tipo === 'municipio') { if (municipal && m === norm(d.nome)) return d; }
    else if (o.includes(norm(d.nome))) return d;
  }
  return null;
}
