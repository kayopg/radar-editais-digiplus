// A data da sessao escrita no EDITAL, para marcar "Data alterada" quando o
// orgao adiou a disputa por aviso, retificacao ou suspensao ANTES de o Radar ver
// o edital pela primeira vez.
//
// Pedido do usuario em 13/10/2026: "em alguns editais aparece a data antiga, e
// no portal a data foi adiada para outro dia ... marque no site que a data foi
// alterada, e confira nos outros editais casos como esse". O datas-alteradas.mjs
// so marca a mudanca que o Radar VIU (a data do PNCP mudou de um dia para o
// outro). Na lista de 13/10 havia cinco editais adiados antes disso, sem marca:
// Assis Chateaubriand/PR ("Aviso de Nova data" para 20/10), Pedras de Maria da
// Cruz/MG ("Alteracao" para 19/10), Perola/PR ("Aviso de Alteracao" para 22/10),
// Uniao da Vitoria/PR (reabertura para 22/10) e Inhumas/GO (edital republicado
// para 19/10). O card mostrava a data certa, do PNCP, mas o edital aberto pelo
// botao dizia outra, e nada avisava.
//
// Como: le as primeiras paginas do edital ORIGINAL (a base do
// versao-do-edital.mjs), acha as datas que vem logo depois de "sessao
// publica", "abertura das propostas", "inicio da disputa"..., e fica com a mais
// citada. Se ela e ANTERIOR a data do PNCP em mais de um dia, e a data do PNCP
// nao aparece nessas paginas, o edital foi adiado: a marca e
// [data do edital, dia, 'edital'] na coluna dataAlterada.
//
// Cauteloso de proposito: na duvida (nenhuma data perto das palavras da
// sessao, texto escaneado, letras espacadas) nao marca nada — marca errada
// assusta mais do que a falta dela. O resultado de cada edital fica guardado
// no datas-vistas.json (campo "ed"), para nao baixar o edital de novo todo dia.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { textoDasPaginas } from './paginas-uteis.mjs';
import { escolheEdital, daListaDoPncp } from './versao-do-edital.mjs';
import { leVistas, gravaVistas } from './datas-alteradas.mjs';

const MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');

// palavras que anunciam a data da disputa (o FIM do recebimento das propostas
// ou a abertura — nunca o comeco do recebimento, que vem antes da sessao)
const CHAVE = new RegExp([
  'sessao (?:publica|virtual|eletronica|online|on-line|de disputa|de lances)', 'sessao\s*:', 'sessao sera realizada',
  'abertura da sessao', 'inicio da sessao', 'data da sessao', 'data (?:de|da) abertura', 'abertura das? propostas?',
  'abertura do (?:certame|pregao)', 'abertura da licitacao', 'abertura e julgamento', '(?:^|[^a-z])abertura(?=:| na | em | no dia| dia)',
  'data do certame', 'realizacao do (?:certame|pregao)', 'licitacao (?:ocorrera|sera realizada)',
  'inicio (?:da |de )?disputa', 'data da disputa', 'disputa de precos', 'inicio dos lances', 'fase de lances',
  '(?:recebimento|envio|acolhimento|cadastramento) das propostas', 'data e hora(?:rio)? (?:da|de|do)',
  'limite para (?:o )?(?:recebimento|envio|cadastr)', 'encerramento (?:do|da|das) (?:recebimento|propostas|envio)',
  '(?:termino|fim) (?:do |da )?(?:cadastro|rec(?:ebimento|\.)|envio)', 'cadastro (?:da|das|de) propostas?',
].join('|'), 'g');
// o que, logo antes da data, diz que ela e de outra coisa
const OUTRA_COISA = /publicad|publicacao|impugna|esclarecimento|assinad|(?:^|[^a-z])lei(?:[^a-z]|$)|decreto|portaria|emitid|registrad|homologad|vigencia|validade|atualizad|nascid|expedid/;
// o comeco do recebimento: "inicio rec. proposta: 28/09/2026", "inicio do
// cadastro da proposta: 30 de setembro" (Porto Murtinho/MS, Iacri/SP)
const COMECO = /inicio (?:do |da |de )?(?:rec|cadastr|envio|acolhimento|prazo|credenciamento)[^0-9]{0,30}$/;
const DATA = /(\d{1,2})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(20\d{2})|(\d{1,2})(?:o|º|°)?\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(?:de\s*)?(20\d{2})/g;

const TEM_DATA = new RegExp(DATA.source);

const dia = s => Date.parse(String(s).slice(0, 10) + 'T12:00:00Z');
const iso = (a, m, d) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// Datas de sessao no texto das primeiras paginas. publicado: dia em que o
// edital saiu no PNCP (a sessao vem depois dele).
export function datasDaSessao(texto, publicado) {
  const n = norm(texto);
  const chaves = [...n.matchAll(CHAVE)].map(m => m.index + m[0].length);
  const pub = publicado ? dia(publicado) : null;
  const achadas = [];
  for (const m of n.matchAll(DATA)) {
    const d = +(m[1] || m[4]), mes = m[2] ? +m[2] : MESES[m[5]], ano = +(m[3] || m[6]);
    if (!(d >= 1 && d <= 31 && mes >= 1 && mes <= 12)) continue;
    const logoAntes = n.slice(Math.max(0, m.index - 40), m.index);
    // a palavra da sessao a ate 140 letras antes, sem outra data no meio...
    let k = chaves.filter(c => c <= m.index && m.index - c <= 140).pop();
    if (k !== undefined) {
      const meio = n.slice(k, m.index);
      // o intervalo "das 00h00min do dia 09/10/2026 as 08h00 do dia 23/10/2026"
      // (Santo Antonio da Platina/PR): a primeira e so o comeco do recebimento
      // das propostas, a que vale e a do "ate"/"as"
      if (/(?:^|\s)(?:das|a partir d[ao]s?|desde)\s+(?:\d{1,2}\s*(?:h|:)\s*\d{0,2}\s*(?:min)?\s*)?(?:do dia|de|em)?\s*$/.test(logoAntes)) continue;
      const fimDoIntervalo = /(?:ate|as)\s+(?:as\s+)?\d{1,2}\s*(?:h|:)\s*\d{0,2}\s*(?:min|hs?|horas)?\s*(?:do dia|de|em)?\s*$/.test(logoAntes);
      if (TEM_DATA.test(meio) && !fimDoIntervalo) k = undefined;
    }
    // ...ou o "(horario de Brasilia)" logo depois: "no dia 27/10/2026, as
    // 13h30min (horario de Brasilia)" (Porto Alegre/RS, edital 141)
    const brasilia = /^[^0-9]{0,8}(?:\d{1,2}\s*(?:h|:)\s*\d{0,2}\s*(?:min|hs?|horas)?\s*)?\(?\s*horario (?:oficial )?de brasilia/.test(n.slice(m.index + m[0].length, m.index + m[0].length + 60));
    if (k === undefined && !brasilia) continue;
    if (COMECO.test(logoAntes)) continue;
    if (OUTRA_COISA.test(n.slice(Math.max(k ?? 0, m.index - 60), m.index))) continue;
    const data = iso(ano, mes, d);
    // a sessao e depois da publicacao (o pregao pede 8 dias uteis) e nao muito
    if (pub && (dia(data) < pub + 3 * 864e5 || dia(data) > pub + 200 * 864e5)) continue;
    // a hora vem depois ("27/10/2026 HORARIO: 09 horas") ou antes ("as 09:00 do dia 25/08/2026")
    const h = n.slice(m.index + m[0].length, m.index + m[0].length + 40).match(/^\D{0,20}?(\d{1,2})\s*(?:h|:|horas)\s*(?:e\s*)?(\d{2})?/)
      || logoAntes.match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*(?:h|hs|horas|min)?\s*(?:\([^)]*\)\s*)?(?:do dia|de|em|,)?\s*$/);
    achadas.push({ data, hora: h ? `${h[1].padStart(2, '0')}:${h[2] || '00'}` : null, ctx: n.slice(Math.max(0, (k ?? m.index) - 40), m.index + m[0].length + 30) });
  }
  return achadas;
}

// A data mais citada (empate: a primeira), com a hora mais citada dela.
export function sessaoDoEdital(texto, publicado) {
  const ds = datasDaSessao(texto, publicado);
  if (!ds.length) return null;
  const conta = new Map();
  for (const x of ds) conta.set(x.data, (conta.get(x.data) || 0) + 1);
  const data = [...conta.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const horas = ds.filter(x => x.data === data && x.hora).map(x => x.hora);
  const hora = horas.sort((a, b) => horas.filter(h => h === b).length - horas.filter(h => h === a).length)[0] || null;
  return { data, hora, vezes: conta.get(data), todas: [...conta.keys()], ctx: ds.find(x => x.data === data).ctx };
}

// O edital foi adiado depois de publicado? sessao: o que o sessaoDoEdital deu;
// encerramento: a data do PNCP (YYYY-MM-DDTHH:MM). Devolve a data antiga
// (YYYY-MM-DDTHH:MM, ou so o dia) ou null.
export function adiadoDesde(sessao, encerramento) {
  if (!sessao || !encerramento) return null;
  const pncp = String(encerramento).slice(0, 10);
  if (sessao.todas.includes(pncp)) return null;
  // So o adiamento: o PNCP DEPOIS do edital, nem que seja um dia (Tres
  // Pontas/MG, 26/10 -> 27/10 pelo adendo). O PNCP antes do edital e o
  // encerramento das propostas na vespera da sessao (Divinopolis de Goias/GO:
  // propostas ate 13/10 23:59, sessao 14/10) — ou erro de leitura: nao marca.
  if (dia(pncp) <= dia(sessao.data)) return null;
  return sessao.data + (sessao.hora ? 'T' + sessao.hora : '');
}

// ------------------------------------------------------------------ no robo
// node data-do-edital.mjs [--minutos 15]
// Roda depois do publicar.mjs, que poe a marca do que o Radar VIU mudar; este
// so olha os editais que ficaram sem marca. Le o edital uma vez e guarda no
// datas-vistas.json (campo "ed": arquivo, base, data, hora, todas, dia da
// leitura); le de novo so quando a varredura passa a apontar outro arquivo do
// edital. Com o prazo estourado, o resto fica para o dia seguinte.

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PAGINAS_LIDAS = 6;

// A data da sessao no edital original: { arq, b, d, h, t, em } — d nulo quando
// nao achou (ou o edital nao e PDF) — ou null quando a rede falhou (tenta amanha).
export async function leSessaoDoEdital(caminho, arq, hoje) {
  const LE = createRequire(import.meta.url)(path.join(DIR, 'docs', 'pdf-le.js'));
  const [c, a, s] = String(caminho).split('/');
  const busca = async (url, prazo) => {
    for (let t = 0; t < 2; t++) {
      try { const r = await fetch(url, { signal: AbortSignal.timeout(prazo) }); if (r.ok) return r; } catch { /* de novo */ }
    }
    return null;
  };
  const rl = await busca(`https://pncp.gov.br/api/pncp/v1/orgaos/${c}/compras/${a}/${s}/arquivos`, 30000);
  if (!rl) return null;
  const ed = await escolheEdital(daListaDoPncp(await rl.json().catch(() => [])));
  if (!ed) return { arq, b: null, d: null, em: hoje };
  const base = ed.base;
  const rb = await busca(`https://pncp.gov.br/pncp-api/v1/orgaos/${c}/compras/${a}/${s}/arquivos/${base.seq}`, 120000);
  if (!rb) return null;
  const bytes = new Uint8Array(await rb.arrayBuffer());
  if (Buffer.from(bytes.slice(0, 4)).toString('latin1') !== '%PDF') return { arq, b: base.seq, d: null, em: hoje };
  let texto = '';
  try { texto = (await textoDasPaginas(await LE.abre(bytes), PAGINAS_LIDAS)).join(' '); } catch { return { arq, b: base.seq, d: null, em: hoje }; }
  const sessao = sessaoDoEdital(texto, base.publicado);
  return sessao
    ? { arq, b: base.seq, d: sessao.data, h: sessao.hora, t: sessao.todas.slice(0, 8), em: hoje }
    : { arq, b: base.seq, d: null, em: hoje };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--minutos');
  const prazo = Date.now() + (i > 0 ? +process.argv[i + 1] : 15) * 60000;
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const arqDados = path.join(DIR, 'docs', 'dados.json');
  const dados = JSON.parse(fs.readFileSync(arqDados, 'utf8'));
  const C = Object.fromEntries(dados.colunas.map((c, k) => [c, k]));
  if (C.dataAlterada === undefined) { console.log('sem a coluna dataAlterada: rode o publicar.mjs antes'); process.exit(0); }
  const vistas = leVistas();
  const fila = dados.editais.filter(e => !e[C.dataAlterada] && e[C.path] && e[C.encerramento]);
  let lidos = 0, guardados = 0, semTempo = 0, falhas = 0, marcados = 0;
  const marcas = [];
  await Promise.all([1, 2, 3, 4].map(async () => {
    while (fila.length) {
      const e = fila.shift();
      const p = e[C.path], arq = e[C.arquivoSeq] || 1;
      const v = vistas[p] || (vistas[p] = { f: String(e[C.encerramento]).slice(0, 16), v: hoje });
      let ed = v.ed && v.ed.arq === arq ? v.ed : null;
      if (ed) guardados++;
      else if (Date.now() > prazo) { semTempo++; continue; }
      else {
        ed = await leSessaoDoEdital(p, arq, hoje);
        if (!ed) { falhas++; continue; }
        v.ed = ed; lidos++;
      }
      const antiga = ed.d ? adiadoDesde({ data: ed.d, hora: ed.h, todas: ed.t || [ed.d] }, e[C.encerramento]) : null;
      if (!antiga) continue;
      e[C.dataAlterada] = [antiga, ed.em, 'edital'];
      marcados++;
      marcas.push(`  adiado: ${e[C.municipio]}/${e[C.uf]} ${e[C.edital]} · o edital dizia ${antiga.replace('T', ' ')}, o PNCP diz ${String(e[C.encerramento]).slice(0, 16).replace('T', ' ')}`);
    }
  }));
  fs.writeFileSync(arqDados, JSON.stringify(dados), 'utf8');
  gravaVistas(vistas, hoje);
  console.log(marcas.sort().join('\n'));
  console.log(`data no edital: ${lidos} lido(s) agora, ${guardados} ja lido(s) antes, ${falhas} falha(s) de rede, ${semTempo} para amanha (prazo) · ${marcados} adiado(s) marcado(s)`);
}
