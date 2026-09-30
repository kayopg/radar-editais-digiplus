// A COTA RESERVADA PARA ME/EPP, item a item (usuario, 29/09/2026: "marque
// quando o item for de cota reservada, ou algo do tipo").
//
// A Lei Complementar 123/2006 (art. 48, III) manda reservar ate 25% do bem
// divisivel para microempresa e empresa de pequeno porte. O edital parte o
// produto em dois itens iguais: a cota principal, de ampla participacao, com a
// maior parte da quantidade, e a cota reservada, com o resto. O PNCP nem sempre
// diz qual e qual:
//   - Avare/SP: item 1 "sem beneficio" com 75, item 2 "exclusiva" com 25;
//   - Santos/SP: os dois "sem beneficio" (2.387 e 795), e so o TR diz
//     "(COTA PRINCIPAL PARA AMPLA PARTICIPACAO)" e "(COTA RESERVADA PARA ME/EPP/COOP)";
//   - Vicosa/MG: "(COTA EXCLUSIVA PARA ME / EPP)" na linha dos itens 3 e 9, e o
//     PNCP sem beneficio nenhum;
//   - IFFar (Santa Maria/RS): "25 COTA RESERVADA (BENEFICIO TIPO III) 448184
//     CORTINA DE AR..." na tabela, e o PNCP diz "participacao exclusiva".
// Por isso a marca junta tres sinais: o PNCP, o texto do edital na linha do
// item e o par de itens iguais.
//
// marcaCotas(itensDoEdital, corpo) recebe os itens do descritivos.json
// ([n, rotulo, qtd, unid, valor, beneficio, descritivo, ...]) e o texto do
// edital normalizado, e devolve:
//   marcas: Map numero -> 'R' (cota reservada), 'R:n' (reservada, com a
//           principal no item n) ou 'P:n' (principal, com a reservada no item n);
//   limpos: Map numero -> descritivo sem a marca da cota que veio copiada do
//           item vizinho (em Vicosa o principal saia com o "(COTA EXCLUSIVA
//           PARA ME / EPP)" da reservada, porque os dois textos sao iguais).

export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// a marca entre parenteses: "(COTA EXCLUSIVA PARA ME / EPP)", "(Item para Ampla
// Concorrencia)", "(Cota Reservada ME/EPP)" — fora da chave que acha o par
const PARENTESE_DA_COTA = /\([^()]{0,25}(?:ampla|cota|exclusiv|reservad)[^()]{0,60}\)/g;
const DIZ_RESERVADA = /cota (?:reservada|exclusiva)|reservad[oa]s? (?:para|a|as) (?:me|micro)/;
const DIZ_PRINCIPAL = /cota principal|ampla (?:participacao|concorrencia|disputa)/;
const FALA_DE_COTA = /cota (?:reservada|principal|exclusiva)|cota de ate 25|art(?:igo)?\.? 48,? (?:inciso )?iii/;
const MARCA_COPIADA = /\s*\(\s*cota\s+(?:exclusiva|reservada)[^()]{0,60}\)/i;
const restritivo = b => b === 'E' || b === 'C';

export function marcaCotas(itens, corpo = '') {
  const marcas = new Map(), limpos = new Map();
  const chave = x => norm(x[6] || x[1]).replace(PARENTESE_DA_COTA, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

  // 1. O par: dois itens com o mesmo texto e o mesmo preco, o menor com ate 30%
  // da soma. Quantidades iguais nao sao cota (Mariopolis/PR tem varios pares
  // "Liquidificador Industrial" de 6 e 6, de especificacoes diferentes). E
  // precisa de um sinal alem da conta: o PNCP restringe so o menor, o texto do
  // item fala de cota, ou o edital diz que aplica cota — senao dois
  // liquidificadores iguais de 3 e 10 unidades para secretarias diferentes
  // (Minacu/GO) virariam cota. "Ampla participacao" solta no corpo nao conta:
  // e o jargao de qualquer justificativa de parcelamento.
  // "Mesmo texto" com folga de 3% das palavras: as duas linhas de Viamao/RS
  // dizem "alta padrao de dureza" numa e "alto padrao" na outra (30/09/2026).
  const palavras = x => chave(x).split(' ');
  const parecido = (p, q) => {
    if (Math.abs(p.length - q.length) > Math.max(p.length, q.length) * 0.03) return false;
    const conta = new Map();
    for (const w of p) conta.set(w, (conta.get(w) || 0) + 1);
    let comuns = 0;
    for (const w of q) { const c = conta.get(w); if (c) { comuns++; conta.set(w, c - 1); } }
    return comuns >= Math.max(p.length, q.length) * 0.97;
  };
  const cand = itens.map(x => ({ x, p: palavras(x), preco: +x[4] || 0, pares: [] }))
    .filter(c => c.p.join(' ').length >= 12);
  for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) {
    const a = cand[i], b = cand[j];
    const mesmoPreco = a.preco && b.preco ? Math.abs(a.preco - b.preco) <= 0.02 * Math.max(a.preco, b.preco)
      : a.p.join(' ') === b.p.join(' ');
    if (mesmoPreco && parecido(a.p, b.p)) { a.pares.push(b); b.pares.push(a); }
  }
  const falaNoCorpo = FALA_DE_COTA.test(corpo);
  for (const c of cand) {
    // o item com mais de um gemeo e ambiguo: fica sem par
    if (c.pares.length !== 1 || c.pares[0].pares.length !== 1 || marcas.has(+c.x[0])) continue;
    const [a, b] = +c.x[2] >= +c.pares[0].x[2] ? [c.x, c.pares[0].x] : [c.pares[0].x, c.x];
    const qa = +a[2] || 0, qb = +b[2] || 0;
    if (!qb || qa === qb) continue;
    const parte = qb / (qa + qb);
    if (parte < 0.04 || parte > 0.3) continue;
    const ta = norm(a[6]), tb = norm(b[6]);
    const principalAberta = !restritivo(a[5]) || DIZ_PRINCIPAL.test(ta.replace(DIZ_RESERVADA, ''));
    if (!principalAberta) continue;
    const sinal = (restritivo(b[5]) && !restritivo(a[5])) || DIZ_RESERVADA.test(tb) || DIZ_PRINCIPAL.test(ta) || falaNoCorpo;
    if (!sinal) continue;
    marcas.set(+b[0], 'R:' + a[0]);
    marcas.set(+a[0], 'P:' + b[0]);
    // o principal com a marca da reservada, copiada porque os textos sao iguais
    if (a[6] && MARCA_COPIADA.test(a[6]) && b[6] && MARCA_COPIADA.test(b[6])) {
      limpos.set(+a[0], a[6].replace(MARCA_COPIADA, '').replace(/\s{2,}/g, ' ').trim());
    }
  }

  // 2. O item sozinho: a marca no descritivo, a marca na linha da tabela logo
  // depois do numero do item (IFFar), ou o PNCP dizendo "cota reservada".
  for (const x of itens) {
    const n = +x[0];
    if (marcas.has(n)) continue;
    const t = norm(x[6]);
    let reservada = x[5] === 'C' || DIZ_RESERVADA.test(t);
    if (!reservada && corpo && t.length >= 25) {
      const linha = new RegExp('(?:^|[^0-9.,])0*' + n + '\\s+[-–]?\\s*cota (?:reservada|exclusiva)[^]{0,80}?' + esc(t.slice(0, 25)));
      reservada = linha.test(corpo);
    }
    if (reservada) marcas.set(n, 'R');
  }
  return { marcas, limpos };
}

// O texto que a pagina e o resumo mostram para o item: a cota (it[7]) e, sem
// ela, o beneficio do PNCP (it[6]).
export function textoCota(it) {
  const c = String(it[7] || ''), n = c.split(':')[1];
  if (c[0] === 'R') return 'Cota reservada ME/EPP' + (n ? ` (principal: item ${n})` : '');
  if (c[0] === 'P') return 'Cota principal, ampla' + (n ? ` (reservada: item ${n})` : '');
  if (it[6] === 'C') return 'Cota reservada ME/EPP';
  if (it[6] === 'E') return 'Exclusivo ME/EPP';
  return '';
}
