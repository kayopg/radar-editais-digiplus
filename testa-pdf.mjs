// Teste do gerador de PDF. Roda o MESMO docs/pdf.js que o navegador usa, gera
// os arquivos e confere que abrem, paginam e mantêm a acentuação.
//
// Uso: node testa-pdf.mjs [busca]
//   node testa-pdf.mjs Gravataí     -> gera o resumo desse município
//   node testa-pdf.mjs              -> usa o edital com o descritivo mais longo
//
// ATENÇÃO: o montador abaixo espelha o resumo() do docs/index.html. Se mudar o
// layout lá, mude aqui também — senão o teste passa a validar outra coisa.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const PDF = createRequire(import.meta.url)(path.join(DIR, 'docs', 'pdf.js'));
const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));

const CAT = { RF:'Refrigeração', CL:'Climatização', CC:'Cocção', PR:'Preparo',
              EP:'Eletroportáteis', LV:'Lavanderia', BB:'Bebedouro',
              CX:'Coifa/Exaustão', OT:'Outros' };
const NOW = new Date();
const moeda = v => 'R$ ' + v.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
const dataBR = iso => iso.slice(8,10) + '/' + iso.slice(5,7) + '/' + iso.slice(0,4);
const dias = iso => Math.floor((new Date(iso) - NOW) / 864e5);
function quandoTxt(iso){
  const d = dias(iso), hm = iso.slice(11,16);
  return dataBR(iso) + (hm && hm !== '00:00' ? ' às ' + hm : '')
       + ' (' + (d <= 0 ? 'hoje' : d === 1 ? 'amanhã' : 'em ' + d + ' dias') + ')';
}
const numeroEdital = t => String(t||'').replace(/^.*n[º°]\s*/i,'').replace(/^\(\d+\)\s*\|\s*/,'').trim() || String(t||'');
const nomeArquivo = s => s.replace(/\//g,'-').replace(/[^0-9A-Za-zÀ-ÿ .-]/g,' ').replace(/ {2,}/g,' ').trim();

const COLS = [
  {titulo:'#',           larg:0.045, alinha:'centro'},
  {titulo:'Categoria',   larg:0.125},
  {titulo:'Descritivo',  larg:0.475},
  {titulo:'Qtd',         larg:0.075, alinha:'centro'},
  {titulo:'Valor unit.', larg:0.14,  alinha:'direita'},
  {titulo:'Total',       larg:0.14,  alinha:'direita'}
];
const varredura = dados.meta.varredura.split('-').reverse().join('/');

function montaResumo(r){
  const doc = PDF.novo({ rodape: 'Radar de Editais Digiplus · varredura de ' + varredura });
  doc.tituloComValor(r[0] + ' / ' + r[1], r[6] ? moeda(r[6]) : 'orçamento sigiloso', { tam:15 });
  doc.texto(r[2], { tam:9, cor:[0.28,0.28,0.28] });
  doc.regua(1);
  doc.espaco(3);
  doc.campo('Edital', r[3]);
  if(r[11]) doc.campo('Modalidade', r[11]);
  if(r[10]) doc.campo('Unidade', r[10]);
  doc.campo('Encerramento', quandoTxt(r[4]));
  doc.campo('Valor total estimado', r[6] ? moeda(r[6]) : 'orçamento sigiloso');
  doc.campo('Quantidade total', r[5].toLocaleString('pt-BR') + ' unidades em '
            + r[8].length + (r[8].length === 1 ? ' item' : ' itens'));
  if(r[12]) doc.campo('Publicado no PNCP', dataBR(r[12]));
  if(r[9]) doc.campo('Objeto', r[9]);
  doc.campo('Processo PNCP', r[7]);
  doc.campo('Página oficial', 'https://pncp.gov.br/app/editais/' + r[7]);
  if(r[13]){
    const pp = r[7].split('/');
    doc.campo('Arquivo oficial', 'https://pncp.gov.br/pncp-api/v1/orgaos/' + pp[0]
      + '/compras/' + pp[1] + '/' + pp[2] + '/arquivos/' + r[13]
      + (r[14] ? '  (' + String(r[14]).toUpperCase() + ')' : ''));
  }
  doc.espaco(11);
  doc.texto('Itens solicitados', { tam:12, negrito:true });
  doc.regua(0.8, [0.55,0.55,0.55]);
  doc.espaco(2);
  r[8].forEach((it, k) => {
    if(k > 0){ doc.espaco(5); doc.regua(0.5, [0.78,0.78,0.78]); doc.espaco(3); }
    doc.reserva(64);
    doc.parOposto('ITEM ' + (k+1) + '   ·   ' + CAT[it[0]],
                  it[1].toLocaleString('pt-BR') + (it[1] === 1 ? ' unidade' : ' unidades'),
                  { tam:10, negritoEsq:true, negritoDir:true, corEsq:[0,0,0] });
    doc.espaco(2);
    doc.texto(it[3], { tam:9.5, alturaLinha:13 });
    doc.espaco(3);
    doc.parOposto('Valor unitário de referência', it[2] ? moeda(it[2]) : 'sigiloso', { tam:8.5 });
    doc.parOposto('Total do item', it[2] ? moeda(it[1]*it[2]) : 'sigiloso',
                  { tam:8.5, negritoDir:true });
  });
  doc.espaco(10);
  doc.texto('Os valores são estimativas do órgão, não referência de mercado. Itens marcados como '
    + 'sigiloso tiveram o orçamento fechado pelo órgão. Sobram cerca de 4% de falsos positivos '
    + 'residuais: confira o edital oficial antes de cotar.', { tam:7.5, cor:[0.35,0.35,0.35] });
  return doc;
}

// ---------------------------------------------------------------- escolha
const busca = process.argv[2];
let alvo;
if(busca){
  alvo = dados.editais.find(e => (e[0] + '/' + e[1]).toLowerCase().includes(busca.toLowerCase()));
  if(!alvo){ console.error('nao achei edital para "' + busca + '"'); process.exit(1); }
} else {
  let maior = 0;
  for(const e of dados.editais) for(const it of e[8])
    if(it[3].length > maior){ maior = it[3].length; alvo = e; }
  console.log('descritivo mais longo da lista:', maior, 'caracteres');
}

const doc = montaResumo(alvo);

// Anexa as primeiras páginas do edital oficial, se pedido:
//   node testa-pdf.mjs "Gravataí" 2
// Aqui funciona porque o Node não aplica CORS. No navegador está desligado —
// ver a nota do ANEXAR_OFICIAL no docs/index.html.
const nPag = Number(process.argv[3] || 0);
if (nPag > 0 && alvo[13] && String(alvo[14]).toLowerCase() === 'pdf') {
  const LE = createRequire(import.meta.url)(path.join(DIR, 'docs', 'pdf-le.js'));
  const pp = alvo[7].split('/');
  const url = 'https://pncp.gov.br/api/pncp/v1/orgaos/' + pp[0] + '/compras/' + pp[1]
            + '/' + pp[2] + '/arquivos/' + alvo[13];
  try {
    const resp = await fetch(url);
    const le = await LE.abre(new Uint8Array(await resp.arrayBuffer()));
    const q = Math.min(nPag, le.total);
    doc.espaco(8);
    doc.texto('A seguir, ' + (q === 1 ? 'a primeira página' : 'as ' + q + ' primeiras páginas')
      + ' do edital oficial (' + le.total + ' no total), copiadas do arquivo publicado no PNCP.',
      { tam: 8, negrito: true, cor: [0.2, 0.2, 0.2] });
    doc.anexaExternas(await LE.extraiPaginas(le, Array.from({ length: q }, (_, i) => i)), false);
    console.log('anexadas', q, 'de', le.total, 'paginas do edital oficial');
  } catch (e) {
    console.log('nao deu para anexar:', e.message);
  }
}

const bytes = doc.bytes();
const nome = nomeArquivo('Edital ' + alvo[0] + ' ' + alvo[1] + ' ' + numeroEdital(alvo[3])) + '.pdf';
fs.writeFileSync(path.join(DIR, nome), bytes);
console.log('resumo :', nome, '|', (bytes.length/1024).toFixed(1), 'KB |', doc.paginas(), 'pagina(s)');

// ---------------------------------------------------------------- lista
const d2 = PDF.novo({ rodape: 'Radar de Editais Digiplus · varredura de ' + varredura });
d2.texto('Radar de Editais Digiplus', { tam:19, negrito:true });
d2.texto('Varredura de ' + varredura + ' · ' + dados.editais.length + ' editais',
         { tam:9, cor:[0.3,0.3,0.3] });
d2.espaco(10);
d2.texto('Índice', { tam:13, negrito:true, depois:3 });
d2.tabela(
  [ {titulo:'#', larg:0.05, alinha:'centro'},
    {titulo:'Município / UF', larg:0.24},
    {titulo:'Edital', larg:0.28},
    {titulo:'Encerramento', larg:0.15, alinha:'centro'},
    {titulo:'Qtd', larg:0.08, alinha:'centro'},
    {titulo:'Valor estimado', larg:0.20, alinha:'direita'} ],
  dados.editais.map((e,k) => [
    String(k+1), e[0] + ' / ' + e[1], e[3], dataBR(e[4]),
    e[5].toLocaleString('pt-BR'), e[6] ? moeda(e[6]) : 'sigiloso'
  ])
);
const b2 = d2.bytes();
fs.writeFileSync(path.join(DIR, 'teste-lista.pdf'), b2);
console.log('indice :', 'teste-lista.pdf |', (b2.length/1024).toFixed(1), 'KB |', d2.paginas(), 'pagina(s)');
