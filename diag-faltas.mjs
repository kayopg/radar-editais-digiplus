// Por que cada item esta sem descritivo?
//
// O usuario pediu para conferir item por item se o descritivo falta por quebra
// de pagina. Esta auditoria separa as causas, para nao se tratar como uma coisa
// so o que sao quatro.
import fs from 'node:fs';
const dd = JSON.parse(fs.readFileSync('docs/dados.json', 'utf8'));
const de = JSON.parse(fs.readFileSync('docs/descritivos.json', 'utf8'));
const C = dd.colunas.reduce((o, n, i) => (o[n] = i, o), {});
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/-/g, ' ');
const REM = /\s*[,.;-]?\s*(?:conforme|vide|ver)\s+(?:o\s+|a\s+|as\s+|os\s+)?(?:termo|descritiv|edital|anexo|tabela|especifica|item)[^,.;]*/gi;

const causas = {};
const detalhe = {};
for (const ed of dd.editais) {
  const v = de.editais[ed[C.path]] || {};
  const temTexto = (v.secoes || []).length > 0;
  const txt = norm((v.secoes || []).map(s => s.texto).join('  '));
  const onde = ed[C.municipio] + '/' + ed[C.uf];
  for (const it of ed[C.itens]) {
    const x = (v.itens || []).find(y => y[0] === it[5]) || [];
    if (x[6]) continue;
    let causa;
    if (!temTexto) causa = 'A) edital sem texto (digitalizado)';
    else {
      const rot = norm(String(it[3]).replace(REM, ' '));
      const nome = rot.split(/[,;:]/)[0].trim();
      const duas = nome.split(/\s+/).slice(0, 2).join(' ');
      const uma = nome.split(/\s+/)[0];
      if (duas.length >= 6 && txt.includes(duas)) causa = 'B) nome COMPLETO esta no texto';
      else if (uma.length >= 5 && txt.includes(uma)) causa = 'C) so a primeira palavra esta no texto';
      else causa = 'D) o produto nao aparece no texto';
    }
    causas[causa] = (causas[causa] || 0) + 1;
    (detalhe[causa] ??= []).push(onde + ' it' + it[5] + ' · ' + String(it[3]).replace(/\s+/g, ' ').slice(0, 46));
  }
}
const total = Object.values(causas).reduce((a, b) => a + b, 0);
console.log(total + ' itens sem descritivo:\n');
for (const k of Object.keys(causas).sort()) console.log('   ' + String(causas[k]).padStart(3) + '  ' + k);
console.log('\n--- B e C sao os recuperaveis ---');
for (const k of ['B) nome COMPLETO esta no texto', 'C) so a primeira palavra esta no texto']) {
  if (!detalhe[k]) continue;
  console.log('\n' + k + ':');
  for (const s of detalhe[k]) console.log('   ' + s);
}
