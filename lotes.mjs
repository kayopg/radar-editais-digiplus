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

const valor = s => +s.replace(/\./g, '').replace(',', '.');

// {lote: Set(valores)} com os totais por lote impressos no texto do edital
export function totaisPorLote(texto) {
  const re = /(?:total|global)\b[^0-9.;]{0,45}?\b(?:lote|grupo)\s*(?:n[º°o.]*\s*)?0*(\d{1,3})\b[^0-9]{0,30}?((?:\d{1,3}(?:\.\d{3})+|\d{1,6}),\d{2})(?!\d)/gi;
  const t = {};
  for (const m of String(texto).matchAll(re)) (t[+m[1]] ||= new Set()).add(valor(m[2]));
  return t;
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
