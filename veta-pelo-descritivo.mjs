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
import { criaVetoItem, criaPosicaoDoTermo, OBJ_CONDICIONAL, instalavel, amassadeiraRapida, chaleiraDeFogao, lavaLoucas, criaCotaNaUf, MO_NA_FRENTE } from './veto-item.mjs';
import { limpaTextoPncp } from './texto-pncp.mjs';
import { marcaCotas } from './cota.mjs';
import { vendaPorLote, totaisPorLote, lotesPelosTotais, lotesPelaTabelaDeGrupo, lotesPeloRotulo, lotesPelaColunaDoLote, lotesPelaLinhaComLote, lotesPorFaixa, lotesPorSecao,
  lotesLoteUnico, lotesPelaTabelaLoteItem, lotesPeloTextoDoItem, lotesPorFaixaDeItens, lotesPorSecaoComItem, lotesPelaLinhaLoteNome, lotesUmItemPorLote, lotesPelaTabelaLoteItemNome,
  lotesPeloCabecalhoDoGrupo } from './lotes.mjs';

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
  // e o freezer de ultrabaixa temperatura, "-50 a -86 °C" (Paranavai/PR,
  // item 24, que o catalogo chama de "Refrigerador Alimentos", 22/09/2026)
  // (e escrito com espaco, "temperatura operação: - 50 a - 86", Belo Horizonte/MG,
  // contratacao direta 439, item 7, 20/10/2026)
  RF: ['imunobiolog', 'termolab', 'hemocompon', 'vacina', '-86', '-80 °c', 'a - 86', 'a - 80', '- 86 °c', '- 80 °c', 'ultrabaix', 'ultra baix',
    // e o banco de gelo de processo (Blumenau/SC, edital 458, item 14, 15/10/2026)
    'banco de gelo', 'pasteuriz'],
  // e o banho-maria de controle digital com precisao de decimo de grau, que e de
  // laboratorio (IF Sudeste MG, Juiz de Fora, item 57, 22/09/2026)
  // (e o de calibracao, "Banho maria digital, 2 a 4 litros com calibracao ... variacao
  // maxima aceitavel de 0,5°C", DMAE de Porto Alegre/RS, 06/10/2026)
  // (e o "Banho maria Beads, 5L" de laboratorio, de microesferas no lugar da
  // agua, R$ 18 mil: UEM, Maringa/PR, edital 236, item 1, 20/10/2026)
  CC: ['banho maria de laboratorio', 'banho-maria de laboratorio', 'aplicacoes laboratoriais', 'uso laboratorial', 'pid fuzzy', 'precisao de controle', 'calibracao', 'variacao maxima aceitavel', 'beads',
    // (e o atributo do PNCP, "Banho-maria, USO: Laboratorial", UEM, Maringa/PR, edital 1583, item 15, 27/10/2026)
    'uso: laboratorial',
    // (e o da Unioeste, "estabilidade em agitação de ± 2°C ... resistente a produtos
    // químicos corrosivos", Toledo/PR, edital 20, item 2, e o de "tubos de ensaio" de
    // Varginha/MG, PE 112, 28/10/2026)
    'estabilidade em agitacao', 'produtos quimicos corrosivos', 'tubos de ensaio', 'tubo de ensaio'],
  // (e o purificador de osmose reversa de laboratorio: "água com elevado grau de
  // pureza ... atendendo as exigências laboratoriais ... substituição do uso de
  // destiladores", FMRP-USP, Ribeirao Preto/SP, edital 186, item 5, 21/10/2026)
  BB: ['laboratorial', 'laboratoriais', 'destiladores', 'elevado grau de pureza'],
  CX: ['soldagem', 'fumaca de bancada'],
  // a balanca de pesar gente, de bebe e de laboratorio, a mesma lista do
  // varredura.mjs (a categoria voltou em 14/10/2026)
  BL: lista('VETO_BL_MEDICA'),
  // a mesa inox de hospital, clinica e laboratorio (a categoria entrou em 15/10/2026)
  // e a de tampo de MDF, madeira, granito (so aqui, no texto do edital)
  MI: [...lista('VETO_MI'), ...lista('VETO_MI_TAMPO')],
  // lavanderia hospitalar (Sonora/MS, 21/09/2026)
  LV: ['hospitalar', 'barreira sanitaria',
    // e a lavadora/secadora de PISO, que o VETO_ITEM ja tira pelo nome do PNCP
    // mas que o PNCP pode chamar de "Lavadora Alta Pressao": os itens 12 e 62 de
    // Paranavai/PR (edital 16) sao "Lavadora/secadora de piso (compacta) ...
    // Acionamento a bateria ... similar a marca Karcher" no edital (14/10/2026)
    'secadora de piso', 'lavadora de piso', 'lavadora de pisos', 'lavadora/secadora de piso', 'automatica de piso'],
  // o aquecedor halogeno saiu do radar (usuario, 30/09/2026); a mesma lista do
  // varredura.mjs (VETO_OT_HALOGENO), so na categoria dele
  OT: ['halogen', 'alogen', ...lista('VETO_OT_ANIMAIS')],
  // Em qualquer categoria: o item 16 da EBSERH Santa Maria/RS e "Ventilador
  // tipo: parede, potencia motor: 500" no catalogo e "Longarina de espera com
  // 03 (tres) lugares de assento" no anexo de descricao detalhada (18/09/2026).
  // E o absorvedor de umidade de silica ou de saco, que o catalogo chama de
  // "Desumidificador ... ambiente com 300 m²" (Cascavel/PR, itens 48 e 76,
  // 22/09/2026).
  // (e o aparelho ALUGADO por diaria: "Bebedouro, tipo geladeira, para galao ...
  // unidade/diaria", Porto Alegre/RS, edital 340, locacao de estrutura de evento)
  TODAS: ['longarina de espera', 'absorvedor de umidade', 'gel de silica', 'saco de absorcao', 'caixa de desumidificacao', 'unidade/diaria'],
};
// O descritivo que ABRE com produto que a Digiplus nao cota (regra 3c do
// README; exaustor, coifa e depurador sairam em 23/09/2026, e a coifa voltou em
// 14/10/2026 — exaustor e depurador seguem fora): o item 7 de Foz do
// Iguacu/PR e "Ventilador Axial tipo: helice, tipo corpo: semiduto" no catalogo
// e "Exaustor de ar - tipo: exaustor de ar; ... adequado para instalacao em
// parede" no edital (29/09/2026). So na abertura: "ventilador com funcao
// exaustor" continua ventilador. E o "VENTILADOR/ EXAUSTOR INDUSTRIAL MODELO
// 400MM ... ROTACAO 1750RPM", com os dois nomes do mesmo aparelho na abertura
// (Assis Chateaubriand/PR, item 291, 07/10/2026), e exaustor.
// E o pass-through, aquecido ou refrigerado (usuario, 14/10/2026: "pass-through
// nao cotamos"): o item 68 de Bento Goncalves/RS (edital 442) e "Forno
// Industrial tipo: resistivo" no catalogo e "PASS-THROUGH AQUECIDO EM ACO INOX -
// CAPACIDADE PARA 24 GNS 1/1" no edital.
// E o desumidificador (usuario, 15/10/2026: "desumidificador de ar tambem nao cotamos").
const ABRE_FORA_DO_RADAR = /^[^a-z]*(?:ventilador\s*\/\s*|ventilador\s+(?=exaustor\s+industrial))?(exaustor|depurador|pass[\s-]?(?:through|thru)|desumidificador(?:es)?|chapa\s+(?:bifeteira|para\s+grelhar|de\s+grelhar|lisa|a\s+gas|industrial|de\s+coccao|assadeira)|chapeira|char\s?broiler)\b/;
// O ar-condicionado que exige Wi-Fi (usuario, 22/10/2026: "neste edital, pede WI-FI
// em alguns ar condicionados" — e escolheu tirar do radar): "SMART COM CONEXÃO
// WI-FI" (UTFPR, Cornelio Procopio/PR, edital 198), "controle via wi-fi" (Relvado/RS),
// "conexão wifi, função SmartThings" (Davinopolis/GO). O "Wi-Fi opcional", "com ou
// sem Wi-Fi" e o "não é obrigatório" ficam. Em edital por lote, o aparelho fica em
// cinza no lote.
const AR_CONDICIONADO = /ar[- ]?condicionad|arcondicionad|condicionador(?:es)? de ar|\bsplit\b|piso[ /-]?teto|cassete|hi[- ]?wall/;
const WIFI = /wi[\s-]?fi\b|\bwifi\b/;
const WIFI_OPCIONAL = /(?:opcional|opcionalmente|desejavel|preferencialmente|nao (?:e |sera |sendo )?(?:obrigatori|necessari|exigid)|dispensad|com ou sem)[^.;]{0,40}(?:wi[\s-]?fi\b|\bwifi\b)|(?:wi[\s-]?fi\b|\bwifi\b)[^.;]{0,30}(?:opcional|desejavel|nao (?:e |sera )?obrigatori|se houver|quando disponivel)/;
const pedeWifi = t => WIFI.test(t) && !WIFI_OPCIONAL.test(t);
// (a "CHAPA BIFETEIRA A GÁS LISA" que o catalogo chama de "Fogão Industrial ...
// chapa bifeteira": Cornelio Procopio/PR, edital 198, item 73, 21/10/2026)

// E as listas do catalogo, sobre a descricao do PNCP, do mesmo jeito que o
// varredura.mjs as aplica: termo novo entra no dados.json ja publicado sem
// esperar a proxima varredura.
const VETO_OBJ_SEMPRE = JSON.parse((fonte.match(/const VETO_OBJ_SEMPRE = new Set\((\[[^\]]*\])\)/) || [, '[]'])[1]);
const VETO_ITEM = lista('VETO_ITEM'), VETO_RF_CIENT = lista('VETO_RF_CIENT');
const RE_VAN = /(^|[^a-z])vans?([^a-z]|$)/;       // o mesmo do varredura.mjs
const VETO_FORA_DE = { projetor: 'LD', 'em mdf': 'CL', 'de mdf': 'CL', veicul: 'LV', fisioterapia: 'MO' };  // idem
// A tabela de categorias e o limite de posicao do termo, tambem do varredura.mjs:
// a categoria e a do termo que aparece primeiro, e termo muito para o fim da
// descricao nao e o produto (ver TERMO_LONGE la).
const blocoCat = fonte.slice(fonte.indexOf('const CAT = ['), fonte.indexOf('\n];', fonte.indexOf('const CAT = [')) + 3);
const CAT = eval(blocoCat.replace('const CAT = ', ''));
// As categorias suspensas (varredura.mjs, CATEGORIAS_SUSPENSAS): o item sai e o valor
// dele conta para o piso do edital (as balancas, 30/10/2026)
const SUSPENSAS = lista('CATEGORIAS_SUSPENSAS');
const TERMO_LONGE = Number((fonte.match(/const TERMO_LONGE = (\d+)/) || [])[1]) || 400;
// o termo citado como uso de outro produto nao conta (ver veto-item.mjs)
const termoMaisCedo = criaPosicaoDoTermo(CAT);
const cotaNaUf = criaCotaNaUf(termoMaisCedo);
// o veto por item com a mesma regra do varredura.mjs: termo de peca so conta
// quando vem antes do produto (ver veto-item.mjs)
const vetoItem = criaVetoItem({ VETO_ITEM, VETO_SO_NA_FRENTE: lista('VETO_SO_NA_FRENTE'), VETO_FORA_DE, RE_VAN, posicaoDoTermo: termoMaisCedo });
const vetoDoCatalogo = (d, cat) => ((termoMaisCedo(d) || { i: 0 }).i > TERMO_LONGE && 'termo da categoria so no fim da descricao')
  || vetoItem(d, cat)
  || (cat === 'RF' && VETO_RF_CIENT.find(v => d.includes(v)));

// Aparelho que o edital manda entregar instalado sai, menos no RS e em SC, onde a
// Digiplus instala (decisao do usuario, 17/09/2026; o lado do catalogo esta no
// 5.1b do varredura.mjs). So frase que OBRIGA: "acessorios necessarios para
// instalacao", "facil instalacao", "instalacao em parede", "kit de instalacao" e
// "sem instalacao" descrevem o produto e ficam. Casos de 17/09: Palmeiras de
// Goias/GO ("deverao ser entregues instalados e em perfeito funcionamento"),
// Mariopolis/PR ("devidamente instalado, no local de entrega") e Santa Rita do
// Passa Quatro/SP (BEC: "treinamento, instalacao e assistencia tecnica").
const UF_INSTALA = new Set(['RS', 'SC']);
// o item de SERVICO de instalacao do aparelho, entre os itens do edital:
// "INSTALACAO DE AR 60.000 BTUS", "46895 - INSTALACAO DE CONDICIONADOR DE AR
// CASSETE", "Ar condicionado - instalação/montagem/desmontagem/remoção"
// (e o servico de engenharia do catalogo, "Serviço Engenharia Serviço de Retrofit e
// ...", no lote unico da manutencao das estacoes da Telebras, Brasilia/DF, edital
// 42/2026, com o split piso-teto e o dutado no meio, 21/10/2026)
const ITEM_DE_INSTALACAO = /^(?:\d{3,7}\s*-\s*)?(?:servicos? de |mao de obra (?:para |de )?)?(?:instalac|montagem)|ar[ -]?condicionado\s*-\s*instalac|instalacao\/montagem|^servicos? (?:de )?engenharia/;
// As UFs atendidas, do varredura.mjs: o edital de UF que saiu (MT, em 05/10/2026)
// sai tambem da lista ja publicada, sem esperar a proxima varredura.
const UFS_ATENDIDAS = new Set(JSON.parse((fonte.match(/const UFS = (\[[^\]]*\])/) || [, '[]'])[1]));
// E o orgao vetado (militar e policia), tambem do varredura.mjs: as unidades de
// policia e bombeiros da Secretaria da Seguranca Publica de SP entraram em
// 06/10/2026 com nomes abreviados que o veto ainda nao pegava
const VETO_ORGAO = lista('VETO_ORGAO');
const EXIGE_INSTALACAO = [
  /entregues? (devidamente )?instalad[oa]s?/,
  // "DEVERÁ SER FORNECIDA COM TODOS OS MATERIAIS NECESSÁRIOS PARA SUA
  // INSTALAÇÃO E INSTALADA (DUTOS, FIXADORES...)" (Assis Chateaubriand/PR,
  // edital 30, itens 233 e 234, coifas, 14/10/2026)
  /(?:fornecid|entregu|entregad)[oae]s?\b[^.;]{0,120}?\be instalad[oa]s?\b/,
  /devidamente instalad[oa]s?/,
  /instalad[oa]s? e em (perfeito )?funcionamento/,
  /fornecimento e instalacao/,
  // "APARELHO AR CONDICIONADO 9.000 BTUS – Tipo SPLIT HI WALL Aquisição e
  // Instalação" (Goiania/GO, edital 115, item 2, 13/10/2026)
  /aquisicao e instalacao/,
  // (e "Motor e instalação inclusos" das coifas de Balsa Nova/PR, dispensa 22,
  // 28/10/2026; nao o "kit de instalacao incluso", que e acessorio do aparelho)
  /(?<!(?:kit|acessorios?|materia(?:l|is)|suportes?|pecas?)(?: de| para)? )instalacao (?:inclus[ao]s?|incluid[ao]s?|inclusive)/,
  // "...filtro de ar removível e lavável, com instalação e funcionamento conforme
  // especificações do fabricante" (Urania/SP, edital 27, item 11; usuario, 29/10/2026:
  // "urania/sp pede instalação entao pode tirar")
  /com (?:a )?instalacao e (?:o )?funcionamento/,
  // (nao o "nao incluindo montagem, instalacao fisica" de Caraguatatuba/SP,
  // edital 32, item 1, 20/10/2026)
  /(?<!nao )(incluindo|inclusa|incluida|inclusive) (a )?instalacao/,
  // "Inclui instalacao padrao completa por profissional habilitado" (Goioxim/PR, 29/09/2026)
  /(?<!nao )inclui (a )?instalacao/,
  // "INCLUSO: INSTALACAO DO EQUIPAMENTO INCLUINDO CORTE DA PAREDE" e "A
  // INSTALACAO DO APARELHO NO LOCAL INDICADO PELO REQUISITANTE DEVE ESTAR
  // INCLUIDA NO PRECO" (Assis Chateaubriand/PR, 30/09/2026)
  /inclus[oa]s?:? (a )?instalacao/,
  /instalacao[^.;]{0,80}deve(ra)? estar inclu(sa|ida) no preco/,
  /instalacao e assistencia tecnica/,
  // "...GARANTIA TOTAL DE NO MINIMO 12 MESES, INCLUINDO COMPRESSOR E PROTECAO
  // ANTI-CORROSIVO, COM INSTALACAO" no fim da frase (Guiratinga/MT, edital 047,
  // item 2, 05/10/2026). "Com instalacao em parede" e "compativel com
  // instalacao" continuam, que ali a frase segue.
  // (nao o "compativel com a instalacao;" da rede eletrica: "admitindo-se
  // equipamento bivolt ou configuracao compativel com a instalacao; frequencia
  // de operacao de 60 Hz" — Rio Azul/PR, edital 98, item 10, aspirador, 13/10/2026)
  /(?<!(?:sem|nao|compativel|compatibilidade) )\bcom (a )?instalacao\s*(?:[.;]|$)/,
  // "com mao de obra de instalacao e drenos" (Sertanopolis/PR, 21/09/2026)
  // (nao quando a frase diz que NAO inclui: "Não estão incluídos serviços de
  // instalação, montagem em parede ... ou mão de obra de instalação", "sem
  // inclusão de serviços de instalação" — Ubiratã/PR, edital 18, 21/10/2026)
  // (e "A ausência de contratação dos serviços de instalação não afasta a
  // responsabilidade da fornecedora", o mesmo edital, item 2)
  /(?<!(?:nao|sem|ausencia|exceto|excluid[oa]s?)\b[^.;]{0,300})(mao de obra|servicos?) de (instalacao|montagem)/,
  // o INSTALADO no nome do produto: "AR CONDICIONADO 9000 BTU'S INSTALADO -
  // FRIO", "AR CONDICIONADO INSTALADO - AR-CONDICIONADO TIPO SPLIT TETO",
  // "CORTINA DE AR ... (EQUIPAMENTO INSTALADO)" (Tres Pontas/MG, edital 88,
  // 20/10/2026). "Instalado em parede" descreve o aparelho e fica.
  /^[^.;]{0,80}?\binstalad[oa]s?\s*(?:[-–(:]|$)/,
  // "ATENÇÃO: O fornecimento dos aparelhos de ar-condicionado deverá contemplar,
  // obrigatoriamente, a instalação completa dos equipamentos no Campus" (UFTM,
  // Uberaba/MG, edital 251, item 30, 20/10/2026)
  /(?:contemplar|contempla|prever|preve|abranger|abrange)[^.;]{0,40}\binstalacao (?:completa|dos equipamentos|do equipamento|dos aparelhos|do aparelho)/,
  /\(equipamento instalado\)/,
  /instalacao (sera |fica |ficara )?(por conta|a cargo|sob responsabilidade|de responsabilidade) d[ao] (contratad|fornecedor|licitante|empresa)/,
  // MONTADO conta como instalacao (usuario, 29/09/2026): "entregar o fogao
  // montado" (Pedras de Maria da Cruz/MG), "produto entregue montado ou montagem
  // por conta do fornecedor" (Uberlandia/MG), "equipamentos entregues montados no
  // local" (Avare/SP). O que descreve o produto fica: "medidas do fogao
  // montado", "diametro montado: 107 cm", "montado sobre 4 rodizios", "kit de
  // montagem", "facil montagem", "necessita apenas da montagem dos pes".
  /entreg(ar|ue|ues|a|ado|ados)\s+((o|a|os|as)\s+[a-z]+\s+)?(devidamente\s+)?montad[oa]s?/,
  /devidamente montad[oa]s?/,
  /fornecid[oa]s?\s+(completos?,?\s+)?montad[oa]s?/,
  /montad[oa]s? (e em (perfeito )?funcionamento|no local)/,
  /fornecimento e montagem/,
  /montagem (inclusa|incluida|inclusive)/,
  /(?<!nao )(incluindo|inclusa|incluida|inclusive|(?<!nao )inclui) (a )?montagem/,
  /montagem (sera |fica |ficara )?(por conta|a cargo|sob responsabilidade|de responsabilidade) d[ao] (contratad|fornecedor|licitante|empresa)/,
];
const exigeInstalacao = d => (EXIGE_INSTALACAO.find(r => r.test(d)) || '') && 'entrega instalada ou montada';

// A EXIGENCIA NO CORPO DO EDITAL, e nao na descricao do item (usuario,
// 25/09/2026: "algumas vezes nao vem escrito no descritivo do item se solicita
// instalacao ou nao, pode vir tambem no corpo do edital").
//
// Aqui a peneira e MUITO mais fina que a do item, e por medida: varrendo as
// secoes dos 124 editais de 25/09, a palavra "instalacao" aparecia em 12 deles
// fora do RS/SC, e 10 NAO eram exigencia nenhuma —
//
//   Pirajuba/MG:  "a instalacao dos equipamentos NAO INTEGRA o objeto"
//   Jaguariuna/SP:"a instalacao ... a ser CONDUZIDO PELA SECRETARIA"
//   Pinhal/PR:    "todos os ACESSORIOS PARA montagem e instalacao"
//   Paranavai/PR: "entrega e, QUANDO APLICAVEL, instalacao dos equipamentos"
//
// Os dois que sobraram tambem nao eram clausula geral: um estava dentro da
// linha de um armario de MDP e o outro era responsabilidade por avaria
// ("arcar com qualquer prejuizo causado durante a entrega e instalacao").
//
// Por isso so entram as formas que nao tem outra leitura, e ainda assim com as
// travas abaixo. "montagem e instalacao", "instalacao dos equipamentos" e
// "entrega e instalacao" ficaram DE FORA de proposito: sao justamente as que
// produzem os falsos positivos.
const CLAUSULA_INSTALACAO = [
  [/instala[çc][ãa]o[^.;]{0,30}(?:ser[áa]|fica(?:r[áa])?|[ée])[^.;]{0,30}(?:por conta|de responsabilidade|a cargo|sob responsabilidade) d[ao]s? (?:contratad|licitant|fornecedor|empresa|vencedor)/,
    'a instalacao e por conta da contratada'],
  [/contratada[^.;]{0,70}(?:dever[áa]|obriga-se a|fica obrigada a)[^.;]{0,50}(?:realizar|efetuar|executar|promover|providenciar|proceder)[^.;]{0,20}instala[çc][ãa]o/,
    'a contratada devera instalar'],
  [/dever[ãa]o? ser entregues? e instalad[oa]s?/, 'entregues e instalados'],
  [/entregues? instalad[oa]s? e em (?:perfeito )?funcionamento/, 'entregues instalados e funcionando'],
  // e montado, que conta como instalacao (usuario, 29/09/2026). A clausula geral
  // tambem tira o edital: "4.5. o transporte, a descarga, a montagem, a instalacao
  // e os testes serao de responsabilidade da contratada" (Goioxim/PR) — "pode
  // remover, pois solicita a montagem" (usuario, 01/10/2026)
  [/montagem[^.;]{0,30}(?:ser[áa]|fica(?:r[áa])?|[ée])[^.;]{0,30}(?:por conta|de responsabilidade|a cargo|sob responsabilidade) d[ao]s? (?:contratad|licitant|fornecedor|empresa|vencedor)/,
    'a montagem e por conta da contratada'],
  [/dever[ãa]o? ser entregues? (?:e )?montad[oa]s?/, 'entregues montados'],
  [/entregues? montad[oa]s? (?:e em (?:perfeito )?funcionamento|no local)/, 'entregues montados'],
];
// O que desarma a clausula na vizinhanca dela: negacao, condicao, obrigacao de
// outro, ou a peca que acompanha o produto.
// A primeira alternativa e O QUE se instala: rede eletrica do predio, software
// e afins nao sao o aparelho, e a Digiplus nao os instalaria de todo jeito.
// (e a alternativa: "devera ser entregue montado OU acompanhado de manual e
// todos os acessorios necessarios para montagem", na cadeira de Renascenca/PR)
const NAO_OBRIGA = /montad[oa]s?,? ou (?:acompanhad|com manual|desmontad)|instala[çc][ãa]o (?:d[oa]s? )?(?:software|aplicativo|sistema|programa|el[ée]tric|hidr[áa]ulic|predial|sanit[áa]ri|de g[áa]s|rede|ponto)|n[ãa]o (?:integra|faz parte|est[áa] inclu|ser[áa] inclu|compreende|abrange)|(?:conduzid|realizad|executad|providenciad)[oa]s? pel[ao] (?:secretaria|municip|prefeitura|contratante|[óo]rg[ãa]o|administra)|por conta d[ao]s? (?:contratante|municip|prefeitura|[óo]rg[ãa]o|secretaria|administra)|quando aplic[áa]v|(?:quando|se|caso) necess[áa]ri|se aplic[áa]v|caso (?:seja|haja)|se houver|quando couber|(?:acess[óo]rios?|pe[çc]as?|componentes?|materia(?:l|is)|kits?) (?:para|de)|manual (?:de|para)/;

// A clausula vale para o edital inteiro, entao devolve o motivo uma vez so.
// A frase que esta DENTRO do descritivo de um item vale so para aquele item, e a
// regra do item ja cuida dele: "entrega: equipamentos entregues montados no
// local indicado pelo IFSP" e do conjunto de cafe (item 6) de Avare/SP, e o
// edital tem ainda a cafeteira do item 1 (29/09/2026).
const clausulaDeInstalacao = (corpo, descritivos = []) => {
  for (const [re, rot] of CLAUSULA_INSTALACAO) {
    const m = re.exec(corpo);
    if (!m) continue;
    if (NAO_OBRIGA.test(corpo.slice(Math.max(0, m.index - 110), m.index + 130))) continue;
    const trecho = corpo.slice(Math.max(0, m.index - 40), m.index + m[0].length);
    if (descritivos.some(d => d.includes(trecho))) continue;
    return rot;
  }
  return '';
};

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
const mostra = process.argv.includes('--mostra');

// Editais conferidos a mao que exigem o que a Digiplus nao atende (amostra,
// garantia contratual...), quando a varredura nao leu o arquivo: ver
// editais-fora.json. Sem a lista aqui, voltariam na varredura do dia seguinte.
let fora = {};
try { fora = JSON.parse(fs.readFileSync(path.join(DIR, 'editais-fora.json'), 'utf8')); } catch { /* sem lista */ }

let tirados = 0, porClausula = 0, editaisFora = 0, recategorizados = 0, limpos = 0, semDescritivo = 0, foraDeCategoria = 0;
const ficam = [];
// Os itens que a Digiplus nao cota e que entram no card por serem do mesmo lote
// (LT) ou do edital por lote que nao deu para confirmar (ED): o veta os refaz a
// cada execucao, entao primeiro saem os da execucao anterior.
const DO_LOTE = new Set(['LT', 'ED']);
for (const e of dados.editais) e[C.itens] = e[C.itens].filter(it => !DO_LOTE.has(it[0]));

// A LETRA ACENTUADA QUE O PNCP PERDEU no nome do item: "CAPACIDADE DE
// REFRIGERA??O DE 12.000 BTU/H, TENS?O 220 V, MONOF?SICO" (Sao Joao da
// Ponte/MG, edital 20, 08/10/2026). Cada "?" e uma letra que nao chegou, e o
// descritivo do proprio item, recortado do edital, tem a palavra inteira. A
// letra volta so quando a palavra aparece la de UM jeito so; sem ela, o "?"
// fica — chutar o acento seria pior. ("AO INOXIDAVEL" e "FREQUNCIA", em que a
// letra sumiu sem deixar "?", nao tem como ser achados assim.)
const esc = s => s.replace(/[.*+^${}()|[\]\\]/g, '\\$&');
function devolveAcentos(rotulo, fonte) {
  if (!fonte || !rotulo.includes('?')) return rotulo;
  return rotulo.replace(/[A-Za-zÀ-ÿ]*\?+[A-Za-zÀ-ÿ?]*/g, palavra => {
    if (!/[A-Za-zÀ-ÿ]/.test(palavra)) return palavra;
    const re = new RegExp('(?<![A-Za-zÀ-ÿ])' + [...palavra].map(c => c === '?' ? '[^\\x00-\\x7F]' : esc(c)).join('') + '(?![A-Za-zÀ-ÿ])', 'gi');
    const achadas = new Set([...String(fonte).matchAll(re)].map(m => m[0].toLowerCase()));
    if (achadas.size !== 1) return palavra;
    const [a] = achadas;
    return palavra === palavra.toUpperCase() ? a.toUpperCase() : a;
  });
}

for (const e of dados.editais) {
  // O HTML e a acentuacao quebrada do PNCP (ver texto-pncp.mjs), tambem no
  // dados.json ja publicado.
  for (const it of e[C.itens]) { const l = limpaTextoPncp(it[3]); if (l !== it[3]) { it[3] = l; limpos++; } }
  { const l = limpaTextoPncp(e[C.objeto]); if (l !== e[C.objeto]) { e[C.objeto] = l; limpos++; } }
  const v = desc.editais[e[C.path]] || {};
  const nome = e[C.municipio] + '/' + e[C.uf] + ' ' + e[C.edital];
  for (const it of e[C.itens]) {
    const x = (v.itens || []).find(y => +y[0] === +it[5]);
    const l = devolveAcentos(it[3], x && x[6]);
    if (l !== it[3]) { it[3] = l; limpos++; }
  }
  if (UFS_ATENDIDAS.size && !UFS_ATENDIDAS.has(e[C.uf])) {
    editaisFora++;
    console.log(`  sai o edital ${nome}: ${e[C.uf]} nao e mais atendida`);
    continue;
  }
  {
    const orgao = norm(e[C.orgao] + ' ' + (e[C.unidade] || '')).replace(/\s+/g, ' ');
    const v = VETO_ORGAO.find(t => orgao.includes(t));
    if (v) {
      editaisFora++;
      console.log(`  sai o edital ${nome}: orgao vetado ("${v}") · ${e[C.unidade] || e[C.orgao]}`);
      continue;
    }
  }
  if (fora[e[C.path]] && e[C.path] !== '_leia') {
    editaisFora++;
    console.log(`  sai o edital ${nome}: ${fora[e[C.path]].motivo}`);
    continue;
  }
  // O objeto que diz que o edital inteiro e outra coisa (VETO_OBJ_SEMPRE do
  // varredura.mjs): termo novo vale para o dados.json ja publicado.
  const vetoObj = VETO_OBJ_SEMPRE.find(t => norm(e[C.objeto]).includes(t));
  if (vetoObj) {
    editaisFora++;
    console.log(`  sai o edital ${nome}: objeto "${vetoObj}"`);
    continue;
  }
  // A clausula de instalacao escondida no corpo do edital (ver acima). Vale
  // para todos os itens, entao o edital sai inteiro — fora do RS e de SC.
  if (!UF_INSTALA.has(e[C.uf])) {
    const clausula = clausulaDeInstalacao(norm((v.secoes || []).map(s => s.texto).join(' ')),
      (v.itens || []).map(x => norm(x[6])).filter(t => t.length > 60));
    if (clausula) {
      editaisFora++;
      porClausula++;
      console.log(`  sai o edital ${nome}: ${clausula} (clausula no corpo do edital)`);
      continue;
    }
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
  // O objeto com instalacao CONDICIONAL ("com instalacao quando necessaria",
  // Assis Chateaubriand/PR): fora do RS e de SC sai o aparelho que se instala,
  // como na varredura (5.1e). Aqui vale tambem para o que a regra ganhou
  // depois de o edital entrar — o climatizador de parede, em 30/09/2026.
  const objN = norm(e[C.objeto]);
  // (o objeto misto, moveis e eletrodomesticos com instalacao, tambem, como la)
  // A INSTALACAO EM ITEM SEPARADO DO LOTE (usuario, 07/10/2026): quando o
  // julgamento e por lote, quem leva o lote leva tudo o que esta nele, e o
  // edital poe a instalacao do ar-condicionado como outro item — "LOTE 03 ...
  // compreende o fornecimento e a instalacao do sistema de climatizacao", com
  // "INSTALACAO DE AR 60.000 BTUS K7 PISO TETO" ao lado do aparelho (Ipora/PR,
  // edital 70). O item do aparelho nao fala em instalacao, e o de servico a
  // varredura descarta; fora do RS e de SC o aparelho que se instala sai.
  const textoEdital = norm((v.secoes || []).map(s => s.texto).join(' '));
  const instalaNoLote = !UF_INSTALA.has(e[C.uf]) && vendaPorLote(textoEdital)
    && (v.itens || []).some(x => ITEM_DE_INSTALACAO.test(norm(x[1])));
  const instalaNoObjeto = !UF_INSTALA.has(e[C.uf]) && /instalacao|montagem/.test(objN)
    && (OBJ_CONDICIONAL.test(objN) || (/mobiliario|moveis/.test(objN) && /eletrodomestic|eletroportat/.test(objN)));
  let valSuspenso = 0;
  const itens = e[C.itens].filter(it => {
    if (SUSPENSAS.includes(it[0])) {
      foraDeCategoria++; valSuspenso += it[1] * it[2];
      console.log(`categoria ${it[0]} suspensa · ${nome} · item ${it[5]}: ${String(it[3]).replace(/\s+/g, ' ').slice(0, 80)}`);
      return false;
    }
    const x = (v.itens || []).find(y => y[0] == it[5]);
    const d = norm(x && x[6]);
    // Categoria que saiu do radar — BL, as balancas, em 23/09/2026. O item
    // continua no dados.json publicado ate a proxima varredura, entao sai aqui.
    if (!CAT.some(([c]) => c === it[0])) {
      foraDeCategoria++;
      console.log(`categoria ${it[0]} nao existe mais · ${nome} · item ${it[5]}: ${String(it[3]).replace(/\s+/g, ' ').slice(0, 80)}`);
      return false;
    }
    // Item sem descritivo sai: sem a especificacao do edital o card nao serve
    // para cotar (decisao do usuario em 23/09/2026). O edital que fica sem item
    // nenhum sai junto, na conta logo abaixo.
    if (!d) {
      semDescritivo++;
      console.log(`sem descritivo · ${it[0]} · ${nome} · item ${it[5]}: ${String(it[3]).replace(/\s+/g, ' ').slice(0, 100)}`);
      return false;
    }
    // a instalacao vale tambem no texto do PNCP, que muitas vezes traz a
    // informacao complementar do item colada na descricao
    const noCatalogo = vetoDoCatalogo(norm(it[3]), it[0]) || (!UF_INSTALA.has(e[C.uf]) && exigeInstalacao(norm(it[3])));
    const termo = noCatalogo || (d && ((VETO[it[0]] || []).find(t => d.includes(t)) || VETO.TODAS.find(t => d.includes(t))
      || (!UF_INSTALA.has(e[C.uf]) && exigeInstalacao(d))
      || (instalaNoObjeto && instalavel(norm(it[3]), it[0]) && 'instalacao quando necessaria, e o aparelho se instala')
      || (instalaNoLote && instalavel(norm(it[3]), it[0]) && 'instalacao em item do mesmo lote')
      || (it[0] === 'PR' && amassadeiraRapida(d + ' ' + norm(it[3])) && 'amassadeira rapida')
      // a "mesa inox" do catalogo que o edital descreve como outro movel: o item 18
      // de Itaberai/GO e "Mesa material estrutura: aco inoxidavel..." no PNCP e
      // "Banqueta ergonomica giratoria" no edital, pelo numero e pelo preco
      // (15/10/2026)
      || (it[0] === 'MI' && !/(?:^|[^a-z])(?:mesa|bancada)/.test(d.slice(0, 200)) && 'o edital descreve outro movel, nao uma mesa')
      // e a balanca do catalogo que o edital descreve como outro produto: Campo Novo/RS
      // (edital 40) cadastrou os 32 itens com o mesmo CATMAT de balanca, e na tabela do
      // edital sao biombo, mesa ginecologica, rolo de pilates, tapete sensorial,
      // fazendinha... (28/10/2026). Em 87 balancas da lista, todas citavam a balanca.
      || (it[0] === 'BL' && !/balanca/.test(d) && 'o edital descreve outro produto, nao uma balanca')
      // (e a mobilidade, que tem de comecar pelo produto: 28/10/2026)
      || (it[0] === 'MO' && !MO_NA_FRENTE.test(norm(it[3])) && !MO_NA_FRENTE.test(d) && 'outro produto que so cita muleta, andador ou cadeira')
      // e a lava-loucas em QUALQUER categoria, quando o texto do edital abre com
      // ela: o item 39 do CEFET-MG (Belo Horizonte, edital 335) e "Balanca
      // Eletronica ... capacidade pesagem: 500" no PNCP e "FORNECIMENTO E
      // INSTALACAO DE LAVA-LOUCAS INDUSTRIAL TIPO CAPO", R$ 50.902,50, no edital
      || (it[0] !== 'LV' && lavaLoucas(d) && 'lavadora de louca')
      || (it[0] === 'LV' && (lavaLoucas(norm(it[3])) || lavaLoucas(d)) && 'lavadora de louca')
      || (it[0] === 'PR' && chaleiraDeFogao(norm(it[3]), d) && 'chaleira de fogao')
      // o item comprado em HORAS e servico, nao aparelho: "BALANÇAS mecânicas
      // (antropométricas)", 100 Horas, e a manutencao de balancas do contrato de
      // manutencao do parque de equipamentos (Lunardelli/PR, edital 34, 22/10/2026)
      || (/^horas?\b/i.test(String(it[4] || '').trim()) && 'item em horas (servico)')
      // o item que nem o nome nem o edital chamam por produto do radar, so por uso:
      // "CANECA ... PODENDO SER USADO EM LAVA LOUÇAS E MICROONDAS" (Carazinho/RS,
      // PCE 44, 27/10/2026). A varredura ja nao o pega; aqui sai o que entrou antes.
      || (!termoMaisCedo(norm(it[3])) && !termoMaisCedo(d) && 'nenhum produto do radar, so o uso')
      || (it[0] === 'CL' && AR_CONDICIONADO.test(norm(it[3]) + ' ' + d.slice(0, 300)) && pedeWifi(d + ' ' + norm(it[3])) && 'ar-condicionado com Wi-Fi')
      // o "UMIDIFICADOR" sem mais nada no edital de oxigenio medicinal e o frasco
      // do fluxometro, nao o umidificador de ambiente (Campina da Lagoa/PR,
      // edital 108, item 6, 21/10/2026: "RECARGA DE OXIGENIO MEDICINAL COM
      // CILINDROS EM COMODATO")
      || (it[0] === 'CL' && /^[^a-z]*umidificador/.test(norm(it[3])) && /oxigenio|gasoterapia/.test(objN)
        && !/ambiente|umidificador de ar(?![a-z])/.test(d + ' ' + norm(it[3])) && 'umidificador do oxigenio medicinal')
      || (!cotaNaUf(e[C.uf], norm(it[3]), d) && 'linha que nao se cota em ' + e[C.uf])
      || (ABRE_FORA_DO_RADAR.exec(d) || [])[1]));
    if (!termo) return true;
    tirados++;
    console.log(`veta "${termo}" ${noCatalogo ? 'no PNCP' : 'no edital'} · ${it[0]} · ${nome} · item ${it[5]}: ${String(noCatalogo ? it[3] : x[6]).replace(/\s+/g, ' ').slice(0, 140)}`);
    return false;
  });
  if (itens.length === e[C.itens].length) { ficam.push(e); continue; }
  const qtd = itens.reduce((s, x) => s + x[1], 0);
  const val = Math.round(itens.reduce((s, x) => s + x[1] * x[2], 0));
  if (!itens.length || (val > 0 && val + valSuspenso <= PISO_EDITAL)) {
    editaisFora++;
    console.log(`  sai o edital ${nome}: ${itens.length ? 'R$ ' + val + ' fica abaixo do piso' : 'sem item'}`);
    continue;
  }
  e[C.itens] = itens; e[C.quantidade] = qtd; e[C.valorEstimado] = val;
  ficam.push(e);
}

// O mesmo orgao com o mesmo numero de edital no mesmo dia e o mesmo edital
// publicado por dois sistemas (ver 5.5 no varredura.mjs): fica o que tem mais
// itens; empatado, o mais novo.
const numEd = e => { const m = String(e[C.edital]).match(/(\d+)\s*\/\s*(\d{4})/); return m ? (+m[1]) + '/' + m[2] : null; };
const porNumero = new Map();
for (const e of ficam) {
  const n = numEd(e);
  const k = n ? `${e[C.path].split('/')[0]}|${e[C.modalidade]}|${String(e[C.encerramento]).slice(0, 10)}|${n}` : e[C.path];
  const a = porNumero.get(k);
  if (!a) { porNumero.set(k, e); continue; }
  const fica = e[C.itens].length > a[C.itens].length || (e[C.itens].length === a[C.itens].length && +e[C.path].split('/')[2] > +a[C.path].split('/')[2]) ? e : a;
  const sai = fica === e ? a : e;
  console.log(`  sai o edital ${sai[C.municipio]}/${sai[C.uf]} ${sai[C.edital]} (${sai[C.path]}): e o mesmo que ${fica[C.edital]} (${fica[C.path]})`);
  porNumero.set(k, fica); editaisFora++;
}
ficam.length = 0; ficam.push(...porNumero.values());

// OS DEMAIS ITENS DO LOTE (usuario, 07/10/2026: "quando o edital tiver
// produtos em lote, nao remova os itens que nao cotamos, pode manter todos os
// itens do lote (APENAS DO LOTE)"). Quem leva o lote leva tudo: a instalacao,
// a tubulacao e a bomba de dreno de Joinville/SC estao no mesmo lote do
// ar-condicionado. Com o lote confirmado ao centavo (lotes.mjs), entram os
// itens dos lotes que tem produto nosso, como LT; sem confirmacao, entram
// todos os itens do edital, como ED (decisao dele no mesmo dia). O valor e a
// quantidade do edital continuam sendo so os dos nossos itens.
let editaisComLote = 0, editaisInteiros = 0, itensDoLote = 0, lotesMarcados = 0;
// O nome do item que nao cotamos e o do PNCP, e no Compras.gov.br de
// Joinville/SC ele vem como "<texto do catalogo> 46950 - TUBULACAO ADICIONAL
// PARA APARELHOS...": o catalogo na frente e generico, chega a contradizer o
// edital ("tipo: split hi wall" no ar-condicionado cassete) e empurrava o texto
// do orgao para depois do corte de 400 caracteres. Fica do codigo em diante.
// Em 08/10/2026 o padrao aparecia em 48 dos 6.278 itens do descritivos.json,
// todos desse tipo.
const CATALOGO_E_CODIGO = /^(.{20,}?)\s(\d{4,6} - [A-ZÀ-Ú]{3}.{12,})$/s;
const doCodigoDoOrgao = s => { const m = CATALOGO_E_CODIGO.exec(s); return m ? m[2] : s; };
for (const e of ficam) {
  const v = desc.editais[e[C.path]];
  if (!v || !(v.itens || []).length) continue;
  const texto = (v.secoes || []).map(s => s.texto).join(' ').replace(/\s+/g, ' ');
  if (!vendaPorLote(norm(texto))) continue;
  const nossos = new Set(e[C.itens].map(it => +it[5]));
  const todos = v.itens.map(x => ({ x, n: +x[0], rot: x[1] || '', benef: x[5] || '', qtd: +x[2] || 0, total: Math.round((+x[2] || 0) * (+x[4] || 0) * 100) / 100 }))
    .sort((a, b) => a.n - b.n);
  // O lote, de quem o mostra com mais seguranca para o menos: o rotulo do PNCP
  // que ja traz "LOTE 2 - ..." (Cruzaltense/RS), os totais impressos por lote,
  // a coluna "Lote" ao lado da unidade (Sapiranga/RS), a linha "LOTE04 81
  // 02.01333 - NOME QTD UN" (Tupi Paulista/SP), as faixas "01 ao 03" (Sao
  // Paulo/SP, pregao 33), as secoes "LOTE 01 - TITULO" com os itens renumerados
  // (Ivai/PR) e a tabela com a coluna do grupo (Caxias do Sul/RS, pregao 145).
  // Todos de 09/10/2026; cada um so responde quando todos os itens do PNCP
  // acham o seu lote, e nenhum adivinha.
  const lote = lotesPeloRotulo(todos) || lotesPelosTotais(todos, totaisPorLote(texto))
    || lotesPelaColunaDoLote(todos, texto) || lotesPelaLinhaComLote(todos, texto)
    || lotesPorFaixa(todos, texto) || lotesPorSecao(todos, texto) || lotesPelaTabelaDeGrupo(todos, texto)
    // (e as formas de 21/10/2026: o texto do proprio item, as faixas de itens do
    // grupo, as secoes com o primeiro item, a tabela "LOTE ITEM" e o lote unico)
    || lotesPeloTextoDoItem(todos) || lotesPorFaixaDeItens(todos, texto) || lotesPorSecaoComItem(todos, texto)
    // (e o cabecalho "Grupo N ITEM DESCRICAO" com os itens avulsos, da Codevasf, 27/10/2026)
    || lotesPeloCabecalhoDoGrupo(todos, texto)
    || lotesPelaTabelaLoteItem(todos, texto) || lotesPelaTabelaLoteItemNome(todos, texto) || lotesPelaLinhaLoteNome(todos, texto) || lotesUmItemPorLote(todos, texto)
    || lotesLoteUnico(todos, texto);
  let entram, cod;
  if (lote) {
    const lotesNossos = new Set([...nossos].map(n => lote.get(n)));
    // (o lote 0 e o item fora de grupo, "ITENS NAO AGRUPADOS" de Pelotas/RS: nao
    // puxa ninguem e vai sem lote para o descritivos.json)
    entram = todos.filter(t => lote.get(t.n) && lotesNossos.has(lote.get(t.n)) && !nossos.has(t.n));
    cod = 'LT'; editaisComLote++;
    // o lote confirmado vai para o descritivos.json, para o resumo agrupar por lote
    const noLote = {};
    for (const t of todos) {
      const l = lote.get(t.n) || undefined, k = l && (noLote[l] = (noLote[l] || 0) + 1) || undefined;
      if ((t.x[7] ?? undefined) !== l || (t.x[8] ?? undefined) !== k) { t.x[7] = l; t.x[8] = k; lotesMarcados++; }
    }
  } else {
    entram = todos.filter(t => !nossos.has(t.n));
    cod = 'ED'; editaisInteiros++;
  }
  if (!entram.length) continue;
  for (const t of entram) {
    const rot = devolveAcentos(doCodigoDoOrgao(limpaTextoPncp(t.x[1])), t.x[6]);
    e[C.itens].push([cod, +t.x[2] || 0, +t.x[4] || 0, rot.length > 400 ? rot.slice(0, 397) + '...' : rot, t.x[3] || '', t.n, t.x[5] || '']);
    itensDoLote++;
  }
  e[C.itens].sort((a, b) => a[5] - b[5]);
}
console.log(`lotes: ${editaisComLote} edital(is) com o lote confirmado (rotulo, totais, coluna, linha, faixas, secoes ou grupos), ${editaisInteiros} por lote sem confirmacao (todos os itens), ${itensDoLote} item(ns) que nao cotamos no card`);

// A cota reservada de ME/EPP, item a item, em it[7] (ver cota.mjs): 'R',
// 'R:n' (a principal no item n) ou 'P:n' (a reservada no item n). E o
// principal que saiu do recorte com a marca "(COTA EXCLUSIVA...)" copiada da
// reservada perde a marca no descritivos.json.
let cotas = 0, descLimpos = 0;
if (!dados.colunasItem.includes('cota')) { dados.colunasItem.push('cota'); cotas++; }
for (const e of ficam) {
  const v = desc.editais[e[C.path]];
  if (!v) continue;
  const { marcas, limpos } = marcaCotas(v.itens || [], norm((v.secoes || []).map(s => s.texto).join(' ')));
  for (const it of e[C.itens]) {
    const m = marcas.get(+it[5]) || '';
    if ((it[7] || '') === m) continue;
    if (m) it[7] = m; else it.length = 7;
    cotas++;
  }
  for (const [n, t] of limpos) {
    const x = (v.itens || []).find(y => +y[0] === n);
    if (x && x[6] !== t) { x[6] = t; descLimpos++; }
  }
}

console.log(`${tirados} item(ns) vetado(s) pelo descritivo, ${semDescritivo} sem descritivo, ${foraDeCategoria} de categoria que saiu, ${editaisFora} edital(is) fora (${porClausula} por clausula de instalacao no corpo), ${recategorizados} item(ns) de categoria corrigida`);
if (limpos) console.log(`${limpos} texto(s) do PNCP limpos de HTML e acentuacao quebrada`);
if (cotas) console.log(`${cotas} marca(s) de cota ME/EPP mudaram` + (descLimpos ? `, ${descLimpos} descritivo(s) de cota principal sem a marca da reservada` : ''));
if (!mostra && (tirados || semDescritivo || foraDeCategoria || editaisFora || recategorizados || limpos || cotas || itensDoLote || editaisComLote || editaisInteiros)) {
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
if (!mostra && (descLimpos || lotesMarcados)) {
  fs.writeFileSync(path.join(DIR, 'docs', 'descritivos.json'), JSON.stringify(desc), 'utf8');
  console.log('docs/descritivos.json: ' + descLimpos + ' descritivo(s) corrigido(s), ' + lotesMarcados + ' item(ns) com o lote confirmado');
}
