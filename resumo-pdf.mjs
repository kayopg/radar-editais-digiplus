// Montador do resumo por edital, em Node. Existe para nao haver tres copias do
// mesmo layout: o testa-pdf.mjs e o resumos.mjs importam daqui.
//
// O docs/index.html continua com a sua propria copia, e nao da para evitar: a
// pagina e servida sem build e sem modulos, entao nao ha como ela importar isto.
// Mudou o layout la, mude aqui — sao dois lugares, nao tres.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { textoDasPaginas, escolhePaginas, textoUtil, coberturaItens } from './paginas-uteis.mjs';
import { abreZip, pdfsDoZip, blocosDocx, blocosDoc, extDe } from './arquivo-oficial.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);
export const PDF = req(path.join(DIR, 'docs', 'pdf.js'));
const LE = req(path.join(DIR, 'docs', 'pdf-le.js'));

// Tem de bater com o var CAT do docs/index.html. CX (coifa/exaustao) saiu em
// 01/09/2026 junto com televisor, ferro de passar e lavadora de alta pressao:
// nao sao linha de produto da Digiplus.
export const CAT = { RF: 'Refrigeração', CL: 'Climatização', CC: 'Cocção', PR: 'Preparo',
  EP: 'Eletroportáteis', LV: 'Lavanderia', BB: 'Bebedouro', CX: 'Coifa/Exaustão',
  BL: 'Balanças', LD: 'Lousa digital', GE: 'Geradores', AQ: 'Aquecimento', OT: 'Outros' };

export const moeda = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dataBR = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
const dataHoraBR = iso => {
  const hm = iso.slice(11, 16);
  return dataBR(iso) + (hm && hm !== '00:00' ? ' às ' + hm : '');
};
export const umaLinha = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
export const numeroEdital = t => String(t || '').replace(/^.*n[º°]\s*/i, '').replace(/^\(\d+\)\s*\|\s*/, '').trim() || String(t || '');
export const nomeArquivo = s => s.replace(/\//g, '-').replace(/[^0-9A-Za-zÀ-ÿ .-]/g, ' ').replace(/ {2,}/g, ' ').trim();

const dias = iso => Math.floor((new Date(iso) - new Date()) / 864e5);
function quandoTxt(iso) {
  const d = dias(iso), hm = iso.slice(11, 16);
  return dataBR(iso) + (hm && hm !== '00:00' ? ' às ' + hm : '')
       + ' (' + (d <= 0 ? 'hoje' : d === 1 ? 'amanhã' : 'em ' + d + ' dias') + ')';
}
const rotuloItem = (it, k) => it[5] ? 'ITEM ' + it[5] + ' do edital' : 'ITEM ' + (k + 1);
const qtdItem = it => {
  const q = it[1].toLocaleString('pt-BR');
  return it[4] ? q + ' ' + it[4] : q + (it[1] === 1 ? ' unidade' : ' unidades');
};

// it[6]: E = exclusiva ME/EPP, C = cota reservada, S = sem beneficio. Quem nao e
// ME/EPP nem pode disputar o item exclusivo, e sao 41% deles — por isso o aviso
// vem em negrito junto do titulo, e nao escondido num campo la embaixo.
export const BENEFICIO = { E: 'Exclusivo ME/EPP', C: 'Cota reservada ME/EPP', S: 'Sem benefício' };
const beneficioItem = it => BENEFICIO[it[6]] || '';

// Resumo do beneficio no edital inteiro, para quem le so o cabecalho.
export function resumoBeneficio(r) {
  const n = { E: 0, C: 0, S: 0 };
  for (const it of r[8]) if (n[it[6]] !== undefined) n[it[6]]++;
  const t = r[8].length;
  if (n.E === t) return 'todos os itens exclusivos para ME/EPP';
  if (n.E) return n.E + ' de ' + t + ' itens exclusivos para ME/EPP';
  if (n.C) return n.C + ' de ' + t + ' com cota reservada para ME/EPP';
  return n.S ? 'sem benefício ME/EPP' : '';
}

export const urlArquivo = r => {
  if (!r[13]) return null;
  const pp = r[7].split('/');
  return `https://pncp.gov.br/api/pncp/v1/orgaos/${pp[0]}/compras/${pp[1]}/${pp[2]}/arquivos/${r[13]}`;
};

// No Node nao ha CORS: o mesmo endpoint que a pagina usa, sem o bloqueio.
export async function buscaTodosItens(r) {
  const pp = r[7].split('/');
  try {
    const resp = await fetch(`https://pncp.gov.br/api/pncp/v1/orgaos/${pp[0]}/compras/${pp[1]}/${pp[2]}/itens?pagina=1&tamanhoPagina=500`);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const j = await resp.json();
    return Array.isArray(j) ? j : [];
  } catch { return null; }
}

function jaDetalhados(r) {
  const num = {}, desc = {};
  r[8].forEach(it => { if (it[5]) num[it[5]] = 1; desc[umaLinha(it[3])] = 1; });
  return x => !!(num[x.numeroItem] || desc[umaLinha(x.descricao)]);
}

function secao(doc, titulo) {
  doc.espaco(12);
  doc.texto(titulo, { tam: 11, negrito: true });
  doc.regua(0.8, [0.55, 0.55, 0.55]);
  doc.espaco(3);
}

// Copia paginas do edital oficial para dentro do resumo. E dali que sai o
// descritivo completo dos produtos: a API do PNCP so devolve o rotulo curto do
// item — conferimos que os 1082 descritivos do dados.json sao identicos ao que
// ela entrega, e 27% deles tem menos de 40 caracteres.
//
// opts.modo:
//   'uteis'   (padrao) so a pagina do objeto e a tabela de especificacao do
//             Termo de Referencia, escolhidas pelo paginas-uteis.mjs. Num edital
//             de 56 paginas isso deu 8 — o resto e habilitacao, minuta de
//             contrato e sancoes, texto igual em todo edital do pais.
//   'inteiro' o documento como veio.
//   <numero>  as N primeiras paginas.
// Quantos arquivos publicados vale tentar antes de desistir. Passar disso e
// baixar anexo de minuta de contrato atras de descritivo que nao esta la.
const LIMITE_TENTATIVAS = 4;

// A extensao do titulo mente: no lote de 04/09/2026 apareceu titulo sem
// extensao nenhuma e .docx que era outro formato. Os primeiros bytes nao mentem.
function farejaTipo(bytes) {
  const b = Buffer.from(bytes.slice(0, 4)).toString('hex');
  if (b.startsWith('25504446')) return 'pdf';   // %PDF
  if (b.startsWith('504b0304')) return 'zip';   // PK\3\4 — docx e xlsx tambem
  if (b.startsWith('d0cf11e0')) return 'ole';   // doc/xls do Word 97-2003
  return 'desconhecido';
}

// PDF primeiro, sempre — pedido do usuario em 04/09/2026. Antes disso, um
// arquivo INTITULADO "Edital" ganhava do PDF publicado ao lado, e Ribeirao
// Preto/SP ficou sem anexo com o Termo de Referencia em PDF no arquivo
// seguinte. Depois do PDF vem o ZIP (que costuma trazer o PDF dentro), e por
// fim os formatos do Word, de onde so da para tirar texto.
const PESO_FORMATO = { pdf: 300, zip: 200, docx: 100, doc: 90, rtf: 80 };

export async function arquivosPublicados(r) {
  const pp = r[7].split('/');
  const base = `https://pncp.gov.br/api/pncp/v1/orgaos/${pp[0]}/compras/${pp[1]}/${pp[2]}/arquivos`;
  // A listagem tambem cai: em Palmeiras de Goias/GO ela devolveu uma pagina de
  // erro em HTML no lugar do JSON, e sem ela o edital fica sem anexo nenhum.
  let lista = null, ultimo;
  for (let t = 0; t < 3; t++) {
    try {
      const resp = await fetch(base);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      lista = await resp.json();
      break;
    } catch (e) {
      ultimo = e;
      if (t < 2) await new Promise(x => setTimeout(x, 2000 * (t + 1)));
    }
  }
  if (!lista) throw ultimo;
  return (Array.isArray(lista) ? lista : []).map(a => {
    const ext = extDe(a.titulo);
    const tipo = normSimples(a.tipoDocumentoNome);
    const nome = normSimples(a.titulo);
    let peso = PESO_FORMATO[ext] || 10;
    if (/edital|aviso de contratacao/.test(tipo)) peso += 30;
    if (/termo de referencia/.test(tipo)) peso += 25;
    if (/minuta|contrato|ata de registro|decreto|portaria|errata|aviso de licitacao/.test(nome)) peso -= 40;
    return { url: base + '/' + a.sequencialDocumento, titulo: a.titulo, tipo: a.tipoDocumentoNome, ext, peso };
  }).sort((a, b) => b.peso - a.peso);
}

const normSimples = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// O PNCP devolve 502 e derruba conexao de vez em quando: no lote de 03/09/2026
// tres editais ficaram sem anexo so por isso. Tres tentativas com espera
// crescente resolvem sem custo quando esta tudo bem.
async function baixa(url) {
  let ultimo;
  for (let t = 0; t < 3; t++) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return new Uint8Array(await resp.arrayBuffer());
    } catch (e) {
      ultimo = e;
      if (t < 2) await new Promise(x => setTimeout(x, 2000 * (t + 1)));
    }
  }
  throw ultimo;
}

export async function anexaOficial(doc, r, opts = {}) {
  const modo = opts.modo === undefined ? 'uteis' : opts.modo;

  // A listagem manda mais que a coluna da varredura: ela mostra TODOS os
  // arquivos, e e ali que aparece o PDF publicado ao lado do zip.
  let cands = [];
  try { cands = await arquivosPublicados(r); } catch { /* cai no que a varredura anotou */ }
  if (!cands.length && urlArquivo(r)) {
    cands = [{ url: urlArquivo(r), titulo: '', ext: String(r[14] || '').toLowerCase(), peso: 0 }];
  }
  if (!cands.length) return { ok: false, motivo: 'o orgao nao publicou arquivo' };

  const tropecos = [];
  const reservas = [];                    // texto de DOC/DOCX, se nao houver PDF

  for (const c of cands.slice(0, LIMITE_TENTATIVAS)) {
    try {
      const fontes = await fontesDe(c, tropecos);
      if (fontes.texto) reservas.push({ ...fontes.texto, ordem: ORDEM[classe(c.titulo, c.tipo)] });
      if (!fontes.pdfs.length) continue;

      // A capa TEM de ser a do edital — exigencia do usuario em 03/09/2026,
      // repetida em maiusculas. Quando o melhor PDF e um Termo de Referencia
      // publicado solto, ele entra com o descritivo mas sem orgao, horario e
      // local; nesse caso o edital vem junto, na frente, so pela capa.
      let lista = fontes.pdfs;
      if (classe(lista[0].nome, lista[0].tipo) !== 'edital') {
        const capa = cands.find(x => x !== c && classe(x.titulo, x.tipo) === 'edital');
        if (capa) {
          try {
            const extra = await fontesDe(capa, tropecos);
            if (extra.pdfs.length) lista = [extra.pdfs[0], ...lista];
          } catch { /* sem a capa do edital e melhor que sem anexo nenhum */ }
        }
      }
      return await anexaPaginas(doc, r, lista.slice(0, 3), modo, opts.itens || []);
    } catch (e) {
      tropecos.push(e.message);
    }
  }

  // Sem PDF nenhum, vale juntar o edital e o termo de referencia em Word: em
  // Marechal Candido Rondon/PR a capa esta no .doc e a tabela de itens no .docx
  // do TR, e um sem o outro deixa faltando metade do que o usuario pediu.
  if (reservas.length) {
    const usar = reservas.sort((a, b) => a.ordem - b.ordem).slice(0, 2);
    return anexaTexto(doc, r,
      usar.flatMap(x => x.blocos),
      [...new Set(usar.map(x => x.formato))].join(' + '),
      usar.map(x => x.nome).filter(Boolean).join(' + '),
      modo, opts.itens || []);
  }
  return { ok: false, motivo: tropecos[0] || 'nao foi possivel ler o arquivo oficial' };
}

// Edital primeiro, termo de referencia depois, o resto por ultimo: e a ordem em
// que as paginas precisam aparecer para a capa sair certa.
function classe(nome, tipo) {
  const s = normSimples(nome) + ' ' + normSimples(tipo);
  if (/edital|aviso de contratacao/.test(s)) return 'edital';
  if (/termo de referencia|(^|[^a-z])tr[\s_.-]|especifica|descritiv|memorial/.test(s)) return 'tr';
  return 'outro';
}
const ORDEM = { edital: 0, tr: 1, outro: 2 };

// Transforma um arquivo publicado no que der para usar: PDFs para anexar as
// paginas, ou texto quando o orgao so publicou Word.
async function fontesDe(c, tropecos) {
  const bytes = await baixa(c.url);
  const tipo = farejaTipo(bytes);

  if (tipo === 'pdf') return { pdfs: [{ nome: c.titulo || null, tipo: c.tipo, bytes, zip: false }], texto: null };

  if (tipo === 'zip') {
    const dentro = abreZip(bytes);
    // Um .docx tambem comeca com PK: a assinatura nao separa os dois, o
    // conteudo separa.
    if (dentro.some(e => e.nome === 'word/document.xml')) {
      return { pdfs: [], texto: { blocos: blocosDocx(bytes), formato: 'DOCX', nome: c.titulo } };
    }
    const pdfs = pdfsDoZip(bytes).slice(0, 3)
      .map(p => ({ nome: p.nome.split('/').pop(), tipo: p.nome, bytes: p.abre(), zip: true }))
      .sort((a, b) => ORDEM[classe(a.nome, a.tipo)] - ORDEM[classe(b.nome, b.tipo)]);
    if (pdfs.length) return { pdfs, texto: null };

    const dx = dentro.find(e => extDe(e.nome) === 'docx');
    if (dx) return { pdfs: [], texto: { blocos: blocosDocx(dx.abre()), formato: 'DOCX', nome: dx.nome } };
    tropecos.push('o zip publicado nao trazia PDF nem DOCX');
    return { pdfs: [], texto: null };
  }

  if (tipo === 'ole') return { pdfs: [], texto: { blocos: blocosDoc(bytes), formato: 'DOC', nome: c.titulo } };
  tropecos.push('formato nao reconhecido (' + (c.ext || 'sem extensao') + ')');
  return { pdfs: [], texto: null };
}

// Um DOC/DOCX nao tem paginas para anexar — quem pagina e o Word, na hora de
// imprimir — entao o texto e escrito nas paginas do proprio resumo.
//
// Um edital em Word costuma ser enorme: o .doc de Diamante D'Oeste/PR rendeu
// 764 mil caracteres, umas 130 paginas, quase tudo habilitacao e minuta de
// contrato. Para nao despejar isso, o texto e fatiado em pedacos do tamanho de
// uma pagina e passa pelo MESMO seletor dos PDFs, com o mesmo portao de 60% de
// cobertura dos itens. Nao cobrindo, vai inteiro — perder descritivo em
// silencio continua sendo o pior desfecho possivel.
const CHARS_POR_PAGINA = 3500;
const TEXTO_CURTO = 20000;   // abaixo disso nao compensa fatiar

const textoDoBloco = b => b.t === 'tab' ? b.linhas.map(l => l.join(' ')).join('\n') : b.txt;

// Um edital em Word costuma vir com o Termo de Referencia colado duas vezes —
// no corpo e no anexo. Sem tirar, o anexo sai com a mesma tabela repetida.
// So blocos longos entram na conta: linha curta ("R$", "UNIDADE") se repete de
// verdade, e cortar a segunda quebraria a tabela.
function semRepetidos(blocos) {
  const vistos = new Set();
  return blocos.filter(b => {
    const t = textoDoBloco(b).replace(/\s+/g, ' ').trim();
    if (t.length < 200) return true;
    if (vistos.has(t)) return false;
    vistos.add(t);
    return true;
  });
}

// Agrupa blocos ate dar o tamanho de uma pagina, para o seletor trabalhar em
// pedacos comparaveis aos de um PDF.
function agrupa(blocos) {
  const grupos = [];
  let atual = { blocos: [], txt: '' };
  for (const b of blocos) {
    const t = textoDoBloco(b);
    if (atual.txt.length + t.length > CHARS_POR_PAGINA && atual.blocos.length) {
      grupos.push(atual);
      atual = { blocos: [], txt: '' };
    }
    atual.blocos.push(b);
    atual.txt += t + '\n';
  }
  if (atual.blocos.length) grupos.push(atual);
  return grupos;
}

const PARADAS = new Set(['para', 'com', 'sem', 'dos', 'das', 'que', 'por', 'uma', 'nao',
  'material', 'tipo', 'modelo', 'unidade', 'medida', 'aplicacao', 'caracteristicas',
  'adicionais', 'minimo', 'maximo', 'aproximado', 'cada', 'demais', 'conforme']);

// Do primeiro ao ultimo trecho que fala dos itens, mais a abertura.
//
// O seletor dos PDFs nao serve aqui: ele escolhe paginas soltas, contando com a
// estrutura de um documento paginado. No texto de Diamante D'Oeste/PR ele pegou
// duas fatias — maquina de lavar e poltrona — e deixou de fora forno,
// fritadeira, cooktop e micro-ondas, que estavam nas fatias seguintes. E o
// portao de cobertura nao pegou o erro, porque as palavras dos descritivos
// ("eletrico", "aplicacao", "voltagem") aparecem em qualquer fatia de
// eletrodomestico. Pegando a faixa inteira, nenhum item fica de fora.
function trechosDosItens(r, fatias) {
  const chaves = new Set();
  for (const it of (r[8] || [])) {
    for (const w of normSimples(it[3]).split(/[^a-z0-9]+/)) {
      if (w.length >= 5 && !PARADAS.has(w)) chaves.add(w);
    }
  }
  if (chaves.size < 3) return null;

  const marcadas = [];
  fatias.forEach((f, i) => {
    const t = normSimples(f);
    let n = 0;
    for (const w of chaves) if (t.includes(w)) n++;
    if (n >= 3) marcadas.push(i);
  });
  if (!marcadas.length) return null;

  const ini = marcadas[0], fim = marcadas[marcadas.length - 1];
  const faixa = [];
  for (let i = ini; i <= fim; i++) faixa.push(i);
  // Cobrindo quase tudo, cortar nao economiza nada e ainda arrisca: vai inteiro.
  if (faixa.length > fatias.length * 0.7) return null;
  return [...new Set([0, ...faixa])].sort((a, b) => a - b);
}

// Acima disso a tabela fica com coluna de dois centimetros e o descritivo sai
// picado letra a letra: melhor entregar como texto, uma linha por registro.
const MAX_COLUNAS = 8;

function anexaTexto(doc, r, blocos, formato, nome, modo, itens) {
  blocos = semRepetidos(blocos || []);
  const inteiro = blocos.map(textoDoBloco).join('\n');
  if (inteiro.replace(/\s/g, '').length < 200) {
    return { ok: false, motivo: 'o arquivo ' + formato + ' nao tinha texto legivel' };
  }

  let usar = blocos, rota = 'texto', partes = null, total = null;
  if (modo === 'uteis' && inteiro.length > TEXTO_CURTO) {
    const grupos = agrupa(blocos);
    const quais = trechosDosItens(r, grupos.map(g => g.txt));
    if (quais) {
      usar = quais.flatMap(i => grupos[i].blocos);
      rota = 'texto-selecao';
      partes = quais.length;
      total = grupos.length;
    }
  }

  const tabelas = usar.filter(b => b.t === 'tab').length;

  doc.novaPagina();
  doc.texto('Texto do arquivo publicado pelo órgão', { tam: 13, negrito: true });
  doc.espaco(4);
  doc.texto('O órgão não publicou o edital em PDF: publicou em ' + formato
    + (nome ? ' (' + nome + ')' : '') + '. Esse formato não tem páginas fixas, então o que segue é '
    + (rota === 'texto-selecao'
      ? 'a parte do documento que descreve os produtos (abertura, objeto e especificação dos itens), '
        + partes + ' de ' + total + ' trechos'
      : 'o documento inteiro')
    + (tabelas ? ', com as ' + tabelas + ' tabela(s) remontadas coluna a coluna' : '')
    + (formato.includes('DOC') && !formato.includes('DOCX')
      ? '. O .doc é um formato binário antigo: a extração é aproximada e não preserva tabelas' : '')
    + '.', { tam: 8.5, cor: [0.3, 0.3, 0.3] });
  doc.espaco(12);

  for (const b of usar) {
    if (b.t !== 'tab') { doc.texto(b.txt, { tam: 8.5, alturaLinha: 11.2 }); continue; }
    if (b.fracoes.length > MAX_COLUNAS) {
      for (const l of b.linhas) doc.texto(l.filter(Boolean).join(' · '), { tam: 8, alturaLinha: 10.5 });
      continue;
    }
    const cab = b.linhas[0];
    const cols = b.fracoes.map((f, i) => ({ titulo: cab[i] || '', larg: f }));
    doc.espaco(4);
    doc.tabela(cols, b.linhas.slice(1), { tam: 7.5, tamCabecalho: 7 });
    doc.espaco(8);
  }
  return { ok: true, rota, formato, paginas: partes, total,
           chars: usar.map(textoDoBloco).join('').length, tabelas };
}

// Recebe UM ou VARIOS PDFs e trata todos como um documento so.
//
// Varios porque o zip do orgao costuma separar o que num edital em PDF unico
// vem junto: em Pouso Alegre/MG o zip trazia EDITAL, TR, ETP e ARP em arquivos
// distintos. Selecionando arquivo a arquivo, o edital sozinho nao cobre os
// itens (eles estao no TR) e cairia inteiro, e o TR sozinho entraria sem a capa
// — que e justamente o que o usuario exigiu em 04/09/2026. Emendados, a capa
// sai do primeiro e a tabela de itens do que a tiver.
async function anexaPaginas(doc, r, fontes, modo, itens) {
  try {
    const les = [];
    for (const f of fontes) les.push({ nome: f.nome, le: await LE.abre(f.bytes) });
    const total = les.reduce((s, x) => s + x.le.total, 0);

    // Indice global -> (arquivo, pagina dentro dele).
    const mapa = [];
    les.forEach((x, iArq) => {
      for (let p = 0; p < x.le.total; p++) mapa.push([iArq, p]);
    });
    // So conta como "de dentro do zip" o que veio mesmo de um zip: o nome do
    // arquivo sozinho nao serve de prova, porque o PDF publicado direto tambem
    // tem nome — e o resumo saia dizendo que veio de um zip que nao existia.
    const doZip = fontes.filter(f => f.zip).map(f => f.nome).filter(Boolean);
    const deZip = doZip.length ? doZip.join(', ') : null;

    // "rota" e o caminho que o anexo tomou. Sem ele so da para adivinhar pelo
    // numero de paginas, e "escolheu todas" e "nao conseguiu escolher" viram a
    // mesma coisa — justamente o caso que o painel do lote precisa distinguir.
    let quais, comoEscolhi, rota;
    if (modo === 'inteiro') {
      quais = Array.from({ length: total }, (_, i) => i);
      comoEscolhi = 'o edital oficial completo';
      rota = 'inteiro';
    } else if (typeof modo === 'number' && modo > 0) {
      quais = Array.from({ length: Math.min(modo, total) }, (_, i) => i);
      comoEscolhi = 'as ' + quais.length + ' primeiras páginas do edital oficial';
      rota = 'primeiras';
    } else {
      let paginas = [];
      for (const x of les) paginas = paginas.concat(await textoDasPaginas(x.le));
      const sel = escolhePaginas(r, itens, paginas);
      // Exige conteudo que DESCREVA os itens: a tabela pontuada pelos descritivos
      // ou uma secao de especificacao achada pelo cabecalho. So capa nao basta —
      // seria pior que entregar o documento inteiro.
      // textoUtil filtra o caso em que so o carimbo de assinatura foi extraido:
      // tem texto, mas e a mesma frase em toda pagina.
      // A selecao so vale se COBRIR os itens. Apertada demais, ela perdia
      // descritivo em silencio — o pior desfecho possivel, porque o PDF sai
      // parecendo completo. Abaixo de 60%% dos itens presentes, entrega tudo.
      const cobre = coberturaItens(r, paginas, sel.escolhidas);
      if (textoUtil(paginas) && cobre >= 0.6 && (sel.tabela.length || (sel.tr && sel.tr.length))) {
        quais = sel.escolhidas;
        comoEscolhi = 'as páginas do edital oficial que descrevem os produtos '
          + '(capa, objeto e especificação dos itens), ' + quais.length + ' de ' + total;
        rota = 'selecao';
      } else {
        // PDF de imagem, ou fonte com codificacao propria: nao da para pontuar
        // pagina nenhuma. Melhor entregar o documento inteiro do que nada.
        quais = Array.from({ length: total }, (_, i) => i);
        comoEscolhi = 'o edital oficial completo (não foi possível isolar com segurança as páginas que descrevem os produtos)';
        rota = 'completo';
      }
    }

    doc.espaco(8);
    doc.texto('A seguir, ' + comoEscolhi + ', copiado do arquivo publicado no PNCP'
      + (deZip ? ', de dentro do zip do órgão (' + deZip + ')' : '') + '. '
      + 'É nele que está o descritivo completo de cada produto.',
      { tam: 8, negrito: true, cor: [0.2, 0.2, 0.2] });

    // Anexa arquivo por arquivo, na ordem das paginas escolhidas.
    for (let iArq = 0; iArq < les.length; iArq++) {
      const locais = quais.filter(g => mapa[g][0] === iArq).map(g => mapa[g][1]);
      if (locais.length) doc.anexaExternas(await LE.extraiPaginas(les[iArq].le, locais), false);
    }
    return { ok: true, rota, deZip,
             paginas: quais.length, total, numeros: quais.map(i => i + 1) };
  } catch (e) {
    return { ok: false, motivo: 'nao foi possivel ler o arquivo oficial (' + e.message + ')' };
  }
}

export async function montaResumo(r, opts = {}) {
  const doc = PDF.novo({ rodape: 'Radar de Editais Digiplus · varredura de ' + (opts.varredura || '') });

  doc.tituloComValor(r[0] + ' / ' + r[1], r[6] ? moeda(r[6]) : 'orçamento sigiloso', { tam: 15 });
  doc.texto(r[2] + (r[10] ? '  ·  ' + r[10] : ''), { tam: 8.5, cor: [0.35, 0.35, 0.35] });
  doc.regua(1);
  doc.espaco(6);

  doc.texto(r[3] + (r[11] ? '   ·   ' + r[11] : ''), { tam: 10.5, negrito: true });
  doc.espaco(1);
  // Abertura e encerramento juntos: o encerramento sozinho nao dizia quando a
  // sessao comeca, que e o que define se ainda da tempo de cotar.
  doc.texto((r[15] ? 'Propostas de ' + dataHoraBR(r[15]) + ' a ' : 'Encerra ') + quandoTxt(r[4]),
            { tam: 9, cor: [0.25, 0.25, 0.25] });
  const ficha = [r[12] ? "publicado em " + dataBR(r[12]) : "", r[17], r[16], r[18] ? "portal: " + r[18] : ""].filter(Boolean);
  if (ficha.length) doc.texto(ficha.join('   ·   '), { tam: 8.5, cor: [0.42, 0.42, 0.42] });
  doc.espaco(6);
  if (r[9]) doc.campo('Objeto', r[9], { tam: 9, larguraRotulo: 52 });

  secao(doc, 'Itens de interesse (' + r[8].length + ')');
  const ben = resumoBeneficio(r);
  doc.texto(r[5].toLocaleString('pt-BR') + ' unidades · '
            + (r[6] ? moeda(r[6]) + ' estimados' : 'orçamento sigiloso')
            + (ben ? ' · ' + ben : ''),
            { tam: 8.5, cor: [0.4, 0.4, 0.4] });
  doc.espaco(5);

  r[8].forEach((it, k) => {
    if (k > 0) { doc.espaco(5); doc.regua(0.5, [0.78, 0.78, 0.78]); doc.espaco(3); }
    doc.reserva(64);
    doc.parOposto(rotuloItem(it, k) + '   ·   ' + CAT[it[0]], qtdItem(it),
                  { tam: 10, negritoEsq: true, negritoDir: true, corEsq: [0, 0, 0] });
    doc.espaco(2);
    doc.texto(it[3], { tam: 9.5, alturaLinha: 13 });
    doc.espaco(3);
    doc.parOposto('Unitário ' + (it[2] ? moeda(it[2]) : 'sigiloso'),
                  it[2] ? 'Total ' + moeda(it[1] * it[2]) : '',
                  { tam: 8.5, negritoDir: true });
    const b = beneficioItem(it);
    if (b) doc.parOposto(b, '', { tam: 8, negritoEsq: it[6] === 'E',
                                  corEsq: it[6] === 'E' ? [0.55, 0.1, 0.1] : [0.42, 0.42, 0.42] });
  });

  const todos = opts.todos !== undefined ? opts.todos : await buscaTodosItens(r);
  let nDemais = null;
  if (todos === null) {
    secao(doc, 'Demais itens do edital');
    doc.texto('Não consegui buscar a lista completa agora. Use o link da página oficial no fim.',
      { tam: 8.5, cor: [0.35, 0.35, 0.35] });
  } else {
    const conhecido = jaDetalhados(r);
    const demais = todos.filter(x => !conhecido(x));
    nDemais = demais.length;
    secao(doc, 'Demais itens do edital (' + demais.length + ')');
    if (!demais.length) {
      doc.texto('O edital tem só os itens detalhados acima.', { tam: 8.5, cor: [0.35, 0.35, 0.35] });
    } else {
      doc.texto('O que mais está sendo comprado no mesmo edital, para dimensionar a disputa.',
        { tam: 8.5, cor: [0.4, 0.4, 0.4] });
      doc.espaco(4);
      for (const x of demais) {
        doc.reserva(22);
        const q = (+x.quantidade || 0).toLocaleString('pt-BR');
        const vu = +x.valorUnitarioEstimado || 0;
        doc.campo('Item ' + (x.numeroItem || '—'),
                  q + (x.unidadeMedida ? ' ' + x.unidadeMedida : '') + '  ·  '
                  + (vu ? moeda(vu) : 'sigiloso') + '   ' + umaLinha(x.descricao),
                  { tam: 8, larguraRotulo: 52 });
        doc.espaco(2);
      }
    }
  }

  secao(doc, 'Onde conferir');
  doc.campo('Página', 'https://pncp.gov.br/app/editais/' + r[7], { tam: 8.5, larguraRotulo: 52 });
  if (r[13]) {
    doc.campo('Arquivo', urlArquivo(r) + (r[14] ? '  (' + String(r[14]).toUpperCase() + ')' : ''),
              { tam: 8.5, larguraRotulo: 52 });
  }

  doc.espaco(10);
  doc.texto('Os valores são estimativas do órgão, não referência de mercado. Itens marcados como '
    + 'sigiloso tiveram o orçamento fechado pelo órgão. Sobram cerca de 4% de falsos positivos '
    + 'residuais: confira o edital oficial antes de cotar.', { tam: 7.5, cor: [0.35, 0.35, 0.35] });

  return { doc, nDemais, nTodos: todos ? todos.length : null };
}
