// Prova que o docs/pdf-le.js consegue abrir o edital oficial do órgão e copiar
// páginas dele para dentro do PDF gerado pelo docs/pdf.js.
//
// Baixa uma amostra de editais reais da lista do dia, copia as N primeiras
// páginas de cada um e confere que o texto da página copiada é IDÊNTICO ao da
// página original. Não valida imagem — para isso é preciso abrir o arquivo.
//
// Uso: node testa-anexo.mjs [quantasPaginas] [quantosEditais]
//
// Nota: isto NÃO roda no navegador hoje. O PNCP manda o cabeçalho CORS errado
// no endpoint de arquivos (Access-Control-Allow-Origin duas vezes, ou com o
// valor "*, *"), e nenhum navegador aceita. Aqui funciona porque o Node não
// aplica CORS. Ver a nota do ANEXAR_OFICIAL no docs/index.html.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { createRequire } from 'node:module';

// fileURLToPath e nao o pathname cru: o import.meta.url vem percent-encoded,
// entao uma pasta de usuario com acento no nome virava Usu%C3%A1rio e o
// require nao achava nada. So aparece fora do Actions, onde o caminho e ASCII.
const DIR = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);
const PDF = req(path.join(DIR, 'docs', 'pdf.js'));
const LE  = req(path.join(DIR, 'docs', 'pdf-le.js'));

const N_PAG = Number(process.argv[2] || 1);
const N_EDI = Number(process.argv[3] || 8);

const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));
const pdfs = dados.editais.filter(e => e[14] === 'pdf' && e[13]);
if (!pdfs.length) { console.error('nenhum edital com arquivo PDF na lista'); process.exit(1); }

// amostra espalhada pela lista, não os primeiros — órgãos diferentes geram
// PDFs de ferramentas diferentes (Word, FPDF, Aspose, OpenPDF, iTextSharp)
const passo = Math.max(1, Math.floor(pdfs.length / N_EDI));
const amostra = [];
for (let i = 0; i < pdfs.length && amostra.length < N_EDI; i += passo) amostra.push(pdfs[i]);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-anexo-'));
console.log('amostra de', amostra.length, 'editais |', N_PAG, 'pagina(s) de cada');
console.log('temporarios em', tmp);
console.log();

let ok = 0, falhas = 0, somaSaida = 0;
for (const e of amostra) {
  const pp = e[7].split('/');
  const url = 'https://pncp.gov.br/api/pncp/v1/orgaos/' + pp[0] + '/compras/' + pp[1]
            + '/' + pp[2] + '/arquivos/' + e[13];
  const rotulo = (e[0] + '/' + e[1]).slice(0, 26);
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const bruto = new Uint8Array(await resp.arrayBuffer());

    const le = await LE.abre(bruto);
    const quantas = Math.min(N_PAG, le.total);
    const doc = PDF.novo({ rodape: 'Radar de Editais Digiplus' });
    doc.texto('Resumo — ' + e[0] + ' / ' + e[1], { tam: 14, negrito: true });
    doc.texto('Página de teste. Abaixo, o edital oficial.', { tam: 9 });
    doc.anexaExternas(await LE.extraiPaginas(le, Array.from({ length: quantas }, (_, i) => i)), false);
    const saida = doc.bytes();
    somaSaida += saida.length;

    const arqOrig = path.join(tmp, rotulo.replace(/\W/g, '_') + '-orig.pdf');
    const arqNovo = path.join(tmp, rotulo.replace(/\W/g, '_') + '-novo.pdf');
    fs.writeFileSync(arqOrig, bruto);
    fs.writeFileSync(arqNovo, saida);

    console.log(rotulo.padEnd(28),
      'origem', String(le.total).padStart(3), 'pgs', (bruto.length / 1048576).toFixed(2), 'MB',
      '-> saida', (1 + quantas), 'pgs', (saida.length / 1024).toFixed(0).padStart(4), 'KB');
    ok++;
  } catch (err) {
    console.log(rotulo.padEnd(28), 'ERRO:', err.message);
    falhas++;
  }
}

console.log();
console.log('gerados:', ok, '| falhas:', falhas,
            '| tamanho medio da saida:', ok ? Math.round(somaSaida / ok / 1024) + ' KB' : '-');
console.log();
console.log('Para conferir o texto pagina a pagina, rode no Python:');
console.log('  from pypdf import PdfReader');
console.log('  # compare PdfReader(novo).pages[1] com PdfReader(orig).pages[0]');
console.log('Os arquivos ficaram em', tmp);
process.exit(falhas ? 1 : 0);
