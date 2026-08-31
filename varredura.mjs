// Radar de Editais Digiplus — varredura do PNCP e geração dos dados do artifact.
// Uso: node varredura.mjs            -> grava dados-YYYY-MM-DD.json e imprime as estatísticas
// Requer Node 18+ (fetch global). Roda direto na máquina; não precisa do navegador.

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

// ---------------------------------------------------------------- parâmetros
const TERMOS = ["eletrodomesticos","eletroportateis","refrigerador","geladeira","freezer","frigobar","fogao industrial","fogao","forno industrial","forno eletrico","microondas","cooktop","liquidificador industrial","liquidificador","batedeira planetaria","cafeteira","chaleira eletrica","fritadeira","coifa","lavadora de roupas","maquina de lavar roupas","secadora de roupas","bebedouro","purificador de agua","camara fria","expositor refrigerado","ar condicionado","climatizador","cortina de ar","equipamentos de cozinha","aspirador de po","ferro de passar"];
const UFS = ["PR","RS","SP","MG","GO","MT","MS","SC"];

const CAT = [
  ["RF",["refrigerador","geladeira","frigobar","freezer","congelador","conservadora","camara fria","camara frigorifica","expositor refrigerado","balcao refrigerado","cervejeira","resfriador"]],
  ["BB",["bebedouro","purificador de agua"]],
  ["CC",["fogao","forno","microondas","micro-ondas","micro ondas","cooktop","fritadeira","salamandra","char broiler","charbroiler","caldeirao","panela eletrica","churrasqueira"]],
  ["CX",["coifa","depurador","exaustor"]],
  ["PR",["liquidificador","batedeira","processador de alimentos","multiprocessador","espremedor","moedor","cortador de frios","fatiador","descascador","masseira","amassadeira"]],
  ["EP",["cafeteira","chaleira","sanduicheira","torradeira","air fryer","airfryer","ferro de passar","aspirador de po","grill eletrico"]],
  ["LV",["lavadora de roupa","maquina de lavar","secadora","centrifuga de roupa","calandra","tanquinho","lava-loucas","lava loucas","lavadora extratora"]],
  ["CL",["ar-condicionado","ar condicionado","arcondicionado","condicionador de ar","split","climatizador","cortina de ar","ventilador","desumidificador","umidificador"]],
  ["OT",["enceradeira","lavadora de alta pressao","televisor","smart tv","aquecedor"]],
];

const PISO = { CL:400, LV:400, RF:300, BB:300, CC:250, CX:200, OT:150, PR:100, EP:60 };

// 5.0 — modalidade. Ids conferidos na API em 31/08/2026:
//   1 Leilao-Eletronico | 4 Concorrencia-Eletronica | 6 Pregao-Eletronico
//   7 Pregao-Presencial | 8 Dispensa | 12 Credenciamento | 13 Leilao-Presencial
// Fora da lista some tudo: leilao (que trazia veiculo sucateado), credenciamento
// e concorrencia. O PNCP nao separa dispensa eletronica de presencial: id 8 e uma so.
const MOD_OK = new Set([6, 8]);
const MOD_PRESENCIAL = 7;
const UF_PRESENCIAL = new Set(['RS', 'SC']);   // pregao presencial so nesses dois

// 5.1 — serviço no item
const SERV_ITEM = ["instalacao","montagem","manutencao","higienizacao","desinstalacao","recarga de gas","limpeza de ar","mao de obra","servicos de"];
// 5.1 — serviço no objeto do edital (mais estreito: "manutenção das atividades" é praxe e não é serviço)
const SERV_OBJ = ["instalacao","montagem","mao de obra"];

// 5.2 — veto por objeto
const VETO_OBJ = ["veiculo","picape","caminhao","onibus","ambulancia","motociclet","automov","trator","maquinas agricolas","brinquedo","material de construcao","processamento de dados","formulas aliment","dieta enteral","generos aliment","material de limpeza","higiene e limpeza","sucata","velorio","tecidos aviamento"];

// 5.3 — veto por item (lista viva, construída de falsos positivos reais)
const VETO_ITEM = ["ventilador mecanic","ventilador pulmon","ventilacao mecanic","fisioterapia","ultrassom","cpap","bipap","trator","agricol","retroescav","colheitadeira","em mdf","de mdf","pedestal","suporte para tv","suporte de tv","armario","prateleira","embalagem","saco","sabao","detergente","limpa forno","limpador","desengordurante","amaciante","lava roupas em po","refil","filtro refil","unidade filtrante","disco abrasivo","manta abrasiva","brinquedo","miniatura","cooler","gabinete","nobreak","no-break","split bolt","conector","gas refrigerante","pecas e acessorios","placa eletronica","compressor","separador de oleo","resfriador de liquido","condensador","termometro","isqueiro","acendedor","garrafa plastica","pote plastico","suporte dispenser","escova","carrinho","carro material","caldeirao","panela","copos","jogo 12","playground","tarol","caixa de guerra","camera de","locacao de container","contratacao de empresa","sala para velorio","sucata","mufla","calorimetro","manta aquecedora","niple","kit registro","kit de limpeza","conjunto para limpeza","descascador giratorio","turbilhao","dispenser","coletor lixo","martelo","adubo","inseminacao","coador de pano","filtro ar condicionado","controle de ventilador","botijao de gas","pano multiuso","veicul","ambulanci","cabine",
// acrescentados em 30/08/2026
"torneira de parede","torneira para pia","tubo de ferro","tubo de cobre","tubo cobre","pecas /","pecas/","para pedreiro","suporte para televis","suporte de televis","suporte de videocassete","embalag","espaco destinado","onibus","caminhao","impressao 3d","sem funcionamento","quarto de hotel","diaria","estadia","hospedagem","locacao de","prestacao de","autoclave","concentrador de","tampao","projetor","resistencia aquecedor","luva termica","frigideira","prato fundo","alicate","removedor de","coador pano","ralador/fatiador","carro balde","chave controle","elemento filtrante","filtro purificacao","liner","projeto executivo","fantasia","formula infantil","nutricao oral","nutricao geral","placa aquecedora","boia para","controle universal","controle remoto universal"];

const RE_VAN = new RegExp('(^|[^a-z])vans?([^a-z]|$)');

// ---------------------------------------------------------------- utilidades
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
const limpa = s => String(s ?? '').replace(/\s+/g, ' ').trim();

// O PNCP derruba conexoes (ECONNRESET) acima de ~6 requisicoes simultaneas.
// Concorrencia baixa + backoff exponencial mantem a varredura em 0 erros.
async function getJson(url, tent = 7) {
  for (let i = 0; i < tent; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (i === tent - 1) throw e;
      await new Promise(res => setTimeout(res, 500 * Math.pow(2, i) + Math.random() * 300));
    }
  }
}

async function pool(itens, n, fn) {
  let i = 0, feitos = 0;
  const worker = async () => {
    while (i < itens.length) {
      const k = i++;
      await fn(itens[k], k);
      if (++feitos % 200 === 0) process.stderr.write(`  ${feitos}/${itens.length}\n`);
    }
  };
  await Promise.all(Array.from({ length: n }, worker));
}

// ---------------------------------------------------------------- 1. buscas
const res = new Map();
let errBusca = 0;
const jobs = [];
for (const t of TERMOS) for (const u of UFS) for (const p of [1, 2]) jobs.push([t, u, p]);

process.stderr.write(`Buscas: ${jobs.length} consultas\n`);
const buscaUrl = ([t, u, p]) => `https://pncp.gov.br/api/search/?q=${encodeURIComponent(t)}&tipos_documento=edital&ordenacao=-data&pagina=${p}&tam_pagina=50&status=recebendo_proposta&ufs=${u}`;
let falhas = [];
await pool(jobs, 6, async (j) => {
  try {
    const d = await getJson(buscaUrl(j));
    for (const it of (d.items || [])) res.set(it.numero_controle_pncp, it);
  } catch { falhas.push(j); }
});
if (falhas.length) {
  process.stderr.write(`  repescagem de ${falhas.length} consultas\n`);
  const resto = falhas; falhas = [];
  await pool(resto, 2, async (j) => {
    try {
      const d = await getJson(buscaUrl(j));
      for (const it of (d.items || [])) res.set(it.numero_controle_pncp, it);
    } catch { falhas.push(j); }
  });
}
errBusca = falhas.length;
process.stderr.write(`  ${res.size} editais unicos, ${errBusca} erros\n`);

// ------------------------------------------- 2. veto por objeto + data valida
const hoje = new Date();
const cands = [];
let vObj = 0, vData = 0, vMod = 0;
const porModalidade = {};
for (const o of res.values()) {
  const mod = Number(o.modalidade_licitacao_id);
  if (!(MOD_OK.has(mod) || (mod === MOD_PRESENCIAL && UF_PRESENCIAL.has(o.uf)))) {
    vMod++;
    const nome = o.modalidade_licitacao_nome || String(mod);
    porModalidade[nome] = (porModalidade[nome] || 0) + 1;
    continue;
  }
  const f = o.data_fim_vigencia;
  const dt = f ? new Date(f) : null;
  if (!dt || isNaN(dt) || dt < hoje || dt.getFullYear() > 2030) { vData++; continue; }
  const txt = norm((o.description || '') + ' ' + (o.title || ''));
  if (VETO_OBJ.some(v => txt.includes(v)) || RE_VAN.test(txt)) { vObj++; continue; }
  cands.push(o);
}
process.stderr.write(`Candidatos: ${cands.length} (modalidade ${vMod}, objeto ${vObj}, data ${vData})
`);
process.stderr.write(`  por modalidade descartada: ${JSON.stringify(porModalidade)}
`);

// ---------------------------------------------------------------- 3. itens
let errItens = 0;
process.stderr.write(`Itens: ${cands.length} leituras\n`);
const itensUrl = o => `https://pncp.gov.br/api/pncp/v1/orgaos/${o.orgao_cnpj}/compras/${o.ano}/${o.numero_sequencial}/itens?pagina=1&tamanhoPagina=300`;
await pool(cands, 6, async (o) => {
  try {
    const j = await getJson(itensUrl(o));
    o.__it = (Array.isArray(j) ? j : []).map(x => ({ d: x.descricao, m: x.materialOuServico, q: x.quantidade, v: x.valorUnitarioEstimado }));
  } catch { o.__it = null; }
});
const semItens = cands.filter(o => o.__it === null || o.__it === undefined);
if (semItens.length) {
  process.stderr.write(`  repescagem de ${semItens.length} leituras\n`);
  await pool(semItens, 2, async (o) => {
    try {
      const j = await getJson(itensUrl(o));
      o.__it = (Array.isArray(j) ? j : []).map(x => ({ d: x.descricao, m: x.materialOuServico, q: x.quantidade, v: x.valorUnitarioEstimado }));
    } catch { o.__it = null; }
  });
}
errItens = cands.filter(o => !o.__it).length;
process.stderr.write(`  ${errItens} erros\n`);

// ------------------------------------------------- 4. cinco filtros + dedupe
const classifica = d => { for (const [c, ts] of CAT) for (const t of ts) if (d.includes(t)) return c; return null; };
const temVeto = d => VETO_ITEM.some(v => d.includes(v)) || RE_VAN.test(d);

const st = { objServ: 0, itemServ: 0, semItem: 0, ok: 0 };
const bruto = [];
for (const o of cands) {
  const obj = norm((o.description || '') + ' ' + (o.title || ''));
  if (SERV_OBJ.some(v => obj.includes(v))) { st.objServ++; continue; }

  const interesse = [];
  let servico = false;
  for (const it of (o.__it || [])) {
    const d = norm(it.d);
    const cat = classifica(d);
    if (!cat) continue;
    if (it.m !== 'M' || SERV_ITEM.some(v => d.includes(v))) { servico = true; break; }
    interesse.push([cat, it, d]);
  }
  if (servico) { st.itemServ++; continue; }

  const keep = [];
  for (const [cat, it, d] of interesse) {
    if (temVeto(d)) continue;
    const v = +it.v || 0;
    if (v > 0 && v < PISO[cat]) continue;
    keep.push([cat, Math.round(+it.q || 0), Math.round(v * 100) / 100, limpa(it.d)]);
  }
  if (!keep.length) { st.semItem++; continue; }

  const qtd = keep.reduce((s, x) => s + x[1], 0);
  const val = Math.round(keep.reduce((s, x) => s + x[1] * x[2], 0));
  bruto.push({
    mun: limpa(o.municipio_nome), uf: o.uf, org: limpa(o.orgao_nome), ed: limpa(o.title),
    fecha: o.data_fim_vigencia, qtd, val,
    path: `${o.orgao_cnpj}/${o.ano}/${o.numero_sequencial}`, it: keep,
  });
  st.ok++;
}

// 5.5 — duplicatas: mesmo municipio+uf+dia de encerramento+quantidade+valor.
// Usa o DIA e nao o horario exato: o mesmo edital republicado sai com alguns
// minutos de diferenca (ex. 12:30 e 13:01) e escapava do agrupamento.
const grupo = new Map();
for (const e of bruto) {
  const k = `${e.mun}|${e.uf}|${e.fecha.slice(0, 10)}|${e.qtd}|${e.val}`;
  const a = grupo.get(k);
  if (!a) grupo.set(k, e);
  else if (e.fecha < a.fecha || (e.fecha === a.fecha && +e.path.split('/')[2] < +a.path.split('/')[2])) grupo.set(k, e);
}
const fin = [...grupo.values()].sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.mun < b.mun ? -1 : 1));

st.dup = bruto.length - fin.length;
st.final = fin.length;
st.porUf = {};
for (const e of fin) st.porUf[e.uf] = (st.porUf[e.uf] || 0) + 1;

// ---------------------------------------------------------------- 5. saidas
const hojeISO = new Date().toISOString().slice(0, 10);
const resumo = { consultas: jobs.length, errBusca, unicos: res.size, vMod, porModalidade, vObj, vData, candidatos: cands.length, errItens, ...st };
const bruta = { st: resumo, editais: fin };

// A saida bruta nao vai para o git (uns 320 KB por dia). O que o site consome
// eh docs/dados.json, gerado pelo publicar.mjs a partir de dados/ultima.json.
const saida = path.join(DIR, 'dados');
fs.mkdirSync(saida, { recursive: true });
fs.writeFileSync(path.join(saida, 'dados-' + hojeISO + '.json'), JSON.stringify(bruta), 'utf8');
fs.writeFileSync(path.join(saida, 'ultima.json'), JSON.stringify(bruta), 'utf8');

console.log(JSON.stringify(resumo, null, 1));
