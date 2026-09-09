// Por que cada item cotado esta sem descritivo do edital.
import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('docs/descritivos.json', 'utf8'));
const dd = JSON.parse(fs.readFileSync('docs/dados.json', 'utf8'));
const C = dd.colunas.reduce((o, n, i) => (o[n] = i, o), {});
const uma = s => String(s || '').replace(/\s+/g, ' ').trim();
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const motivos = {};
const exemplos = {};
let alvo = 0, com = 0;
for (const ed of dd.editais) {
  const v = d.editais[ed[C.path]];
  const secoes = v ? (v.secoes || []).map(s => s.texto).join('  ') : '';
  const a = new Map((v?.itens || []).map(x => [x[0], x]));
  const b = new Map((v?.itens || []).map(x => [uma(x[1]).toLowerCase(), x]));
  for (const it of ed[C.itens]) {
    alvo++;
    const m = a.get(it[5]) || b.get(uma(it[3]).toLowerCase());
    if (m && m[6]) { com++; continue; }
    let motivo;
    if (!v) motivo = 'edital sem entrada';
    else if (!secoes) motivo = 'edital sem texto (imagem/Word/404)';
    else if (!m) motivo = 'item nao casou com a lista do PNCP';
    else {
      // as palavras do rotulo aparecem no texto do edital?
      const pal = norm(uma(it[3])).split(/[^a-z0-9]+/).filter(w => w.length >= 5);
      const plano = norm(secoes);
      const achadas = pal.filter(w => plano.includes(w)).length;
      motivo = achadas === 0 ? 'nenhuma palavra do item no texto'
             : achadas < pal.length / 3 ? 'poucas palavras no texto (' + achadas + '/' + pal.length + ')'
             : 'palavras existem, ancora nao pegou';
    }
    motivos[motivo] = (motivos[motivo] || 0) + 1;
    (exemplos[motivo] = exemplos[motivo] || []).push(
      ed[C.municipio] + '/' + ed[C.uf] + ' item ' + (it[5] || '?') + ' :: ' + uma(it[3]).slice(0, 75));
  }
}
console.log(com + ' de ' + alvo + ' com descritivo · ' + (alvo - com) + ' sem\n');
for (const [k, n] of Object.entries(motivos).sort((x, y) => y[1] - x[1])) {
  console.log(String(n).padStart(4) + '  ' + k);
  for (const e of exemplos[k].slice(0, 3)) console.log('        ' + e);
}
