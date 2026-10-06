// Veto por item — a mesma regra no varredura.mjs e no veta-pelo-descritivo.mjs.
//
// A lista VETO_ITEM nasceu de falsos positivos reais, e boa parte dela e nome de
// PECA ou ACESSORIO: prateleira, refil, compressor, filtro de ar, gas
// refrigerante. Aplicada em qualquer ponto da descricao, ela derrubava o proprio
// aparelho que cita a peca. A auditoria de 18/09/2026, com todos os itens dos
// 2.539 candidatos do dia, achou "GELADEIRA ... prateleiras de vidro" (59
// itens), "AR-CONDICIONADO SPLIT ... embalagem com dados do produto" e "...
// filtro de ar", "BEBEDOURO REFRIGERADO COM GABINETE EM INOX" (74), "PURIFICADOR
// DE AGUA ... refil" (40), "CONDICIONADOR DE AR ... compressor" e "...
// condensadora", "FOGAO 4 BOCAS COM ACENDEDOR AUTOMATICO" — editais inteiros de
// geladeira, frigobar e ar-condicionado fora do radar.
//
// O nome do produto abre a descricao. Entao o termo de peca (VETO_SO_NA_FRENTE)
// so veta quando vem ANTES do termo da categoria: "Prateleira para geladeira",
// "Filtro de ar ... ar condicionado", "Gas refrigerante ... ar condicionado" e
// "Gabinete gamer com ventilador" continuam fora; "Geladeira ... prateleiras"
// fica. Os demais termos da lista (contexto: veiculo, laboratorio, hospedagem,
// ventilador pulmonar...) vetam em qualquer ponto, como antes.
//
// "trator" casa como comeco de palavra: solto, pegava "extrator" e "lavadora
// extratora" (17 itens na mesma auditoria, multiprocessador e lavadora de roupa).
// Termo curto como palavra inteira: "mop" casava dentro de "terMOPlastico" e
// vetava a "Cafeteira Eletrica ... material: termoplastico/metal" de Sao
// Paulo/SP (18/09/2026).
// O objeto com instalacao CONDICIONAL ("quando necessaria", "caso seja
// aplicavel") e o aparelho que se instala — a mesma regra no varredura.mjs (5.1e)
// e no veta-pelo-descritivo.mjs. Fora do RS e de SC sai so o que precisa ser
// instalado; o resto do edital fica.
// "INCLUINDO MONTAGEM E INSTALACAO, SE NECESSARIAS" (Sao Joao d'Alianca/GO, 29/09/2026)
// A amassadeira que a Digiplus cota e a industrial LENTA ou SEMI-RAPIDA
// (usuario, 05/10/2026). Sai a que se diz rapida sem falar em lenta nem em
// semi-rapida; "lenta/semirrapida" (Lajeado/RS) fica — o "semirrapida" junto
// nem tem "rapida" como palavra.
export const amassadeiraRapida = d => /amassadeira/.test(d) && /(?<!semi[- ])\brapida\b/.test(d)
  && !/lenta|semi[- ]?r?rapida/.test(d);

// O QUE SE COTA EM CADA UF (usuario, 05/10/2026). A UF que nao esta aqui — RS,
// SC e PR — cota tudo o que o radar pega. Nas outras fica so o item dessas
// linhas, e o edital sem nenhum sai:
//   MT: nada — saiu do radar em 06/10/2026 ("MT nao cotamos mais nada"). Fica
//     aqui vazio para o edital de MT que ainda estiver na lista sair inteiro.
//   DF, GO, MS e MG: "ar condicionado, bebedouro industrial, fogao industrial e
//     batedeira industrial"
//   SP: as mesmas, "microondas e ventilador"
// A linha e a do PRODUTO, o primeiro termo de categoria da descricao: o
// "Climatizador ... com ventilador" e climatizador, e a "Cortina de ar" nao e
// ar-condicionado.
const INDUSTRIAIS = ['ar-condicionado', 'bebedouro industrial', 'fogao industrial', 'batedeira industrial'];
export const LINHAS_DA_UF = {
  MT: new Set(),
  DF: new Set(INDUSTRIAIS), GO: new Set(INDUSTRIAIS), MS: new Set(INDUSTRIAIS), MG: new Set(INDUSTRIAIS),
  SP: new Set([...INDUSTRIAIS, 'micro-ondas', 'ventilador']),
};

export function linhaDoProduto(d, posicaoDoTermo) {
  const p = posicaoDoTermo(d);
  if (!p || !p.t) return null;
  // "SPLITTER OTICO 1X8" e de rede (Guariba/SP, 05/10/2026), nao split
  if (p.t === 'split' && /^split[a-z]/.test(d.slice(p.i))) return null;
  if (/^(?:ar[- ]?condicionado|arcondicionado|condicionador de ar|split)$/.test(p.t)) return 'ar-condicionado';
  // "Forno micro-ondas", "forno de microondas", "forno eletrico micro-ondas"
  if (/^micro[- ]?ondas$|^microondas$/.test(p.t)
    || (p.t === 'forno' && /^forno\s+(?:de\s+|eletrico\s+)?micro[- ]?ondas|^forno\s+(?:de\s+)?microondas/.test(d.slice(p.i)))) return 'micro-ondas';
  return { bebedouro: 'bebedouro', fogao: 'fogao', batedeira: 'batedeira', ventilador: 'ventilador' }[p.t] || null;
}

// INDUSTRIAL: a palavra no rotulo, no comeco do descritivo (onde vem o nome do
// produto) ou como campo ("tipo: industrial", Manhumirim/MG). O que se diz
// domestico nao e, mesmo que o descritivo fale em "padrao industrial" adiante.
// Batedeira "de uso profissional" conta: a planetaria de R$ 3.536 de
// Guatapara/SP. E o bebedouro, pelo tamanho: reservatorio de 50 litros para
// cima e o industrial — "BEBEDOURO DE 150 LITROS INOX" (Pedras de Maria da
// Cruz/MG), "de coluna, com capacidade de 100 litros" (Cesario Lange/SP) —, e
// o de 25 litros em inox tambem, que e o mesmo aparelho que Carmo do Rio
// Verde/GO chama de "BEBEDOURO DE COLUNA INDUSTRIAL INOX 25 LITROS" e
// Palmeiras de Goias/GO de "BEBEDOURO 02 TORNEIRAS ... 25 litros; ... aço Inox
// 430". O de garrafao, o de pressao e o de mesa nao. Litros por hora ou por
// dia e refrigeracao, nao reservatorio.
export function ehIndustrial(linha, rot, desc = '') {
  const frente = rot + ' ' + desc.slice(0, 160);
  if (/domestic/.test(rot) && !/industria/.test(rot)) return false;
  if (/industria/.test(frente) || /(?:tipo|uso|aplicacao|linha|modelo):? industrial/.test(desc)) return true;
  if (linha === 'batedeira' && /(?:^|[^a-z])profissional/.test(frente)) return true;
  if (linha === 'bebedouro') {
    const tudo = rot + ' ' + desc;
    if (/de pressao|garrafao|galao|de mesa/.test(frente)) return false;
    const minimo = /\binox/.test(tudo) ? 25 : 50;
    const re = /(\d{2,3})(?:[.,]\d+)?\s*(?:litros|lts?|l)(?![a-z])(?![^.;]{0,25}(?:\bdia\b|\bhora\b|\/\s*h\b))/g;
    for (const m of tudo.matchAll(re)) if (+m[1] >= minimo) return true;
  }
  return false;
}

// cotaNaUf(uf, rotulo, descritivo) -> o item e de uma linha que se cota nessa
// UF? Sem o descritivo (a varredura, que ainda nao o tem), o bebedouro, o fogao
// e a batedeira passam se o rotulo nao se diz domestico: quem decide se e
// industrial e o veta-pelo-descritivo.mjs, depois, com o descritivo na mao.
export function criaCotaNaUf(posicaoDoTermo) {
  return (uf, rot, desc, semDescritivo = false) => {
    const linhas = LINHAS_DA_UF[uf];
    if (!linhas) return true;
    const linha = linhaDoProduto(rot, posicaoDoTermo) || (desc ? linhaDoProduto(desc, posicaoDoTermo) : null);
    if (!linha) return false;
    if (!['bebedouro', 'fogao', 'batedeira'].includes(linha)) return linhas.has(linha);
    if (!linhas.has(linha + ' industrial')) return false;
    return semDescritivo ? !/domestic/.test(rot) || /industria/.test(rot) : ehIndustrial(linha, rot, desc || '');
  };
}

export const OBJ_CONDICIONAL = /caso seja aplicavel|quando aplicavel|se aplicavel|quando couber|(?:quando|se|caso) necessari/;
// O climatizador evaporativo industrial DE PAREDE pede a abertura na alvenaria
// ("ABERTURA MINIMA DE PAREDE (MM) A: 1390 X L: 2780", Assis Chateaubriand/PR,
// 30/09/2026): e aparelho que se instala, como o split. O portatil nao.
export const instalavel = (d, cat) => cat === 'CX' || cat === 'AQ'
  || (cat === 'CL' && (/split|ar[- ]?condicionad|arcondicionad|condicionador|cortinas? (?:de )?ar(?![a-z])/.test(d)
    || /climatizador[^.;]{0,90}(?:de parede|abertura (?:minima )?(?:de|na) parede)/.test(d)));

const FRONTEIRA = new Map([['trator', 'inicio'], ['mop', 'palavra'], ['rack', 'palavra'], ['aquario', 'palavra']]);

// A categoria e a do primeiro termo da tabela que aparece como PRODUTO — nao
// como uso de outra coisa (18/09/2026). Com as regras de servico e de objeto
// mais estreitas, entraram editais de utensilio cuja descricao so cita o
// aparelho: "Conjunto de potes ... apto para micro-ondas e lava-loucas",
// "Assadeira ... utilizacao segura: freezer, geladeira, forno", "compativel
// com geladeira e micro-ondas" (Jatai/GO), "Termostato ... aplicacao:
// refrigerador comercial" (peca), "Circuito paciente compativel com
// ventilador" (hospital), "Mangueira para fogao". O termo precedido por uma
// dessas marcas nao conta; conta o proximo, e sem outro o item fica sem
// categoria. "de" nao e marca: "Aparelho de ar condicionado" e o produto.
const USO = /(?:apt[oa]s?(?: (?:para|em|ao|a))?|aptos em uso|utilizac(?:ao|oes) seguras?|compativel com(?: lavagem em)?|uso recomendado|(?:para )?uso em|lavad[oa] (?:manualmente )?(?:ou )?em|lavagem (?:manual )?(?:ou )?em|ou em|resistente (?:ao|a)|ir (?:ao|a|para|no|na)|aplicacao|recomendad[oa] (?:para|em)|indicad[oa] para uso)[\s:,(]*(?:[a-z0-9-]+[\s,]+){0,3}$/;
const PARA = /(?:para|p\/)(?: (?:o|a|os|as|uso))?\s+$/;
export function criaPosicaoDoTermo(CAT) {
  return d => {
    let melhor = null;
    for (const [c, ts] of CAT) for (const t of ts) {
      for (let i = d.indexOf(t); i >= 0; i = d.indexOf(t, i + 1)) {
        if (melhor && i >= melhor.i) break;
        const antes = d.slice(Math.max(0, i - 40), i);
        if (USO.test(antes) || PARA.test(antes)) continue;
        melhor = { c, i, t };
        break;
      }
    }
    return melhor;
  };
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// posicaoDoTermo(d) -> { c, i } do primeiro termo de categoria, ou null
export function criaVetoItem({ VETO_ITEM, VETO_SO_NA_FRENTE, VETO_FORA_DE = {}, RE_VAN, posicaoDoTermo }) {
  const naFrente = new Set(VETO_SO_NA_FRENTE);
  const lista = VETO_ITEM.map(v => [v, !FRONTEIRA.has(v) ? null
    : new RegExp('(?:^|[^a-z])' + esc(v) + (FRONTEIRA.get(v) === 'palavra' ? '(?![a-z])' : ''))]);
  return (d, cat) => {
    const produto = (posicaoDoTermo(d) || { i: 0 }).i;
    for (const [v, re] of lista) {
      if (VETO_FORA_DE[v] === cat) continue;
      let i;
      if (re) { const m = re.exec(d); if (!m) continue; i = m.index + m[0].length - v.length; }
      else { i = d.indexOf(v); if (i < 0) continue; }
      if (naFrente.has(v) && i >= produto) continue;
      return v;
    }
    return RE_VAN && RE_VAN.test(d) ? 'van' : null;
  };
}
