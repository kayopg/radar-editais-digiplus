// Radar de Editais Digiplus — varredura do PNCP e geração dos dados do artifact.
// Uso: node varredura.mjs            -> grava dados-YYYY-MM-DD.json e imprime as estatísticas
// Requer Node 18+ (fetch global). Roda direto na máquina; não precisa do navegador.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath e nao o pathname cru: o import.meta.url vem percent-encoded,
// entao uma pasta de usuario com acento no nome virava Usu%C3%A1rio e o
// require nao achava nada. So aparece fora do Actions, onde o caminho e ASCII.
const DIR = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- parâmetros
// Termos de busca. Os 32 primeiros sao os originais; os 8 do fim entraram em
// 01/09/2026, da lista de produtos que a Digiplus de fato trabalha. Tres deles
// — ventilador, aquecedor de agua e purificador de ar — ja tinham categoria mas
// nao eram BUSCADOS: so apareciam de carona quando o edital tambem citava um
// termo antigo, entao edital so de ventilador nunca era encontrado.
const TERMOS = ["eletrodomesticos","eletroportateis","refrigerador","geladeira","freezer","frigobar","fogao industrial","fogao","forno industrial","forno eletrico","microondas","cooktop","liquidificador industrial","liquidificador","batedeira planetaria","cafeteira","chaleira eletrica","fritadeira","lavadora de roupas","maquina de lavar roupas","secadora de roupas","bebedouro","purificador de agua","camara fria","expositor refrigerado","ar condicionado","climatizador","cortina de ar","equipamentos de cozinha","aspirador de po",
// acrescentados em 01/09/2026
"ventilador","purificador de ar","gerador de energia","aquecedor de agua","refresqueira","balcao termico","buffet termico","cafeteira expresso",
// segunda leva da lista da Digiplus, 01/09/2026. "coifa" e "exaustor" voltam:
// tinham saido nesta mesma data, antes de a coifa industrial ser confirmada.
"coifa","exaustor","balanca","lousa digital","geladeira industrial","climatizador industrial"];
const UFS = ["PR","RS","SP","MG","GO","MT","MS","SC"];

const CAT = [
  ["RF",["refrigerador","geladeira","frigobar","freezer","congelador","conservadora","camara fria","camara frigorifica","expositor refrigerado","balcao refrigerado","cervejeira","resfriador"]],
  ["BB",["bebedouro","purificador de agua","refresqueira","suqueira","refresqueira industrial"]],
  ["CC",["fogao","forno","microondas","micro-ondas","micro ondas","cooktop","fritadeira","salamandra","char broiler","charbroiler","caldeirao","panela eletrica","churrasqueira","balcao termico","buffet termico","banho maria","banho-maria","estufa para salgados","pista termica"]],
  ["PR",["liquidificador","batedeira","processador de alimentos","multiprocessador","espremedor","moedor","cortador de frios","fatiador","descascador","masseira","amassadeira"]],
  // O aspirador da Digiplus e o de po E AGUA, e o PNCP escreve de varios jeitos:
  // "aspirador de po e agua", "aspirador po/liquido", "aspirador de po/agua".
  // So "aspirador de po" nao pega as duas ultimas, que nao tem o "de".
  ["EP",["cafeteira","chaleira","sanduicheira","torradeira","air fryer","airfryer","aspirador de po","aspirador po","aspirador de agua","aspirador agua","grill eletrico"]],
  ["LV",["lavadora de roupa","maquina de lavar","secadora","centrifuga de roupa","calandra","tanquinho","lava-loucas","lava loucas","lavadora extratora"]],
  ["CL",["ar-condicionado","ar condicionado","arcondicionado","condicionador de ar","split","climatizador","cortina de ar","ventilador","desumidificador","umidificador","purificador de ar"]],
  // CX voltou em 01/09/2026: saiu de manha, quando "coifas" entrou na lista de
  // retirar, e voltou de tarde com "coifa industrial" e "exaustores".
  ["CX",["coifa","coifa industrial","depurador","exaustor","exaustor industrial","coifa de parede","coifa central"]],
  ["BL",["balanca","balanca comercial","balanca industrial","balanca digital","balanca de plataforma","balanca eletronica"]],
  ["LD",["lousa digital","lousa interativa","lousa eletronica","quadro interativo","painel interativo","tela interativa"]],
  // GE entrou em 01/09/2026: gerador nao e climatizacao nem cozinha, e virava
  // "Outros" — categoria que a pagina mostra como se fosse sobra.
  ["GE",["gerador de energia","gerador a diesel","gerador a gasolina","grupo gerador","motogerador"]],
  ["AQ",["aquecedor de agua","aquecedor a gas","aquecedor eletrico","boiler","aquecedor de passagem","aquecedor solar"]],
  ["OT",["enceradeira","aquecedor"]],
];

// 5.4 - piso por PRODUTO, unico para todas as categorias (decisao do usuario em
// 31/08/2026). Antes havia nove pisos por categoria, e o de Climatizacao (R$ 400)
// fora calibrado para ar-condicionado: derrubava ventilador de verdade junto -
// "Ventilador de coluna, 20 un, R$ 244,59" no edital 163/2026 de Gravatai/RS.
// Quem decide se o edital vale a viagem e o PISO_EDITAL, nao este.
const PISO_ITEM = 150;

// 5.6 - piso do edital inteiro. Compra de troco (uma chaleira, um liquidificador)
// nao vale a viagem. Valor ZERO e orcamento sigiloso e fica: nao se sabe o tamanho,
// e pode ser grande (decisao do usuario em 31/08/2026).
const PISO_EDITAL = 4000;

// 5.0 — modalidade. Ids conferidos na API em 31/08/2026:
//   1 Leilao-Eletronico | 4 Concorrencia-Eletronica | 6 Pregao-Eletronico
//   7 Pregao-Presencial | 8 Dispensa | 12 Credenciamento | 13 Leilao-Presencial
// Fora da lista some tudo: leilao (que trazia veiculo sucateado), credenciamento
// e concorrencia. O PNCP nao separa dispensa eletronica de presencial: id 8 e uma so.
const MOD_OK = new Set([6, 8]);
const MOD_PRESENCIAL = 7;
const UF_PRESENCIAL = new Set(['RS', 'SC']);   // pregao presencial so nesses dois

// 5.0b — tipo de orgao. Regra: tudo que e do municipio (prefeitura, camara,
// fundo, autarquia) mais instituicoes de ensino e de saude de qualquer esfera.
// O campo esfera_nome do PNCP resolve o municipio inteiro sem depender do nome;
// para estadual/federal a classificacao e por nome do orgao + da unidade.
const ENSINO = ['universidade','faculdade','instituto federal','centro universitario',
  'escola','colegio','cefet','educacao','educacional','ensino','campus','fundepar'];
const SAUDE = ['hospital','saude','santa casa','hemocentro','hemonucleo','maternidade',
  'pronto socorro','pronto-socorro','odontoclinica','ezequiel dias'];
// Militar e policia saem mesmo quando o nome casaria com saude (decisao do usuario
// em 31/08/2026: hospital militar tambem fica de fora).
const VETO_ORGAO = ['comando do exercito','comando da marinha','comando da aeronautica',
  'exercito brasileiro','ministerio da defesa','policia militar','policia civil',
  'policia rodoviaria','corpo de bombeiros','batalhao','quartel','hospital militar'];

function orgaoOk(o) {
  const txt = norm((o.orgao_nome || '') + ' ' + (o.unidade_nome || ''));
  if (VETO_ORGAO.some(v => txt.includes(v))) return false;
  if (norm(o.esfera_nome) === 'municipal') return true;            // prefeitura, camara, autarquia
  return ENSINO.some(v => txt.includes(v)) || SAUDE.some(v => txt.includes(v));
}


// 5.1 — serviço no item
const SERV_ITEM = ["instalacao","montagem","manutencao","higienizacao","desinstalacao","recarga de gas","limpeza de ar","mao de obra","servicos de"];
// 5.1 — serviço no objeto do edital (mais estreito: "manutenção das atividades" é praxe e não é serviço)
const SERV_OBJ = ["instalacao","montagem","mao de obra"];

// 5.2 — veto por objeto
const VETO_OBJ = ["veiculo","picape","caminhao","onibus","ambulancia","motociclet","automov","trator","maquinas agricolas","brinquedo","material de construcao","processamento de dados","formulas aliment","dieta enteral","generos aliment","material de limpeza","higiene e limpeza","sucata","velorio","tecidos aviamento"];

// 5.3 — veto por item (lista viva, construída de falsos positivos reais)
const VETO_ITEM = ["ventilador mecanic","ventilador pulmon","ventilacao mecanic","fisioterapia","ultrassom","cpap","bipap","trator","agricol","retroescav","colheitadeira","em mdf","de mdf","suporte para tv","suporte de tv","pedestal para","suporte pedestal","armario","prateleira","embalagem","saco","sabao","detergente","limpa forno","limpador","desengordurante","amaciante","lava roupas em po","refil","filtro refil","unidade filtrante","disco abrasivo","manta abrasiva","brinquedo","miniatura","cooler","gabinete","nobreak","no-break","split bolt","conector","gas refrigerante","pecas e acessorios","placa eletronica","compressor","separador de oleo","resfriador de liquido","condensador","termometro","isqueiro","acendedor","garrafa plastica","pote plastico","suporte dispenser","escova","carrinho","carro material","caldeirao","panela","copos","jogo 12","playground","tarol","caixa de guerra","camera de","locacao de container","contratacao de empresa","sala para velorio","sucata","mufla","calorimetro","manta aquecedora","niple","kit registro","kit de limpeza","conjunto para limpeza","descascador giratorio","turbilhao","dispenser","coletor lixo","martelo","adubo","inseminacao","coador de pano","filtro ar condicionado","controle de ventilador","botijao de gas","pano multiuso","veicul","ambulanci","cabine",
// acrescentados em 30/08/2026
"torneira de parede","torneira para pia","tubo de ferro","tubo de cobre","tubo cobre","pecas /","pecas/","para pedreiro","suporte para televis","suporte de televis","suporte de videocassete","embalag","espaco destinado","onibus","caminhao","impressao 3d","sem funcionamento","quarto de hotel","diaria","estadia","hospedagem","locacao de","prestacao de","autoclave","concentrador de","tampao","projetor","resistencia aquecedor","luva termica","frigideira","prato fundo","alicate","removedor de","coador pano","ralador/fatiador","carro balde","chave controle","elemento filtrante","filtro purificacao","liner","projeto executivo","fantasia","formula infantil","nutricao oral","nutricao geral","placa aquecedora","boia para","controle universal","controle remoto universal",
// acrescentados em 01/09/2026. Tres mecanismos distintos, todos medidos na
// varredura de 31/08:
//   - hardware de PC casando com Climatizacao porque a descricao cita o
//     ventilador da propria peca: fonte ATX em Guaporema/PR e placa de video
//     em Mario Campos/MG. O "cooler" e o "gabinete" que ja estavam na lista
//     nao pegam nenhum dos dois.
//   - filtro de ar de maquina pesada (pa carregadeira, escavadeira, rolo
//     compactador) em Terra Boa/PR: casa com "ar condicionado", e o veto que
//     ja existia, "filtro ar condicionado", nao tem o "de".
//   - peca de vestuario cuja etiqueta manda lavar a maquina, o que casa com
//     Lavanderia: jaqueta de nylon em Assis Chateaubriand/PR.
// "esteira para" e estreito de proposito: a esteira de pao frances e acessorio,
// mas "forno turbo 10 esteiras" e forno de verdade, de R$ 7 a 9 mil.
"filtro de ar","escavadeira","carregadeira","rolo compactador","jaqueta",
"esteira para","placa de video","placa-mae","pci-e","para computador","atx"];

const RE_VAN = new RegExp('(^|[^a-z])vans?([^a-z]|$)');

// 5.3b - refrigeracao cientifica/hospitalar (decisao do usuario em 31/08/2026).
// Camara de vacina, refrigerador de imunobiologicos e freezer de hemocomponentes
// sao outro mercado - Indrel, Fanem, Nova Etica - com registro na Anvisa e faixa
// de temperatura controlada, nao linha branca.
//
// So vale para itens de REFRIGERACAO, e isso e proposital: 'laboratori' solto
// derrubaria "Aspirador Po/Liquido, potencia 1.200, aplicacao: laboratorio"
// (Rio Verde/GO), que e produto legitimo. Escopar na categoria resolve sem
// precisar adivinhar o contexto pelo texto.
const VETO_RF_CIENT = ['imunobiolog','termolab','hemocompon','laboratori','vacina'];

// 5.3d - balanca medica e de laboratorio (01/09/2026). "balanca" entrou como
// termo e trouxe 143 itens, dos quais 95 sao de outro mercado: antropometrica
// (pediatrica, para obeso, de bioimpedancia), analitica de laboratorio com
// resolucao de 0,0001 g, e ate uma cama hospitalar e uma mesa de apoio para
// balanca. Sobram 48, que sao as comerciais e industriais: cozinha, plataforma,
// eletronica digital.
//
// Escopado em BL, como o VETO_RF_CIENT e em RF: "paciente" e "corporal" soltos
// derrubariam item legitimo de outra categoria. "antopometr" nao e erro meu, e
// como o orgao escreveu ("BALANCA ANTOPOMETRICA ADULTO"). E o veto e por
// PRODUTO, nao pela palavra: "balanca precisao" veta a balanca de precisao, mas
// "precisao minima de 5 g" na balanca comercial de 15 kg continua passando.
const VETO_BL_MEDICA = ['antropometr','antopometr','pediatric','pediatri','bioimpedanc',
  'biompedanc','pesar pessoas','obeso','paciente','corporal','balanca analitica',
  'analitica de precisao','balanca precisao','balanca de precisao','cama hospitalar',
  'mesa auxiliadora','tipo balanca','paleteira','pilha tipo bateria'];

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
let vObj = 0, vData = 0, vMod = 0, vOrgao = 0;
const porModalidade = {};
for (const o of res.values()) {
  const mod = Number(o.modalidade_licitacao_id);
  if (!(MOD_OK.has(mod) || (mod === MOD_PRESENCIAL && UF_PRESENCIAL.has(o.uf)))) {
    vMod++;
    const nome = o.modalidade_licitacao_nome || String(mod);
    porModalidade[nome] = (porModalidade[nome] || 0) + 1;
    continue;
  }
  if (!orgaoOk(o)) { vOrgao++; continue; }

  const f = o.data_fim_vigencia;
  const dt = f ? new Date(f) : null;
  if (!dt || isNaN(dt) || dt < hoje || dt.getFullYear() > 2030) { vData++; continue; }
  const txt = norm((o.description || '') + ' ' + (o.title || ''));
  if (VETO_OBJ.some(v => txt.includes(v)) || RE_VAN.test(txt)) { vObj++; continue; }
  cands.push(o);
}
console.error("Candidatos: " + cands.length + " (modalidade " + vMod + ", orgao " + vOrgao + ", objeto " + vObj + ", data " + vData + ")");
console.error("  descartes por modalidade: " + JSON.stringify(porModalidade));

// ---------------------------------------------------------------- 3. itens
let errItens = 0;
process.stderr.write(`Itens: ${cands.length} leituras\n`);
const itensUrl = o => `https://pncp.gov.br/api/pncp/v1/orgaos/${o.orgao_cnpj}/compras/${o.ano}/${o.numero_sequencial}/itens?pagina=1&tamanhoPagina=300`;
await pool(cands, 6, async (o) => {
  try {
    const j = await getJson(itensUrl(o));
    o.__it = (Array.isArray(j) ? j : []).map(x => ({ d: x.descricao, m: x.materialOuServico, q: x.quantidade, v: x.valorUnitarioEstimado, u: x.unidadeMedida, n: x.numeroItem }));
  } catch { o.__it = null; }
});
const semItens = cands.filter(o => o.__it === null || o.__it === undefined);
if (semItens.length) {
  process.stderr.write(`  repescagem de ${semItens.length} leituras\n`);
  await pool(semItens, 2, async (o) => {
    try {
      const j = await getJson(itensUrl(o));
      o.__it = (Array.isArray(j) ? j : []).map(x => ({ d: x.descricao, m: x.materialOuServico, q: x.quantidade, v: x.valorUnitarioEstimado, u: x.unidadeMedida, n: x.numeroItem }));
    } catch { o.__it = null; }
  });
}
errItens = cands.filter(o => !o.__it).length;
process.stderr.write(`  ${errItens} erros\n`);

// ------------------------------------------------- 4. cinco filtros + dedupe
const classifica = d => { for (const [c, ts] of CAT) for (const t of ts) if (d.includes(t)) return c; return null; };
// 5.3c - "projetor" veta projetor de video avulso, que nao e produto da casa,
// mas lousa digital costuma ser descrita "com projetor integrado" e seria
// derrubada junto. Escopar o veto para fora da categoria LD resolve sem ter de
// adivinhar o contexto pelo texto — mesmo recurso do VETO_RF_CIENT.
const VETO_FORA_DE = { projetor: 'LD' };
const temVeto = (d, cat) => VETO_ITEM.some(v =>
  (VETO_FORA_DE[v] !== cat) && d.includes(v)) || RE_VAN.test(d);

let vPiso = 0, vCient = 0, vBalanca = 0;
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
    if (temVeto(d, cat)) continue;
    if (cat === 'RF' && VETO_RF_CIENT.some(v => d.includes(v))) { vCient++; continue; }
    if (cat === 'BL' && VETO_BL_MEDICA.some(v => d.includes(v))) { vBalanca++; continue; }
    const v = +it.v || 0;
    if (v > 0 && v < PISO_ITEM) continue;
    // Posicoes 0-3 sao as antigas; 4 e 5 vieram com o resumo mais completo
    // (01/09/2026). Acrescente sempre no fim: a pagina le por indice.
    keep.push([cat, Math.round(+it.q || 0), Math.round(v * 100) / 100, limpa(it.d),
               limpa(it.u), +it.n || 0]);
  }
  if (!keep.length) { st.semItem++; continue; }

  const qtd = keep.reduce((s, x) => s + x[1], 0);
  const val = Math.round(keep.reduce((s, x) => s + x[1] * x[2], 0));
  if (val > 0 && val <= PISO_EDITAL) { vPiso++; continue; }
  bruto.push({
    mun: limpa(o.municipio_nome), uf: o.uf, org: limpa(o.orgao_nome), ed: limpa(o.title),
    // cabecalho padrao do edital: objeto e o que faltava, e e o campo mais importante
    obj: limpa(o.description), uni: limpa(o.unidade_nome),
    mod: limpa(o.modalidade_licitacao_nome), pub: o.data_publicacao_pncp || null,
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


// ------------------------------------------------ 4b. arquivo oficial do edital
// O antigo botao apontava sempre para arquivos/1, e isso estava errado duas vezes:
// o arquivo 1 costuma ser "Pedido de compra" ou "ETP" (em Carlos Barbosa/RS o edital
// era o arquivo 7), e em alguns orgaos os sequenciais nem comecam em 1.
//
// O formato tambem nao da para adivinhar pelo titulo da listagem: 7 de cada 8 titulos
// sem extensao eram PDF assim mesmo. Quem sabe a verdade e o Content-Disposition, que
// um HEAD entrega sem baixar o arquivo.
const ehEdital = a => {
  const s = norm(a.tipoDocumentoNome || '');
  return s.includes('edital') || s.includes('aviso de contratacao');
};

function extDe(nome) {
  const n = String(nome || '').toLowerCase().split('?')[0].trim();
  const p = n.lastIndexOf('.');
  if (p < 0 || p === n.length - 1) return '';
  const e = n.slice(p + 1);
  return e.length <= 5 ? e : '';
}

function nomeDoCd(cd) {
  const s = String(cd || '');
  const i = s.indexOf('filename="');
  if (i < 0) return '';
  const j = s.indexOf('"', i + 10);
  return j < 0 ? '' : s.slice(i + 10, j);
}

function melhorArquivo(lista) {
  if (!Array.isArray(lista) || !lista.length) return null;
  return lista.find(a => ehEdital(a) && extDe(a.titulo) === 'pdf')
      || lista.find(a => ehEdital(a))
      || lista.find(a => extDe(a.titulo) === 'pdf')
      || lista[0];
}

process.stderr.write('Arquivos: ' + fin.length + ' listagens\n');
let errArq = 0;
await pool(fin, 6, async (e) => {
  const [cnpj, ano, seq] = e.path.split('/');
  const base = `https://pncp.gov.br/pncp-api/v1/orgaos/${cnpj}/compras/${ano}/${seq}/arquivos`;
  try {
    const lista = await getJson(`https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/arquivos`);
    const a = melhorArquivo(lista);
    if (!a) return;
    e.arq = a.sequencialDocumento;
    e.arqExt = extDe(a.titulo);
    try {
      const h = await fetch(`${base}/${a.sequencialDocumento}`, { method: 'HEAD' });
      if (h.ok) {
        const real = extDe(nomeDoCd(h.headers.get('content-disposition')));
        if (real) e.arqExt = real;
      }
    } catch { /* fica a extensao do titulo, se houver */ }
  } catch { errArq++; }
});
process.stderr.write('  ' + errArq + ' erros\n');

// ---------------------------------------------------------------- 5. saidas
// Data em America/Sao_Paulo, nao em UTC: rodando de noite no Brasil o toISOString
// ja virou o dia e a varredura saia carimbada com a data de amanha.
const hojeISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const resumo = { consultas: jobs.length, errBusca, unicos: res.size, vMod, porModalidade, vOrgao, vCient, vBalanca, vPiso, vObj, vData, candidatos: cands.length, errItens, ...st };
const bruta = { st: resumo, editais: fin };

// A saida bruta nao vai para o git (uns 320 KB por dia). O que o site consome
// eh docs/dados.json, gerado pelo publicar.mjs a partir de dados/ultima.json.
const saida = path.join(DIR, 'dados');
fs.mkdirSync(saida, { recursive: true });
fs.writeFileSync(path.join(saida, 'dados-' + hojeISO + '.json'), JSON.stringify(bruta), 'utf8');
fs.writeFileSync(path.join(saida, 'ultima.json'), JSON.stringify(bruta), 'utf8');

console.log(JSON.stringify(resumo, null, 1));
