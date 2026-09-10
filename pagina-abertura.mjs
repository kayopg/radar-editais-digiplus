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
// Pagina que NUNCA e capa de edital, por mais marcas que tenha: a folha de
// assinatura digital e a de conferencia de autenticidade que varios sistemas
// grudam na frente do documento.
//
// O usuario abriu um resumo e recebeu a folha de outro edital. Nao era troca de
// chave: era a pagina errada DENTRO do arquivo certo — Chapadao do Sul/MS,
// Jaraguari/MS e Nova Esperanca/PR anexavam "assinado por 1 pessoa: ... para
// verificar a validade das assinaturas", e Campinas/SP a folha do sigad da
// Unicamp. Nenhuma delas diz de que licitacao se trata.
const NAO_E_CAPA = [
  /assinad[oa] (?:por|digitalmente|eletronicamente)/i,
  /verificar a (?:validade|autenticidade)/i,
  /verificar autenticidade/i,
  /documento assinado/i,
  /c[\u00f3o]digo verificador/i,
];

// O que a capa do edital certo tem e a de outro nao: as palavras do objeto e o
// nome do orgao. Serve de desempate entre paginas que pontuam igual.
const semAcento = s => String(s || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');
const VAZIAS_OBJ = new Set(['para','com','sem','dos','das','que','por','uma','nao','aquisicao',
  'material','permanente','municipio','prefeitura','pregao','eletronico','registro','precos',
  'futura','eventual','atender','demandas','secretaria','municipal','conforme','objeto','edital',
  'contratacao','fornecimento','equipamentos','diversos','bens','itens','estado']);
function palavrasDoEdital(e, C) {
  const cru = [e[C.objeto], e[C.municipio], e[C.unidade]].join(' ');
  return [...new Set(semAcento(cru).split(/[^a-z0-9]+/)
    .filter(w => w.length >= 5 && !VAZIAS_OBJ.has(w)))];
}

function palavrasDoObjeto(e, C) {
  return [...new Set(semAcento(String(e[C.objeto] || '')).split(/[^a-z0-9]+/)
    .filter(w => w.length >= 5 && !VAZIAS_OBJ.has(w)))];
}

function achaAbertura(paginas, alvo, alvoObjeto) {
  alvo = alvo || [];
  alvoObjeto = alvoObjeto || [];
  const relev = i => { const t = semAcento(paginas[i] || ''); return alvo.filter(w => t.includes(w)).length; };
  // Para o VETO conta so o objeto. O nome do municipio nao serve: ele aparece
  // na propria URL de conferencia da assinatura ("acesse
  // https://chapadaodosul.1doc..."), e era o que fazia a folha de assinatura de
  // Chapadao do Sul/MS e Jaraguari/MS escapar do veto.
  const falaDoObjeto = i => { const t = semAcento(paginas[i] || ''); return alvoObjeto.some(w => t.includes(w)); };
  // O carimbo de assinatura tambem aparece no RODAPE de capas legitimas, e
  // vetar por ele sozinho custou tres folhas boas (Itai/SP e as duas de Ponta
  // Grossa/PR). So e folha de assinatura a que traz o carimbo E nao diz nada
  // sobre este edital.
  // Carimbo que aparece em QUASE TODA pagina e tarja de rodape, nao folha de
  // assinatura.
  //
  // O sistema de assinatura carimba a lateral de cada folha do documento, e a
  // capa vem digitalizada: o unico texto extraivel da pagina e o carimbo. Vetar
  // por ele deixava o edital sem folha nenhuma — Valinhos/SP, Campinas/SP,
  // Jaraguari/MS e Chapadao do Sul/MS tinham as 35, 66, 85 e 86 paginas todas
  // carimbadas, e a pagina 1 era a capa que se queria.
  const olhadas = Math.min(paginas.length, 4);
  let carimbadas = 0;
  for (let i = 0; i < olhadas; i++) if (NAO_E_CAPA.some(re => re.test(paginas[i] || ''))) carimbadas++;
  const carimboEhRodape = olhadas >= 3 && carimbadas >= olhadas - 1;

  const proibida = i => !carimboEhRodape
    && NAO_E_CAPA.some(re => re.test(paginas[i] || '')) && !falaDoObjeto(i);
  // entre duas paginas com a mesma pontuacao, ganha a que fala DESTE edital
  const melhorQue = (n, i, bn, bi) => n > bn || (n === bn && bi >= 0 && relev(i) > relev(bi));

  // 1. o quadro de campos, que e a pagina que o usuario mandou de exemplo
  let melhor = -1, melhorN = 0;
  for (let i = 0; i < Math.min(paginas.length, PRIMEIRAS); i++) {
    if (proibida(i)) continue;
    const n = CAMPOS.filter(re => re.test(paginas[i] || '')).length;
    if (melhorQue(n, i, melhorN, melhor)) { melhorN = n; melhor = i; }
  }
  if (melhorN >= MIN_CAMPOS) return { pagina: melhor, campos: melhorN, via: 'quadro' };

  // 2. a folha de rosto comum, pelas marcas de capa
  let capa = -1, capaN = 0;
  for (let i = 0; i < Math.min(paginas.length, PRIMEIRAS_CAPA); i++) {
    if (proibida(i)) continue;
    const n = MARCAS_CAPA.filter(re => re.test(paginas[i] || '')).length;
    if (melhorQue(n, i, capaN, capa)) { capaN = n; capa = i; }
  }
  if (capaN >= MIN_MARCAS) return { pagina: capa, campos: capaN, via: 'capa' };

  // 3. o mesmo, tolerando texto embaralhado
  let solta = -1, soltaN = 0;
  for (let i = 0; i < Math.min(paginas.length, PRIMEIRAS_CAPA); i++) {
    if (proibida(i)) continue;
    const n = MARCAS_SEM_ACENTO.filter(re => re.test(paginas[i] || '')).length;
    if (melhorQue(n, i, soltaN, solta)) { soltaN = n; solta = i; }
  }
  if (soltaN >= MIN_MARCAS) return { pagina: solta, campos: soltaN, via: 'embaralhado' };

  // 4. nenhuma marca: fica a pagina que mais fala deste edital, se falar.
  let rel = -1, relN = 1;
  for (let i = 0; i < Math.min(paginas.length, PRIMEIRAS); i++) {
    if (proibida(i)) continue;
    const n = relev(i);
    if (n > relN) { relN = n; rel = i; }
  }
  if (rel >= 0) return { pagina: rel, campos: relN, via: 'objeto' };

  // 5. PDF digitalizado: nao ha o que pontuar, mas a primeira folha de um
  // edital escaneado e a capa do mesmo jeito.
  for (let i = 0; i < Math.min(paginas.length, 3); i++) {
    if (proibida(i)) continue;
    if (letrasDe(paginas[i]) < POUCAS_LETRAS) return { pagina: i, campos: 0, via: 'imagem' };
  }

  // Ultimo recurso: a primeira folha que nao seja a de assinatura. Vale mais a
  // capa sem marca reconhecida do que resumo nenhum — Valinhos/SP, Campinas/SP,
  // Jaraguari/MS e Nova Esperanca/PR ficavam sem folha por isso.
  for (let i = 0; i < Math.min(paginas.length, 4); i++) {
    if (!proibida(i)) return { pagina: i, campos: 0, via: 'primeira' };
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

    const achado = achaAbertura(paginas, palavrasDoEdital(e, C), palavrasDoObjeto(e, C));
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
