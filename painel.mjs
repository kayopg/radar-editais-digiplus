// Monta o painel do lote: uma pagina so, com o funil da varredura e o que cada
// PDF recebeu. Serve para conferir a rodada inteira sem abrir 75 arquivos.
//
// Le tres fontes, todas locais:
//   dados/ultima.json   -> as estatisticas de cada fase da varredura (o funil)
//   docs/dados.json     -> os editais que sobraram, com itens e descritivos
//   resumos/indice.json -> o que cada PDF do lote recebeu de anexo
//
// Uso: node painel.mjs           -> escreve resumos/painel.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const le = (...p) => JSON.parse(fs.readFileSync(path.join(DIR, ...p), 'utf8'));

const dados = le('docs', 'dados.json');
const indice = le('resumos', 'indice.json');
let st = {};
try { st = le('dados', 'ultima.json').st; }
catch { console.error('aviso: dados/ultima.json nao encontrado, o funil sai so com o meta'); }

const CAT = { RF: 'Refrigeração', CL: 'Climatização', CC: 'Cocção', PR: 'Preparo',
  EP: 'Eletroportáteis', LV: 'Lavanderia', BB: 'Bebedouro', CX: 'Coifa/Exaustão',
  BL: 'Balanças', LD: 'Lousa digital', GE: 'Geradores', AQ: 'Aquecimento', OT: 'Outros' };
const UF_NOME = { PR: 'Paraná', RS: 'Rio Grande do Sul', SP: 'São Paulo', MG: 'Minas Gerais',
  GO: 'Goiás', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', SC: 'Santa Catarina' };

// A rota que o anexo tomou. Os lotes gerados antes do campo "rota" existir so
// tem a frase do log — dai o numero de paginas responde: escolher todas as
// paginas e nao ter conseguido escolher dao no mesmo arquivo.
const rotaDe = (r) => {
  if (r.rota) {
    if (r.rota === 'selecao') return 'selecao';
    if (r.rota === 'sem') return 'sem';
    // DOC e DOCX nao tem pagina para anexar: o que vai e o texto.
    if (r.rota.startsWith('texto')) return 'texto';
    return 'inteiro';
  }
  const m = /^(\d+)\/(\d+) pag/.exec(r.nota || '');
  if (!m) return 'sem';
  return m[1] === m[2] ? 'inteiro' : 'selecao';
};
const paginasDe = (r) => {
  if (typeof r.paginas === 'number') return [r.paginas, r.total];
  const m = /^(\d+)\/(\d+) pag/.exec(r.nota || '');
  return m ? [+m[1], +m[2]] : null;
};
const formatoDe = (r) => (/\((\w+)\)/.exec(r.nota || '') || [])[1] || '';

// Junta o edital (com itens e descritivos) ao registro do PDF.
const chave = (uf, mun, ed) => uf + '|' + mun + '|' + ed;
const porChave = new Map(indice.editais.map(r => [chave(r.uf, r.mun, r.edital), r]));

const C = dados.colunas.reduce((o, n, i) => (o[n] = i, o), {});
const hoje = new Date(dados.meta.varredura + 'T12:00:00');

const editais = dados.editais.map(e => {
  const r = porChave.get(chave(e[C.uf], e[C.municipio], e[C.edital])) || {};
  const fecha = new Date(e[C.encerramento]);
  return {
    mun: e[C.municipio], uf: e[C.uf], orgao: e[C.orgao], edital: e[C.edital],
    fecha: e[C.encerramento], dias: Math.round((fecha - hoje) / 86400000),
    valor: e[C.valorEstimado], qtd: e[C.quantidade], objeto: e[C.objeto],
    modalidade: e[C.modalidade], portal: e[C.portal], abertura: e[C.aberturaPropostas],
    itens: e[C.itens].map(it => ({ cat: it[0], qtd: it[1], vu: it[2], desc: it[3],
      un: it[4], n: it[5], me: it[6] === 'S' })),
    rota: rotaDe(r), pag: paginasDe(r), kb: r.kb || 0,
    formato: r.formato || formatoDe(r), deZip: r.deZip || null,
    arquivo: (r.arquivo || '').split(/[\\/]/).pop()
  };
});
editais.sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.mun.localeCompare(b.mun, 'pt'));

const conta = (rota) => editais.filter(e => e.rota === rota).length;
const resumoLote = {
  total: editais.length,
  selecao: conta('selecao'), inteiro: conta('inteiro'), texto: conta('texto'), sem: conta('sem'),
  mb: +(editais.reduce((s, e) => s + e.kb, 0) / 1024).toFixed(1),
  itens: editais.reduce((s, e) => s + e.itens.length, 0),
  formatos: editais.filter(e => e.rota === 'sem').reduce((o, e) => (o[e.formato] = (o[e.formato] || 0) + 1, o), {})
};

// O funil: cada fase com quantos entraram, o que saiu e por que. Os numeros vem
// da varredura; se a estatistica nao existir, a fase some em vez de mentir zero.
const n = (v) => (typeof v === 'number' ? v : null);
const item = (rot, val) => (n(val) ? { rot, val } : null);
const fases = [
  { nome: 'Buscas no PNCP',
    entrou: n(st.consultas) || dados.meta.consultas,
    unid: 'consultas',
    saiu: n(st.unicos) || dados.meta.candidatos,
    saiuRot: 'editais únicos',
    nota: (dados.meta.termos || 44) + ' termos × ' + (dados.meta.ufs || []).length + ' estados × 2 páginas'
      + (st.errBusca ? ' · ' + st.errBusca + ' consulta sem resposta' : ''),
    cortes: [] },
  { nome: 'Triagem do edital',
    entrou: n(st.unicos), unid: 'editais únicos',
    saiu: n(st.candidatos), saiuRot: 'candidatos',
    nota: 'olha modalidade, objeto, órgão e prazo antes de gastar leitura de itens',
    cortes: [item('modalidade fora do pregão', st.vMod), item('objeto de serviço/obra', st.vObj),
      item('órgão fora do escopo', st.vOrgao), item('órgão devedor', st.vDevedor),
      item('prazo inválido', st.vData)] },
  { nome: 'Leitura dos itens',
    entrou: n(st.candidatos), unid: 'candidatos',
    saiu: n(st.ok) && n(st.dup) ? st.ok - st.dup : n(st.ok),
    saiuRot: 'com produto nosso',
    nota: 'lê o item a item de cada edital e guarda só o que a Digiplus cota',
    cortes: [item('sem item publicado', st.semItem), item('item de serviço', st.itemServ),
      item('objeto de serviço', st.objServ), item('balança médica/laboratório', st.vBalanca),
      item('abaixo do piso de preço', st.vPiso), item('equipamento científico', st.vCient),
      item('item cancelado', st.vCancel), item('edital repetido', st.dup)] },
  { nome: 'Portal de disputa',
    entrou: n(st.ok) && n(st.dup) ? st.ok - st.dup : null, unid: 'com produto nosso',
    saiu: n(st.ok) && n(st.dup) && n(st.vPortal) ? st.ok - st.dup - st.vPortal : null,
    saiuRot: 'nos portais da casa',
    nota: 'BLL, BNC, Compras.gov, Banrisul, Compras Públicas e Licitanet'
      + (st.errPortal ? ' · ' + st.errPortal + ' sem resposta, mantidos' : ''),
    cortes: [item('portal fora da lista', st.vPortal)] },
  { nome: 'Exigências impeditivas',
    entrou: n(st.ok) && n(st.dup) && n(st.vPortal) ? st.ok - st.dup - st.vPortal : null,
    unid: 'nos portais da casa',
    saiu: n(st.final), saiuRot: 'editais para cotar',
    nota: 'lê o edital atrás de amostra, sustentabilidade, solidariedade e garantia contratual'
      + (st.semTextoExige ? ' · ' + st.semTextoExige + ' sem texto extraível, mantidos' : ''),
    cortes: Object.entries(st.porExigencia || {}).map(([k, v]) => ({ rot: k.toLowerCase(), val: v })) }
].map(f => ({ ...f, cortes: f.cortes.filter(Boolean).sort((a, b) => b.val - a.val) }))
 .filter(f => f.entrou && f.saiu);

const porUf = [];
for (const uf of Object.keys(dados.meta.porUf || {}).sort((a, b) => (dados.meta.porUf[b] - dados.meta.porUf[a]) || a.localeCompare(b))) {
  const lista = editais.filter(e => e.uf === uf);
  if (lista.length) porUf.push({ uf, nome: UF_NOME[uf] || uf, editais: lista });
}

const dadosPagina = {
  varredura: dados.meta.varredura, gerado: indice.gerado,
  resumo: resumoLote, fases, porUf, cat: CAT,
  devedores: st.porDevedor || {}, vDevedor: st.vDevedor || 0
};

// JSON dentro de <script>: o "<" precisa sair escapado ou um "</script>" no
// meio de um descritivo fecha a tag e a pagina morre em branco.
const json = JSON.stringify(dadosPagina).replace(/</g, '\\u003c');

const html = fs.readFileSync(path.join(DIR, 'painel-modelo.html'), 'utf8')
  .replace('/*DADOS*/null', json);

const saida = path.join(DIR, 'resumos', 'painel.html');
fs.writeFileSync(saida, html, 'utf8');
console.log('painel: ' + path.relative(DIR, saida) + ' · ' + (html.length / 1024).toFixed(0) + ' KB · '
  + resumoLote.total + ' editais (' + resumoLote.selecao + ' seleção, '
  + resumoLote.inteiro + ' inteiro, ' + resumoLote.texto + ' texto, '
  + resumoLote.sem + ' sem anexo)');
