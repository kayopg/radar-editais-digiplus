// Revisao ortografica do descritivo pronto.
//
// O descritivo e copiado do edital, e o edital tem erro de digitacao: "na cor
// brnca" (Salto/SP), "poencia minima 2.000w" e "Geladeira dupex" (Diamante
// D'Oeste/PR), "Gartantia Minima 12 Meses" (Sao Paulo/SP), "CODIGO DE DEFSA DO
// CONSUMIDOR" (Renascenca/PR). Tambem cola palavras que o PDF separa so pela
// posicao na pagina: "Atraves Dechave Seletora", "PAINEL DIGITAL OUMECANICO",
// "Proteja Oproduto", "descarte agua Automatico140 litros". Quem le o resumo
// nao tem como saber que o erro ja estava no edital, e a proposta copia o
// descritivo.
//
// Corrigir sem prova troca uma palavra certa por outra — "valvulas" nao e erro
// de "valvula", "Kobra" e marca e nao "obra", "Minipa" nao e "minima". Entao a
// correcao so acontece quando TUDO isto vale:
//   - a palavra nao existe no dicionario pt_BR, nem com acento posto ("valvulas"
//     e "valvulas" sem acento, nao erro), nem no dicionario en_US ("Professional",
//     "Voltage", "Camping" sao ingles de catalogo);
//   - uma so edicao de letra (tirar, por, trocar ou inverter duas vizinhas) leva
//     a uma palavra do dicionario que os editais usam pelo menos 12 vezes
//     (singular e plural somados) e dez vezes mais que a errada;
//   - a palavra corrigida existe nos editais AO LADO da vizinha que ela tem
//     aqui: "cor branca", "potencia minima", "de defesa". "Decio ANGULO
//     Chiuvitti" nao passa, porque ninguem escreve "decio angulo".
//
// Os dicionarios (pasta ortografia/) sao os do OpenOffice/BrOffice, LGPL — ver
// os README ao lado deles. Sem os arquivos, a revisao nao muda nada.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ortografia');

// Verificador Hunspell minimo: palavra do .dic, ou palavra do .dic com um
// sufixo e/ou um prefixo das regras do .aff. Nao faz composicao nem sugestao.
function carregaDicionario(nome) {
  let dic, aff;
  try {
    dic = fs.readFileSync(path.join(PASTA, nome + '.dic')).toString('latin1');
    aff = fs.readFileSync(path.join(PASTA, nome + '.aff')).toString('latin1');
  } catch { return null; }
  const radicais = new Map();
  for (const l of dic.split(/\r?\n/).slice(1)) {
    if (!l) continue;
    const i = l.indexOf('/');
    const w = i < 0 ? l.trim() : l.slice(0, i), fl = i < 0 ? '' : l.slice(i + 1).split(/\s/)[0];
    radicais.set(w, (radicais.get(w) || '') + fl);
  }
  const sufixos = new Map(), prefixos = new Map(), cruza = {};
  let maxSufixo = 0, maxPrefixo = 0;
  for (const l of aff.split(/\r?\n/)) {
    const p = l.trim().split(/\s+/);
    if (p[0] !== 'SFX' && p[0] !== 'PFX') continue;
    if (p.length === 4 && /^[YN]$/.test(p[2])) { cruza[p[0] + p[1]] = p[2] === 'Y'; continue; }
    if (p.length < 5) continue;
    const sfx = p[0] === 'SFX';
    const add = p[3].split('/')[0] === '0' ? '' : p[3].split('/')[0];
    let cond = null;
    if (p[4] !== '.') { try { cond = new RegExp(sfx ? '(?:' + p[4] + ')$' : '^(?:' + p[4] + ')'); } catch { continue; } }
    const regra = { flag: p[1], tira: p[2] === '0' ? '' : p[2], add, cond, cruza: !!cruza[p[0] + p[1]] };
    const m = sfx ? sufixos : prefixos;
    if (!m.has(add)) m.set(add, []);
    m.get(add).push(regra);
    if (sfx) maxSufixo = Math.max(maxSufixo, add.length); else maxPrefixo = Math.max(maxPrefixo, add.length);
  }
  const tem = (w, flag) => { const f = radicais.get(w); return f !== undefined && f.includes(flag); };
  function porSufixo(w, prefixo) {
    for (let k = 0; k <= Math.min(maxSufixo, w.length - 1); k++) {
      for (const r of sufixos.get(k ? w.slice(-k) : '') || []) {
        if (prefixo && !r.cruza) continue;
        const st = w.slice(0, w.length - k) + r.tira;
        if (r.cond && !r.cond.test(st)) continue;
        if (tem(st, r.flag) && (!prefixo || tem(st, prefixo))) return true;
      }
    }
    return false;
  }
  function uma(w) {
    if (radicais.has(w) || porSufixo(w)) return true;
    for (let k = 1; k <= Math.min(maxPrefixo, w.length - 1); k++) {
      for (const r of prefixos.get(w.slice(0, k)) || []) {
        const st = r.tira + w.slice(k);
        if (r.cond && !r.cond.test(st)) continue;
        if (tem(st, r.flag)) return true;
        if (r.cruza && porSufixo(st, r.flag)) return true;
      }
    }
    return false;
  }
  const memo = new Map();
  return w => {
    if (memo.has(w)) return memo.get(w);
    const r = uma(w) || (w !== w.toLowerCase() && uma(w.toLowerCase()));
    memo.set(w, r);
    return r;
  };
}

const tiraAcento = s => s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
const LETRAS = 'abcdefghijklmnopqrstuvwxyz';
const COM_ACENTO = { a: ['á', 'à', 'â', 'ã'], e: ['é', 'ê'], i: ['í'], o: ['ó', 'ô', 'õ'], u: ['ú', 'ü'], c: ['ç'] };
const PALAVRA = /[\p{L}\p{N}]+/gu;

// Erro que o dicionario nao pega (a forma errada tambem e palavra, ou aparece
// pouco para ter prova nos editais), sempre preso ao contexto:
const REPAROS = [
  // "feito em ago inox", "Armario de ago com 4 gavetas", "ago carbono": o "ç" do
  // aço que a extracao do PDF trocou por "g" (anexos da BLL de Serrana/SP e
  // Guia Lopes da Laguna/MS, 16/09/2026). "ago" nao e palavra em portugues.
  [/(?<!\p{L})(de|em|DE|EM)\s+[Aa]go(?!\p{L})/gu, '$1 aço'],
  [/(?<!\p{L})ago(?=\s+(?:inox|INOX|Inox|carbono|CARBONO|galvanizad|escovad|pintad|esmaltad|cromad|\d))/gu, 'aço'],
  [/(?<!\p{L})AGO(?=\s+(?:INOX|CARBONO|GALVANIZAD|ESCOVAD|PINTAD|\d))/gu, 'AÇO'],
  // e o "inox" que o reconhecimento leu como "!fox", "'fox" ou "— fox"
  [/(?<=(?:[Aa]ço|AÇO)\s)['!]fox(?!\p{L})/gu, 'inox'],
  [/(?<=\s[—–-]\s)fox(?=,)/g, 'inox'],
  // "Acompanha: Motor, Grades, Helice, Frontar, Suporte de Parede" (Salto/SP)
  [/\b([Ff])rontar(?=,)/g, '$1rontal'],
  // "descongelamento de carnes e pratos protos" (Saudade do Iguacu/PR)
  [/\b(pratos|PRATOS|Pratos)\s+(protos|PROTOS)\b/g, (_, a, b) => a + ' ' + (b === 'PROTOS' ? 'PRONTOS' : 'prontos')],
  // "TAMPA DE VIDRO TEMPERADA" (Renascenca/PR)
  [/\b(VIDRO\s+)TEMPERADA\b/g, '$1TEMPERADO'],
  [/\b([Vv]idro\s+)temperada\b/g, '$1temperado'],
  // "termonetro de controle de temperatura" (Nova Esperanca/PR)
  [/\btermonetro\b/g, 'termômetro'], [/\bTERMONETRO\b/g, 'TERMÔMETRO'],
  // "APLICACAO: FLUXO LANIMAR" (Descalvado/SP)
  [/\b(FLUXO\s+)LANIMAR\b/g, '$1LAMINAR'], [/\b([Ff]luxo\s+)lanimar\b/g, '$1laminar'],
  // "SISTEMA COM LAMPARA UV" (Florianopolis/SC)
  [/\bL[ÂA]MPARA(?=\s+UV\b)/g, 'LÂMPADA'], [/\bl[âa]mpara(?=\s+UV\b)/gi, 'lâmpada'],
  // "motor Wegpainel Touch Screen vazao 57.000 m³h12 Velocidades" (Nova Esperanca/PR)
  [/\bWegpainel\b/g, 'Weg painel'],
  [/m³h(?=\d)/g, 'm³/h '],
  // "Nivel Ruido: Maximo de 60 D em velocidade maxima" (UFSM, Santa Maria/RS)
  [/(Ru[íi]do[^.;]{0,30}?\d)\s?D(?=\s)/g, '$1 dB'],
  // "CAPACIDADE REFRIGERACAO: 18.000 BTU,H" (Minacu/GO)
  [/\bBTU,H\b/g, 'BTU/H'],
  // "...COPO COLETOR E PENEIRA EM": o catalogo do PNCP corta a frase (Minacu/GO)
  [/\b(PENEIRA|peneira)\s+(?:EM|em)$/, '$1'],
  // grafia do acordo ortografico e o termo de catalogo colado:
  // "Microondas", "FrostFree" (Londrina/PR)
  [/\b([Mm])icroondas\b/g, '$1icro-ondas'], [/\bMICROONDAS\b/g, 'MICRO-ONDAS'],
  [/\bFrostFree\b/g, 'Frost Free'], [/\bFROSTFREE\b/g, 'FROST FREE'], [/\bfrostfree\b/g, 'frost free'],
  [/\b([Uu])ltrasônico\b/g, '$1ltrassônico'], [/\bULTRASÔNICO\b/g, 'ULTRASSÔNICO'],
  [/\bsemi-rápidos\b/g, 'semirrápidos'],
  [/\b([Aa])ntirespingos\b/g, '$1ntirrespingos'], [/\bANTIRESPINGOS\b/g, 'ANTIRRESPINGOS'],
  // da releitura de 15/09/2026, item por item:
  // "Lamina Em Aco Inox" (Sao Paulo/SP), "LAMINAS DE ACO INOX" (Campinas/SP)
  [/\b([Ll])amina(s?)\b/g, '$1âmina$2'], [/\bLAMINA(S?)\b/g, 'LÂMINA$1'],
  // "COPO REMOVIVEL COM DUAS ALCAS" (Campinas/SP)
  [/\balcas\b/g, 'alças'], [/\bAlcas\b/g, 'Alças'], [/\bALCAS\b/g, 'ALÇAS'],
  // "(FOUET, PA PLANA E GANCHO)" (Campinas/SP)
  [/\bPA PLANA\b/g, 'PÁ PLANA'], [/\bpa plana\b/g, 'pá plana'],
  // "Camara Isolada Em La de Vidro" (Sao Paulo/SP)
  [/\b([Ll])a (de [Vv]idro)\b/g, '$1ã $2'], [/\bLA DE VIDRO\b/g, 'LÃ DE VIDRO'],
  // "AJUSTE DE INTENSIDADE DE NEVOA" (Lucas do Rio Verde/MT)
  [/\b(DE\s+)NEVOA\b/g, '$1NÉVOA'], [/\b(de\s+)nevoa\b/g, '$1névoa'],
  // "Normas Tecnicas: In Metro" (Belo Horizonte/MG)
  [/\bIn Metro\b/g, 'Inmetro'],
  // "nao podendo considera-las como itens adicionais" (Chapadao do Sul/MS)
  [/\bconsidera-las\b/g, 'considerá-las'],
  // "contem 1 prateleira de grade" (Nova Esperanca/PR)
  [/\b([Cc])ontem(?=\s+\d)/g, '$1ontém'],
  // "Funcoes: ... auto limpante" (Sao Paulo/SP)
  [/\b([Aa])uto limpante\b/g, '$1utolimpante'], [/\bAUTO LIMPANTE\b/g, 'AUTOLIMPANTE'],
  // "COM AS SEGUINTE ESPECIFICACOES", "MESA ESMALTADA A FOGO" com crase (Minacu/GO)
  [/\bSEGUINTE ESPECIFICAÇÕES\b/g, 'SEGUINTES ESPECIFICAÇÕES'],
  [/(?<!\p{L})À FOGO\b/gu, 'A FOGO'], [/(?<!\p{L})à fogo\b/gu, 'a fogo'],
  // "VOLTAGEM: 110,220 V" (Minacu/GO): e 110/220
  [/\b(110|127),(220)\s?V\b/g, '$1/$2 V'],
  // "Aco Inox Aisi304" (Sao Paulo/SP)
  [/\b(AISI|Aisi|aisi)(\d{3})\b/g, '$1 $2'],
  // o ordinal no lugar da letra: "R-134ª" (Salto/SP), "CORRENTE: 5,5ª" (Descalvado/SP)
  // (so em gas e corrente: "10ª geracao" e ordinal de verdade)
  [/\b(R-?134)ª/g, '$1a'], [/(\d,\d)ª(?=[\s,.;]|$)/g, '$1A'], [/((?:CORRENTE|[Cc]orrente)[^.;]{0,20}?\d)ª/g, '$1A'],
  // o grau: "+2 OC E +10 OC" (Florianopolis/SC), "250ºc", "50°c e 320°c"
  // (Paranavai/PR, Mariopolis/PR), "160° C Á 300º C" (Renascenca/PR), "0,1C",
  // "+1 e +5° °C" (Paranavai/PR)
  [/(\d)\s+OC\b/g, '$1 °C'], [/(\d,\d)C\b/g, '$1 °C'],
  [/[º°]\s°C/g, '°C'],
  [/(\d)(\s?)([º°])(\s?)([cC])(?![\p{L}])/gu, (m, d, s1, g, s2, c) => g === '°' && !s2 && c === 'C' ? m : d + s1 + '°C'], [/(?<!\p{L})Á(?=\s+\d)/gu, 'A'],
  // "atingir temperatura minima de - 18°C" (Pinhal de Sao Bento/PR)
  [/\b(de )- (?=\d)/g, '$1-'],
  // decimal partido pela virgula com espaco: "(52 x 32, 5 x 42, 2) cm" (Sao Paulo/SP)
  // (um digito so: "Furacao vesa 50 x 50, 75 x 75" e lista)
  [/(\d), (\d)(?=\s*(?:x|X|×|\)))/g, '$1,$2'],
  // "BTU''S/H" (Chapadao do Sul/MS), "Dimensoes aproximadas: : (LxAxP)" (Londrina/PR)
  [/\bBTU''S\b/g, "BTU'S"], [/:\s+:/g, ':'],
  // "VENTILADOR DE TETO/PAREDE – : Equipamento novo" (Vicosa/MG)
  [/–\s*:\s*/g, '– '],
  // "destinado ao preparo de alimentos. ]Caracteristicas minimas" (Diamante D'Oeste/PR)
  [/\.\s*\](?=\p{L})/gu, '. '],
  // "dreno frontal*," (Ponta Grossa/PR): a nota de rodape que ficou sem rodape
  [/(?<=\p{L})\*(?=[,;.\s])/gu, ''],
  // "Com Selo Procel Com Selo Procel Letra a" (Santa Rita do Passa Quatro/SP)
  [/(?<![\p{L}\p{N}])((?:[\p{L}\p{N}]+ ){2,6}[\p{L}\p{N}]+) \1(?![\p{L}\p{N}])/gu, '$1'],
];

// Cria o revisor a partir dos textos dos editais da varredura, que dao a
// frequencia de cada palavra e os pares de palavras vizinhas.
export function criaRevisor(textos) {
  const pt = carregaDicionario('pt_BR');
  if (!pt) return t => t;
  const en = carregaDicionario('en_US') || (() => false);
  const freq = new Map(), pares = new Map();
  for (const texto of textos) {
    let ant = null;
    for (const m of String(texto).matchAll(PALAVRA)) {
      const w = m[0].toLowerCase();
      freq.set(w, (freq.get(w) || 0) + 1);
      const s = tiraAcento(w);
      if (ant !== null) { const k = ant + ' ' + s; pares.set(k, (pares.get(k) || 0) + 1); }
      ant = s;
    }
  }
  const f = w => freq.get(w.toLowerCase()) || 0;
  // Palavras boas por chave sem acento: "potencia" -> "potência".
  const porChave = new Map();
  for (const [w, n] of freq) {
    if (n < 5 || w.length < 4 || !/^[a-zà-ÿ]+$/.test(w) || !pt(w)) continue;
    const k = tiraAcento(w), c = porChave.get(k);
    if (!c || c.n < n) porChave.set(k, { forma: w, n: Math.max(n, c ? c.n : 0) });
  }
  // A forca da palavra conta singular e plural: "parafuso" sozinho aparece
  // pouco, "parafusos" muito (Salto/SP, "Kit Parafuro").
  const nChave = k => (porChave.get(k) || { n: 0 }).n;
  const forca = k => nChave(k) + nChave(k + 's') + (k.endsWith('s') ? nChave(k.slice(0, -1)) : 0);
  // A palavra existe com outro acento? "valvulas" -> "válvulas": nao e erro de
  // digitacao, e texto sem acento. Ate duas letras acentuadas.
  const acentoResolve = w => {
    const s = tiraAcento(w.toLowerCase());
    if (s !== w.toLowerCase() && pt(s)) return true;
    const pos = [...s].map((c, i) => COM_ACENTO[c] ? i : -1).filter(i => i >= 0);
    const troca = (str, i, c) => str.slice(0, i) + c + str.slice(i + 1);
    for (let x = 0; x < pos.length; x++) {
      for (const cx of COM_ACENTO[s[pos[x]]]) {
        const um = troca(s, pos[x], cx);
        if (pt(um)) return true;
        for (let y = x + 1; y < pos.length; y++) for (const cy of COM_ACENTO[s[pos[y]]]) if (pt(troca(um, pos[y], cy))) return true;
      }
    }
    return false;
  };
  const conhecida = w => pt(w) || acentoResolve(w) || en(w) || en(w.toLowerCase());
  // O ACENTO que o edital nao escreveu: o catalogo da Prefeitura de Sao Paulo
  // grava tudo sem acento ("Com Acabamento Em Aco Esmaltado", "No Balcao",
  // "Cesto Removivel", "Potencia Minima"), e Diamante D'Oeste/PR escreve
  // "alimentacao eletrica", "regulavel". Poe o acento quando a forma acentuada
  // e a unica do dicionario e aparece nos editais — e, se a forma sem acento
  // tambem e palavra ("potencia", verbo; "maquina"), so quando a acentuada e
  // pelo menos cinco vezes mais comum: "acompanha" e "fluido" ficam como estao.
  const restauraAcento = w => {
    if (!/^[A-Za-z]{3,}$/.test(w)) return null;
    const s = w.toLowerCase(), valida = pt(s);
    if (valida && s.length < 4) return null;
    const pos = [...s].map((c, i) => COM_ACENTO[c] ? i : -1).filter(i => i >= 0);
    const troca = (str, i, c) => str.slice(0, i) + c + str.slice(i + 1);
    const achadas = new Set();
    // A palavra que nao existe sem acento pode ganhar a forma do dicionario
    // mesmo rara nos editais ("homogenea", "cilindrica", "laticinios"), salvo
    // quando e ingles ou nome proprio: "Consul" nao vira "Cônsul".
    const minimo = valida || s.length < 5 || en(s) || (w[0] !== w[0].toLowerCase() && w.slice(1) !== w.slice(1).toUpperCase()) ? 5 : s.length >= 10 ? 0 : 1;
    const olha = x => { if (f(x) >= minimo && pt(x)) achadas.add(x); };
    for (let x = 0; x < pos.length; x++) {
      for (const cx of COM_ACENTO[s[pos[x]]]) {
        if (cx === 'ü') continue;
        const um = troca(s, pos[x], cx);
        olha(um);
        for (let y = x + 1; y < pos.length; y++) for (const cy of COM_ACENTO[s[pos[y]]]) if (cy !== 'ü') olha(troca(um, pos[y], cy));
      }
    }
    if (!achadas.size) return null;
    const ordem = [...achadas].sort((a, b) => f(b) - f(a));
    if (ordem.length > 1 && f(ordem[0]) < 5 * f(ordem[1])) return null;
    if (valida && f(ordem[0]) < 5 * Math.max(1, f(s))) return null;
    // "complementa" nao e "complementá", que so existe antes do pronome
    // ("complementá-lo"): palavra valida nao ganha acento na ultima letra.
    if (valida && /[À-ÿ]$/.test(ordem[0]) && (f(ordem[0]) < 50 || f(ordem[0]) < 20 * Math.max(1, f(s)))) return null;
    return caixa(w, ordem[0]);
  };
  // Nem a palavra presa por hifen a sigla ou a ingles: "MEDIA-SD", "Li-ion",
  // "gas-ballast".
  const presaAEstrangeira = (texto, ini, fim) => {
    const a = texto.slice(Math.max(0, ini - 20), ini).match(/(\p{L}+)-$/u);
    const d = texto.slice(fim, fim + 20).match(/^-(\p{L}+)/u);
    return [a, d].some(m => m && (m[1].length <= 2 || (en(m[1].toLowerCase()) && !pt(m[1].toLowerCase()))));
  };
  const acentuaNoTexto = (w, texto, pos) => presaAEstrangeira(texto, pos, pos + w.length) ? null : restauraAcento(w);
  // Palavra com acento pela metade: "alimentaçao" (Diamante D'Oeste/PR),
  // "freqüência" do trema que caiu. Texto todo sem acento fica como esta — so
  // mexe na palavra que ja tem acento e tem a forma certa comum nos editais.
  const acentua = w => {
    if (!/[À-ÿ]/.test(w) || pt(w)) return null;
    const s = tiraAcento(w.toLowerCase());
    const pos = [...s].map((c, i) => COM_ACENTO[c] ? i : -1).filter(i => i >= 0);
    const troca = (str, i, c) => str.slice(0, i) + c + str.slice(i + 1);
    const achadas = new Set();
    const olha = x => { if (f(x) >= 5 && pt(x)) achadas.add(x); };
    olha(s);
    for (let x = 0; x < pos.length; x++) {
      for (const cx of COM_ACENTO[s[pos[x]]]) {
        const um = troca(s, pos[x], cx);
        olha(um);
        for (let y = x + 1; y < pos.length; y++) for (const cy of COM_ACENTO[s[pos[y]]]) olha(troca(um, pos[y], cy));
      }
    }
    return achadas.size === 1 ? caixa(w, [...achadas][0]) : null;
  };
  // Uma edicao de letra. A primeira letra so pode faltar ("estinada" ->
  // "destinada") ou estar dobrada ("IImpressora"); troca-la e o que separa
  // marca de palavra ("Kobra", "Minipa"). A ULTIMA letra nao se tira e nao se
  // acrescenta, so se troca ("COM MANUAM DE OPERACOES", Florianopolis/SC):
  // palavra que acaba antes e abreviatura ou pedaco — "Sem Paraf," nao e "Sem
  // Para,", "1,90M DE COMPR." nao e "COMPRA", e "contra poeir a." e a palavra
  // partida, nao "poeira a.".
  const edicoes = s => {
    const r = new Set();
    for (let i = 0; i < s.length; i++) {
      if (i < s.length - 1 && (i > 0 || s[1] === s[0])) r.add(s.slice(0, i) + s.slice(i + 1));
      if (i > 0 && i < s.length - 1) r.add(s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2));
      for (const c of LETRAS) {
        if (i > 0 && i < s.length) r.add(s.slice(0, i) + c + s.slice(i + 1));
        r.add(s.slice(0, i) + c + s.slice(i));
      }
    }
    r.delete(s);
    return r;
  };
  const caixa = (modelo, w) => modelo === modelo.toUpperCase() ? w.toUpperCase()
    : modelo[0] === modelo[0].toUpperCase() ? w[0].toUpperCase() + w.slice(1) : w;
  const vizinhas = (texto, ini, fim) => {
    const a = texto.slice(Math.max(0, ini - 40), ini).match(/([\p{L}\p{N}]+)[^\p{L}\p{N}]*$/u);
    const d = texto.slice(fim, fim + 40).match(/^[^\p{L}\p{N}]*([\p{L}\p{N}]+)/u);
    return [a ? tiraAcento(a[1].toLowerCase()) : null, d ? tiraAcento(d[1].toLowerCase()) : null];
  };
  // Correcao de digitacao, ou null.
  function corrige(w, texto, ini, fim) {
    if (w.length < 4 || pt(w)) return null;
    if (/\p{Ll}\p{Lu}/u.test(w) || /\p{Lu}{2}\p{Ll}/u.test(w.slice(1))) return null;
    const s = tiraAcento(w.toLowerCase());
    if (!/^[a-z]+$/.test(s)) return null;
    const [ant, dep] = vizinhas(texto, ini, fim);
    const cands = [];
    for (const e of edicoes(s)) {
      const c = porChave.get(e);
      if (!c || forca(e) < 12 || forca(e) < 10 * f(w)) continue;
      // o termo em ingles entre parenteses depois da palavra em portugues:
      // "TECNOLOGIA DE IMAGEM (IMAGER)" (Birigui/SP)
      if (e === ant) continue;
      const prova = (ant && pares.get(ant + ' ' + e) || 0) + (dep && pares.get(e + ' ' + dep) || 0);
      // palavra de quatro letras precisa das duas vizinhas: "com faxa minima"
      if (w.length === 4 && !((ant && pares.get(ant + ' ' + e)) && (dep && pares.get(e + ' ' + dep)))) continue;
      if (prova) cands.push({ ...c, chave: e, prova });
    }
    if (!cands.length || conhecida(w)) return null;
    cands.sort((a, b) => b.prova - a.prova || b.n - a.n);
    if (cands.length > 1 && cands[0].prova < 3 * cands[1].prova) return null;
    return caixa(w, cands[0].forma);
  }
  const FUNCIONAIS = ['de', 'do', 'da', 'dos', 'das', 'ou', 'o', 'a', 'e', 'em', 'com', 'para', 'no', 'na', 'sem'];
  // Palavra curta colada na seguinte: "Dechave" -> "De chave", "OUMECANICO" ->
  // "OU MECANICO". Uma separacao so, e a segunda parte comum nos editais.
  // Cedilha que a extracao trocou por "g" ou "q": "ESPECIFICAQAO", "SERVIQO",
  // "Atengão", "trituragao" (mesmos anexos da BLL). So troca quando a palavra
  // nao existe e a trocada existe: "fogao" vira "fogão" pelo acento, nunca
  // "foção".
  function cedilha(w) {
    const lw = w.toLowerCase();
    // no meio da palavra: "avangadas" -> "avançadas" (Guia Lopes da Laguna/MS)
    if (lw.length >= 6 && /[gq][aou]/.test(lw) && !pt(lw) && !/[gq](?:ão|ao|ões|oes|o)$/.test(lw)) {
      for (let i = 1; i < lw.length - 1; i++) {
        if (!/[gq]/.test(lw[i]) || !/[aou]/.test(lw[i + 1])) continue;
        const c = lw.slice(0, i) + 'ç' + lw.slice(i + 1);
        if (!(pt(c) || f(c) >= 2)) continue;
        if (w === w.toUpperCase()) return c.toUpperCase();
        return w[0] === w[0].toUpperCase() ? c[0].toUpperCase() + c.slice(1) : c;
      }
      return null;
    }
    if (!/[gq](?:ão|ao|ões|oes|o)$/.test(lw) || pt(lw)) return null;
    // com o til a palavra ja existe ("fogao" -> "fogão", "pregao"): o erro e
    // so o acento, e quem resolve e o acentua
    if (pt(lw.replace(/ao$/, 'ão')) || pt(lw.replace(/oes$/, 'ões'))) return null;
    const alta = w === w.toUpperCase();
    const cands = [
      lw.replace(/[gq](ão|ao)$/, 'ção'),
      lw.replace(/[gq](ões|oes)$/, 'ções'),
      lw.replace(/[gq]o$/, 'ço'),
    ];
    for (const c of cands) {
      if (c === lw || !pt(c)) continue;
      if (alta) return c.toUpperCase();
      return w[0] === w[0].toUpperCase() ? c[0].toUpperCase() + c.slice(1) : c;
    }
    return null;
  }

  function separa(w) {
    if (w.length < 6 || pt(w) || f(w) > 3) return null;
    if (/\p{Ll}\p{Lu}/u.test(w)) return null;
    const achadas = [];
    for (const p of FUNCIONAIS) {
      if (!w.toLowerCase().startsWith(p)) continue;
      const resto = w.slice(p.length);
      // e o par separado existe nos editais: "de chave", "ou mecanico", "o
      // produto". "Kit Parafuro" nao vira "Para furo".
      if (resto.length >= 4 && pt(resto) && f(resto) >= 5 && (pares.get(p + ' ' + tiraAcento(resto.toLowerCase())) || 0) >= 2) achadas.push(w.slice(0, p.length) + ' ' + resto);
    }
    return achadas.length === 1 && !conhecida(w) ? achadas[0] : null;
  }
  const boa = (w, texto, ini, fim) => (pt(w) || acentoResolve(w)) ? w : corrige(w, texto, ini, fim);

  return function revisa(texto) {
    if (!texto) return texto;
    let t = String(texto)
      // A unidade que o catalogo do PNCP poe depois do valor que ja a traz:
      // "De 0 °C A -25 °C°C", "Tensao Alimentacao: 110/220vV" (Belo Horizonte/MG).
      .replace(/°C\s?°C\b/g, '°C')
      .replace(/(\d)vV\b/g, '$1V')
      // o acento agudo solto no lugar do apostrofo: "24.000 BTU´s" (Nova Fatima/PR)
      .replace(/([A-Za-z])´([sS])\b/g, "$1'$2")
      // "Caracteristicas Adicionais: Fost Free" (Jaraguari/MS): quatro letras
      // sao curtas demais para a regra geral, e o termo e sempre o mesmo.
      .replace(/\b(F)(OST|ost)(?=\s+(?:FREE|Free|free)\b)/g, (_, a, b) => a + (b === 'OST' ? 'R' : 'r') + b);
    // Erros que formam outra palavra, ou que a regra geral nao prova por serem
    // raros demais nos editais. Cada um so no contexto em que e erro.
    for (const [re, por] of REPAROS) t = t.replace(re, por);
    // Palavra colada no numero: "Automatico140 litros", "altura1,76 metros",
    // "GARANTIA MINIMA DE12 MESES", "timer 60minutos", "8litros".
    t = t.replace(/(?<![\p{L}\p{N}])(\p{L}{4,})(\d+(?:[.,]\d+)?)(?![\p{L}\p{N}])/gu, (tudo, l, n, pos) => {
      // sigla com numero: "teclado ABNT2", "isolamento EPS1"
      if (/\p{Ll}\p{Lu}|\p{Lu}\p{Ll}+\p{Lu}/u.test(l) || (l.length <= 5 && l === l.toUpperCase())) return tudo;
      const b = boa(l, t, pos, pos + l.length);
      return b ? b + ' ' + n : tudo;
    });
    t = t.replace(/(?<![\p{L}\p{N}])(DE|De|de|COM|Com|com)(\d{1,3})(?=\s+(?:MESES|meses|Meses|ANOS|anos|Anos|LITROS|litros|Litros|HORAS|horas|Horas|DIAS|dias|Dias)\b)/g, '$1 $2');
    t = t.replace(/(?<![\p{L}\p{N}])(\d+(?:[.,]\d+)?)(\p{Ll}{5,}|\p{Lu}{5,})(?![\p{L}\p{N}])/gu, (tudo, n, l, pos) => {
      const ini = pos + n.length;
      const b = boa(l, t, ini, ini + l.length);
      return b ? n + ' ' + b : tudo;
    });
    // "C/bordas Rebatidasp/lado Interno" (Sao Paulo/SP): o "p/" de "para".
    t = t.replace(/(?<![\p{L}])(\p{L}{4,})p\/(?=\p{L})/gu, (tudo, l) => pt(l) && !pt(l + 'p') ? l + ' p/' : tudo);
    // Palavra curta colada e erro de digitacao.
    t = t.replace(/(?<![\p{L}\p{N}])\p{L}{4,}(?![\p{L}\p{N}])/gu, (w, pos) => {
      const c = cedilha(w) || acentua(w) || acentuaNoTexto(w, t, pos) || corrige(w, t, pos, pos + w.length);
      if (c) return c;
      const sep = separa(w);
      if (!sep) return w;
      // No meio da frase a palavra curta vai em minuscula: "Atraves de chave
      // Seletora", "Que Proteja o produto" — e nao "De chave", "O produto".
      const [cur, resto] = sep.split(' ');
      const meio = /[\p{L}\p{N},]\s*$/u.test(t.slice(Math.max(0, pos - 3), pos));
      return meio && w !== w.toUpperCase() ? cur.toLowerCase() + ' ' + resto : sep;
    });
    // O acento nas palavras de tres letras, que a passada acima nao olha: "Aco
    // Inox", "gas GLP", "Pes Com Sapatas", "Nao". E o "pre-" dos compostos.
    t = t.replace(/(?<![\p{L}\p{N}])\p{L}{3}(?![\p{L}\p{N}])/gu, (w, pos) => acentuaNoTexto(w, t, pos) || w)
      .replace(/(?<![\p{L}])(P|p)re-(?=\p{L})/gu, '$1ré-').replace(/(?<![\p{L}])PRE-(?=\p{L})/gu, 'PRÉ-');
    // Espaco que o edital esqueceu depois da pontuacao: "copo em aco
    // inoxidavel,motor", "8 VELOCIDADES,3 BATEDORES,TRAVAS", "BRASILEIRO.FORNECIMENTO",
    // "Capacidade Total:Minima", "(alp)com tecnologia". Numero decimal ("2,5"),
    // endereco ("Compras.gov.br") e medida depois do parentese ("(96 x 135 x
    // 78)cm") ficam como estao.
    return t
      .replace(/(?<=[\p{L}\d)])([,;])(?=\p{L})/gu, '$1 ')
      .replace(/(?<=\p{L}),(?=\d)/gu, ', ')
      .replace(/(?<=[\p{Ll}\d]|\p{Lu}{3}|\/h)\.(?=\p{Lu}\p{L}{2})/gu, '. ')
      .replace(/(?<=\p{L}):(?=\p{L}{3})/gu, ': ')
      .replace(/\)(?=\p{L}{2,})(?!(?:cm|mm|m|kg|g|l|L|V|W|Cm|CM|MM)\b)/gu, ') ')
      // "tensao:127V", "Potencia: 850W;12 Velocidades" (Nova Tebas/PR)
      .replace(/(?<=\p{L}):(?=\d)/gu, ': ')
      .replace(/(?<=\p{L});(?=\d)/gu, '; ')
      // "VENTILADOR DE PAREDE.diametro de grade: 50 a 60 cm;.numero de pas"
      // (Londrina/PR), "Air Fryer.15 Litros" (Mariopolis/PR), "RPM.." e "alta resistencia,."
      .replace(/,\./g, '.')
      .replace(/;\.(?=\p{L})/gu, '; ')
      .replace(/;\.(?=\s|$)/g, '.')
      .replace(/(?<!\.)\.\.(?!\.)/g, '.')
      .replace(/(?<=\p{Lu}{3})\.(?=\p{Ll}{3})/gu, '. ')
      .replace(/(?<=\p{Ll}{3})\.(?=\d)/gu, '. ')
      // parentese colado na palavra: "evaporadora(dba)", "42 CM(CONSUMO",
      // "MICRO-ONDAS(26 A 30L)". O plural entre parenteses fica: "grade(s)".
      .replace(/(?<=\p{L}{3})\((?!(?:[sS]|[eEiInNaAoO][sS]|[aAoO])\))/gu, ' (')
      // "( CODIGO DE DEFESA DO CONSUMIDOR)" (Renascenca/PR)
      .replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
  };
}
