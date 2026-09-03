// Montador do resumo por edital, em Node. Existe para nao haver tres copias do
// mesmo layout: o testa-pdf.mjs e o resumos.mjs importam daqui.
//
// O docs/index.html continua com a sua propria copia, e nao da para evitar: a
// pagina e servida sem build e sem modulos, entao nao ha como ela importar isto.
// Mudou o layout la, mude aqui — sao dois lugares, nao tres.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { textoDasPaginas, escolhePaginas } from './paginas-uteis.mjs';

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
export async function anexaOficial(doc, r, opts = {}) {
  const modo = opts.modo === undefined ? 'uteis' : opts.modo;
  if (String(r[14]).toLowerCase() !== 'pdf') {
    return { ok: false, motivo: 'o arquivo oficial nao e PDF (' + (r[14] || 'sem arquivo') + ')' };
  }
  const url = urlArquivo(r);
  if (!url) return { ok: false, motivo: 'o orgao nao publicou arquivo' };
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const le = await LE.abre(new Uint8Array(await resp.arrayBuffer()));

    let quais, comoEscolhi;
    if (modo === 'inteiro') {
      quais = Array.from({ length: le.total }, (_, i) => i);
      comoEscolhi = 'o edital oficial completo';
    } else if (typeof modo === 'number' && modo > 0) {
      quais = Array.from({ length: Math.min(modo, le.total) }, (_, i) => i);
      comoEscolhi = 'as ' + quais.length + ' primeiras páginas do edital oficial';
    } else {
      const paginas = await textoDasPaginas(le);
      const sel = escolhePaginas(r, opts.itens || [], paginas);
      // Exige conteudo que DESCREVA os itens: a tabela pontuada pelos descritivos
      // ou uma secao de especificacao achada pelo cabecalho. So capa nao basta —
      // seria pior que entregar o documento inteiro.
      if (sel.tabela.length || (sel.tr && sel.tr.length)) {
        quais = sel.escolhidas;
        comoEscolhi = 'as páginas do edital oficial que descrevem os produtos '
          + '(capa, objeto e especificação dos itens), ' + quais.length + ' de ' + le.total;
      } else {
        // PDF de imagem, ou fonte com codificacao propria: nao da para pontuar
        // pagina nenhuma. Melhor entregar o documento inteiro do que nada.
        quais = Array.from({ length: le.total }, (_, i) => i);
        comoEscolhi = 'o edital oficial completo (não consegui ler o texto para separar as páginas úteis)';
      }
    }

    doc.espaco(8);
    doc.texto('A seguir, ' + comoEscolhi + ', copiado do arquivo publicado no PNCP. '
      + 'É nele que está o descritivo completo de cada produto.',
      { tam: 8, negrito: true, cor: [0.2, 0.2, 0.2] });
    doc.anexaExternas(await LE.extraiPaginas(le, quais), false);
    return { ok: true, paginas: quais.length, total: le.total, numeros: quais.map(i => i + 1) };
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
