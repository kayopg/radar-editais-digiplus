// Lista todos os itens de interesse do dados.json com o termo que os fez
// entrar. Serve para conferir item a item o que a varredura selecionou.
//
// Existe porque o total nao denuncia erro: Vere/PR entrou com 1 item, um
// conjunto de britagem, so porque o descritivo cita "gerador de energia" como
// peca do britador. Olhando o numero, o edital parecia certo.
//
// Uso: node audita-itens.mjs [categoria]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));
const C = dados.colunas.reduce((o, n, i) => (o[n] = i, o), {});

// A tabela de termos vem do proprio varredura.mjs, lida do arquivo: duas copias
// divergiriam e a auditoria passaria a conferir uma regra que nao roda.
const fonte = fs.readFileSync(path.join(DIR, 'varredura.mjs'), 'utf8');
const bloco = fonte.slice(fonte.indexOf('const CAT = ['), fonte.indexOf('\n];', fonte.indexOf('const CAT = [')) + 3);
const CAT = eval(bloco.replace('const CAT = ', '') + '');

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const NOME = { RF: 'Refrigeração', CL: 'Climatização', CC: 'Cocção', PR: 'Preparo',
  EP: 'Eletroportáteis', LV: 'Lavanderia', BB: 'Bebedouro', CX: 'Coifa/Exaustão',
  BL: 'Balanças', LD: 'Lousa digital', GE: 'Geradores', AQ: 'Aquecimento', OT: 'Outros' };

const qual = d => {
  for (const [c, ts] of CAT) for (const t of ts) if (d.includes(t)) return [c, t];
  return [null, null];
};

// --vetados aplica as listas de veto do varredura.mjs sobre o dados.json atual
// e mostra o que SAIRIA. Serve para conferir uma regra nova antes de gastar 35
// minutos de varredura, e depois para provar que ela pegou o que devia.
//
// --suspeitos mostra o que continua passando com a palavra da categoria la no
// fim da descricao — o padrao de "peca de outro produto", que foi como o
// britador de Vere/PR entrou como gerador.
const lista = nome => {
  const i = fonte.indexOf('const ' + nome + ' = [');
  return eval(fonte.slice(fonte.indexOf('[', i), fonte.indexOf('];', i) + 1));
};
if (process.argv.includes('--vetados') || process.argv.includes('--suspeitos')) {
  const VETO_ITEM = lista('VETO_ITEM'), VETO_BL = lista('VETO_BL_MEDICA'), VETO_RF = lista('VETO_RF_CIENT');
  let n = 0;
  for (const e of dados.editais) {
    for (const it of e[C.itens]) {
      const d = norm(it[3]);
      const [cat, termo] = qual(d);
      const pos = termo ? d.indexOf(termo) : -1;
      const v = VETO_ITEM.find(x => d.includes(x))
        || (it[0] === 'BL' && VETO_BL.find(x => d.includes(x)))
        || (it[0] === 'RF' && VETO_RF.find(x => d.includes(x)));
      const querVetados = process.argv.includes('--vetados');
      if (querVetados ? !v : (v || pos < 100)) continue;
      n++;
      console.log((querVetados ? 'VETA "' + v + '"' : 'passa, termo em ' + pos)
        + ' · ' + it[0] + ' · ' + e[C.municipio] + '/' + e[C.uf] + ' · R$ ' + it[2]);
      console.log('   ' + it[3].replace(/\s+/g, ' ').slice(0, 200));
    }
  }
  console.log('\n' + n + ' item(ns)');
  process.exit(0);
}

const so = (process.argv[2] || '').toUpperCase();
const linhas = [];
for (const e of dados.editais) {
  for (const it of e[C.itens]) {
    const d = norm(it[3]);
    const [, termo] = qual(d);
    // Onde o termo aparece: no comeco e o produto, la no fim costuma ser peca.
    const pos = termo ? d.indexOf(termo) : -1;
    linhas.push({ cat: it[0], termo: termo || '?', pos,
      mun: e[C.municipio], uf: e[C.uf], qtd: it[1], vu: it[2], desc: it[3] });
  }
}

linhas.sort((a, b) => a.cat === b.cat ? b.pos - a.pos : (a.cat < b.cat ? -1 : 1));
let cat = '';
for (const l of linhas) {
  if (so && l.cat !== so) continue;
  if (l.cat !== cat) { cat = l.cat; console.log('\n########## ' + cat + ' — ' + (NOME[cat] || cat)); }
  console.log('[' + String(l.pos).padStart(4) + '] ' + l.termo.padEnd(22)
    + l.mun + '/' + l.uf + ' · ' + l.qtd + 'un · R$ ' + l.vu);
  console.log('       ' + l.desc.replace(/\s+/g, ' ').slice(0, 300));
}
console.log('\ntotal: ' + linhas.length + ' itens em ' + dados.editais.length + ' editais');
