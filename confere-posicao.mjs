// O descritivo colado no item veio da LINHA daquele item?
//
// A auditoria de casamento compara o rotulo com o descritivo por palavras, e
// deixa passar os dois erros mais caros:
//
//   A) o mesmo texto colado em dois itens de rotulos diferentes. Catanduva/SP
//      dava a balanca de ANIMAIS ADULTOS 200 kg tambem para o item de ANIMAIS
//      FILHOTES 15 kg — quatro palavras em comum, auditoria feliz, produto
//      errado.
//   B) o texto de um item colado no vizinho, deixando o dono sem nada. Sao
//      Jose da Boa Vista/PR: o item 107 (ventilador de PAREDE) ficou com o
//      texto do 108 (ventilador de TETO), e o 108 ficou vazio.
//
// Nenhum dos dois se acha por semelhanca de palavras; acham-se por posicao.
import fs from 'node:fs';
const de = JSON.parse(fs.readFileSync('docs/descritivos.json', 'utf8'));
const dd = JSON.parse(fs.readFileSync('docs/dados.json', 'utf8'));
const C = dd.colunas.reduce((o, n, i) => (o[n] = i, o), {});
const DE = 'áàâãäéèêëíìîïóòôõöúùûüçñ';
const PARA = 'aaaaaeeeeiiiiooooouuuucn';
const norm = s => String(s ?? '').toLowerCase()
  .replace(/[^\x00-\x7f]/g, c => { const i = DE.indexOf(c); return i < 0 ? c : PARA[i]; });
const linha = s => String(s ?? '').replace(/\s+/g, ' ').trim();

const achados = [];
for (const ed of dd.editais) {
  const v = de.editais[ed[C.path]];
  if (!v || !v.itens) continue;
  const onde = ed[C.municipio] + '/' + ed[C.uf];
  const nossos = new Set(ed[C.itens].map(i => i[5]));
  const comTexto = v.itens.filter(x => x[6] && nossos.has(x[0]));
  const vazios = new Set(v.itens.filter(x => !x[6]).map(x => x[0]));

  // ---- A) texto repetido em itens que o edital descreve diferente
  const porTexto = new Map();
  for (const x of comTexto) {
    const k = norm(x[6]).slice(0, 300);
    if (!porTexto.has(k)) porTexto.set(k, []);
    porTexto.get(k).push(x);
  }
  for (const grupo of porTexto.values()) {
    if (grupo.length < 2) continue;
    if (!grupo.some(x => nossos.has(x[0]))) continue;
    const rotulos = new Set(grupo.map(x => norm(x[1]).replace(/[^a-z0-9]+/g, ' ').trim()));
    if (rotulos.size < 2) continue;   // itens iguais de verdade: repetir e certo
    achados.push({ tipo: 'A', onde, path: ed[C.path],
      itens: grupo.map(x => x[0] + ' = ' + linha(x[1]).slice(0, 48)),
      texto: linha(grupo[0][6]).slice(0, 70) });
  }

  // ---- B) texto que abre na linha de outro item, e esse outro esta vazio
  const txt = (v.secoes || []).map(s => s.texto).join('  ');
  if (!txt) continue;
  const plano = norm(txt);
  for (const x of comTexto) {
    const agulha = norm(x[6]).slice(0, 45);
    if (agulha.length < 25) continue;
    // todas as ocorrencias: o edital repete a tabela em resumo e por extenso,
    // e basta UMA delas abrir com o numero certo para o recorte estar no lugar
    const nums = [];
    let k = plano.indexOf(agulha);
    while (k > 0 && nums.length < 8) {
      const antes = norm(txt.slice(Math.max(0, k - 30), k));
      const m = antes.match(/(?:^|[\s|;])(\d{1,4})(?:\.\d{1,3})?\s*[-–]?\s*$/)
             || antes.match(/(?:^|[\s|;])(\d{1,4})\s+[\d.\-\/]{4,}\s*$/);
      if (m) nums.push(+m[1]);
      k = plano.indexOf(agulha, k + 1);
    }
    if (!nums.length || nums.includes(x[0])) continue;
    const dono = nums.find(n => vazios.has(n));
    if (dono !== undefined) achados.push({ tipo: 'B', onde, path: ed[C.path],
      item: x[0], dono, rotulo: linha(x[1]).slice(0, 48),
      outro: linha((v.itens.find(y => y[0] === dono) || [])[1]).slice(0, 48),
      texto: linha(x[6]).slice(0, 70) });
  }
}

const a = achados.filter(x => x.tipo === 'A'), b = achados.filter(x => x.tipo === 'B');
console.log('A) mesmo texto em itens de rotulos diferentes: ' + a.length);
for (const x of a) console.log('   ' + x.onde + '\n      ' + x.itens.join('\n      ') + '\n      texto: ' + x.texto);
console.log('B) texto colado no vizinho, dono vazio: ' + b.length);
for (const x of b) console.log('   ' + x.onde + ' · item ' + x.item + ' ficou com a linha do ' + x.dono
  + '\n      item ' + x.item + ': ' + x.rotulo + '\n      item ' + x.dono + ': ' + x.outro
  + '\n      texto: ' + x.texto);
