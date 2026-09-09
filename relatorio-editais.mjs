// Estado de CADA edital: quantos itens cotados tem descritivo do edital e, nos
// que faltam, por que. Existe para conferir edital por edital sem abrir 80 PDFs.
import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('docs/descritivos.json', 'utf8'));
const dd = JSON.parse(fs.readFileSync('docs/dados.json', 'utf8'));
const ab = (() => { try { return JSON.parse(fs.readFileSync('docs/aberturas.json', 'utf8')).editais; } catch { return {}; } })();
const C = dd.colunas.reduce((o, n, i) => (o[n] = i, o), {});
const uma = s => String(s || '').replace(/\s+/g, ' ').trim();

const linhas = [];
let totItens = 0, totCom = 0;
for (const e of dd.editais) {
  const v = d.editais[e[C.path]];
  const secoes = v ? (v.secoes || []).reduce((s, x) => s + x.texto.length, 0) : 0;
  const a = new Map((v?.itens || []).map(x => [x[0], x]));
  const b = new Map((v?.itens || []).map(x => [uma(x[1]).toLowerCase(), x]));
  let com = 0;
  for (const it of e[C.itens]) {
    const m = a.get(it[5]) || b.get(uma(it[3]).toLowerCase());
    if (m && m[6]) com++;
  }
  const n = e[C.itens].length;
  totItens += n; totCom += com;
  linhas.push({
    mun: e[C.municipio] + '/' + e[C.uf], n, com,
    falta: n - com,
    texto: secoes,
    folha: ab[e[C.path]] ? 'sim' : 'nao',
    motivo: !v ? 'sem entrada' : !secoes ? (v.motivo || 'sem texto') : ''
  });
}
linhas.sort((x, y) => y.falta - x.falta || y.n - x.n);
console.log('EDITAL'.padEnd(30) + 'ITENS  COM  FALTA  TEXTO   FOLHA  MOTIVO');
for (const l of linhas) {
  console.log(l.mun.slice(0, 29).padEnd(30)
    + String(l.n).padStart(5) + String(l.com).padStart(5) + String(l.falta).padStart(7)
    + String(l.texto ? (l.texto / 1000).toFixed(0) + 'k' : '—').padStart(8)
    + l.folha.padStart(7) + '  ' + l.motivo.slice(0, 45));
}
console.log('\nTOTAL: ' + totCom + ' de ' + totItens + ' itens cotados com descritivo · '
  + linhas.filter(l => l.falta === 0).length + ' editais completos · '
  + linhas.filter(l => l.com === 0).length + ' sem nenhum');
