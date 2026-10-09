// Monta o site (GitHub Pages) na pasta _site, com as folhas de abertura e os
// editais convertidos para PDF — o que ate 07/10/2026 so o artefato tinha.
//
// O usuario pediu em 07/10/2026 o site com "a pagina de capa do edital, e os
// PDF's convertidos dos editais em .rar". As duas coisas pesam: o
// aberturas.json do dia passa de 100 MB e o editais-pdf.json de 20 MB, e
// versionar isso todo dia poria gigabytes no historico do repositorio em
// poucos meses. Por isso o robô do site (.github/workflows/site.yml) gera os
// dois, roda este script e manda a pasta direto para o Pages, sem commit.
//
// Cada edital vira um arquivo, para a pagina buscar so o que abriu:
//   capas/<cnpj-ano-seq>.json  a folha de abertura ({ b64, paginas, tira, ... })
//   pdfs/<cnpj-ano-seq>.pdf    o edital convertido (os bytes do PDF)
//   pdfs/indice.json           o que cada convertido e (nome, origem, paginas, de)
// O nome do arquivo e o do arquivoDoEdital() do docs/index.html.
//
// Tambem poda o aberturas.json e o editais-pdf.json aos editais do dia: o
// robô guarda os dois em cache de um dia para o outro, e sem a poda eles
// cresceriam sem parar (na maquina do usuario o aberturas.json acumulou 130 MB).
//
// Uso: node site.mjs [pasta de saida, padrao _site]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { limpaTextoPncp } from './texto-pncp.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.join(DIR, 'docs');
const SAIDA = path.resolve(process.argv[2] || path.join(DIR, '_site'));
const arquivoDoEdital = caminho => String(caminho).replace(/[^0-9A-Za-z]+/g, '-');
const le = arq => { try { return JSON.parse(fs.readFileSync(path.join(DOCS, arq), 'utf8')); } catch { return null; } };

fs.rmSync(SAIDA, { recursive: true, force: true });
fs.mkdirSync(path.join(SAIDA, 'capas'), { recursive: true });
fs.mkdirSync(path.join(SAIDA, 'pdfs'), { recursive: true });

// o que o site ja servia: tudo da docs/ que esta no git, menos os dois pesados
const PESADOS = new Set(['aberturas.json', 'editais-pdf.json']);
for (const nome of fs.readdirSync(DOCS)) {
  const de = path.join(DOCS, nome);
  if (PESADOS.has(nome) || !fs.statSync(de).isFile()) continue;
  fs.copyFileSync(de, path.join(SAIDA, nome));
}

// O descritivos.json vai SEM o texto das secoes do edital, como no artefato
// (artefato.mjs): a pagina so le os itens de cada edital, e o texto e o que o
// descritivo-por-item.mjs usa para recortar, antes de publicar. Com ele o
// arquivo tinha 15,8 MB e era baixado de novo a cada visita (09/10/2026).
//
// E o nome de cada item vai limpo (texto-pncp.mjs), como no artefato: e dele
// que sai a lista "Demais itens do edital" do resumo em PDF, e o de Sao Joao
// da Ponte/MG chegava do PNCP como "MESA PL?STICA", "CAIXA D??GUA" (09/10/2026).
{
  const de = path.join(DOCS, 'descritivos.json');
  if (fs.existsSync(de)) {
    const base = JSON.parse(fs.readFileSync(de, 'utf8'));
    for (const v of Object.values(base.editais || {})) {
      delete v.secoes;
      for (const x of v.itens || []) x[1] = limpaTextoPncp(String(x[1] ?? ''));
    }
    fs.writeFileSync(path.join(SAIDA, 'descritivos.json'), JSON.stringify(base), 'utf8');
  }
}

const dados = le('dados.json');
const C = Object.fromEntries(dados.colunas.map((c, i) => [c, i]));
const vivos = new Set(dados.editais.map(e => e[C.path]));

// as folhas de abertura, uma por edital
const aberturas = le('aberturas.json') || { editais: {} };
let capas = 0, mbCapas = 0;
for (const [caminho, a] of Object.entries(aberturas.editais || {})) {
  if (!vivos.has(caminho)) { delete aberturas.editais[caminho]; continue; }
  if (!a || !a.b64) continue;
  const txt = JSON.stringify(a);
  fs.writeFileSync(path.join(SAIDA, 'capas', arquivoDoEdital(caminho) + '.json'), txt, 'utf8');
  capas++; mbCapas += txt.length / 1048576;
}

// os editais convertidos: o indice sem os bytes, e os bytes em .pdf
const convertidos = le('editais-pdf.json') || { editais: {} };
const indice = {};
let pdfs = 0, mbPdfs = 0;
for (const [caminho, p] of Object.entries(convertidos.editais || {})) {
  if (!vivos.has(caminho)) { delete convertidos.editais[caminho]; continue; }
  if (!p || !p.b64) continue;
  const bytes = Buffer.from(p.b64, 'base64');
  fs.writeFileSync(path.join(SAIDA, 'pdfs', arquivoDoEdital(caminho) + '.pdf'), bytes);
  const { b64, ...resto } = p;
  indice[caminho] = resto;
  pdfs++; mbPdfs += bytes.length / 1048576;
}
fs.writeFileSync(path.join(SAIDA, 'pdfs', 'indice.json'),
  JSON.stringify({ varredura: dados.meta && dados.meta.varredura, editais: indice }), 'utf8');

// a poda dos dois arquivos guardados em cache pelo robô
if (fs.existsSync(path.join(DOCS, 'aberturas.json'))) fs.writeFileSync(path.join(DOCS, 'aberturas.json'), JSON.stringify(aberturas), 'utf8');
if (fs.existsSync(path.join(DOCS, 'editais-pdf.json'))) fs.writeFileSync(path.join(DOCS, 'editais-pdf.json'), JSON.stringify(convertidos), 'utf8');

console.log(`site em ${SAIDA}: ${dados.editais.length} editais · ${capas} folhas de abertura (${mbCapas.toFixed(1)} MB) · ${pdfs} editais convertidos (${mbPdfs.toFixed(1)} MB)`);
