// Abre o que o orgao publicou, seja la o que for.
//
// Nem todo orgao publica o edital em PDF: no lote de 04/09/2026, 11 dos 75
// vieram em ZIP, DOC ou DOCX e ficaram sem anexo nenhum. Este modulo destrincha
// esses formatos para que o PDF do resumo saia completo do mesmo jeito.
//
// A preferencia e sempre PDF — pedido do usuario em 04/09/2026. Quando ha PDF
// publicado ao lado do ZIP, e o PDF que vale, mesmo que o ZIP seja o arquivo
// intitulado "Edital": era exatamente o caso de Ribeirao Preto/SP, onde o
// Termo de Referencia estava em PDF no arquivo seguinte.
import zlib from 'node:zlib';

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function extDe(nome) {
  const n = String(nome || '').toLowerCase().split('?')[0].trim();
  const p = n.lastIndexOf('.');
  if (p < 0 || p === n.length - 1) return '';
  return n.slice(p + 1).replace(/[^a-z0-9]/g, '');
}

// ------------------------------------------------------------------- ZIP
// Leitor minimo: diretorio central -> cabecalho local -> inflate. Le os
// tamanhos do diretorio central de proposito; no cabecalho local eles podem vir
// zerados (data descriptor) e a extracao sairia vazia sem erro.
const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

export function abreZip(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  // O fim do diretorio central fica no fim do arquivo, depois de um comentario
  // de tamanho variavel: procura de tras para frente.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('nao parece um zip');

  const total = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const itens = [];
  for (let k = 0; k < total && p + 46 <= b.length; k++) {
    if (u32(b, p) !== 0x02014b50) break;
    const metodo = u16(b, p + 10);
    const comp = u32(b, p + 20);
    const cru = u32(b, p + 24);
    const nLen = u16(b, p + 28), eLen = u16(b, p + 30), cLen = u16(b, p + 32);
    const local = u32(b, p + 42);
    const nome = b.slice(p + 46, p + 46 + nLen).toString('utf8');
    itens.push({ nome, metodo, comp, cru, local });
    p += 46 + nLen + eLen + cLen;
  }

  return itens.filter(it => !it.nome.endsWith('/')).map(it => ({
    nome: it.nome,
    tamanho: it.cru,
    abre() {
      if (u32(b, it.local) !== 0x04034b50) throw new Error('cabecalho local invalido');
      const nLen = u16(b, it.local + 26), eLen = u16(b, it.local + 28);
      const ini = it.local + 30 + nLen + eLen;
      const dados = b.slice(ini, ini + it.comp);
      if (it.metodo === 0) return new Uint8Array(dados);
      if (it.metodo === 8) return new Uint8Array(zlib.inflateRawSync(dados));
      throw new Error('compressao ' + it.metodo + ' nao suportada');
    }
  }));
}

// Um ZIP de edital costuma trazer o edital, os anexos e as vezes a planilha.
// Interessa o que for PDF; entre eles, o que tiver cara de edital ou termo de
// referencia vem primeiro, e o tamanho desempata (o edital e o arquivo gordo).
const PESO_NOME = [[/edital/, 100], [/termo\s*de\s*referencia|^tr[\s_.-]|anexo\s*i\b/, 80],
  [/especifica|descritiv|memorial/, 60], [/aviso|errata|retifica/, -40],
  [/minuta|contrato|^arp|ata\s*de\s*registro/, -60], [/decreto|portaria|^lei\b/, -80]];

// So o nome do arquivo entra na conta, nunca o caminho: o zip de Pouso
// Alegre/MG vinha numa pasta chamada "EDITAL E ANEXOS - PREGAO 90625_2026", e
// com o caminho inteiro os quatro PDFs empatavam em 100 — inclusive a ata de
// registro de precos, que nao tem descritivo nenhum.
export function pdfsDoZip(bytes) {
  return abreZip(bytes)
    .filter(e => extDe(e.nome) === 'pdf')
    .map(e => {
      const base = norm(e.nome.split('/').pop());
      let peso = 0;
      for (const [re, v] of PESO_NOME) if (re.test(base)) peso += v;
      return { ...e, peso };
    })
    .sort((a, b) => (b.peso - a.peso) || (b.tamanho - a.tamanho));
}

// ------------------------------------------------------------------ DOCX
// Um .docx e um ZIP com o texto em word/document.xml. Nao da para anexar as
// paginas originais (nao ha paginas: o Word pagina na hora de imprimir), entao
// o que sai e o texto, escrito nas paginas do proprio resumo.
export function textoDocx(bytes) {
  const alvo = abreZip(bytes).find(e => e.nome === 'word/document.xml');
  if (!alvo) throw new Error('nao achei word/document.xml');
  const xml = Buffer.from(alvo.abre()).toString('utf8');
  return limpa(xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/w:tc>/g, '  ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
}

// Mesmo texto, mas em blocos: paragrafos e TABELAS, com as celulas separadas.
//
// A tabela de especificacao e o que interessa num edital, e achatada em texto
// corrido ela vira uma parede de palavras: numero do item, descritivo,
// quantidade e unidade sem divisa nenhuma. O .docx e XML, as tabelas estao
// marcadas la dentro, e da para remontar coluna por coluna no PDF.
export function blocosDocx(bytes) {
  const alvo = abreZip(bytes).find(e => e.nome === 'word/document.xml');
  if (!alvo) throw new Error('nao achei word/document.xml');
  return blocosDoXml(Buffer.from(alvo.abre()).toString('utf8'));
}

// O .doc binario nao tem estrutura para recuperar: sai so em paragrafos.
export function blocosDoc(bytes) {
  return textoDoc(bytes).split('\n').filter(l => l.trim()).map(txt => ({ t: 'p', txt }));
}

// ------------------------------------------------------------ ODT e HTML
// O .odt (LibreOffice) e um ZIP com o texto em content.xml, e o SEI exporta o
// edital como .html. Caxias do Sul/RS publica edital e termo de referencia so
// em .odt, dentro do zip, ao lado de tres PDFs de estudo tecnico; Londrina/PR,
// o edital em .html. Sem ler os dois, Caxias ficava sem descritivo nenhum e
// nenhum dos dois tinha as exigencias conferidas (16/09/2026). Cada linha da
// tabela sai numa linha, com as celulas separadas por espaco, como no PDF.
const NOMEADAS = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ordm: 'º', ordf: 'ª',
  deg: '°', ndash: '–', mdash: '—', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…',
  bull: '•', middot: '·', sup2: '²', sup3: '³', frac12: '½', times: '×', euro: '€' };
const ACENTOS = { acute: '́', grave: '̀', circ: '̂', tilde: '̃', uml: '̈', cedil: '̧' };
function entidades(t) {
  return t
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([A-Za-z])(acute|grave|circ|tilde|uml|cedil);/g, (_, l, a) => (l + ACENTOS[a]).normalize('NFC'))
    .replace(/&([a-z]+\d?);/gi, (tudo, n) => NOMEADAS[n.toLowerCase()] ?? tudo);
}

export function textoOdt(bytes) {
  const alvo = abreZip(bytes).find(e => e.nome === 'content.xml');
  if (!alvo) throw new Error('nao achei content.xml');
  return limpa(entidades(Buffer.from(alvo.abre()).toString('utf8')
    .replace(/<text:tab\/>|<text:s(?:\s[^>]*)?\/>/g, ' ')
    .replace(/<text:line-break\/>/g, '\n')
    .replace(/<\/table:table-cell>/g, ' ')
    .replace(/<\/(?:text:p|text:h|table:table-row)>/g, '\n')
    .replace(/<[^>]+>/g, '')));
}

export function textoHtml(bytes) {
  const b = Buffer.from(bytes);
  const cs = /charset=["']?([\w-]+)/i.exec(b.slice(0, 4000).toString('latin1'));
  const utf8 = !cs || /utf-?8/i.test(cs[1]);
  return limpa(entidades(b.toString(utf8 ? 'utf8' : 'latin1')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<\/(?:p|div|tr|li|h\d|table|title)>/gi, '\n')
    .replace(/<[^>]+>/g, '')));
}

// Os documentos de texto de dentro de um zip, ODT e HTML, para ler ao lado dos
// PDFs dele. O DOCX tem caminho proprio e continua nele.
export function textosDoZip(bytes) {
  const saida = [];
  for (const e of abreZip(bytes)) {
    const ext = extDe(e.nome);
    if (ext !== 'odt' && ext !== 'html' && ext !== 'htm') continue;
    try {
      const texto = ext === 'odt' ? textoOdt(e.abre()) : textoHtml(e.abre());
      if (texto.length > 200) saida.push({ nome: e.nome.split('/').pop(), formato: ext === 'odt' ? 'ODT' : 'HTML', texto });
    } catch { /* um documento ilegivel nao derruba os outros */ }
  }
  return saida;
}

const RE_ABRE = /<w:tbl>|<w:p[ >]/g;

function blocosDoXml(xml) {
  const blocos = [];
  let i = 0;
  while (i < xml.length) {
    RE_ABRE.lastIndex = i;
    const m = RE_ABRE.exec(xml);
    if (!m) break;

    if (m[0] === '<w:tbl>') {
      // Tabela dentro de tabela existe: fechar na primeira </w:tbl> cortaria a
      // de fora no meio.
      let prof = 1, j = m.index + 7;
      while (prof > 0 && j < xml.length) {
        const abre = xml.indexOf('<w:tbl>', j), fecha = xml.indexOf('</w:tbl>', j);
        if (fecha < 0) { j = xml.length; break; }
        if (abre >= 0 && abre < fecha) { prof++; j = abre + 7; }
        else { prof--; j = fecha + 8; }
      }
      const tab = leTabela(xml.slice(m.index, j));
      if (tab) blocos.push(tab);
      i = j;
    } else {
      const fim = xml.indexOf('</w:p>', m.index);
      const j = fim < 0 ? xml.length : fim + 6;
      const txt = textoDeXml(xml.slice(m.index, j));
      if (txt) blocos.push({ t: 'p', txt });
      i = j;
    }
  }
  return blocos;
}

function leTabela(xml) {
  const larguras = [];
  const grid = /<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/.exec(xml);
  if (grid) for (const g of grid[1].matchAll(/<w:gridCol[^>]*w:w="(\d+)"/g)) larguras.push(+g[1]);

  const linhas = [];
  for (const tr of xml.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)) {
    const celulas = [];
    for (const tc of tr[0].matchAll(/<w:tc[ >][\s\S]*?<\/w:tc>/g)) celulas.push(textoDeXml(tc[0]));
    if (celulas.some(c => c)) linhas.push(celulas);
  }
  if (!linhas.length) return null;

  const n = Math.max(...linhas.map(l => l.length));
  if (n < 2) return { t: 'p', txt: linhas.map(l => l.join(' ')).join('\n') };

  // Larguras do proprio documento quando batem com o numero de colunas; senao
  // divide igual, que e melhor que espremer a coluna errada.
  const soma = larguras.reduce((s, v) => s + v, 0);
  let fracoes = (larguras.length === n && soma > 0)
    ? larguras.map(v => v / soma)
    : Array.from({ length: n }, () => 1 / n);

  // Piso por coluna. Uma fracao minuscula vira coluna mais estreita que o
  // proprio recuo interno, e a quebra de linha passa a receber largura
  // negativa — o texto nao cabe nunca e a montagem trava.
  const PISO = 0.05;
  if (fracoes.some(f => f < PISO)) {
    const folga = 1 - PISO * n;
    const sobra = fracoes.reduce((s, f) => s + Math.max(0, f - PISO), 0);
    fracoes = folga <= 0 || sobra <= 0
      ? Array.from({ length: n }, () => 1 / n)
      : fracoes.map(f => PISO + (Math.max(0, f - PISO) / sobra) * folga);
  }

  return { t: 'tab', fracoes, linhas: linhas.map(l => {
    const c = l.slice(0, n);
    while (c.length < n) c.push('');
    return c;
  }) };
}

function textoDeXml(x) {
  return limpa(x
    .replace(/<w:tab[^>]*\/>/g, ' ')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
}

// ------------------------------------------------------------------- DOC
// Word 97-2003: formato binario OLE. O texto mora no fluxo "WordDocument",
// gravado em CP1252 ou UTF-16. Ler a tabela de pedacos exigiria um parser
// inteiro do formato; o que se faz aqui e recolher as sequencias legiveis desse
// fluxo, que e aproximado de proposito — e por isso o PDF sai avisando.
const CP1252 = { 128: '€', 130: '‚', 131: 'ƒ', 132: '„', 133: '…', 134: '†', 135: '‡',
  136: 'ˆ', 137: '‰', 138: 'Š', 139: '‹', 140: 'Œ', 145: '‘', 146: '’', 147: '“',
  148: '”', 149: '•', 150: '–', 151: '—', 153: '™', 154: 'š', 155: '›', 156: 'œ', 159: 'Ÿ' };

const legivel = c => (c >= 32 && c !== 127) || c === 9 || c === 10 || c === 13;

export function textoDoc(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  // O Word grava parte do corpo em 8 bits e parte em UTF-16, no mesmo arquivo.
  // As duas leituras sao cegas uma para a outra: na de 8 bits o texto largo
  // vira letras separadas por zero e as corridas se quebram; na de 16 bits o
  // texto de 8 bits nao casa o zero e some.
  //
  // Ficar com "a melhor das duas" perdia a outra metade em silencio: em
  // Diamante D'Oeste/PR isso custou 4 dos 8 itens — refrigerador, cooktop,
  // micro-ondas e espremedor nao apareciam em lugar nenhum do texto, e o PDF
  // saia parecendo completo. Por isso as duas entram, e o que ja esta na maior
  // nao se repete.
  const oito = limpa(corridas(b, 1));
  const dezesseis = limpa(corridas(b, 2));
  const [maior, menor] = letras(oito) >= letras(dezesseis) ? [oito, dezesseis] : [dezesseis, oito];

  const jaTem = new Set(maior.split('\n').map(l => l.trim()).filter(Boolean));
  const faltando = menor.split('\n').filter(l => l.trim() && !jaTem.has(l.trim()));
  return semLixoDeLink(faltando.length ? maior + '\n\n' + faltando.join('\n') : maior);
}

// O .doc guarda, no meio do texto, coisas que nao sao texto: destinos de
// hyperlink, nomes de indicador (_Hlk...), nomes dos fluxos internos do OLE e
// blocos codificados. No edital de Marechal Candido Rondon/PR isso rendeu uma
// pagina inteira de enderecos emendados.
//
// A limpeza e por trecho, nao por linha: a varredura binaria cola o lixo no
// texto bom — "_Hlk78351618mailto:...TERMO DE REFERENCIA" e uma linha so —, e
// jogar a linha fora levaria o titulo junto.
const FLUXOS_OLE = /\b(DocumentSummaryInformation|SummaryInformation|WordDocument|CompObj|ObjectPool|Root Entry|MSWordDoc|Word\.Document)\b\.?/g;

function semLixoDeLink(t) {
  return t.split('\n').map(l => l
    .replace(/https?:\/\/\S*/g, ' ')
    .replace(/mailto:\S*/g, ' ')
    .replace(/_(Hlk|Toc|Ref)\w*/g, ' ')
    .replace(FLUXOS_OLE, ' ')
    .replace(/[A-Za-z0-9+/]{12,}={1,2}/g, ' ')          // bloco codificado
    .replace(/[A-Za-z0-9]{20,}/g, m => /[aeiouAEIOUÀ-ÿ]/.test(m) ? m : ' ')
    .replace(/\s{2,}/g, ' ')
    .trim())
    // Sobrou pouca letra depois da limpeza: o que havia ali era o lixo.
    .filter(l => l && (l.length < 40 || (l.match(/[A-Za-zÀ-ÿ ]/g) || []).length / l.length >= 0.6))
    .join('\n');
}

const letras = t => (t.match(/[A-Za-zÀ-ÿ]/g) || []).length;

// Junta as sequencias legiveis do binario. passo 1 = CP1252, passo 2 = UTF-16LE
// (cada caractere seguido de um zero).
function corridas(b, passo) {
  const trechos = [];
  let atual = [];
  const fecha = () => { if (atual.length >= 24) trechos.push(deCp1252(atual)); atual = []; };
  for (let i = 0; i + passo - 1 < b.length; i += passo) {
    const ok = passo === 2 ? (b[i + 1] === 0 && legivel(b[i])) : (legivel(b[i]) && b[i] < 253);
    if (ok) atual.push(b[i]); else fecha();
  }
  fecha();
  return trechos.join('\n');
}

function deCp1252(cods) {
  let s = '';
  for (const c of cods) s += c < 128 ? String.fromCharCode(c) : (CP1252[c] || String.fromCharCode(c));
  return s;
}

// Tira o lixo comum a todos os caminhos: linhas de campo do Word, espacos
// duplicados e as dezenas de linhas em branco que sobram das tabelas.
function limpa(t) {
  return t
    .replace(/\r/g, '\n')
    .replace(/[ --]/g, ' ')
    .replace(/HYPERLINK\s+"[^"]*"/g, '')
    .replace(/\{?\s*(PAGE|NUMPAGES|TOC|HYPERLINK|MERGEFIELD|SEQ)\b[^\n}]*\}?/g, '')
    .split('\n')
    .map(l => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l, i, a) => l !== '' || (a[i - 1] || '') !== '')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
