// Monta o palavras-acentuadas.json, o vocabulario que o texto-pncp.mjs usa
// para devolver a letra acentuada que o PNCP trocou por "?".
//
// O caso que pediu isto: Sao Joao da Ponte/MG (edital 20, 09/10/2026) chega da
// API com TODA letra acentuada como "?" — "TAMPA COM BOA VEDA??O", "N?O SENDO
// ACEITO", "DISPON?VEL", "ATENDIMENTO ?S NORMAS". O dicionario escrito a mao no
// texto-pncp.mjs cobria as palavras do ramo, e o resto ia para o resumo em PDF
// com o "?" (e a regra do acento perdido, que tira o "?" depois de vogal,
// deixava "SEM BRAOS", "IMPERMEVEL", "DIMETRO").
//
// A fonte e o texto dos editais que a propria varredura ja leu: o PDF traz a
// acentuacao inteira. Cada palavra acentuada vem com quantas vezes apareceu,
// para o texto-pncp.mjs escolher so quando uma forma domina (P?S fica: "pés" e
// "pás" sao as duas comuns, e ventilador tem pas).
//
// Tambem guarda as palavras que vem antes de "à" e nunca antes de travessao:
// no texto quebrado, "PERTENCENTE ? LINHA" e "RESISTENTE ? EXPOSICAO" sao a
// crase, e "12.000 BTU/H ? FRIO ? 220 V" e o travessao.
//
// Uso: node vocabulario.mjs [quantas varreduras, padrao 12]
// Le o docs/descritivos.json de cada commit "Varredura de dd/mm/aaaa".
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const N = +process.argv[2] || 12;
const git = (...a) => execFileSync('git', a, { cwd: DIR, encoding: 'utf8', maxBuffer: 1 << 30 });
const commits = git('log', '--format=%h %s', '--', 'docs/descritivos.json')
  .split('\n').filter(l => / Varredura de \d\d\/\d\d\/\d{4}$/.test(l)).slice(0, N).map(l => l.split(' ')[0]);

const freq = new Map(), antesA = new Map(), antesTrav = new Map();
const soma = (m, k) => m.set(k, (m.get(k) || 0) + 1);
for (const h of commits) {
  const D = JSON.parse(git('show', h + ':docs/descritivos.json')).editais;
  for (const v of Object.values(D)) {
    for (const s of v.secoes || []) {
      const t = String(s.texto || '');
      for (const m of t.matchAll(/[A-Za-zÀ-ÖØ-öø-ÿ]+/g)) if (/[^\x00-\x7f]/.test(m[0])) soma(freq, m[0].toLowerCase());
      for (const m of t.matchAll(/([A-Za-zÀ-ÖØ-öø-ÿ]+)\s+(?:à|às|À|ÀS)\s+[A-Za-zÀ-ÖØ-öø-ÿ]/g)) soma(antesA, m[1].toLowerCase());
      for (const m of t.matchAll(/([A-Za-zÀ-ÖØ-öø-ÿ]+)\s+[–—-]\s+[A-Za-zÀ-ÖØ-öø-ÿ\d]/g)) soma(antesTrav, m[1].toLowerCase());
    }
  }
}
// Abaixo de 3 ocorrencias e quase sempre erro de leitura do PDF ("acäo", "frequéncia").
const acentuadas = Object.fromEntries([...freq].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]));
const antesDeCrase = [...antesA].filter(([w, n]) => n >= 5 && (antesTrav.get(w) || 0) * 20 <= n && w.length > 1)
  .sort((a, b) => b[1] - a[1]).map(([w]) => w);
const saida = { fonte: `${commits.length} varreduras (${commits[commits.length - 1]}..${commits[0]})`, acentuadas, antesDeCrase };
fs.writeFileSync(path.join(DIR, 'palavras-acentuadas.json'), JSON.stringify(saida) + '\n');
console.log(`${Object.keys(acentuadas).length} palavras acentuadas, ${antesDeCrase.length} antes de crase, de ${saida.fonte}`);
