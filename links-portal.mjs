// Completa no docs/dados.json o endereco de cada edital DENTRO do portal da
// disputa (coluna linkPortal), que alimenta o botao "Participar" da pagina.
//
// O usuario pediu em 15/09/2026 um botao que levasse direto a aba de participar
// do edital. O PNCP ja tem esse endereco — linkSistemaOrigem na API de consulta:
// no Compras.gov.br e o acompanhamento da compra, na BLL e na BNC a pagina do
// processo, onde o fornecedor entra na disputa. Quando o PNCP nao traz e a
// disputa e no Compras.gov.br, o link e montado (ver participar.mjs) e a coluna
// linkMontado marca isso.
//
// A varredura grava o link junto com o portal, na mesma consulta. Este script
// cobre o que ficou sem: listas geradas antes do campo existir e editais em que
// a consulta falhou. So busca quem esta sem link.
//
// Uso: node links-portal.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { linkDoPortal, ehComprasGov, montaLinkComprasGov } from './participar.mjs';
import { plataformaDoEdital } from './plataforma.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const arquivo = path.join(DIR, 'docs', 'dados.json');
const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
for (const nome of ['linkPortal', 'linkMontado', 'comoParticipar']) if (!dados.colunas.includes(nome)) dados.colunas.push(nome);
const C = dados.colunas.reduce((o, n, i) => (o[n] = i, o), {});

const espera = ms => new Promise(x => setTimeout(x, ms));

// Mesma cautela da varredura: a API de consulta tem cota curta, entao uma
// requisicao por vez, e 429 espera a cota voltar. null = nao respondeu.
async function consulta(p) {
  const [c, a, s] = p.split('/');
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`https://pncp.gov.br/api/consulta/v1/orgaos/${c}/compras/${a}/${s}`, { signal: AbortSignal.timeout(20000) });
      if (r.status === 429) { await espera(35000); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch {
      await espera(3000);
    }
  }
  return null;
}

// A consulta de um edital as vezes cai so para ele (Nova Esperanca/PR e Caxias
// do Sul/RS deram 504 seguidos em 16/09/2026). A busca do PNCP tem a UASG e a
// modalidade tambem: procura o edital pelo municipio ate achar o caminho.
async function pelaBusca(e) {
  const url = p => 'https://pncp.gov.br/api/search/?q=' + encodeURIComponent(e[C.municipio])
    + '&tipos_documento=edital&ordenacao=-data&pagina=' + p + '&tam_pagina=100&status=recebendo_proposta&ufs=' + e[C.uf];
  for (let p = 1; p <= 5; p++) {
    try {
      const r = await fetch(url(p));
      if (!r.ok) return null;
      const j = await r.json();
      const achado = (j.items || []).find(x => x.item_url === '/compras/' + e[C.path]);
      if (achado) return achado;
      if (!j.items || j.items.length < 100) return null;
    } catch {
      return null;
    }
  }
  return null;
}

// Quando o PNCP nao traz o endereco, a plataforma da disputa esta escrita no
// comeco do edital (ver plataforma.mjs): em 16/09/2026 doze cards ficaram sem o
// botao Participar. O botao leva a plataforma, e a nota diz o que procurar la.

// O que a automacao nao descobre sozinha: edital sem plataforma, em que a
// disputa e por e-mail ou no balcao (Franca/SP, 16/09/2026). Ver o arquivo.
let manual = {};
try { manual = JSON.parse(fs.readFileSync(path.join(DIR, 'participar-manual.json'), 'utf8')); } catch {}

let novos = 0, montados = 0, semLink = 0, falhas = 0, seguidas = 0, manuais = 0, doEdital = 0, reusados = 0, apiFora = false;
// A versao anterior do dados.json: a que o workflow guarda em /tmp/anterior.json
// antes da varredura, ou a indicada em DADOS_ANTERIOR.
const anterior = new Map();
for (const arq of [process.env.DADOS_ANTERIOR, '/tmp/anterior.json'].filter(Boolean)) {
  try {
    const a = JSON.parse(fs.readFileSync(arq, 'utf8'));
    const A = (a.colunas || []).reduce((o, n, i) => (o[n] = i, o), {});
    if (A.linkPortal === undefined) continue;
    for (const x of a.editais || []) if (x[A.linkPortal]) anterior.set(x[A.path], { link: x[A.linkPortal], montado: x[A.linkMontado] || '', nota: x[A.comoParticipar] || '' });
    break;
  } catch { /* sem versao anterior */ }
}
for (const e of dados.editais) {
  while (e.length < dados.colunas.length) e.push('');
  const m = manual[e[C.path]];
  if (m && /^(https?:|mailto:)/i.test(String(m.link || ''))) {
    e[C.linkPortal] = m.link; e[C.linkMontado] = ''; e[C.comoParticipar] = String(m.nota || '');
    manuais++;
    continue;
  }
  if (e[C.linkPortal]) continue;
  // O link do dia anterior: o endereco do edital no portal nao muda, e com a
  // consulta fora do ar a varredura de 22/09/2026 saiu com 151 de 154 cards sem
  // o botao Participar, quando na vespera 91 o tinham.
  const ant = anterior.get(e[C.path]);
  if (ant && ant.link) {
    e[C.linkPortal] = ant.link; e[C.linkMontado] = ant.montado; e[C.comoParticipar] = ant.nota;
    reusados++;
    continue;
  }
  // API fora do ar: nao adianta insistir edital por edital, mas a plataforma
  // escrita no edital ainda vale (antes o laco parava e os demais ficavam sem
  // nada).
  const j = apiFora ? null : await consulta(e[C.path]);
  let link = '', montado = false;
  if (j) {
    seguidas = 0;
    link = linkDoPortal(j.linkSistemaOrigem);
    if (!link && ehComprasGov(j.usuarioNome || e[C.portal])) {
      link = montaLinkComprasGov({ uasg: j.unidadeOrgao && j.unidadeOrgao.codigoUnidade,
        modId: j.modalidadeId, numero: j.numeroCompra || e[C.edital], ano: j.anoCompra });
      montado = !!link;
    }
  } else if (ehComprasGov(e[C.portal])) {
    falhas++;
    const b = await pelaBusca(e);
    if (b) {
      link = montaLinkComprasGov({ uasg: b.unidade_codigo, modId: b.modalidade_licitacao_id,
        numero: e[C.edital], ano: b.ano });
      montado = !!link;
    }
  } else {
    falhas++;
    if (!apiFora && ++seguidas >= 5) { apiFora = true; console.log('a API de consulta nao responde; os demais so pela plataforma escrita no edital'); }
  }
  if (!link) {
    const p = await plataformaDoEdital(e, e[C.objeto]);
    if (p) {
      link = p.url;
      e[C.comoParticipar] = `O PNCP não traz o endereço deste edital. O próprio edital indica a disputa ${p.nome}: entre lá e procure o ${String(e[C.edital] || 'edital').split('|')[0].trim().replace(/^Edital\s+/i, 'edital ')} de ${e[C.municipio]}/${e[C.uf]}.`;
      doEdital++;
    }
  }
  if (link) {
    e[C.linkPortal] = link;
    e[C.linkMontado] = montado ? 1 : '';
    if (montado) montados++; else if (!e[C.comoParticipar]) novos++;
  } else semLink++;
  await espera(300);
}

fs.writeFileSync(arquivo, JSON.stringify(dados), 'utf8');
const com = dados.editais.filter(e => e[C.linkPortal]).length;
console.log(`links do portal: ${novos} do PNCP · ${montados} montados · ${doEdital} pela plataforma escrita no edital · ${reusados} do dia anterior · ${manuais} do participar-manual.json · ${semLink} sem link · ${falhas} consulta(s) sem resposta · ${com} de ${dados.editais.length} com botao Participar`);
