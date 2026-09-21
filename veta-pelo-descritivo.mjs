// Tira do radar o item que o TERMO DE REFERENCIA mostra ser de outro mercado,
// mesmo quando o catalogo do PNCP o descreve como produto da casa.
//
// Os vetos do varredura.mjs leem so a descricao do PNCP, e ela e generica: o
// item 2 de Bela Vista do Paraiso/PR e "Balanca Eletronica capacidade pesagem:
// 200, ... tipo: plataforma com coluna" no catalogo e "Balanca eletronica
// digital adulta com regua antropometrica" no edital. A balanca de pesar gente
// ja era veto por decisao do usuario (01/09/2026) — so nao dava para ve-la antes
// do descritivo. Na revisao item a item de 16/09/2026 foram assim: balancas
// antropometricas (Bela Vista do Paraiso/PR, Vicosa/MG) e semi-analitica (UFSM),
// refrigerador de termolabeis de laboratorio (UFSC), purificador de osmose
// reversa laboratorial (UFSC), banho-maria de laboratorio e exaustor de fumaca
// de solda (UFSM).
//
// Roda depois do descritivo-por-item.mjs. Recalcula quantidade e valor do
// edital pela mesma conta do varredura.mjs e tira o edital que fica sem item
// ou abaixo do piso.
//
// Uso: node veta-pelo-descritivo.mjs [--mostra]   (--mostra so lista, nao grava)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criaVetoItem, criaPosicaoDoTermo } from './veto-item.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const arqDados = path.join(DIR, 'docs', 'dados.json');
const dados = JSON.parse(fs.readFileSync(arqDados, 'utf8'));
const desc = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'descritivos.json'), 'utf8'));
const C = dados.colunas.reduce((o, n, i) => (o[n] = i, o), {});

// As listas por categoria e o piso do edital vem do proprio varredura.mjs, lidos
// do arquivo: duas copias divergiriam (mesmo recurso do audita-itens.mjs).
const fonte = fs.readFileSync(path.join(DIR, 'varredura.mjs'), 'utf8');
const lista = nome => {
  const i = fonte.indexOf('const ' + nome + ' = [');
  return eval(fonte.slice(fonte.indexOf('[', i), fonte.indexOf('];', i) + 1));
};
const PISO_EDITAL = Number((fonte.match(/const PISO_EDITAL = (\d+)/) || [])[1]) || 4000;

// Por categoria, como no varredura.mjs: "paciente" solto derrubaria item de
// outra categoria. A lista geral do varredura (VETO_ITEM) NAO entra aqui: foi
// feita para a descricao curta do catalogo, e no texto do edital "prateleira",
// "compressor" e "condensador" sao parte da geladeira e do ar-condicionado.
const VETO = {
  BL: lista('VETO_BL_MEDICA'),
  RF: ['imunobiolog', 'termolab', 'hemocompon', 'vacina'],
  CC: ['banho maria de laboratorio', 'banho-maria de laboratorio', 'aplicacoes laboratoriais', 'uso laboratorial', 'pid fuzzy'],
  BB: ['laboratorial'],
  CX: ['soldagem', 'fumaca de bancada'],
  // lavanderia hospitalar (Sonora/MS, 21/09/2026)
  LV: ['hospitalar', 'barreira sanitaria'],
  // Em qualquer categoria: o item 16 da EBSERH Santa Maria/RS e "Ventilador
  // tipo: parede, potencia motor: 500" no catalogo e "Longarina de espera com
  // 03 (tres) lugares de assento" no anexo de descricao detalhada (18/09/2026).
  TODAS: ['longarina de espera'],
};

// E as listas do catalogo, sobre a descricao do PNCP, do mesmo jeito que o
// varredura.mjs as aplica: termo novo entra no dados.json ja publicado sem
// esperar a proxima varredura.
const VETO_ITEM = lista('VETO_ITEM'), VETO_RF_CIENT = lista('VETO_RF_CIENT'), VETO_BL_MEDICA = lista('VETO_BL_MEDICA');
const RE_VAN = /(^|[^a-z])vans?([^a-z]|$)/;       // o mesmo do varredura.mjs
const VETO_FORA_DE = { projetor: 'LD' };           // idem
// A tabela de categorias e o limite de posicao do termo, tambem do varredura.mjs:
// a categoria e a do termo que aparece primeiro, e termo muito para o fim da
// descricao nao e o produto (ver TERMO_LONGE la).
const blocoCat = fonte.slice(fonte.indexOf('const CAT = ['), fonte.indexOf('\n];', fonte.indexOf('const CAT = [')) + 3);
const CAT = eval(blocoCat.replace('const CAT = ', ''));
const TERMO_LONGE = Number((fonte.match(/const TERMO_LONGE = (\d+)/) || [])[1]) || 400;
// o termo citado como uso de outro produto nao conta (ver veto-item.mjs)
const termoMaisCedo = criaPosicaoDoTermo(CAT);
// o veto por item com a mesma regra do varredura.mjs: termo de peca so conta
// quando vem antes do produto (ver veto-item.mjs)
const vetoItem = criaVetoItem({ VETO_ITEM, VETO_SO_NA_FRENTE: lista('VETO_SO_NA_FRENTE'), VETO_FORA_DE, RE_VAN, posicaoDoTermo: termoMaisCedo });
const vetoDoCatalogo = (d, cat) => ((termoMaisCedo(d) || { i: 0 }).i > TERMO_LONGE && 'termo da categoria so no fim da descricao')
  || vetoItem(d, cat)
  || (cat === 'RF' && VETO_RF_CIENT.find(v => d.includes(v)))
  || (cat === 'BL' && VETO_BL_MEDICA.find(v => d.includes(v)));

// Aparelho que o edital manda entregar instalado sai, menos no RS e em SC, onde a
// Digiplus instala (decisao do usuario, 17/09/2026; o lado do catalogo esta no
// 5.1b do varredura.mjs). So frase que OBRIGA: "acessorios necessarios para
// instalacao", "facil instalacao", "instalacao em parede", "kit de instalacao" e
// "sem instalacao" descrevem o produto e ficam. Casos de 17/09: Palmeiras de
// Goias/GO ("deverao ser entregues instalados e em perfeito funcionamento"),
// Mariopolis/PR ("devidamente instalado, no local de entrega") e Santa Rita do
// Passa Quatro/SP (BEC: "treinamento, instalacao e assistencia tecnica").
const UF_INSTALA = new Set(['RS', 'SC']);
const EXIGE_INSTALACAO = [
  /entregues? (devidamente )?instalad[oa]s?/,
  /devidamente instalad[oa]s?/,
  /instalad[oa]s? e em (perfeito )?funcionamento/,
  /fornecimento e instalacao/,
  /instalacao (inclusa|incluida|inclusive)/,
  /(incluindo|inclusa|incluida|inclusive) (a )?instalacao/,
  /instalacao e assistencia tecnica/,
  // "com mao de obra de instalacao e drenos" (Sertanopolis/PR, 21/09/2026)
  /(mao de obra|servicos?) de (instalacao|montagem)/,
  /instalacao (sera |fica |ficara )?(por conta|a cargo|sob responsabilidade|de responsabilidade) d[ao] (contratad|fornecedor|licitante|empresa)/,
];
const exigeInstalacao = d => (EXIGE_INSTALACAO.find(r => r.test(d)) || '') && 'entrega instalada';

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
const mostra = process.argv.includes('--mostra');

// Editais conferidos a mao que exigem o que a Digiplus nao atende (amostra,
// garantia contratual...), quando a varredura nao leu o arquivo: ver
// editais-fora.json. Sem a lista aqui, voltariam na varredura do dia seguinte.
let fora = {};
try { fora = JSON.parse(fs.readFileSync(path.join(DIR, 'editais-fora.json'), 'utf8')); } catch { /* sem lista */ }

let tirados = 0, editaisFora = 0, recategorizados = 0;
const ficam = [];
for (const e of dados.editais) {
  const v = desc.editais[e[C.path]] || {};
  const nome = e[C.municipio] + '/' + e[C.uf] + ' ' + e[C.edital];
  if (fora[e[C.path]] && e[C.path] !== '_leia') {
    editaisFora++;
    console.log(`  sai o edital ${nome}: ${fora[e[C.path]].motivo}`);
    continue;
  }
  for (const it of e[C.itens]) {
    const m = termoMaisCedo(norm(it[3]));
    if (m && m.c !== it[0]) { console.log(`categoria ${it[0]} -> ${m.c} · ${nome} · item ${it[5]}: ${String(it[3]).slice(0, 80)}`); it[0] = m.c; recategorizados++; }
    // O descritivo que ABRE com o produto de outra categoria e nao cita a do
    // rotulo: o item 10 da EBSERH Santa Maria/RS e "Exaustor material: plastico,
    // aplicacao: banheiro" no catalogo e "Fogao industrial a gas de baixa
    // pressao; 4 queimadores" no anexo de descricao detalhada (18/09/2026).
    const x = (v.itens || []).find(y => y[0] == it[5]);
    const dd = norm(x && x[6]);
    const abre = dd && termoMaisCedo(dd.slice(0, 60));
    const cita = dd && CAT.some(([c, ts]) => c === it[0] && ts.some(t => dd.includes(t)));
    // Para "Outros" nao: la mora o "aquecedor" solto, que e so o comeco de
    // "Aquecedor termico de agua" (EBSERH, item 1), da categoria AQ.
    if (abre && abre.i <= 5 && abre.c !== it[0] && abre.c !== 'OT' && !cita) {
      console.log(`categoria ${it[0]} -> ${abre.c} pelo descritivo · ${nome} · item ${it[5]}: ${x[6].slice(0, 80)}`);
      it[0] = abre.c; recategorizados++;
    }
  }
  const itens = e[C.itens].filter(it => {
    const x = (v.itens || []).find(y => y[0] == it[5]);
    const d = norm(x && x[6]);
    // a instalacao vale tambem no texto do PNCP, que muitas vezes traz a
    // informacao complementar do item colada na descricao
    const noCatalogo = vetoDoCatalogo(norm(it[3]), it[0]) || (!UF_INSTALA.has(e[C.uf]) && exigeInstalacao(norm(it[3])));
    const termo = noCatalogo || (d && ((VETO[it[0]] || []).find(t => d.includes(t)) || VETO.TODAS.find(t => d.includes(t))
      || (!UF_INSTALA.has(e[C.uf]) && exigeInstalacao(d))));
    if (!termo) return true;
    tirados++;
    console.log(`veta "${termo}" ${noCatalogo ? 'no PNCP' : 'no edital'} · ${it[0]} · ${nome} · item ${it[5]}: ${String(noCatalogo ? it[3] : x[6]).replace(/\s+/g, ' ').slice(0, 140)}`);
    return false;
  });
  if (itens.length === e[C.itens].length) { ficam.push(e); continue; }
  const qtd = itens.reduce((s, x) => s + x[1], 0);
  const val = Math.round(itens.reduce((s, x) => s + x[1] * x[2], 0));
  if (!itens.length || (val > 0 && val <= PISO_EDITAL)) {
    editaisFora++;
    console.log(`  sai o edital ${nome}: ${itens.length ? 'R$ ' + val + ' fica abaixo do piso' : 'sem item'}`);
    continue;
  }
  e[C.itens] = itens; e[C.quantidade] = qtd; e[C.valorEstimado] = val;
  ficam.push(e);
}

console.log(`${tirados} item(ns) vetado(s) pelo descritivo, ${editaisFora} edital(is) fora, ${recategorizados} item(ns) de categoria corrigida`);
if (!mostra && (tirados || editaisFora || recategorizados)) {
  dados.editais = ficam;
  dados.meta.editais = ficam.length;
  // O porUf vem do publicar.mjs, que rodou ANTES deste veto — sem recalcular
  // ele fica contando os editais que acabaram de sair. Em 17/09/2026 dizia 76
  // editais em 8 UFs quando a lista tinha 59 em 7, com SC zerado mas presente.
  const porUf = {};
  for (const e of ficam) porUf[e[C.uf]] = (porUf[e[C.uf]] || 0) + 1;
  dados.meta.porUf = porUf;
  fs.writeFileSync(arqDados, JSON.stringify(dados), 'utf8');
  console.log(`docs/dados.json: ${ficam.length} editais`);
}
