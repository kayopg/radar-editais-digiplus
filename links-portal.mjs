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
      const r = await fetch(`https://pncp.gov.br/api/consulta/v1/orgaos/${c}/compras/${a}/${s}`);
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

// O que a automacao nao descobre sozinha: edital sem plataforma, em que a
// disputa e por e-mail ou no balcao (Franca/SP, 16/09/2026). Ver o arquivo.
let manual = {};
try { manual = JSON.parse(fs.readFileSync(path.join(DIR, 'participar-manual.json'), 'utf8')); } catch {}

let novos = 0, montados = 0, semLink = 0, falhas = 0, seguidas = 0, manuais = 0;
for (const e of dados.editais) {
  while (e.length < dados.colunas.length) e.push('');
  const m = manual[e[C.path]];
  if (m && /^(https?:|mailto:)/i.test(String(m.link || ''))) {
    e[C.linkPortal] = m.link; e[C.linkMontado] = ''; e[C.comoParticipar] = String(m.nota || '');
    manuais++;
    continue;
  }
  if (e[C.linkPortal]) continue;
  const j = await consulta(e[C.path]);
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
    // API fora do ar: nao adianta insistir edital por edital
    if (++seguidas >= 5) { console.log('a API de consulta nao responde; parando'); break; }
  }
  if (link) {
    e[C.linkPortal] = link;
    e[C.linkMontado] = montado ? 1 : '';
    if (montado) montados++; else novos++;
  } else semLink++;
  await espera(300);
}

fs.writeFileSync(arquivo, JSON.stringify(dados), 'utf8');
const com = dados.editais.filter(e => e[C.linkPortal]).length;
console.log(`links do portal: ${novos} do PNCP · ${montados} montados · ${manuais} do participar-manual.json · ${semLink} sem link · ${falhas} consulta(s) sem resposta · ${com} de ${dados.editais.length} com botao Participar`);
