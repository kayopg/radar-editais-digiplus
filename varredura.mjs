// Radar de Editais Digiplus — varredura do PNCP e geração dos dados do artifact.
// Uso: node varredura.mjs            -> grava dados-YYYY-MM-DD.json e imprime as estatísticas
// Requer Node 18+ (fetch global). Roda direto na máquina; não precisa do navegador.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { textoDasPaginas, textoUtil } from './paginas-uteis.mjs';
import { analisaExigencias } from './exigencias.mjs';
import { devedorDe } from './devedores.mjs';
import { linkDoPortal, ehComprasGov, montaLinkComprasGov } from './participar.mjs';
import { portalOk, plataformaDoEdital } from './plataforma.mjs';
import { criaVetoItem, criaPosicaoDoTermo } from './veto-item.mjs';

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
"coifa","exaustor","balanca","lousa digital","geladeira industrial","climatizador industrial",
// 18/09/2026, da auditoria com todos os itens do dia: edital so de gerador a
// gasolina (Indaiatuba/SP) ou so de umidificador de ar (Dracena/SP) nao casava
// com nenhum termo, e extrator de suco nao tinha nem categoria.
"gerador a gasolina","gerador a diesel","grupo gerador","umidificador","extrator de suco"];
const UFS = ["PR","RS","SP","MG","GO","MT","MS","SC"];

const CAT = [
  ["RF",["refrigerador","geladeira","frigobar","freezer","congelador","conservadora","camara fria","camara frigorifica","expositor refrigerado","balcao refrigerado","cervejeira","resfriador",
    // "Balcao Conservacao Alimento ... componentes: pasta fria" e o nome do
    // catalogo do PNCP para o balcao refrigerado (Bento Goncalves/RS, 18/09/2026)
    "balcao conservacao"]],
  ["BB",["bebedouro","purificador de agua","refresqueira","suqueira","refresqueira industrial"]],
  ["CC",["fogao","forno","microondas","micro-ondas","micro ondas","cooktop","fritadeira","salamandra","char broiler","charbroiler","caldeirao","panela eletrica","churrasqueira","balcao termico","buffet termico","banho maria","banho-maria","estufa para salgados","pista termica"]],
  ["PR",["liquidificador","batedeira","processador de alimentos","processador alimentos","multiprocessador","espremedor","moedor","cortador de frios","fatiador","descascador","masseira","amassadeira",
    // 18/09/2026: nomes que o PNCP usa e a tabela nao tinha. Mixer so com
    // complemento de cozinha: "mixer" solto e tambem a mesa de som.
    "extrator de suco","centrifuga de fruta","centrifuga de alimento","centrifuga de suco",
    "mixer de alimento","mixer de mao","mixer 2 em 1","mixer 3 em 1","mixer eletrico","mixer portatil",
    "mixer vertical","mixer profissional","mixer com lamina","mixer com haste"]],
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
  ["GE",["gerador de energia","gerador a diesel","gerador a gasolina","grupo gerador","motogerador",
    // o catalogo do PNCP escreve "Gerador Energia", sem o "de" (Paranavai/PR,
    // Uniao da Vitoria/PR, Vicosa/MG, 18/09/2026)
    "gerador energia","gerador de eletricidade","gerador eletrico","grupo moto gerador","moto gerador","gerador - potencia"]],
  ["AQ",["aquecedor de agua","aquecedor a gas","aquecedor eletrico","boiler","aquecedor de passagem","aquecedor solar"]],
  ["OT",["enceradeira","aquecedor"]],
];

// 5.4 - piso por PRODUTO, unico para todas as categorias (decisao do usuario em
// 31/08/2026). Antes havia nove pisos por categoria, e o de Climatizacao (R$ 400)
// fora calibrado para ar-condicionado: derrubava ventilador de verdade junto -
// "Ventilador de coluna, 20 un, R$ 244,59" no edital 163/2026 de Gravatai/RS.
// Quem decide se o edital vale a viagem e o PISO_EDITAL, nao este.
const PISO_ITEM = 150;

// 5.4b - produtos que a Digiplus cota mesmo baratos (decisao do usuario em
// 01/09/2026). Chaleira eletrica de 1,7 L sai por R$ 73 e e produto de linha; o
// piso de R$ 150 estava derrubando 15 itens assim. Chaleira de aluminio de
// fogao continua fora, porque nao casa com "eletrica" nem "industrial" — e
// panela, nao eletrodomestico. Quem decide se o edital vale a viagem continua
// sendo o PISO_EDITAL, nao este.
const SEM_PISO = ['chaleira eletrica','chaleira industrial','cafeteira'];

// 5.4c - volume salva o item de preco quase no piso (decisao do usuario em
// 18/09/2026): acima de R$ 140 e com mais de 10 unidades, o item fica. A
// auditoria do dia mostrou o piso derrubando sanduicheira, liquidificador
// domestico, batedeira e aquecedor de ambiente de R$ 140 a R$ 149.
const PISO_VOLUME_PRECO = 140, PISO_VOLUME_QTD = 10;
const salvoPeloVolume = (v, q) => v > PISO_VOLUME_PRECO && q > PISO_VOLUME_QTD;

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


// 5.8 — portal de origem (decisao do usuario em 02/09/2026). A Digiplus so
// disputa em seis portais; edital publicado por outro sistema fica de fora.
//
// Todo portal e obrigado a publicar no PNCP desde a Lei 14.133, entao o Radar
// ja via todos — o campo usuarioNome e o registro de QUEM publicou. A maioria
// dos editais nao vem de bolsa de licitacao e sim do ERP da prefeitura
// (ECustomize, Megasoft, IPM, Elotech), e esses agora saem.
//
// O nome vem por extenso e varia ("BLL Compras", "Bolsa Nacional De Compras -
// BNC"), por isso a comparacao e por trecho e nao por igualdade.
// A lista e a comparacao moram em plataforma.mjs, junto com a leitura da
// plataforma escrita no edital.


// A API de consulta e outra: tem o portal, mas com cota curta — seis requisicoes
// em paralelo derrubam tudo por 30 s. Por isso roda serializada, e so sobre a
// lista final (uns 250), nao sobre os 1500 candidatos.
// Toda chamada tem prazo. Sem ele, a consulta que trava espera os 5 min do
// Node a cada tentativa: em 21/09/2026 a API de consulta ficou fora do ar, a
// etapa dos portais levou 4h45 na maquina local e o job do GitHub (teto de
// 300 min) morreu nela sem publicar.
const PRAZO_CONSULTA = 20000, PRAZO_ARQUIVO = 120000;
async function buscaPortal(e) {
  const [c, a, s] = e.path.split('/');
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch(`https://pncp.gov.br/api/consulta/v1/orgaos/${c}/compras/${a}/${s}`, { signal: AbortSignal.timeout(PRAZO_CONSULTA) });
      if (r.status === 429) { await new Promise(x => setTimeout(x, 35000)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      // O endereco do edital DENTRO do portal, para o botao "Participar" da
      // pagina: no Compras.gov.br e o acompanhamento da compra, na BLL e na
      // BNC a pagina do processo, onde o fornecedor entra na disputa.
      e.link = linkDoPortal(j.linkSistemaOrigem);
      // Sem link no PNCP, o do Compras.gov.br e montado (ver participar.mjs).
      if (!e.link && ehComprasGov(j.usuarioNome)) {
        e.link = montaLinkComprasGov({ uasg: (j.unidadeOrgao && j.unidadeOrgao.codigoUnidade) || e.uasg,
          modId: j.modalidadeId || e.modId, numero: j.numeroCompra || e.ed, ano: j.anoCompra });
        e.linkMontado = !!e.link;
      }
      return limpa(j.usuarioNome || '');
    } catch {
      await new Promise(x => setTimeout(x, 3000));
    }
  }
  return null;      // nao deu para saber: mantem o edital, ver nota no filtro
}

// 5.1 — serviço no item
const SERV_ITEM = ["instalacao","montagem","manutencao","higienizacao","desinstalacao","recarga de gas","limpeza de ar","mao de obra","servicos de"];
// 5.1 — serviço no objeto do edital (mais estreito: "manutenção das atividades" é praxe e não é serviço)
const SERV_OBJ = ["instalacao","montagem","mao de obra"];
// 5.1b — no RS e em SC a Digiplus instala (decisao do usuario, 17/09/2026): ali
// instalacao e montagem nao derrubam o edital. O item de servico que so instala
// (m = 'S', "instalacao de ar-condicionado") sai da lista, mas o edital fica pelos
// aparelhos. "desinstalacao" continua servico: casa com "instalacao" como texto,
// por isso o teste e por termo da lista e nao por substring. Fora dessas duas UFs
// o veto-pelo-descritivo.mjs tira tambem o aparelho que o EDITAL manda entregar
// instalado — o catalogo do PNCP quase nunca diz isso.
const UF_INSTALA = new Set(["RS","SC"]);
const SERV_INSTALA = ["instalacao","montagem"];
const servicoEm = (lista, d, uf) => lista.some(v => d.includes(v) && !(UF_INSTALA.has(uf) && SERV_INSTALA.includes(v)));
// "servicos de instalacao" e "mao de obra de instalacao" ainda sao so instalar.
const NAO_SO_INSTALA = SERV_ITEM.filter(v => !SERV_INSTALA.includes(v) && v !== "servicos de" && v !== "mao de obra");
const soInstala = (d, uf) => UF_INSTALA.has(uf) && SERV_INSTALA.some(v => d.includes(v)) && !NAO_SO_INSTALA.some(v => d.includes(v));
// 5.1c — no item de MATERIAL a palavra solta nao e servico (18/09/2026). A
// auditoria do dia, com todos os itens dos 2.539 candidatos, achou 46 editais
// derrubados inteiros por "de facil higienizacao" e "removivel para
// higienizacao", outros por "termostato ... para manutencao da temperatura",
// "instalacao: piso com pes", "metodos de instalacao: fixacao na parede", "kit
// completo para instalacao", "facil desmontagem" (que contem "montagem"),
// "limpeza de areas" (que contem "limpeza de ar") e "servicos de saude" —
// bebedouro, balanca, fogao, cafeteira, lavadora. No material so conta o que
// contrata servico junto com o aparelho:
//   - manutencao contratada, desinstalacao, mao de obra: derruba o edital, como
//     o item de servico;
//   - instalacao ou montagem exigida: fora do RS e de SC sai so o ITEM, como no
//     veta-pelo-descritivo.mjs (decisao do usuario, 17/09/2026 — "aparelhos que
//     solicitam instalacao pode remover"); no RS e em SC fica.
// O item de servico (m != 'M') segue como antes.
const SERVICO_NO_MATERIAL = /servicos? de (?:manutencao|higienizacao|limpeza)|manutencao (?:preventiva|corretiva)|contrato de manutencao|desinstalacao|recarga de gas|limpeza de ar(?:-| )?condicionad|mao de obra(?! de (?:instalacao|montagem))/;
const INSTALACAO_NO_MATERIAL = /(?:servicos? de |mao de obra de |incluindo (?:a )?|incluir (?:a )?|inclusa (?:a )?|inclusive (?:a )?|fornecimento e |confeccao e )(?:instalacao|montagem)|(?:instalacao|montagem) (?:inclusa|incluida|inclusive|completa|no local|no ato)|com (?:instalacao|montagem)(?! (?:em|na|no|de|tipo|a|sobre|embutid))|entregues? (?:devidamente )?instalad|devidamente instalad|instalad[oa]s? e em (?:perfeito )?funcionamento|(?:instalacao|montagem) (?:sera |fica |ficara )?(?:por conta|a cargo|sob responsabilidade|de responsabilidade) d/;
const SERVICO_NA_FRENTE = /^(?:re|des)?(?:instalacao|montagem|manutencao|higienizacao|limpeza|recarga|reposicao|substituicao|conserto|reparo|servicos?|mao de obra|calibracao|locacao|troca de|assistencia tecnica)(?![a-z])/;
// "kit de instalacao" no OBJETO e acessorio, nao servico: "ar condicionado tipo
// split Hi Wall Inverter e kits de instalacao" (Jaguariuna/SP) caia inteiro.
const objetoSemKit = obj => obj.replace(/(?:kits?|materia(?:l|is)|acessorios?) (?:de|para) (?:instalacao|montagem)/g, ' ')
  // "incluindo entrega, montagem dos moveis correspondentes aos itens 15, 16 e
  // 17" (Camara de Cuiaba/MT) e montagem de movel, nao do ar-condicionado
  .replace(/montagem d[oe]s? (?:moveis|mobiliarios?)/g, ' ');
// 5.1e — objeto MISTO (moveis e eletrodomesticos) ou com instalacao
// CONDICIONAL ("caso seja aplicavel aos itens") nao cai inteiro pela instalacao
// (18/09/2026): "mobiliario, eletrodomesticos e equipamentos eletroeletronicos
// (com montagem e instalacao dos bens moveis)" (Lucelia/SP), "(climatizacao,
// hospitalares, eletronicos, eletrodomesticos) e mobiliario, com montagem,
// instalacao e testes" (Boa Esperanca/PR) levavam fogao, geladeira e lavadora
// junto. Fora do RS e de SC saem so os itens que se instalam — ar-condicionado,
// cortina de ar, coifa e exaustor, aquecedor de agua —; o resto fica.
const OBJ_CONDICIONAL = /caso seja aplicavel|quando aplicavel|se aplicavel|quando couber/;
const objetoMisto = obj => /mobiliario|moveis/.test(obj) && /eletrodomestic|eletroportat/.test(obj);
const instalavel = (d, cat) => cat === 'CX' || cat === 'AQ'
  || (cat === 'CL' && /split|ar[- ]?condicionad|arcondicionad|condicionador|cortina de ar/.test(d));

// 5.2 — veto por objeto
const VETO_OBJ = ["veiculo","picape","caminhao","onibus","ambulancia","motociclet","automov","trator","maquinas agricolas","brinquedo","material de construcao","processamento de dados","formulas aliment","dieta enteral","generos aliment","material de limpeza","higiene e limpeza","sucata","velorio","tecidos aviamento",
// acrescentados em 09/09/2026. O objeto ja dizia o que o item escondia:
// Praia Grande/SP e "aquisicao de coletor de residuos organicos e detritos",
// R$ 3,1 milhoes de varricao urbana que entrou como eletroportatil; Coxim/MS e
// "materiais de refrigeracao e rede de gases para MANUTENCAO de aparelhos de
// ar condicionado", cujos itens sao pecas de reposicao.
"coletor de residuos","residuos organicos","rede de gases","manutencao de aparelhos",
// 18/09/2026: gerador ALUGADO para evento (Barao de Cocais/MG, "ADESAO:
// ESTRUTURAS E SERVICOS PARA EVENTOS"), que veio com o termo de busca "gerador"
"servicos para eventos","estruturas para eventos"];
// 5.2c — o objeto que TAMBEM compra eletrodomestico nao cai inteiro por uma
// palavra (18/09/2026). "Aquisicao de Moveis, Eletrodomesticos, Eletronicos e
// brinquedos", "motocicleta, bicicleta eletrica e refrigerador frost free" e
// "material de Copa, Cozinha, Higiene e Limpeza" saiam antes de ler os itens.
// Com eletrodomestico no objeto, quem decide e o item: o veiculo, o brinquedo e
// o genero alimenticio caem pelo VETO_ITEM, a geladeira fica. Os termos que
// dizem que o edital inteiro e outra coisa (sucata, velorio, varricao urbana,
// pecas de manutencao) seguem derrubando sempre. "trator" como comeco de
// palavra, pelo mesmo motivo do veto-item.mjs ("extrator").
const VETO_OBJ_SEMPRE = new Set(["sucata","velorio","coletor de residuos","residuos organicos","rede de gases","manutencao de aparelhos"]);
const OBJ_ELETRO = /eletrodomestic|eletroportat|linha branca/;
const vetoDoObjeto = txt => {
  const v = VETO_OBJ.find(t => t === 'trator' ? /(?:^|[^a-z])trator/.test(txt) : txt.includes(t));
  if (!v) return RE_VAN.test(txt) ? 'van' : null;
  if (VETO_OBJ_SEMPRE.has(v)) return v;
  const compraEletro = OBJ_ELETRO.test(txt) || CAT.some(([, ts]) => ts.some(t => txt.includes(t)));
  return compraEletro ? null : v;
};

// 5.3 — veto por item (lista viva, construída de falsos positivos reais)
const VETO_ITEM = ["ventilador mecanic","ventilador pulmon","ventilacao mecanic","fisioterapia","ultrassom","cpap","bipap","trator","agricol","retroescav","colheitadeira","em mdf","de mdf","suporte para tv","suporte de tv","pedestal para","suporte pedestal","armario","prateleira","embalagem","saco","sabao","detergente","limpa forno","limpador","desengordurante","amaciante","lava roupas em po","refil","filtro refil","unidade filtrante","disco abrasivo","manta abrasiva","brinquedo","miniatura","cooler","gabinete","nobreak","no-break","split bolt","conector","gas refrigerante","pecas e acessorios","placa eletronica","compressor","separador de oleo","resfriador de liquido","condensador","termometro","isqueiro","acendedor","garrafa plastica","pote plastico","suporte dispenser","escova","carrinho","carro material","caldeirao","panela","copos","jogo 12","playground","tarol","caixa de guerra","camera de","locacao de container","contratacao de empresa","sala para velorio","sucata","mufla","calorimetro","manta aquecedora","niple","kit registro","kit de limpeza","conjunto para limpeza","descascador giratorio","turbilhao","dispenser","coletor lixo","martelo","adubo","inseminacao","coador de pano","filtro ar condicionado","controle de ventilador","botijao de gas","pano multiuso","veicul","ambulanci","cabine",
// acrescentados em 30/08/2026
"torneira de parede","torneira para pia","tubo de ferro","tubo de cobre","tubo cobre","pecas /","pecas/","para pedreiro","suporte para televis","suporte de televis","suporte de videocassete","embalag","espaco destinado","onibus","caminhao","impressao 3d","sem funcionamento","quarto de hotel","diaria","estadia","hospedagem","locacao de","prestacao de","autoclave","concentrador de","tampao","projetor","resistencia aquecedor","luva termica","frigideira","prato fundo","alicate","removedor de","coador pano","ralador/fatiador","carro balde","chave controle","elemento filtrante","filtro purificacao","liner","projeto executivo","fantasia","formula infantil","nutricao oral","nutricao geral","placa aquecedora","boia para","controle universal","controle remoto universal",
// acrescentados em 03/09/2026: EPI casando com "purificador de ar". Montes
// Claros/MG entrou com 5 itens, todos respirador PFF2 e filtro de mascara
// contra gas — mascara purificadora de ar nao e eletrodomestico.
"respirador","mascara","pff2","pff1","pff3","filtro de mascara","protecao respiratoria",
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
"esteira para","placa de video","placa-mae","pci-e","para computador","atx",
// acrescentados em 04/09/2026, conferindo os 291 itens do lote um a um. Todos
// tem em comum a palavra da categoria aparecendo LA NO MEIO da descricao, como
// peca do que esta sendo comprado, e nao como o produto:
//   - Vere/PR: "Conjunto de britagem e rebritagem ... COM GERADOR DE ENERGIA
//     de 260KA" — R$ 2 milhoes de britador que entrou como Gerador. Foi este
//     que o usuario pegou e mandou conferir todos.
//   - Sao Paulo/SP: "Acessorio Para Equipamento Medico tipo: UMIDIFICADOR" e
//     "Ventilador / Exaustor Axial - PECA / ACESSORIO".
//   - Barretos/SP: "Material Confeccao De Protese Dental ... c/ EXAUSTOR".
//   - Cuiaba/MT: banho-maria e chapa aquecedora de LABORATORIO. Vetar por
//     "agitacao de agua" e "aplicacao: laboratorio" e mais seguro que vetar
//     "banho maria", que no balcao termico e produto da casa.
"britagem","rebritagem","britador","peneira vibratoria","mesa alimentadora",
// acrescentados em 09/09/2026, conferindo edital por edital os itens sem
// descritivo — o descritivo faltava porque o produto do edital nao era o que a
// categoria dizia:
//   - Praia Grande/SP, R$ 3.177.610: o PNCP catalogou como "Aspirador Po /
//     Agua - Industrial", mas o objeto e "coletor de residuos organicos e
//     detritos" e o edital descreve aspirador urbano SOBRE REBOQUE com motor a
//     gasolina de 23 HP. Nao e o aspirador de po e agua da casa.
//   - Coxim/MS: edital de manutencao de ar condicionado, e os 15 itens sao
//     pecas — porca flange, valvula de servico, kit placa, fita de pvc, bolsa
//     coletora, micro motor de ventilador.
// "recolhimento de folhas" e "alimentacao gasolina" estao na descricao do
// PROPRIO item de Praia Grande e nao deixam duvida: e maquina de varricao
// urbana, movida a gasolina. Nao se veta "a gasolina" solto porque gerador a
// gasolina e produto da casa e esta na lista de categorias.
"sobre reboque","aspirador urbano","recolhimento de folhas","alimentacao gasolina",
"porca flange","valvula de servico","valvula de servicos","kit placa","bolsa coletora",
"fita de pvc","micro motor","rede de gases",
// Varredura de 10/09/2026. Tres editais novos que nao sao da Digiplus:
//   Marechal Candido Rondon/PR — carreta reboque para equinos e bebedouro
//     australiano de gado, catalogados como "Reboque Transporte Animal" e
//     "Bebedouro Bovino";
//   Conquista D'Oeste/MT — "IMA DE GELADEIRA, IMPRESSAO EM PAPEL", brinde
//     personalizado que entrou pela palavra geladeira;
//   Goiania/GO — "Desumidificador De Papel", aparelho de arquivo para
//     documentos, nao o desumidificador de ambiente que a empresa vende.
"reboque transporte animal","bebedouro bovino","tipo australiano",
"ima de geladeira","ima geladeira","desumidificador de papel",
// Revisao dos 70 editais em 10/09/2026, item a item. Mais quatro que nao sao
// da Digiplus e entraram por uma palavra solta:
//   Francisco Beltrao/PR — "Conjunto de Bioterios completos para Ratos e
//     Camundongos": gaiola de laboratorio que entrou por trazer bebedouro;
//   Foz do Iguacu/PR — "material para laboratorio de enfermagem": forno de
//     calibracao de sensores e calandra rotativa. Cheguei a devolver a calandra
//     em 10/09/2026, achando que maquina de passar roupa industrial fosse
//     lavanderia; o usuario respondeu que calandra nao esta na lista de
//     produtos dele. Fica vetada;
//   Vale de Sao Domingos/MT — descascador de laranja MANUAL, de manivela;
//   Campinas/SP item 14 — espremedor de legume, manual, para alho. Utensilio,
//     nao aparelho, e o usuario confirmou em 10/09/2026 que nao cota.
"gaiola cobaia","bioterio","camundongo","forno calibracao","calandra rotativa",
"descascador manual","espremedor legume",
// O usuario conferiu a lista em 10/09/2026 e disse que a Digiplus nao cota:
// lousa interativa (a tela, de 52 a 86 polegadas, que aparecia em cinco
// editais), secadora de papeis, reservatorio de bebedouro solto, balanca
// veterinaria de pesagem de animais, espremedor de legume e calandra rotativa.
"lousa interativa","lousa digital","secadora papeis","secadora de papeis",
"reservatorio bebedouro","pesagem de animais",
"equipamento medico","peca / acessorio","peca/acessorio","acessorio para equipamento",
// Revisao dos 78 editais em 16/09/2026, item a item. Entraram por uma palavra
// da categoria, mas o produto e outro — e o nome dele abre a descricao:
//   Itai/SP — "KIT DE ANESTESIA HIPNOS PLUS COM VENTILADOR COMPLETO";
//   Juiz de Fora/MG — "Haltere ... forma: chaleira", peso de ginastica;
//   Pinhalao/PR — "Descascador Industrial ... aplicacao: cafe", maquina de
//     amostra de cafe para sala de prova, nao descascador de legume;
//   USP e UNIFEI — "Controle Remoto tipo: sem fio, aplicacao: aparelho ar
//     condicionado" e "Dreno Ar Condicionado" (bomba de dreno): peca, como os
//     itens de manutencao de Coxim/MS;
//   Cascavel/PR — "Termostato aplicacao: camara frigorifica", que o edital
//     descreve como aquecedor submerso de aquario;
//   Bento Goncalves/RS — "Grelha material: aco inoxidavel ... aplicacao:
//     churrasqueira", a grelha GN 1/1 de forno: utensilio, nao aparelho;
//   Lavras/MG — banho-maria de 90 tubos com "controle digital PID Fuzzy", de
//     laboratorio.
"anestesia","haltere","aplicacao: cafe","controle remoto tipo:","dreno ar condicionado",
"bomba dreno","termostato aplicacao","grelha material","pid fuzzy",
// Varredura de 16/09/2026: "Rolo Plastico Filme De Pvc ... podendo ir em
// freezers, geladeira e micro-ondas" (Dores de Guanhaes/MG) e o homogeneizador
// com banho-maria e a envasadora com balanca, de mel, da associacao de
// apicultores de Rosario do Sul/RS.
"filme de pvc","filme pvc","papel filme","rolo plastico","homogeneizador","envasadora",
// 17/09/2026: "Suportes para freezer medindo 740x710mm" (Triunfo/RS, movel de
// cozinha) e "Gas Refrigeracao ... R 22, aplicacao: central ar condicionado"
// (IF Sul de Minas, cilindro de gas).
"suporte para freezer","suportes para freezer","gas refrigeracao",
"protese","jateamento","agitacao de agua","aplicacao: laboratorio","uso laboratorial",
// 18/09/2026: com "umidificador" na busca vem o umidificador de OXIGENIO, de
// hospital ("Umidificador para O2", "Material Gasoterapia modelo: umidificador",
// "Umidificador de ar comprimido"), que nao e o umidificador de ambiente da casa.
// "oxigenio" solto nao: o aquecedor de ambiente anuncia que "NAO QUEIMA OXIGENIO".
"p/ oxigenio","para oxigenio","umidificador de oxigenio","umidificador oxigenio","cilindro de oxigenio",
"oxigenio medicinal","fluxometro","gasoterapia","ar comprimido","para o2",
// A lousa interativa ja estava vetada por decisao do usuario (10/09/2026, "a
// tela, de 52 a 86 polegadas"), mas so pelos nomes "lousa interativa" e "lousa
// digital": "TELA INTERATIVA 86 COM CAMERA" (Xangri-la/RS, R$ 2,1 milhoes),
// "Tela Interativa LED 75 polegadas" (Alegrete/RS) e "painel interativo" passavam.
"tela interativa","painel interativo","quadro interativo","lousa eletronica",
// 18/09/2026, da simulacao das regras novas sobre todos os itens do dia: com o
// edital nao caindo mais inteiro por uma palavra, apareceram itens que a regra
// antiga so escondia. Lavadora/secadora de PISO (Paranavai/PR, Nazareno/MG),
// conector "split-bolt" com hifen (Amparo/SP), manta termica de paciente
// (Governador Valadares/MG), circuito respiratorio de ventilador pulmonar
// (Flores de Goias/GO, Santana de Parnaiba/SP), termostato de aquario
// (Cascavel/PR), air bike e simuladores de academia (Santa Vitoria/MG,
// Saudade do Iguacu/PR), balde espremedor de mop, secadora de instrumental
// cirurgico e o kit de iluminacao para foto.
"secadora de piso","lavadora de piso","secadora automatica de piso","split-bolt","parafuso fendido",
"manta termica","p/ paciente","para paciente","circuito paciente","circuito respiratorio",
"aquario","air bike","eliptico","simulador de esqui","mop","instrumentais","produtos para saude",
"fotografia","caixa de desumidificacao","notebook","computador portatil",
// maquina de gelo nao e da casa (usuario, 18/09/2026)
"maquina de gelo","producao de gelo","fabricador de gelo","gerador de gelo",
// equipamento de laboratorio do IFNMG (Montes Claros/MG) e de Ponta Grossa/PR:
// chapa aquecedora de bancada e misturador de argamassa
"chapa aquecedora","misturador / amassadeira","misturador/amassadeira",
// 21/09/2026, editais novos da varredura: aspirador cirurgico de secrecao
// (Consorcio de Saude de Pato Branco/PR), berco aquecido neonatal
// (Bituruna/PR), peca de CATMAT "Ventilador / Exaustor Axial - Peca /
// Acessorio" (SAAE Lambari/MG), purificador de laboratorio por
// eletrodeionizacao ou destilacao (UFMT), revitalizacao de camara fria em
// alvenaria (UFPel)
"secrecoes","secrecao","neonatal","berco aquecido","recem-nascido","recem nascido","peca / acessorio",
"microventilador","eletrodeionizacao","destilacao","revitalizacao",
// e os de peca/utensilio, que so vetam na frente do produto (VETO_SO_NA_FRENTE)
"balde","filtro","suporte","rack","ferramenta","gaiola","jarra plastica","jarra graduada","jarra - do tipo","jarra do tipo","disco","kit manual","utensilio","tampo","granito","mesa de apoio"];

// 5.3e - termos de PECA ou ACESSORIO: so vetam quando vem antes do termo da
// categoria, isto e, quando sao o nome do produto (ver veto-item.mjs). Os outros
// termos da VETO_ITEM vetam em qualquer ponto da descricao.
const VETO_SO_NA_FRENTE = ["suporte para tv","suporte de tv","pedestal para","suporte pedestal","armario","prateleira",
"embalagem","embalag","saco","sabao","detergente","limpa forno","limpador","desengordurante","amaciante","lava roupas em po",
"refil","filtro refil","unidade filtrante","elemento filtrante","filtro purificacao","disco abrasivo","manta abrasiva",
"cooler","gabinete","nobreak","no-break","conector","gas refrigerante","gas refrigeracao","pecas e acessorios","pecas /","pecas/",
"peca / acessorio","peca/acessorio","acessorio para equipamento","placa eletronica","compressor","separador de oleo",
"resfriador de liquido","condensador","termometro","isqueiro","acendedor","garrafa plastica","pote plastico",
"suporte dispenser","dispenser","escova","carrinho","carro material","carro balde","panela","frigideira","copos","jogo 12",
"niple","kit registro","kit de limpeza","conjunto para limpeza","coletor lixo","martelo","coador de pano","coador pano",
"filtro ar condicionado","filtro de ar","controle de ventilador","controle universal","controle remoto universal",
"controle remoto tipo:","chave controle","botijao de gas","pano multiuso","cabine","torneira de parede","torneira para pia",
"tubo de ferro","tubo de cobre","tubo cobre","suporte para televis","suporte de televis","suporte de videocassete",
"tampao","resistencia aquecedor","luva termica","prato fundo","alicate","removedor de","ralador/fatiador","liner",
"placa aquecedora","boia para","porca flange","valvula de servico","valvula de servicos","kit placa","bolsa coletora",
"fita de pvc","micro motor","ima de geladeira","ima geladeira","reservatorio bebedouro","dreno ar condicionado",
"bomba dreno","termostato aplicacao","grelha material","filme de pvc","filme pvc","papel filme","rolo plastico",
"suporte para freezer","suportes para freezer","agricol",
"balde","filtro","suporte","rack","ferramenta","gaiola","jarra plastica","jarra graduada","jarra - do tipo","jarra do tipo","disco","kit manual","utensilio",
// 21/09/2026: "Tampo e rodatampo em granito para balcao de cozinha ... recorte
// para cuba, fogao cooktop" (Ipora do Oeste/SC) e "Mesa de apoio para forno"
// (Arvorezinha/RS). "Fogao ... com tampo de vidro" fica.
"tampo","granito","mesa de apoio"];

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
  'mesa auxiliadora','tipo balanca','paleteira','pilha tipo bateria',
  // Acrescentados em 04/09/2026, na conferencia item a item dos 291 itens do
  // lote. Os quatro primeiros nem balanca sao: a palavra aparece no meio da
  // descricao de outro produto — a incubadora neonatal que tem "modulo ii: c/
  // balanca", e a placa de PVC escrita "aguarde a sua vez para entrar na
  // balanca". Os demais sao balanca de pesar gente, que o usuario ja tinha
  // dito ser outro mercado, escritos de um jeito que a lista nao pegava.
  'incubadora','placa sinalizadora','sinalizadora','pesagem de pessoas',
  'balanca infantil','digital infantil','com regua','coluna articulada',
  // 16/09/2026: a semi-analitica de 0,001 g da UFSM e a rodoviaria de 120
  // toneladas, instalada e com obra civil, de Alcinopolis/MS
  'semi-analitica','semi analitica','semianalitica','rodoviaria',
  // 21/09/2026: balanca de banheiro e de bebe em compra de saude (Pato Branco/PR,
  // Rio Pardo de Minas/MG, Flores de Goias/GO). 180 kg e a capacidade da
  // balanca de pesar gente; a de plataforma comercial e 150, 200 ou 300 kg.
  '180 kg','180kg','de banheiro','plataforma em vidro','em vidro temperado','para bebe','recem-nascido','recem nascido','neonat'];

// ---------------------------------------------------------------- utilidades
// Cada linha de progresso sai carimbada com o tempo decorrido.
//
// Sem isso ninguem sabia quanto a varredura realmente levava: o teto do job no
// GitHub Actions foi calculado sobre "uns 12 minutos", a varredura cresceu para
// 101, e em 07/09/2026 as tres janelas do dia morreram no teto sem gerar erro
// nem aviso — o site ficou quatro dias parado. Estimativa nao medida foi o que
// escondeu o problema, entao agora toda rodada se cronometra.
const T0 = Date.now();
const escreveErr = process.stderr.write.bind(process.stderr);
process.stderr.write = (txt, ...resto) => {
  const s = Math.round((Date.now() - T0) / 1000);
  const carimbo = String((s / 60) | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + ' ';
  return escreveErr(String(txt).replace(/^(?=.)/gm, carimbo), ...resto);
};

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
const limpa = s => String(s ?? '').replace(/\s+/g, ' ').trim();

// O PNCP derruba conexoes (ECONNRESET) acima de ~6 requisicoes simultaneas.
// Concorrencia baixa + backoff exponencial mantem a varredura em 0 erros.
async function getJson(url, tent = 7) {
  for (let i = 0; i < tent; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
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
// Uma consulta por termo/UF, trazendo tudo de uma vez.
//
// Antes eram duas paginas de 50, e isso perdia edital em silencio. A lista vem
// ordenada por data e nao para de crescer enquanto a varredura roda: um edital
// publicado entre o pedido da pagina 1 e o da pagina 2 empurra todo mundo uma
// posicao para baixo, e quem estava na fronteira das duas paginas escorrega de
// uma para a outra sem aparecer em nenhuma. Foi o que aconteceu com
// Severinia/SP em 08/09/2026: ventiladores de R$ 210 mil, prazo no dia
// seguinte, portal BLL, passava em todos os filtros — e simplesmente nao
// estava na lista. Estava na posicao 51 de 115 para "ventilador"/SP.
//
// tam_pagina=500 devolve tudo num pedido so nos termos medidos (o maior era
// "material eletrico"/SP com 208), entao nao ha fronteira para escorregar. De
// quebra sao 352 consultas em vez de 704, o que encurta a fase mais demorada.
// Se algum termo passar de 500, o laco abaixo pega o resto.
const TAM_PAGINA = 500;
const jobs = [];
for (const t of TERMOS) for (const u of UFS) jobs.push([t, u, 1]);

process.stderr.write(`Buscas: ${jobs.length} consultas\n`);
const buscaUrl = ([t, u, p]) => `https://pncp.gov.br/api/search/?q=${encodeURIComponent(t)}&tipos_documento=edital&ordenacao=-data&pagina=${p}&tam_pagina=${TAM_PAGINA}&status=recebendo_proposta&ufs=${u}`;
let falhas = [];
const sobras = [];      // termos que passaram de TAM_PAGINA e pedem outra pagina
await pool(jobs, 6, async (j) => {
  try {
    const d = await getJson(buscaUrl(j));
    for (const it of (d.items || [])) res.set(it.numero_controle_pncp, it);
    const total = +d.total || 0;
    for (let p = 2; (p - 1) * TAM_PAGINA < total; p++) sobras.push([j[0], j[1], p]);
  } catch { falhas.push(j); }
});
if (sobras.length) {
  process.stderr.write(`  ${sobras.length} consulta(s) passaram de ${TAM_PAGINA} resultados\n`);
  await pool(sobras, 4, async (j) => {
    try {
      const d = await getJson(buscaUrl(j));
      for (const it of (d.items || [])) res.set(it.numero_controle_pncp, it);
    } catch { falhas.push(j); }
  });
}
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
// Nomear a consulta que ficou de fora: uma falha e um pedaco da varredura que
// nao aconteceu, e sem o termo/UF nao da para saber se o buraco importa.
const naoConsultados = falhas.map(([t, u, p]) => `${t}/${u} p${p}`);
process.stderr.write(`  ${res.size} editais unicos, ${errBusca} erros\n`);
if (errBusca) process.stderr.write(`  sem resposta: ${naoConsultados.join(', ')}\n`);

// ------------------------------------------- 2. veto por objeto + data valida
const hoje = new Date();
const cands = [];
let vObj = 0, vData = 0, vMod = 0, vOrgao = 0, vDevedor = 0;
const porDevedor = {};
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

  // 5.0c — devedor. Orgao que deve para a casa ou para as coligadas nao se cota
  // (decisao do usuario em 03/09/2026, lista de 13/07/2026). Aqui em cima, antes
  // da leitura de itens: e o filtro mais barato que existe, so compara nome.
  const dev = devedorDe(o.municipio_nome, o.uf, o.orgao_nome, o.unidade_nome, o.esfera_nome);
  if (dev) { vDevedor++; porDevedor[dev.nome] = (porDevedor[dev.nome] || 0) + 1; continue; }

  const f = o.data_fim_vigencia;
  const dt = f ? new Date(f) : null;
  if (!dt || isNaN(dt) || dt < hoje || dt.getFullYear() > 2030) { vData++; continue; }
  const txt = norm((o.description || '') + ' ' + (o.title || ''));
  if (vetoDoObjeto(txt)) { vObj++; continue; }
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
    o.__it = (Array.isArray(j) ? j : []).map(x => ({ d: x.descricao, m: x.materialOuServico, q: x.quantidade, v: x.valorUnitarioEstimado, u: x.unidadeMedida, n: x.numeroItem,
      b: x.tipoBeneficioNome, sit: x.situacaoCompraItemNome }));
  } catch { o.__it = null; }
});
const semItens = cands.filter(o => o.__it === null || o.__it === undefined);
if (semItens.length) {
  process.stderr.write(`  repescagem de ${semItens.length} leituras\n`);
  await pool(semItens, 2, async (o) => {
    try {
      const j = await getJson(itensUrl(o));
      o.__it = (Array.isArray(j) ? j : []).map(x => ({ d: x.descricao, m: x.materialOuServico, q: x.quantidade, v: x.valorUnitarioEstimado, u: x.unidadeMedida, n: x.numeroItem,
      b: x.tipoBeneficioNome, sit: x.situacaoCompraItemNome }));
    } catch { o.__it = null; }
  });
}
// O numeroItem do PNCP nem sempre e o numero do item.
//
// Em algumas compras o PNCP publica o ID interno no lugar da numeracao: Santo
// Antonio do Caiua/PR sai como 7965701, 7965702, 7965703 e o edital imprime
// 01, 02, 03. Quem le o resumo cota "o item 7965701", que nao existe.
//
// Nao se reescreve por suspeita: so quando a compra INTEIRA e uma corrida
// contigua que comeca alto demais para ser numeracao (a leitura sempre parte
// da pagina 1, entao numeracao de verdade comeca em 1). Ai a posicao na lista
// e o numero impresso — conferido no texto do edital de Santo Antonio do
// Caiua/PR (01, 02, 03), Barra do Garcas/MT (8), Itapirapua/GO (02) e Vale de
// Sao Domingos/MT (82).
function corrigeNumeracao(lista) {
  if (!Array.isArray(lista) || lista.length < 2) return lista;
  const ns = lista.map(x => x.n);
  if (ns.some(n => !Number.isInteger(n))) return lista;
  const contigua = ns.every((n, i) => i === 0 || n === ns[i - 1] + 1);
  if (!contigua || ns[0] <= 10000 || ns[0] <= lista.length) return lista;
  const base = ns[0];
  for (const x of lista) x.n = x.n - base + 1;
  return lista;
}
let idTrocado = 0;
for (const o of cands) {
  if (!o.__it) continue;
  const antes = o.__it.length ? o.__it[0].n : null;
  corrigeNumeracao(o.__it);
  if (o.__it.length && o.__it[0].n !== antes) idTrocado++;
}
if (idTrocado) process.stderr.write(`  ${idTrocado} compras vinham com ID no lugar do numero do item; renumeradas
`);

errItens = cands.filter(o => !o.__it).length;
process.stderr.write(`  ${errItens} erros\n`);

// ------------------------------------------------- 4. cinco filtros + dedupe
// A categoria e a do termo que aparece PRIMEIRO na descricao, que e o nome do
// produto: "Coifa para fogao industrial inox" (Triunfo/RS) e coifa, e caia em
// Coccao so porque a lista de Coccao vem antes na tabela (17/09/2026).
// O termo que aparece como USO de outro produto ("apto para micro-ondas",
// "aplicacao: refrigerador") nao conta: ver criaPosicaoDoTermo no veto-item.mjs.
const posicaoDoTermo = criaPosicaoDoTermo(CAT);
const classifica = d => { const m = posicaoDoTermo(d); return m ? m.c : null; };
// Termo que so aparece depois do caractere 400 de uma descricao longa nao e o
// produto, e citacao ou peca: "CONJUNTO REFEITORIO COM TAMPO INJETADO ... 10
// LUGARES" (Morrinhos/GO) entrou como Lavanderia pela palavra "calandra" na
// posicao 1.121. Nos 214 itens legitimos de 15 a 17/09/2026 o termo nunca
// passou da posicao 225.
const TERMO_LONGE = 400;

// Beneficio em uma letra. O PNCP manda a frase por extenso em cada item.
const beneficio = s => {
  const t = norm(s);
  if (t.includes('exclusiva')) return 'E';
  if (t.includes('cota')) return 'C';
  if (t.includes('sem beneficio')) return 'S';
  return '';
};

// 5.7 - item ja cancelado. O PNCP mantem no /itens o que foi anulado, revogado
// ou cancelado, e sem olhar isso o resumo mandava cotar item morto: eram 96 na
// varredura de 01/09/2026. So o item sai; o edital continua pelos outros.
const itemVivo = s => !norm(s).includes('anulado');
// 5.3c - "projetor" veta projetor de video avulso, que nao e produto da casa,
// mas lousa digital costuma ser descrita "com projetor integrado" e seria
// derrubada junto. Escopar o veto para fora da categoria LD resolve sem ter de
// adivinhar o contexto pelo texto — mesmo recurso do VETO_RF_CIENT.
const VETO_FORA_DE = { projetor: 'LD' };
const vetoDoItem = criaVetoItem({ VETO_ITEM, VETO_SO_NA_FRENTE, VETO_FORA_DE, RE_VAN, posicaoDoTermo });
const temVeto = (d, cat) => !!vetoDoItem(d, cat);

let vPiso = 0, vCient = 0, vBalanca = 0, vCancel = 0;
const st = { objServ: 0, itemServ: 0, itemInstala: 0, semItem: 0, ok: 0 };
const bruto = [];
for (const o of cands) {
  const obj = norm((o.description || '') + ' ' + (o.title || ''));
  const objLimpo = objetoSemKit(obj);
  let instalaNoObjeto = false;
  if (servicoEm(SERV_OBJ, objLimpo, o.uf)) {
    const soInstalacao = !objLimpo.includes('mao de obra');
    if (soInstalacao && (objetoMisto(objLimpo) || OBJ_CONDICIONAL.test(objLimpo))) instalaNoObjeto = true;
    else { st.objServ++; continue; }
  }

  const interesse = [];
  let servico = false;
  for (const it of (o.__it || [])) {
    const d = norm(it.d);
    const cat = classifica(d);
    if (!cat || posicaoDoTermo(d).i > TERMO_LONGE) continue;
    if (it.m !== 'M') { if (soInstala(d, o.uf)) continue; servico = true; break; }
    // o servico cadastrado como material abre a descricao: "Instalacao Split
    // 9.000 12.000 BTUs", "Reposicao de gas para Split", "Higienizacao Split"
    // (Cachoeira do Sul/RS), "SERVICO MANUTENCAO: calibracao das balancas"
    // (Osorio/RS). A mesma palavra DEPOIS do aparelho e descricao dele.
    // Tem de ABRIR a descricao: "Esponja de limpeza (lava loucas)" e esponja,
    // e derrubava o edital de limpeza de Herculandia/SP com o aspirador junto.
    const serv = SERVICO_NA_FRENTE.exec(d.replace(/^[^a-z]*(?:\d+\s*-\s*)?/, ''));
    if (serv && serv.index === 0) {
      if (UF_INSTALA.has(o.uf) && /instalacao|montagem/.test(serv[0]) && !/desinstalacao/.test(serv[0])) continue;
      servico = true; break;
    }
    if (SERVICO_NO_MATERIAL.test(d)) { servico = true; break; }
    if (!UF_INSTALA.has(o.uf) && (INSTALACAO_NO_MATERIAL.test(d) || (instalaNoObjeto && instalavel(d, cat)))) { st.itemInstala++; continue; }
    interesse.push([cat, it, d]);
  }
  if (servico) { st.itemServ++; continue; }

  const keep = [];
  for (const [cat, it, d] of interesse) {
    if (temVeto(d, cat)) continue;
    if (cat === 'RF' && VETO_RF_CIENT.some(v => d.includes(v))) { vCient++; continue; }
    if (cat === 'BL' && VETO_BL_MEDICA.some(v => d.includes(v))) { vBalanca++; continue; }
    if (!itemVivo(it.sit)) { vCancel++; continue; }
    const v = +it.v || 0;
    if (v > 0 && v < PISO_ITEM && !SEM_PISO.some(p => d.includes(p)) && !salvoPeloVolume(v, +it.q || 0)) continue;
    // Posicoes 0-3 sao as antigas; 4 e 5 vieram com o resumo mais completo
    // (01/09/2026) e 6 logo depois. Acrescente sempre no fim: a pagina le por indice.
    //
    // O beneficio vai como letra para nao repetir a frase inteira 12 mil vezes
    // no JSON: E = exclusiva ME/EPP, C = cota reservada, S = sem beneficio.
    // Nao e detalhe: 41% dos itens da varredura de 01/09 sao exclusivos de
    // ME/EPP, e quem nao e ME/EPP nem pode disputar.
    keep.push([cat, Math.round(+it.q || 0), Math.round(v * 100) / 100, limpa(it.d),
               limpa(it.u), +it.n || 0, beneficio(it.b)]);
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
    // acrescentados em 01/09/2026: abertura das propostas, esfera do orgao e
    // situacao do edital. A abertura e o que diz quando a sessao comeca — o
    // encerramento sozinho nao contava metade da historia.
    abre: o.data_inicio_vigencia || null, esfera: limpa(o.esfera_nome),
    sit: limpa(o.situacao_nome), portal: null, exige: null,
    // para montar o link do Compras.gov.br quando o PNCP nao traz (participar.mjs)
    uasg: String(o.unidade_codigo || ''), modId: Number(o.modalidade_licitacao_id) || 0,
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

// ------------------------------------------------ 4c. filtro por portal
// Serializado de proposito: a API de consulta tem cota curta e uma rajada
// derruba tudo por 30 s. Sao uns 250, entao custa uns 5 min.
process.stderr.write('Portais: ' + fin.length + ' consultas (serializadas)\n');
let vPortal = 0, errPortal = 0;
const porPortal = {};
// API fora do ar: depois de 6 sem resposta seguidos para de insistir edital
// por edital e so testa de novo a cada 20. Os que ficam sem consulta seguem a
// regra do "sem resposta" logo abaixo (valem pela plataforma escrita no edital).
let seguidas = 0, pulados = 0;
for (let i = 0; i < fin.length; i++) {
  const e = fin[i];
  if (seguidas >= 6 && i % 20) { e.portal = null; errPortal++; pulados++; continue; }
  e.portal = await buscaPortal(e);
  if (e.portal === null) { errPortal++; if (++seguidas === 6) process.stderr.write('  a API de consulta nao responde; testando so a cada 20\n'); }
  else { seguidas = 0; porPortal[e.portal] = (porPortal[e.portal] || 0) + 1; }
  if ((i + 1) % 50 === 0) process.stderr.write(`  ${i + 1}/${fin.length}\n`);
  await new Promise(x => setTimeout(x, 1200));
}
// Quem publicou num portal da casa fica. Os outros — publicados pelo sistema de
// gestao da prefeitura, ou sem resposta da consulta — valem pela plataforma
// escrita no edital (ver plataforma.mjs): Vila Flores/RS publica pela Tecnosweb
// e disputa no Pregao Banrisul, e fica; Pitangueiras/SP disputa no Licitar
// Digital, e sai, mesmo no dia em que a consulta falha. Ate 17/09/2026 a falha
// da consulta mantinha o edital e o publicador de fora o tirava, e a lista
// oscilava conforme a API respondia.
//
// Sem resposta E sem plataforma legivel no edital, o edital FICA: falha de rede
// nao pode virar exclusao silenciosa.
let vPortalTexto = 0;
const decide = new Map();
// Com teto de 60 min: com a consulta fora do ar sao uns 240 editais a ler, e em
// 21/09/2026 esta leitura levou quase 3 h. Passado o teto, o que falta fica
// sem plataforma lida — o sem resposta fica, o publicador de fora sai.
const tetoPlataforma = Date.now() + 60 * 60 * 1000;
let semTempo = 0;
await pool(fin.filter(e => !(e.portal !== null && portalOk(e.portal))), 4, async (e) => {
  if (Date.now() > tetoPlataforma) { semTempo++; return; }
  const linha = []; linha[7] = e.path;
  decide.set(e, await plataformaDoEdital(linha, e.obj));
});
if (semTempo) process.stderr.write(`  ${semTempo} sem plataforma lida: passou o teto de 60 min\n`);
const finP = fin.filter(e => {
  if (e.portal !== null && portalOk(e.portal)) return true;
  const plat = decide.get(e);
  if (plat && plat.daCasa) { vPortalTexto++; return true; }
  if (e.portal === null && !plat) return true;
  vPortal++; return false;
});
process.stderr.write(`  ${vPortal} fora dos portais da casa, ${vPortalTexto} ficam pela plataforma escrita no edital, ${errPortal} sem resposta${pulados ? ` (${pulados} nem consultados: API fora do ar)` : ''}\n`);
fin.length = 0; fin.push(...finP);



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
      const h = await fetch(`${base}/${a.sequencialDocumento}`, { method: 'HEAD', signal: AbortSignal.timeout(PRAZO_CONSULTA) });
      if (h.ok) {
        const real = extDe(nomeDoCd(h.headers.get('content-disposition')));
        if (real) e.arqExt = real;
      }
    } catch { /* fica a extensao do titulo, se houver */ }
  } catch { errArq++; }
});
process.stderr.write('  ' + errArq + ' erros\n');

// ------------------------------------ 4d. exigencias que impedem participar
// A ORDEM IMPORTA e ja quebrou uma vez: esta fase precisa do e.arq, que so
// existe depois do 4b. Rodando antes, todo edital caia em "sem-arquivo" e a
// analise nao avaliava nenhum — sem erro, sem aviso, so zeros nas estatisticas.
// Amostra, comprovacao de sustentabilidade, carta de solidariedade e garantia
// contratual: se o edital EXIGE qualquer uma delas, a Digiplus nao disputa.
// So o que e obrigatorio derruba — "podera solicitar", "caso o TR exija" e
// "reserva-se no direito" ficam, por decisao do usuario em 02/09/2026.
//
// O texto so existe dentro do PDF do orgao, entao esta fase baixa o edital de
// cada um: uns 0,6 GB e 10 min para 250. E o preco de nao mandar cotar edital
// que a casa nao pode disputar.
const LE = createRequire(import.meta.url)(path.join(DIR, 'docs', 'pdf-le.js'));
process.stderr.write('Exigencias: ' + fin.length + ' editais\n');
let vExige = 0, semTexto = 0, errExige = 0;
const porExigencia = {};
let feitosEx = 0;
await pool(fin, 4, async (e) => {
  e.exige = null;
  if (String(e.arqExt).toLowerCase() !== 'pdf' || !e.arq) { e.exige = 'sem-arquivo'; return; }
  try {
    const [c, a, s] = e.path.split('/');
    const r = await fetch(`https://pncp.gov.br/api/pncp/v1/orgaos/${c}/compras/${a}/${s}/arquivos/${e.arq}`, { signal: AbortSignal.timeout(PRAZO_ARQUIVO) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const le = await LE.abre(new Uint8Array(await r.arrayBuffer()));
    const pgs = await textoDasPaginas(le);
    // PDF digitalizado: nao da para afirmar nem que exige nem que dispensa.
    if (!textoUtil(pgs)) { e.exige = "sem-texto"; semTexto++; return; }
    e.exige = analisaExigencias(pgs).bloqueia;
  } catch { e.exige = 'erro'; errExige++; }
  if (++feitosEx % 50 === 0) process.stderr.write(`  ${feitosEx}/${fin.length}\n`);
});

// Sai so quem EXIGE de verdade. Nao avaliado (sem texto, sem arquivo, erro)
// continua na lista, marcado, para conferencia humana — nunca sumir calado.
const finE = fin.filter(e => {
  if (!Array.isArray(e.exige) || !e.exige.length) return true;
  vExige++;
  e.exige.forEach(x => { porExigencia[x] = (porExigencia[x] || 0) + 1; });
  return false;
});
process.stderr.write(`  ${vExige} com exigencia impeditiva, ${semTexto} sem texto, ${errExige} erro\n`);
fin.length = 0; fin.push(...finE);

st.vPortal = vPortal;
st.vPortalTexto = vPortalTexto;
st.errPortal = errPortal;
st.porPortal = porPortal;
st.vExige = vExige;
st.semTextoExige = semTexto;
st.errExige = errExige;
st.porExigencia = porExigencia;
st.final = fin.length;
st.porUf = {};
for (const e of fin) st.porUf[e.uf] = (st.porUf[e.uf] || 0) + 1;

// ---------------------------------------------------------------- 5. saidas
// Data em America/Sao_Paulo, nao em UTC: rodando de noite no Brasil o toISOString
// ja virou o dia e a varredura saia carimbada com a data de amanha.
const hojeISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const resumo = { consultas: jobs.length, errBusca, unicos: res.size, vMod, porModalidade, vOrgao, vDevedor, porDevedor, vCient, vBalanca, vCancel, vPiso, vObj, vData, candidatos: cands.length, errItens, ...st };
const bruta = { st: resumo, editais: fin };

// A saida bruta nao vai para o git (uns 320 KB por dia). O que o site consome
// eh docs/dados.json, gerado pelo publicar.mjs a partir de dados/ultima.json.
const saida = path.join(DIR, 'dados');
fs.mkdirSync(saida, { recursive: true });
fs.writeFileSync(path.join(saida, 'dados-' + hojeISO + '.json'), JSON.stringify(bruta), 'utf8');
fs.writeFileSync(path.join(saida, 'ultima.json'), JSON.stringify(bruta), 'utf8');

console.log(JSON.stringify(resumo, null, 1));
