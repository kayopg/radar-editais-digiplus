// Guarda a PAGINA DE ABERTURA de cada edital — a folha original, com logo,
// moldura e diagramacao — para o resumo baixado abrir com ela.
//
// O usuario mandou essa pagina do pregao 411/2026 da UFPel em 08/09/2026: e
// onde se ve de uma olhada contratante, objeto, valor estimado, data da sessao,
// criterio de julgamento e modo de disputa. Pediu a pagina ORIGINAL, nao os
// campos remontados em texto — uma tentativa anterior remontou e foi recusada.
//
// A pagina viaja embutida porque o navegador nao consegue busca-la: o endpoint
// de arquivos do PNCP manda o CORS errado e, dentro do artefato, o sandbox
// bloqueia qualquer busca externa.
//
// Como a folha vira dado: o pdf.js monta um PDF de carona com a pagina original
// na frente (anexaExternas com "antes") e a pagina em branco que o novo() cria
// atras. No navegador so a primeira e extraida; a de tras e o custo de nao ter
// um escritor de PDF avulso, e nunca aparece.
//
// Uso:
//   node pagina-abertura.mjs                -> todos os editais
//   node pagina-abertura.mjs --limite 5     -> so os cinco primeiros, para medir
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { textoDasPaginas } from './paginas-uteis.mjs';
import { arquivosPublicados, fontesDe, PDF } from './resumo-pdf.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LE = createRequire(import.meta.url)(path.join(DIR, 'docs', 'pdf-le.js'));

const arg = (n, p) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p; };
const LIMITE = Number(arg('--limite', 0));
// --faltantes so mexe em quem ainda nao tem folha, e junta ao arquivo existente
// em vez de refaze-lo. Serve para a repescagem de quem caiu por falha de rede:
// em 09/09/2026 Coxim/MS e Foz do Iguacu/PR deram HTTP 504 do PNCP, e refazer
// os 62 que ja estavam prontos custaria 40 minutos por causa de dois.
const FALTANTES = process.argv.includes('--faltantes');

const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));
const C = dados.colunas.reduce((o, n, i) => (o[n] = i, o), {});
const arquivoSaida = path.join(DIR, 'docs', 'aberturas.json');

let jaTem = {};
if (FALTANTES) {
  try { jaTem = JSON.parse(fs.readFileSync(arquivoSaida, 'utf8')).editais || {}; }
  catch { console.error('aviso: nao achei aberturas.json — vai processar todos'); }
}

let alvos = dados.editais;
if (FALTANTES) alvos = alvos.filter(e => !jaTem[e[C.path]]);
if (LIMITE) alvos = alvos.slice(0, LIMITE);

// Os campos que identificam a folha de abertura. Contam so em CAIXA ALTA: no
// quadro eles sao titulos, e em caixa mista o que se acha sao mencoes soltas
// no corpo do edital.
const CAMPOS = [
  /CONTRATANTE/, /\bUASG\b/, /\bOBJETO\b/, /VALOR\s+(?:TOTAL\s+)?ESTIMADO/,
  /SESS[ÃA]O\s+P[ÚU]BLICA/, /CRIT[ÉE]RIO\s+DE\s+JULGAMENTO/, /MODO\s+DE\s+DISPUTA/,
  /TRATAMENTO\s+FAVORECIDO/, /MARGEM\s+DE\s+PREFER[ÊE]NCIA/, /PREG[ÃA]O\s+ELETR[ÔO]NICO/,
  /PROCESSO\s+N/
];
const MIN_CAMPOS = 3;
// A folha de abertura esta no comeco. Procurar no documento inteiro acharia a
// pagina de assinaturas, que tambem repete varios desses rotulos.
const PRIMEIRAS = 6;

// Marcas de CAPA, para o edital que nao usa o quadro de campos. Sao as coisas
// que qualquer folha de rosto de licitacao traz: o numero do pregao, o
// processo, o objeto, a data de abertura, o tipo de julgamento, a lei. Aqui
// nao se exige caixa alta — numa capa o texto e curto e o risco de casar com
// mencao solta e baixo.
const MARCAS_CAPA = [
  /PREG[ÃA]O\s+ELETR[ÔO]NICO/i, /AVISO\s+DE\s+LICITA[ÇC][ÃA]O/i, /EDITAL\s*N?[ºo°]/i,
  /PROCESSO\s*(?:ADMINISTRATIVO)?\s*N?[ºo°]/i, /\bOBJETO\b/i, /DO\s+OBJETO/i,
  /ABERTURA/i, /RECEBIMENTO\s+DAS\s+PROPOSTAS/i, /SESS[ÃA]O/i, /MENOR\s+PRE[ÇC]O/i,
  /REGISTRO\s+DE\s+PRE[ÇC]OS/i, /LEI\s*N?[ºo°]?\s*14\.?133/i, /PREFEITURA|MUNIC[ÍI]PIO\s+DE/i,
  /LICITA[ÇC][ÃA]O/i
];
// Marcas que sobrevivem ao texto embaralhado. Quando a fonte do PDF tem
// codificacao propria, o extrator troca as letras ACENTUADAS ("PREGÃO" vira
// "PREGïO"), e as regras acima param de casar; o pedaco sem acento continua
// legivel. Em Caceres/MT era o unico jeito de reconhecer a capa.
const MARCAS_SEM_ACENTO = [
  /EDITAL/i, /PROCESSO/i, /LICITA/i, /PREFEITURA/i, /MUNIC/i, /PREG/i,
  /MENOR PRE/i, /OBJETO/i, /ABERTURA/i, /PROPOSTA/i, /SESS/i, /CNPJ/i
];
const MIN_MARCAS = 3;
const PRIMEIRAS_CAPA = 3;
// Capa de edital digitalizado nao tem texto para pontuar. Abaixo disso a
// pagina e imagem, carimbo ou moldura — e a primeira folha e a capa do mesmo
// jeito.
//
// A conta e de LETRAS, nao de caracteres. A capa de Aparecida do Taboado/MS
// devolve 2.254 caracteres de lixo de controle (' \n \r\r \r \r \n !"#$%&'&#')
// porque a fonte do PDF tem codificacao propria: contando caracteres ela
// parecia cheia de texto e nao caia aqui, contando letras ela e o que e — uma
// pagina ilegivel, que so vale como imagem.
const POUCAS_LETRAS = 200;
const letrasDe = t => (String(t || '').match(/[A-Za-zÀ-ÿ]/g) || []).length;

// Tres niveis, do mais especifico ao mais generico. O usuario pediu em
// 08/09/2026 para procurar tambem "palavras semelhantes ou paginas
// semelhantes" nos editais em que o quadro nao aparecia — eram 44 de 68.
function achaAbertura(paginas) {
  // 1. o quadro de campos, que e a pagina que o usuario mandou de exemplo
  let melhor = -1, melhorN = 0;
  for (let i = 0; i < Math.min(paginas.length, PRIMEIRAS); i++) {
    const n = CAMPOS.filter(re => re.test(paginas[i] || '')).length;
    if (n > melhorN) { melhorN = n; melhor = i; }
  }
  if (melhorN >= MIN_CAMPOS) return { pagina: melhor, campos: melhorN, via: 'quadro' };

  // 2. a folha de rosto comum, pelas marcas de capa
  let capa = -1, capaN = 0;
  for (let i = 0; i < Math.min(paginas.length, PRIMEIRAS_CAPA); i++) {
    const n = MARCAS_CAPA.filter(re => re.test(paginas[i] || '')).length;
    if (n > capaN) { capaN = n; capa = i; }
  }
  if (capaN >= MIN_MARCAS) return { pagina: capa, campos: capaN, via: 'capa' };

  // 3. o mesmo, tolerando texto embaralhado
  let solta = -1, soltaN = 0;
  for (let i = 0; i < Math.min(paginas.length, PRIMEIRAS_CAPA); i++) {
    const n = MARCAS_SEM_ACENTO.filter(re => re.test(paginas[i] || '')).length;
    if (n > soltaN) { soltaN = n; solta = i; }
  }
  if (soltaN >= MIN_MARCAS) return { pagina: solta, campos: soltaN, via: 'embaralhado' };

  // 4. PDF digitalizado: nao ha o que pontuar, mas a primeira folha de um
  // edital escaneado e a capa do mesmo jeito.
  if (paginas.length && letrasDe(paginas[0]) < POUCAS_LETRAS) {
    return { pagina: 0, campos: 0, via: 'imagem' };
  }

  return null;
}

async function pool(itens, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < itens.length) { const k = i++; await fn(itens[k], k); }
  }));
}

const saida = { ...jaTem };
let com = 0, sem = 0, erros = 0, bytesTotal = 0;

await pool(alvos, 2, async (e) => {
  const nome = e[C.municipio] + '/' + e[C.uf];
  try {
    const cands = await arquivosPublicados(e);
    let paginas = null, le = null;
    for (const c of cands.slice(0, 3)) {
      const f = await fontesDe(c, []);
      if (!f.pdfs.length) continue;
      le = await LE.abre(f.pdfs[0].bytes);
      paginas = await textoDasPaginas(le);
      break;
    }
    if (!paginas) { sem++; console.log(`  ${nome} · sem PDF legivel`); return; }

    const achado = achaAbertura(paginas);
    if (!achado) { sem++; console.log(`  ${nome} · sem folha de abertura`); return; }

    // PDF de carona: a pagina original na frente, a branca do novo() atras.
    const carona = PDF.novo({ rodape: '' });
    carona.anexaExternas(await LE.extraiPaginas(le, [achado.pagina]), true);
    const bytes = carona.bytes();
    saida[e[C.path]] = { pagina: achado.pagina + 1, campos: achado.campos, via: achado.via,
                         b64: Buffer.from(bytes).toString('base64') };
    bytesTotal += bytes.length;
    com++;
    console.log(`  ${nome} · pagina ${achado.pagina + 1} · ${achado.via} · ${(bytes.length / 1024).toFixed(0)} KB`);
  } catch (err) {
    erros++;
    console.log(`  [erro] ${nome}: ${err.message}`);
  }
});

fs.writeFileSync(arquivoSaida, JSON.stringify({ varredura: dados.meta.varredura, editais: saida }), 'utf8');
console.log(`\n${com} com folha de abertura · ${sem} sem · ${erros} erro(s)`);
console.log(`paginas originais: ${(bytesTotal / 1024 / 1024).toFixed(2)} MB antes do base64`);
console.log(`docs/aberturas.json: ${(fs.statSync(arquivoSaida).size / 1024 / 1024).toFixed(2)} MB`);
