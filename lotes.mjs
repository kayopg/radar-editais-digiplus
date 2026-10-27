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
  const declarado = [...t.matchAll(DECLARA)].filter(m => m[1] === 'item' || !CITA_A_LEI(m)).map(m => (m[1] === 'item' ? 'item' : 'lote'));
  const nLote = declarado.filter(d => d === 'lote').length, nItem = declarado.length - nLote;
  // Declarando os dois, vale o que o edital diz mais: Palmas/PR (edital 32/2026,
  // 22/10/2026) diz "menor preco por item" cinco vezes, e o PDF traz colado um
  // trecho de outro processo ("politica publica Compra Mercedes ... tipo: menor
  // preco por lote") que fazia o card mostrar o edital inteiro em cinza.
  if (nLote && nLote >= nItem) return true;
  if (nItem) return false;
  return POR_LOTE.test(t) || EM_GRUPOS.test(t);
}
// E o termo que so justifica os grupos, sem a frase do julgamento: "a analise
// realizada indicou que a divisao dos itens em grupos constitui a alternativa
// mais adequada para a administracao" (IFSul, Pelotas/RS, edital 144/2026,
// 21/10/2026). Com "nao" perto, e a justificativa do contrario.
const EM_GRUPOS = /(?<!\bnao\b[^.;]{0,60})(?:divisao|organizacao|agrupamento|reuniao) dos itens em (?:grupos|lotes)(?![^.;]{0,60}\bnao\b)/;

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
  // e a lista "Valor total estimado da Contratacao: Lote 01 - R$ 21.840,40.
  // Lote 02 - R$ 17.357,20. Lote 03 - R$ 3.789,14." (Santos/SP, edital
  // 13038/2026, 21/10/2026), em que so o primeiro vem depois de "total"
  for (const m of String(texto).matchAll(/\blote\s*0*(\d{1,3})\s*[-–:]\s*R\$\s*((?:\d{1,3}(?:\.\d{3})+|\d{1,6}),\d{2})(?!\d)/gi))
    (t[+m[1]] ||= new Set()).add(valor(m[2]));
  if (Object.keys(t).length) return t;
  const cabs = [...String(texto).matchAll(CABECALHO_LOTE)].map(m => ({ i: m.index, l: +m[1] }));
  if (cabs.length < 2) return t;
  for (const m of String(texto).matchAll(TOTAL_DEPOIS)) {
    let c = null;
    for (const x of cabs) { if (x.i < m.index) c = x; else break; }
    if (c && m.index - c.i < 20000) (t[c.l] ||= new Set()).add(valor(m[1]));
  }
  // So um lote com total, num texto com cabecalho de varios: e o total geral
  // depois do ultimo lote, e nao o dele. Em Mondai/SC (pregao 65/2026, 37 lotes
  // de um item cada) o "TOTAL 4.267.942,80" do fim caia no lote 35 e jogava os
  // 37 itens nele (21/10/2026).
  if (Object.keys(t).length === 1 && new Set(cabs.map(x => x.l)).size >= 2) return {};
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

// ---------------------------------------------------------------------------
// 21/10/2026 (usuario: "tem muitos editais que sao em lote (grupo) e voce nao
// esta marcando, esta ficando apenas os produtos fora de ordem"). Cinco formas
// novas, todas de editais da lista do dia. Cada uma so responde quando TODOS os
// itens do PNCP acham o seu lote.

// O LOTE UNICO: "MENOR PRECO POR GRUPO DE ITENS (LOTE UNICO)" (Telebras,
// Brasilia/DF, edital 42), "A licitacao sera realizada em lote unico, formados
// por 11 (ONZE) itens" (Santa Cruz do Sul/RS, edital 131).
export function lotesLoteUnico(itens, texto) {
  const t = normL(texto);
  if (!/\blote unico\b/.test(t) || /nao (?:sera|havera)[^.;]{0,30}lote unico/.test(t)) return null;
  return new Map(itens.map(x => [x.n, 1]));
}

// A TABELA COM A COLUNA DO LOTE NA FRENTE: "LOTE ITEM DESCRICAO UNIDADE QTD.
// VALOR MEDIO TOTAL 1 1 Fritadeira eletrica sem oleo..." (Sao Carlos/SP, SL
// 72), "LOTE ITEM CATMAT / CATSER COD.GRP OBJETO ... 1 1 4247 64575 Calha..."
// (Santa Cruz do Sul/RS). O item vem na ordem do PNCP e o lote nao volta atras.
export function lotesPelaTabelaLoteItem(itens, texto) {
  const t = String(texto);
  const nums = new Set(itens.map(x => x.n));
  for (const cab of t.matchAll(/\bLOTE\s+ITEM\b/g)) {
    const trecho = t.slice(cab.index, cab.index + 120000);
    const res = new Map();
    let ultimoItem = 0, ultimoLote = 0;
    for (const m of trecho.matchAll(/(?:^|\s)(\d{1,3})\s+(\d{1,3})\s+(?:\d{3,7}\s+){0,2}(?=[A-ZÀ-Ú][A-Za-zÀ-ú])/g)) {
      const l = +m[1], n = +m[2];
      if (!nums.has(n) || res.has(n)) continue;
      if (n <= ultimoItem || l < ultimoLote || l > ultimoLote + 1 && ultimoLote) continue;
      res.set(n, l); ultimoItem = n; ultimoLote = l;
    }
    if (res.size === itens.length) return res;
  }
  return null;
}

// O LOTE NO TEXTO DO PROPRIO ITEM: "...Item 2 do TR – Lote 01. Especificacao
// completa conforme Termo de Referencia" e "FORNO MICRO-ONDAS [LOTE 02]"
// (Embrapa, Brasilia/DF, edital 45). itens: [{ n, rot, x }] (x[6] e o descritivo).
export function lotesPeloTextoDoItem(itens) {
  const res = new Map();
  for (const it of itens) {
    const s = String((it.x && it.x[6]) || '') + ' ' + String(it.rot || '');
    const m = /\[\s*LOTE\s*0*(\d{1,3})\s*\]|Item\s+\d{1,3}\s+do\s+TR\s*[–-]\s*Lote\s*0*(\d{1,3})\b/i.exec(s);
    if (!m) return null;
    res.set(it.n, +(m[1] || m[2]));
  }
  return new Set(res.values()).size >= 2 ? res : null;
}

// AS FAIXAS DE ITENS NO CABECALHO DO GRUPO: "GRUPO 1 – Material eletrico e
// eletronico – ND 3.3.90.30.26 – itens 1 a 39 e 308 a 310 ... GRUPO 2 – ... –
// itens 40 a 58" (Embrapa, Brasilia/DF, edital 10). O item que nenhuma faixa
// cobre (o grupo de um item so, que o texto lido nao trouxe) derruba a forma.
export function lotesPorFaixaDeItens(itens, texto) {
  const t = String(texto);
  const res = new Map();
  for (const m of t.matchAll(/\b(?:GRUPO|LOTE)\s*0*(\d{1,3})\s*[–-][^]{0,220}?[–-]\s*itens?\s+((?:\d{1,3}(?:\s*(?:a|ao|at[eé])\s*\d{1,3})?(?:\s*(?:,|e)\s*)?)+)/g)) {
    const l = +m[1];
    for (const f of m[2].matchAll(/(\d{1,3})(?:\s*(?:a|ao|at[eé])\s*(\d{1,3}))?/g)) {
      const a = +f[1], b = f[2] ? +f[2] : a;
      for (let k = a; k <= b; k++) if (!res.has(k)) res.set(k, l);
    }
  }
  const out = new Map();
  for (const x of itens) { if (!res.has(x.n)) return null; out.set(x.n, res.get(x.n)); }
  return new Set(out.values()).size >= 2 ? out : null;
}

// AS SECOES DO GRUPO COM O PRIMEIRO ITEM DELE: "GRUPO 2 - MESAS E ESTACOES
// OPERACIONAIS ADMINISTRATIVAS ITEM DESCRICAO 6 MESA DE TRABALHO..." (Pelotas/RS,
// edital 144): o item segue o numero do PNCP, e o grupo vai do primeiro item
// dele ate o primeiro do seguinte. O texto lido pode nao trazer o grupo 1: se o
// 2 comeca depois do item 1, o 1 e o que vem antes. Os grupos tem de vir em
// sequencia, sem buraco, e o primeiro item de cada um tem de crescer. Os
// "ITENS NAO AGRUPADOS E ACESSORIOS ... ITEM DESCRICAO 49" do fim (la, do 49 ao
// 52) nao sao do ultimo grupo: ficam com o lote 0, cada um por si.
export function lotesPorSecaoComItem(itens, texto) {
  const t = String(texto);
  const primeiro = new Map();
  for (const m of t.matchAll(/\b(?:GRUPO|LOTE)\s*0*(\d{1,3})\s*[-–—:]\s*[^]{3,160}?\bITEM\s+DESCRI[ÇC][ÃA]O\s+(\d{1,3})\s/g)) {
    const g = +m[1], n = +m[2];
    if (!primeiro.has(g)) primeiro.set(g, n);
  }
  if (primeiro.size < 2) return null;
  const gs = [...primeiro.keys()].sort((a, b) => a - b);
  if (gs[0] === 2 && primeiro.get(2) > 1) { primeiro.set(1, 1); gs.unshift(1); }
  if (gs[0] !== 1) return null;
  for (let k = 1; k < gs.length; k++) if (gs[k] !== gs[k - 1] + 1 || primeiro.get(gs[k]) <= primeiro.get(gs[k - 1])) return null;
  const soltos = /\bITENS\s+N[ÃA]O\s+AGRUPADOS\b[^]{0,2000}?\bITEM\s+DESCRI[ÇC][ÃA]O\s+(\d{1,3})\s/i.exec(t);
  const soltoDe = soltos && +soltos[1] > primeiro.get(gs[gs.length - 1]) ? +soltos[1] : Infinity;
  const res = new Map();
  for (const x of itens) {
    if (x.n >= soltoDe) { res.set(x.n, 0); continue; }
    let g = null;
    for (const k of gs) if (primeiro.get(k) <= x.n) g = k;
    if (g === null) return null;
    res.set(x.n, g);
  }
  return res;
}

// O CABECALHO DA TABELA COM O GRUPO NA FRENTE, sem titulo, e os itens avulsos
// entre os grupos: "Grupo 1 ITEM DESCRICAO CATMAT/CATSER UNIDADE QUANTIDADE 1 Rede
// Pesca ... Itens Avulsos ITEM DESCRICAO UNIDADE QUANTIDADE 21 Aerador de Pas ...
// Grupo 3 ITEM DESCRICAO ..." (Codevasf, Brasilia/DF, edital 85/2026, "6 (seis)
// grupos e 12 (doze) itens avulsos", 27/10/2026). Cada secao vai do primeiro item
// dela ate o primeiro da seguinte; o avulso fica com o lote 0. A folha pode cair
// entre o cabecalho e o primeiro item (o "e-DOC ... Territorial 6" do grupo 3):
// vale o primeiro numero seguido de palavra. A tabela aparece mais de uma vez (o
// termo de referencia e a planilha de precos) e uma copia pode pular grupos
// (Brasilia/DF, edital 68): vale a primeira vez de cada grupo. Os grupos tem de
// vir todos, de 1 em diante, e o primeiro item tem de crescer com o grupo.
export function lotesPeloCabecalhoDoGrupo(itens, texto) {
  const t = String(texto);
  const doGrupo = new Map(), avulsos = new Set();
  const RE = /\b(?:GRUPO|Grupo|LOTE|Lote)\s+0*(\d{1,3})\s+(?:[\d.]{1,7}\s+)?ITEM\s+(?:CATMAT\s+)?DESCRI[ÇC][ÃA]O\b|\b(?:ITENS\s+AVULSOS|Itens\s+Avulsos)\s+(?:[\d.]{1,7}\s+)?ITEM\s+(?:CATMAT\s+)?DESCRI[ÇC][ÃA]O\b/g;
  for (const m of t.matchAll(RE)) {
    const n = /\s0*(\d{1,3})\s+(?:\d{5,7}\s+)?(?=[A-ZÀ-Ú][a-zà-úç]|[A-ZÀ-Ú]{3})/.exec(t.slice(m.index + m[0].length, m.index + m[0].length + 900));
    if (!n) continue;
    if (!m[1]) avulsos.add(+n[1]);
    else if (!doGrupo.has(+m[1])) doGrupo.set(+m[1], +n[1]);
  }
  const gs = [...doGrupo.keys()].sort((a, b) => a - b);
  if (gs.length < 2) return null;
  for (let k = 0; k < gs.length; k++) if (gs[k] !== k + 1 || (k && doGrupo.get(gs[k]) <= doGrupo.get(gs[k - 1]))) return null;
  const secoes = new Map(gs.map(g => [doGrupo.get(g), g]));
  for (const f of avulsos) if (secoes.has(f)) return null; else secoes.set(f, 0);
  const ordem = [...secoes.keys()].sort((a, b) => a - b);
  const res = new Map();
  for (const x of itens) {
    let s = null;
    for (const f of ordem) if (f <= x.n) s = f;
    if (s === null) return null;
    res.set(x.n, secoes.get(s));
  }
  // e a conta tem de bater com a que o edital declara: "distribuidos em 6 (seis)
  // grupos e 12 (doze) itens avulsos". Brasilia/DF, edital 65 ("18 grupos e 9
  // itens"), poe o item avulso entre os grupos sem cabecalho, e ele cairia no grupo
  const decl = /\b(\d{1,3})\s*\([^)]{2,25}\)\s+grupos(?:\s+e\s+(\d{1,3})\s*\([^)]{2,25}\)\s+itens)?/i.exec(t);
  if (decl && (gs.length !== +decl[1] || [...res.values()].filter(g => g === 0).length !== (+decl[2] || 0))) return null;
  return res;
}

// A LINHA "LOTE N ITEM NOME", com o item recomecando em 1 a cada lote: "LOTE 1
// 1 ARADO ALEIRADOR DE DISCO, com uma estrutura reforcada... LOTE 2 1 ARADO
// SUBSOLADOR..." (Mondai/SC, pregao 65/2026, 35 lotes). O lote com mais de um
// item segue sem repetir o lote: "LOTE 34 1 GUINDASTE (CANIVETE)... 2 CACAMBA
// BASCULANTE... 3 GARRA FLORESTAL", e o numero da folha pode cair no meio
// ("LOTE 28 49 1 TRITURADOR"). Cada item do PNCP, na ordem, acha a sua linha
// pelo comeco do nome, depois da do item anterior: "lote L 1 nome" abre o lote
// seguinte, "k nome" (k = o anterior + 1) continua o mesmo. E a linha sem o
// item, "LOTE 1 CAPOTRASTE BRACADEIRA UNID 21.0000 R$ 27,30 ... LOTE 2 PALHETA"
// (Rio Branco do Ivai/PR, edital 36/2026), tambem abre o lote.
// itens: [{ n, rot }] na ordem do PNCP. Devolve Map(n -> lote) ou null.
export function lotesPelaLinhaLoteNome(itens, texto) {
  const t = normL(texto);
  if ((t.match(/\blote\s*0*\d{1,3}\s+(?:(?:\d{1,3}\s+)?0*1\s+)?[a-z]/g) || []).length < 2) return null;
  const res = new Map();
  let pos = 0, lote = 0, k = 0;
  for (const x of itens) {
    const inicio = normL(x.rot).split(' ').slice(0, 3).join(' ');
    if (inicio.length < 6) return null;
    let achou = false;
    for (let i = t.indexOf(inicio, pos); i >= 0; i = t.indexOf(inicio, i + 1)) {
      const antes = t.slice(Math.max(0, i - 30), i);
      const novo = /\blote\s*0*(\d{1,3})\s+(?:(?:\d{1,3}\s+)?0*1\s+)?$/.exec(antes);
      if (novo && +novo[1] > lote) { lote = +novo[1]; k = 1; }
      else if (lote && new RegExp('(?:^|\\s)0*' + (k + 1) + '\\s+$').test(antes)) k++;
      else continue;
      res.set(x.n, lote); pos = i + inicio.length; achou = true;
      break;
    }
    if (!achou) return null;
  }
  return new Set(res.values()).size >= 2 ? res : null;
}

// A TABELA "LOTE ITEM DESCRICAO ... TOTAL POR LOTE" com a celula do lote so na
// primeira linha dele: "1 1 CALHA FLUORESCENTE SOBREPOR ... 2 CALHA ... 4
// LUMINARIA ... 2 5 CANALETA PVC ... 6 CANALETA PVC VENTILADO ... 3 7 CENTRO
// DISTRIBUICAO" (Cocal do Sul/SC, edital 54/2026, 214 itens). Cada item do PNCP,
// na ordem, acha a sua linha pelo numero seguido do comeco do nome — so as tres
// primeiras letras, porque o PNCP abrevia ("INTER. EMB." e "9 39 INTERUPTOR
// EMBUTIR" na tabela); o numero logo antes, quando e o lote seguinte, abre o lote.
// itens: [{ n, rot }] na ordem do PNCP. Devolve Map(n -> lote) ou null.
export function lotesPelaTabelaLoteItemNome(itens, texto) {
  const t = normL(texto);
  for (const cab of t.matchAll(/\blote item (?:descricao|especificacao|objeto)/g)) {
    const res = new Map();
    let pos = cab.index, lote = 0;
    for (const x of itens) {
      const letras = normL(x.rot).split(' ')[0].replace(/[^a-z]/g, '').slice(0, 3);
      if (letras.length < 2) break;
      const re = new RegExp('(?:\\s(\\d{1,3}))?\\s0*' + x.n + '\\s+' + letras, 'g');
      re.lastIndex = pos;
      let achou = false;
      for (let m; (m = re.exec(t)) && m.index - pos < 60000;) {
        const l = m[1] ? +m[1] : 0;
        if (l && l === lote + 1) lote = l;
        else if (!lote) continue;
        res.set(x.n, lote); pos = m.index + m[0].length; achou = true;
        break;
      }
      if (!achou) break;
    }
    if (res.size === itens.length && new Set(res.values()).size >= 2) return res;
  }
  return null;
}

// UM ITEM POR LOTE, o lote com o numero do item: "LOTE 1 CAPOTRASTE BRACADEIRA
// ... LOTE 2 PALHETA 1.2MM ... LOTE 50 AR CONDICIONADO 12000BTUS" (Rio Branco do
// Ivai/PR, edital 36/2026, 51 lotes). O nome do PNCP nem sempre e o da tabela
// ("ESTANTE DE PARTITURA" la, "ESTANTE EM PARTITURA" aqui), entao vale quando a
// tabela traz "LOTE 1", "LOTE 2", ... ate o ultimo item, em ordem, e o nome
// confere em pelo menos 60% deles.
// itens: [{ n, rot }] na ordem do PNCP, numerados de 1 a N. Devolve Map(n -> n) ou null.
export function lotesUmItemPorLote(itens, texto) {
  if (itens.length < 2 || itens.some((x, k) => x.n !== k + 1)) return null;
  const t = normL(texto);
  const comeco = [];
  let pos = 0;
  for (const x of itens) {
    const re = new RegExp('\\blote\\s*0*' + x.n + '\\s+(?=[a-z])', 'g');
    re.lastIndex = pos;
    const m = re.exec(t);
    if (!m) return null;
    pos = m.index + m[0].length;
    comeco.push(pos);
  }
  let bate = 0;
  itens.forEach((x, k) => {
    const nome = normL(x.rot).split(' ').slice(0, 2).join(' ');
    if (nome.length >= 4 && t.startsWith(nome, comeco[k])) bate++;
  });
  return bate >= Math.max(2, Math.ceil(0.6 * itens.length)) ? new Map(itens.map(x => [x.n, x.n])) : null;
}
