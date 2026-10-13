// O LOTE de cada item, quando o edital e julgado por lote ou grupo.
//
// O usuario pediu em 07/10/2026 que o card mostre o lote inteiro — tambem os
// itens que a Digiplus nao cota (instalacao, tubulacao, bomba de dreno...),
// porque quem leva o lote leva tudo —, e so dos lotes que tem produto nosso.
// E pediu "um metodo de ler os lotes sem risco".
//
// O PNCP nao tem campo de lote: a API da a lista corrida de itens, e quem
// separa em lotes e o texto do edital. Ler a tabela do edital pelo cabecalho
// "LOTE N" deu confirmacao FALSA na prova (Pato Branco/PR: os 33 itens num lote
// so). O que nao erra e o VALOR: muitos editais imprimem o total de cada lote
// ("Valor total do lote 01 86.747,97", Joinville/SC; "VALOR TOTAL MAXIMO
// ADMITIDO PARA O LOTE Nº 04 28.989,45", Uniao da Vitoria/PR), e o PNCP da a
// quantidade e o preco de cada item. O lote so e aceito quando os itens, em
// blocos seguidos, somam CENTAVO POR CENTAVO os totais impressos — todos os
// lotes, cada um uma vez — e a divisao e a UNICA possivel.
//
// Sem essa confirmacao o lote nao e lido. Nesse caso (decisao do usuario,
// 07/10/2026) o card mostra todos os itens do edital.

export const POR_LOTE = /(?:menor preco|julgamento|adjudicac[a-z]*|criterio)[^.;]{0,60}\bpor (?:lote|grupo)\b|menor preco global por (?:lote|grupo)/;

// O edital e por lote? O que ele DECLARA vale mais que o POR_LOTE solto, que
// casava com a lei citada ("o criterio de julgamento de menor preco por grupo
// de itens somente podera ser adotado quando...", Senador Canedo/GO) e com a
// justificativa do contrario ("nao se justifica a adjudicacao por grupo",
// Anapolis/GO; "analise sobre o julgamento por item ou por lote", Pato
// Branco/PR) — os tres declaram "menor preco por item", e o card mostrava o
// edital inteiro em cinza (09/10/2026). Com a declaracao "julgamento/tipo/
// criterio: menor preco por item" e nenhuma "por lote/grupo", nao e por lote.
// texto: ja normalizado (sem acento, minusculo).
const DECLARA = /(?:criterio de julgamento|julgamento|tipo|criterio)\s*(?:sera|e|:|-|–)?\s*(?:o\s+|pelo\s+|de\s+|do\s+|\(\s*)*menor preco,?\s*(?:global\s+)?por (item|lote|grupo)/g;
// (a lei citada tambem tem a forma de declaracao: "o criterio de julgamento de
// menor preco por grupo de itens somente podera ser adotado quando...")
const CITA_A_LEI = m => /somente podera|podera ser adotado|so podera|sera admitid[oa] (?:somente|apenas)/.test(m.input.slice(m.index + m[0].length, m.index + m[0].length + 70))
  || /nao se justifica|art\.?\s*82|§|inviabilidade/.test(m.input.slice(Math.max(0, m.index - 70), m.index));
export function vendaPorLote(texto) {
  const t = String(texto);
  // (a trava da lei citada so vale para "por lote/grupo": a declaracao "por item"
  // logo depois de "nao se justifica a adjudicacao por grupo" continua valendo)
  const declarado = new Set([...t.matchAll(DECLARA)].filter(m => m[1] === 'item' || !CITA_A_LEI(m)).map(m => (m[1] === 'item' ? 'item' : 'lote')));
  if (declarado.has('lote')) return true;
  if (declarado.has('item')) return false;
  return POR_LOTE.test(t);
}

const valor = s => +s.replace(/\./g, '').replace(',', '.');

// {lote: Set(valores)} com os totais por lote impressos no texto do edital
// (e o total impresso DEPOIS dos itens do lote, antes do cabecalho do
// seguinte: "Lote : 0001 ... PRECO MAXIMO DO LOTE : 5.345,01 Lote : 0002"
// (Toledo/PR), "Lote: 1 - Lote 001 ... TOTAL 10.344,72 Lote: 2" (Rio Azul/PR),
// "LOTE 01 – ... Valor Total Estimado R$ 42.590,28 II – LOTE 02" (Divinopolis
// de Goias/GO), 09/10/2026. O lote e o do ultimo cabecalho antes do total; o
// numero que segue "LOTE :" e e o comeco de um valor ("LOTE : 5.345,01") nao e
// cabecalho. Um total no lote errado so deixa de confirmar: quem confirma e a
// soma dos itens, centavo por centavo.)
const CABECALHO_LOTE = /\blote\s*(?::\s*|n[º°o.]*\s*)?0*(\d{1,3})\b(?![.,]\d)/gi;
const TOTAL_DEPOIS = /(?:pre[cç]o m[aá]ximo do lote|\btotal(?:\s+estimado)?(?:\s+do\s+lote)?)\s*:?\s*(?:r\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d{1,6}),\d{2})(?!\d)/gi;
export function totaisPorLote(texto) {
  const re = /(?:total|global)\b[^0-9.;]{0,45}?\b(?:lote|grupo)\s*(?:n[º°o.]*\s*)?0*(\d{1,3})\b[^0-9]{0,30}?((?:\d{1,3}(?:\.\d{3})+|\d{1,6}),\d{2})(?!\d)/gi;
  const t = {};
  for (const m of String(texto).matchAll(re)) (t[+m[1]] ||= new Set()).add(valor(m[2]));
  if (Object.keys(t).length) return t;
  const cabs = [...String(texto).matchAll(CABECALHO_LOTE)].map(m => ({ i: m.index, l: +m[1] }));
  if (cabs.length < 2) return t;
  for (const m of String(texto).matchAll(TOTAL_DEPOIS)) {
    let c = null;
    for (const x of cabs) { if (x.i < m.index) c = x; else break; }
    if (c && m.index - c.i < 20000) (t[c.l] ||= new Set()).add(valor(m[1]));
  }
  return t;
}

// O LOTE NO NOME DO ITEM, como o orgao cadastrou no PNCP: "LOTE 9 - Telha de
// fibrocimento", "LOTE 2 - Fogao industrial - 6 bocas" (Cruzaltense/RS, edital
// 35/2026, 09/10/2026), "Lote 1 - Grades de Isolamento" (Porto Alegre/RS, 340).
// E a fonte mais direta que ha, e a numeracao do PNCP nem segue a dos lotes
// (em Cruzaltense o item 7 e a mesa do lote 1). So vale com TODOS os itens
// trazendo o lote no nome.
// itens: [{ n, rot }]. Devolve Map(n -> lote) ou null.
export function lotesPeloRotulo(itens) {
  if (itens.length < 2) return null;
  const res = new Map();
  for (const x of itens) {
    const m = /^\s*(?:lote|grupo)\s*0*(\d{1,3})\s*[-–:]/i.exec(String(x.rot || ''));
    if (!m) return null;
    res.set(x.n, +m[1]);
  }
  return new Set(res.values()).size >= 2 ? res : null;
}

// A COLUNA DO LOTE na frente de cada linha da tabela: "Lote Un Quant.
// Descricao dos Itens Valor de Referencia R$ 1 Un 02 APARELHO DE AR
// CONDICIONADO ... 2 Un 03 AUTOCLAVE ..." (Sapiranga/RS, pregao 74/2026,
// 09/10/2026: 27 lotes de um item cada, e o card mostrava os 27 itens, 24 em
// cinza). Vale quando a linha k da tabela e o item k do PNCP com a MESMA
// quantidade, para todos os itens, e o lote comeca em 1 e cresce de um em um.
// itens: [{ n, qtd }] na ordem do PNCP. Devolve Map(n -> lote) ou null.
export function lotesPelaColunaDoLote(itens, texto) {
  const t = String(texto);
  if (itens.length < 2) return null;
  for (const cab of t.matchAll(/\bLote\s+(?:Un|Unid\.?|Und|UN)\s+Quant/gi)) {
    const linhas = [...t.slice(cab.index, cab.index + 80000).matchAll(/(?:^|\s)(\d{1,3})\s+(?:Un|UN|Und|UND|Unid|Pç|PÇ|Cj|CJ|Kit|KIT|Par|PAR|Cx|CX|Jg|JG)\.?\s+(\d{1,5})\s+(?=[A-ZÀ-Ú]{2})/g)];
    if (linhas.length < itens.length) continue;
    const res = new Map();
    let ok = true, ultimo = 0;
    itens.forEach((x, k) => {
      const [, l, q] = linhas[k];
      if (!ok || +q !== Math.round(+x.qtd || 0) || !(+l === ultimo || +l === ultimo + 1)) { ok = false; return; }
      ultimo = +l; res.set(x.n, +l);
    });
    if (ok && ultimo >= 2) return res;
  }
  return null;
}

const normL = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// A LINHA QUE TRAZ O LOTE, com a numeracao do EDITAL, que nao e a do PNCP:
// "LOTE04 81 02.01333 - VENTILADOR TETO 3 PAS 20 UN Ampla Concorrencia" e o
// item 122 do PNCP, "VENTILADOR TETO 3 PAS", 20 unidades (Tupi Paulista/SP,
// edital 42/2026, 09/10/2026). O item do PNCP e achado pelo NOME e pela
// QUANTIDADE; vale quando todos os itens acham a sua linha, num lote so.
// itens: [{ n, rot, qtd }]. Devolve Map(n -> lote) ou null.
export function lotesPelaLinhaComLote(itens, texto) {
  const lotesDe = new Map();
  for (const m of String(texto).matchAll(/[Ll][Oo][Tt][Ee]\s*0*(\d{1,3})\s+\d{1,4}\s+\d{2}\.\d{5}\s*-\s*(.+?)\s+(\d[\d.]*)\s+[A-ZÀ-Ú]{1,4}\.?(?=\s+(?:Ampla|Exclusiv|Cota|Reserv))/g)) {
    const chave = normL(m[2]) + '|' + Math.round(+m[3].replace(/\./g, ''));
    if (!lotesDe.has(chave)) lotesDe.set(chave, new Set());
    lotesDe.get(chave).add(+m[1]);
  }
  if (!lotesDe.size || itens.length < 2) return null;
  const res = new Map();
  for (const x of itens) {
    const s = lotesDe.get(normL(x.rot) + '|' + Math.round(+x.qtd || 0));
    if (!s || s.size !== 1) return null;
    res.set(x.n, [...s][0]);
  }
  return new Set(res.values()).size >= 2 ? res : null;
}

// As FAIXAS DE ITENS de cada lote: "LOTE ITEM OBJETO ... 1 01 ao 03 Materiais
// Permanentes ... 25% EXCLUSIVA LOTE ITEM ... 02 Itens 04 ao 15 ... 75% AMPLA"
// (Sao Paulo/SP, pregao 33/DRE-MP/2026, 09/10/2026). Vale quando as faixas
// cobrem todos os itens, cada um uma vez, e cada lote tem um beneficio so.
// itens: [{ n, benef }]. Devolve Map(n -> lote) ou null.
export function lotesPorFaixa(itens, texto) {
  const t = String(texto);
  const faixas = new Map();
  for (const cab of t.matchAll(/\bLOTE\s+ITEM\b/gi)) {
    const m = /^[^]{0,160}?(?:^|\s)0*(\d{1,2})\s+(?:Itens?\s+)?0*(\d{1,3})\s+(?:ao|a|até|à)\s+0*(\d{1,3})\b/i.exec(t.slice(cab.index + cab[0].length, cab.index + cab[0].length + 200));
    if (m) faixas.set(+m[1], [+m[2], +m[3]]);
  }
  if (faixas.size < 2) return null;
  const res = new Map();
  for (const [l, [a, b]] of faixas) for (let n = a; n <= b; n++) { if (res.has(n)) return null; res.set(n, l); }
  if (res.size !== itens.length || itens.some(x => !res.has(x.n))) return null;
  const benefDe = {};
  for (const x of itens) {
    const l = res.get(x.n);
    if (benefDe[l] === undefined) benefDe[l] = x.benef || '';
    else if (benefDe[l] !== (x.benef || '')) return null;
  }
  return res;
}

// As SECOES de cada lote, com os itens renumerados dentro dela: "LOTE 01 -
// EQUIPAMENTOS DE TECNOLOGIA DA INFORMACAO ITEM PRODUTO / DESCRICAO ... 1.
// COMPUTADOR ... 2. COMPUTADOR ... 3. COMPUTADOR COMPLETO ... LOTE 02 - LOUSA
// INTERATIVA DIGITAL ... 1. LOUSA ..." (Ivai/PR, edital 38/2026, 09/10/2026).
// Os lotes tem de vir em sequencia (1, 2, 3...), e os itens do PNCP, na ordem,
// tem de achar cada um o seu "k. <duas primeiras palavras do nome>" na secao
// em que estao ou na seguinte. Dentro do lote a ordem pode mudar (no lote 8 de
// Ivai o 2 e o freezer e o 3 a batedeira; no PNCP a batedeira vem antes), mas
// cada secao tem de usar exatamente as posicoes 1, 2, ..., m, sem pular nem
// repetir, e todas as secoes tem de receber item.
// itens: [{ n, rot }] na ordem do PNCP. Devolve Map(n -> lote) ou null.
export function lotesPorSecao(itens, texto) {
  const t = String(texto);
  const cabs = [...t.matchAll(/\bLOTE\s+0*(\d{1,2})\s*[-–]\s*(?=[A-ZÀ-Ú])/g)].map(m => ({ l: +m[1], i: m.index, fim: m.index + m[0].length }));
  // cada "LOTE 01" comeca uma sequencia candidata (o indice do edital pode
  // listar os lotes antes das secoes)
  const seqs = [];
  for (const c of cabs) {
    if (c.l === 1) seqs.push([c]);
    else if (seqs.length && c.l === seqs[seqs.length - 1].length + 1) seqs[seqs.length - 1].push(c);
  }
  const inicio = x => normL(x.rot).split(' ').slice(0, 2).join(' ');
  for (const seq of seqs) {
    if (seq.length < 2) continue;
    const secs = seq.map((c, k) => ' ' + normL(t.slice(c.fim, k + 1 < seq.length ? seq[k + 1].i : c.fim + 15000)));
    const usadas = secs.map(() => new Set());
    const acha = (s, x) => { for (let k = 1; k <= 60; k++) if (!usadas[s].has(k) && secs[s].includes(' ' + k + '. ' + inicio(x))) return k; return 0; };
    const res = new Map();
    let s = 0;
    for (const x of itens) {
      let k = acha(s, x);
      if (!k && s + 1 < secs.length && usadas[s].size) { k = acha(s + 1, x); if (k) s++; }
      if (!k) break;
      usadas[s].add(k);
      res.set(x.n, seq[s].l);
    }
    const semBuraco = u => u.size && Math.max(...u) === u.size;
    if (res.size === itens.length && s === secs.length - 1 && usadas.every(semBuraco)) return res;
  }
  return null;
}

// O GRUPO pela TABELA do termo de referencia, quando ela tem a coluna do grupo
// na frente: "GRUPO ITEM COD. GRP DESCRICAO ... 1 1 61264 APARELHO DE AR
// CONDICIONADO ... 24 2 67021 GRADE ... 2 3 61265 APARELHO ... 1 4 67021
// GRADE" (Caxias do Sul/RS, pregao 145/2026, 09/10/2026: no Compras.gov.br,
// grupo 1 = itens 1 e 2, grupo 2 = itens 3 e 4, e o edital nao imprime os
// totais por grupo). A celula do grupo e mesclada e so aparece na primeira
// linha dele: o numero antes do item abre grupo novo quando e o PROXIMO da
// sequencia (1, 2, 3...); senao e a quantidade da linha de cima ("24 2") e o
// item continua no grupo.
//
// Para nao repetir a confirmacao falsa de Pato Branco, so vale quando: todos
// os itens do PNCP aparecem, na ordem, cada um com o codigo do item; ha dois
// grupos ou mais; as copias da tabela no edital (o termo e a minuta) dao a
// mesma divisao; e os itens de cada grupo tem o mesmo beneficio no PNCP (o
// grupo exclusivo de ME/EPP e todo exclusivo).
// E quando o numero antes do item e o proximo grupo E a quantidade do item de
// cima ao mesmo tempo ("... UN 2 2 67021 GRADE"), nao ha como saber qual dos
// dois e: a copia da tabela e recusada inteira.
// itens: [{ n, benef, qtd }] na ordem do PNCP. Devolve Map(n -> grupo) ou null.
export function lotesPelaTabelaDeGrupo(itens, texto) {
  const t = String(texto);
  if (!itens.length) return null;
  const divisoes = [];
  for (const cab of t.matchAll(/\bGRUPO\s+ITEM\b/gi)) {
    const trecho = t.slice(cab.index, cab.index + 60000);
    let esperado = itens[0].n, atual = 0, ambiguo = false;
    const grupo = new Map();
    for (const m of trecho.matchAll(/(?:^|\s)(?:(\d{1,3})\s+)?(\d{1,3})\s+\d{4,6}\s+(?=[A-ZÀ-Ú]{3})/g)) {
      if (+m[2] !== esperado) continue;
      const k = itens.findIndex(x => x.n === esperado);
      if (m[1] !== undefined && +m[1] === atual + 1) {
        if (k > 0 && Math.round(+itens[k - 1].qtd || 0) === +m[1]) { ambiguo = true; break; }
        atual++;
      } else if (!atual) break;                     // a primeira linha tem de abrir o grupo 1
      grupo.set(esperado, atual);
      if (k === itens.length - 1) break;
      esperado = itens[k + 1].n;
    }
    if (!ambiguo && grupo.size === itens.length && atual >= 2) divisoes.push(grupo);
  }
  if (!divisoes.length) return null;
  const chave = g => itens.map(x => g.get(x.n)).join(',');
  if (divisoes.some(g => chave(g) !== chave(divisoes[0]))) return null;
  const res = divisoes[0];
  const benefDe = {};
  for (const x of itens) {
    const g = res.get(x.n);
    if (benefDe[g] === undefined) benefDe[g] = x.benef || '';
    else if (benefDe[g] !== (x.benef || '')) return null;
  }
  return res;
}

// itens: [{ n, total }] na ordem do PNCP. Devolve Map(n -> lote) ou null.
// Os lotes sao blocos seguidos de itens, em qualquer ordem (Uniao da Vitoria:
// o lote 4 e o item 16 e o lote 3 os itens 18 a 25).
export function lotesPelosTotais(itens, totais) {
  const lotes = Object.keys(totais).map(Number);
  if (!lotes.length || !itens.length) return null;
  const solucoes = [], usado = new Set(), atual = [];
  (function busca(i) {
    if (solucoes.length > 1) return;
    if (i === itens.length) { if (usado.size === lotes.length) solucoes.push(atual.slice()); return; }
    let soma = 0;
    for (let j = i; j < itens.length; j++) {
      soma = Math.round((soma + itens[j].total) * 100) / 100;
      for (const l of lotes) {
        if (usado.has(l)) continue;
        // um centavo de folga por item, do arredondamento de preco com 4 casas
        if (![...totais[l]].some(v => Math.abs(v - soma) <= 0.01 * (j - i + 1))) continue;
        usado.add(l); atual.push([i, j, l]);
        busca(j + 1);
        usado.delete(l); atual.pop();
        if (solucoes.length > 1) return;
      }
    }
  })(0);
  if (solucoes.length !== 1) return null;
  const res = new Map();
  for (const [a, b, l] of solucoes[0]) for (let k = a; k <= b; k++) res.set(itens[k].n, l);
  return res;
}
