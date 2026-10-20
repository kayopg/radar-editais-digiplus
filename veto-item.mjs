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
// A lavadora de louca a Digiplus nao cota, industrial nem domestica (usuario,
// 14/10/2026). O catalogo a chama de "Maquina Lavar Loucas", que entra na
// categoria "Para lavar" pelo "maquina lavar" da maquina de roupa: sai quando o
// NOME do item (o comeco da descricao) e de louca. A sanduicheira que "pode ir
// na lava-loucas" e outra categoria e nao passa por aqui.
// (e pelos pratos, 15/10/2026: "maquina de lavar louca nao cotamos" — "LAVADORA,
// INDUSTRIAL, APLICACAO BANDEJAS E PRATOS", UFG, Goiania/GO)
export const lavaLoucas = d => /^[^.;:]{0,40}?(?:lava[\s-]?lou[cç]|lavadora\s+(?:de\s+)?lou[cç]|lavar\s+lou[cç]|lava[\s-]?pratos|lavadora\s+(?:de\s+)?pratos|lavar\s+pratos|bandejas\s+e\s+pratos)/.test(d);

// A chaleira que a Digiplus cota e a ELETRICA ou a industrial (5.4b do
// varredura.mjs, 01/09/2026); a de aluminio, de por no fogao, e panela. Ate
// 08/10/2026 quem a tirava era o piso de R$ 150. Com o volume passando a salvar
// o item de mais de R$ 100 e mais de 25 unidades, a "CHALEIRA TIPO HOTEL ...
// CONFECCIONADA EM ALUMINIO", 47 x R$ 137,24 (Vacaria/RS), entraria. Vale para a
// chaleira que abre a descricao: o fogao "com queimador para chaleira" fica.
// A "industrial" de ALUMINIO tambem e panela: "CHALEIRA INDUSTRIAL EM ALUMINIO
// REFORCADO ... COM CABO DE MADEIRA" (Nao-Me-Toque/RS) e a de "uso
// profissional ... em aluminio ... propria para utilizacao diretamente sobre
// fonte de calor" (Dois Irmaos/RS), as duas no radar em 08/10/2026.
// (resto: o descritivo, quando so ele diz de que e feita a chaleira)
export const chaleiraDeFogao = (d, resto = '') => {
  if (!/(?:^|[^a-z])chaleira/.test(d.slice(0, 40))) return false;
  const t = d + ' ' + resto;
  return !/eletric/.test(t) && (/aluminio/.test(t) || !t.includes('chaleira industrial'));
};

// O QUE SE COTA EM CADA UF. Desde 20/10/2026 SP, MG, GO, MS e DF cotam TUDO,
// como RS, SC e PR (usuario: "Esta sendo cortado muitos itens que cotamos,
// secadora de roupas, refrigeradores, multiprocessador de alimentos, Microondas,
// Mixer e muitos outros itens" — e, perguntado, "cotar tudo em todos"). So MT
// continua fora. A instalacao continua so em RS e SC (UF_INSTALA, na varredura e
// no veta-pelo-descritivo): "lembrando que apenas RS, SC tem instalacao".
//
// A tabela de 05/10 a 20/10/2026 fica abaixo (LINHAS_DE_05_10), com o teste
// dela, para o caso de o usuario voltar a restringir alguma UF. Nela a UF que
// nao estava — RS, SC e PR — cotava tudo, e nas outras ficava so o item dessas
// linhas (o edital sem nenhum saia):
//   MT: nada — saiu do radar em 06/10/2026 ("MT nao cotamos mais nada"). Fica
//     aqui vazio para o edital de MT que ainda estiver na lista sair inteiro.
//   DF, GO, MS e MG: "ar condicionado, bebedouro industrial, fogao industrial e
//     batedeira industrial"
//   SP: as mesmas, "microondas e ventilador"
//   e, em todas elas, a lavadora de alta pressao (lava-jato), de qualquer
//     porte: voltou ao radar em 08/10/2026 e, no mesmo dia, "pode incluir"
//     tambem fora de RS, SC e PR
//   DF, GO, MS e MG ganharam em 09/10/2026 o forno industrial, a refrigeracao
//     (freezer, geladeira, refrigerador), o liquidificador industrial e o
//     climatizador: o edital 060/2026 de Joao Pinheiro/MG deixava forno a gas,
//     dois freezers, geladeira e dois liquidificadores industriais em "Demais
//     itens", e o usuario: "itens que cotamos estao de fora". SP nao entrou na
//     pergunta e fica como estava. A camara fria, o expositor, a cervejeira e o
//     resfriador continuam so em RS, SC e PR.
//   e, em todas elas, a MESA INOX e a BALANCA (usuario, 15/10/2026: "mesa inox e
//     balancas pode adicionar nos demais estados"), que tinham entrado so em RS,
//     SC e PR (a balanca em 14/10, a mesa em 15/10). A mesa de hospital continua
//     fora em todo lugar (VETO_MI, varredura.mjs).
// A linha e a do PRODUTO, o primeiro termo de categoria da descricao: o
// "Climatizador ... com ventilador" e climatizador, e a "Cortina de ar" nao e
// ar-condicionado.
const INDUSTRIAIS = ['ar-condicionado', 'bebedouro industrial', 'fogao industrial', 'batedeira industrial', 'lavadora de alta pressao', 'mesa inox', 'balanca'];
const DO_CENTRO = [...INDUSTRIAIS, 'forno industrial', 'refrigeracao', 'liquidificador industrial', 'climatizador'];
export const LINHAS_DE_05_10 = {
  MT: new Set(),
  DF: new Set(DO_CENTRO), GO: new Set(DO_CENTRO), MS: new Set(DO_CENTRO), MG: new Set(DO_CENTRO),
  SP: new Set([...INDUSTRIAIS, 'micro-ondas', 'ventilador']),
};
export const LINHAS_DA_UF = { MT: new Set() };
// o que conta como refrigeracao nessas UFs
const REFRIGERACAO = /^(?:refrigerador|geladeira|frigobar|freezer|congelador|conservadora)$/;

export function linhaDoProduto(d, posicaoDoTermo) {
  const p = posicaoDoTermo(d);
  if (!p || !p.t) return null;
  // pela categoria: a mesa inox (MI) e a balanca (BL), de qualquer nome
  if (p.c === 'MI') return 'mesa inox';
  if (p.c === 'BL') return 'balanca';
  // "SPLITTER OTICO 1X8" e de rede (Guariba/SP, 05/10/2026), nao split
  if (p.t === 'split' && /^split[a-z]/.test(d.slice(p.i))) return null;
  if (/^(?:ar[- ]?condicionado|arcondicionado|condicionador de ar|split)$/.test(p.t)) return 'ar-condicionado';
  // "Forno micro-ondas", "forno de microondas", "forno eletrico micro-ondas"
  if (/^micro[- ]?ondas$|^microondas$/.test(p.t)
    || (p.t === 'forno' && /^forno\s+(?:de\s+|eletrico\s+)?micro[- ]?ondas|^forno\s+(?:de\s+)?microondas/.test(d.slice(p.i)))) return 'micro-ondas';
  // o lava-jato pelos nomes da categoria (varredura.mjs, LV) e a "Maquina
  // lavadora de alta pressao", que a categoria pega pelo "maquina lavadora"
  if (/^(?:lavadora (?:de )?alta pres|lavadoura de alta pres|lavadora jato|lavadora de pressao|lava[- ]?jato|lavajato|hidrolavadora)/.test(p.t)
    || /^maquina (?:lavadora|de lavar)\s+(?:de\s+)?alta\s+pres/.test(d.slice(p.i))) return 'lavadora de alta pressao';
  if (REFRIGERACAO.test(p.t)) return 'refrigeracao';
  return { bebedouro: 'bebedouro', fogao: 'fogao', batedeira: 'batedeira', ventilador: 'ventilador',
    forno: 'forno', liquidificador: 'liquidificador', climatizador: 'climatizador' }[p.t] || null;
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
  // O bebedouro que o EDITAL descreve como de pressao, de garrafao ou de mesa
  // nao e industrial, mesmo com o "tipo: industrial" do catalogo do PNCP no
  // rotulo: "Bebedouro de pressão de parede refrigerado adaptado para
  // acessibilidade" (Dourados/MS, edital 8, item 101, 06/10/2026).
  if (linha === 'bebedouro' && desc && /de pressao|garrafao|galao|de mesa/.test(desc.slice(0, 160)) && !/industria/.test(desc.slice(0, 160))) return false;
  if (/industria/.test(frente) || /(?:tipo|uso|aplicacao|linha|modelo):? industrial/.test(desc)) return true;
  if (['batedeira', 'liquidificador', 'forno'].includes(linha) && /(?:^|[^a-z])profissional/.test(frente)) return true;
  // O liquidificador e o forno pelo que o edital descreve (09/10/2026, nos
  // editais de DF, GO, MS e MG): "Liquidificador comercial 8 litros com copo
  // inox monobloco" e "LIQUIDIFICADOR ... 4 LITROS BAIXA ROTACAO" (Caarapo/MS),
  // "LIQUIDIFICADOR 8 LITROS ... CORPO: INOX, COPO: INOX" (Pedras de Maria da
  // Cruz/MG). O domestico vai ate uns 3 litros; de 4 para cima e o industrial.
  // O forno: "FORNO ELETRICO ... 65 L/ 4 ESTEIRAS/ ... TURBINA" (Santa Rita do
  // Araguaia/GO) e o de 90 litros de Caarapo; o "de bancada" de 65 L fica fora.
  const tudo = rot + ' ' + desc;
  if (linha === 'liquidificador') {
    if (/comercial|baixa rotacao/.test(tudo.slice(0, 400))) return true;
    for (const m of tudo.matchAll(/(?<![\d,.])(\d{1,2})(?:[.,]\d+)?\s*(?:litros|lts?|l)(?![a-z])(?![^.;]{0,25}(?:\bdia\b|\bhora\b|\/\s*h\b))/g)) if (+m[1] >= 4) return true;
  }
  if (linha === 'forno') {
    if (/comercial|convec|turbo|lastro|esteiras|combinado|cavalete/.test(tudo.slice(0, 400))) return true;
    for (const m of tudo.matchAll(/(?<![\d,.])(\d{2,3})(?:[.,]\d+)?\s*(?:litros|lts?|l)(?![a-z])/g)) if (+m[1] >= 90) return true;
  }
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
export function criaCotaNaUf(posicaoDoTermo, tabela = LINHAS_DA_UF) {
  return (uf, rot, desc, semDescritivo = false) => {
    const linhas = tabela[uf];
    if (!linhas) return true;
    const linha = linhaDoProduto(rot, posicaoDoTermo) || (desc ? linhaDoProduto(desc, posicaoDoTermo) : null);
    if (!linha) return false;
    if (!['bebedouro', 'fogao', 'batedeira', 'forno', 'liquidificador'].includes(linha)) return linhas.has(linha);
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
// A MESA INOX (categoria MI, 15/10/2026) e a descricao que COMECA por "mesa" e
// fala em inox logo adiante: "MESA DE TRABALHO AÇO INOX", "Mesa Manipulação /
// Preparação Alimentos material tampo: aço inoxidável", "LOTE 1 - Mesa inox 160 x
// 70 x 90 cm". O "mesa" no meio e de outra coisa: "Garfo de mesa em aço inox",
// "Autoclave horizontal de mesa", "Fogão ... mesa inox".
// A BANCADA de inox e a mesma mesa (20/10/2026): "Bancada em inox, estrutura
// inteiramente em inox, com duas chapas, pes tubulares" (Lucelia/SP), "Bancada
// material: aço inoxidável, comprimento: 135, largura: 75" (Campo Grande/MS) e a
// "Mesa Bancada Em Aço Inox com duas prateleiras" do TRF3.
const MESA_NA_FRENTE = /^[^a-z]*(?:(?:lote|item)\s*\d+\s*[-–:.]?\s*)?(mesa|bancada)(?![a-z])/;
export function criaPosicaoDoTermo(CAT) {
  const comMesa = CAT.some(([c]) => c === 'MI');
  return d => {
    let melhor = null;
    if (comMesa) {
      const m = MESA_NA_FRENTE.exec(d);
      if (m && /inox/.test(d.slice(0, 350))) return { c: 'MI', i: m[0].length - m[1].length, t: 'mesa' };
    }
    for (const [c, ts] of CAT) for (const t of ts) {
      if (c === 'MI') break;
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

// O catalogo do PNCP que poe a CLASSE do aparelho antes da peca: "Ar
// Condicionado - Defletor tipo: universal, material: plastico / nylon"
// (Ribeirao Preto/SP, 08/10/2026, defletores de acrilico para ar-condicionado
// cassete) e o defletor, nao o aparelho. So vale para a peca que vem LOGO
// depois do " - " e que nunca e o produto: "Bebedouro - gabinete em inox"
// continua bebedouro, e o "defletor de ar" no meio da descricao do split fica.
const PECA_APOS_A_CLASSE = /^\s*-\s*(defletor)/;

// posicaoDoTermo(d) -> { c, i } do primeiro termo de categoria, ou null
export function criaVetoItem({ VETO_ITEM, VETO_SO_NA_FRENTE, VETO_FORA_DE = {}, RE_VAN, posicaoDoTermo }) {
  const naFrente = new Set(VETO_SO_NA_FRENTE);
  const lista = VETO_ITEM.map(v => [v, !FRONTEIRA.has(v) ? null
    : new RegExp('(?:^|[^a-z])' + esc(v) + (FRONTEIRA.get(v) === 'palavra' ? '(?![a-z])' : ''))]);
  return (d, cat) => {
    const p = posicaoDoTermo(d);
    const produto = (p || { i: 0 }).i;
    if (p && p.t) { const m = PECA_APOS_A_CLASSE.exec(d.slice(p.i + p.t.length)); if (m) return m[1]; }
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
