// Os anexos que o orgao pos so na plataforma da disputa, e nao no PNCP.
//
// Em 16/09/2026 o usuario abriu o resumo de Serrana/SP e todos os itens diziam
// "conforme termo de referencia", sem descritivo. O PNCP tinha so as 19 paginas
// do corpo do edital; o Anexo I — o Termo de Referencia com a especificacao de
// cada item — estava apenas na BLL, junto com os outros sete anexos.
//
// BLL e BNC rodam o mesmo sistema: a pagina do processo (o link do botao
// Participar) tem uma lista publica de arquivos em /Process/ProcessFiles, com o
// endereco direto de cada PDF. Nenhum login e necessario.
//
// So os arquivos com cara de especificacao entram: Termo de Referencia, Anexo I,
// especificacao, descritivo, memorial, planilha e o proprio edital. Declaracoes,
// minutas de contrato e modelos de proposta ficam de fora.

const PLATAFORMAS = /(^|\.)(bllcompras\.com|bnccompras\.com)$/i;
const CABECALHO = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0', 'X-Requested-With': 'XMLHttpRequest' };
const MAX_ARQUIVOS = 4;
const MAX_BYTES = 40 * 1024 * 1024;

const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Quanto o nome do arquivo promete de especificacao. 0 = nao baixa.
function peso(nome) {
  const n = semAcento(nome).replace(/[_\-.]+/g, ' ');
  if (/declara|minuta|contrato|modelo|procuracao|credenciamento|recibo|aviso|impugna|esclarec|ata de/.test(n)) return 0;
  if (/termo de referencia|(^| )tr( |$)|especifica|descritiv|memorial|planilha/.test(n)) return 3;
  if (/anexo (i|1|01)( |$)/.test(n)) return 3;
  if (/edital/.test(n)) return 2;
  if (/anexo/.test(n)) return 1;
  return 0;
}

export function ehPlataformaComAnexos(link) {
  try { return PLATAFORMAS.test(new URL(link).host); } catch { return false; }
}

// Lista { nome, url } dos arquivos do processo.
export async function listaAnexos(link) {
  const u = new URL(link);
  const p1 = u.searchParams.get('param1');
  if (!p1) return [];
  const r = await fetch(u.origin + '/Process/ProcessFiles?param1=' + encodeURIComponent(p1), { headers: CABECALHO });
  if (!r.ok) throw new Error('lista de anexos da plataforma: HTTP ' + r.status);
  let t = await r.text();
  // a resposta vem como HTML escapado dentro de JSON
  t = t.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&').replace(/\\"/g, '"');
  const out = [], vistos = new Set();
  for (const m of t.matchAll(/href="(https:\/\/[^"]+\/processfiles\/[^"]+)"[^>]*download="([^"]+)"/g)) {
    if (vistos.has(m[1])) continue;
    vistos.add(m[1]);
    out.push({ url: m[1], nome: m[2] });
  }
  return out;
}

// Baixa os anexos com cara de especificacao, os de maior peso primeiro.
// Devolve [{ nome, bytes }] so com PDFs.
export async function anexosDaPlataforma(link, tropecos = []) {
  if (!ehPlataformaComAnexos(link)) return [];
  let lista;
  try { lista = await listaAnexos(link); } catch (err) { tropecos.push(err.message); return []; }
  // Com Termo de Referencia ou Anexo I na lista, so eles: o edital da
  // plataforma costuma ser o mesmo do PNCP, e repetido so atrapalha o recorte.
  const pesados = lista.map(a => ({ ...a, peso: peso(a.nome) })).filter(a => a.peso > 0);
  const temTR = pesados.some(a => a.peso === 3);
  const escolhidos = pesados.filter(a => !temTR || a.peso === 3)
    .sort((a, b) => b.peso - a.peso)
    .slice(0, MAX_ARQUIVOS);
  const out = [];
  for (const a of escolhidos) {
    try {
      const r = await fetch(a.url, { headers: { 'User-Agent': CABECALHO['User-Agent'] } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.length > MAX_BYTES) { tropecos.push(`anexo ${a.nome} grande demais`); continue; }
      if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') continue;
      out.push({ nome: a.nome, bytes });
    } catch (err) {
      tropecos.push(`anexo ${a.nome}: ${err.message}`);
    }
  }
  return out;
}
