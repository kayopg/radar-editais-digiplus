// Os editais convertidos para PDF (edital-pdf.mjs): o indice em docs/editais-pdf.json
// e os bytes de cada um em docs/editais-pdf/<cnpj-ano-seq>.pdf.
//
// Ate 12/11/2026 os bytes iam dentro do proprio JSON, em base64. Com o teto de 25
// MB do site e a lista de 191 editais, o JSON passou do maior texto que o Node
// consegue montar ("RangeError: Invalid string length" no JSON.stringify): o
// edital-pdf.mjs caia na gravacao, depois de converter tudo, e desde a lista de
// 11/11 nenhum edital novo ganhava o PDF unico no site — o da UNESP de Presidente
// Prudente/SP (PE 487/2026) saia sem o termo de referencia (usuario: "este edital
// esta sem o termo de referencia"). O indice sem os bytes fica pequeno, e cada PDF
// e lido so quando e preciso.
//
// O formato antigo (b64 dentro do indice) ainda e lido: o cache do robo e a
// maquina do usuario tem arquivos assim, e a primeira gravacao os passa para a
// pasta (separaBytes).
import fs from 'node:fs';
import path from 'node:path';

export const arquivoDoEdital = caminho => String(caminho).replace(/[^0-9A-Za-z]+/g, '-');
export const pastaDosPdfs = docs => path.join(docs, 'editais-pdf');
export const arquivoDoPdf = (docs, caminho) => path.join(pastaDosPdfs(docs), arquivoDoEdital(caminho) + '.pdf');

// O indice: { varredura, editais: { caminho: { nome, origem, paginas, ..., bytes } } }.
// Entrada do formato antigo traz o b64; entrada nova sem o arquivo ao lado (cache
// do indice sem a pasta) sai, para o edital ser convertido de novo.
export function leIndice(docs) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(docs, 'editais-pdf.json'), 'utf8')); } catch { return null; }
  const editais = j.editais || {};
  for (const [k, v] of Object.entries(editais)) {
    if (!v || (!v.b64 && !fs.existsSync(arquivoDoPdf(docs, k)))) delete editais[k];
  }
  return { ...j, editais };
}

// Os bytes de um convertido: do b64 antigo ou do arquivo da pasta.
export function bytesDoPdf(docs, caminho, entrada) {
  if (entrada && entrada.b64) return Buffer.from(entrada.b64, 'base64');
  try { return fs.readFileSync(arquivoDoPdf(docs, caminho)); } catch { return null; }
}

// Grava os bytes de um edital na pasta e devolve o tamanho.
export function gravaPdf(docs, caminho, bytes) {
  fs.mkdirSync(pastaDosPdfs(docs), { recursive: true });
  fs.writeFileSync(arquivoDoPdf(docs, caminho), bytes);
  return bytes.length;
}

// Passa o b64 das entradas antigas para a pasta (a entrada fica so com o tamanho).
export function separaBytes(docs, editais) {
  for (const [k, v] of Object.entries(editais)) {
    if (!v || !v.b64) continue;
    const { b64, ...resto } = v;
    editais[k] = { ...resto, bytes: gravaPdf(docs, k, Buffer.from(b64, 'base64')) };
  }
  return editais;
}

// Grava o indice so com os editais vivos e apaga da pasta os PDFs que nao estao nele.
export function gravaIndice(docs, indice, vivos) {
  const editais = indice.editais || {};
  if (vivos) for (const k of Object.keys(editais)) if (!vivos.has(k)) delete editais[k];
  separaBytes(docs, editais);
  const pasta = pastaDosPdfs(docs);
  if (fs.existsSync(pasta)) {
    const ficam = new Set(Object.keys(editais).map(k => arquivoDoEdital(k) + '.pdf'));
    for (const nome of fs.readdirSync(pasta)) if (nome.endsWith('.pdf') && !ficam.has(nome)) fs.rmSync(path.join(pasta, nome), { force: true });
  }
  fs.writeFileSync(path.join(docs, 'editais-pdf.json'), JSON.stringify({ ...indice, editais }), 'utf8');
  let mb = 0;
  for (const k of Object.keys(editais)) { try { mb += fs.statSync(arquivoDoPdf(docs, k)).size / 1048576; } catch { /* sem o arquivo */ } }
  return { editais: Object.keys(editais).length, mb };
}
