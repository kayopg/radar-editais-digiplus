// O endereco do edital dentro do portal da disputa, para o botao "Participar".
//
// O PNCP informa esse endereco em linkSistemaOrigem, mas nem sempre: em
// 16/09/2026 Nova Esperanca/PR (pregao 26/2026) e Caxias do Sul/RS vieram sem,
// e o card ficava sem botao. Para o Compras.gov.br o endereco tem formato fixo
// — conferido nos 50 editais do dia que traziam o link —, entao o Radar monta:
//
//   .../acompanhamento-compra?compra= UASG(6) + modalidade(2) + numero(5) + ano(4)
//
// com 05 para pregao eletronico e 06 para dispensa. O numero e o da compra no
// Compras.gov.br, que nos 50 era o mesmo do titulo "Edital nº 26/2026".
//
// Montado nao e garantido: o de Caxias do Sul (uma reabertura) nao existe com o
// numero do titulo, e o Compras.gov.br protege a consulta com captcha, entao nao
// da para conferir daqui. Por isso o link montado vai marcado, e a pagina mostra
// a UASG e o numero para a pesquisa manual.

export const linkDoPortal = u => {
  const s = String(u || '').trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
};

export const ehComprasGov = nome => /compras\.gov|comprasnet/i.test(String(nome || ''));

const MODALIDADE_COMPRASGOV = { 6: '05', 8: '06' };

// uasg: codigo da unidade; modId: modalidade do PNCP; numero: numeroCompra ou o
// titulo do edital ("Edital nº 26/2026"); ano: ano da compra.
export function montaLinkComprasGov({ uasg, modId, numero, ano }) {
  const u = String(uasg || '').trim();
  const m = MODALIDADE_COMPRASGOV[Number(modId)];
  const t = String(numero || '').match(/(\d{1,5})(?:\s*\/\s*(\d{4}))?\s*$/) || String(numero || '').match(/(\d{1,5})\s*\/\s*(\d{4})/);
  const n = t ? t[1] : '';
  const a = String(ano || (t && t[2]) || '').trim();
  if (!/^\d{6}$/.test(u) || !m || !n || !/^\d{4}$/.test(a)) return '';
  return 'https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra='
    + u + m + n.padStart(5, '0') + a;
}
