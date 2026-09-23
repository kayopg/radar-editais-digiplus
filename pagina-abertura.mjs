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
//   node pagina-abertura.mjs --faltantes    -> so quem ainda nao tem folha
//   node pagina-abertura.mjs --so a/b/c,d/e/f -> refaz esses editais
//   DEPURA=1 node pagina-abertura.mjs ...   -> mostra o topo das paginas de cada arquivo olhado
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { textoDasPaginas } from './paginas-uteis.mjs';
import { arquivosPublicados, fontesDe, PDF } from './resumo-pdf.mjs';
import { abreZip } from './arquivo-oficial.mjs';
import { pdfDeDocumento } from './pdf-do-documento.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LE = createRequire(import.meta.url)(path.join(DIR, 'docs', 'pdf-le.js'));

// Edital so em Word, ODT ou RTF: quem converte para PDF e o pdf-do-documento.mjs
// (LibreOffice ou Word). Sem conversor na maquina, o edital segue sem capa.
// Os bytes do documento Word que o fontesDe leu como texto: o proprio arquivo
// publicado, ou o .doc/.docx de dentro do zip (Nova Prata do Iguacu/PR).
async function wordDe(c, nomeDentro) {
  const r = await fetch(c.url);
  if (!r.ok) return null;
  const b = new Uint8Array(await r.arrayBuffer());
  const hex = Buffer.from(b.slice(0, 4)).toString('hex');
  if (hex === 'd0cf11e0') return { bytes: b, ext: 'doc' };
  if (hex !== '504b0304') return null;
  const dentro = abreZip(b);
  if (dentro.some(x => x.nome === 'word/document.xml')) return { bytes: b, ext: 'docx' };
  if (dentro.some(x => x.nome === 'content.xml') && dentro.some(x => x.nome === 'mimetype')) return { bytes: b, ext: 'odt' };
  // e o documento de dentro do zip: .doc, .docx, .odt ou .rtf — Caxias do
  // Sul/RS publica o edital so em .odt dentro do zip (23/09/2026).
  // O nome vem sem a pasta ("Edital.odt"), e dentro do zip ele esta em
  // "PE_221-26_/Edital.odt": compara so o fim do caminho.
  const alvo = String(nomeDentro || '').split('/').pop().toLowerCase();
  const docs = dentro.filter(x => /\.(?:docx?|odt|rtf)$/i.test(x.nome));
  const w = docs.find(x => x.nome.split('/').pop().toLowerCase() === alvo) || docs[0];
  if (!w) return null;
  return { bytes: w.abre(), ext: (w.nome.toLowerCase().match(/\.(docx?|odt|rtf)$/) || [, 'docx'])[1] };
}

const arg = (n, p) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p; };
const LIMITE = Number(arg('--limite', 0));
// --faltantes so mexe em quem ainda nao tem folha, e junta ao arquivo existente
// em vez de refaze-lo. Serve para a repescagem de quem caiu por falha de rede:
// em 09/09/2026 Coxim/MS e Foz do Iguacu/PR deram HTTP 504 do PNCP, e refazer
// os 62 que ja estavam prontos custaria 40 minutos por causa de dois.
const FALTANTES = process.argv.includes('--faltantes');
// --so caminho1,caminho2 refaz so esses editais, juntando ao arquivo existente.
const SO = arg('--so', '').split(',').filter(Boolean);

const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));
const C = dados.colunas.reduce((o, n, i) => (o[n] = i, o), {});
const arquivoSaida = path.join(DIR, 'docs', 'aberturas.json');

let jaTem = {};
if (FALTANTES || SO.length) {
  try { jaTem = JSON.parse(fs.readFileSync(arquivoSaida, 'utf8')).editais || {}; }
  catch { console.error('aviso: nao achei aberturas.json — vai processar todos'); }
}

let alvos = dados.editais;
if (FALTANTES) alvos = alvos.filter(e => !jaTem[e[C.path]]);
if (SO.length) alvos = alvos.filter(e => SO.includes(e[C.path]));
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

// Folha de TERMO DE REFERENCIA ou de anexo nunca e capa, por mais que fale do
// objeto.
//
// Em 15/09/2026 o usuario abriu o resumo do pregao 19/2026 da UNESPAR e a
// "capa" era a pagina 20 de 61 — o Termo de Referencia com a tabela de
// produtos, que o resumo ja traz logo depois: os produtos saiam duas vezes. O
// PNCP publicava o TR como arquivo proprio, e o edital de verdade, chamado
// "Anexo_1_Minuta...", perdia a vez pelo "minuta" no nome. O mesmo com
// Londrina/PR (a folha era o "Anexo 01" da lista de itens) e com dois pregoes
// da UFSM (a folha era o modelo de TR da AGU).
//
// O teste olha so o TOPO da pagina, onde fica o titulo: no corpo de uma capa
// legitima e comum "conforme Anexo I – Termo de Referencia" (Birigui/SP). E
// titulo de anexo so conta se o topo nao se anuncia como edital ou pregao.
const topoDe = t => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 400);
const TITULO_ANEXO = /\bANEXO\s*(?:[IVXL]+|N?[º°o]?\s*0?\d{1,2})\b|TERMO\s+DE\s+REFER[ÊE]NCIA|ESTUDO\s+T[ÉE]CNICO\s+PRELIMINAR/i;
const TOPO_DE_CAPA = /EDITAL|PREG[ÃA]O|DISPENSA|AVISO\s+DE|CONCORR[ÊE]NCIA|CONTRATA[ÇC][ÃA]O\s+DIRETA/i;
// Titulos que nenhuma capa tem, nem com "pregao" do lado: a "RELACAO DE ITENS
// - PREGAO ELETRONICO" que o Compras.gov gera (Belo Horizonte/MG), o mapa de
// riscos (Caxias do Sul/RS), o sumario do edital (Chapadao do Sul/MS).
const TITULO_NUNCA_CAPA = /Modelo\s+de\s+Termo\s+de\s+Refer|RELA[ÇC][ÃA]O\s+DE\s+ITENS|MAPA\s+DE\s+(?:GERENCIAMENTO\s+DE\s+)?RISCOS?|MATRIZ\s+DE\s+RISCOS?|ESTUDO\s+T[ÉE]CNICO\s+PRELIMINAR|SUBANEXO|PESQUISA\s+DE\s+PRE[ÇC]OS|MAPA\s+COMPARATIVO|FORMALIZA[ÇC][ÃA]O\s+D[AE]\s+DEMANDA/i;
function ehAnexo(t) {
  const topo = topoDe(t);
  if (TITULO_NUNCA_CAPA.test(topo.slice(0, 200))) return true;
  if (/SUM[ÁA]RIO|[ÍI]NDICE/i.test(topo.slice(0, 250)) && /\.{8,}/.test(String(t || ''))) return true;
  return TITULO_ANEXO.test(topo) && !TOPO_DE_CAPA.test(topo);
}
// Arquivo que comeca na "Pagina 20 de 61" e pedaco de um documento maior: a
// capa, se existe, esta em outro arquivo.
function ehPedaco(paginas) {
  const m = String(paginas[0] || '').match(/P[áa]gina:?\s*(\d+)\s*(?:de|\/)\s*\d+/i);
  return !!m && Number(m[1]) >= 2;
}

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

// Texto com as letras espacadas: a capa de Cascavel/PR extrai como
// "P R E GÃO E L E T RÔN I C O Nº 1 2 6 / 2 0 2 6 ... C O N T R A T A N T E",
// e nenhuma marca casava. Quando mais da metade das palavras tem uma letra so,
// a pagina e testada tambem sem espaco nenhum, com o espaco das marcas opcional.
const ehEspacado = t => {
  const w = String(t || '').split(/\s+/).filter(Boolean);
  return w.length >= 40 && w.filter(x => x.length === 1).length > w.length / 2;
};
const semEspaco = new Map();
function casa(re, t) {
  t = String(t || '');
  if (re.test(t)) return true;
  if (!ehEspacado(t)) return false;
  if (!semEspaco.has(re)) semEspaco.set(re, new RegExp(re.source.split('\\s+').join('\\s*').split('\\s*').join('').split('\\b').join(''), re.flags));
  return semEspaco.get(re).test(t.replace(/\s+/g, ''));
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

  // A folha que continua um anexo sem titulo proprio tambem e anexo: em
  // Franca/SP a pagina 3 era o resto do Termo de Referencia da pagina 2.
  const continuaAnexo = i => i > 0 && (ehAnexo(paginas[i - 1]) || continuaAnexo(i - 1))
    && !TOPO_DE_CAPA.test(topoDe(paginas[i]).slice(0, 200));
  const proibida = i => ehAnexo(paginas[i]) || continuaAnexo(i) || (!carimboEhRodape
    && NAO_E_CAPA.some(re => re.test(paginas[i] || '')) && !falaDoObjeto(i));
  // entre duas paginas com a mesma pontuacao, ganha a que fala DESTE edital
  const melhorQue = (n, i, bn, bi) => n > bn || (n === bn && bi >= 0 && relev(i) > relev(bi));

  // 1. o quadro de campos, que e a pagina que o usuario mandou de exemplo
  let melhor = -1, melhorN = 0;
  for (let i = 0; i < Math.min(paginas.length, PRIMEIRAS); i++) {
    if (proibida(i)) continue;
    const n = CAMPOS.filter(re => casa(re, paginas[i])).length;
    if (melhorQue(n, i, melhorN, melhor)) { melhorN = n; melhor = i; }
  }
  if (melhorN >= MIN_CAMPOS) return { pagina: melhor, campos: melhorN, via: 'quadro' };

  // 2. a folha de rosto comum, pelas marcas de capa
  let capa = -1, capaN = 0;
  for (let i = 0; i < Math.min(paginas.length, PRIMEIRAS_CAPA); i++) {
    if (proibida(i)) continue;
    const n = MARCAS_CAPA.filter(re => casa(re, paginas[i])).length;
    if (melhorQue(n, i, capaN, capa)) { capaN = n; capa = i; }
  }
  // Entre as folhas quase tao marcadas quanto a melhor, fica a PRIMEIRA. As
  // marcas de capa sao palavras comuns, e o preambulo da pagina 2 junta mais
  // delas que a capa: em Guimarania/MG a pagina 1 tinha processo, pregao,
  // objeto e as datas de abertura, e perdia para o "torna publico" da seguinte.
  if (capaN >= MIN_MARCAS) {
    for (let i = 0; i < capa; i++) {
      if (proibida(i)) continue;
      const n = MARCAS_CAPA.filter(re => casa(re, paginas[i])).length;
      if (n >= MIN_MARCAS && n >= capaN - 2) return { pagina: i, campos: n, via: 'capa' };
    }
    return { pagina: capa, campos: capaN, via: 'capa' };
  }

  // 3. o mesmo, tolerando texto embaralhado
  let solta = -1, soltaN = 0;
  for (let i = 0; i < Math.min(paginas.length, PRIMEIRAS_CAPA); i++) {
    if (proibida(i)) continue;
    const n = MARCAS_SEM_ACENTO.filter(re => re.test(paginas[i] || '')).length;
    if (melhorQue(n, i, soltaN, solta)) { soltaN = n; solta = i; }
  }
  if (soltaN >= MIN_MARCAS) return { pagina: solta, campos: soltaN, via: 'embaralhado' };

  // Daqui para baixo a escolha e fraca. Arquivo que ABRE com anexo, DFD ou
  // Termo de Referencia nao e edital, e a folha fraca dele seria so mais um
  // pedaco do TR: em Franca/SP saia o "modelo de gestao do contrato".
  if (ehAnexo(paginas[0])) return null;

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

// De onde tirar a capa. 3: o arquivo que o PNCP chama de edital. 2: nome com
// "edital". 1: o resto. 0: TR, estudo tecnico, planilha, anexo — nunca, porque
// a folha deles repete no resumo o que a tabela de itens ja mostra.
function prioridadeCapa(nome, tipo) {
  const n = semAcento(nome).replace(/[_\s]+/g, ' '), t = semAcento(tipo);
  if (/^edital|aviso de contratacao/.test(t)) return 3;
  if (/termo de referencia|estudo tecnico/.test(t)) return 0;
  // "Edital e anexos.pdf" e o edital; "Anexo I - minuta do edital" nao.
  if (/edital/.test(n) && !/^\W*anexo|minuta d[eo] (?:contrato|ata)/.test(n)) return 2;
  if (/termo de referencia|(^|[^a-z])tr[\s_.-]|estudo tecnico|(^|[^a-z])etp[\s_.-]|planilha|anexo|historico|quantitativ|estimativa|cotac|orcamento|relacao ?(?:de ?)?itens|mapa de riscos?|matriz de riscos?|(^|[^a-z])dfd[\s_.-]|parecer|portaria|decreto|autorizac|solicitac|memorando|publicac|minuta|contrato|ata de registro|pesquisa de preco/.test(n)) return 0;
  return 1;
}
const FORCA = { quadro: 6, capa: 5, embaralhado: 4, imagem: 3, objeto: 2, primeira: 1 };

async function pool(itens, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < itens.length) { const k = i++; await fn(itens[k], k); }
  }));
}

// A tabela de categorias do varredura.mjs, lida do arquivo como no
// veta-pelo-descritivo.mjs: o arquivo cita o produto se trouxer um termo da
// categoria do item ou duas das tres primeiras palavras da descricao do PNCP.
const fonteVarredura = fs.readFileSync(path.join(DIR, 'varredura.mjs'), 'utf8');
const inicioCat = fonteVarredura.indexOf('const CAT = [');
const CAT = eval(fonteVarredura.slice(inicioCat, fonteVarredura.indexOf('\n];', inicioCat) + 3).replace('const CAT = ', ''));
const normTxt = s => semAcento(String(s || '')).toLowerCase().replace(/\s+/g, ' ');
function citaProdutoDoRadar(texto, e) {
  const t = normTxt(texto);
  return e[C.itens].some(it => {
    const termos = (CAT.find(c => c[0] === it[0]) || [, []])[1];
    if (termos.some(x => t.includes(x))) return true;
    const pal = normTxt(it[3]).split(/[^a-z0-9]+/).filter(w => w.length >= 5).slice(0, 3);
    return pal.filter(w => t.includes(w)).length >= 2;
  });
}

// O arquivo se apresenta como ESTE edital? O numero do pregao na primeira
// folha: "PREGAO ELETRONICO 90.603/2026", "Pregao SRP 40-2026". Sem isso, o
// edital cuja lista de itens mora em anexo — a planilha de Juiz de Fora/MG, a
// "Descricao detalhada dos itens" da EBSERH em Santa Maria/RS — nao cita
// produto nenhum no corpo e perdia a capa (23/09/2026).
function seApresentaComoEste(texto, e) {
  const m = String(e[C.edital] || '').match(/(\d{1,6})\s*(?:-\s*\d\s*)?[\/-]\s*(\d{4})(?!\d)/);
  if (!m) return false;
  const re = new RegExp('(?:^|\\D)0*' + m[1] + '\\s*[\\/.-]\\s*' + m[2] + '(?!\\d)');
  return re.test(normTxt(texto));
}

const saida = { ...jaTem };
let com = 0, sem = 0, erros = 0, bytesTotal = 0;

await pool(alvos, 2, async (e) => {
  const nome = e[C.municipio] + '/' + e[C.uf];
  try {
    // O edital primeiro: a ordem do arquivosPublicados serve ao recorte dos
    // itens, que quer o Termo de Referencia na frente.
    const cands = [...await arquivosPublicados(e)]
      .sort((a, b) => prioridadeCapa(b.titulo, b.tipo) - prioridadeCapa(a.titulo, a.tipo));
    let melhor = null, abertos = 0;
    procura: for (const c of cands.slice(0, 4)) {
      if (prioridadeCapa(c.titulo, c.tipo) === 0) continue;
      const f = await fontesDe(c, [], 12);
      // Converte o documento de texto quando nao ha PDF nenhum OU quando os
      // PDFs do pacote nao trazem o edital: o zip de Caxias do Sul/RS so tem o
      // ETP em PDF, e o edital esta em .odt ao lado (23/09/2026).
      const semEdital = !f.pdfs.some(p => prioridadeCapa(p.nome, '') > 0);
      // Num zip com PDF o fontesDe devolve os documentos de texto em "textos",
      // e nao em "texto": vale o de nome mais parecido com edital.
      const docTexto = f.texto || [...(f.textos || [])]
        .sort((a, b) => prioridadeCapa(b.nome, '') - prioridadeCapa(a.nome, ''))[0];
      if (semEdital && docTexto && /^(?:DOCX?|ODT|RTF)$/i.test(docTexto.formato)) {
        const w = await wordDe(c, docTexto.nome);
        const pdf = w && pdfDeDocumento(w.bytes, w.ext);
        if (pdf) f.pdfs = [{ nome: String(docTexto.nome || c.titulo || 'edital') + ' (paginado fora do navegador)', bytes: pdf }, ...f.pdfs];
      }
      const pdfs = [...f.pdfs].sort((a, b) => prioridadeCapa(b.nome, '') - prioridadeCapa(a.nome, ''));
      for (const p of pdfs) {
        if (f.pdfs.length > 1 && prioridadeCapa(p.nome, '') === 0) continue;
        // Nem sozinho vira capa o que nunca e edital: o zip de Corrego Danta/MG
        // no PNCP so traz o "Decreto nº 978-2024 - Decreto de REGIONALIZACAO",
        // e a primeira folha do decreto saia como capa do resumo (16/09/2026).
        if (/(?:^|[^a-z])(?:decreto|portaria|mapa de riscos?|matriz de riscos?|parecer)(?:[^a-z]|$)/.test(semAcento(p.nome || '').toLowerCase())) continue;
        if (abertos++ >= 5) break procura;
        const le = await LE.abre(p.bytes);
        const paginas = await textoDasPaginas(le);
        // O arquivo que nao cita nenhum produto do radar e de OUTRA licitacao: a
        // prefeitura de Marcelandia/MT publicou no pregao 31/2026 (eletrodomesticos)
        // o edital do 029/2026 (materiais pedagogicos), e a capa saia dele
        // (22/09/2026). Sem capa e melhor que com a do edital errado.
        if (paginas.join(' ').length > 8000 && !citaProdutoDoRadar(paginas.join(' '), e)
            && !seApresentaComoEste(paginas.slice(0, 3).join(' '), e)) {
          console.log(`    ${nome} · ${p.nome || c.titulo}: nenhum produto do radar no arquivo, e de outra licitacao`);
          continue;
        }
        const achado = achaAbertura(paginas, palavrasDoEdital(e, C), palavrasDoObjeto(e, C));
        if (process.env.DEPURA) console.log(`    ${nome} · ${p.nome || c.titulo} · ${paginas.length} p · ${achado ? 'p' + (achado.pagina + 1) + ' ' + achado.via : 'nada'}`
          + paginas.slice(0, 3).map((t, i) => `\n      p${i + 1}${ehAnexo(t) ? ' [anexo]' : ''}: ${topoDe(t).slice(0, 200)}`).join(''));
        if (!achado) continue;
        const nota = FORCA[achado.via] - (ehPedaco(paginas) ? 3 : 0);
        if (!melhor || nota > melhor.nota) melhor = { achado, le, nota, arquivo: p.nome || c.titulo };
        // na ordem de prioridade, a primeira folha boa encerra a busca
        if (nota >= FORCA.imagem) break procura;
      }
    }
    // (e com --so, a capa antiga sai: refazer e para corrigir, nao para manter)
    if (!abertos) { sem++; delete saida[e[C.path]]; console.log(`  ${nome} · sem PDF legivel`); return; }
    if (!melhor) { sem++; delete saida[e[C.path]]; console.log(`  ${nome} · sem folha de abertura`); return; }
    const { achado, le } = melhor;

    // PDF de carona: a pagina original na frente, a branca do novo() atras.
    const carona = PDF.novo({ rodape: '' });
    carona.anexaExternas(await LE.extraiPaginas(le, [achado.pagina]), true);
    const bytes = carona.bytes();
    saida[e[C.path]] = { pagina: achado.pagina + 1, campos: achado.campos, via: achado.via, arquivo: melhor.arquivo,
                         b64: Buffer.from(bytes).toString('base64') };
    bytesTotal += bytes.length;
    com++;
    console.log(`  ${nome} · pagina ${achado.pagina + 1} · ${achado.via} · ${melhor.arquivo} · ${(bytes.length / 1024).toFixed(0)} KB`);
  } catch (err) {
    erros++;
    console.log(`  [erro] ${nome}: ${err.message}`);
  }
});

fs.writeFileSync(arquivoSaida, JSON.stringify({ varredura: dados.meta.varredura, editais: saida }), 'utf8');
console.log(`\n${com} com folha de abertura · ${sem} sem · ${erros} erro(s)`);
console.log(`paginas originais: ${(bytesTotal / 1024 / 1024).toFixed(2)} MB antes do base64`);
console.log(`docs/aberturas.json: ${(fs.statSync(arquivoSaida).size / 1024 / 1024).toFixed(2)} MB`);
