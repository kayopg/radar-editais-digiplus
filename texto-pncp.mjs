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
import fs from 'node:fs';

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
// Palavras do ramo que o PNCP entrega com a letra acentuada trocada por "?"
// (ver a regra que usa devolveDoDicionario, abaixo).
const DICIONARIO = ['fogão', 'fogões', 'máquina', 'máquinas', 'refrigeração', 'ventilação', 'climatização',
  'tensão', 'mínima', 'mínimo', 'máxima', 'máximo', 'água', 'potência', 'frequência', 'freqüência',
  'elétrico', 'elétrica', 'elétricos', 'elétricas', 'eletrônico', 'eletrônica', 'automático', 'automática',
  'alumínio', 'aço', 'inoxidável', 'reservatório', 'acessório', 'acessórios', 'necessário', 'necessários',
  'necessárias', 'padrão', 'referência', 'exigência', 'específica', 'específico', 'classificação',
  'energética', 'hermético', 'removível', 'removíveis', 'lavável', 'laváveis', 'função', 'funções',
  'operação', 'fabricação', 'térmico', 'térmica', 'cerâmica', 'saída', 'saídas', 'monofásico', 'trifásico',
  'bifásico', 'câmara', 'líquido', 'líquida', 'plástico', 'plástica', 'rotação', 'vazão', 'pressão',
  'português', 'instruções', 'condições', 'dimensões', 'especificações', 'distribuição', 'regulável',
  'reguláveis', 'ajustável', 'ajustáveis', 'útil', 'úteis', 'também', 'reforçada', 'reforçado',
  'balcão', 'refrigerador', 'condensação', 'evaporação', 'instalação', 'manutenção', 'conservação',
  // as que apareciam com "?" nos itens de 08/10/2026
  'fácil', 'conexão', 'compatível', 'óptico', 'empilhável', 'higienização', 'contínuo', 'resolução', 'proteção',
  'impressão', 'técnica', 'técnicas', 'técnico', 'técnicos', 'geração', 'metálica', 'metálico', 'utilização',
  'resistência', 'deverá', 'memória', 'vídeo', 'fixação', 'anatômico', 'anatômicos', 'imperfeições',
  'certificação', 'exigível', 'estável', 'áudio', 'alimentação', 'até', 'botões', 'condução', 'segurança'];
// O resto vem do VOCABULARIO DOS EDITAIS (palavras-acentuadas.json, montado
// pelo vocabulario.mjs com o texto dos PDFs que a varredura ja leu): Sao Joao
// da Ponte/MG (edital 20, 09/10/2026) chegou com TODA letra acentuada como "?"
// — "BOA VEDA??O", "N?O SENDO ACEITO", "DISPON?VEL", "ATENDIMENTO ?S NORMAS" —
// e o resumo em PDF saia com os "?". A palavra so e trocada quando UMA forma
// domina (dez vezes mais comum que a segunda): "P?S" fica, porque "pés" e "pás"
// sao as duas comuns e ventilador tem pas.
let VOCAB = { acentuadas: {}, antesDeCrase: [] };
try { VOCAB = JSON.parse(fs.readFileSync(new URL('./palavras-acentuadas.json', import.meta.url), 'utf8')); } catch { /* sem o arquivo, so o dicionario */ }
const PORTAMANHO = new Map();
for (const [w, n] of Object.entries(VOCAB.acentuadas)) {
  if (w.length < 4) continue;
  if (!PORTAMANHO.has(w.length)) PORTAMANHO.set(w.length, []);
  PORTAMANHO.get(w.length).push([w, n]);
}
// As curtas, so estas: no vocabulario as de duas ou tres letras sao, em boa
// parte, pedaco de palavra que o PDF partiu ("ão", "aç", "pç").
const CURTAS = ['às', 'já', 'só', 'há', 'lá', 'fé', 'pó', 'pé', 'pá', 'aço', 'até', 'não', 'mês', 'pés', 'pás', 'pós', 'três', 'após', 'têm', 'vêm', 'põe', 'mão', 'pão', 'são', 'tão']
  .map(w => [w, VOCAB.acentuadas[w] || 1]);
const ANTES_DE_CRASE = new Set(VOCAB.antesDeCrase);
const caixaDe = (palavra, d) => {
  const letras = palavra.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letras === letras.toUpperCase()) return d.toUpperCase();
  return /^[A-ZÀ-Ý]/.test(palavra) ? d[0].toUpperCase() + d.slice(1) : d;
};
const devolveDoDicionario = palavra => {
  if (!/[A-Za-zÀ-ÿ]/.test(palavra)) return palavra;
  const re = new RegExp('^' + [...palavra.toLowerCase()].map(c => (c === '?' ? '[^\\x00-\\x7f]' : c.replace(/[.*+^${}()|[\]\\]/g, '\\$&'))).join('') + '$');
  if (/[A-Za-zÀ-ÿ]{2}/.test(palavra)) {
    const achadas = DICIONARIO.filter(d => re.test(d));
    if (achadas.length === 1) return caixaDe(palavra, achadas[0]);
  }
  const lista = palavra.length < 4 ? CURTAS : PORTAMANHO.get(palavra.length) || [];
  const [a, b] = lista.filter(([w]) => re.test(w)).sort((x, y) => y[1] - x[1]);
  // (palavra comprida que so casa com uma, como "alfanuméricas", basta aparecer tres vezes)
  if (!a || a[1] < (palavra.length >= 8 && !b ? 3 : 5) || (b && a[1] < 10 * b[1])) return palavra;
  return caixaDe(palavra, a[0]);
};
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
  // A LETRA ACENTUADA PERDIDA numa palavra conhecida do ramo: "FOG?O INDUSTRIAL
  // DE 04 BOCAS" (Sao Joao da Ponte/MG, item 12, 09/10/2026) nao casava com
  // "fogao" e o fogao industrial nem entrava no radar; "M?QUINA DE LAVAR" e
  // "TENS?O 220 V" do mesmo jeito. Cada "?" e UMA letra acentuada, e a palavra so
  // e trocada quando casa com exatamente uma do dicionario, ou quando uma forma
  // domina no vocabulario dos editais — o resto segue para as regras abaixo.
  // (Antes, o apostrofo da "CAIXA D??GUA", que nao e letra, Sao Joao da Ponte/MG.)
  [/(?<![A-Za-zÀ-ÿ])([Dd])\?\??(GUA|gua)(?![A-Za-zÀ-ÿ])/g, (m, d, g) => d + "'" + (g === 'GUA' ? 'ÁGUA' : 'água')],
  // A curta so quando esta SOLTA, entre espacos ou pontuacao: "2,0?S/cm" e o
  // microsiemens da condutividade, "54h?" e "1s?" sao unidade com o simbolo
  // perdido e ".../ords/f?" e endereco — e viravam "ÀS", "há", "só" e "fé".
  // A barra so vale depois de palavra: "20 DIAS/M?S" e o mes.
  [/(?<![A-Za-zÀ-ÿ])[A-Za-zÀ-ÿ]*\?[A-Za-zÀ-ÿ?]*(?![A-Za-zÀ-ÿ])/g, (palavra, i, t) => {
    const antes = t.slice(t.lastIndexOf(' ', i - 1) + 1, i);
    const solta = /^[\s("“'«]?$/.test(t[i - 1] || '') || /^[A-Za-zÀ-ÿ]{2,}\/$/.test(antes);
    const depois = t.slice(i + palavra.length, i + palavra.length + 2);
    const fecha = /^[\s,.;:)!”"»]?$/.test(depois[0] || '') || /^\/[A-Za-zÀ-ÿ]$/.test(depois);   // "A?O/FERRO"
    if (palavra.length < 4 && !(solta && fecha)) return palavra;
    return devolveDoDicionario(palavra);
  }],
  // No texto que perdeu TODAS as letras acentuadas, o "?" solto entre espacos
  // tambem e letra: a crase de "PERTENCENTE ? LINHA CORPORATIVA", "RESISTENTE ?
  // EXPOSICAO SOLAR" e "DESTINADO ? CONDUCAO DE AGUA" (Sao Joao da Ponte/MG,
  // 09/10/2026). A regra do travessao, mais abaixo, fazia deles "–". O que
  // decide e a palavra de tras: "pertencente", "resistente" e "destinado" vem
  // antes de "à" nos editais e nunca antes de travessao; "12.000 BTU/H ? FRIO ?
  // 220 V", do mesmo item, continua travessao. So vale no texto quebrado (o
  // terceiro campo da regra), que tem "?" no meio de palavra.
  [/(?<=(?<![A-Za-zÀ-ÿ])([A-Za-zÀ-ÿ]+)) \? (?=[A-Za-zÀ-ÿ])/g,
    (m, w) => (ANTES_DE_CRASE.has(w.toLowerCase()) ? (w === w.toUpperCase() ? ' À ' : ' à ') : m), 'quebrado'],
  // e o metro quadrado da area: "?REA APROXIMADA DE 36 M?, SISTEMA DE MONTAGEM"
  // (Sao Joao da Ponte/MG, tenda) — a palavra ja voltou como "ÁREA" na regra
  // de cima. Sem "área" antes, "M?" pode ser m³ e fica.
  [/(?<=(?<![A-Za-zÀ-ÿ])(?:[ÁáAa]rea|ÁREA|AREA)(?![A-Za-zÀ-ÿ])[^?\n]{0,30}?\d\s?)([mM])\?(?=[\s,.;)]|$)/g, '$1²'],
  // "P?S" fica (ver acima), menos na expressao que so pode ser pe: "FUNCIONAMENTO
  // A GLP, P?S DE APOIO" (fogao industrial de Sao Joao da Ponte/MG)
  [/(?<![A-Za-zÀ-ÿ])([Pp])\?([Ss])(?= (?:DE APOIO|de apoio|REGUL|regul|NIVELADORES|niveladores|ANTIDERRAPANTES|antiderrapantes|DE BORRACHA|de borracha))/g,
    (m, p, s) => p + (s === 'S' ? 'ÉS' : 'és')],
  // Aspas que o PDF perdeu nas DUAS pontas: "NA FORMA ?FRONTAL ELEVADA?
  // (PADRAO)" (Boa Vista do Burica/RS). O que separa das outras interrogacoes
  // e estarem GRUDADAS no conteudo — a de abertura colada na primeira letra e
  // a de fechamento colada na ultima. Pergunta de verdade nao abre assim, e o
  // travessao mais abaixo anda solto entre espacos.
  //
  // TEM de rodar antes das regras de "?" isolado que vem a seguir. Em
  // 28/09/2026 a de "letra + ? + pontuacao" comia a aspa de FECHAMENTO de
  // "igual a ?zero?, ou proximo de ?zero?," (Votuporanga/SP, item 176), e a de
  // abertura ficava orfa: "igual a ?zero, ou".
  // (e uma letra so: "EFICIENCIA ENERGETICA CLASSE ?A? (PROCEL)", Miranda/MS,
  // 06/10/2026)
  [/(?<=[\s(])\?(\S(?:[^?\n]{0,58}\S)?)\?(?=[\s).,;:]|$)/g, '“$1”'],
  // O MARCADOR de lista perdido depois de dois-pontos ou ponto e virgula, antes
  // do numero: "Kit com no minimo 5 discos: ? 01 Disco Ralador Fino (2mm) - ...;
  // ? 01 Disco Fatiador" (Inhumas/GO, item 19, 06/10/2026)
  // (e depois de ponto final, que e onde caem os seguintes: "...raladas bem
  // finas. ? 01 Disco Fatiador")
  [/(?<=[:;.]\s?)\?\s+(?=\d{1,2}\s)/g, '• '],
  // ... e no COMECO DA LINHA, com a tabulacao da lista do Word depois: o texto
  // cru do PNCP e "discos:\r\n?\t01 Disco Ralador" e "bem finas.\r\n?\t01 Disco
  // Fatiador" (Inhumas/GO, item 19). Pergunta de verdade nao abre linha com tab.
  [/(?<=\n[ \t]*)\?\t+/g, '• '],
  // ... e o "?" que ABRE a descricao, antes da primeira palavra: "?Conjunto
  // Quadrado em POLIPROPILENO. Modelo: 02 a 06 Anos" (Faxinal/PR, 07/10/2026).
  // Descricao de produto nao comeca com pergunta.
  [/^\s*\?+\s*(?=\p{Lu})/u, ''],
  // ... e no meio, colado na palavra seguinte, o travessao dos outros do mesmo
  // item: "COR AZUL ? TAMPO PLÁSTICO ? 02 a 06 Anos ? INFANTIL ?Conjunto
  // Quadrado" (Faxinal/PR, item 33). Pergunta nao tem espaco antes do "?".
  [/(?<=\s)\?(?=\p{Lu}\p{Ll})/gu, '– '],
  // O gas refrigerante R600a e R134a com o "a" perdido: "Gas do produto:
  // R600? Tipo de degelo: Manual" (Pontao/RS, item 8, frigobar, 28/09/2026). O
  // edital escreve o "a" com a letra CIRILICA, que nao sobreviveu ao caminho ate
  // o PNCP. Sao os dois gases de refrigerador e frigobar; o codigo e fixo.
  [/\b(R-?(?:600|134))\?(?=[\s,.;)]|$)/g, '$1a'],
  // O "²" da unidade de pressao: "Pressao minima: 750 lbf/pol? - Vazao"
  // (Ressaquinha/MG, item 42, lavadora de alta pressao, 08/10/2026), e o
  // "kgf/cm?" do mesmo jeito. O "I" no lugar do "l" e do OCR do edital.
  [/(?<=\b[lI]?[lI]bf\/pol|\bkgf\/cm)\?/g, '²'],
  // A POLEGADA perdida, com palavra de tela ou de formato logo antes: "Tela: IPS
  // Full HD de 23.8?, ajuste de altura" (monitor) e "Forma: 3,5?; as unidades"
  // (disco), Chapadao do Sul/MS, 29/09/2026. Sem essa palavra antes, o numero
  // pode ser grau e o "?" fica.
  [/(?<=\b(?:tela|monitor|display|lcd|led|full hd|polegadas?|forma(?:to)?|tamanho|tv|televisor)\b[^?\n]{0,20}?\d+(?:[.,]\d{1,2})?)\?(?=[\s,.;:)]|$)/gi, '"'],
  // o simbolo que vinha colado na marca registrada: "Jato de tinta Heat-Free
  // MicroPiezo®?.", "Windows Server®? 2003" (Chapadao do Sul/MS)
  [/([®™])\?+/g, '$1'],
  // e as chamadas de nota depois do parentese: "28 segundos por pagina em cores
  // (200 dpi)???. Conectividade:" (Chapadao do Sul/MS)
  [/(?<=\))\?{2,}(?=[\s.,;:]|$)/g, ''],
  // ACENTO PERDIDO: o PNCP guarda "DESCRIC?A?O DETALHADA: CARACTERI?STICAS
  // FI?SICAS" e "DIMENSO?ES" (Goiania/GO, item 74, 25/09/2026) — o cedilha e o
  // til viraram "?" antes de chegar la. Nao da para saber QUAL acento era, mas
  // tirar o "?" devolve a palavra legivel: "DESCRICAO", "CARACTERISTICAS".
  //
  // So depois de VOGAL ou C, que sao as letras que levam acento em portugues, e
  // so colado na letra seguinte. Assim nao mexe em "ALT?ROTACAO" (Pocone/MT),
  // onde o "?" comeu um "A " inteiro depois de um T: ali falta letra, nao
  // acento, e juntar as palavras seria pior que deixar o sinal de que algo
  // sumiu. Pergunta de verdade nunca vem grudada entre duas letras.
  [/(?<=[aeiouAEIOUcC])\?(?=\p{L})/gu, ''],
  // FILEIRA DE MARCADORES depois do ponto final: "1270x1200x435 mm (AxLxP).? ?
  // ? ? Quatro pes em tubo de aco" (Quarai/RS, item 2). A frase ja terminou no
  // ponto, entao eles somem — a regra do travessao, mais abaixo, transformava
  // so alguns e deixava ".? – ? – Quatro", que e pior que o original.
  [/(?<=[.;:])\s*(?:\?\s*){1,8}(?=\p{L})/gu, ' '],
  // e a fileira solta, fora do fim de frase, vira UM separador so
  [/(?<=\S)\s(?:\?\s+){2,}(?=\S)/g, ' – '],
  // QUEBRA DE LINHA perdida no meio da frase. O texto de Quarai/RS traz
  // "ponteiras de borracha, sendo?  ?  quatro para cada cabeceira" e "(parede
  // 1½)?  ?  chapa 16": o primeiro "?" vem COLADO na palavra e os seguintes
  // soltos, entao a regra da fileira logo acima, que pede espaco antes do
  // primeiro, deixava "sendo? – quatro".
  //
  // O que garante que nao e pergunta e a palavra SEGUINTE ser minuscula:
  // pergunta termina a frase e a proxima comeca com maiuscula, como em "OPTANTE
  // PELO SIMPLES? SIM ( ) NAO( )". Isso tambem protege "TELA LCD 2.5? COM"
  // (polegada) e "ALT?ROTACAO" (letra comida), que continuam como estao.
  [/(?<=\S)\?(?:\s+\?)*\s+(?=\p{Ll})/gu, ' '],
  // e o mesmo sinal perdido grudado entre letra e pontuacao: "MESA SECRETARIA
  // COM DUAS GAVETAS?:MESA: Tampo (1400x600mm)" (Quarai/RS, item 13). Pergunta
  // nao vem seguida de dois-pontos; e a de Caceres/MT ("qual e a pergunta ?,")
  // tem espaco na frente e continua intacta.
  // O espaco no meio existe: o PNCP guarda "GAVETAS? :MESA:", e a colagem do
  // espaco antes da pontuacao so acontece no fim desta funcao.
  [/(?<=\p{L})\?(?=\s*[:;,])/gu, ''],
  // O sinal perdido entre o NOME de um campo e o valor dele: "Formato do Cesto:
  // Quadrado. Cesto de Fritura? Removivel, antiaderente. Potencia: 1600W"
  // (Faxinal/PR, item 66, air fryer, 08/10/2026) — os outros campos do mesmo
  // item tem dois-pontos. A palavra de tras e minuscula e colada no "?", e a
  // seguinte e Maiuscula seguida de minuscula. A pergunta em caixa alta
  // ("OPTANTE PELO SIMPLES? SIM") nao casa, e a de verdade nesse formato
  // ("Possui timer? Sim") tambem se le com dois-pontos.
  [/(?<=\p{Ll})\?(?=\s\p{Lu}\p{Ll})/gu, ':'],
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

// As regras com o terceiro campo "quebrado" so valem no texto que perdeu as
// letras acentuadas: dois ou mais "?" no meio de palavra, como "M?NIMA" e
// "TENS?O" do mesmo item, ou o "GERA??O" sozinho. "ALT?ROTACAO", com um so,
// nao conta.
function aplicaInterrogacao(t) {
  const quebrado = (t.match(/(?<=[A-Za-zÀ-ÿ]\?*)\?(?=\?*[A-Za-zÀ-ÿ])/g) || []).length >= 2;
  for (const [re, x, so] of INTERROGACAO) if (!so || quebrado) t = t.replace(re, x);
  return t;
}

// So a parte das interrogacoes, para o texto que veio do PDF do edital em vez
// da API do PNCP. Ali nao ha HTML nem entidade para desfazer, e rodar a limpeza
// inteira seria mexer no descritivo sem necessidade — e descritivo estragado
// custa o item, nao so o texto.
export function arrumaInterrogacao(s) {
  let t = String(s ?? '');
  if (!t.includes('?')) return t;
  return aplicaInterrogacao(t);
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
  t = aplicaInterrogacao(t);
  return t.replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
}
