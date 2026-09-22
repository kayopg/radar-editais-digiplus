// O texto que o PNCP devolve na descricao do item e no objeto vem, em parte dos
// orgaos, com o HTML do editor do sistema de compras e com a acentuacao
// quebrada. Na pagina e no resumo isso aparecia como simbolo solto — o usuario
// pediu em 11/09/2026 para "verificar as palavras que estao vindo como simbolos
// aleatorios". Casos de 22/09/2026:
//   "<p><strong>COOKTOP A GÁS</strong></p> <ul> <li>..."   (Guarapuava/PR)
//   "CAPACIDADE MIacute;NIMA DE 534 LITROS. TENSAtilde;O"   (Ipameri/GO: a
//     entidade sem o "&", com a letra-base antes do nome)
//   "CARACTER&Iacute;STICAS", "&nbsp;"                     (Boa Vista do Burica/RS)
//   "FORNO DE MICRO-ONDAS â?¢ Forno ... Portaria nÂº 268"  (Jambeiro/SP: UTF-8
//     lido como Latin-1, com o "€" perdido no caminho)
//
// So troca o que e inequivoco; o resto do texto fica como veio.
const MARCA = { acute: '́', grave: '̀', tilde: '̃', circ: '̂', cedil: '̧', uml: '̈' };
const NOMEADAS = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ordm: 'º', ordf: 'ª', deg: '°',
  ndash: '–', mdash: '—', bull: '•', middot: '·', hellip: '…', laquo: '«', raquo: '»',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', sup2: '²', sup3: '³', frac12: '½', frac14: '¼',
  frac34: '¾', times: '×', plusmn: '±', micro: 'µ', copy: '©', reg: '®', trade: '™', euro: '€',
};
// UTF-8 lido como Latin-1 (e as vezes com o terceiro byte perdido)
const QUEBRADOS = [
  [/â\?¢|â€¢|â¢/g, '•'], [/â€“|â\?"/g, '–'], [/â€”/g, '—'], [/â€œ|â€|â€\?/g, '"'],
  [/â€˜|â€™/g, "'"], [/Âº/g, 'º'], [/Âª/g, 'ª'], [/Â°/g, '°'], [/Â²/g, '²'], [/Â³/g, '³'], [/Â½/g, '½'], [/Â /g, ' '],
  [/Ã¡/g, 'á'], [/Ã /g, 'à'], [/Ã¢/g, 'â'], [/Ã£/g, 'ã'], [/Ã¤/g, 'ä'], [/Ã§/g, 'ç'],
  [/Ã©/g, 'é'], [/Ãª/g, 'ê'], [/Ã­/g, 'í'], [/Ã³/g, 'ó'], [/Ã´/g, 'ô'], [/Ãµ/g, 'õ'],
  [/Ãº/g, 'ú'], [/Ã¼/g, 'ü'], [/Ã/g, 'Á'], [/Ã‰/g, 'É'], [/Ã/g, 'Í'], [/Ã“/g, 'Ó'],
  [/Ãš/g, 'Ú'], [/Ã‡/g, 'Ç'], [/Ãƒ/g, 'Ã'], [/Ã•/g, 'Õ'], [/Ã‚/g, 'Â'], [/ÃŠ/g, 'Ê'], [/Ã"/g, 'Ô'],
];

export function limpaTextoPncp(s) {
  let t = String(s ?? '');
  if (!/[<&;ÃÂâ]/.test(t)) return t.replace(/\s+/g, ' ').trim();
  // HTML do editor: quebra e item de lista viram espaco e marcador
  t = t.replace(/<\s*br\s*\/?>/gi, ' ').replace(/<\s*li[^>]*>/gi, ' • ').replace(/<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/gi, ' ');
  // entidades numericas e nomeadas
  t = t.replace(/&#(\d{2,5});/g, (m, n) => String.fromCodePoint(+n))
       .replace(/&#x([0-9a-f]{2,4});/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)));
  // letra acentuada, com ou sem o "&": "&Iacute;", "MIacute;NIMA" (a letra-base
  // antes do nome, sem o "&")
  t = t.replace(/&?([A-Za-z])(acute|grave|tilde|circ|cedil|uml);/g, (m, l, k) => (l + MARCA[k]).normalize('NFC'));
  t = t.replace(/&([a-z]{2,8}\d?);/gi, (m, n) => NOMEADAS[n.toLowerCase()] ?? m);
  for (const [re, x] of QUEBRADOS) t = t.replace(re, x);
  return t.replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
}
