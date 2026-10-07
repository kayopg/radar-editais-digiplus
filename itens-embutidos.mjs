// Acrescenta ao docs/descritivos.json a lista COMPLETA de itens de cada edital.
//
// O resumo baixado pela pagina mostrava "Nao consegui buscar a lista completa
// agora": o /itens do PNCP e outra chamada que o navegador nao consegue fazer
// — no site pelo CORS, no artefato pelo sandbox. Sem ela o PDF sai so com os
// itens de interesse, e o usuario pediu os produtos do edital original junto
// com o Termo de Referencia.
//
// Roda separado do descritivos.mjs de proposito: e uma chamada pequena por
// edital, sem baixar PDF nenhum, entao da para refazer so esta parte quando o
// PNCP estiver instavel.
//
// Uso: node itens-embutidos.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { limpaTextoPncp } from './texto-pncp.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const arquivo = path.join(DIR, 'docs', 'descritivos.json');
const base = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));
const C = dados.colunas.reduce((o, n, i) => (o[n] = i, o), {});

// o HTML e a acentuacao quebrada que o PNCP devolve saem aqui (ver texto-pncp.mjs)
const limpa = s => limpaTextoPncp(s);
const beneficio = s => {
  const t = limpa(s).toLowerCase();
  if (t.includes('exclusiva')) return 'E';
  if (t.includes('cota')) return 'C';
  if (t.includes('sem benef')) return 'S';
  return '';
};

// Todas as paginas: Alto Piquiri/PR (07/10/2026) tem 661 itens, e a primeira
// pagina de 500 deixava de fora do 501 em diante. Depois da ultima pagina o
// PNCP responde 200 com [].
const TAM_PAG = 500;
async function itensDe(p, tent = 4) {
  const todos = [];
  for (let pag = 1; pag <= 20; pag++) {
    const lote = await paginaDeItens(p, pag, tent);
    todos.push(...lote);
    if (lote.length < TAM_PAG) break;
  }
  return todos;
}
async function paginaDeItens(p, pag, tent) {
  const [c, a, s] = p.split('/');
  const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${c}/compras/${a}/${s}/itens?pagina=${pag}&tamanhoPagina=${TAM_PAG}`;
  for (let t = 0; t < tent; t++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    } catch (e) {
      if (t === tent - 1) throw e;
      await new Promise(x => setTimeout(x, 3000 * (t + 1)));
    }
  }
}

// O numeroItem do PNCP nem sempre e o numero do item — a mesma correcao que a
// varredura faz no dados.json precisa valer aqui, senao as duas listas ficam
// numeradas de formas diferentes e o descritivo nao acha o dono. Em cinco
// compras o PNCP publica o ID interno (Santo Antonio do Caiua/PR sai como
// 7965701, 7965702, 7965703 e o edital imprime 01, 02, 03): corrida contigua
// que comeca alto demais para ser numeracao, e como a leitura parte da pagina
// 1, a posicao na lista e o numero impresso.
//
// A corrida nao precisa ser CONTIGUA (28/09/2026): Inaja/PR publica 8038580 ...
// 8038590, 8038592, 8038624 ... 8039351 — IDs com buracos — e o card mostrava
// "item 8038586", enquanto o edital imprime "07 Geladeira/refrigerador", a
// setima da lista. Numero acima de 10.000 em TODOS os itens nao e numeracao de
// edital nenhum; basta a lista vir em ordem crescente para a posicao ser o
// numero impresso. A mesma regra esta no varredura.mjs — as duas tem de andar
// juntas, senao o card e o descritivo se desencontram.
function corrigeNumeracao(itens) {
  if (itens.length < 2) return itens;
  const ns = itens.map(x => x[0]);
  if (ns.some(n => !Number.isInteger(n) || n <= 10000)) return itens;
  if (!ns.every((n, k) => k === 0 || n > ns[k - 1])) return itens;
  itens.forEach((x, k) => { x[0] = k + 1; });
  return itens;
}

let ok = 0, erros = 0, total = 0;
for (const e of dados.editais) {
  const p = e[C.path];
  try {
    const brutos = await itensDe(p);
    // Compacto de proposito: a lista viaja embutida na pagina, e nome de campo
    // repetido 300 vezes por edital pesa mais que o proprio descritivo.
    // [numero, descricao, quantidade, unidade, valor unitario, beneficio]
    const itens = brutos.map(x => [
      +x.numeroItem || 0, limpa(x.descricao), +x.quantidade || 0,
      limpa(x.unidadeMedida), Math.round((+x.valorUnitarioEstimado || 0) * 100) / 100,
      beneficio(x.tipoBeneficioNome)
    ]);
    corrigeNumeracao(itens);
    base.editais[p] = { ...(base.editais[p] || { secoes: [] }), itens };
    total += itens.length;
    ok++;
    console.log(`  ${e[C.municipio]}/${e[C.uf]} · ${itens.length} itens`);
  } catch (err) {
    erros++;
    console.log(`  [erro] ${e[C.municipio]}/${e[C.uf]}: ${err.message}`);
  }
  await new Promise(x => setTimeout(x, 250));
}

fs.writeFileSync(arquivo, JSON.stringify(base), 'utf8');
console.log(`\n${ok} edital(is) com lista de itens · ${erros} erro(s) · ${total} itens no total`);
console.log(`docs/descritivos.json: ${(fs.statSync(arquivo).size / 1024).toFixed(0)} KB`);
