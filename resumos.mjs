// Gera um PDF completo por edital, com o edital oficial do orgao anexado por
// inteiro — e ali, no Termo de Referencia, que mora o descritivo completo dos
// produtos. A API do PNCP nao tem esse texto: conferimos os 1082 descritivos do
// dados.json contra o /itens ao vivo e os 1082 sao identicos, com 27% deles
// abaixo de 40 caracteres ("LIQUIDIFICADOR", "AR CONDICIONADO", "TELEVISOR").
//
// Roda na maquina, nao no Actions: sao centenas de MB de download por rodada e
// nada disso deve entrar no repositorio (a pasta resumos/ esta no .gitignore).
//
// Uso:
//   node resumos.mjs                  -> todos os editais, edital oficial inteiro
//   node resumos.mjs --uf PR          -> so um estado
//   node resumos.mjs --paginas 5      -> so as 5 primeiras paginas do oficial
//   node resumos.mjs --limite 10      -> os 10 que fecham primeiro (para testar)
//   node resumos.mjs --sem-anexo      -> so o resumo, sem baixar o oficial
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { montaResumo, anexaOficial, buscaTodosItens, nomeArquivo, numeroEdital } from './resumo-pdf.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(nome);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
};
const flag = nome => process.argv.includes(nome);

const UF = (arg('--uf', '') || '').toUpperCase();
const LIMITE = Number(arg('--limite', 0));            // 0 = sem limite
const SEM_ANEXO = flag('--sem-anexo');
// Por padrao anexa so as paginas que descrevem os produtos. --inteiro traz o
// documento como veio, e --paginas N traz as N primeiras.
const PAGINAS = Number(arg('--paginas', 0));
const MODO = flag('--inteiro') ? 'inteiro' : (PAGINAS > 0 ? PAGINAS : 'uteis');
const SAIDA = path.join(DIR, 'resumos');

const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));
const varredura = dados.meta.varredura.split('-').reverse().join('/');

let alvos = dados.editais;
if (UF) alvos = alvos.filter(e => e[1] === UF);
if (LIMITE) alvos = alvos.slice(0, LIMITE);

if (!alvos.length) { console.error('nenhum edital com esse filtro'); process.exit(1); }

// Uma pasta por estado e o nome comecando pela data de encerramento: quem cota
// trabalha por prazo, entao o que fecha antes aparece primeiro na ordenacao.
const destinoDe = e => path.join(SAIDA, e[1],
  nomeArquivo(e[4].slice(0, 10) + ' ' + e[0] + ' - ' + numeroEdital(e[3])) + '.pdf');

console.log(`${alvos.length} edital(is)${UF ? ' em ' + UF : ''} · varredura de ${varredura}`);
console.log(SEM_ANEXO ? 'sem anexar o edital oficial'
  : 'anexando ' + (MODO === 'uteis' ? 'so as paginas que descrevem os produtos'
    : MODO === 'inteiro' ? 'o edital oficial inteiro' : 'as ' + MODO + ' primeiras paginas'));
console.log('saida: ' + SAIDA + '\n');

const relatorio = [];
let feitos = 0, comAnexo = 0, semAnexo = 0, erros = 0;

// Concorrencia baixa: sao arquivos grandes (um chegou a 28 MB) e o PNCP derruba
// conexao acima de meia duzia de requisicoes simultaneas.
async function pool(itens, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < itens.length) { const k = i++; await fn(itens[k], k); }
  }));
}

await pool(alvos, 4, async (e) => {
  const destino = destinoDe(e);
  try {
    // Busca os itens uma vez so: o resumo usa para a secao "demais itens" e o
    // seletor usa os mesmos descritivos para achar a tabela no edital oficial.
    const itens = await buscaTodosItens(e);
    const { doc, nDemais, nTodos } = await montaResumo(e, { varredura, todos: itens });
    let nota = 'sem anexo';
    if (!SEM_ANEXO) {
      const a = await anexaOficial(doc, e, { modo: MODO, itens: itens || [] });
      if (a.ok) { nota = `${a.paginas}/${a.total} pag. do oficial`; comAnexo++; }
      else { nota = a.motivo; semAnexo++; }
    }
    const bytes = doc.bytes();
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, bytes);
    relatorio.push({ uf: e[1], mun: e[0], edital: e[3], fecha: e[4].slice(0, 10),
                     itens: e[8].length, demais: nDemais, todos: nTodos,
                     kb: +(bytes.length / 1024).toFixed(1), nota,
                     arquivo: path.relative(DIR, destino) });
    feitos++;
    console.log(`  [${String(feitos).padStart(3)}/${alvos.length}] ${e[0]}/${e[1]} · ${(bytes.length / 1024).toFixed(0)} KB · ${nota}`);
  } catch (err) {
    erros++;
    console.log(`  [erro] ${e[0]}/${e[1]}: ${err.message}`);
  }
});

relatorio.sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.mun < b.mun ? -1 : 1));
fs.writeFileSync(path.join(SAIDA, 'indice.json'),
  JSON.stringify({ varredura, gerado: new Date().toISOString(), total: relatorio.length, editais: relatorio }, null, 1), 'utf8');

const linhas = ['# Resumos por edital — varredura de ' + varredura, '',
  `${relatorio.length} edital(is). Uma pasta por estado; o nome comeca pela data de encerramento.`,
  'O descritivo completo de cada produto esta nas paginas do edital oficial, anexadas ao fim de cada PDF.', ''];
let ufAtual = '';
for (const r of relatorio.slice().sort((a, b) => a.uf === b.uf ? (a.fecha < b.fecha ? -1 : 1) : (a.uf < b.uf ? -1 : 1))) {
  if (r.uf !== ufAtual) { ufAtual = r.uf; linhas.push('', '## ' + ufAtual, ''); }
  linhas.push(`- **${r.fecha}** · ${r.mun} · ${r.itens} item(ns) de interesse` +
    (r.todos ? ` de ${r.todos} no edital` : '') + ` · ${r.kb} KB · ${r.nota}`);
}
fs.writeFileSync(path.join(SAIDA, 'LEIA-ME.md'), linhas.join('\n') + '\n', 'utf8');

const kbTotal = relatorio.reduce((s, r) => s + r.kb, 0);
console.log(`\n${feitos} PDF(s) · ${(kbTotal / 1024).toFixed(1)} MB no total`);
if (!SEM_ANEXO) console.log(`edital oficial anexado: ${comAnexo} · sem anexo: ${semAnexo}`);
if (erros) console.log(`erros: ${erros}`);
console.log('indice: resumos/LEIA-ME.md e resumos/indice.json');
