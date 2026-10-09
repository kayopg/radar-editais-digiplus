// Caso simulado da marca "Data alterada" (datas-alteradas.mjs), sem mexer nos arquivos.
import { marcaDatasAlteradas } from './datas-alteradas.mjs';
const lista = fecha => ({ colunas: ['municipio', 'uf', 'orgao', 'edital', 'encerramento', 'path'], editais: [['A', 'RS', 'o', 'e', fecha, 'x/2026/1'], ['B', 'PR', 'o', 'e', '2026-10-30T09:00', 'x/2026/2']] });
const vistas = {};
const casos = [];
let d = lista('2026-10-09T09:00'); marcaDatasAlteradas(d, vistas, '2026-10-08'); casos.push(['primeira vez, sem marca', d.editais[0][6] === '']);
d = lista('2026-10-09T09:00'); marcaDatasAlteradas(d, vistas, '2026-10-09'); casos.push(['mesma data, sem marca', d.editais[0][6] === '']);
d = lista('2026-10-21T09:00'); marcaDatasAlteradas(d, vistas, '2026-10-10'); casos.push(['mudou 09/10 -> 21/10', JSON.stringify(d.editais[0][6]) === '["2026-10-09T09:00","2026-10-10"]']);
d = lista('2026-10-21T09:00'); marcaDatasAlteradas(d, vistas, '2026-10-11'); casos.push(['a marca fica no dia seguinte', JSON.stringify(d.editais[0][6]) === '["2026-10-09T09:00","2026-10-10"]']);
d = lista('2026-10-21T14:00'); marcaDatasAlteradas(d, vistas, '2026-10-12'); casos.push(['so o horario mudou: anterior e 21/10 09:00', JSON.stringify(d.editais[0][6]) === '["2026-10-21T09:00","2026-10-12"]']);
casos.push(['o outro edital nunca mudou', d.editais[1][6] === '']);
d = { ...lista('2026-10-21T14:00'), editais: [lista('2026-10-21T14:00').editais[1]] }; marcaDatasAlteradas(d, vistas, '2026-10-13');
d = lista('2026-11-05T14:00'); marcaDatasAlteradas(d, vistas, '2026-10-20'); casos.push(['saiu da lista e voltou com data nova', JSON.stringify(d.editais[0][6]) === '["2026-10-21T14:00","2026-10-20"]']);
let erros = 0;
for (const [n, ok] of casos) { console.log((ok ? 'ok    ' : 'ERRO  ') + n); if (!ok) erros++; }
console.log(`${casos.length - erros} de ${casos.length} corretos`);
process.exit(erros ? 1 : 0);
