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
  // O catalogo do PNCP cola o numero na unidade e o edital separa: "TANQUINHO
  // 10KG" contra "TANQUINHO 10 KG". Sem a variante com espaco o item 10 de
  // Apiai/SP nao marcava a propria linha, e o microondas do item 8 seguia por
  // cima dela levando junto o ventilador do 11.
  for (const t of [...tentativas]) {
    const comEspaco = t.replace(/(\d)([A-Za-z])/g, "$1 $2");
    if (comEspaco !== t && !tentativas.includes(comEspaco)) tentativas.push(comEspaco);
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
// O carimbo de assinatura CORTA a celula, em vez de anular o descritivo.
//
// Cada sistema carimba de um jeito proprio — um deles sai ate sem espaco
// ("StatusASSINADOOutrasinforma esCategoria") — e perseguir todos os formatos
// nao acaba. So que descartar o trecho inteiro por causa do carimbo custa o
// descritivo de itens cuja celula esta perfeita antes dele: em Ponta Grossa/PR
// a cafeteira do item 6 e o fogao do 12 traziam mil e setecentos caracteres de
// especificacao boa, seguidos do carimbo.
//
// Entao o carimbo entra no FIM_DE_LINHA, que corta ali, e o AINDA_SUJO fica
// como ultima defesa para o caso de ele aparecer no COMECO — quando nao ha
// celula a salvar e o item volta a mostrar a descricao do PNCP.
const CARIMBO = /\s*[A-Za-z]?(?:assinad[oa]|assinatura eletr[oô]nica|pp-signer|tramitado e assinado|confira as assinatura|documento assinado|verifique pelo QRCode|verificar a autenticidade)/i;
const AINDA_SUJO = /^.{0,80}(?:assinad[oa]|pp-signer|tramitado e assinado|confira as assinatura)/i;

const FIM_DE_LINHA = [
  CARIMBO,
  // Valor total e valor unitario GRUDADOS, que e como a tabela da UFPel
  // (Pelotas/RS) fecha a linha: "...Sem instalacao. 211.875,002.118,75 CNPJ".
  /\s[\d.]{1,12},\d{2}[\d.]{1,12},\d{2}(?=\s|$)/,
  // A pesquisa de precos que vem depois de cada linha no termo de referencia
  // do governo federal: tres fornecedores com CNPJ, razao social e o inciso da
  // IN 65/2021. E orcamento, nao especificacao do produto.
  /\s*CNPJ\s*[-–]\s*Raz\u00e3o\s*Social/i,
  /\s*Par\u00e2metro\s+Utilizado/i,
  /\s*(?:Painel de Pre\u00e7os|VALOR TOTAL M\u00c9DIO ESTIMADO|SOLICITA\u00c7\u00c3O DE COMPRA)/i,
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
  ,
  // A CLAUSULA que abre o contrato, com o ordinal por extenso. O padrao antigo
  // so listava PRIMEIRA e SEGUNDA, e os itens 7 e 14 de Descalvado/SP — as
  // cortinas de ar — seguiam por "CLAUSULA SEXTA - DOS PAGAMENTOS 6.1. Os
  // pagamentos serao efetuados em ate 15 (quinze) dias..." ate o teto. O usuario
  // abriu o resumo e viu a clausula de pagamento no lugar da especificacao.
  /CL[\u00c1A]USULA\s+[A-ZÀ-Ú]{4,}/,
  // Numeracao de clausula: "5.1. A", "1.3. Natureza do objeto". Dentro de uma
  // especificacao a medida usa virgula (2,35 x 3,51), nunca ponto seguido de
  // ponto e maiuscula.
  /\s\d{1,2}\.\d{1,2}\.\s+[A-ZÀ-Ú]/,
  // Cabecalho do edital ou da tabela reaparecendo depois da celula.
  /PROCESSO ADMINISTRATIVO N/i,
  /ESTIMATIVA DO VALOR TOTAL/i,
  /DESCRI[\u00c7C][\u00c3A]O DOS PRODUTOS\s+ITEM/i,
  /Natureza do objeto|FUNDAMENTA[\u00c7C][\u00c3A]O\s+(?:DA|E)\b/i,
  // O modelo de proposta que vem depois da tabela: o item 7 de Lucas do Rio
  // Verde/MT seguia por "Local e data. Carimbo da Empresa/Assinatura do
  // responsavel *(Elaborar em Papel Timbrado)".
  /Carimbo da Empresa|Elaborar em Papel Timbrado|\sLocal e data\./i,
  // A clausula de composicao de preco, que fecha a especificacao do item 7 de
  // Lucas do Rio Verde/MT: "...tributos, encargos previdenciarios, fiscais e
  // comerciais incidentes, taxa de administracao, frete, seguro... 1.5 Os precos
  // ajustados nao sofrerao reajuste". A numeracao "1.5" sem o segundo ponto nao
  // e pega pelo padrao de clausula, entao vao os termos inteiros.
  /encargos previdenci[\u00e1a]rios|taxa de administra[\u00e7c][\u00e3a]o|n[\u00e3a]o sofrer[\u00e3a]o reajuste/i,
  // A clausula de vigencia, que fecha a especificacao em Trabiju/SP.
  /vig[\u00eae]ncia do Contrato ser[\u00e1a]|contados a partir da assinatura/i,
  /ser[\u00e1a] atestada a entrega|servidor designado pela administra/i
  ,
  // O formulario de proposta e o estudo tecnico, que vem logo depois da tabela
  // e nao descrevem produto nenhum: em Descalvado/SP a cortina de ar seguia por
  // "VALOR TOTAL DA PROPOSTA EM REAIS E POR EXTENSO", e em Itai/SP a cafeteira
  // por "5.1 Metodologia de Definicao das Quantidades e Memoria de Calculo".
  //
  // Sao termos inteiros, e nao a numeracao "5.1" sozinha: dentro de uma
  // especificacao "1.2 Litros" e medida, e cortar ali comeria o descritivo.
  /VALOR TOTAL DA PROPOSTA/i,
  /Metodologia de Defini[\u00e7c][\u00e3a]o/i,
  /LEVANTAMENTO DO MERCADO/i,
  /ESTIMATIVA DE VALORES DA CONTRATA/i,
  /Mem[\u00f3o]ria de C[\u00e1a]lculo/i
  ,
  // A conclusao do estudo tecnico. Sem ela, o item 6 de Itai/SP trocava a
  // especificacao da cafeteira pela justificativa da compra — "Destinada ao
  // apoio das atividades escolares, atualmente o cafe e passado em panos" —,
  // que e o trecho vizinho e ficava mais comprido depois dos outros cortes.
  /\d\.?\s*CONCLUS[\u00c3A]O/i,
  /Diante do exposto/i,
  /esta Nutricionista Respons/i
  ,
  // O cabecalho da tabela reaparecendo: dali para baixo e a proxima pagina da
  // planilha, nao a continuacao desta celula.
  /Item\s+Especifica[\u00e7c][\u00e3a]o\s+Unidade/i,
  /Unidade\s+Pre[\u00e7c]o\s+M[\u00e1a]ximo/i,
  /Descri[\u00e7c][\u00e3a]o\s+do\s+(?:Objeto|Produto)\s+(?:Unidade|Quantidade|Und)/i,
  // "Item Descricao Quantidade Unidade" e o cabecalho do pedido de compra da
  // UFTM (Uberaba/MG). Sem ele o tripe do item 53 seguia pelo item 54 inteiro
  // — um monitor interativo de dois mil caracteres — e ainda pelo bloco de
  // assinaturas e pelo pedido seguinte.
  /\bItem\s+Descri[\u00e7c][\u00e3a]o\s+(?:Quantidade|Unidade|Und|Qtd)/i,
  // Volta ao clausulado do edital. O ultimo item de cada tabela nao tem um
  // proximo para fechar a celula e seguia ate o teto: o bebedouro do item 37 de
  // Santa Maria/RS levava junto a TV do 41, e a fritadeira do 8 de Vicosa/MG
  // ia parar na lousa interativa.
  /\s(?:Termo de Recebimento|requisitos estabelecidos neste documento|hor[\u00e1a]rio oficial de Bras[\u00edi]lia|Considerando as solu[\u00e7c][\u00f5o]es|contrata[\u00e7c][\u00e3a]o especifica)/i
  ,
  // Cabecalho do documento reaparecendo no rodape da pagina seguinte: o nome do
  // orgao, o CNPJ solto e o "Anexo ao Termo de Referencia" fechavam a celula do
  // item 37 de Santa Maria/RS com 3.300 caracteres de papel timbrado.
  /Anexo ao Termo de Refer[\u00eae]ncia/i,
  /\s\d{14}(?=\s)/
  ,
  // Cauda de formulario e de rodape. A especificacao do produto ja terminou; o
  // que vem depois e o campo em branco para preencher, o endereco de entrega,
  // o carimbo do sistema ou o cabecalho da folha seguinte.
  //
  // Linha de sublinhados e campo de formulario, nunca descricao: e assim que a
  // planilha de Santa Maria/RS separa a celula do preco ("______ _____ 15,00
  // 2.433,0000 29 Geladeira /").
  /\s_{4,}/,
  // "Local de Entrega (Quantidade):Belo Horizonte/MG (1)Grupo:G215" fecha cinco
  // celulas do edital de Belo Horizonte/MG.
  /(?:Local|Endere[\u00e7c]o)\s+de\s+Entrega/i,
  /\bGrupo\s*:\s*G\d{2,}/,
  // Rodape do modelo da AGU ("Atualizacao: DEZ/2025") e carimbo de versao do
  // Compras.gov.br ("(v 0.3) Status ASSINADO").
  /Atualiza[\u00e7c][\u00e3a]o\s*:\s*[A-Za-z]{3}\/\d{4}/,
  /\(v\s*\d+\.\d+/
  ,
  // O RODAPE da tabela, que e onde a celula do ultimo item termina de verdade.
  // O item 74 de Mariopolis/PR e o ultimo da planilha e seguia por "492,00
  // 3.936,00 Total dos Itens R$ 592.908,71 2. CONDICOES GERAIS 2.1 As propostas
  // deverao vir datados... 2.3 Na nota fiscal, os itens deverao estar com".
  /\s(?:Total\s+d[oa]s\s+[Ii]tens|Total\s+[Gg]eral\s+d[oa])/i,
  /\s(?:CONDI[\u00c7C][\u00d5O]ES\s+GERAIS|Condi[\u00e7c][\u00f5o]es\s+[Gg]erais)/
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
  const cabeca = new Set(fatiaTexto(texto.slice(0, CABECA)).map(limpaNum));
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
// O hifen sai das DUAS maneiras, e os dois conjuntos de tokens valem.
//
// Tirar o hifen junta o que ele separava: "AR-CONDICIONADO" vira
// "arcondicionado" e "BTUs- QUENTE" vira "btusquente". Nenhum dos dois casa com
// o rotulo "AR CONDICIONADO 18.000 BTUS", e o item 74 de Quedas do Iguacu/PR
// ficava sem descritivo com a celula certa recortada em maos — so faltava
// reconhece-la.
//
// Juntar continua necessario para a palavra quebrada no fim da linha
// ("ELETROCARDIO-GRAMA"), entao em vez de escolher, geram-se as duas formas: a
// colada e a separada. Quem consome isto usa Set, e token repetido nao conta
// duas vezes.
const RE_TOKEN = /[a-z]+|\d[\d.,]*\d|\d/g;
const fatia = s => normIgual(String(s).replace(/-\s*/g, '')).match(RE_TOKEN) || [];

// No TEXTO do edital o hifen sai das duas maneiras; no rotulo, nao.
//
// Tirar o hifen junta o que ele separava: "AR-CONDICIONADO" vira
// "arcondicionado" e "BTUs- QUENTE" vira "btusquente". O item 74 de Quedas do
// Iguacu/PR — rotulo "AR CONDICIONADO 18.000 BTUS", sem hifen — nao se
// reconhecia na propria celula por causa disso, e ficava sem descritivo com o
// texto certo recortado em maos.
//
// Juntar continua necessario para a palavra quebrada no fim da linha
// ("ELETROCARDIO-GRAMA"), entao o texto oferece as duas formas e o rotulo
// escolhe qual casa. Fazer o mesmo no rotulo seria pior: ele ganharia um token
// a mais, o minimo exigido subiria junto, e os itens 6 e 7 de Campina do Monte
// Alegre/SP passariam a precisar de tres coincidencias onde ha duas.
const fatiaTexto = s => [
  ...(normIgual(String(s).replace(/-\s*/g, '')).match(RE_TOKEN) || []),
  ...(normIgual(String(s).replace(/-/g, ' ')).match(RE_TOKEN) || []),
];
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
  // Celula curta mas FECHADA tambem vale: o item 6 de Diamante D'Oeste/PR e
  // "Liquidificador industrial de alta rotacao, capacidade minima 4 litros, copo
  // em aco inoxidavel, motor potencia minima 0,5 cv." — 123 caracteres, o
  // descritivo inteiro que o edital escreveu, recusado por um piso de 150. O
  // ponto final no fim e o que separa a celula completa do fragmento.
  const fechada = t.length >= 90 && /[.;]$/.test(t.trim());
  const grande = t.length >= piso || fechada || t.length > rotulo.length + 40;
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

  // Uma mencao solta a "LOTE 9" numa clausula nao faz o edital ser por lote —
  // tres lotes distintos, sim.
  const lotesVistos = new Set([...secoes.matchAll(/\bLOTE\s*(?:N?[\u00ba\u00b0o.]?\s*)?(\d{1,3})\b/gi)].map(m => m[1]));
  const lotesDeVerdade = lotesVistos.size >= 3;
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
  //   "03 391765 116669 FORNO MICROONDAS"  numero, codigo de catalogo, nome
  //                                       (Ponta Grossa/PR, que numera "6.",
  //                                       "1)" e "03" na mesma tabela)
  // O separador antes do codigo e obrigatorio: sem ele o motor partia o codigo
  // ao meio e lia "1" de "104740", dando o item 1 de Paranavai/PR como dono da
  // linha do 18.000 BTUs.
  const ABERTURA = /(?:^|[^0-9])(0*[0-9]{1,4})[.)\-]?(?:\s+[0-9]{5,9}[.,)\-]*){0,2}\s*(?:(?:un|und|unid|unidade|pc|pca|peca|cx|caixa|par|kit|servico|kg)\.?\s*)?$/i;
  // De que LOTE e a linha que comeca aqui.
  //
  // O PNCP nao tem campo de lote: a API entrega numeracao corrida de 1 a 100 e
  // quem separa em lotes e o texto do edital. Em Quedas do Iguacu/PR o item 74
  // da API e o "LOTE 37, ITEM 1" do edital, e e por esse par que se da lance.
  //
  // O lote e o ultimo anunciado ANTES da linha. A janela e de 4.000 caracteres:
  // um lote costuma ter poucos itens, e alem disso o cabecalho ja e outro.
  // De que LOTE e o item.
  //
  // O PNCP nao tem campo de lote: a API entrega numeracao corrida de 1 a 100 e
  // quem separa em lotes e o texto do edital. Em Quedas do Iguacu/PR o item 74
  // da API e o "LOTE 37, ITEM 1" do edital, e e por esse par que se da lance.
  //
  // A busca NAO parte do descritivo, e sim do nome do produto — porque o mesmo
  // item aparece duas vezes no edital: no termo de referencia, que descreve mas
  // nao usa lote, e na planilha de lotes, que so lista. O recorte vem do termo,
  // e ali o lote mais proximo estava a 20 e 33 mil caracteres de distancia: era
  // o cabecalho de outra parte do documento, e teria sido lido como se fosse o
  // do item.
  //
  // Na planilha o cabecalho fica colado na linha — nos itens que ja acertavam,
  // a 90 e 117 caracteres. Por isso a janela e curta: 600 caracteres. Cabecalho
  // longe nao e o do item.
  const RE_LOTE = /\bLOTE\s*(?:N?[\u00ba\u00b0o.]?\s*)?(\d{1,3})\b/gi;
  const JANELA_LOTE = 600;
  const posicoesDeLote = [];
  if (lotesDeVerdade) {
    RE_LOTE.lastIndex = 0;
    for (let m; (m = RE_LOTE.exec(secoes));) posicoesDeLote.push({ p: m.index, n: +m[1] });
  }
  const loteDoItem = (rotulo) => {
    if (!posicoesDeLote.length) return [];
    // o nome do produto e o que vem antes da primeira virgula ou do primeiro
    // par "campo: valor" — o resto e especificacao, que a planilha nao repete
    const nome = normIgual(String(rotulo)).split(/[,;:]/)[0].trim().slice(0, 24);
    if (nome.length < 8) return [];
    const vistos = new Map();
    for (let k = plano.indexOf(nome); k >= 0 && vistos.size < 30; k = plano.indexOf(nome, k + 1)) {
      for (let j = posicoesDeLote.length - 1; j >= 0; j--) {
        const L = posicoesDeLote[j];
        if (L.p >= k) continue;
        if (k - L.p <= JANELA_LOTE) vistos.set(L.n, (vistos.get(L.n) || 0) + 1);
        break;
      }
    }
    if (!vistos.size) return [];
    // todos os candidatos, do mais frequente para o menos
    return [...vistos.entries()].sort((x, y) => y[1] - x[1]).map(e => e[0]);
  };

  // A mesma linha, quando o edital imprime a QUANTIDADE entre o numero do item
  // e a unidade: "23 8,0 UND Forno micro-ondas 30 litros" (Mariopolis/PR).
  //
  // Vem antes da ABERTURA por ser mais exigente — pede numero, quantidade com
  // decimal E unidade —, entao nunca rouba uma linha dela. E precisa vir antes:
  // a ABERTURA, nessa linha, lia o "0" de "8,0" e devolvia item zero, que nao
  // existe em edital nenhum. Eram onze itens de Mariopolis/PR, todos com a
  // especificacao inteira no texto e o numero certo impresso ao lado.
  // A unidade e opcional porque o recuo do prefixo pode te-la engolido: a marca
  // do item 66 de Mariopolis/PR fica em "UND LIQUIDIFICADOR INDUSTRIAL", e o
  // que sobra antes dela e "...7.014,60 66 6,0 " — sem a unidade, que ja esta
  // dentro da celula. Sem isto o 66 nao se confirmava e ficava com a celula do
  // 65: os dois sao "Liquidificador Industrial" no catalogo do PNCP e so o
  // edital os separa, em baixa e alta rotacao.
  const ABERTURA_QTD = /(?:^|[^0-9])(0*[0-9]{1,4})\s+[0-9]{1,4}[.,][0-9]{1,3}\s*(?:(?:un|und|unid|unidade|pc|pca|peca|cx|caixa|par|kit|conj|cj|servico|kg)\.?)?\s*$/i;

  const numeroDaLinhaAntes = (pos) => {
    const antes = plano.slice(Math.max(0, pos - 34), pos);
    const q = antes.match(ABERTURA_QTD);
    if (q && +q[1] > 0) return +q[1];
    const m = antes.match(ABERTURA);
    if (m && +m[1] > 0) return +m[1];
    // colado em outro numero, so vale com zero a esquerda: "75004" e o item 4,
    // "75" com o centavo nao e item nenhum
    const z = antes.match(/0{1,4}([1-9][0-9]{0,3})$/);
    return z ? +z[1] : null;
  };

  // Mesmo comprimento do plano, so com o hifen valendo espaco: serve de
  // segunda tentativa para a ancora, sem deslocar posicao nenhuma.
  const planoH = plano.replace(/-/g, ' ');


  // Recua a marca para incluir a palavra que o catalogo tirou do nome.
  //
  // A ancora encolhe ate "ar condicionado" porque o PNCP escreve "Aparelho Ar
  // Condicionado" e o edital escreve "Aparelho de ar condicionado" — o "de" no
  // meio impede o casamento da frase inteira. So que ai a marca cai no "ar", o
  // recorte abre em minuscula e o comecaNoMeio() o recusa como se fosse meio de
  // frase. Em Pelotas/RS os cinco aparelhos tinham a linha certa identificada e
  // os cinco eram jogados fora por isso.
  //
  // Recua no maximo uma palavra capitalizada e a preposicao seguinte, e so
  // quando ela esta colada na marca.
  const PREFIXO = /([A-ZÀ-Ú][A-Za-zÀ-ÿ]{2,14}(?:\s+(?:de|da|do|DE|DA|DO)\s+|\s+)?)$/;
  function recuaPrefixo(pos) {
    const antes = secoes.slice(Math.max(0, pos - 26), pos);
    const m = antes.match(PREFIXO);
    return m ? pos - m[1].length : pos;
  }
  // Uma marca por POSICAO, com todos os itens que casam ali. Guardar uma marca
  // por item dava marcas repetidas na mesma posicao quando dois itens sao o
  // mesmo produto, e o trecho entre duas marcas coladas tem tamanho zero: em
  // Salto/SP a geladeira do item 5 ficava sem descritivo e a do item 6, que e
  // identica, ficava com ele.
  // Ancora de uma palavra so nao vale no MEIO de uma frase.
  //
  // O item 29 de Mariopolis/PR e so "Liquidificador" no catalogo do PNCP, sem
  // nada antes do primeiro campo, e a ancora fica nessa palavra sozinha. Ela
  // casava tambem dentro de "conter uma jarra de liquidificador e 6
  // acessorios", no meio da celula do multiprocessador do item 72 — e como
  // cada marca fecha a celula anterior, o 72 terminava em "uma jarra de".
  //
  // Linha de tabela nao comeca depois de "de": comeca depois de numero, de
  // unidade ou de pontuacao. Vale so para a ancora de uma palavra; com duas ja
  // e especifica o bastante para nao cair no meio de frase.
  //
  // "tipo" e "como" NAO entram: "Refrigerador tipo Frigobar" e o nome do
  // produto, e nao uma mencao de passagem. Com eles na lista, o frigobar do
  // item 30 de Santa Maria/RS perdia a propria celula.
  const NO_MEIO = /(?:^|[^a-z])(?:de|da|do|das|dos|e|ou|com|sem|para|em|no|na)[ ]+$/i;

  const porPos = new Map();
  const semAncora = [];
  itens.forEach((it, i) => {
    const achado = ancoraDe(plano, planoH, it[1]);
    if (!achado) { semAncora.push(i); return; }
    const { ancora: a, plano: onde } = achado;
    const umaPalavra = !a.includes(" ");
    let de = 0;
    for (;;) {
      const k0 = onde.indexOf(a, de);
      if (k0 < 0) break;
      if (umaPalavra && NO_MEIO.test(onde.slice(Math.max(0, k0 - 14), k0))) { de = k0 + a.length; continue; }
      const k = recuaPrefixo(k0);
      if (!porPos.has(k)) porPos.set(k, []);
      porPos.get(k).push(i);
      de = k0 + a.length;
    }
  });

  // Quem nao casou pela frase exata tenta pela proximidade das palavras. Os
  // tokens sao montados uma vez so: sao editais de centenas de milhares de
  // caracteres, e refazer isso por item deixaria a rodada inviavel.
  if (semAncora.length) {
    const tokens = [];
    // A forma colada NAO entra aqui.
    //
    // Tentei acrescenta-la para o item 80 de Quedas do Iguacu/PR ("FORNO
    // MICROONDAS" no catalogo, "MICRO-ONDAS" no edital) e nao resolveu: o que
    // falta ali e a palavra "forno", que o edital nao usa. Em compensacao, o
    // token a mais por palavra hifenizada encurtava o alcance da janela de 45 e
    // custou tres itens que estavam certos — os dois "AR CONDIONADO" de Campina
    // do Monte Alegre/SP e o ventilador de Santa Rita do Passa Quatro/SP.
    for (const m of plano.matchAll(/[a-z]+|\d[\d.,]*\d|\d/g)) tokens.push({ p: m.index, w: limpaNum(m[0]) });
    for (const i of semAncora) {
      const pos = marcaPorProximidade(tokens, palavrasDoItem(itens[i][1]),
                                     itens[i][0], numeroDaLinhaAntes);
      if (pos < 0) continue;
      const posL = recuaPrefixo(pos);
      if (!porPos.has(posL)) porPos.set(posL, []);
      porPos.get(posL).push(i);
    }
  }
  // Terceira via: o NUMERO do item impresso na abertura da linha.
  //
  // A ancora e o nome que o catalogo do PNCP usa, e o edital nem sempre usa o
  // mesmo. Em Santa Maria/RS o item 46 e "Cafeteira Eletrica" no PNCP e
  // "Cafeteira automatica" no edital; o 28 e "Refrigerador Duplex" no PNCP e
  // "Refrigerador domestico" no edital. A ancora entao nao achava a celula
  // propria e casava na do VIZINHO, que por acaso usa a grafia do catalogo — e
  // a regra que proibe dois rotulos com o mesmo texto zerava os dois. Eram oito
  // itens so nesse edital, todos com a especificacao inteira ali no texto.
  //
  // So que o edital imprime o numero do item colado no nome do produto
  // ("...232,0000 46 Cafeteira automatica com capacidade minima de 6 litros"),
  // e o par numero-certo + primeira-palavra-do-produto nao acontece por acaso.
  //
  // Procura a primeira palavra do NOME do produto que tenha cinco letras ou
  // mais. Nao e a primeira palavra e ponto: "Aparelho Ar Condicionado" perde o
  // "aparelho" por ser generico e sobra "ar", que casaria em qualquer lugar do
  // edital. Com esta regra sobra "condicionado", e os tres aparelhos de
  // Mariopolis/PR — 12.000, 24.000 e 32.000 BTUs — acham a propria linha.
  //
  // So o nome, ate a primeira virgula ou o primeiro campo: dali para a frente e
  // especificacao, e "inoxidavel" nao identifica produto nenhum.
  //
  // O numero sozinho nao basta, porque nem todo numero impresso antes de um
  // nome e numero de item. Em Descalvado/SP a lista de quantidades diz
  // "...Ar-condicionado 48.000 BTUs, tipo Split 06 Cortina de Ar 200cm,
  // potencia 600w": o "06" ali e a QUANTIDADE da linha de cima, e a cortina que
  // vem depois e a de 200cm, que e outro item. Entao a linha tambem precisa
  // ABRIR falando deste item — nas primeiras palavras, nao em qualquer ponto
  // dela, senao a propria lista de quantidades, que cita as tres cortinas em
  // seguida, passaria no teste.
  const ABRE = 48;
  const numsDoItem = itens.map(x => new Set(palavrasDoItem(x[1]).filter(w => /^[0-9]/.test(w))));
  const numsDoEdital = new Set();
  for (const c of numsDoItem) for (const n of c) numsDoEdital.add(n);

  itens.forEach((it, i) => {
    const nome = (normIgual(it[1]).replace(GENERICAS, '').split(/[,;:]/)[0].match(/[a-z]{5,}/) || [''])[0];
    if (nome.length < 5) return;
    const meus = numsDoItem[i];
    for (let k = plano.indexOf(nome); k >= 0; k = plano.indexOf(nome, k + 1)) {
      // O numero e procurado em tres pontos: na palavra achada, no comeco da
      // linha e UMA palavra atras.
      //
      // A palavra achada nem sempre e a primeira do nome: "Aparelho Ar
      // Condicionado" perde o generico e sobra "ar", curto demais para procurar,
      // entao a busca cai em "condicionado" e o numero do item fica antes do
      // "Ar". O recuaPrefixo nao alcanca porque exige tres letras na palavra.
      //
      // Uma palavra, e nao tres: andando mais para tras o numero encontrado ja e
      // o da celula anterior, ou um pedaco de preco que por acaso bate. Com tres
      // passos Itaporanga/SP perdeu vinte itens de uma vez, por marcas plantadas
      // no meio das celulas certas.
      let inicio = k;
      if (numeroDaLinhaAntes(inicio) !== it[0]) {
        inicio = recuaPrefixo(k);
        if (numeroDaLinhaAntes(inicio) !== it[0]) {
          const antes = plano.slice(Math.max(0, k - 20), k).match(/(\S+\s*)$/);
          if (!antes) continue;
          inicio = k - antes[1].length;
          if (numeroDaLinhaAntes(inicio) !== it[0]) continue;
        }
      }
      // Recua o prefixo como a ancora recua, senao as duas vias marcam pontos
      // vizinhos na MESMA linha e o trecho entre elas fica com tres caracteres:
      // a ancora de Mariopolis/PR parava em "UND Ar condicionado" e esta via em
      // "Ar condicionado", e o "UND" sozinho virava a celula de um dos dois.
      inicio = recuaPrefixo(inicio);
      const abre = new Set(fatiaTexto(secoes.slice(inicio, inicio + ABRE)).map(limpaNum));
      const alheio = [...abre].some(w => numsDoEdital.has(w) && !meus.has(w));
      const meu = [...abre].some(w => meus.has(w));
      if (alheio && !meu) continue;
      const pos = inicio;
      if (!porPos.has(pos)) porPos.set(pos, []);
      if (!porPos.get(pos).includes(i)) porPos.get(pos).push(i);
    }
  });

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
  const lotes = new Map();
  const candidatosDeLote = new Map();
  const melhor = new Map();
  for (const [i, quais] of candidatos) {
    const rotulo = itens[i][1];
    const alvo = palavrasDoItem(rotulo);
    const meus = numsDe.get(i), fora = alheios.get(i);

    // Cabeca de cada candidato, uma vez so.
    // Trecho de uma duzia de caracteres nao e celula de nada: e a sobra entre
    // duas marcas da MESMA linha, que as duas vias de busca marcam em pontos
    // diferentes — a ancora para no nome do produto, a via do numero para antes
    // da quantidade. O que fica entre elas e "UND", e "01".
    //
    // Tirar da lista resolve duas coisas de uma vez: a sobra nao ganha a escolha
    // por ter o numero do item confirmado — a geladeira do item 2 de Trabiju/SP
    // ficava com uma celula de dois caracteres — e tambem nao faz as candidatas
    // de verdade parecerem do vizinho, o que custava o descritivo inteiro.
    //
    // A linha boa continua inteira na marca seguinte, entao nada se perde.
    const MINIMO = 12;
    const cabecas = quais.filter(k => (trechos[k] || "").length >= MINIMO).map(k => {
      const t = trechos[k] || '';
      const c = new Set(fatiaTexto(t.slice(0, CABECA_ESCOLHA)).map(limpaNum));
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

    let vencedor = '', nota = -1, venceuPeloNumero = false, numeroVencedor = null;
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
      if (n > nota || (n === nota && t.length > vencedor.length)) {
        nota = n; vencedor = t; venceuPeloNumero = confirmado;
        numeroVencedor = numLinha[idx];
      }
    });
    // Abaixo de 1e6 nenhum trecho servia, ou o unico que servia era de outro
    // item. Melhor o item sem descritivo do que com a especificacao do vizinho.
    // O lote vale por si, mesmo quando o descritivo e recusado: ele diz COMO o
    // item se chama no pregao, nao o que ele e. Em Londrina/PR so 4 dos 9 itens
    // tinham recorte aprovado, e a tabela saia com lote em uns e numero solto em
    // outros.
    candidatosDeLote.set(i, loteDoItem(rotulo));
    if (vencedor && nota >= 1e6) melhor.set(i, { texto: vencedor, confirmado: venceuPeloNumero });
  }

  // O lote cresce junto com o numero do item, e e isso que desempata.
  //
  // A planilha lista os lotes em ordem, e a API numera os itens na mesma ordem:
  // em Quedas do Iguacu/PR os itens 71, 72, 75, 76 caem nos lotes 35, 36, 38,
  // 39. Quando um item casa com mais de um cabecalho — "FREEZER VERTICAL"
  // aparecia tambem na linha do lote 36, que e o horizontal — vale o candidato
  // que nao faz a sequencia andar para tras.
  {
    const ordem = [...candidatosDeLote.keys()].sort((x, y) => (itens[x][0] || 0) - (itens[y][0] || 0));
    let ultimo = 0;
    for (const i of ordem) {
      const cands = candidatosDeLote.get(i) || [];
      const bom = cands.find(n => n > ultimo);
      const escolhido = bom !== undefined ? bom : cands[0];
      if (escolhido === undefined) continue;
      if (escolhido > ultimo) ultimo = escolhido;
      lotes.set(i, { lote: escolhido, noLote: null });
    }
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
  return { textos: soTexto, lotes: lotes };
}

let comTexto = 0, semTexto = 0, itensTotal = 0, itensRicos = 0;

for (const e of dados.editais) {
  const v = base.editais[e[C.path]];
  if (!v || !v.itens) continue;

  const secoes = (v.secoes || []).map(s => s.texto).join('  ');
  if (!secoes) { semTexto++; continue; }
  comTexto++;

  const { textos: recortes, lotes } = descritivosPorItem(secoes, v.itens);
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
      // Lote e numero dentro dele, quando o edital e por lote: e assim que a
      // linha e identificada no pregao ("Lote 37, item 1"), e nao pela
      // numeracao corrida da API.
      itensRicos++;
    } else if (it.length > 6) it.length = 6;
    // Lote e numero dentro dele, quando o edital e por lote: e assim que a
    // linha e identificada no pregao ("Lote 37, item 1"), e nao pela
    // numeracao corrida da API.
    const L = lotes.get(i);
    if (L) { it[7] = L.lote; it[8] = L.noLote || null; }
  });
}

fs.writeFileSync(arquivo, JSON.stringify(base), 'utf8');
console.log(`${comTexto} edital(is) com texto de secao · ${semTexto} sem`);
console.log(`${itensRicos} de ${itensTotal} itens ganharam descritivo completo`);
console.log(`docs/descritivos.json: ${(fs.statSync(arquivo).size / 1024).toFixed(0)} KB`);
