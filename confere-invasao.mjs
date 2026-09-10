// O descritivo saiu da celula e entrou no corpo do edital?
//
// O usuario abriu o item 14 de Descalvado/SP e leu, no lugar da especificacao
// da cortina de ar, a "CLAUSULA SEXTA - DOS PAGAMENTOS 6.1. Os pagamentos serao
// efetuados em ate 15 (quinze) dias...". O recorte do ULTIMO item de cada
// tabela nao tem um proximo para fecha-lo e segue documento adentro.
//
// As auditorias de contaminacao e de casamento nao pegam isto: o texto e do
// produto certo, so vem com clausula colada no fim.
import fs from 'node:fs';
const dd = JSON.parse(fs.readFileSync('docs/dados.json', 'utf8'));
const de = JSON.parse(fs.readFileSync('docs/descritivos.json', 'utf8'));
const C = dd.colunas.reduce((o, n, i) => (o[n] = i, o), {});

const INVASAO = [
  [/CL[ÁA]USULA\s+[A-ZÀ-Ú]{4,}/, 'clausula de contrato'],
  [/\s\d{1,2}\.\d{1,2}\.\s+[A-ZÀ-Ú]/, 'numeracao de clausula'],
  [/Nota Fiscal|nota fiscal/, 'nota fiscal'],
  [/transfer[êe]ncia banc[áa]ria|dados banc[áa]rios|Ag[êe]ncia:/, 'dados bancarios'],
  [/pagamentos? ser[ãa]o efetuados|prazo de pagamento/i, 'pagamento'],
  [/IPCA|IBGE/, 'indice de reajuste'],
  [/Detentora da Ata/, 'ata de registro'],
  [/VALOR TOTAL DA PROPOSTA/i, 'formulario de proposta'],
  [/Metodologia de Defini[çc][ãa]o|LEVANTAMENTO DO MERCADO|Mem[óo]ria de C[áa]lculo/i, 'estudo tecnico'],
  [/reajuste|reequil[íi]brio|dota[çc][ãa]o or[çc]ament/i, 'orcamento'],
  [/PROCESSO ADMINISTRATIVO N/i, 'cabecalho do edital'],
];

let total = 0, sujos = 0;
const casos = [];
for (const ed of dd.editais) {
  const v = de.editais[ed[C.path]] || {};
  for (const it of ed[C.itens]) {
    const x = (v.itens || []).find(y => y[0] === it[5]);
    if (!x || !x[6]) continue;
    total++;
    const marcas = INVASAO.filter(([re]) => re.test(x[6])).map(([, n]) => n);
    if (!marcas.length) continue;
    sujos++;
    casos.push('  ' + ed[C.municipio] + '/' + ed[C.uf] + ' item ' + it[5]
      + ' (' + x[6].length + ' chars) · ' + marcas.join(', ')
      + '\n      ...' + x[6].replace(/\s+/g, ' ').slice(-110));
  }
}
console.log(total + ' descritivos conferidos · ' + sujos + ' com texto do corpo do edital dentro');
for (const c of casos) console.log(c);
