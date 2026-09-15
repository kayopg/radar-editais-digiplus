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
  // marca de palavra ("Kobra", "Minipa"). A ULTIMA letra nao se tira, nao se
  // troca e nao se acrescenta: palavra que acaba antes e abreviatura ou pedaco
  // — "Sem Paraf," nao e "Sem Para,", "1,90M DE COMPR." nao e "COMPRA", e
  // "contra poeir a." e a palavra partida, nao "poeira a.".
  const edicoes = s => {
    const r = new Set();
    for (let i = 0; i < s.length; i++) {
      if (i < s.length - 1 && (i > 0 || s[1] === s[0])) r.add(s.slice(0, i) + s.slice(i + 1));
      if (i > 0 && i < s.length - 1) r.add(s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2));
      for (const c of LETRAS) {
        if (i > 0 && i < s.length - 1) r.add(s.slice(0, i) + c + s.slice(i + 1));
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
      const prova = (ant && pares.get(ant + ' ' + e) || 0) + (dep && pares.get(e + ' ' + dep) || 0);
      // palavra de quatro letras precisa das duas vizinhas: "com faxa minima"
      if (w.length === 4 && !((ant && pares.get(ant + ' ' + e)) && (dep && pares.get(e + ' ' + dep)))) continue;
      if (prova) cands.push({ ...c, chave: e, prova });
    }
    if (!cands.length || conhecida(w)) return null;
    cands.sort((a, b) => b.prova - a.prova || b.n - a.n);
    if (cands.length > 1 && cands[0].prova < 3 * cands[1].prova) return null;
    const escolhida = /[À-ÿ]/.test(texto) ? cands[0].forma : cands[0].chave;
    return caixa(w, escolhida);
  }
  const FUNCIONAIS = ['de', 'do', 'da', 'dos', 'das', 'ou', 'o', 'a', 'e', 'em', 'com', 'para', 'no', 'na', 'sem'];
  // Palavra curta colada na seguinte: "Dechave" -> "De chave", "OUMECANICO" ->
  // "OU MECANICO". Uma separacao so, e a segunda parte comum nos editais.
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
      // "Caracteristicas Adicionais: Fost Free" (Jaraguari/MS): quatro letras
      // sao curtas demais para a regra geral, e o termo e sempre o mesmo.
      .replace(/\b(F)(OST|ost)(?=\s+(?:FREE|Free|free)\b)/g, (_, a, b) => a + (b === 'OST' ? 'R' : 'r') + b);
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
      const c = acentua(w) || corrige(w, t, pos, pos + w.length);
      if (c) return c;
      return separa(w) || w;
    });
    return t;
  };
}
