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

const DIR = path.dirname(fileURLToPath(import.meta.url));
const arquivo = path.join(DIR, 'docs', 'descritivos.json');
const base = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));
const C = dados.colunas.reduce((o, n, i) => (o[n] = i, o), {});

const limpa = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const beneficio = s => {
  const t = limpa(s).toLowerCase();
  if (t.includes('exclusiva')) return 'E';
  if (t.includes('cota')) return 'C';
  if (t.includes('sem benef')) return 'S';
  return '';
};

async function itensDe(p, tent = 4) {
  const [c, a, s] = p.split('/');
  const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${c}/compras/${a}/${s}/itens?pagina=1&tamanhoPagina=500`;
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
