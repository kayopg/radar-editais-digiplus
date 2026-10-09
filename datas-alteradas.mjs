// "Data alterada": o edital cuja data de encerramento das propostas mudou
// depois que o Radar o viu — era 09/10 e o orgao passou para 21/10. Pedido do
// usuario em 09/10/2026.
//
// O PNCP guarda o historico de alteracoes da compra (/historico), mas so diz
// que houve "Retificacao", nao qual era a data. Entao a comparacao e com o que
// o proprio Radar viu: o datas-vistas.json guarda, por edital, a ultima data de
// encerramento vista, o dia em que foi vista e, quando mudou, a anterior.
// Nao basta comparar com a lista da vespera: em 45 dias de historico houve 31
// mudancas, e boa parte num edital que saiu da lista e voltou semanas depois
// com a data nova (Humaita/RS, edital 89: 02/09 -> 27/10).
//
// No dados.json a marca vai na coluna "dataAlterada": [data anterior, dia em
// que o Radar viu a mudanca], ou vazio. Ela fica enquanto o edital estiver na
// lista com a data nova; se a data mudar de novo, a anterior passa a ser a
// ultima vista. Horario tambem conta (08:00 -> 08:30): e a hora da disputa.
//
// Uso:
//   import { marcaDatasAlteradas } from './datas-alteradas.mjs'  (publicar.mjs)
//   node datas-alteradas.mjs              aplica ao docs/dados.json
//   node datas-alteradas.mjs --historico  remonta o datas-vistas.json pelo git
//                                          (45 dias de docs/dados.json) e aplica
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const ARQ_VISTAS = path.join(DIR, 'datas-vistas.json');
// edital nao visto ha mais que isso sai do arquivo
const GUARDA_DIAS = 120;

const hojeSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const minuto = s => String(s || '').slice(0, 16);

export function leVistas() {
  try { return JSON.parse(fs.readFileSync(ARQ_VISTAS, 'utf8')); } catch { return {}; }
}

export function gravaVistas(vistas, hoje = hojeSP()) {
  const limite = new Date(new Date(hoje + 'T12:00:00Z').getTime() - GUARDA_DIAS * 864e5).toISOString().slice(0, 10);
  const fica = Object.fromEntries(Object.entries(vistas).filter(([, v]) => v.v >= limite).sort(([a], [b]) => (a < b ? -1 : 1)));
  fs.writeFileSync(ARQ_VISTAS, JSON.stringify(fica, null, 0).replace(/\},"/g, '},\n"') + '\n', 'utf8');
  return Object.keys(fica).length;
}

// Anota uma lista vista no dia "hoje" (YYYY-MM-DD) e devolve, por edital, a
// marca [anterior, dia da mudanca] ou ''.
export function anota(vistas, editais, hoje) {
  const marcas = new Map();
  for (const { path: p, fecha } of editais) {
    const f = minuto(fecha);
    if (!p || !/^\d{4}-\d{2}-\d{2}/.test(f)) continue;
    const v = vistas[p];
    let a = v && v.a;
    if (v && v.f && v.f !== f) a = [v.f, hoje];
    vistas[p] = a ? { f, v: hoje, a } : { f, v: hoje };
    marcas.set(p, a || '');
  }
  return marcas;
}

// Poe a coluna no dados.json (objeto ja lido) e atualiza as vistas.
export function marcaDatasAlteradas(dados, vistas, hoje = hojeSP()) {
  let i = dados.colunas.indexOf('dataAlterada');
  if (i < 0) { dados.colunas.push('dataAlterada'); i = dados.colunas.length - 1; }
  const iPath = dados.colunas.indexOf('path'), iFecha = dados.colunas.indexOf('encerramento');
  const marcas = anota(vistas, dados.editais.map(e => ({ path: e[iPath], fecha: e[iFecha] })), hoje);
  let n = 0;
  for (const e of dados.editais) {
    while (e.length < i) e.push('');
    e[i] = marcas.get(e[iPath]) || '';
    if (e[i]) n++;
  }
  return n;
}

// O datas-vistas.json remontado pelo historico do docs/dados.json no git,
// commit a commit, do mais antigo ao mais novo.
function remontaPeloGit(dias = 45) {
  const git = (...a) => execFileSync('git', a, { cwd: DIR, encoding: 'utf8', maxBuffer: 1 << 30 });
  const commits = git('log', `--since=${dias} days ago`, '--format=%h %cI', '--', 'docs/dados.json').trim().split('\n').filter(Boolean).reverse();
  const vistas = {};
  for (const l of commits) {
    const [h, quando] = l.split(' ');
    let d;
    try { d = JSON.parse(git('show', h + ':docs/dados.json')); } catch { continue; }
    const iPath = (d.colunas || []).indexOf('path'), iFecha = (d.colunas || []).indexOf('encerramento');
    if (iPath < 0 || iFecha < 0) continue;
    const dia = new Date(quando).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    anota(vistas, d.editais.map(e => ({ path: e[iPath], fecha: e[iFecha] })), dia);
  }
  return { vistas, commits: commits.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arqDados = path.join(DIR, 'docs', 'dados.json');
  const dados = JSON.parse(fs.readFileSync(arqDados, 'utf8'));
  let vistas;
  if (process.argv.includes('--historico')) {
    const r = remontaPeloGit();
    vistas = r.vistas;
    console.log(`historico: ${r.commits} versoes do docs/dados.json, ${Object.keys(vistas).length} editais vistos`);
  } else vistas = leVistas();
  const n = marcaDatasAlteradas(dados, vistas);
  fs.writeFileSync(arqDados, JSON.stringify(dados), 'utf8');
  const total = gravaVistas(vistas);
  const iFecha = dados.colunas.indexOf('encerramento'), i = dados.colunas.indexOf('dataAlterada');
  for (const e of dados.editais) if (e[i]) console.log(`  data alterada: ${e[0]}/${e[1]} ${e[3]} · era ${e[i][0]}, agora ${minuto(e[iFecha])} (visto em ${e[i][1]})`);
  console.log(`${n} edital(is) com a data alterada · datas-vistas.json: ${total} editais`);
}
