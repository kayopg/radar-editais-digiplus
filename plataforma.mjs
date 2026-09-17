// Em que plataforma e a disputa de um edital — o que decide se a Digiplus
// participa (decisao do usuario em 02/09/2026: so BLL, BNC, Compras.gov.br,
// Banrisul, Portal de Compras Publicas e Licitanet).
//
// O PNCP diz QUEM PUBLICOU (usuarioNome), e ate 17/09/2026 era isso que a
// varredura olhava. So que quem publica nem sempre e onde se disputa: a
// prefeitura manda o edital pelo sistema de gestao dela (Tecnosweb, SMARAPD,
// Governanca Brasil, Fiorilli) e a sessao e na BLL, na BNC ou no Banrisul.
// Vila Flores/RS publica pela Tecnosweb e disputa no Pregao Banrisul; Rosario do
// Sul/RS publica pela Governanca Brasil e disputa na BNC. E, no sentido
// contrario, quando a consulta ao PNCP falhava o edital ficava por garantia, e
// entravam Pitangueiras/SP (Licitar Digital) e Iacanga/SP (portal da
// prefeitura), que a regra tira. A lista oscilava de um dia para o outro
// conforme a API respondia.
//
// Agora: o publicador aceito basta; senao, vale a plataforma escrita no comeco
// do edital ("A sessao ... sera realizada no seguinte endereco:
// www.pregaobanrisul.com.br", "LOCAL: PLATAFORMA BLL").
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { arquivosPublicados, fontesDe } from './resumo-pdf.mjs';
import { textoDasPaginas } from './paginas-uteis.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LE = createRequire(import.meta.url)(path.join(DIR, 'docs', 'pdf-le.js'));

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');

// Os seis portais da casa, pelo nome de quem publica no PNCP. O nome vem por
// extenso e varia ("BLL Compras", "Bolsa Nacional De Compras - BNC"), por isso
// a comparacao e por trecho.
export const PORTAIS_OK = [
  'bll compras', 'bolsa de licitacoes',                       // BLL
  'bolsa nacional de compras',                                // BNC
  'compras.gov.br', 'comprasnet',                             // Compras GOV
  'banrisul',                                                 // Banrisul
  'portal de compras publicas', 'compras publicas',           // Compras Publicas
  'licitanet',                                                // Licitanet
];
export const portalOk = nome => {
  const t = norm(nome);
  return !!t && PORTAIS_OK.some(p => t.includes(p));
};

// As plataformas pelo que o edital escreve: [padrao, pagina inicial, como a
// nota fala dela, e da casa?]
export const PLATAFORMAS = [
  [/pregaobanrisul|preg[ãa]o\s+(?:online\s+)?banrisul/i, 'https://www.pregaobanrisul.com.br', 'no Pregão Banrisul', true],
  [/bnccompras|bnc\s+compras|bolsa\s+nacional\s+de\s+compras/i, 'https://bnccompras.com', 'na BNC', true],
  [/bllcompras|bll\.org\.br|bll\.com\.br|plataforma\s+(?:da\s+)?bll\b|bolsa\s+de\s+licita[çc][õo]es\s+e\s+leil/i, 'https://bllcompras.com', 'na BLL', true],
  [/portaldecompraspublicas|portal\s+de\s+compras\s+p[úu]blicas/i, 'https://www.portaldecompraspublicas.com.br', 'no Portal de Compras Públicas', true],
  [/licitanet/i, 'https://licitanet.com.br', 'na Licitanet', true],
  [/cnetmobile|comprasnet|compras\.gov\.br|www\.gov\.br\/compras/i, 'https://www.gov.br/compras', 'no Compras.gov.br', true],
  [/licitardigital\.com\.br|licitar\.digital(?!\S*1doc)|licitar\s+digital/i, 'https://app2.licitardigital.com.br', 'no Licitar Digital', false],
  [/ammlicita/i, 'https://app2.ammlicita.org.br', 'no AMM Licita', false],
  [/licitacoes-e\.com\.br|licita[çc][õo]es-e\b/i, 'https://www.licitacoes-e.com.br', 'no Licitações-e do Banco do Brasil', false],
  [/bbmnet/i, 'https://bbmnet.com.br', 'na BBMNET', false],
];

// Endereco escrito por extenso para a sessao: "ENDERECO ELETRONICO:
// https://scpiiacanga.dcfiorilli.com.br:879/comprasedital/" (Iacanga/SP), portal
// proprio da prefeitura que nenhuma lista conhece.
const ENDERECO_DA_SESSAO = /(?:sess[ãa]o[^.]{0,90}?realizada\s+no\s+(?:seguinte\s+)?endere[çc]o(?:\s+eletr[ôo]nico)?|ENDERE[ÇC]O\s+ELETR[ÔO]NICO|Link)\s*:?\s*((?:https?:\/\/|www\.)[^\s,;"')]+)/i;
const naoEPlataforma = u => /1doc\.com\.br|pncp\.gov|\.(?:sp|mg|pr|rs|sc|go|mt|ms)\.gov\.br|planalto|in\.gov/i.test(u);

// { url, nome, daCasa } ou null. O compras.gov.br so conta pelo endereco da
// sessao: "SICAF" e "Compras.gov.br" aparecem em todo edital de prefeitura como
// cadastro, nao como lugar da disputa.
export function plataformaDoTexto(texto) {
  const t = String(texto || '').replace(/\s+/g, ' ');
  const s = t.match(ENDERECO_DA_SESSAO);
  if (s && !naoEPlataforma(s[1])) {
    const conhecida = PLATAFORMAS.find(([re]) => re.test(s[1]));
    if (conhecida) return { url: conhecida[1], nome: conhecida[2], daCasa: conhecida[3] };
    const url = (/^www\./i.test(s[1]) ? 'https://' + s[1] : s[1]).replace(/[.:]+$/, '');
    return { url, nome: 'no portal de compras próprio do órgão', daCasa: false };
  }
  const contagem = PLATAFORMAS
    .filter(([, url]) => !url.includes('gov.br/compras'))
    .map(([re, url, nome, daCasa]) => ({ url, nome, daCasa, n: (t.match(new RegExp(re.source, 'gi')) || []).length }))
    .filter(x => x.n).sort((a, b) => b.n - a.n);
  return contagem[0] ? { url: contagem[0].url, nome: contagem[0].nome, daCasa: contagem[0].daCasa } : null;
}

// Le o objeto e o comeco dos dois primeiros arquivos do edital (6 folhas do
// PDF, ou o texto do ODT/HTML/DOCX). e: { path, objeto } em qualquer formato
// que arquivosPublicados aceite (linha do dados.json: e[7] e o path).
export async function plataformaDoEdital(linha, objeto = '') {
  let texto = String(objeto || '');
  try {
    for (const c of (await arquivosPublicados(linha)).slice(0, 2)) {
      const f = await fontesDe(c, [], 3);
      for (const p of f.pdfs.slice(0, 1)) texto += ' ' + (await textoDasPaginas(await LE.abre(p.bytes))).slice(0, 6).join(' ');
      for (const x of f.textos || []) texto += ' ' + x.texto.slice(0, 30000);
      if (f.texto && !(f.textos || []).length) texto += ' ' + f.texto.blocos.slice(0, 300).map(b => b.txt || '').join(' ');
    }
  } catch { /* fica com o objeto */ }
  return plataformaDoTexto(texto);
}
