// Quebra o texto das secoes em UM DESCRITIVO POR ITEM, para o resumo sair em
// tabela como no edital: uma linha por item, com a especificacao inteira.
//
// Antes as secoes iam como texto corrido. O usuario mandou a pagina do edital
// de Salto/SP mostrando o que quer — uma tabela com item, codigo e o
// descritivo completo em cada linha ("VENTILADOR DE PAREDE, preto, 60 cm de
// diametro (minimo), movimento oscilante...") — e texto corrido nao e isso.
//
// Nao baixa nada: trabalha em cima do que o descritivos.mjs ja extraiu, usando
// o extraiDescritivo, que existe desde a primeira versao justamente para
// ancorar no rotulo curto da API e pegar a celula inteira do Termo de
// Referencia.
//
// Uso: node descritivo-por-item.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraiDescritivo } from './paginas-uteis.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const arquivo = path.join(DIR, 'docs', 'descritivos.json');
const base = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));
const C = dados.colunas.reduce((o, n, i) => (o[n] = i, o), {});

// A ancora e o rotulo curto da API, e ele quase nunca aparece inteiro no
// edital. O PNCP escreve "Fogao Industrial aplicacao: alimentacao e nutricao,
// caracteristicas adicionais: sem forno" — um cabecalho de produto seguido de
// pares campo: valor — enquanto o Termo de Referencia escreve "FOGAO
// INDUSTRIAL, em aco inoxidavel, 6 bocas...". Procurando a frase inteira nao
// casa nada: eram 93 de 336 itens.
//
// Entao a ancora encurta por etapas, da mais especifica para a mais generica, e
// para na primeira que aparece no texto. Encurtar demais e perigoso — "Fogao"
// sozinho casaria com a linha de outro fogao — por isso o piso e de tres
// palavras.
const ACENTOS = { 'á':'a','à':'a','â':'a','ã':'a','ä':'a','é':'e','è':'e','ê':'e','ë':'e',
  'í':'i','ì':'i','î':'i','ï':'i','ó':'o','ò':'o','ô':'o','õ':'o','ö':'o','ú':'u','ù':'u',
  'û':'u','ü':'u','ç':'c','ñ':'n' };
// Troca cada caractere por UM caractere: as posicoes no texto normalizado tem
// de bater com as do original, senao o recorte sai deslocado.
const normIgual = s => String(s ?? '').toLowerCase()
  .replace(/[^\x00-\x7f]/g, c => ACENTOS[c] || c);

// Palavras que o PNCP poe na frente do nome e o edital nao usa: "Aparelho Ar
// Condicionado" no catalogo e "AR CONDICIONADO SPLIT" no termo de referencia.
// Enquanto a ancora comecava por "aparelho", nada casava.
const GENERICAS = /^(?:aparelho|equipamento|conjunto|kit|material|produto|item|maquina)\s+/i;

function ancoraDe(plano, planoH, curto) {
  const tentativas = [curto];
  const antesDoCampo = curto.split(/\s+[A-Za-zÀ-ÿ]+:\s/)[0];
  if (antesDoCampo && antesDoCampo.length >= 6 && antesDoCampo !== curto) tentativas.push(antesDoCampo);
  const semGenerica = (antesDoCampo || curto).replace(GENERICAS, '');
  if (semGenerica.length >= 6 && !tentativas.includes(semGenerica)) tentativas.push(semGenerica);

  // Duas palavras entram desde que somem 12 caracteres: "ar condicionado" e
  // especifico o bastante, "de mesa" nao seria. O piso existia em tres palavras
  // e deixava de fora justamente os nomes curtos de produto.
  for (const base of [semGenerica, curto]) {
    const palavras = base.split(/\s+/);
    for (const n of [6, 4, 3, 2]) {
      if (palavras.length > n || (n === 2 && palavras.length === 2)) {
        const t = palavras.slice(0, n).join(' ');
        if (t.length >= (n === 2 ? 12 : 6) && !tentativas.includes(t)) tentativas.push(t);
      }
    }
  }
  // Procura primeiro no texto como ele e; so se nada casar, tenta de novo com
  // o hifen valendo espaco.
  //
  // Monte Alto/SP escreve "Ar-condicionado Split Inverter 9.000 BTU/h" e o
  // catalogo do PNCP escreve "Ar Condicionado": sem a segunda passada os tres
  // aparelhos (9.000, 12.000 e 18.000) caiam no texto generico do Anexo II.
  //
  // Mas a segunda passada nao pode ser a primeira. Em Paranavai/PR o edital usa
  // as duas grafias — "Ar Condicionado, TIPO: Split Cassete" abre a linha e
  // "Ar-condicionado 48.000 btus" aparece de novo no meio dela — e marcar as
  // duas cortava a celula ao meio. Os dois planos tem o mesmo comprimento, entao
  // a posicao encontrada vale igual no texto original.
  for (const onde of [plano, planoH]) {
    for (const t of tentativas) {
      const a = normIgual(t).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
      const exata = normIgual(t).replace(/\s+/g, ' ').trim();
      const alvo = onde === plano ? exata : a;
      if (alvo.length >= 6 && onde.includes(alvo)) return { ancora: alvo, plano: onde };
    }
  }
  return null;
  return '';
}

// Teto por item. Existe so para o ULTIMO item da tabela, que nao tem um proximo
// para fechar a celula.
// Estava em 2.200 e cortava a especificacao no meio da frase em 8 itens — o
// item 18 de Bueno Brandao/MG parava em "Decreto Federal n 5445 de 12/05/05. 8
// pratel". O usuario pediu o descritivo inteiro, ate o detalhe menos
// relevante, entao o teto sobe: ele so vale para o ULTIMO item da tabela, que
// nao tem um proximo para fechar a celula, e o corte de reserva por fim de
// linha continua valendo antes dele.
const TETO_ITEM = 6000;

// Corte de reserva, para quando o proximo item nao vira marca — porque o rotulo
// dele na API nao aparece com essas palavras no edital, e ai nao ha limite pela
// frente. Sobrou em 3 dos 545 descritivos, e os tres tinham a mesma assinatura:
// o fim da linha da tabela, "R$ unitario R$ total <numero do proximo item>".
//
//   "...tolerância. UN 1 R$ 1.005,52 R$ 1.005,52 6 Maca Veterinária - Estrutura"
//   "...,00 R$ 5,56 R$ 2.224,00 196 001.020.079 SACO PARA LIXO DOMESTICO"
//
// O segundo padrao pega a linha que comeca com numero do item + codigo de
// catalogo ("2 165.6.205"), que e como o edital de Salto/SP separa as linhas.
// O (?=\s|$) no fim e proposital: sem ele o padrao exigia um espaco depois e
// nao casava quando a sobra ficava no FIM do texto — era o caso de Salto/SP,
// que terminava em "...mínima, média e máxima. 2 165.6.205".
const FIM_DE_LINHA = [
  /R\$\s*[\d.,]+\s+R\$\s*[\d.,]+\s+\d{1,4}(?=\s|$)/,
  /\s\d{1,4}\s+\d{1,3}(?:\.\d{1,3}){2,}(?=\s|$)/,
  // "MINI SPLIT. 10 04 UND APARELHO AR CONDICIONADO..." — numero do item,
  // quantidade e unidade abrindo a linha seguinte, em Descalvado/SP.
  /\s\d{1,4}\s+\d{1,4}\s+(?:UND|UNID|UN|PCS|PC|CX|PAR|KG|LT)(?=\s|$)/,
  // Fonte com codificacao propria devolve o texto em letras soltas:
  // "& ¤ P D U D  1 D F L R Q D O  G H". Nao da para consertar, mas da para
  // nao arrastar o lixo para dentro do descritivo — corta onde comeca.
  /(?:\s\S){8,}(?=\s|$)/,
  // Fim da linha sem o numero do proximo item, que fica fora do teto:
  // "...+/- 5% de tolerância. UN 2 R$ 37.963,33 R$ 75.926," em Catanduva/SP.
  /\s(?:UNIDADES?|UNID|UND|UN|PCS|PC|CX|PAR|KG|LT)\.?\s+\d{1,4}\s+R\$/i,
  // Linha que comeca com o numero do item e o codigo de catalogo GRUDADOS, sem
  // espaco: "...1080I E 1080P.0016248542CABO EXTENSOR TIPO: FLEXIVEL". E como
  // Sabinopolis/MG monta a tabela, e sem isto o item 15 vinha com o 16 dentro.
  // Oito digitos seguidos de maiuscula nao acontecem dentro de uma
  // especificacao — "1080P" tem quatro.
  /\d{8,}(?=[A-ZÀ-Ú])/,
  // O ULTIMO item da tabela nao tem um proximo para fechar a celula, e o
  // recorte segue para o corpo do edital. Estas palavras nao aparecem em
  // descritivo de produto — aparecem em clausula: em Paranapoema/PR o
  // frigobar seguia por "1.3. DO PROSPECTO 1.4.1. A licitante classificada
  // provisoriamente em primeiro lugar devera encaminhar ao pregoeiro...".
  /\s(?:o |a |ao |pelo |pela )?(?:pregoeir[oa]|licitantes?\b|desclassifica|fase de lances|assinatura do contrato|custo estimado|vedada a inclus)/i,
  // Depois da tabela costuma vir a minuta do contrato, e o ultimo item entrava
  // nela: a mesa de futmesa de Rio Bom/PR seguia por "de um lado, a PREFEITURA
  // DO MUNICIPIO DE RIO BOM - PR, pessoa juridica de direito publico...".
  /\s(?:pessoa jur[íi]dica de direito|de um lado,?\s+[ao]\s+PREFEITURA|CL[ÁA]USULA\s+(?:PRIMEIRA|SEGUNDA|[IVX]+)|CONTRATANTE\b|CONTRATADA\b|doravante denominad)/i
];

// Rodape de pagina que cai no meio da celula quando o descritivo atravessa uma
// quebra: "Rua Jose Quirino Ribeiro, 55, Jardim Belem - Descalvado (SP) - PABX
// (19) 3583.9300 - CEP 13690-091 www.descalvado.sp.gov.br". Aqui se REMOVE em
// vez de cortar: cortar jogaria fora a continuacao da especificacao, que vem
// logo depois do rodape e e justamente o que se quer.
const RODAPE = [
  /\s*www\.[^\s]+/gi,
  /\s*CEP[:\s]*\d{5}-?\d{3}/gi,
  /\s*PABX[^A-Za-zÀ-ú]*(?:\(\d{2}\))?[\d\s.\-]{6,}/gi,
  /\s*(?:Rua|Avenida|Av\.|Praça)\s+[^,]{3,45},\s*n?º?\s*\d+[^,]{0,30},?/gi,
  // Carimbo de assinatura digital, que o sistema estampa no rodape de cada
  // pagina: "Assinado por 1 pessoa: SIMONE TORRES DUARTE Documento assinado
  // digitalmente/eletronicamente. Confira as assinaturas no link: https://..."
  // Cai no meio da celula quando o descritivo atravessa a quebra, em Itai/SP.
  /\s*Assinado por \d+ pessoas?:\s*[A-ZÀ-Ú][A-ZÀ-Úa-zà-ÿ\s.]{0,70}/gi,
  /\s*Documento assinado (?:digital|eletronic)[^.]{0,40}\.?/gi,
  /\s*Confira as assinaturas? no link:?\s*\S*/gi,
  /\s*\S*pp-signer\/verify\?code=\S*/gi,
  /\s*Tramitado e Assinado Eletronicamente por\s+\S+/gi,
  /\s*SEI\s*n[ºo°]?\s*[\d/.\-]+/gi,
  /\s*P[áa]gina\s+\d+(?:\s+de\s+\d+)?/gi
];

// Ultima linha de defesa. Cada sistema de assinatura carimba de um jeito
// proprio — um deles sai ate sem espaco nenhum ("StatusASSINADOOutrasinforma
// esCategoria") — e perseguir todos os formatos nao acaba. Sobrando marca de
// carimbo depois da limpeza, o descritivo e descartado e o item volta a mostrar
// a descricao do PNCP: melhor uma descricao curta que uma suja.
const AINDA_SUJO = /assinad[oa]|pp-signer|tramitado e assinado|confira as assinatura/i;
function tiraRodape(txt) {
  let t = txt;
  for (const re of RODAPE) t = t.replace(re, ' ');
  return t.replace(/\s{2,}/g, ' ').replace(/\s+([.,;])/g, '$1').trim();
}

// O edital que lista o item duas vezes — a linha da tabela e depois
// "Especificacao:" repetindo o mesmo texto — fazia o recorte sair dobrado, com
// 1.309 caracteres onde ha 650 de conteudo (Sabinopolis/MG). Voltando ao
// proprio comeco, o descritivo acabou ali.
function cortaNaRepeticao(t) {
  if (t.length < 200) return t;
  const inicio = t.slice(0, 50);
  const k = t.indexOf(inicio, 100);
  return k > 0 ? t.slice(0, k).trim().replace(/[\s.,;:-]+$/, '') : t;
}

function cortaNaProximaLinha(txt) {
  const limpo = cortaNaRepeticao(tiraRodape(txt));
  let fim = limpo.length;
  for (const re of FIM_DE_LINHA) {
    const m = re.exec(limpo);
    // A trava so existe para o caso de o trecho ABRIR com o preco da linha
    // anterior; 20 basta. Estava em 60 e por isso deixou passar o item 34 de
    // Nova Prata do Iguacu/PR, onde o fim da linha casava na posicao 53 e o
    // descritivo seguiu ate o teto com dois itens de pinca cirurgica dentro.
    if (m && m.index > 20 && m.index < fim) fim = m.index;
  }
  return (fim === limpo.length ? limpo : limpo.slice(0, fim)).trim();
}

// Descritivo tem de comecar no nome do produto. Comecando com minuscula ou
// pontuacao, o que se pegou foi o meio de uma frase — em Severinia/SP a ancora
// casou em "especificacoes do objeto" no meio da clausula 8.6 do edital, e o
// "descritivo" era texto de proposta, nao produto.
const comecaNoMeio = t => /^[a-zà-ÿ,;.)\-]/.test(t.trim());

// Prova final: o comeco do descritivo tem de falar do MESMO produto do rotulo.
//
// A busca por proximidade acerta quase sempre, mas quando erra o resultado e
// perigoso — texto limpo, coerente, e de outro produto. Dois casos reais em
// 09/09/2026: o ar-condicionado de 20.000 BTU recebeu a celula do de 30.000, e
// a "PINCA KELLY CURVA 14 CM" recebeu a da "PINCA HARTMANN PARA COLOCACAO DE
// DIU". Cotar em cima disso e pior do que nao ter descritivo nenhum.
//
// A comparacao ignora hifen porque o PDF quebra palavra no fim da linha
// ("ELETROCARDIO-GRAMA") e isso nao e divergencia de produto.
const CABECA = 160;
function falaDoMesmoProduto(rotulo, texto) {
  const alvo = palavrasDoItem(rotulo);
  if (alvo.length < 2) return true;          // rotulo curto demais para julgar
  const cabeca = new Set(fatia(texto.slice(0, CABECA)).map(limpaNum));
  return alvo.filter(w => cabeca.has(w)).length >= 2;
}

// Recorta o descritivo de cada item cortando no comeco do PROXIMO item.
//
// Antes cada item era procurado sozinho e a celula terminava num padrao de
// "unidade + quantidade". Quando o edital nao usa esse padrao, o corte nao
// acontecia e o item engolia os seguintes: no edital de Salto/SP a descricao do
// item 1 (FRIGOBAR) vinha com os itens 2 a 8 dentro dela, porque ali a linha
// comeca com "2 165.6.205" e nao com "UN 5". O usuario abriu o PDF e viu a
// tabela embaralhada.
//
// Agora o texto e segmentado de uma vez: marca-se onde CADA item do edital
// aparece, ordena-se, e o descritivo de um item vai da sua marca ate a marca
// seguinte, seja de quem for. Item nenhum pode invadir o proximo, porque o
// proximo e o limite. Itens iguais repetidos (Salto lista a mesma geladeira nos
// itens 5 e 6) geram marcas separadas e recebem o mesmo texto, que e o certo.
// Palavras sem valor para reconhecer um produto.
const VAZIAS = new Set(['para','com','sem','dos','das','que','por','uma','nao','tipo','material',
  'modelo','unidade','medida','aplicacao','caracteristicas','adicionais','minimo','maximo',
  'cor','voltagem','tensao','potencia','capacidade','altura','largura','comprimento','dimensoes']);

// Remissoes que o orgao escreve no lugar da descricao: "AR-CONDICIONADO 30.000
// BTU, CONFORME DESCRITIVO NO TERMO DE REFERENCIA". As palavras da remissao
// aparecem no edital inteiro e puxavam a janela para o lugar errado.
const REMISSAO = /\s*[,.;-]?\s*(?:conforme|vide|ver)\s+(?:o\s+|a\s+|as\s+|os\s+)?(?:termo|descritiv|edital|anexo|tabela|especifica|item)[^,.;]*/gi;

// Os numeros contam, e juntos: "20.000" vira o token "20000", nao "20" e
// "000". Sem isso o ar-condicionado de 20.000 BTU casava com a celula do de
// 30.000 — texto limpo, produto errado, e ninguem percebia porque a auditoria
// de contaminacao so procura item dentro de item.
const fatia = s => normIgual(String(s).replace(/-\s*/g, ''))
  .match(/[a-z]+|\d[\d.,]*\d|\d/g) || [];
const util = w => (/^\d/.test(w) ? w.replace(/[.,]/g, '').length >= 3
                                 : w.length >= 4 && !VAZIAS.has(w));
const limpaNum = w => (/^\d/.test(w) ? w.replace(/[.,]/g, '') : w);

const palavrasDoItem = rotulo => [...new Set(
  fatia(String(rotulo).replace(REMISSAO, ' ')).filter(util).map(limpaNum))];

// Segunda passada, para o item cujo rotulo nao aparece LITERAL no edital.
//
// A ancora exige trecho exato e contiguo, e isso perde o caso mais comum de
// todos: o PNCP escreve "FOGAO 06 BOCAS" e o edital escreve "FOGAO INDUSTRIAL
// 6 BOCAS" — mesmo produto, texto diferente. Eram 127 itens em 09/09/2026, o
// maior grupo de faltantes, e o usuario pediu para conferir um por um.
//
// Aqui nao se procura a frase: procura-se ONDE as palavras do item se juntam.
// Uma janela corre o texto e a posicao vencedora e a que reune mais palavras
// distintas do rotulo. A segmentacao continua igual depois disso, entao um
// item nunca invade o outro mesmo que a janela erre.
const JANELA_TOKENS = 45;
function marcaPorProximidade(tokens, alvo, numero, numeroDaLinha) {
  if (alvo.length < 2) return -1;
  const querido = new Set(alvo);
  let melhorPos = -1, melhorN = 0, melhorNota = -1;
  for (let i = 0; i < tokens.length; i++) {
    // A janela so vale se comecar numa palavra do item: comecando no meio, a
    // marca cairia antes do nome do produto e o recorte abriria fora de lugar.
    if (!querido.has(tokens[i].w)) continue;
    const vistas = new Set();
    for (let j = i; j < tokens.length && j < i + JANELA_TOKENS; j++) {
      if (querido.has(tokens[j].w)) vistas.add(tokens[j].w);
    }
    // O numero do item impresso na abertura da linha vale mais que qualquer
    // palavra. Sem ele, os itens 2 e 3 de Cubatao/SP — "Cafeteira Eletrica
    // capacidade: 15" e "capacidade: 6" — caem na MESMA posicao, porque as
    // palavras sao as mesmas e a capacidade e curta demais para virar token; os
    // dois recebem o mesmo trecho e acabam os dois sem descritivo. O edital
    // separa as linhas com "...R$ 6.861,03 2 Cafeteira Industrial Eletrica" e
    // "...R$ 6.375,43 3 Cafeteira...", e e esse numero que decide.
    const nota = vistas.size
      + (numeroDaLinha && numeroDaLinha(tokens[i].p) === numero ? 1000 : 0);
    if (nota > melhorNota) { melhorNota = nota; melhorN = vistas.size; melhorPos = tokens[i].p; }
  }
  // Exige a maioria das palavras do item, e nunca menos de duas: com uma so,
  // "fogao" casaria com a linha de qualquer outro fogao.
  //
  // O teto de cinco existe porque a exigencia proporcional punia o rotulo
  // LONGO: "Aparelho Ar Condicionado capacidade refrigeracao: 12.000,
  // caracteristicas adicionais 1: controle remoto/display digital/timer/selo
  // procel, modelo: split inverter" tem 13 palavras uteis e precisava de 8
  // coincidencias, enquanto "FOGAO 06 BOCAS" precisava de 2. Quanto mais o
  // PNCP descrevia, mais dificil ficava casar — o inverso do que faz sentido.
  const minimo = Math.max(2, Math.min(5, Math.ceil(alvo.length * 0.6)));
  // A linha que abre com o numero do item nao precisa provar mais nada: a
  // identidade ja esta dada pelo edital. Sem esta saida, o item 3 de Cubatao/SP
  // achava a linha certa pelo numero e era reprovado logo depois por reunir so
  // tres palavras do rotulo — "Cafeteira Industrial Eletrica: Capacidade 06
  // litros..." simplesmente nao repete o vocabulario do catalogo do PNCP.
  if (melhorNota >= 1000) return melhorPos;
  return melhorN >= minimo ? melhorPos : -1;
}

// Vale a pena guardar este recorte para este item?
//
// Acrescenta 40 caracteres ao rotulo, ou e uma especificacao substancial por si
// (150+) e ainda maior que o rotulo; alem disso comeca no nome do produto, nao
// esta sujo de assinatura digital e fala do mesmo produto do rotulo.
function serve(rotulo, t, confirmado) {
  if (!t) return false;
  // Especificacao de 150 caracteres para cima vale por si, sem comparar com o
  // rotulo. Comparar castigava justamente o item que o PNCP descreve por
  // extenso: o item 2 de Paranavai/PR tem 340 caracteres de rotulo de catalogo
  // e a celula do edital tem 280 — a celula oficial, do produto certo, era
  // recusada por ser "curta", e o item ficava com a linha do cassete de 48.000,
  // que passava so por ser a mais comprida da tabela.
  // Piso de 150 caracteres para a celula anonima; 60 para a que abre com o
  // numero do item impresso no edital, porque ai a identidade esta provada e o
  // que resta e so o tamanho. O item 107 de Sao Jose da Boa Vista/PR e assim: a
  // linha inteira dele e "Ventilador de parede - Com 50cm de diametro, baixo
  // nivel de ruido e facil instalacao", 85 caracteres, e recusa-la deixava o
  // item sem nada ou, pior, com a linha do ventilador de teto ao lado.
  const piso = confirmado ? 60 : 150;
  const grande = t.length >= piso || t.length > rotulo.length + 40;
  // A prova de produto e para quando nao se sabe de quem e a linha. Confirmada
  // pelo numero do item, ela so atrapalha: o item 6 de Cubatao/SP e "Coifa
  // aplicacao: cozinha" no catalogo e "Coifa Industrial/Residencial: Material em
  // aco inox..." no edital — uma palavra em comum, e a linha e inequivocamente
  // dele, aberta com o 6 depois do total da linha 5.
  if (confirmado) return grande && !comecaNoMeio(t) && !AINDA_SUJO.test(t);
  return grande && !comecaNoMeio(t) && !AINDA_SUJO.test(t) && falaDoMesmoProduto(rotulo, t);
}

function descritivosPorItem(secoes, itens) {
  const plano = normIgual(secoes);
  // O numero do item, impresso logo antes da linha, decide antes das palavras.
  //
  // Em Santa Maria/RS a tabela sai colada — "...do produto.45Cafeteira eletrica
  // com capacidade minima de 1,2 litros..." e "...232,000046Cafeteira automatica
  // com capacidade minima de 6 litros...". As palavras nao separam as duas
  // ("1,2" e curto demais para virar token), mas o numero separa, e ele e
  // exatamente o que o edital usa para identificar o item.
  // Le o numero que ABRE a linha, imediatamente antes do nome do produto.
  //
  // Tres formas, todas vistas em edital de verdade:
  //   "45Cafeteira eletrica..."        numero colado (Santa Maria/RS)
  //   "...490,75004Fogao eletrico"     numero com zero a esquerda, colado no
  //                                    centavo da linha de cima (Santa Maria/RS)
  //   "107 Unid Ventilador de parede"  numero, unidade, nome (Sao Jose da Boa
  //                                    Vista/PR)
  const ABERTURA = /(?:^|[^0-9])(0*[0-9]{1,4})[.)-]?\s*(?:(?:un|und|unid|unidade|pc|pca|peca|cx|caixa|par|kit|servico|kg)\.?\s*)?$/i;
  const numeroDaLinhaAntes = (pos) => {
    const antes = plano.slice(Math.max(0, pos - 22), pos);
    const m = antes.match(ABERTURA);
    if (m) return +m[1];
    // colado em outro numero, so vale com zero a esquerda: "75004" e o item 4,
    // "75" com o centavo nao e item nenhum
    const z = antes.match(/0{1,4}([1-9][0-9]{0,3})$/);
    return z ? +z[1] : null;
  };

  // Mesmo comprimento do plano, so com o hifen valendo espaco: serve de
  // segunda tentativa para a ancora, sem deslocar posicao nenhuma.
  const planoH = plano.replace(/-/g, ' ');
  // Uma marca por POSICAO, com todos os itens que casam ali. Guardar uma marca
  // por item dava marcas repetidas na mesma posicao quando dois itens sao o
  // mesmo produto, e o trecho entre duas marcas coladas tem tamanho zero: em
  // Salto/SP a geladeira do item 5 ficava sem descritivo e a do item 6, que e
  // identica, ficava com ele.
  const porPos = new Map();
  const semAncora = [];
  itens.forEach((it, i) => {
    const achado = ancoraDe(plano, planoH, it[1]);
    if (!achado) { semAncora.push(i); return; }
    const { ancora: a, plano: onde } = achado;
    let de = 0;
    for (;;) {
      const k = onde.indexOf(a, de);
      if (k < 0) break;
      if (!porPos.has(k)) porPos.set(k, []);
      porPos.get(k).push(i);
      de = k + a.length;
    }
  });

  // Quem nao casou pela frase exata tenta pela proximidade das palavras. Os
  // tokens sao montados uma vez so: sao editais de centenas de milhares de
  // caracteres, e refazer isso por item deixaria a rodada inviavel.
  if (semAncora.length) {
    const tokens = [];
    for (const m of plano.matchAll(/[a-z]+|\d[\d.,]*\d|\d/g)) tokens.push({ p: m.index, w: limpaNum(m[0]) });
    for (const i of semAncora) {
      const pos = marcaPorProximidade(tokens, palavrasDoItem(itens[i][1]),
                                     itens[i][0], numeroDaLinhaAntes);
      if (pos < 0) continue;
      if (!porPos.has(pos)) porPos.set(pos, []);
      porPos.get(pos).push(i);
    }
  }
  const posicoes = [...porPos.keys()].sort((a, b) => a - b);

  // Cada posicao vira um trecho: da marca ate a marca seguinte.
  const trechos = posicoes.map((pos, k) => {
    const proxima = k + 1 < posicoes.length ? posicoes[k + 1] : secoes.length;
    const fim = Math.min(proxima, pos + TETO_ITEM, secoes.length);
    return cortaNaProximaLinha(secoes.slice(pos, fim).replace(/\s+/g, ' ').trim());
  });

  // Entre os trechos que sobraram para o item, ganha o que FALA DELE — nao o
  // mais comprido.
  //
  // Escolher pelo tamanho parecia inofensivo e nao era. Quando a ancora encolhe
  // ate o nome generico do produto ("ar condicionado"), ela casa na linha de
  // TODOS os aparelhos do edital: os itens 1, 2 e 3 de Paranavai/PR — 9.000,
  // 18.000 e 36.000 BTUs — ficaram os tres com a celula do item 4, o cassete de
  // 48.000, so porque era a linha mais longa. Texto limpo, oficial e do produto
  // errado nos tres. Em Catanduva/SP a balanca de animais FILHOTES 15 kg recebeu
  // a de ADULTOS 200 kg pelo mesmo caminho.
  //
  // A contagem e na CABECA do trecho, onde fica o nome do produto: contando no
  // corpo inteiro o trecho comprido venceria de novo, so por ter mais palavras.
  const candidatos = new Map();
  posicoes.forEach((pos, k) => {
    for (const i of porPos.get(pos)) {
      if (!candidatos.has(i)) candidatos.set(i, []);
      candidatos.get(i).push(k);
    }
  });
  const CABECA_ESCOLHA = 220;


  // A capacidade do aparelho vale por varias palavras.
  //
  // Em Paranavai/PR os itens 1 e 2 sao os dois um split high wall quente/frio
  // com controle remoto sem fio a 220V; o que os separa e 9.000 contra 18.000
  // BTUs. Contando cada palavra igual, as duas linhas empatavam em 8 e o
  // desempate por tamanho dava a linha do 9.000 para os dois. O numero e o unico
  // token que distingue, entao pesa 3.
  const PESO_NUMERO = 3;
  const ehNumero = w => /^[0-9]/.test(w);

  // E a capacidade DO OUTRO item veta.
  //
  // Se a cabeca do trecho anuncia 48.000 BTUs, 48.000 e a capacidade de outro
  // item do mesmo edital e a capacidade deste nao aparece ali, entao aquela
  // linha e do outro — por mais palavras que as duas tenham em comum. Sem isto
  // os itens 3 e 6 de Paranavai/PR (36.000 e 60.000) ficavam os dois com a
  // celula do cassete de 48.000.
  const numsDe = new Map();
  for (const i of candidatos.keys()) numsDe.set(i, new Set(palavrasDoItem(itens[i][1]).filter(ehNumero)));
  const alheios = new Map();
  for (const i of candidatos.keys()) {
    const fora = new Set();
    for (const [j, ns] of numsDe) if (j !== i) for (const n of ns) fora.add(n);
    for (const n of numsDe.get(i)) fora.delete(n);
    alheios.set(i, fora);
  }

  const numerosDoEdital = new Set(itens.map(it => it[0]).filter(Number.isInteger));
  const melhor = new Map();
  for (const [i, quais] of candidatos) {
    const rotulo = itens[i][1];
    const alvo = palavrasDoItem(rotulo);
    const meus = numsDe.get(i), fora = alheios.get(i);

    // Cabeca de cada candidato, uma vez so.
    const cabecas = quais.map(k => {
      const t = trechos[k] || '';
      const c = new Set(fatia(t.slice(0, CABECA_ESCOLHA)).map(limpaNum));
      return { k, t, c, nums: [...c].filter(ehNumero) };
    });

    // O veto so age quando tem como apontar o certo: ou existe candidato que
    // repete um numero DESTE item — e ai os que nao repetem sao de outro —, ou
    // a cabeca anuncia a capacidade de outro item.
    //
    // Sem essa trava o veto derrubava dez descritivos certos, entre eles o
    // FRIGOBAR do item 1 de Salto/SP, so porque a linha trazia o codigo do
    // material e o rotulo do PNCP nao tem numero nenhum para comparar.
    // Vale so o numero que e SO deste item. Tensao e potencia se repetem pelo
    // edital inteiro: o item 107 de Sao Jose da Boa Vista/PR tem "127/220" no
    // rotulo, o 109 tambem, e por causa desse 127 o veto derrubava a propria
    // linha do 107.
    const meusSo = new Set([...meus].filter(w => !fora.has(w)));
    const alguemTemMeu = meusSo.size > 0 && cabecas.some(x => x.nums.some(w => meusSo.has(w)));

    // "Forte" e o numero que so pode ser capacidade: 9.000, 18.000, 48.000 —
    // mil para cima e redondo. Codigo de catalogo nao passa (165.6.260 vira
    // 1656260, 104740 tambem nao e redondo) e a voltagem tambem nao: 220 esta
    // em todo item do edital e servia de salvo-conduto para a linha errada — o
    // item 5 de Paranavai/PR (55.000 BTUs) ficava com a celula do cassete de
    // 48.000 so porque as duas linhas dizem 220V.
    const forte = w => { const n = +w; return n >= 1000 && n % 100 === 0; };
    const meusFortes = new Set([...meus].filter(forte));

    // O numero impresso na abertura de cada linha candidata.
    const numLinha = cabecas.map(x => numeroDaLinhaAntes(posicoes[x.k]));
    // So veta pelo numero quando ele apontou a linha CERTA para este item; se
    // nenhuma candidata abre com o numero dele, o numero nao sabe de nada e
    // fica quieto. Era o que faltava para o item 107 de Sao Jose da Boa
    // Vista/PR (ventilador de PAREDE), que ficava com a linha do 108 (de TETO)
    // porque a celula certa e curta e a do vizinho e longa.
    const achouMinhaLinha = numLinha.some(n => n === itens[i][0]);

    let vencedor = '', nota = -1, venceuPeloNumero = false;
    cabecas.forEach(({ k, t, c, nums }, idx) => {
      if (!t) return;
      const confirmado = numLinha[idx] === itens[i][0];
      const doVizinho = achouMinhaLinha && !confirmado
                     && numLinha[idx] !== null && numerosDoEdital.has(numLinha[idx]);
      const temMeu = nums.some(w => meusSo.has(w));
      // Se o edital imprime o numero deste item abrindo a linha, e a linha
      // dele — nenhuma heuristica de palavra ou de capacidade desmente isso.
      const deOutro = confirmado ? false : (doVizinho
        || (!temMeu && alguemTemMeu)
        || (meusFortes.size > 0 && !nums.some(w => meusFortes.has(w))
            && nums.some(w => fora.has(w) && forte(w))));
      // Ordem de peso: primeiro o trecho que SERVE (as mesmas regras que o
      // gravam la embaixo) e nao e de outro item; depois o que traz o numero do
      // item impresso antes; e so entao as palavras, com as numericas pesando
      // mais. Sem a primeira camada o numero levava a escolha para um trecho
      // que ia ser recusado adiante, e o item, que tinha uma celula boa entre
      // as candidatas, acabava sem nada: foram quatro assim em Bueno Brandao/MG.
      const n = (serve(rotulo, t, confirmado) && !deOutro ? 1e6 : 0)
              + (confirmado ? 1e3 : 0)
              + alvo.filter(w => c.has(w)).reduce((s, w) => s + (ehNumero(w) ? PESO_NUMERO : 1), 0);
      if (n > nota || (n === nota && t.length > vencedor.length)) { nota = n; vencedor = t; venceuPeloNumero = confirmado; }
    });
    // Abaixo de 1e6 nenhum trecho servia, ou o unico que servia era de outro
    // item. Melhor o item sem descritivo do que com a especificacao do vizinho.
    if (vencedor && nota >= 1e6) melhor.set(i, { texto: vencedor, confirmado: venceuPeloNumero });
  }

  // Dois itens de rotulos diferentes nao podem sair com o MESMO descritivo.
  //
  // Quando isso acontece, uma das duas celulas e do outro produto — e nao ha
  // como saber qual sem inventar. Em Santa Maria/RS tres cafeteiras (8 L, 1,2 L
  // e 6 L) terminavam todas com a celula da de 1,2 L, e tres refrigeradores
  // (445 L, 378 L, 378 L) com a de "entre 370 e 407 litros".
  //
  // Fica com o texto so quem teve o numero do item confirmado no edital; os
  // demais ficam sem, e o resumo mostra o rotulo do PNCP, que ao menos traz a
  // capacidade certa. Descritivo faltando o usuario percebe; descritivo do
  // vizinho, nao.
  const porTexto = new Map();
  for (const [i, v] of melhor) {
    if (!porTexto.has(v.texto)) porTexto.set(v.texto, []);
    porTexto.get(v.texto).push(i);
  }
  const soTexto = new Map();
  for (const [texto, quais] of porTexto) {
    const rotulos = new Set(quais.map(i => normIgual(itens[i][1]).replace(/[^a-z0-9]+/g, ' ').trim()));
    if (rotulos.size < 2) { for (const i of quais) soTexto.set(i, melhor.get(i)); continue; }
    for (const i of quais) if (melhor.get(i).confirmado) soTexto.set(i, melhor.get(i));
  }
  return soTexto;
}

let comTexto = 0, semTexto = 0, itensTotal = 0, itensRicos = 0;

for (const e of dados.editais) {
  const v = base.editais[e[C.path]];
  if (!v || !v.itens) continue;

  const secoes = (v.secoes || []).map(s => s.texto).join('  ');
  if (!secoes) { semTexto++; continue; }
  comTexto++;

  const recortes = descritivosPorItem(secoes, v.itens);
  v.itens.forEach((it, i) => {
    itensTotal++;
    // it = [numero, descricao, quantidade, unidade, valor, beneficio]
    const completo = recortes.get(i);
    // Uma regra so, a do serve(), para escolher entre trechos e para gravar.
    // Enquanto eram duas, a escolha elegia a celula certa do item 2 de
    // Paranavai/PR e a gravacao a recusava logo depois, por ser mais curta que
    // o rotulo de catalogo — o item ficava vazio com o texto certo em maos.
    if (completo && serve(it[1], completo.texto, completo.confirmado)) {
      it[6] = completo.texto;
      itensRicos++;
    } else if (it.length > 6) it.length = 6;
  });
}

fs.writeFileSync(arquivo, JSON.stringify(base), 'utf8');
console.log(`${comTexto} edital(is) com texto de secao · ${semTexto} sem`);
console.log(`${itensRicos} de ${itensTotal} itens ganharam descritivo completo`);
console.log(`docs/descritivos.json: ${(fs.statSync(arquivo).size / 1024).toFixed(0)} KB`);
