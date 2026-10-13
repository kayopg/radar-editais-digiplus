// Qual dos arquivos publicados no PNCP e O EDITAL — e, quando o orgao
// republicou o edital retificado, a versao MAIS NOVA dele.
//
// Pedido do usuario em 13/10/2026: "em alguns editais aparece a data antiga, e
// no portal a data foi adiada para outro dia. ex: Humaita - 89/2026". O PNCP
// de Humaita/RS tem tres editais completos (06/08, 21/08 e 21/09, ~450 KB cada)
// e a varredura ficava com o PRIMEIRO arquivo do tipo "Edital": o botao do site
// e a folha de abertura mostravam a sessao de 21/08, quando a retificacao 2 diz
// 27/10 — a data do PNCP.
//
// E o primeiro do tipo "Edital" muitas vezes nem e o edital: na lista de 13/10
// era o PARECER em Caarapo/MS, a PESQUISA DE PRECOS em Sao Jose do Inhacora/RS,
// o AVISO DE LICITACAO em Barao do Triunfo/RS e o ANEXO I em Pedras de Maria da
// Cruz/MG — orgaos que cadastram tudo com o tipo "Edital".
//
// A regra:
//   1. so os arquivos do tipo Edital / Aviso de Contratacao, e entre eles o que
//      nao se chama de outra coisa (ETP, TR, parecer, aviso, errata...);
//   2. a base e o de nome de edital ("Edital...", "PE 49.2026...") mais antigo;
//   3. um arquivo publicado DEPOIS dela, chamado de edital ou de retificacao,
//      passa a valer se tiver pelo menos 70% das PAGINAS da base — e o edital
//      inteiro de novo, e nao o aviso de retificacao. Pelas paginas, e nao pelo
//      tamanho: a "RETIFICACAO_COM_ANEXOS" de Cerro Grande do Sul/RS pesa
//      1,3 MB contra 686 KB do edital, e sao 5 folhas escaneadas contra 30.
//      O tamanho so vale quando um dos dois nao e PDF (zip, doc).
//
// Os titulos chegam com os acentos trocados por "_" ("Estudo_T_cnico",
// "Termo_de_Refer_ncia", "PRE_OS"): as palavras abaixo param antes do acento.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const LE = createRequire(import.meta.url)(path.join(path.dirname(fileURLToPath(import.meta.url)), 'docs', 'pdf-le.js'));

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[_\s]+/g, ' ').trim();

// O que nunca e o edital, pelo titulo.
const NAO_E = new RegExp([
  'estudo t', 'preliminar', '(?:^|[^a-z])etp(?=[^a-z]|\\d|assinad|$)',
  'termo de refer', '(?:^|[^a-z])tr(?=[\\s.-]|\\d{5}|assinad|$)',
  '(?:^|[^a-z])dfd(?=[^a-z]|assinad|$)', 'formalizac', 'autuac',
  'minuta', 'parecer', 'planilha', 'pesquisa (?:de )?pre', 'mapa (?:de )?(?:pre|apura|risco)', 'matriz de risco',
  'cotac', 'orcament', 'quantitativ', 'justificativ', 'decreto', 'portaria', 'certid',
  '(?:^|[^a-z])publ(?:ica|\\.|\\s|$)', 'extrato', 'jornal', '(?:^|[^a-z])(?:doe|dou|agm)(?:[^a-z]|$)',
  'aviso(?! de (?:contrata|dispensa))', 'errata', 'suspens', 'prorroga', 'altera', 'adiament', 'nova data',
  'comunicad', 'convocac', 'esclarec', 'impugn', 'respost', 'questionament', 'julgament', 'homolog',
  'resultado', 'ata de', 'contrato', 'aditivo', 'solicitac', 'pedido de compra', 'memorando', 'autorizac', 'catalogo',
  '^\\W*\\d*\\W*anexo', '(?:^|[^a-z])anexo (?:[ivx]+|\\d+)\\b(?!.*edital)', 'apendice', 'ap ndice', 'declarac', 'modelo de',
].join('|'));

const CODIGO_DO_PREGAO = /^(?:\d{1,2}\W*)?(?:pe|pp|pce|pregao|preg o|cc|tp|dl|ce|rp)\s*[-.]?\s*n?[ºo°]?\s*\d{1,4}\s*[-./]?\s*\d{2,4}(?!\d)/;

const ehDoTipoEdital = tipo => /edital|aviso de contratacao/.test(norm(tipo));

// 2 = chama-se edital (ou pelo codigo do pregao), 1 = nome neutro, 0 = outra coisa
export function notaDoEdital(titulo, tipo) {
  const n = norm(titulo);
  if (/edital|aviso de (?:contrata|dispensa)/.test(n)
      && !/minuta|errata|aviso(?! de (?:contrata|dispensa))|convocac|certid|(?:^|[^a-z])publica|suspens|prorroga|altera|resultado|homolog/.test(n)) return 2;
  if (NAO_E.test(n)) return 0;
  if (CODIGO_DO_PREGAO.test(n)) return 2;
  return tipo === undefined || ehDoTipoEdital(tipo) ? 1 : 0;
}

// Arquivo que pode ser o edital inteiro republicado: chama-se edital ou
// retificacao/republicacao, e nao aviso, errata, suspensao...
function podeSerVersaoNova(titulo) {
  const n = norm(titulo);
  if (/errata|aviso(?! de (?:contrata|dispensa))|suspens|prorroga|altera|adiament|nova data|comunicad|esclarec|impugn|respost|extrato|certid|ata de|contrato|aditivo/.test(n)) return false;
  return /edital|retifica|republica|com anexos/.test(n) || CODIGO_DO_PREGAO.test(n) || notaDoEdital(titulo) === 1;
}

const MINIMO_DA_BASE = 0.7;

// lista: itens com { seq, titulo, tipo, publicado } (o que o PNCP chama de
// sequencialDocumento, titulo, tipoDocumentoNome e dataPublicacaoPncp).
// medidaDe(seq) -> { bytes, paginas } (paginas so quando e PDF) ou null; sem
// ela a versao nova nao e conferida e fica a base.
// Devolve { escolhido, base, motivo } ou null quando nao ha arquivo do tipo edital.
export async function escolheEdital(lista, medidaDe = null) {
  const ativos = (lista || []).filter(a => a && a.ativo !== false);
  const doTipo = ativos.filter(a => ehDoTipoEdital(a.tipo));
  // Nenhum do tipo Edital: vale o nome. Santo Cristo/RS (pregao 88/2026)
  // cadastrou o edital como "Outros Documentos" ("43693_88 2026 - Aquisicao de
  // bebedouros...pdf", 18 paginas), e o botao abria o ETP.pdf, o arquivo 1.
  if (!doTipo.length) {
    const pelosNomes = ativos.map(a => ({ a, n: notaDoEdital(a.titulo) })).filter(x => x.n > 0)
      .sort((x, y) => (y.n - x.n) || (x.a.seq - y.a.seq));
    return pelosNomes.length ? { escolhido: pelosNomes[0].a, base: pelosNomes[0].a, motivo: 'pelo nome (nenhum do tipo Edital)' } : null;
  }
  const comNota = doTipo.map(a => ({ a, n: notaDoEdital(a.titulo, a.tipo) })).filter(x => x.n > 0);
  if (!comNota.length) return { escolhido: doTipo[0], base: doTipo[0], motivo: 'nenhum se chama de edital' };
  // a base: a de maior nota, a mais antiga
  comNota.sort((x, y) => (y.n - x.n) || (x.a.seq - y.a.seq));
  const base = comNota[0].a;
  const depois = doTipo
    .filter(a => a !== base && String(a.publicado || '').slice(0, 10) > String(base.publicado || '').slice(0, 10) && podeSerVersaoNova(a.titulo))
    .sort((x, y) => String(y.publicado).localeCompare(String(x.publicado)) || (y.seq - x.seq));
  if (!depois.length || !medidaDe) return { escolhido: base, base, motivo: 'base' };
  const mBase = await medidaDe(base.seq);
  if (!mBase) return { escolhido: base, base, motivo: 'base (sem medida)' };
  for (const a of depois) {
    const m = await medidaDe(a.seq);
    if (!m) continue;
    const porPagina = m.paginas && mBase.paginas;
    const [x, y, un] = porPagina ? [m.paginas, mBase.paginas, 'p'] : [m.bytes, mBase.bytes, 'KB'];
    const txt = un === 'p' ? `${x} p contra ${y} p` : `${Math.round(x / 1024)} KB contra ${Math.round(y / 1024)} KB`;
    if (x && y && x >= MINIMO_DA_BASE * y) return { escolhido: a, base, motivo: `versao nova (${txt})` };
  }
  return { escolhido: base, base, motivo: 'versoes novas curtas (avisos)' };
}

// A medida de um arquivo do PNCP: baixa e, se for PDF, conta as paginas.
// So e chamada nos pregoes que tem arquivo do tipo edital publicado depois
// do primeiro (6 de 158 em 13/10/2026).
export function medidaPeloPncp(caminho, prazo = 120000) {
  const [c, a, s] = String(caminho).split('/');
  const guardadas = new Map();
  return seq => {
    if (!guardadas.has(seq)) guardadas.set(seq, (async () => {
      for (let t = 0; t < 2; t++) {
        try {
          const r = await fetch(`https://pncp.gov.br/pncp-api/v1/orgaos/${c}/compras/${a}/${s}/arquivos/${seq}`, { signal: AbortSignal.timeout(prazo) });
          if (!r.ok) continue;
          const b = new Uint8Array(await r.arrayBuffer());
          let paginas = null;
          if (Buffer.from(b.slice(0, 4)).toString('latin1') === '%PDF') {
            try { paginas = (await LE.abre(b)).total || null; } catch { /* PDF que nao abre: fica o tamanho */ }
          }
          return { bytes: b.length, paginas };
        } catch { /* tenta de novo */ }
      }
      return null;
    })());
    return guardadas.get(seq);
  };
}

// a lista do PNCP no formato acima
export const daListaDoPncp = lista => (Array.isArray(lista) ? lista : []).map(x => ({
  seq: +x.sequencialDocumento || 0, titulo: String(x.titulo || ''), tipo: String(x.tipoDocumentoNome || ''),
  publicado: String(x.dataPublicacaoPncp || ''), ativo: x.statusAtivo, bruto: x,
}));
