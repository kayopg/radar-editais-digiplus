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
