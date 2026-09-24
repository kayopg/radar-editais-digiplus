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
// UTF-8 lido como LATIN-1 de verdade (ISO-8859-1, nao cp1252): ali os bytes
// 0x80-0x9F nao tem letra nenhuma e viram "?" — e o simbolo chega ao usuario
// como ponto de interrogacao, que foi o que ele viu em 24/09/2026.
//
//   "×"  = C3 97       -> "Ã" + ? = "Ã?"      "80 Ã? 107 Ã? 83 cm"
//   "≈"  = E2 89 88    -> "â" + ?? = "â??"    "(â??140 mm)", General Carneiro/PR
//   "“"  = E2 80 9C    -> "â??"               "â??frost-freeâ?", Jambeiro/SP
//   "–"  = E2 80 93    -> "â??"
//
// O "Ã?" tambem poderia ser Ð, Ñ, Ø... e o "â??" tambem poderia ser outro sinal:
// quem desempata e a vizinhanca. Entre dois valores e o sinal de vezes; colado
// num numero e o "aproximadamente"; solto entre espacos e o travessao; e o
// resto, que aparece grudado na palavra, e aspas.
const INTERROGACAO = [
  // Quando o TERCEIRO byte sobrevive, nao ha o que adivinhar: todo "E2 80 xx"
  // e o caractere U+20(xx-80) da pontuacao geral do Unicode. O PNCP entrega
  // "â?¢" no lugar de "•" — E2 80 A2, e 0xA2-0x80 = 0x22, ou seja U+2022, o
  // marcador de lista. Confirmado na propria API em 24/09/2026: os itens de
  // General Carneiro/PR chegam com "1.600 PSI;â?¢\tPotencia minima: 1.600 W",
  // com um "?" de verdade, gravado assim no banco deles.
  //
  // Vale so onde o resultado e sinal visivel: 0xA8-0xAF cairia em U+2028-202F,
  // que sao quebra de linha e marca invisivel de direcao de texto.
  [/â\?([ -§°-¿])/g, (m, c) => String.fromCharCode(0x2000 + c.charCodeAt(0) - 0x80)],
  [/(?<=\S)\s?Ã\?\s?(?=\S)/g, ' × '],
  [/â\?\?(?=\d)/g, '≈'],
  [/\sâ\?\??\s/g, ' – '],
  [/â\?\??/g, '"'],
  // Aspas que o PDF perdeu nas DUAS pontas: "NA FORMA ?FRONTAL ELEVADA?
  // (PADRAO)" (Boa Vista do Burica/RS). O que separa das outras interrogacoes
  // e estarem GRUDADAS no conteudo — a de abertura colada na primeira letra e
  // a de fechamento colada na ultima. Pergunta de verdade nao abre assim, e o
  // travessao da regra seguinte anda solto entre espacos.
  [/(?<=[\s(])\?(\S[^?\n]{0,58}\S)\?(?=[\s).,;:]|$)/g, '“$1”'],
  // E o travessao que o proprio PNCP ja entrega como "?", sem mojibake nenhum:
  // "VENTILADOR DE PAREDE ? 60 CM" (Guia Lopes da Laguna/MS), "Forno Eletrico
  // 48 litros ? Forno eletrico com capacidade..." (Ervalia/MG). Solto entre
  // espacos nunca e pergunta: a pergunta gruda na palavra de tras.
  [/(?<=\S)\s\?\s(?=\S)/g, ' – '],
];

// UTF-8 lido como Latin-1 (e as vezes com o terceiro byte perdido)
const QUEBRADOS = [
  [/â\?¢|â€¢|â¢/g, '•'], [/â€“|â\?"/g, '–'], [/â€”/g, '—'], [/â€œ|â€|â€\?/g, '"'],
  [/â€˜|â€™/g, "'"], [/Âº/g, 'º'], [/Âª/g, 'ª'], [/Â°/g, '°'], [/Â²/g, '²'], [/Â³/g, '³'], [/Â½/g, '½'], [/Â /g, ' '],
  [/Ã¡/g, 'á'], [/Ã /g, 'à'], [/Ã¢/g, 'â'], [/Ã£/g, 'ã'], [/Ã¤/g, 'ä'], [/Ã§/g, 'ç'],
  [/Ã©/g, 'é'], [/Ãª/g, 'ê'], [/Ã­/g, 'í'], [/Ã³/g, 'ó'], [/Ã´/g, 'ô'], [/Ãµ/g, 'õ'],
  [/Ãº/g, 'ú'], [/Ã¼/g, 'ü'], [/Ã/g, 'Á'], [/Ã‰/g, 'É'], [/Ã/g, 'Í'], [/Ã“/g, 'Ó'],
  [/Ãš/g, 'Ú'], [/Ã‡/g, 'Ç'], [/Ãƒ/g, 'Ã'], [/Ã•/g, 'Õ'], [/Ã‚/g, 'Â'], [/ÃŠ/g, 'Ê'], [/Ã"/g, 'Ô'],
];

// So a parte das interrogacoes, para o texto que veio do PDF do edital em vez
// da API do PNCP. Ali nao ha HTML nem entidade para desfazer, e rodar a limpeza
// inteira seria mexer no descritivo sem necessidade — e descritivo estragado
// custa o item, nao so o texto.
export function arrumaInterrogacao(s) {
  let t = String(s ?? '');
  if (!t.includes('?')) return t;
  for (const [re, x] of INTERROGACAO) t = t.replace(re, x);
  return t;
}

export function limpaTextoPncp(s) {
  let t = String(s ?? '');
  if (!/[<&;ÃÂâ?]/.test(t)) return t.replace(/\s+/g, ' ').trim();
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
  // Depois dos QUEBRADOS: o que sobrou de "?" ali ja foi resolvido, e o que
  // restar e mesmo o simbolo perdido.
  for (const [re, x] of INTERROGACAO) t = t.replace(re, x);
  return t.replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
}
