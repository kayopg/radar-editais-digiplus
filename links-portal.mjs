// Completa no docs/dados.json o endereco de cada edital DENTRO do portal da
// disputa (coluna linkPortal), que alimenta o botao "Participar" da pagina.
//
// O usuario pediu em 15/09/2026 um botao que levasse direto a aba de participar
// do edital. O PNCP ja tem esse endereco — linkSistemaOrigem na API de consulta:
// no Compras.gov.br e o acompanhamento da compra, na BLL e na BNC a pagina do
// processo, onde o fornecedor entra na disputa.
//
// A varredura grava o link junto com o portal, na mesma consulta. Este script
// cobre o que ficou sem: listas geradas antes do campo existir e editais em que
// a consulta falhou. So busca quem esta sem link.
//
// Uso: node links-portal.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const arquivo = path.join(DIR, 'docs', 'dados.json');
const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const C = dados.colunas.reduce((o, n, i) => (o[n] = i, o), {});
if (C.linkPortal === undefined) {
  C.linkPortal = dados.colunas.length;
  dados.colunas.push('linkPortal');
}

const linkDoPortal = u => {
  const s = String(u || '').trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
};
const espera = ms => new Promise(x => setTimeout(x, ms));

// Mesma cautela da varredura: a API de consulta tem cota curta, entao uma
// requisicao por vez, e 429 espera a cota voltar.
async function buscaLink(p) {
  const [c, a, s] = p.split('/');
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`https://pncp.gov.br/api/consulta/v1/orgaos/${c}/compras/${a}/${s}`);
      if (r.status === 429) { await espera(35000); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return linkDoPortal((await r.json()).linkSistemaOrigem);
    } catch {
      await espera(3000);
    }
  }
  return null;
}

let achados = 0, semLink = 0, falhas = 0, seguidas = 0;
for (const e of dados.editais) {
  while (e.length < dados.colunas.length) e.push('');
  if (e[C.linkPortal]) continue;
  const link = await buscaLink(e[C.path]);
  if (link === null) {
    falhas++;
    // API fora do ar: nao adianta insistir edital por edital
    if (++seguidas >= 5) { console.log('a API de consulta nao responde; parando'); break; }
    continue;
  }
  seguidas = 0;
  if (link) { e[C.linkPortal] = link; achados++; } else semLink++;
  await espera(300);
}

fs.writeFileSync(arquivo, JSON.stringify(dados), 'utf8');
const com = dados.editais.filter(e => e[C.linkPortal]).length;
console.log(`links do portal: ${achados} novos · ${semLink} sem link no PNCP · ${falhas} falha(s) · ${com} de ${dados.editais.length} com botao Participar`);
