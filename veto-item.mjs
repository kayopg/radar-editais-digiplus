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
        melhor = { c, i };
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
