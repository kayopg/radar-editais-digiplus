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
import { criaRevisor } from './ortografia.mjs';

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

// A CLASSE do produto, com os sinonimos que o catalogo do PNCP e o edital usam
// um no lugar do outro: "Refrigerador Duplex" no PNCP e "Geladeira dupex" no
// edital, "Maquina Secar Roupa" e "Secadora de roupas", "Forno Microondas" e
// "Micro-ondas". A ordem importa: "lavadora de alta pressao" e lava-jato antes
// de ser lavadora de roupa, e "forno micro-ondas" e micro-ondas antes de ser
// forno.
const CLASSES = [
  ['lavajato', /^(?:(?:lavadora|maquina)\s+(?:de\s+)?alta\s+press|lava\s?jato)/],
  ['lavar', /^(?:(?:maquina\s+(?:de\s+|para\s+)?)?lavar\s+roupa|lavadora(?:\s+de)?\s+roupa|lavadora\s+automatica|tanquinho)/],
  ['secar', /^(?:(?:maquina\s+(?:de\s+|para\s+)?)?secar\s+roupa|secadora)/],
  ['microondas', /^(?:forno\s+(?:de\s+)?)?micro\s?ondas/],
  ['forno', /^forno\b/],
  ['refrigerador', /^(?:geladeira|refrigerador)\b/],
  ['freezer', /^(?:freezer|congelador)\b/],
  ['tv', /^(?:televisor|televisao)/],
  ['fogao', /^(?:fogao|cooktop)\b/],
  ['fritadeira', /^(?:fritadeira|air\s?fryer)\b/],
  ['espremedor', /^(?:espremedor|extrator\s+de\s+sucos?)\b/],
  ['arcondicionado', /^(?:ar\s+condicionado|condicionador de ar)\b/],
];
// Classe pelo comeco de um texto ja normalizado (sem acento, minusculo).
const classeDoInicio = s => {
  const t = String(s).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [c, re] of CLASSES) if (re.test(t)) return c;
  // Sem sinonimo conhecido, vale a propria palavra: "liquidificador",
  // "chaleira", "espremedor". Cinco letras, para nao virar classe "de" ou "com".
  const w = t.match(/^[a-z]{5,}/);
  return w ? w[0] : null;
};
const classeDoRotulo = rotulo => classeDoInicio(normIgual(rotulo).replace(GENERICAS, ''));

// Capacidades escritas como numero: "1.044" e mil e quarenta e quatro, "1,8" e
// um e oito decimos.
const valorDe = x => String(/^\d{1,3}(?:\.\d{3})+$/.test(x) ? +x.replace(/\./g, '') : +x.replace(',', '.'));
// A capacidade do rotulo do PNCP: "capacidade: 17 a 18", "capacidade: 11".
const capacidadesDoRotulo = rotulo => {
  const s = new Set();
  for (const m of normIgual(rotulo).matchAll(/capacidade[^:,;]{0,20}:\s*(\d+(?:[.,]\d+)*)(?:\s*(?:a|-)\s*(\d+(?:[.,]\d+)*))?/g))
    for (const x of [m[1], m[2]]) if (x) s.add(valorDe(x));
  return s;
};
// A capacidade anunciada na cabeca da celula: "capacidade minima de 17 kg",
// "80 litros".
const capacidadesDoTexto = texto => {
  const s = new Set();
  const t = normIgual(texto);
  for (const m of t.matchAll(/capacidade[^0-9,;.]{0,30}?(\d+(?:[.,]\d+)*)/g)) s.add(valorDe(m[1]));
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)*)\s*(?:kg|l|lts?|litros?)\b/g)) s.add(valorDe(m[1]));
  return s;
};

function ancoraDe(plano, planoH, curto, vale = () => true) {
  // O catalogo cola os campos: "CATMAT: 619108.PDM: 13768.Tipo: Hi-WallModelo:
  // Split Inverter" (Jaraguari/MS), e o edital os separa. Sem a versao
  // descolada o ar-condicionado do item 4 nao achava a propria linha, e o
  // numero de outra linha levava para ele a especificacao de um bebedouro.
  // So quando o rotulo como veio nao casa nada: descolar muda o rotulo de quem
  // ja achava a linha, e a ancora mais curta passava a cair em outro lugar.
  const achado = ancoraDoRotulo(plano, planoH, curto, vale);
  if (achado) return achado;
  const descolado = curto.replace(/([a-zà-ÿ0-9.])([A-ZÀ-Ú][a-zà-ÿ])/g, '$1 $2')
    .replace(/([.:])(?=[A-Za-zÀ-ÿ])/g, '$1 ').replace(/\s+/g, ' ');
  return descolado !== curto ? ancoraDoRotulo(plano, planoH, descolado, vale) : null;
}

function ancoraDoRotulo(plano, planoH, curto, vale = () => true) {
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
        // Prefixo que termina num travessao solto nao e nome: "DE AR-CONDICIONADO
        // -" casava so em "seis aparelhos de ar-condicionado -, razao pela qual",
        // no meio do estudo tecnico de Luz/MG, e a linha da tabela ficava sem marca.
        if (/^[-–—,;:.]+$/.test(palavras[n - 1])) continue;
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
      if (alvo.length < 6) continue;
      // Vale a tentativa que casa em algum lugar FORA da pesquisa de precos: o
      // rotulo inteiro do catalogo aparece palavra por palavra na compra de outro
      // orgao, e o nome curto e que abre a linha do termo ("REFRESQUEIRA
      // INDUSTRIAL", item 11 de Ponta Grossa/PR, edital 13).
      for (let k = onde.indexOf(alvo); k >= 0; k = onde.indexOf(alvo, k + 1))
        if (vale(k)) return { ancora: alvo, plano: onde };
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
  // A quantidade que vem antes dos precos sai junto: cortando no "R$", o "9" de
  // "...do item como 220V 9 R$ 9.386,05 R$ 84.474,45" ficava no fim da celula
  // (Paranavai/PR).
  /(?:\s\d{1,4}\s+(?:(?:UNIDADES?|UNID|UND|UN)\.?\s+)?)?R\$\s*[\d.,]+\s+R\$\s*[\d.,]+\s+\d{1,4}(?=\s|$)/,
  /\s\d{1,4}\s+\d{1,3}(?:\.\d{1,3}){2,}(?=\s|$)/,
  // "MINI SPLIT. 10 04 UND APARELHO AR CONDICIONADO..." — numero do item,
  // quantidade e unidade abrindo a linha seguinte, em Descalvado/SP.
  /\s\d{1,4}\s+\d{1,4}\s+(?:UND|UNID|UN|PCS|PC|CX|PAR|KG|LT)(?=\s|$)/,
  // A mesma virada de linha com a unidade na FRENTE: "...PELO FABRICANTE.
  // UNIDADE 04 09 BALCAO COZINHA EM ACO" fecha a batedeira do item 8 de Nova
  // Tebas/PR — unidade, quantidade, numero do proximo item e o nome dele em
  // caixa alta. Dentro de uma especificacao essa sequencia nao acontece.
  //
  // O nome do produto seguinte pode vir so com a inicial maiuscula: "...garantia
  // minima de fabrica de 12 meses. UND 3 5 Micro-ondas de bancada..." em Nova
  // Tebas/PR, onde o forno do item 4 levava o micro-ondas inteiro.
  /\s(?:UNIDADES?|UNID|UND|UN|Unidades?|Unid|Und|PCS?|CX|PAR|KG|LT)\.?\s+\d{1,4}\s+\d{1,4}\s+[A-Z\u00c0-\u00da](?:[A-Z\u00c0-\u00da]{2,}|[a-z\u00e0-\u00ff]{2,})/,
  // A virada de linha SEM unidade nenhuma: quantidade, numero do proximo item e
  // o nome dele em caixa alta com duas palavras. E como a planilha de Apiai/SP
  // separa as linhas — "...EMEIEF ELISA 1 12 VENTILADOR COLUNA 110/220 v" fecha
  // o tanquinho do item 10. Duas palavras em caixa alta, e nao uma, para nao
  // confundir com "tensao 220 110 VOLTS" no meio de uma especificacao.
  /\s\d{1,3}\s+\d{1,3}\s+[A-Z\u00c0-\u00da]{4,}\s+[A-Z\u00c0-\u00da]{3,}/,
  // Fonte com codificacao propria devolve o texto em letras soltas:
  // "& ¤ P D U D  1 D F L R Q D O  G H". Nao da para consertar, mas da para
  // nao arrastar o lixo para dentro do descritivo — corta onde comeca.
  /(?:\s\S){8,}(?=\s|$)/,
  // Fim da linha sem o numero do proximo item, que fica fora do teto:
  // "...+/- 5% de tolerância. UN 2 R$ 37.963,33 R$ 75.926," em Catanduva/SP.
  // Nao quando os dois precos estao inteiros e a descricao continua depois: e
  // como o termo de referencia de Bento Goncalves/RS monta a linha — titulo,
  // "UNIDADE 45 R$ 2.013,00 R$ 90.585,00" e so entao a especificacao detalhada,
  // que o corte aqui jogava fora, deixando o item so com o titulo.
  // So nessa forma: "UNIDADE" em caixa alta logo depois do titulo em caixa alta.
  // "220V. UNID 02 R$ 761,66 R$ 1.523,31" (Cubatao/SP) e "608748 Unidade 05 R$
  // 579,97 R$ 2.899,85" (Botucatu/SP) continuam fechando a linha.
  /\s(?:UNIDADES?|UNID|UND|UN|PCS|PC|CX|PAR|KG|LT)\.?\s+\d{1,4}\s+R\$(?!(?<=[A-ZÀ-Ú0-9\/]\s(?-i:UNIDADE)\s+\d{1,4}\s+R\$)\s*[\d.]+,\d{2}\s+(?:R\$\s*)+[\d.]+,\d{2}\s+(?-i:[A-ZÀ-Ú][a-zà-ÿ]))/i,
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
  // A negativa na frente existe porque estas palavras tambem aparecem DENTRO da
  // especificacao, citadas de passagem: "catalogo anexo com especificacao
  // tecnica do produto, mediante solicitacao do pregoeiro" fechava o item 15 de
  // Santa Maria/RS antes da potencia, da voltagem e do material. Clausula comeca
  // depois de ponto ou de artigo, nunca depois de "do", "ao", "pelo".
  /(?<!\b(?:d[eoa]|ao|[\u00e0a]|pel[oa]|junto|perante|contra))\s(?:o |a |ao |pelo |pela )?(?:pregoeir[oa]|licitantes?\b|desclassifica|fase de lances|assinatura do contrato|custo estimado|vedada a inclus)/i,
  // Depois da tabela costuma vir a minuta do contrato, e o ultimo item entrava
  // nela: a mesa de futmesa de Rio Bom/PR seguia por "de um lado, a PREFEITURA
  // DO MUNICIPIO DE RIO BOM - PR, pessoa juridica de direito publico...".
  // A parte do contrato citada como quem decide a especificacao nao fecha a
  // celula: "(conforme necessidade da contratante)" cortava o ar-condicionado
  // de Caxambu/MG no meio (22/09/2026). "A contratada devera..." continua
  // fechando.
  /\s(?:pessoa jur[íi]dica de direito|de um lado,?\s+[ao]\s+PREFEITURA|CL[ÁA]USULA\s+(?:PRIMEIRA|SEGUNDA|[IVX]+)|(?<!(?:necessidade|crit[ée]rio|interesse|escolha|solicita[çc][ãa]o|demanda)\s+d[ao]\s)CONTRATANTE\b|(?<!-\s*A\s)CONTRATADA\b|doravante denominad)/i
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
  // Nunca depois de dois-pontos: ali e VALOR de campo, "CONSUMO APROXIMADO DE
  // ENERGIA (KWH): 56.6. EFICIENCIA ENERGETICA: A+++" na geladeira do item 11
  // de Renascenca/PR, que parava no "(KWH)".
  /(?<!:)\s\d{1,2}\.\d{1,2}\.\s+[A-ZÀ-Ú]/,
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
  // "...garantia minima de 12 meses 5.2 Classificacao dos bens/servicos: ( x )
  // Comuns" fecha a tabela do termo de referencia em Diamante D'Oeste/PR.
  /(?:\s\d{1,2}\.\d{1,2}\.?)?\s*Classifica[\u00e7c][\u00e3a]o dos bens/i,
  // As notas depois da tabela, na outra copia do mesmo termo: "...garantia
  // minima de 12 meses Havendo qualquer discordancia entre a descricao e
  // unidade de medida do CATMAT..." (Diamante D'Oeste/PR).
  /\sHavendo qualquer discord[\u00e2a]ncia|\sOs bens objeto desta contrata[\u00e7c][\u00e3a]o s[\u00e3a]o/i,
  // E o modelo de proposta na terceira copia: "...garantia minima de 12 meses
  // VALIDADE DA PROPOSTA: Sessenta (60) dias".
  /\sVALIDADE DA PROPOSTA\s*:/i,
  // "DE MERCADO" tambem: o fogao do item 3 de Trabiju/SP seguia por "5.
  // LEVANTAMENTO DE MERCADO E JUSTIFICATIVA DA ESCOLHA DO TIPO DE SOLUCAO" e o
  // estudo tecnico inteiro, ate o teto.
  /LEVANTAMENTO D[OE] MERCADO|JUSTIFICATIVA DA ESCOLHA DO TIPO DE SOLU/i,
  // A distribuicao por campus e o cabecalho da planilha seguinte, em Bento
  // Goncalves/RS: "...IDEM AO ITEM 38 Campus demandante Quantidade 1. Campus
  // Alvorada..." e "ITEM CATMAT DESCRICAO UNIDADE QTD R$ UNIT ESTIMADO".
  /\sCampus demandante\b/i,
  /\sITEM\s+CATMAT\s+DESCRI[ÇC][ÃA]O/i,
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
  // Com dois pontos ou parentese logo depois, porque so ai e ROTULO de campo.
  // Solto, "local de entrega" e parte da frase — "devidamente instalado no local
  // de entrega" fecha a especificacao dos itens 4 e 44 de Mariopolis/PR.
  /(?:Local|Endere[\u00e7c]o)\s+de\s+Entrega\s*[:(]/i,
  // "VALOR TOTAL:" fecha a linha da planilha. O umidificador do item 7 de Lucas
  // do Rio Verde/MT seguia por "UND 30 VALOR TOTAL: 1.2 O fornecimento do
  // objeto...".
  /\sVALOR\s+TOTAL\s*:/i,
  // O cabecalho do LOTE seguinte, que e como a planilha de Londrina/PR vira a
  // linha: "...CADERNO TECNICO FNDE 2017 DO LOTE:128.132,26 12.00Unidade
  // GELADEIRA..." e "...110 volts.3437450Lote: 10 - Lote 10 - Preferencial
  // ME/EPP". Nao ha espaco antes do "Lote:", por isso o padrao nao pede um.
  /Lote:\s*\d{1,3}\s*-\s*Lote/i,
  /DO\s+LOTE\s*:/i,
  // O somatorio da planilha, colado no fim da ultima celula: o ventilador do
  // item 14 de Vicosa/MG terminava em "Baixo nivel de ruidoTOTAL216.421,6011.
  // Justificativa para o Parcelamento...". Dentro de uma especificacao a palavra
  // TOTAL nao vem seguida de numero.
  /[^A-Z\u00c0-\u00da]TOTAL\s*[\d.]{3,}/,
  // Volta ao clausulado: numero de clausula logo depois de um PONTO, e o artigo
  // seguido de palavra em minuscula. O ponto na frente e o que separa isto de
  // uma medida ("potencia 12.5 A de corrente" nao casa, porque antes do numero
  // ha letra e nao ponto). Fecha o ventilador do item 14 de Vicosa/MG, que
  // seguia por "11.2 A licitacao sera dividida em 48 itens", e o fogao do item 3
  // de Trabiju/SP, que seguia por "1.5 O prazo de vigencia do Contrato".
  /(?:[.)]\s*|\d\s+)\d{1,2}\.\d{1,2}\.?\s+(?:O|A|Os|As|No|Na|Em|Para|Cada|Fica|Nos|Nas|Ser[\u00e1\u00e3]o?|Dever[\u00e1\u00e3]o?)\s+[a-z\u00e0-\u00ff]/,
  // Cabecalho do artefato do Compras.gov.br colado na quantidade da linha:
  // "...Em Portugues; 100ESP-CTO.ATENCAO INTEGRAL A SAUDE S.RITATermo de
  // Referencia 45/2026Informacoes Basicas...". Corta no digito da quantidade,
  // e so quando o que vem depois e mesmo esse cabecalho — a olhada a frente
  // impede que um codigo de modelo seja confundido com ele.
  /\d{1,5}\s?(?=[A-Z\u00c0-\u00da]{3,}[-.][A-Z\u00c0-\u00da]{2,}[^a-z]{0,60}(?:Termo de Refer|Informa[\u00e7c][\u00f5o]es B))/,
  /\sInforma[\u00e7c][\u00f5o]es B[\u00e1a]sicas\s+N[\u00famu]mero do artefato/i,
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
  ,
  // PULO DE PAGINA. O descritivos.mjs marca com "\u2016\u2016" o ponto em que duas folhas
  // NAO seguidas do edital ficaram lado a lado no texto. A celula que chega ali
  // nao continua na folha seguinte, porque a folha seguinte nao e a dela: em
  // Luz/MG o bebedouro seguia de "compativel com o fluxo de" direto para "de
  // apoio. Dessa forma, a aplicacao do saldo remanescente...", de outra pagina.
  /\s*\u2016\u2016/,
  // A clausula que vem depois da tabela, pelo titulo numerado: "2. VALIDADE DO
  // OBJETO: De no Minimo 12 (doze) meses..." fechava o ar condicionado de
  // Avare/SP, e "1. Validade da Proposta Minimo 60 (sessenta) Dias" a cortina de
  // ar de Barra do Garcas/MT.
  /\s\d{1,2}\.\s+(?:VALIDADE DO OBJETO|PRAZO DE VIG[\u00caE]NCIA|PRAZO E FORMA DE ENTREGA|PRAZO DE ENTREGA|CONDI[\u00c7C][\u00d5O]ES DE PAGAMENTO|Validade da Proposta)\b/i,
  // A pesquisa de precos de Nova Tebas/PR, colada depois de cada descricao:
  // "UND 3 450,87 R$ 405,98 R$ 500,00 R$ NAO COTADO NAO COTADO..." e o quadro
  // "Consolidacao dos precos cotados Menor Preco Media Mediana ... Desvio
  // Padrao". O mesmo quadro estatistico, com outro nome, em Chapadao do Sul/MS.
  /\s(?:R\$\s*)?N[\u00c3A]O COTADO/,
  /\s(?:Consolida[\u00e7c][\u00e3a]o dos pre[\u00e7c]os|Menor Pre[\u00e7c]o\s+M[\u00e9e]dia|Coeficiente de Varia[\u00e7c][\u00e3a]o|Desvio Padr[\u00e3a]o|M[\u00e9e]todo de c[\u00e1a]lculo adotado)/i,
  /\sITEM\s+\d{1,3}\s+VALORES\s/,
  // "COTA RESERVADA" abrindo o bloco seguinte da tabela, logo antes do
  // cabecalho repetido (Descalvado/SP).
  /\sCOTA\s+(?:RESERVADA|PRINCIPAL)(?=\s+Item\b)/i,
  // Codigo de catalogo, unidade e quantidade fechando a linha: "...TENSAO: 220 V
  // 618525 UN 20", em Chapadao do Sul/MS.
  /\s\d{5,9}\s+(?:UNIDADES?|UNID|UND|UN)\.?\s+\d{1,4}(?=[\s,]|$)/,
  // O relatorio de pesquisa de precos colado depois da especificacao, em Ponta
  // Grossa/PR: "Consumo: 0,24 KW/H Fonte: Data: 04/12/2025 15:00 Modalidade:
  // Dispensa SRP: NAO..." e dezenas de fornecedores com CNPJ.
  /\sFonte:\s*(?:\S+\s+)?Data:|\sFonte:\s*(?::|https?:|www)|\sRelat[\u00f3o]rio gerado no dia|\*VENCEDOR\*|\sModalidade:\s*(?:Dispensa|Preg[\u00e3a]o)\b|\sCatMat:\s*\d{5,6}\s+-\s+\S/i,
  // A pesquisa de precos do pedido de compra da UFTM (Uberaba/MG), colada na
  // celula: "...MONDIAL DUAL FE-03 OU AGRATTO. 2 R$ 251,85 19/08/2026 0,0000%
  // R$ 251,85 289,87 ..." \u2014 quantidade, preco, data da cotacao e percentual.
  /\s(?:\d{1,4}\s+)?(?:R\$\s*)?[\d.]+,\d{2}\s+\d{2}\/\d{2}\/\d{4}\s+[\d.,]+%/,
  // E a outra copia do mesmo pedido, com o codigo e a natureza da despesa:
  // "...OU AGRATTO. CATMAT/CATSER: 617471 NDD: 344905212 2.00 UNIDADE 14".
  /\s*CATMAT\/CATSER:\s*\d+/,
  // Unidade e quantidade minima/maxima do registro de precos fechando a linha:
  // "...220V, 12.000 BTUS UN 1/10 R$ 2.499,00 02 Ar-condicionado" (Pinhal
  // Grande/RS), e a observacao sobre os precos logo depois da ultima linha.
  /\s(?:UNIDADES?|UNID|UND|UN)\.?\s+\d{1,4}\/\d{1,4}(?=\s+R\$|\s*$)/,
  /\sOBS:\s*Nos pre[çc]os propostos/i,
  // A legenda da foto que fecha cada linha em Ponta Grossa/PR; o que vem depois
  // e a linha seguinte ou, na ultima, "VALOR MAXIMO ESTIMADO R$ ... *Obs: Em
  // estudo de mercado... 6. LOCAIS DE REALIZACAO DOS SERVICOS".
  /\s*Imagem meramente ilustrativa\b/i,
  // O total do grupo depois da ultima linha: "...Garantia 12 meses. Unidade 180
  // VALOR TOTAL GRUPO 02 R$......" (Sao Paulo/SP, edital 1081), e o cabecalho
  // do grupo seguinte: "Grupo 02 - Eletrodomestico Item Objeto".
  /\sVALOR TOTAL (?:DO |DO\s+)?(?:GRUPO|LOTE)\b/i,
  /\sGrupo\s+\d{1,2}\s+-\s+[A-ZÀ-Ú][a-zà-ÿ]+\s+Item\b/,
  /\s(?:UNID\.?\s+\d{1,5}\s+)?LOTE\/GRUPO\s+\d{1,2}\s+[–-]/,
  // Unidade, preco unitario e quantidade com quatro casas e o total, fechando a
  // linha: "...CONTROLE REMOTO SEM FIO UN 3.193,9800 83,0000 265.100,3400"
  // (Minacu/GO), o codigo do catalogo antes deles ("IC BASE: 64517") e o total
  // geral depois da ultima linha.
  /\s*IC BASE:\s*\d{3,8}/,
  /\s(?:UNIDADES?|UNID\.?|UND|UN|PCT|CX|KG|PAR|JOGO)\s+[\d.]+,\d{4}\s+[\d.]+,\d{4}\s+[\d.]+,\d{2,4}(?=\s|$)/,
  /\sTotal\s+[\d.]{5,},\d{2}(?=\s|$)/,
  // O nome curto que fecha a descricao e a linha seguinte, com o numero de
  // quatro digitos e o codigo: "...CATALOGO DO PRODUTO. - - REFRIGERADOR
  // EXPOSITOR 0014 392706 - REFRIGERADOR EXPOSITOR" (Florianopolis/SC).
  /(?<=[.;A-ZÀ-Ú0-9)])\s+-\s+-\s+(?=[A-ZÀ-Ú]{3,})/,
  /\s\d{4}\s+\d{5,9}\s+-\s+[A-ZÀ-Ú]/,
  // Quantidade com tres casas, preco com quatro e o total: "...Garantia minima:
  // 12 meses. 1,000 7.601,2900 7.601,29" (Pinhalao/PR).
  /\s\d{1,6},\d{3}\s+[\d.]+,\d{4}\s+[\d.]+,\d{2}(?=\s|$)/,
  // Quantidade com quatro casas antes da unidade, e depois preco, total, cota,
  // CATMAT e a linha seguinte: "...Conformidade do INMETRO. 40,0000 UN
  // 3.426,2100 137.048,40 GERAL 627990 2 Geladeira Industrial" (Paranavai/PR).
  // E o quadro de quantitativos por secretaria do mesmo edital: "...com prato
  // giratorio. Un 2 Nao e possivel estimar...", "...Cor: Preta. Un 1 1 A definir
  // 36 Lavadora".
  /\s\d{1,6},\d{4}\s+(?:UN|UND|UNID|CX|PCT|KG|PAR|JG|CONJ)\b/,
  /(?<=[.;])\s+Un\s+\d{1,3}\s+(?:\d{1,3}\s|N[ãa]o\s|Semestral|Pedido|[ÁA] definir|Conforme|De acordo|-\s)/,
  // Os dois precos, o numero e a quantidade da linha seguinte e o nome em caixa
  // alta: "...1 espatula. 937,88 937,88 14 3 ABAJUR" (Mariopolis/PR).
  /\s[\d.]+,\d{2}\s+[\d.]+,\d{2}\s+\d{1,3}\s+\d{1,4}\s+[A-ZÀ-Ú]{4,}/,
  // Numero da linha seguinte e o codigo de cinco ou seis digitos, depois do fim
  // da frase ou do preco: "...especificacoes acima ou superior. 9 11139 Jogo de
  // mesa com 4 cadeiras" (Pinhal de Sao Bento/PR).
  /(?:(?<=[.;])|(?<=\d,\d{2}))\s+\d{1,3}\s+\d{5,6}\s+(?=[A-ZÀ-Ú][A-Za-zÀ-ÿ])/,
  // A nota geral que Avare/SP poe depois da tabela, do objeto e da ata.
  /\s*Os objetos dever[ãa]o ser de boa qualidade/i,
  // Unidade, quantidade e precos fechando a linha, e a seguinte abrindo com
  // numero, codigo e travessao: "...Coifa em aco inoxidavel (sob medida) Unidad
  // e 1 21.800,00 21.800,00 6 48335 - ULTRACONGELADOR" (Joinville/SC).
  /\s(?:Unidad\s?e|Unidade)\s+\d{1,4}\s+[\d.]+,\d{2}\s+[\d.]+,\d{2}\s+\d{1,3}\s+\d{4,6}\s+-\s/,
  // Tres precos seguidos sao planilha de cotacao, nunca especificacao:
  // "DEIONIZADOR DE AGUA 11 11 1.679,09 1.679,09 1.679,09..." (Chapadao do Sul/MS).
  /(?:\s\d{1,3}(?:\.\d{3})*,\d{2}){3}(?=\s|$)/,
  // A dotacao orcamentaria e as cotacoes do pedido de compra depois da
  // especificacao: "...do equipamento. Dotacao:Acesso: 1375 | Projeto: 1050"
  // (Sao Luiz Gonzaga/RS), e o total da planilha: "Total -> 200.602,85" (Jaraguari/MS).
  /\sDota[çc][ãa]o:\s*Acesso:|\sTotal\s*->\s*[\d.]+,\d{2}/i,
  // O titulo do anexo seguinte depois do fim da frase, as vezes com a rubrica
  // de quem assina antes: "...diferentes tipos de ambientes. GK ANEXO I-A
  // QUANTITATIVOS DO ORGAO GERENCIADOR" (Salto/SP).
  /(?<=[.;])(?:\s[A-Z]{2,3})?\s+(?:AP[ÊE]NDICE\s+DO\s+)?ANEXO\s+[IVX]{1,4}(?:\s*-\s*[A-Z])?\s+(?:[–-]\s+)?[A-ZÀ-Ú]{4,}/,
  // O rodape da planilha do SEI: "...Nbr- 14136/2012; 4823648 1 TOTAL MENSAL
  // ESTIMADO" (Sao Paulo/SP).
  /\sTOTAL MENSAL ESTIMADO/i,
  // Codigo, unidade, quantidade, numero da linha seguinte e o codigo 8720 da
  // planilha da Unicamp (Campinas/SP): "...SEM DECORACAO. 335114 Unidade 120 39
  // 8720 TABUA P/MANIPULACAO".
  /\s\d{5,9}\s+Unidade\s+\d{1,4}\s+\d{1,3}\s+\d{4}\s+[A-ZÀ-Ú]/,
  // O carimbo do protocolo do governo do Parana no pe da folha: "...tensao do
  // item como 220V GMS No 822/2026 Protocolo No. 25.999.934-0" (Paranavai/PR).
  /\sGMS\s+N[ºo°]\.?\s*\d+\/\d{4}/,
  // O formulario do Portal de Compras de Belo Horizonte/MG depois de cada item:
  // "...Selo Procel Tratamento Diferenciado: Tipo I - Participacao Exclusiva de
  // ME/EPP ... Intervalo Minimo entre Lances (%): 5,00".
  /\sTratamento Diferenciado:/,
  // "...voltagem 220V. 6 UN R$ 3.145,72 R$ 18.874,32 Total Geral R$ 25.916,43" (Luz/MG)
  /\sTotal\s+Geral\s+R\$/i,
  // Quantidade, unidade e a cota da linha: "...Garantia minima do fabricante de
  // 01 (um) ano. 75 UN COTA RESERVADA PARA ME, EPP OU MEI" (Avare/SP).
  /\s\d{1,4}\s+(?:UN|UND|UNID)\s+(?:R\$\s*[\d.]+,\d{2}\s+R\$\s*[\d.]+,\d{2}\s+)?COTA\s+(?:RESERVADA|PRINCIPAL)/,
  // Numero da linha seguinte e os dois codigos (CATMAT e o do sistema do
  // municipio) antes do nome: "...Imagem meramente ilustrativa 2) 121713 474330
  // Carrinho plataforma para transporte de cargas" (Ponta Grossa/PR), onde o
  // climatizador do item 8 levava o carrinho inteiro.
  /\s\d{1,3}[).]?\s+\d{5,9}\s+\d{5,9}\s+[A-ZÀ-Ú][A-Za-zÀ-ÿ]{2,}/,
  // A linha seguinte do catalogo de Jaraguari/MS: numero, nome em caixa alta e
  // "(CATJAR)" — "...classificacao A. 31 FURADEIRA IMPACTO (CATJAR) PDM: 7868".
  // Nunca a medida: "Profundidade: 46 CM 16 CADEIRA FIXA (CATJAR)" corta no 16.
  /\s\d{1,3}\s+(?!(?:CM|MM|M|KG|G|L|ML|W|V|KW|MW|HP|CV|PSI|RPM|UN|UND|POL|LB|BTU|BTUS|HZ|A|FL|MIN)\b)[A-ZÀ-Ú][A-ZÀ-Ú0-9 \-–'"./,]{3,80}\(CATJAR\)/,
  // A fonte do recurso depois da linha: "...Un - Unidade 18 Recursos: FUNDEB/
  // COMPLEMENTACAO VAAT" (Apiai/SP).
  /\sRecursos?:\s*(?:FUNDEB|PR[\u00d3O]PRIO|RECURSO|TESOURO|MDE|QSE|PNAE|VAAT)/i,
  // Lista de distribuicao por escola, depois da linha: "...cor branca CEMAE -
  // PINHEIROS 1 CEMEIEF DINA - ARACAIBA 1" (Apiai/SP).
  /\s(?:CEMAE|CEMEIEF|EMEIEF|EMEF|EMEI|CMEI)\s+[-\u2013]\s+[A-Z\u00c0-\u00da]/,
  // A justificativa do estudo tecnico, que repete o nome do item e segue pelas
  // escolas atendidas: "4) Freezer Horizontal 309 Litros As unidades CEMEIEF
  // Maria Garcia - Palmitalzinho ... nao foram contempladas no Processo" (Apiai/SP).
  // Mais comprida que a linha da tabela, ganhava dela no desempate e ia para o
  // resumo no lugar da especificacao do freezer e da maquina de lavar.
  /\sAs unidades\s+(?:CEMAE|CEMEIEF|CEMEI|EMEIEF|EMEF|EMEI|CMEI)\b/,
  // Quantidade, unidade, numero do proximo item e o nome dele em caixa alta:
  // "...instalacao estavel do equipamento. 1 Unidade 7 DOCA MOVEL DE CARGA" em
  // Joinville/SC, onde o ultracongelador do item 6 levava a doca inteira. Nao
  // depois de "com": "Unidade (UN) com 1 Unidade 5 MICROSCOPIO" e a abertura da
  // propria linha no modelo do Compras.gov.br.
  /(?<!\bcom)\s\d{1,4}\s+(?:Unidades?|UNIDADES?|Und|UND|Unid|UNID|UN)\.?\s+\d{1,3}\s+[A-Z\u00c0-\u00da]{3,}/,
  // A garantia da coluna ao lado e o numero do proximo item: "...CERTIFICACAO
  // INMETRO. 12 MESES 26 PROCESSADOR DE ALIMENTO" (Campinas/SP).
  /\s\d{1,2}\s+MESES\s+\d{1,3}\s+[A-Z\u00c0-\u00da]{4,}/,
  // O proximo item numerado com ponto e o titulo em caixa alta com travessao:
  // "...defeitos de fabricacao. 45. MICROONDAS (26 A 30L) \u2013 Aparelho novo"
  // (Vicosa/MG), onde o bebedouro do item 44 levava o micro-ondas e o
  // computador. Depois de fim de frase ou do preco da linha ("...fabricacao. 2
  // UNIDADE R$ 1.055,33 R$ 2.110,66 45. MICROONDAS"), para nao pegar uma lista
  // numerada dentro da especificacao.
  /(?:(?<=[.;])|(?<=\d,\d{2}))\s+\d{1,3}\.\s+[A-Z\u00c0-\u00da]{4,}[A-Z\u00c0-\u00da0-9 /()]*\s[\u2013-]\s/,
  // Titulo de ANEXO abrindo outra parte do edital. O ultimo item da tabela de
  // Salto/SP seguia por "ANEXO II Cidades do Ambito Regional" e a lista inteira
  // das regioes metropolitanas de Sao Paulo. So o titulo: "conforme anexo I" no
  // meio da frase nao e seguido de palavra com maiuscula.
  /\sANEXO\s+[IVX]{1,4}\s+(?=[A-Z\u00c0-\u00da][a-z\u00e0-\u00ff]|[A-Z\u00c0-\u00da]{4,}|\d{1,2}\s*[-\u2013.)])/,
  // Subtitulo numerado do proximo item: "3.2.2. Item 02: Bebedouro de Coluna",
  // em Valinhos/SP.
  /\s\d{1,2}(?:\.\d{1,2})+\.?\s+Item\s+\d{1,3}\s*:/i,
  // Fim de linha completo — unidade, quantidade, precos — seguido do numero e
  // do codigo de catalogo da linha seguinte e do nome dela: "...garantia minima
  // 12 meses. UNID 10 782,30 7.823,00 19 354608 Mesa branca em polipropileno",
  // em Nova Esperanca/PR. Sem o numero e o codigo depois, os mesmos valores
  // estao no MEIO da celula e saem sem cortar (VALORES_DA_LINHA).
  /\s(?:UNIDADES?|UNID|UND|UN)\.?\s+\d{1,4}\s+[\d.]+,\d{2}\s+[\d.]+,\d{2}\s+\d{1,3}\s+\d{5,6}\s+[A-ZÀ-Ú]/,
  /(?<=[.;])\s+\d{1,3}\s+\d{5,6}\s+[A-ZÀ-Ú][a-zà-ÿ]/,
  // Numero do item, quantidade com decimal e unidade abrindo a linha seguinte:
  // "...tensao: 127 v ou 220 v. 458,00 2.748,00 12 8,0 UND Bebedouro eletronico"
  // em Mariopolis/PR. Os itens 12, 45 e 58 nao sao do radar, entao nao viram
  // marca, e sem este corte a batedeira do item 11 levava os dois bebedouros e
  // o ar-condicionado do 44 levava purificador, armario e balcao de pia.
  /\s\d{1,3}\s+\d{1,4},\d{1,2}\s+(?:UNIDADES?|UNID|UND|UN)\.?\s+[A-ZÀ-Úa-zà-ÿ]/,
  // Numero do item, codigo de catalogo, quantidade e unidade: "...290 X 600 X
  // 680MM. 3.023,52 6.047,04 06 482244 2 UN FOGAO 05 BOCAS" em Renascenca/PR,
  // onde o fogao industrial do item 5 levava o fogao de cinco bocas do 6.
  /\s\d{1,3}\s+\d{4,9}\s+\d{1,5}\s+(?:UNIDADES?|UNID|UND|UN)\.?\s+[A-ZÀ-Ú]{3,}/
];

// O modelo da Advocacia-Geral da Uniao carimba todas as folhas com o mesmo
// cabecalho, em duas versoes no mesmo edital ("Modelo de Edital", "Modelo de
// Termo de Referencia"), e cai no meio da celula na virada: Governador
// Valadares/MG, Vicosa/MG, Botucatu/SP, Montes Claros/MG.
const CABECALHO_AGU = /\s*(?:UASG\s+\d{5,6}\s+)?C[\u00e2a]mara Nacional de Modelos de Licita[\u00e7c][\u00f5o]es e Contratos da Consultoria-Geral da Uni[\u00e3a]o\s+Modelo de[\s\S]{0,200}?Identidade visual pela Secretaria de Gest[\u00e3a]o e Inova[\u00e7c][\u00e3a]o(?:\s+Atualiza[\u00e7c][\u00e3a]o:\s*[A-Z]{3}\/\d{4}\.?)?(?:\s+\d{1,3}\s+de\s+\d{1,3})?/gi;

// O carimbo de assinatura e o cabecalho que o HU/USP (Sao Paulo/SP) repetem em
// cada folha, e que caem no meio da especificacao do controle remoto: "Documento
// assinado digitalmente - Por favor, verifique o HASH de autenticidade na pagina
// 96 deste documento. PREGAO ELETRONICO No 102150-369/2026 - HU/USP ... Pagina 24
// | 95 Aprovado pelo Parecer ... Edital de Pregao - Bens e Servicos - Lei no
// 14.133, de 2021". Sai antes do timbre, que levava so as pontas.
// A unidade da coluna da linha da tabela, e a medida que um numero escrito
// na especificacao leva depois dele (para nao confundir com o numero da folha).
// DEPURA_ITEM="trecho do rotulo" mostra as candidatas e a decisao desse item
const DEPURA_ITEM = process.env.DEPURA_ITEM || '';
const UNID_LINHA = '(?:UN|UND|Und|und|Un|Unid\\.?|UNID\\.?|Unidade|UNIDADE|Unidades|UNIDADES|PC|PÇ|PCT|CX|KIT|Kit|CJ|CJT|CONJ|JG|PAR|APARELHOS?)';
const MEDIDA = '(?:kg|g|mg|l|lt|litros?|ml|cm|mm|m|m2|m²|m3|w|watts?|v|volts?|kw|kwh|hz|btus?|rpm|bar|pol|polegadas?|pés|pas|p[áa]s|velocidades?|bocas?|portas?|queimadores?|x|a|e|ou)(?![a-zà-ÿ])';
// A celula que atravessa a virada de folha (ou que tem as colunas no meio da
// altura da linha): quantidade, unidade e precos da linha, o que sobra do
// rodape e do cabecalho da folha — so numero, sinal e telefone, nenhuma
// palavra — e a continuacao. Ver o uso no recorte por posicao.
// (com o codigo do catalogo antes, quando a tabela o traz: "ventilacao, 625431
// 34570 UN 1 R$ ...", Mercedes/PR)
// (e a quantidade com casas decimais: "UNIDADE 20,0000 3.115,0000 62.300,00",
// Pirajuba/MG)
const COLUNAS_DA_LINHA = '(?:\\s+\\d{5,7}){0,3}\\s(?:\\d{1,5}(?:,\\d{1,4})?\\s+' + UNID_LINHA + '|' + UNID_LINHA + '\\s+\\d{1,5}(?:,\\d{1,4})?)\\s+(?:R\\$\\s*)?[\\d.]*\\d,\\d{2,4}\\s+(?:R\\$\\s*)?[\\d.]*\\d,\\d{2,4}';
const SOBRA_DA_FOLHA = '(?:\\s+(?:[°ºª.,;:|–-]\\S{0,3}|\\d+\\/\\d+|\\(?\\d{2}\\)?[\\s-]?\\d{4,5}-\\d{4}|\\d{1,3}(?=\\s+(?:[°ºª.,;:|–(-]|\\d|(?!' + MEDIDA + ')[a-zà-ÿ]))))*';
const COSTURA_MINUSCULA = new RegExp(COLUNAS_DA_LINHA + SOBRA_DA_FOLHA + '\\s+(?=[a-zà-ÿ]|\\d+(?:[.,]\\d+)?\\s*[a-zà-ÿ])', 'gu');
const COSTURA_ABERTA = new RegExp('(?<=[:,]|\\s(?:de|da|do|das|dos|e|ou|com|sem|em|para|por|a|o|as|os|ao))' + COLUNAS_DA_LINHA + SOBRA_DA_FOLHA + '\\s+(?=\\p{Lu}\\p{Ll})', 'gu');
// O cabecalho repetido: "Item", depois so palavra de titulo (maiuscula, traco,
// ponto, parenteses, pedaco curto de palavra partida como o "ade" de "Quantid
// ade") e fecha em "Total": "Item Descricao Unid. Quant . Media Total
// (unitaria) Media total" (Pariquera-Acu/SP), "Item Produto - Descricao
// Unidade - Descricao Quantid ade - Licitada Cotacao Maxima - Unitaria Cotacao
// Maxima - Total" (Pirajuba/MG).
const COSTURA_CABECALHO = new RegExp(COLUNAS_DA_LINHA + SOBRA_DA_FOLHA + '(?:\\s+“[^”]{1,40}”)?\\s+Item\\s+(?:(?:\\p{Lu}[\\p{L}.]*|[-–.]|\\(\\p{L}+\\)|\\p{Ll}{1,4})\\s+){2,25}?(?:Total|total|TOTAL)\\s+(?=\\p{L})', 'gu');
// E com o cabecalho da folha seguinte INTEIRO no meio, palavras e tudo, quando
// ele fecha na marca de pagina: "...split high wall, capacidade UNID. 10 R$
// 2.290,00 R$ 22.900,00 223560-9 ESTADO DE MATO GROSSO CAMARA MUNICIPAL DE
// CUIABA PREGAO ELETRONICO N.º 004/2026 Pagina 30 | 74 nominal de 12.000
// BTU/h..." (Cuiaba/MT, 22/09/2026). A marca explicita de pagina e o que
// garante que o miolo e cabecalho, e nao o item seguinte.
const COSTURA_PAGINA = new RegExp(COLUNAS_DA_LINHA + '(?:\\s+[\\d-]{4,14})?\\s[^]{0,260}?P[áa]gina\\s+\\d{1,3}\\s*(?:\\||de|/)\\s*\\d{1,3}\\s+(?=[a-zà-ÿ])', 'gu');
const CABECALHO_HASH = /\s*Documento assinado digitalmente\s*-\s*Por favor, verifique o HASH de autenticidade na p[áa]gina \d+ deste documento\.(?:\s*‖‖)?\s*(?:EDITAL\s*[-–]\s*)?PREG[ÃA]O ELETR[ÔO]NICO[\s\S]{0,400}?Lei n[ºo°] 14\.133, de 2021/g;

// O QUE NAO E ESPECIFICACAO DENTRO DA CELULA, depois do corte.
//
// A tabela centraliza as outras colunas da linha na altura da celula, e o PDF
// escreve linha por linha: a unidade, a quantidade e os precos caem NO MEIO da
// descricao, e a descricao continua depois deles. Em Nova Esperanca/PR o fogao
// do item 15 saia "...baixa pressao; em ferro fundido UNID 8 1.832,97
// 14.663,76 30x30; bandeja coletora...". Cortar ali jogaria fora a segunda
// metade da especificacao; entao sai o grupo de valores e fica o resto.
const VALORES_DA_LINHA = [
  // Unidade, quantidade e os dois precos da coluna da direita, que caem no meio
  // da especificacao quando ela passa para a folha seguinte: "...Componentes
  // plasticos atoxicos, proprios para Unid. 01 3.049,56 3.049,56 contato com
  // alimentos" (Ponta Grossa/PR). Antes das outras, que levariam so os precos.
  /\s(?-i:Unid)\.?\s+\d{1,4}\s+[\d.]+,\d{2}\s+[\d.]+,\d{2}(?=\s)/g,
  // Unidade, quantidade e precos de quatro casas no meio da descricao, com a
  // contagem de folhas: "...ARMAZENAMENTO DE PRODUTOS UN 3 6.500,3200 19.500,9600
  // 5 de 16 TERMOLABEIS" (Florianopolis/SC).
  /\s(?:UN|UND|UNID)\s+[\d,]{1,8}\s+[\d.]+,\d{4}\s+[\d.]+,\d{4}(?:\s+\d{1,3}\s+de\s+\d{1,3})?(?=\s)/g,
  // Unidade, colunas numericas e os dois precos no meio da celula: "...ao redor
  // da Un 1 1 1 3.219,31 3.219,31 mesa central" (Nova Fatima/PR).
  /\s(?:Un|UN|Und|UND)\s+\d{1,4}(?:\s+\d{1,4}){0,3}\s+[\d.]+,\d{2}\s+[\d.]+,\d{2}(?=\s)/g,
  // Quantidade e precos de quatro casas no meio da celula: "Ar-condicionado
  // tipo Split Piso- 10 11.980,8333 119.808,33 Teto, com capacidade de 60.000
  // BTU/h" (Maquine/RS, 22/09/2026).
  /\s\d{1,4}\s+[\d.]+,\d{4}\s+[\d.]+,\d{2}(?=\s)/g,
  // A unidade, a quantidade e os dois precos entre o titulo em caixa alta e a
  // especificacao: "...SPLIT HI-WALL - 12.000 BTU/H UNIDADE 72 R$ 2.013,00 R$ R$
  // 144.936,00 Aparelho de ar-condicionado..." (Bento Goncalves/RS). Vem antes
  // das outras, que levariam os precos e deixariam o "UNIDADE" solto no meio.
  /\s(?<=[A-ZÀ-Ú0-9\/]\s)UNIDADE\s+\d{1,4}\s+R\$\s*[\d.]+,\d{2}\s+(?:R\$\s*)+[\d.]+,\d{2}(?=\s+[A-ZÀ-Ú][a-zà-ÿ])/g,
  // "01 R$ 4.000,00 R$ 4.000,00" (Santo Antonio do Caiua/PR)
  // ... com a quantidade antes: "Diametro (mm): 1070 5 1 R$ 409,78 R$ 2.048,90"
  // (Sao Jose da Boa Vista/PR), onde o "5" ficava no meio da especificacao.
  /\s(?:\d{1,4}\s+)?\d{1,4}\s+R\$\s*[\d.]+,\d{2}\s+R\$\s*[\d.]+,\d{2}(?=[\s,.;]|$)/g,
  // Quantidade, unidade e precos — com os precos em branco, como nos modelos
  // de proposta: "04 UNID R$ 7.847,69" no meio do aparelho de Campina do Monte
  // Alegre/SP, "10 UN R$ 677,31 R$ 6.773,10" e "20 UN R$ R$" em Birigui/SP.
  // Como FIM de linha isto cortava a celula ao meio: a descricao continua
  // depois dos valores.
  /\s\d{1,4}\s+(?:UNIDADES?|UNID|UND|UN|P[ÇC]S?|CX)\.?\s+R\$\s*(?:[\d.]+,\d{2,4})?(?:\s+R\$\s*(?:[\d.]+,\d{2})?)?(?=[\s,.;:]|$)/g,
  // "1 UNID 450,00 450,00" (Nova Esperanca/PR)
  /\s\d{1,4}\s+(?:UNIDADES?|UNID|UND|UN)\.?\s+[\d.]+,\d{2}\s+[\d.]+,\d{2}(?=[\s,.;]|$)/g,
  // Unidade, quantidade, preco com o R$ depois: "UNIDADE 174 111,25 R$
  // 19.357,50", entre o nome e a descricao em Bento Goncalves/RS; "UND 3 450,87
  // R$ 405,98" na pesquisa de precos de Nova Tebas/PR.
  /\s(?:UNIDADES?|UNID|UND|UN)\.?\s+\d{1,4}\s+[\d.]+,\d{2,4}\s+R\$\s*(?:[\d.]+,\d{2})?(?=[\s,.;]|$)/g,
  // CNPJ solto, sem a palavra, que o timbre deixa para tras (Chapadao do Sul/MS).
  /\s*:?\s*\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g,
  // Preco da linha e numero da pagina no meio da frase, na virada de folha: "...
  // grade metalica de 227,93 1.367,58 13 de 15 protecao e suporte..." (Vicosa/MG).
  /\s[\d.]{1,9},\d{2}\s+[\d.]{1,12},\d{2}\s+\d{1,3}\s+de\s+\d{1,3}(?=\s)/g,
  /\s\d{1,3}\s+de\s+\d{1,3}(?=\s+(?:[A-ZÀ-Ú]|\d))/g,
  // O modelo da Advocacia-Geral da Uniao carimba todas as folhas com o mesmo
  // cabecalho, em duas versoes no mesmo edital ("Modelo de Edital", "Modelo de
  // Termo de Referencia"), e cai no meio da celula na virada: Governador
  // Valadares/MG, Vicosa/MG, Botucatu/SP, Montes Claros/MG.
  CABECALHO_AGU,
  // Com o numero do item logo depois: "...35 Litros UASG 90173 02 Especificacao
  // Tecnica:" (Sao Paulo/SP, edital 89).
  /\s*UASG\s+\d{5,6}(?:\s+\d{1,3})?(?=\s)/g,
  // Codigo, unidade e quantidade da coluna ao lado, no meio da celula: "...do
  // parque de climatizacao 390407 Unidade 15 hospitalar)" (Sao Paulo/SP, HU/USP).
  /\s\d{6}\s+Unidade\s+\d{1,4}(?=\s)/g,
  // Numero do item e codigo de catalogo, da coluna ao lado, no meio da
  // descricao: "...Tipo: Split , 4 440747 Modelo: Split Inverter" (Governador
  // Valadares/MG).
  /\s\d{1,3}\s+\d{6}(?=\s+[A-Z\u00c0-\u00da][a-z\u00e0-\u00ff])/g,
  // A unidade do catalogo e o numero da pagina, na virada de folha do termo de
  // referencia de Vicosa/MG: "...cloro livre 4 de 14 2 306105 Unidade (UN) com
  // 1 Unidade 1 e melhoria das caracteristicas...".
  /\s*Unidade\s*\(UN\)\s*com\s*\d+(?:\s+Unidade(?:\s+\d{1,3})?)?/g,
  // Quantidade, cota e unidade: "16 100% UN", "10 25% UN" (Jaraguari/MS)
  /\s\d{1,4}\s+\d{1,3}%\s+UN\b/g,
  // Quantidade e participacao: "5 Exclusivo ME/EPP" (Pompeia/SP)
  /\s\d{1,4}\s+(?:Exclusivo|Ampla Concorr[êe]ncia|Cota Reservada)\s+ME\/EPP\b/gi,
  // Quantidade e precos no meio da frase, depois de virgula: "...gas
  // refrigerante R-32 ou R-410A, 5 2.840,00 14.200,00 alimentacao eletrica
  // 220 V" (Pompeia/SP), onde a celula atravessa a virada de folha.
  /(?<=[a-zà-ÿ,;])\s\d{1,4}\s+[\d.]{1,9},\d{2}\s+[\d.]{1,12},\d{2}(?=\s+[a-zà-ÿ])/g,
  // Preco e quantidade no meio de texto em caixa alta: "...CLASSIFICACAO DE
  // EFICIENCIA ENERGETICA 3.759,48 45 CONFORME LEGISLACAO VIGENTE" (Trabiju/SP).
  /(?<=[A-ZÀ-Ú])\s[\d.]{1,9},\d{2}\s+\d{1,4}(?=\s+[A-ZÀ-Ú]{3,})/g,
  // Rodape do relatorio do Compras Web: "Fiorilli Software - (Compras Web
  // (9.50.29.2994)) 28/08/2026 14:44 Usuario: FULANO" (Jaraguari/MS)
  /\s*Fiorilli Software[\s\S]{0,80}?Usu[áa]rio:\s*(?:[A-ZÀ-Ú]+\s?)+/g,
  // Cabecalho de impressao do SEI: "01/09/2026, 08:12 SEI/PMJ - 30646472 -
  // Edital https://sei.joinville...acao_retorno=procedi… 12/34" (Joinville/SC)
  /\s*\d{2}\/\d{2}\/\d{4},\s*\d{2}:\d{2}\s+SEI\/[A-Z]+\s*-\s*\d+\s*-\s*[^h]{0,40}https?:\/\/\S+(?:\s+\d{1,3}\/\d{1,3})?/g,
  // "UNID 8 1.832,97 14.663,76" (Nova Esperanca/PR), "UN 2 1.418,60 2.837,20"
  // (Saudade do Iguacu/PR)
  /\s(?:UNIDADES?|UNID|UND|UN)\.?\s+\d{1,4}(?:,\d{2})?\s+(?:R\$\s*)?[\d.]+,\d{2,4}\s+(?:R\$\s*)?[\d.]+,\d{2}(?=[\s,.;]|$)/g,
  // "3,00 UNIDADE 36.714,71 110.144,13" (Pinhal de Sao Bento/PR)
  /\s\d{1,4},\d{2}\s+(?:UNIDADES?|UNID|UND|UN)\.?\s+(?:R\$\s*)?[\d.]+,\d{2,4}\s+(?:R\$\s*)?[\d.]+,\d{2}(?=[\s,.;]|$)/g,
  // Preco unitario e total soltos antes do timbre ou no fim: "...fixacao em
  // parede. 227,93 1.367,58 Camara Nacional de Modelos" (Vicosa/MG).
  /\s[\d.]{1,9},\d{2}\s+[\d.]{1,12},\d{2}(?=\s+[A-Z\u00c0-\u00da]|\s*$)/g,
  // ... e no meio da frase, entre duas palavras: "altura do 499,50 7.492,50
  // encosto: 77cm" (Mariopolis/PR). Seguido de unidade de medida e medida, e
  // fica: "45,50 60,00 cm".
  /(?<=[a-z\u00e0-\u00ff])\s[\d.]{1,9},\d{2}\s+[\d.]{1,12},\d{2}(?=\s+(?!(?:cm|mm|m|kg|g|l|ml|w|v|kw|kva|x|a|hz|mts?|litros?)\b)[a-z\u00e0-\u00ff])/g,
  // Preco unitario e total sozinhos entre duas palavras, onde a coluna dos
  // precos se intercala com a da especificacao: "...garantia 12 meses, 1.820,00
  // 9.100,00 capacidade total 239l" (Mariopolis/PR), "...Multilaminado 512,19
  // 20.487,60 - Tipo Base" (Jaraguari/MS). So valor com cara de preco \u2014 tres
  // digitos ou milhar \u2014 para nao levar medida como "3,82 M". Depois das regras
  // com unidade e quantidade, que levam a linha inteira: antes delas, "1 UNID
  // 949,45 949,45" perdia so os precos e o "1 UNID" ficava (Nova Esperanca/PR).
  /(?<=[A-Za-z\u00c0-\u00ff,;])\s(?:\d{1,3}(?:\.\d{3})+|\d{3}),\d{2}\s+(?:\d{1,3}(?:\.\d{3})+|\d{3}),\d{2}(?=\s+(?:[a-z\u00e0-\u00ff(]|-\s))/g,
  // Linha de preencher do formulario: "\u23af\u23af\u23af\u23af\u23af\u23af" (Pinhal de Sao Bento/PR).
  /\s*[\u23af\u2500\u2501_]{4,}/g,
  // Carimbo de assinatura do 1Doc, inteiro ou nos pedacos em que a margem
  // vertical cai no meio da linha: "Assinado por 3 pessoas: FULANO, BELTRANO e
  // + 1. Para verificar a validade das assinaturas, acesse
  // https://....1doc.com.br/verificacao/XXXX e informe o codigo XXXX".
  /\s*Assinado por \d+ pessoas?:[\s\S]{0,700}?informe o c[\u00f3o]digo\s+[\w-]+/gi,
  /,?\s*(?:[A-Z\u00c0-\u00da][A-Z\u00c0-\u00da'\u2019.\-]*(?:\s+(?:e\s+\+\s*\d+\.?|e\s+)?|\s*,\s*)){2,}(?=Para verificar a validade)/g,
  /\s*Para verificar a validade das assinaturas,?\s*/gi,
  /,?\s*acesse\s+https?:\/\/\S+\s+e\s+informe o c[\u00f3o]digo\s+[\w-]+/gi
];

// O TIMBRE de cada edital, aprendido do proprio edital.
//
// Perseguir o cabecalho de cada prefeitura com uma expressao nao acaba: "AVENIDA
// SAO JOAO No 415 \u2013 CENTRO \u2013 CEP: 87.730-100 \u2013 SANTO ANTONIO DO CAIUA-PR
// DISPENSA ELETRONICA No 30/2026 PARANA DEPARTAMENTO DE LICITACAO SITE:",
// "Praca Juca Novaes, n\u00b0 1.169 \u2013 Centro \u2013 CEP 18.705-023 \u2013 Avare/SP",
// "Estado de Sao Paulo Ladeira Manoel Augusto, 92, Apiai"... Mas o timbre tem uma
// propriedade que a especificacao nao tem: REPETE-SE igual em toda folha, e
// traz endereco, CEP, site, CNPJ, numero de pagina ou carimbo.
//
// Entao: sequencias de oito palavras que aparecem tres vezes ou mais no texto do
// edital e contem um desses sinais sao semente; cada semente cresce para os
// lados enquanto as ocorrencias concordam (e ai para, porque o texto da folha em
// volta muda de pagina para pagina); o que sai e o timbre inteiro, e ele e
// tirado de dentro das celulas. Numero vira "#", para que "2 de 25" e "3 de 25"
// sejam a mesma coisa.
//
// So sinal FORTE, que nao aparece em especificacao. "Fone" sozinho casava a
// "entrada de fone externo" da camera de Vicosa/MG, "# de #" casava qualquer
// faixa de medida, e "secretaria" esta no objeto de todo edital: com eles o
// detector tomava por timbre a tabela de itens que o termo de referencia repete,
// e comia o comeco do liquidificador de Diamante D'Oeste/PR.
//
// Telefone e CEP pedem o numero FORMATADO, em dois grupos pelo menos: "AO
// FONE. 40 UN" \u2014 o fone de ouvido de Birigui/SP, com a quantidade logo depois \u2014
// vira "fone #" sem a pontuacao, e com o sinal frouxo a linha inteira do item,
// que a tabela repete, foi tomada por timbre e apagada.
const SINAL_DE_TIMBRE = /\bcep\s*#\s*#|\bcnpj\b|\bhttps?\b|\bwww\b|\bp[\u00e1a]gina\s*# de #|\b(?:fones?|telefone|tel|pabx)\s*#\s*#|\be-?mail\b|c[\u00e2a]mara nacional de modelos|identidade visual pela|assinado por #|\b1doc\b|verificar a validade|\b(?:rua|avenida|pra[\u00e7c]a|ladeira|rodovia|alameda)\s+(?:\S+\s+){1,5}(?:n\s*[\u00bao]?\s*)?#|\bbairro\b.{0,40}\bcep\b/i;
const SINAIS_DE_TIMBRE = /\bcep\s*#\s*#|\bcnpj\b|\bhttps?\b|\bwww\b|\bp[\u00e1a]gina\s*# de #|\b(?:fones?|telefone|tel|pabx)\s*#\s*#|\be-?mail\b|c[\u00e2a]mara nacional de modelos|identidade visual pela|assinado por #|\b1doc\b|verificar a validade|\b(?:rua|avenida|pra[\u00e7c]a|ladeira|rodovia|alameda)\b|\bbairro\b|prefeitura|munic[\u00edi]pio de|estado d[eo]\b/gi;
const TAM_SEMENTE = 8;
const PESQUISA = /\b(?:fonte|modalidade|relat[óo]rio|raz[ãa]o|mediana|fornecedor|vencedor|cotado|consolida[çc][ãa]o)\b/;

// O CABECALHO da tabela tambem se repete a cada folha e cai no meio da celula
// que atravessa a virada: "Exclusivo ME/EPP ITEM OBJETO / DESCRICAO QUANTI DADE
// VALOR UNITARIO VALOR TOTAL PARTICIPA CAO" no ar condicionado de Pompeia/SP.
// Nao traz sinal de timbre, mas e feito quase so destas palavras.
const DO_CABECALHO = new Set(('item itens objeto descricao descrição especificacao especificação ' +
  'especificacoes especificações minimas mínimas minima mínima produtos produto quantidade quant ' +
  'quanti dade qtd qtde unid unidade und un valor valores unitario unitário total r marca modelo ' +
  'codigo código catmat catser lote participacao participação participa cao ção exclusivo cota ' +
  'reservada principal preco preço maximo máximo estimado ref referencia referência me epp dos das ' +
  'do da de #').split(' '));
const FORTES_DE_CABECALHO = /\b(?:valor|unit[aá]rio|quantidade|quant|qtde?|descri[cç][aã]o|especifica[cç](?:[aã]o|[oõ]es))\b/g;
const ehCabecalho = chave => {
  const ws = chave.split(' ');
  const dele = ws.filter(w => DO_CABECALHO.has(w)).length;
  return dele >= 7 && (chave.match(FORTES_DE_CABECALHO) || []).length >= 2;
};
const tokensDe = t => {
  const out = [];
  for (const m of String(t).matchAll(/[\p{L}\p{N}]+/gu)) {
    out.push({ n: m[0].toLowerCase().replace(/\d+/g, '#'), i: m.index, f: m.index + m[0].length });
  }
  return out;
};
function timbresDoEdital(texto) {
  const toks = tokensDe(texto);
  const N = toks.length;
  const onde = new Map();
  for (let k = 0; k + TAM_SEMENTE <= N; k++) {
    let chave = toks[k].n;
    for (let j = 1; j < TAM_SEMENTE; j++) chave += ' ' + toks[k + j].n;
    if (!onde.has(chave)) onde.set(chave, []);
    onde.get(chave).push(k);
  }
  const timbres = new Map();
  const cobertos = new Set();
  for (const [chave, pos] of onde) {
    const cabecalho = !SINAL_DE_TIMBRE.test(chave) && ehCabecalho(chave);
    if (pos.length < 3 || !(SINAL_DE_TIMBRE.test(chave) || cabecalho)) continue;
    // Modelo de pesquisa de precos nao e timbre, mesmo com endereco de site
    // dentro: "Fonte: https://pncp.gov.br/... Data: ... Modalidade:" se repete a
    // cada cotacao em Ponta Grossa/PR, e tira-lo levava junto justamente as
    // palavras em que o fim da celula e reconhecido.
    if (PESQUISA.test(chave)) continue;
    // Ocorrencias que se sobrepoem (texto repetido colado) contam uma vez.
    const ocs = pos.filter((p, j) => j === 0 || p - pos[j - 1] >= TAM_SEMENTE);
    if (ocs.length < 3 || cobertos.has(ocs[0])) continue;
    const concorda = (desloc) => {
      const cont = new Map();
      for (const p of ocs) {
        const q = p + desloc;
        if (q < 0 || q >= N) continue;
        cont.set(toks[q].n, (cont.get(toks[q].n) || 0) + 1);
      }
      let melhor = 0;
      for (const v of cont.values()) melhor = Math.max(melhor, v);
      if (melhor < Math.ceil(ocs.length * 0.8)) return null;
      const w = [...cont].find(([, v]) => v === melhor)[0];
      // O cabecalho so cresce sobre palavra de cabecalho: a primeira linha da
      // tabela, que num edital com a tabela repetida vem igual depois dele,
      // e especificacao e fica.
      if (cabecalho && !DO_CABECALHO.has(w)) return null;
      return PESQUISA.test(w) ? null : w;
    };
    let esq = 0, dir = TAM_SEMENTE - 1;
    while (esq > -60 && concorda(esq - 1) !== null) esq--;
    while (dir < 120 && concorda(dir + 1) !== null) dir++;
    const seq = [];
    for (let d = esq; d <= dir; d++) seq.push(concorda(d));
    // Numero solto na ponta nao e do timbre, e o do vizinho: a borda que cresceu
    // sobre "110.144,13" levava o "13" e deixava "110.144," na celula de Pinhal
    // de Sao Bento/PR.
    while (seq.length && seq[0] === '#') seq.shift();
    while (seq.length && seq[seq.length - 1] === '#') seq.pop();
    if (seq.length < 5) continue;
    // Timbre de verdade junta varios sinais — endereco, CEP, telefone, site —
    // num trecho curto. Sequencia comprida com um sinal so e texto repetido que
    // por acaso tem uma palavra dessas: foi assim que a linha inteira de um item
    // de Birigui/SP entrou como timbre.
    if (!cabecalho && seq.length > 40) {
      const sinais = new Set((seq.join(' ').match(SINAIS_DE_TIMBRE) || []).map(x => x.toLowerCase().replace(/[^a-z]/g, '')));
      if (sinais.size < 2) continue;
    }
    for (const p of ocs) for (let d = 0; d < TAM_SEMENTE; d++) cobertos.add(p + d);
    timbres.set(seq.join(' '), seq);
  }
  // O mais comprido primeiro: o carimbo inteiro sai de uma vez, e nao aos pedacos.
  return [...timbres.values()].sort((x, y) => y.length - x.length);
}

function tiraTimbre(txt, timbres) {
  if (!timbres || !timbres.length) return txt;
  let t = txt;
  for (let volta = 0; volta < 4; volta++) {
    const toks = tokensDe(t);
    let corte = null;
    for (const seq of timbres) {
      const L = seq.length;
      // inteiro, em qualquer lugar
      for (let k = 0; k + L <= toks.length && !corte; k++) {
        let ok = true;
        for (let j = 0; j < L && ok; j++) if (toks[k + j].n !== seq[j]) ok = false;
        if (ok) corte = [toks[k].i, toks[k + L - 1].f];
      }
      if (corte) break;
      // A PONTA FINAL: celula que termina no meio do timbre. So a final — a
      // celula comeca no nome do produto, nunca no fim de um timbre — e so se
      // o pedaco que sai tiver, ele mesmo, um sinal forte.
      for (let m = Math.min(L - 1, toks.length); m >= 8 && !corte; m--) {
        let ok = true;
        for (let j = 0; j < m && ok; j++) if (toks[toks.length - m + j].n !== seq[j]) ok = false;
        if (ok && SINAL_DE_TIMBRE.test(seq.slice(0, m).join(' '))) corte = [toks[toks.length - m].i, t.length];
      }
      if (corte) break;
    }
    if (!corte) break;
    t = (t.slice(0, corte[0]) + ' ' + t.slice(corte[1])).replace(/\s{2,}/g, ' ');
  }
  // Separadores que o timbre deixa pendurados: " \u2013 ", " | ", ":".
  return t.replace(/(?:\s*[|\u2013\u2014]\s*){2,}/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

// Frase que termina pendurada: virgula, hifen, ou preposicao/artigo no fim.
const ACABA_NO_MEIO = /(?:[,\-–(]|\s(?:de|da|do|das|dos|com|e|ou|para|em|a|o|as|os|que|por|no|na|nos|nas|ao|aos|à|às|sem|sob|entre|até|um|uma|pelo|pela|pelos|pelas|seu|sua|cujo|cuja))$/i;

function limpaCelula(txt, timbres) {
  let t = ' ' + txt;
  for (const re of VALORES_DA_LINHA) t = t.replace(re, ' ');
  t = tiraTimbre(t.replace(/\s{2,}/g, ' ').trim(), timbres);
  // O numero do PROXIMO item, que fica para tras quando a marca dele cai logo
  // depois: "...Peso Liquido: 31 kg 02", "...garantia minima 12 meses. 16
  // 451451". So com zero a esquerda, depois de fim de frase ou depois do grupo
  // unidade/quantidade \u2014 nunca depois de uma palavra, porque "capacidade 12" e
  // medida.
  for (let volta = 0; volta < 4; volta++) {
    const antes = t;
    // Nenhuma destas regras age depois de dois-pontos: "Portas: 02",
    // "Capacidade: 120000" e "consumo: 0,24" sao a propria especificacao.
    // O travessao solto no fim sai antes, senao nada abaixo casa: "...12 (doze)
    // meses. 5.1 –" (Itai/SP), onde o titulo da clausula foi cortado.
    t = t.replace(/[\s–—-]+$/, '').replace(/(?<=[.;)\d]|\b(?:kg|KG|g|L|l|V|W|cm|mm|m|UN|UND|UNID|Unid|Und))\s+0\d{1,2}(?:\s+\d{5,9})?$/, '')
         .replace(/([.;)])\s+\d{1,3}(?:\s+\d{5,9})?$/, '$1')
         // unidade e quantidade da coluna ao lado, nas duas ordens: "UNID 03",
         // "1 Unid.", e a unidade sozinha depois do ponto final: "...de 1 ano. Und"
         .replace(/\s(?:Un\s*-\s*)?(?:UNIDADES?|UNID|UND|UN|Unid|Und|Unidade|Unidad\s?e|UNIDAD\s?E)\.?\s+\d{1,4}(?:,\d{2})?$/, '')
         // codigo de catalogo, quantidade e numero do proximo item depois do
         // ponto: "...Eficiencia Energetica Letra "a"; 625244 4 2" (Sao Paulo/SP)
         .replace(/([.;])\s+\d{5,9}\s+\d{1,4}(?:\s+\d{1,3})?$/, '$1')
         // unidade, preco unitario com quatro casas e quantidade com duas:
         // "...Marchesoni 6 Litros CF-1692 (220V) Unidade 964,1400 3,00" (Santa
         // Maria/RS), as vezes com o codigo do catalogo antes
         .replace(/\s(?:\d{5,9}\s+)?(?:Unidade|UNIDADE|Und|UND|Un|UN)\s+[\d.]+,\d{2,4}\s+[\d.]+,\d{2}$/, '')
         .replace(/\s\d{1,4}(?:,\d{2})?\s+(?:UNIDADES?|UNID|UND|UN|Unid|Und)\.?$/, '')
         // quantidade, unidade e numero do proximo item: "...12 (doze) meses. 5 UN 2."
         .replace(/\s\d{1,4}\s+(?:UNIDADES?|UNID|UND|UN|Unid|Und)\.?\s+\d{1,3}\.?$/, '')
         .replace(/([.;)])\s+(?:UNIDADES?|UNID|UND|UN|Unid|Und|UNIDAD\s?E)\.?$/, '$1')
         // preco solto depois do ponto final: "...CONTROLE REMOTO. 855,27 14"
         .replace(/([.;)])\s+[\d.]+,\d{2}(?:\s+\d{1,3})?$/, '$1')
         // preco unitario e total no fim, com o comeco da linha seguinte:
         // "...suporte para ate 50kg. 685,00 4.110,00 32 25,0" (Mariopolis/PR)
         // O total pode vir com virgula no milhar: "-TENSAO:127 V 994,89 3,979,56"
         // (Renascenca/PR).
         .replace(/\s[\d.]{1,9},\d{2}\s+[\d.,]{1,12},\d{2}(?:\s+\d{1,3}(?:\s+[\d.,]+)?)?$/, '')
         // preco com R$ sobrando no fim, depois do corte da pesquisa de precos
         .replace(/\sR\$\s*[\d.]+,\d{2,4}$/, '')
         // unidade, quantidade e numero do proximo item: "...INMETRO UND 3 8"
         .replace(/\s(?:UNIDADES?|UNID|UND|UN|Unid|Und)\.?\s+\d{1,4}\s+\d{1,3}$/, '')
         // codigo de catalogo solto no fim: "...TENSAO: 220 V 618525"
         .replace(/(?<=[A-Za-zÀ-ÿ])\s\d{6}$/, '')
         .replace(/([.;)])\s+\d{6}$/, '$1')
         // e depois do modelo de referencia que termina em numero: "...Marca/Modelo
         // de Referencia ou equivalente: Centrifuga de alimentos Britania Juicer
         // 1000 486489" (Botucatu/SP)
         .replace(/(Marca\/Modelo\s+de\s+refer[êe]ncia[^]{0,200}?\S)\s\d{6}$/i, '$1')
         // numero do proximo item com os codigos: "...ilustrativa 7. 424374 142027"
         .replace(/\s\d{1,3}\.?\s+\d{5,9}(?:\s+\d{5,9})?$/, '')
         // "...cor branca Un - Unidade 3 9" (Apiai/SP)
         // e com mais numeros da linha seguinte: "...cesto acoinoxidavel Un -
         // Unidade 4 13 8"
         .replace(/\s(?:Un\s*-\s*)?Unidade\s+\d{1,4}(?:\s+\d{1,3}){0,2}$/, '')
         // quantidade com a unidade entre parenteses: "...12 (doze) meses. 10
         // (unidades)" (Sao Paulo/SP)
         .replace(/\s\d{1,4}\s+\((?:unidades?|un|und|unid)\)$/i, '')
         // uma ou duas maiusculas soltas depois do ponto final: "...MINI SPLIT. DE"
         .replace(/([.;])\s+[A-ZÀ-Ú]{1,2}$/, '$1')
         // numero da clausula seguinte: "...12 (doze) meses. 5.1"
         .replace(/([.;)])\s+\d{1,2}\.\d{1,2}\.?$/, '$1')
         // numero do item seguinte com ponto: "...defeitos de fabricacao. 33."
         .replace(/([.;)])\s+\d{1,3}\.$/, '$1')
         // numero e quantidade da linha seguinte: "...Preto/Prata. 110V. 66 6,0"
         .replace(/([.;)])\s+\d{1,3}\s+\d{1,4},\d{1,2}$/, '$1')
         // quantidade e numero de outra linha soltos depois do ponto: "...220V. 02 6"
         // (Cubatao/SP, onde a tabela nao segue a ordem dos itens)
         .replace(/([.;])\s+\d{1,4}\s+\d{1,3}$/, '$1')
         // preco, numero e quantidade da linha seguinte: "...TIPO: MINI SPLIT.
         // 2.757,44 02 36" (Descalvado/SP), e o preco numa fonte que nao se le,
         // que sai como duas letras: "...CONTROLE REMOTO. DG 01"
         .replace(/([.;])\s+[\d.]+,\d{2}\s+\d{1,4}\s+\d{1,4}$/, '$1')
         .replace(/([.;])\s+(?!NR|IP|CE)[A-Z]{2}\s+\d{1,3}$/, '$1')
         // o "ITEM" do subtitulo seguinte: "...recebimento definitivo do
         // equipamento. ITEM" (Sao Luiz Gonzaga/RS)
         .replace(/([.;])\s+ITEM$/, '$1')
         // a garantia da coluna ao lado: "...CERTIFICACAO INMETRO. 12 MESES" (Campinas/SP)
         .replace(/([.;])\s+\d{1,2}\s+MESES$/, '$1')
         // numero e os dois codigos da linha seguinte, cuja marca cai no nome:
         // "...recebimento definitivo. Imagem meramente ilustrativa 5) 451454
         // 110727" (Ponta Grossa/PR)
         .replace(/\s\d{1,3}[).]\s+\d{5,9}\/?\s+\d{5,9}$/, '')
         // a linha seguinte inteira, com numero e codigo, quando o rodape da
         // folha estava entre as duas e so saiu na limpeza: "...acima ou
         // superior. 9 11139 Jogo de mesa com 4 cadeiras..." (Pinhal de Sao
         // Bento/PR). Codigo terminado em 000 e capacidade, nao codigo.
         .replace(/([.;])\s+\d{1,3}\s+(?!\d*000\s)\d{5,6}\s+[A-ZÀ-Ú][a-zà-ÿ][^]*$/, '$1')
         // o preco unitario que sobra no fim, depois da tensao ou de palavra em
         // caixa alta: "...-TENSAO:127 V 994,89" e "...EM COR CLARA 948,65"
         // (Renascenca/PR), "...NBR 14136, 220 V, 747,49" (Florianopolis/SC)
         .replace(/(?:(?<=\d\s?V,?)|(?<=[A-ZÀ-Ú]{3}))\s+(?:\d{1,3}(?:\.\d{3})+|\d{3}),\d{2}$/, '')
         // numero, quantidade e unidade da linha seguinte: "...12 (DOZE) MESES. 03
         // 01 un" (Trabiju/SP), e o preco partido: "...(DOZE) MESES. 2.102,8"
         .replace(/([.;])\s+\d{1,3}\s+\d{1,4}\s+(?:un|und|unid)\.?$/i, '$1')
         .replace(/([.;])\s+[\d.]+,\d{1,2}$/, '$1')
         // unidade, quantidade e as colunas de cota: "...Garantia 12 meses. Unidade
         // 55 Nao SIM" (Sao Paulo/SP)
         .replace(/\sUnidade\s+\d{1,5}(?:\s+(?:N[ãa]o|Sim|SIM|N[ÃA]O)){1,2}$/, '')
         // unidade e numeros da planilha: "...cobertura integral. Un 1 2 11" (Nova Fatima/PR)
         .replace(/\s(?:Un|UN|Und|UND)\s+\d{1,4}(?:\s+\d{1,4}){1,3}$/, '')
         // numero e codigo da linha seguinte: "...Voltagem 110V ou Bivolt. 12 9623"
         .replace(/([.;])\s+\d{1,3}\s+\d{4,9}$/, '$1')
         // quantidade e participacao, que sobram quando os precos saem depois:
         // "...12 (doze) meses. 4 Exclusivo ME/EPP" (Pompeia/SP)
         .replace(/\s\d{1,4}\s+(?:Exclusivo|Ampla Concorr[êe]ncia|Cota Reservada)(?:\s+(?:para\s+)?ME\/EPP)?(?:\s+\d{1,3})?$/i, '')
         .trim();
    if (t === antes) break;
  }
  // A unidade da coluna ao lado abrindo a celula: "UND CORTINA DE AR, MATERIAL:
  // METAL E PLASTICO..." (Descalvado/SP).
  t = t.replace(/^(?:UNIDADES?|UNID|UND|UN)\.?\s+(?=[A-Z\u00c0-\u00da]{3,})/, '');
  // A quantidade da coluna ao lado abrindo a celula: "3 SANDUICHEIRA - Sanduicheira/Grill"
  // e "1 BATEDEIRA PLANETARIA: Especificacoes" (Mariopolis/PR, edital 25).
  t = t.replace(/^\d{1,3}\s+(?=[A-Z\u00c0-\u00da]{5,}[\s:\u2013-])/, '');
  // E a abreviatura antes do nome com so a inicial maiuscula: "UND Batedeira
  // planetaria...", "UND Ar condicionado..." \u2014 todas as celulas de
  // Mariopolis/PR. "UNIDADE" por extenso nao entra: "Unidade condensadora" e
  // nome de produto.
  t = t.replace(/^(?:UNID|UND|UN|Unid|Und)\.?\s+(?=[A-Z\u00c0-\u00da][a-z\u00e0-\u00ff])/, '');
  // O codigo 8720 da planilha da Unicamp antes do nome: "8720 LIQUIDIFICADOR;
  // TIPO INDUSTRIAL" (Campinas/SP).
  t = t.replace(/^\d{4}\s+(?=[A-Z\u00c0-\u00da]{4,}[A-Z\u00c0-\u00da /.]*;)/, '');
  // A participacao da linha antes do nome: "EXCLUSIVO - CAFETEIRA ELETRICA EM
  // INOX" (Birigui/SP). Diz quem pode disputar, e isso o resumo ja mostra.
  t = t.replace(/^(?:EXCLUSIVO(?:\s+ME\/EPP)?|COTA RESERVADA(?:\s+ME\/EPP)?|COTA PRINCIPAL|AMPLA CONCORR[\u00caE]NCIA)\s*[-\u2013]?\s+(?=[A-Z\u00c0-\u00da])/, '');
  // Lixo depois do ultimo ponto final: valores da linha escritos numa fonte que
  // nao foi decodificada. "...PELO FABRICANTE. UNIDAD E IE f8 EBFDL@MI f8
  // JEBJIJ@HI" em Barra do Garcas/MT \u2014 o "IE f8" e "51 R$" com 20 somado em
  // cada letra. So sai rabo curto com arroba entre letras, ou com duas pecas
  // de letra-e-digito como "f8" \u2014 sigla tecnica ("HDMI USB") fica.
  const rabo = /([.;])((?:\s+\S+){1,8})$/.exec(t);
  if (rabo && rabo[2].length <= 60) {
    const r = rabo[2];
    const pecas = (r.match(/(?:^|\s)(?:[A-Za-z]\d|\d[A-Za-z])(?=\s|$)/g) || []).length;
    if (/[A-Za-z]@[A-Za-z]/.test(r) || pecas >= 2) t = t.slice(0, rabo.index + 1);
  }
  return t.replace(/[\s,;:\u2013-]+$/, '').trim();
}

// Rodape de pagina que cai no meio da celula quando o descritivo atravessa uma
// quebra: "Rua Jose Quirino Ribeiro, 55, Jardim Belem - Descalvado (SP) - PABX
// (19) 3583.9300 - CEP 13690-091 www.descalvado.sp.gov.br". Aqui se REMOVE em
// vez de cortar: cortar jogaria fora a continuacao da especificacao, que vem
// logo depois do rodape e e justamente o que se quer.
const RODAPE = [
  // A VIRADA DE FOLHA no meio da linha da planilha da UFSM (Santa Maria/RS): a
  // unidade, o preco, a quantidade e os campos em branco da linha, e o
  // cabecalho da folha seguinte — e a descricao CONTINUA: "...Deve possuir
  // controle de temperatura Unidade 167,0000 15,00 ____ ____ UNIVERSIDADE
  // FEDERAL DE SANTA MARIA - UFSM ... Preco Total independente para cada boca".
  // Quando o que vem depois e o numero da linha seguinte, o bloco fica: ai ele
  // e o fim da linha, e o corte pelos sublinhados continua valendo.
  /\s*Unidade\s+[\d.]+,\d{2,4}\s+[\d.]+,\d{2}\s+_{4,}\s+_{4,}\s+[A-ZÀ-Ú][^_]{0,80}?\d{14}\s+Anexo ao Termo de Refer[êe]ncia\s+Item\s+Especifica[çc][ãa]o\s+Cat[áa]logo\s+Unidade\s+Pre[çc]o\s+M[áa]ximo\s+Quantidade\s+Pre[çc]o\s+Unit[áa]rio\s+Pre[çc]o\s+Total(?=\s+(?!\d{1,3}\s)\S)/g,
  /\s*www\.[^\s]+/gi,
  // Cabecalho de impressao do sistema de compras no alto de cada folha, no meio
  // da celula: "...Tecnologia: Inverter; 17 Impressao: 01/09/2026 COMPRAS Hora:
  // 15:10:49 TERMO DE REFERENCIA Tipo: Split Hi-Wall" (Sao Luiz Gonzaga/RS).
  /\s*(?:\d{1,3}\s+)?(?:[A-Z\u00c0-\u00da][A-Za-z\u00c0-\u00ff]*(?:\s+[A-Za-z\u00c0-\u00ff]+){0,4}\s+-\s+[A-Z]{2}\s+)?Impress[\u00e3a]o:\s*\d{2}\/\d{2}\/\d{4}\s+COMPRAS\s+Hora:\s*\d{2}:\d{2}:\d{2}\s+(?:TERMO DE REFER[\u00caE]NCIA|ESTUDO T[\u00c9E]CNICO PRELIMINAR)/g,
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
  // Rodape do SEI com o nome do documento e o numero da folha: "Termo de
  // Referencia 0117933622 SEI 015.00368467/2026-23 / pg. 1" (Sao Paulo/SP),
  // "Licitacao - ETP 0190220 SEI 0007.0.000007242/2026-6 / pg. 5" (Vicosa/MG).
  // Vem antes da regra do "SEI n", que levava so o numero do processo e deixava
  // "Termo de Referencia 0117933622 / pg." no fim de tres celulas.
  /\s*(?:Termo de Refer[êe]ncia|Licita[çc][ãa]o\s*-\s*ETP|Edital de Preg[ãa]o[^/]{0,40}?)\s+\d{6,10}\s+SEI\s+[\d.]+\/\d{4}-\d{1,2}\s*\/\s*pg\.(?:\s*\d{1,3}(?=\s|$))?/gi,
  // O cabecalho da tabela repetido no alto da folha seguinte, no meio da celula:
  // "Item Descricao Quant. Unidade Valor Unit. Valor Total" (Vicosa/MG).
  /\s*(?:Item\s+Descri[çc][ãa]o\s+Quant\.\s+Unidade\s+Valor\s+)?Unit\.\s+Valor\s+Total/g,
  /\s*SEI\s*n[ºo°]?\s*[\d/.\-]+/gi,
  // Sem espaco obrigatorio depois de "Pagina" e com a barra como separador:
  // o item 6 de Bela Vista do Paraiso/PR trazia "Pagina21 | 59" no meio da
  // descricao, entre a aplicacao do equipamento e o painel digital dele.
  /\s*P[áa]gina:?\s*\d+(?:\s*(?:de|\|)\s*\d+)?/gi,
  // A VIRADA DE FOLHA no meio da celula: preco da linha e numero de pagina
  // espremidos entre o fim de uma frase e a maiuscula que continua a outra, sem
  // espaco nenhum — "...fixacao em parede.227,931.367,58 13 de 14Novo, sem uso,
  // acompanhado de manual..." no ventilador do item 14 de Vicosa/MG.
  //
  // Some daqui em vez de virar fim de linha porque o descritivo CONTINUA depois
  // dela: e o mesmo item, na folha seguinte. A assinatura e estreita de
  // proposito — preco colado numa letra minuscula e maiuscula colada no fim so
  // acontecem quando o PDF virou a pagina no meio da celula.
  /(?<=[a-z\u00e0-\u00ff.,;])[\d.]{1,12},\d{2}[\d.]{1,12},\d{2}(?:\s*\d{1,3}\s+de\s+\d{1,3})?(?=[A-Za-z\u00c0-\u00ff])/g,
  /(?<=[a-z\u00e0-\u00ff.,;])\s?\d{1,3}\s+de\s+\d{1,3}(?=[A-Za-z\u00c0-\u00ff])/g,
  // O TIMBRE do orgao e o cabecalho da planilha, que reaparecem no alto de cada
  // folha e caem no meio da celula quando o item atravessa a virada. Nenhum
  // deles e descricao de produto, e nenhum fecha o item — o descritivo continua
  // logo depois. Por isso saem daqui, e nao viram fim de linha.
  /\s*PREFEITURA\s+(?:MUNICIPAL\s+)?(?:D[EO]\s+)?[A-Z\u00c0-\u00da][A-Z\u00c0-\u00da' .]{2,32}/g,
  /\s*(?:GOVERNO\s+DO\s+)?ESTADO\s+D[EO]\s+[A-Z\u00c0-\u00da][A-Z\u00c0-\u00da' .]{2,24}/g,
  /\s*CNPJ[:\s.]*[\d.\/-]{14,20}/gi,
  /\s*Fone[s:\s]*\(?\d{2}\)?[\d\s.-]{6,}/gi,
  /\s*e-?mail:?\s*\S+@\S+/gi,
  /\s*Item\s*Descri[\u00e7c][\u00e3a]o\s*do\s*Produto\s*\/?\s*Servi[\u00e7c]o\s*Unidade/gi,
  /\s*Pre[\u00e7c]o\s*M[\u00e1a]ximo(?:\s*Total)?/gi,
  /\s*C[\u00f3o]d\.?\s*do\s*Produto/gi,
  // Rodape de sistema de compras, que assina cada folha com quem emitiu, a
  // versao e o numero da pagina. Cai no meio da celula dos itens 5 e 6 de
  // Londrina/PR, entre a descricao do refrigerador e a garantia dele.
  /\s*Emitido por:[\s\S]{0,60}?na vers[\u00e3a]o:\s*\d+/gi,
  /\s*Prefeitura do Munic[\u00edi]pio de\s+[A-Z\u00c0-\u00da][A-Za-z\u00c0-\u00ff ]{2,24}\s*-?\s*\d{4}/gi,
  /\s*P[\u00e1a]gina:\s*\d{1,3}/gi,
  /\s*Anexo\s*\d{1,3}\s*-\s*Processo:\s*[\d\/.-]+/gi,
  /\s*Processo\s*[\d\/]{4,12}\s*\d{2}\/\d{2}\/\d{4}\s*\d{2}:\d{2}(?::\d{2})?/gi
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
// O rotulo de CAMPO repetido, que e como o edital de Sao Paulo/SP separa as
// linhas: cada item e "MODELO: ... TIPO DE MATERIAL: ... REFERENCIA: ...
// MEDIDAS: ...". Quando o "MODELO:" reaparece, comecou o item seguinte — o
// controle remoto do item 2 seguia por seis mil caracteres de tubo de cobre.
//
// So rotulo em caixa alta e so a partir de 250 caracteres: dentro de uma mesma
// especificacao o campo nao se repete, e o piso evita cortar um cabecalho que
// o edital escreve duas vezes coladas.
const CAMPO = /(?:^|[^A-Z\u00c0-\u00da])([A-Z\u00c0-\u00da][A-Z\u00c0-\u00da ]{2,24}):/;

function cortaNaRepeticao(t) {
  if (t.length < 200) return t;
  const inicio = t.slice(0, 50);
  const k = t.indexOf(inicio, 100);
  let fim = k > 0 ? k : t.length;

  const m = CAMPO.exec(t.slice(0, 200));
  if (m) {
    const rot = m[1] + ":";
    const r = t.indexOf(rot, Math.max(250, m.index + rot.length));
    if (r > 0 && r < fim) fim = r;
  }
  return fim === t.length ? t : t.slice(0, fim).trim().replace(/[\s.,;:-]+$/, '');
}

function cortaNaProximaLinha(txt) {
  const limpo = cortaNaRepeticao(tiraRodape(txt));
  let fim = limpo.length;
  for (const re0 of FIM_DE_LINHA) {
    // A busca continua DEPOIS dos primeiros vinte caracteres. Com exec simples
    // so a primeira ocorrencia era vista, e se ela caisse no comeco — onde a
    // trava a ignora — as seguintes nao eram procuradas: a celula do item 4 de
    // Itapirapua/GO abria com "Und 02 04 Cadeira" e por isso "Und 15 05
    // Armario", o item 5 inteiro, ficava dentro dela.
    const re = new RegExp(re0.source, re0.flags.includes('g') ? re0.flags : re0.flags + 'g');
    re.lastIndex = 21;
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
  // O sinonimo conhecido vale uma palavra: "Maquina Secar Roupa" no PNCP e
  // "Secadora de roupas eletrica" no edital (Diamante D'Oeste/PR) nao tem
  // palavra nenhuma igual no nome, e so o cesto em comum no resto.
  const classe = classeDoRotulo(rotulo);
  const sinonimo = CLASSES.some(([c]) => c === classe) && classeDoInicio(normIgual(texto)) === classe ? 1 : 0;
  // O plural e a mesma palavra: "Ventilador ... tipo: coluna" no PNCP e
  // "Ventiladores de Coluna - 50cm, 3 Velocidades" no edital de Sao Paulo/SP
  // (edital 1081), que so tinha o "coluna" em comum ao pe da letra.
  const tem = w => cabeca.has(w) || cabeca.has(w + 's') || cabeca.has(w + 'es') || (/s$/.test(w) && cabeca.has(w.slice(0, -1)));
  return alvo.filter(tem).length + sinonimo >= 2;
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

// E os avisos que o orgao cola no fim do rotulo, que falam do edital e nao do
// produto: "Os descritivos e as unidades a serem considerados na elaboracao da
// proposta sao os que constam no Termo de Referencia..." (UFSM, Santa
// Maria/RS). Com "descritivos" e "termo" contando como palavras do item, a frase
// "Termo, exceto para os itens em que consta no descritivo do item..." passava
// por especificacao do filtro de agua do item 13.
const AVISO_NO_ROTULO = /\s*(?:Os descritivos e as unidades a serem considerados|Maiores informa[çc][õo]es sobre a descri[çc][ãa]o|Considerar itens descritos no Anexo|ATEN[ÇC][ÃA]O,? LICITANTES|ATEN[ÇC][ÃA]O: Considerar a descri[çc][ãa]o|O item ser[áa] solicitado conforme)[^]*$/i;
const palavrasDoItem = rotulo => [...new Set(
  fatia(String(rotulo).replace(AVISO_NO_ROTULO, ' ').replace(REMISSAO, ' ')).filter(util).map(limpaNum))];

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
function marcaPorProximidade(tokens, alvo, numero, numeroDaLinha, vale = () => true) {
  if (alvo.length < 2) return -1;
  const querido = new Set(alvo);
  let melhorPos = -1, melhorN = 0, melhorNota = -1;
  for (let i = 0; i < tokens.length; i++) {
    // A janela so vale se comecar numa palavra do item: comecando no meio, a
    // marca cairia antes do nome do produto e o recorte abriria fora de lugar.
    if (!querido.has(tokens[i].w) || !vale(tokens[i].p)) continue;
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
  // A copia da pesquisa de precos nao serve, nem confirmada pelo numero: em
  // Viçosa/MG (pregao 97) ela abre com "Item Quantidade 1", vencia a copia
  // limpa do Termo de Referencia e depois era descartada, e o item ficava sem
  // descritivo (16/09/2026).
  if (/Lan[çc]ado\s+por:|Metodologia\s+Menor\s+Valor/i.test(t)) return false;
  // Nem a justificativa da compra com o nome do produto por titulo: "AR
  // CONDICIONADO A presente aquisicao tem por finalidade demonstrar a
  // necessidade ..." venceu a linha "Condicionador de Ar; do Tipo Split; ..."
  // do mesmo edital (Secretaria da Saude de SP, pregao 28, 16/09/2026).
  if (/tem\s+por\s+finalidade\s+demonstrar\s+a\s+necessidade|Justifica-se\s+a\s+(?:necessidade|aquisi)/i.test(t)) return false;
  // Nem a citacao abreviada do item, com "[...]", que vem da resposta a uma
  // impugnacao: "Item 01: Ventilador de teto, 3 pas em madeira [...], com
  // controle de velocidade" (Pitangueiras/SP) — a linha inteira esta na tabela.
  if (/\[\s*(?:\.\.\.|…)\s*\]/.test(t)) return false;
  // nem a pagina de loja virtual copiada na pesquisa: "Ar Condicionado Split
  // Agratto ... Política de Privacidade", "Hisense Eco Plus 12.000 Btus Frio
  // 220v R-32 4.8 (18)" (mesmo edital)
  if (/Pol[íi]tica\s+de\s+Privacidade|Adicionar\s+ao\s+carrinho|Frete\s+gr[áa]tis|\s\d\.\d\s+\(\d{1,5}\)\s/i.test(t)) return false;
  // Celula que correu ate o TETO nao achou o proprio fim: dali para a frente e
  // o resto do documento, nao a especificacao do produto. Seis mil caracteres
  // nao sao a descricao de uma geladeira.
  //
  // O item 78 de Bento Goncalves/RS e um freezer, e a celula dele comecava numa
  // PLANTA BAIXA ("Freezer 148x78 79 1,00 x 1,10 / peitoril ... Planta Baixa
  // CAMPUS") e seguia por seis mil caracteres de estudo tecnico. A palavra
  // "freezer" so aparece na planta nesse edital: a tabela de itens nao entrou no
  // texto, e melhor o item sem descritivo do que com a legenda de uma planta.
  //
  // So vale quando o numero do item vem impresso abrindo a linha: ai a linha e
  // dele por prova do edital, e o comprimento e so falta de um proximo item para
  // fechar a celula — que e justamente para o que o teto existe.
  if (!confirmado && t.length >= TETO_ITEM - 200) return false;
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
  // Quando o rotulo so remete ao Termo de Referencia ("VENTILADOR DE PAREDE DE
  // 60 CM - conforme termo de referencia", Serrana/SP), a linha do TR e a unica
  // especificacao que existe, e a curta tambem vale: "Ventilador de Parede,
  // 170W. Cor: Preto. Dimensoes: 60cm." A remissao nao conta no tamanho do
  // rotulo, e a prova de produto continua valendo abaixo.
  const remete = /conforme\s+(?:o\s+)?(?:termo\s+de\s+refer|edital|anexo)|de\s+acordo\s+com\s+o\s+termo/i.test(rotulo);
  const fechada = t.length >= (remete ? 40 : 90) && /[.;]$/.test(t.trim());
  const grande = t.length >= piso || fechada || t.length > rotulo.length + 40;
  // A prova de produto e para quando nao se sabe de quem e a linha. Confirmada
  // pelo numero do item, ela so atrapalha: o item 6 de Cubatao/SP e "Coifa
  // aplicacao: cozinha" no catalogo e "Coifa Industrial/Residencial: Material em
  // aco inox..." no edital — uma palavra em comum, e a linha e inequivocamente
  // dele, aberta com o 6 depois do total da linha 5.
  // Confirmada pelo numero, a linha curta e fechada tambem vale quando diz algo
  // que o rotulo nao diz: o item 74 de Mariopolis/PR e "Multiprocessador
  // Alimentos ... potencia: 420/600" no catalogo, e a linha 74 do edital e
  // "Multiprocessador 9 Em 1 C/ Batedeira 1700w Turbo." — outro aparelho que o
  // usuario so ve pelo edital. O titulo que repete o rotulo continua de fora.
  const curtaPropria = t.length >= 30 && /\.$/.test(t.trim())
    && !normIgual(rotulo).replace(/[^a-z0-9]+/g, ' ').includes(normIgual(t).replace(/[^a-z0-9]+/g, ' ').trim());
  if (confirmado) return (grande || curtaPropria) && !comecaNoMeio(t) && !AINDA_SUJO.test(t);
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
  // O codigo tambem pode vir com pontos, "34 165.6.198 ASPIRADOR DE PO" em
  // Salto/SP. Sem essa forma a leitura parava no "198" do codigo e nenhuma linha
  // de Salto se confirmava pelo numero.
  // O meio do codigo tem uma ou duas casas: "014.001.167" (Jaraguari/MS) e
  // "368.001.969" (Chapadao do Sul/MS) sao outra coisa e ficam de fora.
  // E com travessao depois do codigo: "0007 414334 - OSMOSE REVERSA PARA
  // PURIFICACAO DE AGUA" (Florianopolis/SC).
  // Nunca colado numa virgula: "R$ 17.864,76 Refresqueira" e o centavo do preco, e
  // lido como item fazia a linha da cota 77 de Bento Goncalves/RS passar pela do
  // item 76.
  // So depois do codigo: "10 - Sera adotado para o envio de lances" e clausula
  // (Diamante D'Oeste/PR), e com o travessao logo depois do numero ela passava
  // por abertura da linha do item 10.
  const ABERTURA = /(?:^|[^0-9,])(0*[0-9]{1,4})[.)\-]?(?:(?:\s+(?:[0-9]{5,9}|[0-9]{3}\.[0-9]{1,2}\.[0-9]{1,3})[.,)\-]*){1,2}\s*[-–]\s*|(?:\s+(?:[0-9]{5,9}|[0-9]{3}\.[0-9]{1,2}\.[0-9]{1,3})[.,)\-]*){0,2}\s*)(?:(?:un|und|unid|unidade|pc|pca|peca|cx|caixa|par|kit|servico|kg)\.?\s*)?$/i;
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

  // Numero do item, codigo de catalogo, quantidade e unidade: "08 368956 6 UN
  // FORNO MICRO-ONDAS" (Renascenca/PR). A ABERTURA lia o "6 UN" — a quantidade
  // — como numero da linha, e o fogao do item 6, que tem "forno autolimpante"
  // no rotulo do PNCP, se confirmava na linha do micro-ondas e ficava com ela.
  // Codigo de quatro digitos para cima: "parafuso com bucha n 6 200 83 Unid" em
  // Sao Jose da Boa Vista/PR tem a medida e a quantidade antes do item 83.
  // Com dois codigos tambem: "1 119497 360770 10 unid BALANCA ELETRONICA" em
  // Campo Largo/PR (codigo interno e CATMAT).
  const ABERTURA_CAT_QTD = /(?:^|[^0-9.,])(0*[0-9]{1,4})(?:\s+[0-9]{4,9}){1,2}\s+[0-9]{1,5}\s*(?:un|und|unid|unidade|unidades)\.?\s*$/i;

  const numeroDaLinhaAntes = (pos) => {
    const antes = plano.slice(Math.max(0, pos - 34), pos);
    // O item seguido da referencia interna: "7 REF (CTI2288) Desumidificador de
    // ar" (UFSM, Santa Maria/RS). Lido o 2288, a linha do desumidificador do
    // item 18 parecia tao boa quanto a do 7.
    const rf = antes.match(/(?:^|[^0-9.,])(0*[0-9]{1,4})\s+ref\s+\([a-z]{2,5}[0-9]{2,6}\)\s*$/);
    if (rf && +rf[1] > 0) return +rf[1];
    // O item seguido do codigo de quatro digitos, com o nome em caixa alta
    // fechado por ponto e virgula: "; 26 8720 PROCESSADOR DE ALIMENTO;"
    // (Campinas/SP). Sem isso o numero lido era o 8720.
    const c4 = antes.match(/(?:^|[^0-9.,])(0*[0-9]{1,3})\s+[0-9]{4}\s+$/);
    if (c4 && +c4[1] > 0 && /^[A-ZÀ-Ú]{4,}[A-ZÀ-Ú ]*;/.test(secoes.slice(pos, pos + 60))) return +c4[1];
    // Item e quantidade, nessa ordem, quando a quantidade e a que o PNCP da para
    // aquele item: "ITEM QUANT. DESCRICAO ... 406,40 3 1 ASPIRADOR DE PO"
    // (Mariopolis/PR, edital 25). Lido o ultimo numero, a linha 3 passava por 1.
    // So logo depois do preco da linha de cima ou do cabecalho "VALOR TOTAL", e
    // com o nome em caixa alta em seguida.
    const iq = antes.match(/(?:,[0-9]{2}|total)\s+(0*[0-9]{1,3})\s+(0*[0-9]{1,4})\s+$/);
    if (iq && /^[A-ZÀ-Ú]{4,}/.test(secoes.slice(pos, pos + 10))
        && itens.some(it => it[0] === +iq[1] && Number(it[2]) === +iq[2])) return +iq[1];
    // Item, quantidade inteira e unidade: "01 117 UN Ventilador de teto"
    // (Pitangueiras/SP). Vale quando a quantidade e a do PNCP para esse item;
    // sem isso o 117 passava por numero do item, e a linha certa empatava com
    // cinco mil caracteres do estudo tecnico, que venciam por serem mais longos.
    // So com "UN"/"UND" sem ponto: com "Unid." (Serrana/SP, "7 06 Unid.
    // APARELHO DE AR CONDICIONADO: ...") a confirmacao caia no titulo da celula,
    // que o corpo logo abaixo separa, e o item ficava so com o titulo.
    const iqu = antes.match(/(?:^|[^0-9.,])(0*[0-9]{1,4})\s+([0-9]{1,5})\s+(?:UN|UND|un|und)\s*$/);
    if (iqu && itens.some(it => it[0] === +iqu[1] && Number(it[2]) === +iqu[2])) return +iqu[1];
    const q = antes.match(ABERTURA_QTD);
    if (q && +q[1] > 0) return +q[1];
    const c = antes.match(ABERTURA_CAT_QTD);
    if (c && +c[1] > 0) return +c[1];
    // O subtitulo "3.2.2. Item 02: Bebedouro de Coluna" (Valinhos/SP).
    const it = antes.match(/\bitem\s+(0*[0-9]{1,4})\s*:\s*$/);
    if (it && +it[1] > 0) return +it[1];
    // Numero, codigo, unidade e quantidade: "1 57651 UN 6 AR CONDICIONADO"
    // (Guimarania/MG) — o item e o primeiro.
    const cu = antes.match(/(?:^|[^0-9.,])(0*[0-9]{1,4})(?:\s+[0-9]{4,9}){1,2}\s+(?:un|und|unid|unidade|unidades)\.?\s+[0-9]{1,5}\s*$/i);
    if (cu && +cu[1] > 0) return +cu[1];
    // A unidade seguida de numero logo depois do nome entre parenteses e a
    // QUANTIDADE: "BEBEDOURO - 03 TORNEIRAS (CATJAR) UN 4 CATMAT: 618960"
    // (Jaraguari/MS). Lido como item, o 4 confirmava a linha do bebedouro para o
    // ar-condicionado do item 4. Fora dessa forma a mesma sequencia e o item: "4
    // Unid. 6 Impressora" (Guararapes/SP) e quantidade, unidade e item, e
    // "Quantidade Unid. 1 Notebook" e o cabecalho seguido do item 1.
    if (/\)\s*(?:un|und|unid|unidade|unidades)\.?\s+[0-9]{1,5}(?:,[0-9]{1,2})?\s*$/i.test(antes)) return null;
    // ... e no modelo do Compras.gov.br: "Unidade (UN) com 1 Unidade 6".
    if (/\bcom\s+1\s+unidade\s+[0-9]{1,5}\s*$/i.test(antes)) return null;
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
  // "AR" entra mesmo com duas letras: "06 AR CONDIONADO 9.000 BTUS" em Campina do
  // Monte Alegre/SP abria a celula em "CONDIONADO" e deixava o "AR" no fim da
  // celula de cima.
  // E o outro nome antes da barra: "28 Geladeira / Refrigerador domestico" e "47
  // Jarra eletrica/ Chaleira eletrica" (Santa Maria/RS). Com a marca depois da
  // barra o numero da linha nao era lido, e os itens ficavam sem descritivo.
  // "30 Geladeira / Refrigerador tipo | Frigobar, capacidade total entre 80 a
  // 122 litros" (Santa Maria/RS, edital 227): o nome da linha vem antes da
  // palavra do rotulo e tambem e do item.
  const PREFIXO = /((?<=\d\s)[A-ZÀ-Ú][a-zà-ÿ]{2,14}\s*\/\s*[A-ZÀ-Ú][a-zà-ÿ]{2,14}\s+tipo\s+|[A-ZÀ-Ú][A-Za-zÀ-ÿ]{2,14}(?:\s+[a-zà-ÿ]{3,14})?\s*\/\s*|[A-ZÀ-Ú][A-Za-zÀ-ÿ]{2,14}(?:\s+(?:de|da|do|DE|DA|DO)\s+|\s+)?|(?:AR|Ar)(?:\s+|-\s*))$/;
  function recuaPrefixo(pos) {
    const antes = secoes.slice(Math.max(0, pos - 40), pos);
    const m = antes.match(PREFIXO);
    // "Item" e cabecalho da tabela, nao nome de produto: em Diamante D'Oeste/PR
    // a celula abria "Item Maquina de lavar roupas..." e, com a palavra na
    // frente, o cortaNaRepeticao nao reconhecia a segunda maquina de lavar,
    // que comeca igual, e as duas linhas saiam numa celula so.
    if (m && /^item\b/i.test(m[1])) return pos;
    let p = m ? pos - m[1].length : pos;
    // A busca por proximidade marca no primeiro numero do rotulo ("9.000") e o
    // recuo acima volta so ate "CONDIONADO"; o "AR" antes dele e parte do nome.
    const ar = /^(?:AR|Ar)/.test(m ? m[1] : '') ? null : secoes.slice(Math.max(0, p - 4), p).match(/(?<![A-Za-zÀ-ÿ])(?:AR|Ar)(?:\s+|-\s*)$/);
    if (ar) p -= ar[0].length;
    return p;
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
  //
  // Nem dentro de parenteses: o item 11 de Londrina/PR e so "Freezer" no
  // catalogo, e essa palavra sozinha casava dentro de "gabinete tipo duplex com
  // duas portas (freezer e refrigerador)" — no meio da celula dos itens 5 e 6,
  // que terminavam em "duas portas (".
  const NO_MEIO = /(?:^|[^a-z])(?:de|da|do|das|dos|e|ou|com|sem|para|em|no|na)[ ]+$|[(\[/]$/i;

  // A pesquisa de precos do Compras.gov.br anexada ao termo de referencia traz a
  // descricao do item COMPRADO POR OUTRO ORGAO: "Orgao: MINISTERIO DA DEFESA ...
  // Objeto: ... Descricao: Refresqueira material estrutura: ... capacidade: 16,
  // tensao: 220". O item 11 de Ponta Grossa/PR (edital 13) pede 15 litros e
  // 110 V e ficava com os 16 litros e 220 V do Exercito, porque o texto do
  // catalogo casava palavra por palavra. A marca ali continua fechando a celula
  // de cima, mas nao e candidata de item nenhum.
  // As zonas sao achadas uma vez por edital: a busca por proximidade pergunta
  // isso para cada palavra do texto.
  const zonasDePesquisa = [];
  for (const m of secoes.matchAll(/\bDescri[çc][ãa]o:\s/gi)) {
    if (!/[ÓO]rg[ãa]o:\s[^]{0,600}?\bObjeto:\s[^]{0,900}?$/i.test(secoes.slice(Math.max(0, m.index - 1600), m.index))) continue;
    const ini = m.index + m[0].length, fonte = secoes.indexOf('Fonte:', ini);
    // Ate o "Fonte:" que fecha a compra citada, que traz ainda a descricao do
    // CATMAT ("CatMat: 445212 - Refresqueira - Material Estrutura: ...").
    zonasDePesquisa.push([ini, fonte < 0 || fonte - ini > 8000 ? ini + 300 : fonte]);
  }
  const naPesquisaDePreco = p => zonasDePesquisa.some(([a, b]) => p >= a && p <= b);
  const porPos = new Map();
  const semAncora = [];
  // Marcas de pouca prova — a da busca por proximidade e a do nome de uma
  // palavra so logo depois de ponto e virgula —, que saem se o item acha a
  // linha confirmada pelo numero (logo antes da quinta via).
  const fracas = [];
  const marcaFraca = (pos, i) => fracas.push([pos, i]);
  itens.forEach((it, i) => {
    const achado = ancoraDe(plano, planoH, it[1], k => !naPesquisaDePreco(k));
    if (!achado) { semAncora.push(i); return; }
    const { ancora: a, plano: onde } = achado;
    const umaPalavra = !a.includes(" ");
    let de = 0;
    for (;;) {
      const k0 = onde.indexOf(a, de);
      if (k0 < 0) break;
      if (umaPalavra && NO_MEIO.test(onde.slice(Math.max(0, k0 - 14), k0))) { de = k0 + a.length; continue; }
      // Nem como NOME DE CAMPO: "Faixa de temperatura: Modo refrigerador:
      // aproximadamente 0°C a +8°C; Modo freezer: ate, no minimo, -18°C" e o
      // meio da especificacao do freezer do item 13 de Ponta Grossa/PR (edital
      // 13), que terminava ali, cortado pela propria marca.
      if (umaPalavra && /^\s*(?:\([^)]{0,12}\)\s*)?:/.test(onde.slice(k0 + a.length, k0 + a.length + 18))) { de = k0 + a.length; continue; }
      const k = recuaPrefixo(k0);
      if (!porPos.has(k)) porPos.set(k, []);
      porPos.get(k).push(i);
      if (umaPalavra && /;\s+$/.test(secoes.slice(Math.max(0, k - 3), k))) marcaFraca(k, i);
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
                                     itens[i][0], numeroDaLinhaAntes, p => !naPesquisaDePreco(p));
      if (pos < 0) continue;
      const posL = recuaPrefixo(pos);
      if (!porPos.has(posL)) porPos.set(posL, []);
      porPos.get(posL).push(i);
      // Depois de ponto final a marca abre linha de verdade, mesmo que de outra
      // copia da tabela: "...assistencia tecnica autorizada. | Lavadora de alta
      // pressao" (Diamante D'Oeste/PR). Tirada, a chaleira do item 11 levava a
      // lavadora do 12 junto.
      if (!/[.!?]\s+$/.test(secoes.slice(Math.max(0, posL - 3), posL))) marcaFraca(posL, i);
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

  // Quarta via: a abertura de linha COMPLETA, com o numero do item.
  //
  // Quando o edital chama o produto por outro nome, nenhuma das vias acima acha
  // a linha: o item 11 de Renascenca/PR e "Refrigerador Duplex" no PNCP e
  // "GELADEIRA FRENCH DOOR" no edital, o 26 de Mariopolis/PR e "Refrigerador
  // Domestico" no PNCP e "Geladeira / refrigerador" no edital. So que a linha
  // abre com o numero do item, o codigo ou a quantidade e a unidade — "11 470946
  // 1 UN GELADEIRA", "26 5,0 UND Geladeira" —, e essa sequencia inteira nao
  // acontece por acaso. Mesmo assim a cabeca da linha precisa ter uma palavra
  // do rotulo, para que um desencontro de numeracao entre o PNCP e o edital nao
  // ponha a especificacao de outro produto no item.
  // Tambem numero e dois codigos antes do nome em caixa alta: "01 633460 121720
  // FOGAO GAS 04 BOCAS" em Ponta Grossa/PR, onde o PNCP chama o item 1 de "Forno
  // A Gas Para Cozinha".
  // E numero e codigo de quatro digitos antes do nome em caixa alta fechado por
  // ponto e virgula: "26 8720 PROCESSADOR DE ALIMENTO; INDUSTRIAL,
  // MULTIPROCESSADOR DE ALIMENTOS" em Campinas/SP.
  // E numero e um codigo de catalogo antes do nome com inicial maiuscula, logo
  // depois do fim da linha de cima (ponto ou preco): "...7.526,80 13 274935
  // Extrator de suco; corpo em aco inoxidavel" (Nova Esperanca/PR), o
  // "Espremedor Fruta" do PNCP. Nunca depois da contagem de folhas: "15 de 24 2
  // 306105 Unidade (UN) com 1 Unidade" e a coluna do modelo do Compras.gov.br
  // quebrando a pagina no meio da especificacao (Vicosa/MG).
  // E o numero depois das linhas de preencher da proposta: "Unidade 2.721,3800
  // 1,00 _______________ _____________ 19 Estufa eletrica para aquecimento de
  // marmitas" (UFSM, Santa Maria/RS, edital 235), o "Aquecedor De Marmita" do
  // PNCP. E o numero com zeros, o codigo e um travessao: "0007 414334 - OSMOSE
  // REVERSA PARA PURIFICACAO DE AGUA - APARELHO..." (Florianopolis/SC, edital
  // 149), o "Aparelho Purificador De Agua" do PNCP.
  const LINHA_NUMERADA = n => new RegExp('(?:(?:^|\\s)0*' + n + '\\s+(?:\\d{4,9}\\s+\\d{1,5}\\s+(?:UNIDADES?|UNID|UND|UN)\\.?\\s+|\\d{1,4},\\d{1,2}\\s+(?=(?:UNIDADES?|UNID|UND|UN)\\.?\\s)|\\d{5,9}\\s+\\d{5,9}\\s+(?=[A-Z\\u00c0-\\u00da]{3,})|\\d{4}\\s+(?=[A-Z\\u00c0-\\u00da]{4,}[A-Z\\u00c0-\\u00da ]*;))|(?:(?<=[.;]\\s)|(?<=\\d,\\d{2}\\s))0*' + n + '\\s+\\d{5,9}\\s+(?!Unidade\\b)(?=[A-Z\\u00c0-\\u00da][a-z\\u00e0-\\u00ff]{3,})|(?<=_{5,}\\s)0*' + n + '\\s+(?=[A-Z\\u00c0-\\u00da][a-z\\u00e0-\\u00ff]{3,})|(?:^|\\s)0*' + n + '\\s+\\d{5,9}\\s+-\\s+(?=[A-Z\\u00c0-\\u00da]{3,}))(?=[A-Z\\u00c0-\\u00da])', 'g');
  itens.forEach((it, i) => {
    if (!Number.isInteger(it[0])) return;
    if ([...porPos].some(([p, l]) => l.includes(i) && numeroDaLinhaAntes(p) === it[0])) return;
    const alvo = palavrasDoItem(it[1]).filter(w => !/^[0-9]/.test(w));
    for (const m of secoes.matchAll(LINHA_NUMERADA(it[0]))) {
      const pos = m.index + m[0].length;
      if (numeroDaLinhaAntes(pos) !== it[0]) continue;
      const cab = new Set(fatiaTexto(secoes.slice(pos, pos + CABECA)).map(limpaNum));
      // Com o plural: "Maquina Lavar Roupa" no PNCP e "30 13440 Lavadora
      // semiautomatica de roupas tipo tanquinho" (Pinhal de Sao Bento/PR).
      if (!alvo.some(w => cab.has(w) || cab.has(w + 's') || cab.has(w + 'es'))) continue;
      if (!porPos.has(pos)) porPos.set(pos, []);
      if (!porPos.get(pos).includes(i)) porPos.get(pos).push(i);
    }
  });

  // Via da QUANTIDADE: numero do item, codigo, titulo em caixa alta, unidade e a
  // quantidade que o PNCP informa para o item. "85 601114 REFRIGERADOR - MINI
  // CAMARA PARA CONGELADOS - 02 PORTAS - CAPACIDADE APROXIMADA DE 1.900 LITROS
  // UNIDADE 10 R$ 19.263,27" (Bento Goncalves/RS) e o item 85, que o catalogo do
  // PNCP chama de "Conjunto Camara Fria" — nenhuma palavra em comum para as
  // outras vias, mas numero e quantidade juntos nao coincidem por acaso.
  itens.forEach((it, i) => {
    if (!Number.isInteger(it[0]) || !Number.isInteger(it[2])) return;
    if ([...porPos].some(([p, l]) => l.includes(i) && numeroDaLinhaAntes(p) === it[0])) return;
    const re = new RegExp('(?:^|\\s)0*' + it[0] + '\\s+\\d{4,9}\\s+(?=[A-Z\\u00c0-\\u00da][^a-z\\u00e0-\\u00ff]{3,200}?\\s(?:UNIDADES?|UNID|UND|UN|CONJUNTO|CONJ|PAR|KIT|JOGO)\\s+0*' + it[2] + '\\s+R\\$)', 'g');
    for (const m of secoes.matchAll(re)) {
      const pos = m.index + m[0].length;
      if (!porPos.has(pos)) porPos.set(pos, []);
      if (!porPos.get(pos).includes(i)) porPos.get(pos).push(i);
    }
  });

  // A quantidade no FIM da linha, como no modelo da AGU: "6 Juicer
  // Especificacoes: Centrifuga de Alimentos tipo juicer... 486489 Unidade 01 R$
  // 709,90" (Botucatu/SP). O PNCP chama o item 6 de "Multiprocessador
  // Alimentos" e o edital de "Juicer", entao nenhuma via por palavra acha a
  // linha; e o numero dela vem logo depois dos valores da linha de cima — ou do
  // cabecalho da folha, quando a folha vira entre as duas. Vale com o numero
  // do item abrindo e, no fim da mesma linha, a quantidade que o PNCP informa.
  itens.forEach((it, i) => {
    if (!Number.isInteger(it[0]) || !Number.isInteger(it[2])) return;
    if ([...porPos].some(([p, l]) => l.includes(i) && numeroDaLinhaAntes(p) === it[0])) return;
    const re = new RegExp('(?:R\\$\\s*[\\d.]+,\\d{2}|Inova[\\u00e7c][\\u00e3a]o\\s+\\d{1,3}\\s+de\\s+\\d{1,3})\\s+0*' + it[0] + '\\s+(?=[A-Z\\u00c0-\\u00da][a-z\\u00e0-\\u00ff]{2,})', 'g');
    for (const m of secoes.matchAll(re)) {
      const pos = m.index + m[0].length;
      if (numeroDaLinhaAntes(pos) !== it[0]) continue;
      // e o preco unitario do PNCP logo depois da quantidade: numero e quantidade
      // coincidem por acaso numa tabela comprida, os tres juntos nao.
      const fimDaLinha = secoes.slice(pos, pos + 3000).match(/\s\d{4,9}\s+(?:Unidades?|UNIDADES?|Und|UND|Un|UN)\s+0*(\d{1,5})\s+R\$\s*([\d.]+,\d{2})/);
      if (!fimDaLinha || +fimDaLinha[1] !== it[2]) continue;
      if (typeof it[4] !== 'number' || Math.abs(+fimDaLinha[2].replace(/\./g, '').replace(',', '.') - it[4]) > 0.011) continue;
      if (!porPos.has(pos)) porPos.set(pos, []);
      if (!porPos.get(pos).includes(i)) porPos.get(pos).push(i);
    }
  });

  // A mesma prova pela quantidade, sem numero de linha: o nome do produto e, logo
  // depois da descricao, a unidade com a quantidade do PNCP. Em Sao Paulo/SP
  // (edital 1081) os grupos recomecam a numeracao, e o ventilador do item 5 e o
  // "1 Ventiladores de Coluna - 50cm ... Unidade 180" do Grupo 02. So para quem
  // nao tem marca nenhuma, e com duas palavras do rotulo na descricao.
  {
    const comMarca = new Set();
    for (const l of porPos.values()) for (const j of l) comMarca.add(j);
    itens.forEach((it, i) => {
      if (comMarca.has(i) || !Number.isInteger(it[2]) || it[2] < 2) return;
      const nome = (normIgual(it[1]).replace(GENERICAS, '').split(/[,;:]/)[0].match(/[a-z]{5,}/) || [''])[0];
      if (nome.length < 5) return;
      const alvo = palavrasDoItem(it[1]).filter(w => !/^[0-9]/.test(w));
      // Todas as palavras do NOME, antes do primeiro campo, tem de estar na
      // descricao: "Carrinho Distribuicao material bandeja: ..." nao e o
      // "Carrinho plataforma para transporte de cargas" de Ponta Grossa/PR, por
      // mais que os dois sejam de chapa de aco e venham em 6 unidades.
      const nomeInteiro = normIgual(it[1]).split(/\s+(?:material|tipo|capacidade|caracteristicas|cor|potencia|tensao|voltagem|aplicacao|modelo|largura|altura|comprimento|diametro|quantidade|acabamento|funcionamento|componentes|sistema|frequencia|temperatura|peso|dimensoes|vazao|consumo|acionamento|rotacao|garantia|normas|funcoes|faixa|acessorios)\b[^:]{0,30}:\s/)[0].replace(GENERICAS, '');
      const doNome = (nomeInteiro.match(/[a-z]{4,}/g) || []).filter(w => !VAZIAS.has(w));
      const QTD = new RegExp('(?:^|\\s)(?:Unidade|UNIDADE|UNID\\.?|Unid\\.?|UN|Un|UND|Und)\\s+0*' + it[2] + '(?=\\s|$)');
      for (let k = plano.indexOf(nome); k >= 0; k = plano.indexOf(nome, k + 1)) {
        if (k > 0 && /[a-z0-9]/.test(plano[k - 1])) continue;
        if (!/[A-ZÀ-Ú]/.test(secoes[k])) continue;
        const trecho = secoes.slice(k, k + 700);
        const q = QTD.exec(trecho);
        if (!q) continue;
        const cab = new Set(fatiaTexto(trecho.slice(0, q.index)).map(limpaNum));
        if (alvo.filter(w => cab.has(w)).length < 2) continue;
        if (!doNome.every(w => [...cab].some(c => c.startsWith(w)))) continue;
        const pos = recuaPrefixo(k);
        if (!porPos.has(pos)) porPos.set(pos, []);
        if (!porPos.get(pos).includes(i)) porPos.get(pos).push(i);
      }
    });
  }

  // A mesma abertura de linha nas outras copias da tabela. Diamante D'Oeste/PR
  // publica a especificacao tres vezes; a lavadora de alta pressao do item 12 so
  // tinha marca na primeira copia, e nas outras duas a chaleira do item 11
  // seguia por cima da linha dela — e, mais comprida, ganhava. Sessenta
  // caracteres iguais do comeco da linha nao se repetem por acaso.
  {
    // So entre aberturas depois de ponto final, que e como essas copias sem
    // numero de linha separam um produto do outro; em tabela com colunas o
    // mesmo comeco repetido leva preco e quantidade da copia de baixo.
    const depoisDePonto = p => /[.]\s+$/.test(secoes.slice(Math.max(0, p - 3), p));
    const ja = new Set(porPos.keys());
    for (const [p, l] of [...porPos]) {
      const cabeca = secoes.slice(p, p + 60);
      if (cabeca.length < 60 || !/^[A-ZÀ-Ú][a-zà-ÿ]/.test(cabeca) || !depoisDePonto(p) || naPesquisaDePreco(p)) continue;
      for (let k = secoes.indexOf(cabeca); k >= 0; k = secoes.indexOf(cabeca, k + 1)) {
        // Na copia o ponto pode ter caido: "...assistencia tecnica autorizada
        // Lavadora de alta pressao" (a segunda copia de Diamante D'Oeste/PR).
        if (k === p || ja.has(k) || naPesquisaDePreco(k)
            || !(depoisDePonto(k) || /[a-zà-ÿ]\s+$/.test(secoes.slice(Math.max(0, k - 3), k)))) continue;
        porPos.set(k, [...l]);
        ja.add(k);
      }
    }
  }

  // A marca fraca de quem ja tem a linha confirmada pelo numero sai. Em
  // Campinas/SP a busca por proximidade pos o multiprocessador do item 26 em
  // "...CAPACIDADE DA TIGELA DE 4,7 A 7 | LITROS APROXIMADAMENTE", e o nome
  // "TIGELA" dos itens 31 e 42 marcava "...ALUMINIO FUNDIDO; | TIGELA EM ACO
  // INOX" — as duas no meio da linha da batedeira do item 2, que saia cortada.
  // As linhas "26 8720 PROCESSADOR DE ALIMENTO;" e "42 8720 TIGELA;" existem.
  for (const [pos, i] of fracas) {
    const l = porPos.get(pos);
    if (!l || !l.includes(i) || numeroDaLinhaAntes(pos) === itens[i][0]) continue;
    if (![...porPos].some(([p, m]) => p !== pos && m.includes(i) && numeroDaLinhaAntes(p) === itens[i][0])) continue;
    l.splice(l.indexOf(i), 1);
    if (!l.length) porPos.delete(pos);
  }

  // Quinta via: a linha que ABRE com o nome do produto, sem numero nenhum.
  //
  // Em Diamante D'Oeste/PR a tabela saiu sem a coluna do numero e da
  // quantidade, e as descricoes vem uma atras da outra: "...garantia minima de
  // 12 meses contra defeitos de fabricacao Geladeira dupex, Frost Free,
  // capacidade minima 480 litros..." e "...material equivalente. Televisor
  // Smart TV LED...". O catalogo do PNCP chama a geladeira de "Refrigerador
  // Duplex" e a secadora de "Maquina Secar Roupa", entao nenhuma ancora achava
  // essas linhas, e o forno do item 3 saia com a geladeira e a secadora dentro.
  //
  // A abertura e o nome com a inicial maiuscula depois de fim de frase ou de
  // palavra minuscula — a linha anterior termina sem ponto —, e o nome tem de
  // ser da CLASSE de algum item do edital. Marca para todos os itens daquela
  // classe que nao tem a linha confirmada pelo numero: a escolha entre as
  // candidatas continua com as regras de sempre, e a capacidade decide entre
  // duas maquinas de lavar iguais.
  const classeDoItem = itens.map(it => classeDoRotulo(it[1]));
  const classesDoEdital = new Set(classeDoItem.filter(Boolean));
  // Depois de palavra toda minuscula ("fabricacao Geladeira dupex"): "Unid Caixa
  // de Ferramentas" (Sao Jose da Boa Vista/PR) nao abre linha. E ai, quando o
  // nome nao e de uma classe conhecida, ele tambem segue em minuscula.
  // Tambem depois do subtitulo numerado: "3.2.4. Item 04: Micro-ondas 30 litros
  // Prata" (Valinhos/SP), em que o catalogo diz "Forno Microondas".
  const ABRE_NOME = /(?:(?<=[.;])|(?<=\bItem)|(?<=\bItem\s+\d{1,3}\s*:)|(?<=(?:^|\s)[a-zà-ÿ]+))\s+(?=[A-ZÀ-Ú][a-zà-ÿ])/g;
  const CONHECIDAS = new Set(CLASSES.map(x => x[0]));
  const aberturasPorClasse = new Map();
  for (const m of secoes.matchAll(ABRE_NOME)) {
    const pos = m.index + m[0].length;
    const c = classeDoInicio(plano.slice(pos, pos + 40));
    // So as classes com sinonimo conhecido. A palavra solta como classe marcava
    // "...condensacao da porta; Camara com isolamento termico" para a camara fria
    // de Bento Goncalves/RS e cortava a especificacao do forno combinado ali.
    if (!c || !classesDoEdital.has(c) || !CONHECIDAS.has(c)) continue;
    // Nome citado no meio da frase nao abre linha: "jarra de Liquidificador",
    // "Refrigerador tipo Frigobar".
    if (/(?:^|[^a-z])(?:de|da|do|das|dos|e|ou|com|sem|para|em|no|na|um|uma|o|a|os|as|ao|tipo|como|pelo|pela)\s+$/.test(plano.slice(Math.max(0, pos - 14), pos))) continue;
    if (!aberturasPorClasse.has(c)) aberturasPorClasse.set(c, []);
    aberturasPorClasse.get(c).push(pos);
  }
  // So para o item que nao tem marca NENHUMA. Cada marca nova fecha a celula de
  // quem vem antes, e dar marca por classe a itens que ja tinham a sua linha
  // cortava celulas certas pelo meio em nove editais — "Split Hi-Wall" no meio
  // da especificacao de um ar-condicionado, "Caixa" no meio de uma lista.
  // Marca no meio de frase nao conta: ela cai no filtro logo abaixo, e o item de
  // Diamante D'Oeste/PR que so tinha uma dessas ficava sem marca nenhuma.
  // Tambem depois de travessao: "1 Bebedouro Industrial — bebedouro industrial
  // de coluna, com 2 saidas" (Luz/MG) e o nome repetido na descricao, e a marca
  // ali deixava a linha com as duas palavras do titulo e mais nada.
  // E dentro de lista: depois de marcador ("Caracteristicas minimas: ● Balanca
  // eletronica digital de plataforma") ou, em minuscula, depois de dois-pontos
  // ("• Tipo: aquecedor de agua a gas de passagem"), ambos em Bento
  // Goncalves/RS. A marca ali partia a especificacao do proprio item, que saia
  // terminando em "Caracteristicas minimas: ●".
  // Minuscula tambem depois de numero solto no meio da frase ("Possuir, no
  // minimo, 02 bicos/torneiras", "Acompanhar, no minimo, 01 grelha") e depois
  // de artigo ("OBS.: A grelha devera possuir"); e depois de ponto e virgula,
  // mesmo em maiuscula, e o proximo elemento da lista ("...alimentos
  // refrigerados; Freezer capaz de operar"). Todos em Bento Goncalves/RS, onde
  // cada uma dessas marcas cortava a especificacao de outro item no meio.
  const noMeioDaFrase = p => {
    const antes = secoes.slice(Math.max(0, p - 16), p);
    if (/^[a-zà-ÿ]/.test(secoes.slice(p, p + 1)) && (/(?:[a-zà-ÿ,:]|[—–])\s+$/.test(antes)
        || /[a-zà-ÿ,:]\s+\d{1,3}\s+$/.test(antes) || /(?:^|[\s.:;])[AO]\s+$/.test(antes))) return true;
    // Em caixa alta, o artigo ou a preposicao entre duas palavras: "PERMITE
    // ADICIONAR INGREDIENTES A | TIGELA DURANTE O PREPARO" (Campinas/SP) e a
    // batedeira falando da tigela, nao a linha da tigela dos itens 31 e 42.
    if (/^[A-ZÀ-Ú]{3}/.test(secoes.slice(p, p + 3))
        && /[A-ZÀ-Ú]{3,}\s+(?:A|O|AS|OS|AO|DE|DA|DO|DAS|DOS|NA|NO|EM|COM|SEM|PARA|PELA|PELO)\s+$/.test(secoes.slice(Math.max(0, p - 30), p))) return true;
    // O ponto e virgula nao vale para a abertura pelo nome da classe: em Diamante
    // D'Oeste/PR a linha da poltrona termina em "...para o piso;" e a da
    // fritadeira comeca logo depois.
    return /[●•]\s*$/.test(antes) || (/[a-zà-ÿ)];\s+$/.test(antes) && !marcasDeClasse.has(p));
  };
  const temMarca = new Set();
  const marcasDeClasse = new Set();
  for (const [p, l] of porPos) if (!noMeioDaFrase(p)) for (const i of l) temMarca.add(i);
  itens.forEach((it, i) => {
    const c = classeDoItem[i];
    if (!c || !aberturasPorClasse.has(c) || temMarca.has(i)) return;
    for (const pos of aberturasPorClasse.get(c)) {
      if (!porPos.has(pos)) porPos.set(pos, []);
      if (!porPos.get(pos).includes(i)) porPos.get(pos).push(i);
      marcasDeClasse.add(pos);
    }
  });
  // Sexta via, para o item que continua sem marca valida: o NOME do produto, a
  // primeira palavra do rotulo, em caixa alta logo depois do codigo de catalogo
  // — "4) 295556 142029 REFRESQUEIRA INDUSTRIAL, nova, de primeiro uso". O item
  // 11 de Ponta Grossa/PR (edital 13) so casava na pesquisa de precos, e o termo
  // numera a segunda tabela a partir de 1. Vale so com uma ocorrencia assim no
  // edital inteiro e com a palavra de nenhum outro rotulo.
  const comMarcaValida = new Set();
  for (const [p, l] of porPos) if (!noMeioDaFrase(p) && !naPesquisaDePreco(p)) for (const i of l) comMarcaValida.add(i);
  itens.forEach((it, i) => {
    if (comMarcaValida.has(i)) return;
    const w = (normIgual(String(it[1])).match(/[a-z]+/) || [''])[0];
    if (w.length < 6 || /^(?:aparelho|equipamento|conjunto|maquina|material|produto)$/.test(w)) return;
    if (itens.some((jt, j) => j !== i && normIgual(String(jt[1])).includes(w))) return;
    const achados = [];
    for (const m of plano.matchAll(new RegExp('(?<=\\b\\d{5,9}\\s+)' + w + '\\b', 'g'))) {
      const original = secoes.slice(m.index, m.index + w.length);
      if (original === original.toUpperCase() && !naPesquisaDePreco(m.index)) achados.push(m.index);
    }
    if (achados.length !== 1) return;
    if (!porPos.has(achados[0])) porPos.set(achados[0], []);
    if (!porPos.get(achados[0]).includes(i)) porPos.get(achados[0]).push(i);
  });

  // Marca no MEIO DE UMA FRASE nao abre celula: minuscula logo depois de palavra
  // ou virgula e continuacao do texto de cima. A busca por proximidade marcou o
  // item 38 de Bento Goncalves/RS em "...adequada ao uso continuo em | cozinha
  // profissional; ● Filtros metalicos", e essa marca cortava a propria celula
  // verdadeira ao meio. O serve() ja recusaria o trecho que comeca assim; o
  // estrago era so o corte que ela fazia no vizinho.
  const posicoes = [...porPos.keys()].sort((a, b) => a - b).filter(p => {
    const meioDeFrase = noMeioDaFrase(p);
    if (meioDeFrase) porPos.delete(p);
    return !meioDeFrase;
  }).filter((p, k, lista) => {
    // O titulo da linha e a especificacao dela, separados so pela unidade e pelos
    // precos: "04 618525 APARELHO DE AR-CONDICIONADO TIPO SPLIT HI-WALL - 12.000
    // BTU/H UNIDADE 72 R$ 2.013,00 R$ R$ 144.936,00 | Aparelho de
    // ar-condicionado tipo Split Hi-Wall, com capacidade..." (Bento
    // Goncalves/RS). A marca no comeco da especificacao partia a linha em duas, o
    // titulo ficava confirmado pelo numero e ganhava, e os aparelhos saiam so com
    // o titulo. Sendo do mesmo item, a segunda marca sai e a linha fica inteira.
    // A anterior e a ultima que FICOU: se o titulo ja engoliu uma marca, a
    // especificacao se junta a ele, e nao a marca que saiu ("78 601112
    // REFRIGERADOR - | FREEZER HORIZONTAL 02 PORTAS - 530 LITROS UNIDADE 18 R$...
    // | Freezer horizontal de grande capacidade", Bento Goncalves/RS).
    const ant = lista.slice(0, k).reverse().find(q => porPos.has(q));
    if (ant === undefined) return true;
    const entre = secoes.slice(ant, p);
    // Tambem o titulo em caixa alta logo antes da especificacao, sem unidade
    // nem preco no meio: "1 11127 AR CONDICIONADO SPLIT 12.000 BTUS QUENTE/FRIO
    // | Ar Condicionado. Sistema de geracao quente/frio..." e "2 11128 AR
    // CONDICIONADO SPLIT 18.000 BTUS QUENTE/FRIO Especificacoes: | Ar
    // Condicionado." (Pinhal de Sao Bento/PR). Partida, a linha saia "FRIO Ar
    // Condicionado..." num item e so com o titulo no outro. So quando o titulo
    // abre com o numero do item e a especificacao nao tem numero proprio.
    // Nem quando a especificacao repete o titulo: ai o titulo e so a primeira
    // copia do mesmo texto ("BLOCO DIGESTOR, TEMPERATURA: ... | BLOCO DIGESTOR,
    // TEMPERATURA: ...", Montes Claros/MG).
    const soLetras = x => normIgual(x).replace(/[^a-z0-9]+/g, ' ').trim();
    const tituloSo = /^[^a-zà-ÿ]{3,100}(?:Especifica[çc][õo]es\s*:?\s*)?$/.test(entre)
      && porPos.get(ant).some(i => numeroDaLinhaAntes(ant) === itens[i][0]) && numeroDaLinhaAntes(p) === null
      && !(soLetras(entre).length >= 40 && soLetras(secoes.slice(p, p + 400)).includes(soLetras(entre)));
    if (!tituloSo && !/^[^a-zà-ÿ]{3,160}UNIDADE\s+\d{1,4}\s+R\$\s*[\d.]+,\d{2}\s+(?:R\$\s*)+[\d.]+,\d{2}\s*$/.test(entre)) return true;
    if (!porPos.get(p).some(i => porPos.get(ant).includes(i))) return true;
    porPos.delete(p);
    return false;
  });

  // Cada posicao vira um trecho: da marca ate a marca seguinte.
  //
  // O timbre sai ANTES dos cortes. As regras de rodape antigas tiram pedacos
  // dele — o CEP, o CNPJ, o "PREFEITURA MUNICIPAL DE" —, e o que sobra ja nao
  // casa com o timbre aprendido: em Santo Antonio do Caiua/PR o endereco
  // inteiro ficava na celula depois de a regra do CEP levar so o numero.
  const timbres = timbresDoEdital(secoes);
  // A primeira palavra do rotulo de cada item, para reconhecer a LINHA SEGUINTE
  // quando o numero dela nao bate com o do PNCP: em Apiai/SP o edital numera
  // "09 TANQUINHO", "10 VENTILADOR" e o PNCP 9 relogio, 10 tanquinho, e o
  // micro-ondas do item 8 seguia pelos tres.
  const GENERICAS_DE_ROTULO = new Set(['aparelho', 'equipamento', 'conjunto', 'maquina', 'material', 'produto']);
  const primeiras = new Set(itens.map(it => (normIgual(String(it[1])).match(/[a-z0-9]+/) || [''])[0])
    .filter(w => w.length >= 4 && !/^\d/.test(w) && !GENERICAS_DE_ROTULO.has(w)));
  const cortaNoVizinho = t => {
    const minha = (normIgual(t).match(/[a-z]{3,}/) || [''])[0];
    // Em caixa alta, com seis letras ou mais: "...cor branca 09 TANQUINHO".
    // Com so a inicial maiuscula, so logo depois de fim de frase: "...garantia
    // minima 12 meses. 19 Mesa branca em polipropileno" (Nova Esperanca/PR).
    const re = /(?:\s\d{1,3}\s+([A-ZÀ-Ú]{6,})|(?<=[.;])\s+\d{1,3}\s+([A-ZÀ-Ú][a-zà-ÿ]{3,}))(?![A-Za-zÀ-ÿ])/g;
    for (const m of t.matchAll(re)) {
      if (m.index < 40) continue;
      const w = normIgual(m[1] || m[2]);
      if (m[1] && w.length < 6) continue;
      if (primeiras.has(w) && w !== minha) return t.slice(0, m.index + (t[m.index] === '.' || t[m.index] === ';' ? 1 : 0));
    }
    return t;
  };
  const trechos = posicoes.map((pos, k) => {
    const proxima = k + 1 < posicoes.length ? posicoes[k + 1] : secoes.length;
    const fim = Math.min(proxima, pos + TETO_ITEM, secoes.length);
    // O cabecalho da AGU sai antes do timbre aprendido: ele vem em duas versoes,
    // o detector aprende as pontas de cada uma e deixaria o miolo para tras.
    const cru = tiraTimbre(secoes.slice(pos, fim).replace(/\s+/g, ' ').replace(CABECALHO_AGU, ' ').replace(CABECALHO_HASH, ' ').trim(), timbres)
      // A linha que a virada de folha partiu: as colunas de unidade, quantidade
      // e preco fecham a linha na folha de cima, e a celula continua na de
      // baixo depois do numero da folha e do cabecalho repetido da tabela.
      // "...Saude: Remove 99% UND 5 R$ 12.900,00 R$ 64.500,00 25 Ord. Cota
      // Descricao Und Qtd Valor Unit. Valor Total das bacterias do ar - ..."
      // (Ivaipora/PR, 16/09/2026). Costura quando o que vem depois do
      // cabecalho continua a frase, em minuscula.
      .replace(/\s(?:UND|UN|Und|und|Unid\.?)\s+\d{1,5}\s+R\$\s*[\d.]*,\d{2}\s+R\$\s*[\d.]*,\d{2}\s+\S{1,4}\s+(?:[\p{L}.]+\s+){2,10}?Valor\s+Total\s+(?=[a-zà-ÿ(])/gu, ' ')
      // A folha que vira DEPOIS dos valores da linha, com o fim da celula na
      // folha seguinte: "...Garantia minima de 12 meses 608748 Unidade 05 R$
      // 579,97 R$ 2.899,85 UASG 102315 [cabecalho da AGU] Marca/Modelo de
      // Referencia ou equivalente: Batedeira Planetaria Oster Bowl Inox III,
      // OBAT641" (Botucatu/SP, item 2). Os valores fecham a linha e a referencia
      // ficava de fora; ela toma o lugar deles, sem o numero do item seguinte
      // que fecha o trecho. So no FIM do trecho e curta: numa copia sem a marca
      // do item 3 o "fim" seria a linha inteira do mixer.
      .replace(/\s\d{5,6}\s+Unidade\s+\d{1,5}\s+R\$\s*[\d.]*,\d{2}\s+R\$\s*[\d.]*,\d{2}\s+(?:UASG\s+\d{4,6}\s+)?(?:\d{1,3}\s+)?(Marca\/Modelo\s+de\s+refer[êe]ncia\b[^]{0,200}?)(?:\s+\d{1,3})?$/i, ' $1')
      // O mesmo com as colunas na ordem quantidade, unidade e precos, e o que
      // sobra do rodape e do cabecalho da folha — so numero e sinal, nenhuma
      // palavra — antes da continuacao em minuscula: "...com sistema de
      // turbilhonamento, estrutura 8 UN R$ 554,74 R$ 4.437,92 25 ° 221/26
      // resistente e painel de facil operacao..." (Avare/SP, item 26, 22/09/2026).
      // Com palavra no meio nao costura: pode ser o numero e o nome do item
      // seguinte ("27 FOGAO: fogao de piso"). O numero da folha so sai quando
      // nao e medida: "...minima de 40 UN R$ ... 42 1,7 litros" perde o 42 e
      // guarda o 1,7; "... 10 kg" guarda o 10 (Sao Joao do Triunfo/PR).
      .replace(COSTURA_MINUSCULA, ' ')
      // A frase aberta antes das colunas (dois-pontos, virgula, preposicao)
      // continua mesmo em maiuscula: onde as colunas ficam no meio da altura da
      // linha, o texto sai "...57,96 cm; Funcionamento: Unid. 5 R$ 1.936,25 R$
      // 9.681,25 Gas; Capacidade do Forno..." (Borrazopolis/PR, item 73).
      .replace(COSTURA_ABERTA, ' ')
      // E o cabecalho da tabela repetido no alto da folha seguinte: "...
      // congelador separados). UN 3 R$ 6.377,33 R$ 19.131,99 “Deus Seja
      // Louvado” Item Descricao Unid. Quant . Media Total (unitaria) Media total
      // Classificacao de eficiencia..." (Pariquera-Acu/SP, item 3).
      .replace(COSTURA_CABECALHO, ' ')
      .replace(COSTURA_PAGINA, ' ');
    // cortaOrcamento aqui tambem, e nao so no fim: a celula e julgada pelo
    // tamanho e pelo fecho, e o preco e a dotacao grudados atrapalhavam o
    // julgamento (o ventilador de Serrana/SP terminava em "Atencao Basica 13")
    const t = cortaOrcamento(limpaCelula(cortaNoVizinho(cortaNaProximaLinha(cru)), timbres));
    // Celula que para no PULO DE PAGINA no meio da frase esta cortada: a folha
    // seguinte, onde ela continuava, nao entrou no texto. Melhor sem descritivo
    // — ou com outra copia inteira da mesma linha — do que com "...compativel
    // com o fluxo de", como ficava o bebedouro de Luz/MG.
    const iPulo = cru.indexOf('‖‖');
    if (iPulo >= 0 && t && cru.indexOf(t.slice(-30)) + 30 >= iPulo - 40 && ACABA_NO_MEIO.test(t)) return '';
    return t;
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
    const cabecas = quais.filter(k => (trechos[k] || "").length >= MINIMO && !naPesquisaDePreco(posicoes[k])).map(k => {
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

    // A CAPACIDADE pequena, que nao vira token por ter dois digitos: as duas
    // maquinas de lavar de Diamante D'Oeste/PR sao "capacidade: 17 a 18" e
    // "capacidade: 11" no PNCP, e as linhas do edital dizem "capacidade minima
    // de 17 kg" e "de 10 kg". Pelas palavras as duas empatam. Vale como veto
    // entre produtos da MESMA classe: a linha que anuncia a capacidade de outro
    // item — ou uma capacidade diferente, quando outra candidata anuncia a
    // deste — e do outro.
    const capMinhas = capacidadesDoRotulo(rotulo);
    const btuMeu = btusDe(rotulo);
    const bocasMinhas = bocasDe(rotulo);
    const capAlheias = new Set();
    itens.forEach((jt, j) => {
      if (j === i || classeDoItem[j] !== classeDoItem[i]) return;
      for (const v of capacidadesDoRotulo(jt[1])) if (!capMinhas.has(v)) capAlheias.add(v);
    });
    const capCab = cabecas.map(x => capacidadesDoTexto(x.t.slice(0, CABECA_ESCOLHA)));
    const alguemCapMeu = capMinhas.size > 0 && capCab.some(cs => [...cs].some(v => capMinhas.has(v)));

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
    // O numero que o EDITAL usa, quando o rotulo do PNCP o traz na frente:
    // em Viamao/RS o item 1 do PNCP e o "3 - Fogao Industrial com 04 Bocas" do
    // edital, e a linha do item 1 (seis bocas) levava o descritivo errado
    // (22/09/2026). So quando o prefixo discorda do numero do PNCP; se nenhuma
    // linha abrir com ele, o numero nao decide nada e vale a palavra.
    const mNumRot = /^\s*(\d{1,3})\s*[-–]\s*(?=\p{L})/u.exec(String(itens[i][1] || ''));
    const meuNumero = mNumRot && +mNumRot[1] !== itens[i][0] && numLinha.includes(+mNumRot[1]) ? +mNumRot[1] : itens[i][0];
    const achouMinhaLinha = numLinha.some(n => n === meuNumero);

    let vencedor = '', nota = -1, venceuPeloNumero = false, numeroVencedor = null, kVencedor = -1;
    const avaliados = [];
    cabecas.forEach(({ k, t, c, nums }, idx) => {
      if (!t) return;
      // O numero confirma a linha, mas a capacidade pode desmenti-lo: em
      // Palmeiras de Goiás/GO a quantidade da linha de cima ("UN 02") parecia o
      // numero do item 2, e o ar de 12.000 BTUs levava o texto do de 18.000.
      // So BTU: litros e faixas ("400 a 480") nao desmentem nada.
      const btuCab = btusDe(t.slice(0, CABECA_ESCOLHA));
      // e as bocas do fogao desmentem do mesmo jeito (Viamao/RS, 22/09/2026)
      const bocasCab = bocasDe(t.slice(0, CABECA_ESCOLHA));
      const bocaDeOutro = bocasMinhas.size > 0 && bocasCab.size > 0 && ![...bocasCab].some(v => bocasMinhas.has(v));
      const confirmado = numLinha[idx] === meuNumero
        && !(btuMeu.size > 0 && btuCab.size > 0 && ![...btuCab].some(v => btuMeu.has(v)))
        && !bocaDeOutro;
      const doVizinho = achouMinhaLinha && !confirmado
                     && numLinha[idx] !== null && numerosDoEdital.has(numLinha[idx]);
      const temMeu = nums.some(w => meusSo.has(w));
      // Se o edital imprime o numero deste item abrindo a linha, e a linha
      // dele — nenhuma heuristica de palavra ou de capacidade desmente isso.
      const capMeu = [...capCab[idx]].some(v => capMinhas.has(v));
      const capDeOutro = capMinhas.size > 0 && capCab[idx].size > 0 && !capMeu
        && (alguemCapMeu || [...capCab[idx]].some(v => capAlheias.has(v)));
      const deOutro = confirmado ? false : (doVizinho
        || (!temMeu && alguemTemMeu)
        || capDeOutro
        || bocaDeOutro
        || (meusFortes.size > 0 && !nums.some(w => meusFortes.has(w))
            && nums.some(w => fora.has(w) && forte(w))));
      // Ordem de peso: primeiro o trecho que SERVE (as mesmas regras que o
      // gravam la embaixo) e nao e de outro item; depois o que traz o numero do
      // item impresso antes; e so entao as palavras, com as numericas pesando
      // mais. Sem a primeira camada o numero levava a escolha para um trecho
      // que ia ser recusado adiante, e o item, que tinha uma celula boa entre
      // as candidatas, acabava sem nada: foram quatro assim em Bueno Brandao/MG.
      // Meio ponto contra o trecho que diz "inverter" quando o rotulo nao diz
      // (e vice-versa). So desempata: em Serrana/SP o ar de 48.000 BTUs comum e
      // o inverter tem o mesmo rotulo fora essa palavra, os dois pegavam a
      // linha do inverter, a mais longa, e o conflito deixava os dois vazios.
      const n = (serve(rotulo, t, confirmado) && !deOutro ? 1e6 : 0)
              + (confirmado ? 1e3 : 0)
              + alvo.filter(w => c.has(w)).reduce((s, w) => s + (ehNumero(w) ? PESO_NUMERO : 1), 0)
              - (/inverter/i.test(t) !== /inverter/i.test(rotulo) ? 0.5 : 0);
      // Desempate pelo CONTEUDO, sem contar espaco, e com o mesmo conteudo fica a
      // copia de menos espacos. Vicosa/MG publica o termo de referencia em dois
      // PDFs, e num deles o gerador poe espaco no meio da palavra: "c
      // onfeccionadas", "equival ente". Pelo tamanho bruto essa copia ganhava,
      // justamente por ter um caractere a mais.
      // So quando as duas copias sao o MESMO texto sem os espacos: copias de
      // conteudo diferente seguem pelo tamanho, como sempre.
      // Numero solto tambem nao conta: "PORTA COM VIDRO DUPLO, 45 VALVULA" e a
      // copia de Trabiju/SP em que o timbre caiu no meio da linha e deixou para
      // tras o numero da folha; a outra copia, sem ele, e a boa.
      const semSolto = x => x.replace(/(?<![\w.,\/])\d{1,4}(?![\w.,\/])/g, '').replace(/\s+/g, '');
      const mesmoTexto = vencedor && semSolto(t) === semSolto(vencedor);
      avaliados.push({ k, t, n, confirmado, idx });
      if (DEPURA_ITEM && rotulo.includes(DEPURA_ITEM)) console.log('  DEPURA candidato', JSON.stringify({ n, confirmado, deOutro, serve: serve(rotulo, t, confirmado), doVizinho, capDeOutro, temMeu, alguemTemMeu, len: t.length, t: t.slice(0, 90) + ' ... ' + t.slice(-50) }));
      if (n > nota || (n === nota && (mesmoTexto ? t.length < vencedor.length : t.length > vencedor.length))) {
        nota = n; vencedor = t; venceuPeloNumero = confirmado;
        numeroVencedor = numLinha[idx]; kVencedor = k;
      }
    });
    // A COPIA MAIS COMPLETA do mesmo texto. A contagem de palavras olha so a
    // cabeca do trecho, e duas copias da mesma linha podem diferir mais adiante:
    // em Paranavai/PR (edital 178) a planilha do edital diz "Caracteristicas
    // adicionais: tampa de vidro temperado" e as quatro tabelas do termo de
    // referencia dizem "autolimpante, automatico, tampa de vidro temperado",
    // como o rotulo do PNCP. A planilha ganhava porque a palavra "tampa" caia
    // dentro da cabeca dela e fora da cabeca das outras. Vale a copia que tem
    // quase todas as palavras da vencedora, pelo menos duas palavras do rotulo
    // a mais no texto inteiro e a mesma confirmacao pelo numero.
    if (vencedor && nota >= 1e6) {
      const tokens = x => new Set(fatiaTexto(x).map(limpaNum));
      const cobre = c => alvo.filter(w => c.has(w)).length;
      const tv = tokens(vencedor), cv = cobre(tv);
      let troca = null, melhorCobre = cv;
      for (const a of avaliados) {
        if (a.t === vencedor || a.n < 1e6 || (venceuPeloNumero && !a.confirmado)) continue;
        if (a.t.length > vencedor.length * 1.6) continue;
        const ta = tokens(a.t);
        let comuns = 0;
        for (const w of tv) if (ta.has(w)) comuns++;
        if (comuns < tv.size * 0.9) continue;
        const ca = cobre(ta);
        // Duas palavras a mais, pelo menos: uma so pode ser a palavra que a
        // outra copia parte ao meio ("e xigem", "nivel adores" em Vicosa/MG).
        if (ca < cv + 2) continue;
        if (ca > melhorCobre || (troca && ca === melhorCobre && a.t.length < troca.t.length)) { troca = a; melhorCobre = ca; }
      }
      if (troca) {
        vencedor = troca.t; nota = troca.n; venceuPeloNumero = troca.confirmado;
        numeroVencedor = numLinha[troca.idx]; kVencedor = troca.k;
      }
      // A copia que o PROPRIO PNCP confirma mais longe. Quando a vencedora para
      // num ponto em que o texto do item no PNCP continua, e outra candidata
      // segue exatamente como o PNCP, a vencedora e a copia cortada: em
      // Caxambu/MG a tabela do edital traz so "...24.000 BTUs/h, ciclo quente e
      // frio" e o termo de referencia a especificacao inteira; em Pirajuba/MG a
      // copia da virada de folha parava em "(TUBULACAO DE" (22/09/2026).
      const letras = x => normIgual(x).replace(/[^a-z0-9]/g, '');
      const pn = letras(rotulo), lv = letras(vencedor), rabo = lv.slice(-30);
      const kp = rabo.length >= 20 ? pn.lastIndexOf(rabo) : -1;
      if (kp >= 0 && pn.length - (kp + rabo.length) >= 25) {
        const segue = pn.slice(kp, kp + rabo.length + 25);
        let longe = null;
        for (const a of avaliados) {
          if (a.t === vencedor || a.n < 1e6 || (venceuPeloNumero && !a.confirmado)) continue;
          const la = letras(a.t);
          if (!la.includes(segue) || la.length <= lv.length) continue;
          if (!longe || la.length < letras(longe.t).length) longe = a;
        }
        if (longe) {
          vencedor = longe.t; nota = longe.n; venceuPeloNumero = longe.confirmado;
          numeroVencedor = numLinha[longe.idx]; kVencedor = longe.k;
        }
      }
    }
    // O numero que ABRE a linha seguinte fica antes da marca dela, e portanto no
    // fim desta celula: "...ligado manualmente e com regulador de potencia 35 |
    // 165.16.27 SOPRADOR" (Salto/SP). Pelo texto ele nao pode sair — "potencia
    // 35" poderia ser a potencia —, mas quando a marca seguinte se confirmou
    // exatamente por esse numero, ele e da linha de baixo.
    if (vencedor && kVencedor + 1 < posicoes.length) {
      const p = posicoes[kVencedor + 1];
      const nProx = numeroDaLinhaAntes(p);
      // Nunca depois de "item": "IDEM AO ITEM 6" (Bento Goncalves/RS) e remissao.
      if (nProx !== null && porPos.get(p).some(j => itens[j][0] === nProx)) {
        if (!new RegExp('\\bitem\\s+0*' + nProx + '$', 'i').test(vencedor))
          vencedor = vencedor.replace(new RegExp('\\s0*' + nProx + '$'), '');
        // e o numero solto de um ou dois digitos que sobra no fim, quando nao e
        // medida — o numero da folha: "...Plastico/Aco Inoxidavel 47 | 55
        // 165.6.265 FOGAO" (Salto/SP). Quatro digitos, nao: "Desidrat Plus 1000"
        // e o modelo.
        const solto = /(\S+)\s+\d{1,2}$/.exec(vencedor);
        if (solto && !MEDIDA_ANTES.test(solto[1]) && !/^(?:item|itens|lote)$/i.test(solto[1]) && /[A-Za-zÀ-ÿ).;]$/.test(solto[1]))
          vencedor = vencedor.slice(0, solto.index + solto[1].length);
      }
    }
    // Abaixo de 1e6 nenhum trecho servia, ou o unico que servia era de outro
    // item. Melhor o item sem descritivo do que com a especificacao do vizinho.
    // O lote vale por si, mesmo quando o descritivo e recusado: ele diz COMO o
    // item se chama no pregao, nao o que ele e. Em Londrina/PR so 4 dos 9 itens
    // tinham recorte aprovado, e a tabela saia com lote em uns e numero solto em
    // outros.
    candidatosDeLote.set(i, loteDoItem(rotulo));
    // O TITULO da celula, quando a marca caiu depois dele. O Termo de Referencia
    // de Serrana/SP escreve "12 01 Unid. VENTILADOR DE PAREDE 60CM: Ventilador
    // de Parede, 170W..." e "7 06 Unid. APARELHO DE AR CONDICIONADO: Ar
    // Condicionado SPLIT 9.000 BTU'S: Aparelho de Ar Condicionado tipo Split...";
    // o recorte comecava na especificacao, e o usuario viu o item 12 "com
    // descritivo faltando" (16/09/2026). Entra so o que fica entre a coluna da
    // unidade e a celula, em ate dois pedacos terminados em dois-pontos.
    if (vencedor && nota >= 1e6 && kVencedor >= 0) {
      const antes = secoes.slice(Math.max(0, posicoes[kVencedor] - 170), posicoes[kVencedor]);
      const tit = /(?:^|\s)(?:Unid\.?|UNID\.?|UN|UND|Unidade|UNIDADE)\s+((?:[A-ZÀ-Ú][^:]{2,90}:\s*){1,2})$/.exec(antes);
      if (tit && !/\d{1,3}(?:\.\d{3})*,\d{2}/.test(tit[1]) && !vencedor.startsWith(tit[1].trim().slice(0, 20)))
        vencedor = tit[1].trim() + ' ' + vencedor;
    }
    if (DEPURA_ITEM && rotulo.includes(DEPURA_ITEM)) console.log('  DEPURA escolha', JSON.stringify({ candidatos: quais.length, cabecas: cabecas.length, nota, vencedor: String(vencedor).slice(0, 120) }));
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
  // A comparacao e pelo COMECO da celula, e nao pelo texto inteiro.
  //
  // Duas celulas que abrem com as mesmas cento e cinquenta letras sao a mesma
  // linha da tabela: o que muda depois e so ate onde cada uma foi. Em
  // Botucatu/SP o edital descreve UM multiprocessador e o PNCP lista dois, o
  // item 1 e o 6, com potencias diferentes; as duas celulas comecavam iguais e
  // seguiam por comprimentos diferentes, entao a chave pelo texto inteiro nao
  // as via como repetidas e o item 6 saia com a especificacao do item 1.
  const inicioDe = t => normIgual(t).replace(/[^a-z0-9]+/g, " ").trim().slice(0, 150);
  const porTexto = new Map();
  for (const [i, v] of melhor) {
    const chave = inicioDe(v.texto);
    if (!porTexto.has(chave)) porTexto.set(chave, []);
    porTexto.get(chave).push(i);
  }
  const soTexto = new Map();
  for (const quais of porTexto.values()) {
    // O mesmo produto publicado de novo pelo orgao, com a remissao ao item antigo
    // no fim ("... garantia: 1 Item 1"): a UFPel republicou os itens 1 a 5 como
    // 6 a 10, e os dez ficavam sem descritivo por "rotulos diferentes" (17/09/2026).
    const rotulos = new Set(quais.map(i => normIgual(itens[i][1]).replace(/[^a-z0-9]+/g, ' ').replace(/\s+item \d{1,3}\s*$/, '').trim()));
    if (rotulos.size < 2) { for (const i of quais) soTexto.set(i, melhor.get(i)); continue; }
    for (const i of quais) if (melhor.get(i).confirmado) soTexto.set(i, melhor.get(i));
    if (DEPURA_ITEM) for (const i of quais) if (itens[i][1].includes(DEPURA_ITEM) && !melhor.get(i).confirmado) console.log('  DEPURA conflito: mesmo texto de rotulos diferentes', quais.map(j => itens[j][0]));
  }
  return { textos: soTexto, lotes: lotes };
}

// A PLANILHA POR LOTE do sistema de compras de Londrina/PR, em que o texto sai
// fora de ordem: o cabecalho "Lote: 3 - Lote 3" vem DEPOIS da descricao do lote,
// e a quantidade, o preco e o titulo aparecem embaralhados antes dela —
// "...PRECO MAXIMO DO LOTE: 126.320,62 Subgrupo Cod. do Produto Quantidade 1 52
// FORNO DE MICROONDAS 30 LITROS 200.00 Unidade 647,41 129.482,00 Descricao: ...
// 12 26126 Lote: 3 - Lote 3". Nenhuma via por marca separa isso: a marca cai no
// meio, a celula leva o cabecalho do lote seguinte, e os dois refrigeradores de
// 410 L (lotes 5 e 6) saiam com a mesma linha.
//
// Aqui cada lote vai do fim do cabecalho anterior ate o seu "Lote: N", e so vale
// quando o PNCP numera os itens pelos lotes e a quantidade dele esta no bloco:
// "200.00 Unidade" no lote 3 e o item 3, de 200 unidades.
const FIM_DO_LOTE = /\s\d{1,3}\s+\d{4,6}\s+Lote:\s*(\d{1,3})\s*-\s*Lote\s*\d{1,3}/g;
const CABECALHO_DO_LOTE = /PRE[ÇC]O M[ÁA]XIMO DO LOTE:\s*[\d.]+,\d{2}(?:\s+Subgrupo\s+Cod\.\s+do\s+Produto\s+Quantidade)?/g;
const FOLHA_DO_LOTE = /P[áa]gina:\s*\d+\s+Anexo\s+\d+\s*-\s*Processo:\s*[\d\/]+/;
function celulasPorLote(secoes, itens, timbres) {
  const fins = [...secoes.matchAll(FIM_DO_LOTE)];
  const saida = new Map();
  if (fins.length < 3 || !/PRE[ÇC]O M[ÁA]XIMO DO LOTE/.test(secoes)) return saida;
  const blocos = new Map();
  let inicio = 0, sobraDoAnterior = null;
  for (const m of fins) {
    let bloco = secoes.slice(inicio, m.index);
    inicio = m.index + m[0].length;
    // O cabecalho do lote anterior e a folha nova: o que sobra entre a folha e
    // o "PRECO MAXIMO DO LOTE" e a continuacao do lote anterior (a garantia do
    // lote 5 fica na folha 2, antes do cabecalho do lote 6).
    const cabecalhos = [...bloco.matchAll(CABECALHO_DO_LOTE)];
    if (cabecalhos.length) {
      const ultimo = cabecalhos[cabecalhos.length - 1];
      const antes = bloco.slice(0, ultimo.index);
      const folha = FOLHA_DO_LOTE.exec(antes);
      if (folha && sobraDoAnterior !== null) blocos.set(sobraDoAnterior, blocos.get(sobraDoAnterior) + ' ' + antes.slice(folha.index + folha[0].length));
      bloco = bloco.slice(ultimo.index + ultimo[0].length);
    }
    const n = +m[1];
    blocos.set(n, bloco);
    sobraDoAnterior = n;
  }
  itens.forEach((it, i) => {
    const bloco = blocos.get(it[0]);
    if (!bloco || !Number.isInteger(it[2])) return;
    if (!new RegExp('(?:^|\\s)0*' + it[2] + '\\.00\\s+Unidade\\b').test(bloco)) return;
    let t = bloco
      .replace(/\s*\d{1,4}\.00\s+Unidade(?:\s+[\d.]+,\d{2,4}\s+[\d.]+,\d{2})?/g, ' ')
      .replace(/(?:^|\s)\d{1,3}\s+\d{2}\s+(?=[A-ZÀ-Ú]{3,})/, ' ')
      .replace(/\s\d{2}\s+1\s+(?=-\s)/g, ' ');
    t = limpaCelula(cortaNaProximaLinha(tiraTimbre(t.replace(/\s+/g, ' ').trim(), timbres)), timbres);
    if (t) saida.set(i, t);
  });
  return saida;
}

// O numero da linha SEGUINTE colado no fim da celula, depois de uma palavra:
// "...tensao alimentacao 110/127 v, tipo vertical 6" no item 5 de Apiai/SP.
// Aqui ja se sabe o numero do proximo item, e so ele sai — e nunca depois de
// palavra de medida, porque "capacidade 12" no item 11 e a capacidade.
const MEDIDA_ANTES = /(?:capacidade|pot[eê]ncia|voltagem|tens[aã]o|garantia|bocas|portas|velocidades?|litros|quantidade|m[ií]nim[oa]|m[aá]xim[oa]|com|de|at[eé]|di[aâ]metro|altura|largura|comprimento|profundidade|peso|cor|n[oº]|modelo|classe|nivel|n[ií]vel|gavetas|prateleiras|queimadores|x)$/i;
// A QUANTIDADE da linha pode vir antes dele, quando o edital a imprime no fim
// da descricao: "...Cores: Branco e preto. 5 109" e "...Nas cores preto ou
// branco . 135wts 20 108" em Sao Jose da Boa Vista/PR — 5 e 20 unidades, 109 e
// 108 os itens seguintes.
function tiraNumeroDoProximo(t, prox) {
  if (!Number.isInteger(prox)) return t;
  const m = new RegExp('(\\S+)\\s+(?:\\d{1,4}\\s+)?0*' + prox + '$').exec(t);
  if (!m || !/[A-Za-zÀ-ÿ).;]$/.test(m[1]) || MEDIDA_ANTES.test(m[1])) return t;
  return t.slice(0, m.index + m[1].length).trim();
}

// PALAVRA PARTIDA pelo proprio PDF: um dos termos de referencia de Vicosa/MG
// escreve um espaco no meio da palavra — "preparo de alime ntos", "controle
// rem oto", "capacidade minim a" — e o outro, com o mesmo texto, nao. Quando so
// a copia partida tem a linha do item, o resumo mostrava as palavras quebradas.
//
// Junta dois pedacos quando a palavra inteira existe no vocabulario dos editais
// e pelo menos um dos pedacos NAO existe como palavra: "alime" e "ntos" nao sao
// palavras, "alimentos" e. "com o" nao vira "como", porque "com" e "o" sao.
const vocabulario = new Map();
for (const v of Object.values(base.editais)) {
  for (const s of v.secoes || []) for (const w of String(s.texto).toLowerCase().match(/[a-zà-ÿ]+/g) || []) vocabulario.set(w, (vocabulario.get(w) || 0) + 1);
}
//
// E so com PROVA no proprio edital: a outra copia do mesmo trecho, com a palavra
// inteira ao lado da mesma vizinha ("de alimentos", "controle remoto"). Sem
// isso, "aplicacao de correntes terapeuticas" (Itaporanga/SP) virava
// "decorrentes" — "correntes" e palavra rara, mas e palavra.
// A LIGADURA que a fonte nao traduziu: o edital 1081 de Sao Paulo/SP escreve
// "ti" com um glifo so, sem correspondencia de texto, e sai "Garan a 12 meses",
// "desligamento automa co", "base an derrapante". Recoloca as letras quando a
// palavra inteira existe e os pedacos nao — e so no edital em que isso acontece
// varias vezes, que e a prova de que a fonte dele perdeu a ligadura.
const LIGADURAS = ['ti', 'tt', 'ft', 'fi', 'fl', 'ff'];
const PAR_SOLTO = /(?<![A-Za-zÀ-ÿ])([A-Za-zÀ-ÿ][a-zà-ÿ]{0,13}) (?=([a-zà-ÿ]{1,14})(?![A-Za-zÀ-ÿ]))/g;
const resolveLigadura = (a, b) => {
  if ((vocabulario.get((a + b).toLowerCase()) || 0) >= 5) return null;
  for (const L of LIGADURAS) {
    const n = vocabulario.get((a + L + b).toLowerCase()) || 0;
    if (n < 10) continue;
    // Pedaco que so existe como sobra da propria copia partida nao e palavra:
    // "an" e "derrapante" aparecem seis vezes cada, "antiderrapante" 67 (Sao
    // Paulo/SP, edital 1081).
    const palavra = x => { const f = vocabulario.get(x.toLowerCase()) || 0; return f >= 3 && f * 5 >= n; };
    if (palavra(a) && palavra(b)) continue;
    return L;
  }
  return null;
};
const semLigadura = new Map();
function editalSemLigadura(textoDoEdital) {
  if (!semLigadura.has(textoDoEdital)) {
    const vistos = new Set();
    for (const m of textoDoEdital.matchAll(PAR_SOLTO)) if (resolveLigadura(m[1], m[2])) vistos.add(m[1] + ' ' + m[2]);
    semLigadura.set(textoDoEdital, vistos.size >= 3);
  }
  return semLigadura.get(textoDoEdital);
}

const PREFIXO_COM_HIFEN = /^(?:ar|pr[ée]|p[óo]s|anti|semi|auto|micro|multi|super|ultra|extra|inter|sub|mini|frost|hi|bi|tri|porta|guarda|lava|air|eco|termo|hidro|eletro)$/i;
function juntaPartidas(texto, textoDoEdital) {
  // O contrario tambem: a palavra colada na seguinte, sem o espaco da quebra de
  // linha — "ciclo quente/frio, tecnologiaInverter, composto" (Bento
  // Goncalves/RS). So quando as duas metades sao palavras comuns do edital;
  // nome de marca como "MaxxiClean" nao passa.
  texto = String(texto).replace(/(?<![A-Za-zÀ-ÿ])([a-zà-ÿ]{4,})([A-ZÀ-Ú][a-zà-ÿ]{3,})(?![A-Za-zÀ-ÿ])/g, (tudo, a, b) =>
    (vocabulario.get(a) || 0) >= 3 && (vocabulario.get(b.toLowerCase()) || 0) >= 3 ? a + ' ' + b : tudo);
  // Hifenizacao do fim de linha que ficou no meio do texto: "garantia minima 12
  // me- ses", "acabamen- to em pintura" (Nova Esperanca/PR).
  texto = String(texto).replace(/(?<![A-Za-zÀ-ÿ])([a-zà-ÿ]{1,15})- ([a-zà-ÿ]{1,15})(?![A-Za-zÀ-ÿ])/g, (tudo, a, b) =>
    (vocabulario.get((a + b).toLowerCase()) || 0) >= 5 ? a + b : tudo);
  // A palavra composta partida NO hifen fica com ele: "Funcoes pre- programadas"
  // (Valinhos/SP), "Tratamento Anti- ferrugem" (Santa Rita do Passa Quatro/SP),
  // "Ar- condicionado" (Campina do Monte Alegre/SP), "admitindo- se" (Bento
  // Goncalves/RS).
  texto = texto.replace(/(?<![A-Za-zÀ-ÿ])([A-Za-zÀ-ÿ]{2,15})- ([a-zà-ÿ]{2,15})(?![A-Za-zÀ-ÿ])/g, (tudo, a, b) =>
    PREFIXO_COM_HIFEN.test(a) || /^(?:se|lo|la|los|las|lhe|lhes)$/.test(b) ? a + '-' + b : tudo);
  const freq = x => vocabulario.get(x.toLowerCase()) || 0;
  if (editalSemLigadura(textoDoEdital)) {
    texto = texto.replace(PAR_SOLTO, (tudo, a, b) => { const L = resolveLigadura(a, b); return L ? a + L : tudo; });
  } else {
    // Sem o edital inteiro sem ligadura, so a palavra que o conjunto dos
    // editais conhece bem e cujos dois pedacos quase nao existem sozinhos:
    // "base an derrapante" (Sao Paulo/SP, edital 1081), onde o "ti" sumiu uma
    // vez so.
    texto = texto.replace(PAR_SOLTO, (tudo, a, b) => {
      if (freq(a + b) >= 5) return tudo;
      for (const L of LIGADURAS) {
        const n = freq(a + L + b);
        if (n >= 50 && freq(a) * 5 < n && freq(b) * 5 < n) return a + L;
      }
      return tudo;
    });
  }
  // A letra acentuada que a fonte do PDF nao traz e vira espaco: "VISUALIZACAO
  // DA TEMPERATURA A DIST NCIA" (Florianopolis/SC), "Pot ncia 41.2 KW". Mesma
  // prova da ligadura: a palavra inteira e conhecida e os pedacos quase nao
  // existem sozinhos. A letra sai na caixa do pedaco da esquerda.
  texto = texto.replace(/(?<![A-Za-zÀ-ÿ])([A-Za-zÀ-ÿ]{2,14}) (?=([A-Za-zÀ-ÿ]{2,14})(?![A-Za-zÀ-ÿ]))/g, (tudo, a, b) => {
    if (freq(a + b) >= 5) return tudo;
    for (const l of ['â', 'ã', 'á', 'ç', 'é', 'ê', 'í', 'ó', 'ô', 'õ', 'ú']) {
      const n = freq(a + l + b);
      if (n >= 30 && freq(a) * 5 < n && freq(b) * 5 < n) return a + (a === a.toUpperCase() ? l.toUpperCase() : l);
    }
    return tudo;
  });
  // O segundo pedaco fica numa olhada a frente, sem ser consumido: em "controle
  // rem oto" o par "controle rem" nao junta, e o "rem oto" seguinte ainda precisa
  // ser visto.
  return String(texto).replace(/(?<![A-Za-zÀ-ÿ])([a-zà-ÿ]{1,12}) (?=([a-zà-ÿ]{1,12})(?![A-Za-zÀ-ÿ]))/g, (tudo, a, b, pos, todo) => {
    const n = vocabulario.get((a + b).toLowerCase()) || 0;
    if (n < 5) return tudo;
    // Pedaco que aparece de vez em quando — "alime", da propria copia partida —
    // nao conta como palavra: tem de ser comum perto da palavra inteira. Letra
    // sozinha tambem nao: "plataforma e m aco" (Vicosa/MG) e "em".
    const palavra = x => { const f = vocabulario.get(x) || 0; return x.length >= 2 && f >= 3 && f * 20 >= n; };
    if (palavra(a) && palavra(b)) return tudo;
    // A palavra muito conhecida cujo primeiro pedaco nao existe sozinho, com o
    // segundo curto ou raro, dispensa a prova no texto: "capacidade maxi ma."
    // (Vicosa/MG), que o edital nao escreve inteiro em lugar nenhum.
    if (n >= 100 && a.length >= 3 && b.length >= 2 && freq(a) * 20 < n && (freq(b) * 20 < n || b.length <= 3)) return a;
    const antes = (todo.slice(0, pos).match(/(\S+)\s*$/) || [])[1];
    const resto = todo.slice(pos + tudo.length + b.length);
    const depois = (resto.match(/^\s*(\S+)/) || [])[1];
    // A pontuacao colada tambem serve de vizinha: "capacidade maxi ma."
    const colada = (resto.match(/^[^\sA-Za-zÀ-ÿ0-9]+/) || [])[0];
    const provaAntes = antes && textoDoEdital.includes(antes + ' ' + a + b);
    const provaDepois = depois && textoDoEdital.includes(a + b + ' ' + depois);
    const provaColada = colada && textoDoEdital.includes(' ' + a + b + colada);
    // Artigo ou conjuncao de uma letra no fim do par precisa das duas provas:
    // "e com o espaco" nao e "e como espaco" so porque o edital diz "e como".
    // No comeco do par, a prova e a palavra seguinte: "a traves de" e "atraves
    // de" (Saudade do Iguacu/PR), "manual e m portugues" e "em portugues".
    // Palavra muito comum com a palavra seguinte provada tambem serve: "de um a
    // ou duas portas" e "uma ou" (Vicosa/MG), e "com o espaco" continua de fora
    // porque o edital nao diz "como espaco".
    if (/^[aeoàé]$/.test(b)) return (provaAntes || n >= 300) && (provaDepois || provaColada) ? a : tudo;
    if (/^[aeoàé]$/.test(a)) return provaDepois || provaColada ? a : tudo;
    const prova = provaAntes || provaDepois || provaColada;
    return prova ? a : tudo;
  });
}

// O Termo de Referencia de Serrana/SP (anexo da BLL, 16/09/2026) poe na linha
// do item, depois da especificacao, o preco, a dotacao e as secretarias que
// recebem: "... 1200 Watts (127V). 172,63 1.208,41 Despesa 318 - 08.310.0000 -
// Emenda Impositiva n° 11/2025 ... Atenção Básica 2 03 - Unid. GELADEIRA". A
// especificacao acaba onde comeca o dinheiro ou a dotacao, e a linha seguinte
// ("2 03 - Unid.") leva junto o destino que a precede.
//
// O preco sozinho NAO encerra: em Renascenca/PR ele cai no meio da frase ("NO
// MINIMO 15 142,52 285,04 (QUINZE) METROS, DESTINADO..."). So conta quando vem
// seguido da dotacao ou da secretaria que recebe.
const PRECOS = /\s\d{1,3}(?:\.\d{3})*,\d{2}\s*[•·]?\s*\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)/g;
const DOTACAO = /\s(?:Valor\s+total\s+estimado|ITEM\s+CATMAT\s+IMAGEM|Despesa\s+\d|Emenda\s+(?:Impositiva|de\s+Bancada|Bancada)|Tesouro\b|Rec\.\s*Fin\.|\(\d{2}\s*[—–-]\s*Unid\.\)|\d{3}\s*[-—–]\s*\d{2}\.\d{3}\.\d{4}|\d{4}\.\d{2}\.\d{3}(?!\d))/;
const DESTINO = /^\s*(?:Secretaria\s+(?:Municipal\s+)?d[eao]s?\s+[A-ZÀ-Ú]|Aten[çc][ãa]o\s+B[áa]sica|Fundo\s+Municipal)/;
function cortaOrcamento(t) {
  // rodape do SEI que o timbre nao pega, porque muda o numero da folha: "DMT -
  // Termo de Referência e Anexos 2056045 SEI 23114.914207/2026-29 / pg. 12"
  t = t.replace(/\s*\b[A-Z]{2,8}\s+-\s+[^.]{3,60}?\s+\d{6,8}\s+SEI\s+\d{5}\.\d{6}\/\d{4}-\d{2}\s*\/\s*pg\.?(?:\s*\d+)?/g, ' ').trim();
  // rodape de telefone no meio da celula, com o preco da linha na frente:
  // "...com o copo 1.194,57 1.194,57 : (46) 3525-8100 / 99135-0488 mal
  // encaixado" (Marmeleiro/PR) — a frase continua depois dele
  t = t.replace(/(?:\s\d{1,3}(?:\.\d{3})*,\d{2}){0,2}\s*:\s*\(\d{2}\)\s*\d{4,5}-\d{4}(?:\s*\/\s*\d{4,5}-\d{4})*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  // secao seguinte do Termo de Referencia ou do estudo tecnico: "6. DA
  // ESTIMATIVA DO VALOR DA CONTRATAÇÃO", "7. DA JUSTIFICATIVA..." (Alcinópolis/MS)
  // (tambem "7- ESTIMATIVA DO PRECO DA CONTRATACAO", sem o "DA", em Alegrete/RS,
  // e "10. ADEQUAÇÃO ORÇAMENTÁRIA Tratando-se...", so com o ponto, em
  // Arvorezinha/RS — ai com o titulo inteiro em maiusculas, que "2. Prazo de
  // garantia" dentro da especificacao nao e secao)
  const secao = /\s\d{1,2}(?:\.\d{1,2})?(?:\.?\s+D[AOE]S?\s+|\s*[-–]\s+|\.\s+(?=[A-ZÀ-Ý]{4,}\s+[A-ZÀ-Ý]))(?:ESTIMATIVA|JUSTIFICATIVA|FUNDAMENTA|REQUISITOS|MODELO\s+DE|CRIT[ÉE]RIOS|OBRIGA[ÇC]|PAGAMENTO|VIG[ÊE]NCIA|DEMONSTRATIVO|ADEQUA[ÇC][ÃA]O|LEVANTAMENTO|DESCRI[ÇC][ÃA]O\s+DA\s+SOLU|PRAZO|SAN[ÇC][ÕO]ES|DOTA[ÇC][ÃA]O)/.exec(t);
  // A partir de 60 caracteres: a celula curta de Alegrete/RS ("Ventilador de
  // parede, 8 pas, turbo, 60 cm, na cor preto, 220 volts, 3 velocidades UN 211
  // 7- ESTIMATIVA DO PRECO...") corria tres mil caracteres de estudo tecnico.
  if (secao && secao.index > 60) t = t.slice(0, secao.index);
  // clausula do contrato colada no fim da celula: "Imagem apenas ilustrativa*
  // UN 2 2.500,00 5.000,00 O prazo de vigencia da contratacao e de 30 dias..."
  // (Franca/SP) e "O fornecedor devera enviar o produto novo lacrado ...
  // procede-se entao o pagamento do empenho" (Montes Claros/MG, 16/09/2026)
  // e os campos em branco do modelo de proposta: "... energetica A.
  // MARCA:........ FABRICANTE:........ MODELO:........ un." (Caxias do Sul/RS)
  const emBranco = /\s(?:MARCA|Marca|FABRICANTE|Fabricante|MODELO|Modelo)\s*:\s*[._…]{5,}/.exec(t);
  if (emBranco && emBranco.index > 60) t = t.slice(0, emBranco.index);
  // o rodape do SIPAC na linha: "...MODELO TURBO PREMIUM Quant. Int. 156679 -
  // UNIVERSIDADE FEDERAL DE CATALAO 41 SIPAC |" (UFCAT) — e o preco seguido do
  // anexo seguinte: "...QUANTIDADE PAS: 3 UN 368,73 ANEXO II - REGRAS
  // APLICAVEIS..." (UFV, pregao 218)
  // e o cabecalho repetido da tabela de Ivaipora/PR, quando nao ha continuacao
  // para costurar: "... fornos de micro-ondas. 61 Ord. Cota Descricao Und Qtd"
  const rodapeLinha = /\sQuant\.\s*Int\.\s|\s\d{1,3}(?:\.\d{3})*,\d{2}\s+ANEXO\s+[IVXL]+\b|\s\S{1,4}\s+Ord\.\s+Cota\s+Descri/.exec(t);
  if (rodapeLinha && rodapeLinha.index > 40) t = t.slice(0, rodapeLinha.index);
  // colunas soltas no meio e no fim: "controlador de UN 01 temperatura" (Vila
  // Flores/RS), "7HP 1 UN CK" (Vinhedo/SP), "branco 117 SIM (INMETRO + Selo
  // PROCEL)" (Pitangueiras/SP), "3 Velocidades E Oscilante Unidade 100 262 de
  // 420" (UFV, com o numero da folha)
  // a unidade e o preco partidos no fim ("... 700w UN R$ 283,00 R$ 9.339,00",
  // "... aço inox UN R$", Alegrete/RS), as colunas numericas soltas depois da
  // unidade ("... SEM UTILIZAR OLEO UNIDADE 10 2 1 0 13 329506", IF Goiano) e o
  // numero da folha no meio da lista ("... no Brasil. 46 • Garantia minima",
  // Pinheiro Machado/RS)
  // e a fileira de numeros sem letra no fim, colunas de distribuicao por
  // secretaria e o telefone do rodape: "... 3 velocidades 40 2 5 160 2 2 211 :
  // 55 3120-1104" (Alegrete/RS)
  t = t.replace(/(\p{L}[\p{L}.)\]%]*)(?:\s+[\d:()\-/.,]+){4,}$/u, '$1')
    // e a unidade (com a quantidade) que sobra no fim depois de uma palavra:
    // "... aco inox UN", "... 3 velocidades UN 211" — "Tampas: 2 UN" fica
    .replace(/(?<=\p{L}[.,]?)\s+(?:UNIDADE|Unidade|UN|UND|Unid\.?)(?:\s+\d{1,5})?$/u, '');
  const unPreco = /\s(?:UN|UND|Unid\.?|Unidade)\s+R\$(?:\s|$)/.exec(t);
  if (unPreco && unPreco.index > 40) t = t.slice(0, unPreco.index);
  t = t.replace(/\s(?:UNIDADE|Unidade|UN|UND)(?:\s+\d{1,7}){2,}$/, '')
    .replace(/([.;:])\s+\d{1,3}\s+(?=•)/g, '$1 ')
    .replace(/\s+Termo\s+de\s+Refer[êe]ncia\s+P[áa]gina\s+\S{1,4}\s+de\s+\S{1,4}(?=\s|$)/g, '');
  t = t.replace(/\s(?:UN|UND|Unid\.?)\s+\d{1,3}\s+(?=[a-zà-ÿ]{3})/g, ' ')
    .replace(/\s\d{1,5}\s+SIM\s+(?=\([^)]*INMETRO)/, ' ')
    .replace(/\s(?:Unidades?|UN|Und|Unid\.?)\s+\d{1,5}\s+\d{1,4}\s+de\s+\d{1,4}$/, '')
    .replace(/(\S)\s\d{1,4}\s+(?:UN|UND|Unid\.?)(?:\s+[A-Z]{1,3})?$/, '$1')
    // o numero e a letra da cota da linha seguinte: "...porta de aco. 50 E"
    // (Ivaipora/PR), e o "Item 06" da citacao seguinte
    .replace(/([.;])\s+(?:\d{1,3}\s+[A-E]|Item\s+\d{1,3})$/, '$1');
  // "Imagem Ilustrativa" sozinha tambem, depois de cada item do TR de Pinheiro
  // Machado/RS; e as colunas de cota da planilha de Sapezal/MT ("... 12 (DOZE)
  // MESES ITEM PARA AMPLA PARTICIPACAO.", "COTA DO ITEM 04 PARA ME E EPP (Art.
  // 48, III da LC 147/2014). UN: unidade"); e o que vem depois do item na tabela
  // de Triunfo/RS, que numera por extenso: "... industrial. Item 2 – 01 Suporte"
  const clausula = /\s(?:Image(?:m|ns)\s+(?:(?:apenas|meramente|somente)\s+)?ilustrativ[ao]s?|ITEM\s+PARA\s+AMPLA\s+PARTICIPA|COTA\s+DO\s+ITEM\s+\d{1,3}\s+PARA\s+ME\b|UN:\s*unidade|Item\s+\d{1,3}\s+[–-]\s+\d{1,3}\s+[A-ZÀ-Ú]|O\s+prazo\s+de\s+vig[êe]ncia\s+d[ao]\s+contrat|O\s+fornecedor\s+dever[áa]\s+enviar\s+o\s+produto)/i.exec(t);
  if (clausula && clausula.index > 60) t = t.slice(0, clausula.index);
  // o codigo do catalogo da prefeitura fechando a especificacao, com a linha
  // seguinte logo depois: "...pes antiderrapantes. 1004389 6 ME/", "...(1 p/
  // limao). 1014691 Batedeira Planetaria com 10 velocidades..." — a metade da
  // batedeira que ficou antes da virada de folha (Uberlandia/MG)
  const cod = /([.;)])\s+\d{6,7}(?=\s+(?:\d{1,3}\s+ME\s*\/|Un\b|UN\b|Unid|[A-ZÀ-Ú][a-zà-ÿ]))/.exec(t);
  if (cod && cod.index > 60) t = t.slice(0, cod.index + 1);
  // a linha da tabela sem preco: unidade, quantidade e codigo do catalogo, e
  // dali em diante o rodape da folha ("... com visor em Unidade 01 632257 TERMO
  // DE REFERENCIA (TR) - BENS", Camara de Belo Horizonte/MG)
  const linhaSemPreco = /\s(?:Unidades?|Unid\.?|UN|UND)\s+\d{1,4}\s+\d{5,7}(?!\d)/.exec(t);
  if (linhaSemPreco && linhaSemPreco.index > 40) t = t.slice(0, linhaSemPreco.index);
  for (const m of t.matchAll(PRECOS)) {
    const depois = t.slice(m.index + m[0].length, m.index + m[0].length + 160);
    // e o preco seguido da linha do proximo item: "luz interna. 3.659,93
    // 3.659,93 9 Unid. 1 Casinha Plástica..." (Marmeleiro/PR)
    const proxLinha = /^\s*\d{1,3}\s+(?:Unid\.?|UN|UND|Unidades?)\s+\d/.test(depois);
    if (m.index > 40 && (proxLinha || DOTACAO.test(' ' + depois) || DESTINO.test(depois))) { t = t.slice(0, m.index); break; }
  }
  const m = t.match(DOTACAO);
  if (m && m.index > 15) t = t.slice(0, m.index);
  // "... do produto. UN 01 2.680, 88 2.680, 88": unidade, quantidade e preco
  // em texto de PDF escaneado, com o espaco que o reconhecimento poe na virgula
  // (Guia Lopes da Laguna/MS)
  // e "Largura: 1m « 52 3 Unidades 394,00" (Cascavel/PR): numero da linha
  // seguinte, quantidade, unidade por extenso e preco
  const u = t.match(/\s(?:UN|UND|Unid\.?)\s+\d{1,4}\s+\d{1,3}(?:[.\s]?\d{3})*,\s?\d{2}|\s\d{1,3}\s+\d{1,4}\s+Unidades?\s+\d{1,3}(?:\.\d{3})*,\d{2}/);
  if (u && u.index > 40) t = t.slice(0, u.index);
  const prox = t.match(/\s\d{1,3}\s+\d{2,3}\s*[-—–]?\s*Unid\.?(?:\s+[A-ZÀ-Ú][^a-z]{3,}.*)?\s*$/);
  if (prox && prox.index > 40) {
    t = t.slice(0, prox.index)
      .replace(/([.;:)])\s+(?:\d+\s*[-—–]\s*)?[A-ZÀ-Ú][\p{L}.]*(?:\s+[A-ZÀ-Ú][\p{L}.]*){0,3}$/u, '$1');
  }
  // O que sobra depois do ultimo ponto e nao e especificacao: o preco ("meses.
  // 4.715,00 -6 9.430,00", "Cor Branca. v i.Q78,88 ' 5.636,65"), a conta da
  // emenda ou numero solto sem letra nenhuma ("meses. 4. 715 00, 4 0 0.").
  //
  // O corte e no dinheiro ou na marca, nao no ponto: na UNESPAR a especificacao
  // e o total estao na mesma frase ("UNID. DE MEDIDA: Unitario ... Monofasico
  // TOTAL 53 R$ 598.676,02"). O que fica entre o ponto e o corte so sai junto
  // quando quase nao tem letra ("v i.Q78,88 '").
  const LIXO = /(?:TOTAL\s+\d+\s+)?R\$\s*\d|\d{1,3}\.\s?\d{3},\s?\d{2}(?!\d)|Emenda\s|Conta\s+CEF|Plano\s+de\s+A[çc][ãa]o|Inc\.\s*Fin\.|Pa[çc]o\s+M|Secretaria\s+(?:Municipal\s+)?d[eao]s?\s+[A-ZÀ-Ú]/i;
  const poucaLetra = s => (s.match(/\p{L}/gu) || []).length < s.replace(/\s/g, '').length * 0.4;
  for (let k = 0; k < 4; k++) {
    const p = Math.max(t.lastIndexOf('. '), t.lastIndexOf('; '));
    if (p < 40) break;
    const rabo = t.slice(p + 1);
    if (rabo.length > 200) break;
    const lx = rabo.match(LIXO);
    if (lx) {
      const antes = rabo.slice(0, lx.index);
      t = t.slice(0, p + 1) + (antes.trim() && !poucaLetra(antes) ? antes : '');
      continue;
    }
    // numero solto sem letra: "meses. 4. 715 00, 4 0 0.", "garantia. 3 100%"
    // — mas nao o codigo inteiro de "COD. 1.010"
    // e o codigo de catalogo sozinho no fim ("panela. 1018898", Uberlândia/MG)
    const soNumero = !/\p{L}/u.test(rabo) && (/\d\S*\s+\S*\d/.test(rabo.trim()) || /^\s*(?:\d{1,2}\.?|\d{5,})\s*$/.test(rabo));
    if (!soNumero) break;
    t = t.slice(0, p + 1);
  }
  // o preco unitario sozinho no fim, sem R$: "PESA COM INCREMENTOS DE 100G
  // 511,30" (Casca/RS). So de 100 para cima, e nunca depois de rotulo (":"),
  // de preposicao ou do "x" das medidas: "Largura: 24,50", "de 150,00" ficam.
  const precoNoFim = /^([\s\S]{40,}?\S)\s+(\d{1,3}(?:\.\d{3})+,\d{2}|\d{3},\d{2})$/.exec(t);
  if (precoNoFim && !/(?:[:=xX×]|(?<!\p{L})(?:de|a|até|ate|e|com|mínimo|minimo|máximo|maximo|aprox\.?|aproximadamente|entre|DE|ATÉ|ATE|COM))$/u.test(precoNoFim[1])) t = precoNoFim[1];
  // a coluna da unidade depois do ponto final: "... selo/homologacao INMETRO. .
  // Unidade" (Camara de Belo Horizonte/MG)
  t = t.replace(/([.;])(?:\s*\.)*\s+(?:Unidades?|Unid\.?|UN|UND|un\.?|und\.?)$/, '$1');
  // "Unid BEBEDOURO INDUSTRIAL 50 LITROS: ...": a coluna da unidade na frente
  t = t.replace(/^(?:Unid|UN|UND)\.?\s+(?=[A-ZÀ-Ú]{3})/, '');
  // e a da cota: "EPP Liquidificador Industrial..." (Uberlandia/MG, onde a
  // coluna diz "ME/ EPP" e a quebra cai entre as duas siglas)
  t = t.replace(/^(?:ME\s*\/\s*)?EPP\s+(?=[A-ZÀ-Ú])/, '');
  // pontuacao solta no fim; aspa so quando solta ("... meses. '"), nunca a que
  // fecha 'Letra "A"'
  return t.replace(/\s+['"•·*«»]+$/, '').replace(/[\s•·,;:\-«»]+$/, '').trim();
}

function tiraRepeticao(t) {
  if (t.length < 400) return t;
  const sem = s => s.replace(/\s+/g, '');
  for (const m of t.matchAll(/\s/g)) {
    const p = m.index;
    if (p < t.length * 0.3 || t.length - p < 150) continue;
    const resto = t.slice(p + 1), antes = t.slice(0, p);
    if (!antes.includes(resto.slice(0, 60))) continue;
    if (sem(antes).includes(sem(resto))) return antes.trim();
  }
  return t;
}

// As capacidades em BTU citadas num texto: "9000 BTUs", "12.000 BTU/h",
// "18 000 btus". Abaixo de 5.000 nao e capacidade de aparelho.
// Quantas BOCAS o texto anuncia. E o que separa dois fogoes industriais iguais
// em tudo o mais, e "04"/"06" e curto demais para contar como palavra: em
// Viamao/RS o fogao de 4 bocas ficou com a linha do de 6 (22/09/2026).
// So "bocas": os QUEIMADORES contam outra coisa — o mesmo fogao de 6 bocas tem
// "3 queimadores duplos e 3 simples" (Renascenca/PR) — e o numero solto do
// meio do texto ("grelhas de 40x40") tambem nao entra.
function bocasDe(s) {
  const out = new Set();
  const poe = n => { if (+n >= 1 && +n <= 12) out.add(+n); };
  for (const m of String(s || '').matchAll(/\b(\d{1,2})\s*bocas?\b/gi)) poe(m[1]);
  // "quantidade bocas: 10" e campo de CATALOGO do PNCP, e o catalogo erra: o
  // fogao de 4 bocas do edital de Pinhal de Sao Bento/PR esta cadastrado como
  // de 10, e o cooktop de 5 como de 4. Vale o que o EDITAL escreve.
  return out;
}
function btusDe(s) {
  const out = new Set();
  for (const m of String(s || '').matchAll(/(\d{1,3}(?:[.\s]\d{3})|\d{4,6})\s*BTU/gi)) {
    const n = Number(m[1].replace(/[.\s]/g, ''));
    if (n >= 5000) out.add(n);
  }
  // A faixa vale pelas duas pontas e pelo que ha entre elas: "capacidade de
  // 9.000 a 12.000 BTUs" serve ao item de 9.000 (Sao Gabriel do Oeste/MS,
  // 22/09/2026), que saia sem descritivo porque so o 12.000 era lido.
  for (const m of String(s || '').matchAll(/(\d{1,3}(?:[.\s]\d{3})|\d{4,6})\s*(?:a|até|ate|-|–)\s*(\d{1,3}(?:[.\s]\d{3})|\d{4,6})\s*BTU/gi)) {
    const a = Number(m[1].replace(/[.\s]/g, '')), b = Number(m[2].replace(/[.\s]/g, ''));
    if (a >= 5000 && b > a) for (const p of [7000, 9000, 10000, 12000, 18000, 22000, 24000, 30000, 36000, 48000, 57000, 60000]) if (p >= a && p <= b) out.add(p);
    if (a >= 5000) out.add(a);
  }
  // A capacidade do CATALOGO do PNCP ("capacidade refrigeração: 16.000", sem
  // "BTU") fica de fora de proposito: o catalogo so tem capacidades padrao e o
  // orgao escolhe a mais proxima, entao o edital de 12.000 BTUs aparece com
  // rotulo de 16.000 (São Luiz Gonzaga/RS, Bento Gonçalves/RS) — e o edital e
  // que vale.
  return out;
}

// O anexo "Descricao detalhada dos itens" da EBSERH (Santa Maria/RS, pregao
// 40/2026), em texto corrido: "1 444993 155125 <descritivo simples>;
// <descritivo completo> unidade 5 0 0 0 0 0 0,5 2 450917 ...". Numero do item,
// CATMAT de seis digitos e um ou dois codigos internos abrem a linha; a unidade
// e as colunas de quantidade fecham. O completo repete o simples no comeco, e e
// o completo que fica. O cabecalho da tabela, repetido a cada folha, sai.
//
// A linha vai do comeco dela ao comeco da seguinte, e a seguinte tem de ser a
// do proximo numero: nem toda linha fecha com a unidade (a 11 termina em
// "...garantia minima de 12 meses. 2" e ja abre a 12). A sequencia recomeca a
// cada "1": o termo de referencia pode ter a sua propria tabela antes do anexo,
// e de cada item fica o texto mais comprido.
const COLUNAS_DO_FIM = /\s+(?:unidade|und|un|conjunto|kit|par|pe[çc]a|caixa|pacote|jogo|metro|rolo)\s+\d+(?:,\d+)?(?:\s+\d+(?:,\d+)?){2,}[\s\S]*$/i;
//
// So no modelo da EBSERH, reconhecido pelo cabecalho "Descritivo simples
// Descritivo completo": aberta a qualquer tabela com CATMAT, a segmentacao
// pegava as de Ponta Grossa/PR, Vicosa/MG e Bento Goncalves/RS e trocava a
// celula boa do termo pela linha com o cabecalho da folha dentro.
function tabelaEbserh(plano) {
  if (!/Descritivo\s+simples\s+Descritivo\s+completo/i.test(plano)) return {};
  const RE = /(?:^|\s)(\d{1,3})\s+\d{6}(?:\s+\d{5,7}){0,2}\s+(?=\S)/g;
  const tabelas = [];
  let atual = null;
  for (const m of plano.matchAll(RE)) {
    const n = +m[1];
    if (n === 1) { atual = []; tabelas.push(atual); }
    else if (!atual || n !== atual[atual.length - 1].n + 1) continue;
    atual.push({ n, ini: m.index, de: m.index + m[0].length });
  }
  const saida = {};
  for (const linhas of tabelas) {
    if (linhas.length < 2) continue;
    linhas.forEach((l, i) => {
      const prox = linhas[i + 1];
      let t = plano.slice(l.de, prox ? prox.ini : l.de + 6000);
      const fim = t.search(COLUNAS_DO_FIM);
      if (fim >= 0) t = t.slice(0, fim);
      else if (prox) t = t.replace(/(?:\s+(?:unidade|und|un|conjunto|kit|par|pe[çc]a|caixa|pacote|jogo|metro|rolo))?(?:\s+\d+(?:,\d+)?)*\s*$/i, '');
      else return;             // a ultima linha sem fecho nao se sabe onde acaba
      t = t.replace(/\s*Escopo:\s*Objeto:.{0,600}?Intervalo\s+M[íi]nimo\s+entre\s+Lances\s*/gi, ' ').trim();
      // O simples na frente do completo, que abre igual: "Geladeira portatil
      // Geladeira portatil com capacidade...", "Aquecedor ... 50 litros;
      // Aquecedor ... 50 litros; estrutura...".
      for (let k = 13; k <= Math.min(400, t.length / 2); k++) {
        if (!/[\s;]/.test(t[k - 1])) continue;
        const cab = t.slice(0, Math.min(k - 1, 25)).replace(/[\s;,.]+$/, '');
        if (cab.length >= 12 && t.startsWith(cab, k)) { t = t.slice(k); break; }
      }
      if (t.length >= 30 && (!saida[l.n] || t.length > saida[l.n].length)) saida[l.n] = t;
    });
  }
  return saida;
}

// A linha da tabela achada pelo fim dela, e nao pelo nome do produto.
//
// O recorte ancora o item pelas palavras do rotulo do PNCP, e quando o orgao
// cadastra um codigo de catalogo que chama o produto de outro nome a linha nunca
// e achada: o item 120 de Goiania/GO e "Processador Alimentos" no PNCP e
// "LIQUIDIFICADOR INDUSTRIAL CAPACIDADE MINIMA 25 LITROS" no edital, o 1 de
// Cubatao/SP e "Refrigerador Domestico" e "Geladeira 3 portas Inox" (18/09/2026).
// Mas a linha fecha com as colunas do proprio item — unidade, quantidade e preco
// unitario: "UNIDADE 8 R$ 2.018,27", "UN 01 R$ 6.090,69", "UN 1/10 R$ 2.499,00".
// A quantidade tem de ser a do PNCP, e alem dela o preco unitario ou o nome do
// produto (a pesquisa do termo nem sempre e a do PNCP: 309,41 contra 307,66 no
// ventilador de Guia Lopes da Laguna/MS). A linha comeca onde terminam as colunas
// da anterior, e tem de abrir com o numero do item — ou traze-lo no meio seguido
// da coluna de beneficio, quando a celula do numero ficou centrada e a virada de
// folha a partiu (item 7 de Uberlandia/MG: "Batedeira Planetaria ... potencia
// [timbre] 7 ME/ EPP minima 800 W ..."). So entra onde o item ficou sem nada.
const CAUDA = /\s(?:(?:UNIDADES?|UNID\.?|UND|UN|PC|P[ÇC]|PCT)\s+((?:\d+\/)?\d{1,6})|((?:\d+\/)?\d{1,6})\s+(?:UNIDADES?|UNID\.?|UND|UN|PC|P[ÇC]|PCT))\s+(?:R\s?\$\s*)?(\d{1,3}(?:\.?\d{3})*\s?,\s?\d{2})(?!\d)/gi;
const PRECOS_DEPOIS = /^(?:\s+(?:R\s?\$\s*)?\d{1,3}(?:\.?\d{3})*\s?,\s?\d{2}(?!\d))*/;
const ANTES_DO_NUMERO = /^(?:(?:\d{5,7}|LOTE\s+\d{1,3}|ME\s?\/\s?EPP|EXCLUSIVO|COTA\s+(?:PRINCIPAL|RESERVADA)|AMPLA(?:\s+CONCORR[ÊE]NCIA)?|\*?AC)\s+)*/i;
const CABECALHO_ANTES = /(?:ITEM|VALOR\s+TOTAL|VALOR\s+UNIT[ÁA]RIO|\(R\$\)|REFER[ÊE]NCIA\)|QUANT\S*|QTDE?\.?|UNID\.?|MEDIDA|M[ÁA]X\.?)\s*$/i;
const LIXO_DE_LINHA = /As\s+quantidades\s+foram\s+definidas|JUSTIFICATIVA\s+D[AO]\s|FUNDAMENTA[ÇC][ÃA]O\s+E\s+DESCRI|Lan[çc]ado\s+por:|Metodologia\s+Menor\s+Valor|Menor\s+Valor\s+Valor\s+Estimado/i;
function linhaPelaCauda(plano, caudas, it, timbres) {
  const n = +it[0], q = Math.round(+it[2] || 0);
  if (!n || !q) return null;
  const numeroNaFrente = new RegExp('^0*' + n + '\\s+');
  const numeroNoMeio = new RegExp('\\s0*' + n + '\\s+(?:ME\\s?\\/\\s?EPP|EXCLUSIVO|COTA\\s+\\S+|AMPLA\\S*)\\s');
  let melhor = null;
  caudas.forEach((c, j) => {
    if (+String(c[1] || c[2]).split('/').pop() !== q) return;
    const precoBate = Math.abs(+c[3].replace(/[\s.]/g, '').replace(',', '.') - (+it[4] || 0)) < 0.011;
    const ant = caudas[j - 1];
    let ini, depoisDaAnterior = false;
    if (ant && c.index - (ant.index + ant[0].length) < 4000) {
      ini = ant.index + ant[0].length;
      ini += plano.slice(ini).match(PRECOS_DEPOIS)[0].length;
      depoisDaAnterior = true;
    } else {
      // primeira linha da tabela: o numero do item logo depois do cabecalho
      // dela ("VALOR TOTAL 1 Geladeira", "(REFERENCIA) 01 Ar-condicionado"). O
      // numero mais perto sozinho nao serve: no televisor de Uberlandia/MG era o
      // "01 RF" de dentro da especificacao.
      const antes = plano.slice(Math.max(0, c.index - 1500), c.index);
      const k = [...antes.matchAll(new RegExp('(?:^|\\s)0*' + n + '\\s', 'g'))]
        .filter(x => CABECALHO_ANTES.test(antes.slice(Math.max(0, x.index - 40), x.index))).pop();
      if (!k) return;
      ini = c.index - antes.length + k.index;
    }
    let linha = tiraTimbre(plano.slice(ini, c.index), timbres).trim().replace(ANTES_DO_NUMERO, '');
    if (numeroNaFrente.test(linha)) linha = linha.replace(numeroNaFrente, '');
    else if (depoisDaAnterior && /^\p{Lu}/u.test(linha) && numeroNoMeio.test(linha)) {
      // Entre as duas metades fica o timbre da folha, que o tiraTimbre nem
      // sempre conhece: e o fim da primeira metade que se repete no edital.
      const m = numeroNoMeio.exec(linha);
      const metade = linha.slice(0, m.index);
      let corte = -1;
      for (let i = 0; i < metade.length - 30; i++) {
        if (metade[i] !== ' ') continue;
        const timbre = metade.slice(i + 1);
        if (plano.indexOf(timbre) !== plano.lastIndexOf(timbre)) { corte = i; break; }
      }
      if (corte < 0) {
        // sem timbre no meio, as metades se emendam direto
        if (metade.length > 400) return;
        corte = metade.length;
      }
      linha = metade.slice(0, corte) + ' ' + linha.slice(m.index + m[0].length);
    }
    else return;
    linha = linha.replace(ANTES_DO_NUMERO, '').replace(/\s+\d{5,7}$/, '').replace(/\s{2,}/g, ' ').trim();
    if (linha.length < 30 || comecaNoMeio(linha) || AINDA_SUJO.test(linha) || LIXO_DE_LINHA.test(linha)) return;
    if (/(?<!\p{L})(?:com|em|de|da|do|das|dos|para|por|e|ou|no|na|nos|nas|ao|a|o)$/iu.test(linha)) return;
    // o titulo que so repete o rotulo nao acrescenta nada (Birigui/SP, item 12)
    if (normIgual(it[1]).replace(/[^a-z0-9]+/g, ' ').includes(normIgual(linha).replace(/[^a-z0-9]+/g, ' ').trim())) return;
    if (!precoBate && !falaDoMesmoProduto(it[1], linha)) return;
    if (!melhor || (precoBate && !melhor.precoBate)) melhor = { linha, precoBate };
  });
  return melhor && melhor.linha;
}

// A numeracao da tabela e a do PNCP quando a maioria das linhas fala do produto
// do rotulo com o mesmo numero — as que tem rotulo para julgar.
function tabelaBate(tabela, itens) {
  const julgaveis = itens.filter(it => tabela[it[0]] && palavrasDoItem(it[1]).length >= 2);
  const batem = julgaveis.filter(it => falaDoMesmoProduto(it[1], tabela[it[0]])).length;
  return batem >= 2 && batem >= julgaveis.length * 0.7;
}

// o nome do estado como os timbres de prefeitura escrevem
const UF_POR_EXTENSO = { RS: 'Rio\\s+Grande\\s+do\\s+Sul', SC: 'Santa\\s+Catarina', PR: 'Paran[áa]', SP: 'S[ãa]o\\s+Paulo',
  MG: 'Minas\\s+Gerais', GO: 'Goi[áa]s', MT: 'Mato\\s+Grosso', MS: 'Mato\\s+Grosso\\s+do\\s+Sul' };

let manuais = {};
try { manuais = JSON.parse(fs.readFileSync(path.join(DIR, 'descritivos-manuais.json'), 'utf8')); } catch { /* sem lista */ }

const revisaOrtografia = criaRevisor(Object.values(base.editais).flatMap(v => (v.secoes || []).map(s => s.texto)));

let comTexto = 0, semTexto = 0, itensTotal = 0, itensRicos = 0;

for (const e of dados.editais) {
  const v = base.editais[e[C.path]];
  if (!v || !v.itens) continue;

  const secoes = (v.secoes || []).map(s => s.texto).join('  ');
  let secoesPlano = null;
  if (!secoes) { semTexto++; continue; }
  comTexto++;

  const { textos: recortes, lotes } = descritivosPorItem(secoes, v.itens);
  for (const [i, texto] of celulasPorLote(secoes, v.itens, timbresDoEdital(secoes))) recortes.set(i, { texto, confirmado: true });
  const textoPlano = secoes.replace(/\s+/g, ' ');
  v.itens.forEach((it, i) => {
    itensTotal++;
    // it = [numero, descricao, quantidade, unidade, valor, beneficio]
    const completo = recortes.get(i);
    // Uma regra so, a do serve(), para escolher entre trechos e para gravar.
    // Enquanto eram duas, a escolha elegia a celula certa do item 2 de
    // Paranavai/PR e a gravacao a recusava logo depois, por ser mais curta que
    // o rotulo de catalogo — o item ficava vazio com o texto certo em maos.
    if (completo && serve(it[1], completo.texto, completo.confirmado)) {
      // Sem o numero, sobra a letra solta que vinha antes dele: "...Apresentar
      // catalogo. I 1 2" (Saudade do Iguacu/PR) ficava "...catalogo. I".
      it[6] = juntaPartidas(tiraNumeroDoProximo(completo.texto, v.itens[i + 1] ? v.itens[i + 1][0] : it[0] + 1)
        .replace(/([.;])\s+[A-ZÀ-Ú]{1,2}$/, '$1')
        .replace(/([.;])\s+ITEM$/, '$1')
        // a garantia da coluna ao lado, que so aparece no fim depois de sair o
        // numero da linha seguinte: "...CERTIFICACAO INMETRO. 12 MESES 24"
        // (Campinas/SP, quadro de garantias)
        .replace(/([.;])\s+\d{1,2}\s+MESES$/, '$1')
        // e a unidade, a quantidade e as colunas de cota, pelo mesmo motivo:
        // "...Garantia 12 meses. Unidade 55 Nao SIM 2" (Sao Paulo/SP, edital 1081)
        .replace(/\sUnidade\s+\d{1,5}(?:\s+(?:N[ãa]o|Sim|SIM|N[ÃA]O)){1,2}$/, '')
        // "...contra defeitos de fabricacao. Imagem meramente ilustrativa" e a
        // legenda da foto que o termo de Ponta Grossa/PR poe em cada linha
        .replace(/\.?\s*Imagem meramente ilustrativa\.?$/i, '.')
        .replace(/\s+(?:UN|UND|UNID)?\s*CatMat:\s*\d{5,6}$/i, '')
        // O "U" acentuado que o gerador do catalogo da Prefeitura de Sao Paulo
        // grava como interrogacao: "Com Capacidade ? til Minima de 540 Litros".
        .replace(/(?<=\bcapacidade\s)\?\s?til\b/gi, 'Útil'), textoPlano);
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

  // A tabela estruturada, quando o edital tem uma: a planilha de itens (.xlsx,
  // Juiz de Fora/MG) ou o anexo "Descricao detalhada dos itens" da EBSERH
  // (Santa Maria/RS). As duas trazem o numero do item na propria linha, e quem
  // prova que essa numeracao e a do PNCP e a tabela inteira: a maioria das
  // linhas tem de falar do produto do rotulo. Provada, a linha dela vence o
  // recorte do texto corrido — na EBSERH o recorte pegava o codigo interno na
  // frente ("155125 Batedeira...") e o rodape da folha no fim — e vale mesmo
  // quando o rotulo do catalogo engana: o "Exaustor ... diametro: 25" de Juiz de
  // Fora e um sistema de exaustao com coifa e dutos, fornecido e instalado, e o
  // "Ventilador tipo: parede" 16 da EBSERH e uma longarina de espera.
  {
    const tabela = { ...tabelaEbserh(textoPlano), ...(v.planilha || {}) };
    if (tabelaBate(tabela, v.itens)) for (const it of v.itens) {
      if (!tabela[it[0]] || !serve(it[1], tabela[it[0]], true)) continue;
      if (!it[6]) itensRicos++;
      it[6] = tabela[it[0]];
    }
  }

  // O que continua sem descritivo (ou com a justificativa da compra no lugar,
  // que o veto final apagaria): a linha pelas colunas do fim. Ver linhaPelaCauda.
  {
    const faltam = v.itens.filter(it => !it[6] || LIXO_DE_LINHA.test(it[6]));
    if (faltam.length) {
      const caudas = [...textoPlano.matchAll(CAUDA)];
      const timbres = timbresDoEdital(secoes);
      for (const it of faltam) {
        const t = linhaPelaCauda(textoPlano, caudas, it, timbres);
        if (!t) continue;
        if (!it[6]) itensRicos++;
        it[6] = t;
      }
    }
  }

  // A cota reservada que remete a cota principal: "...COTA RESERVADA DE ATE 25%
  // PARA ME/EPP, CONFORME ART. 48, III, DA LC No 123/2006 - DO ITEM: 4 DESCRICAO
  // DETALHADA: IDEM AO ITEM 4" (Bento Goncalves/RS). O edital diz que a
  // especificacao e a mesma do item 4, entao o item leva a do item 4. Sem a do
  // item 4, fica sem nada: a remissao sozinha nao descreve produto nenhum.
  //
  // O bloco da remissao sai do texto em todo caso — o que fica antes dele e a
  // primeira frase da especificacao, que o termo repete na linha da cota. Quando
  // a folha com a linha principal nao entrou no texto (o fogao do item 50 de
  // Bento Goncalves/RS), essa frase e tudo o que o edital da sobre o produto.
  const REMISSAO_DA_COTA = /\s*COTA\s+RESERVADA\s+DE\s+AT[ÉE][\s\S]{0,200}?IDEM\s+AO\s+ITEM\s+0*(\d{1,4})\b\.?/i;
  const remete = new Map();
  for (const it of v.itens) {
    const m = REMISSAO_DA_COTA.exec(it[6] || '');
    if (!m) continue;
    remete.set(it, +m[1]);
    it[6] = it[6].replace(REMISSAO_DA_COTA, '').trim();
  }
  for (const [it, n] of remete) {
    const principal = n !== it[0] ? v.itens.find(x => x[0] === n) : null;
    const texto = principal && principal[6] && principal[6].length > it[6].length ? principal[6] : it[6];
    if (texto && texto.length >= 60) it[6] = texto;
    else { itensRicos--; if (it.length > 7) it[6] = null; else it.length = 6; }
  }

  // Cota principal e cota reservada com o MESMO rotulo no PNCP sao o mesmo
  // produto, e cada uma pode ter saido de uma copia diferente da linha: o item
  // 34 de Paranavai/PR (edital 178) saiu do termo de referencia, com
  // "autolimpante, automatico, tampa de vidro temperado", e a cota dele, o item
  // 51, so tem a linha da planilha, que diz "tampa de vidro temperado". Fica a
  // copia mais completa nas duas, com as mesmas travas da escolha entre copias.
  {
    const tokens = x => new Set(fatiaTexto(x).map(limpaNum));
    const porRotulo = new Map();
    for (const it of v.itens) if (it[6]) { const r = String(it[1]).trim(); if (!porRotulo.has(r)) porRotulo.set(r, []); porRotulo.get(r).push(it); }
    for (const [r, lista] of porRotulo) {
      if (lista.length < 2) continue;
      const alvo = palavrasDoItem(r);
      const cobre = c => alvo.filter(w => c.has(w)).length;
      const rico = lista.reduce((a, b) => cobre(tokens(b[6])) > cobre(tokens(a[6])) ? b : a);
      const tr = tokens(rico[6]), cr = cobre(tr);
      for (const it of lista) {
        if (it === rico || it[6] === rico[6] || rico[6].length > it[6].length * 1.6) continue;
        const ti = tokens(it[6]);
        let comuns = 0;
        for (const w of ti) if (tr.has(w)) comuns++;
        if (comuns >= ti.size * 0.9 && cr >= cobre(ti) + 2) it[6] = rico[6];
      }
    }
  }

  // Edital de um item so, sem linha achada pelo rotulo: o modelo da Secretaria
  // da Saude de SP escreve "6075800 - Split Hi-wall Inverter 30.000btus
  // Especificação Técnica: Condicionador de Ar; do Tipo Split; ..." e o rotulo
  // do PNCP ("Aparelho Ar Condicionado tipo: split hi wall ...") nao ancora
  // nessa linha — a unica candidata era a justificativa da compra (pregao 28,
  // 16/09/2026). Com um item so, a unica especificacao tecnica do edital e dele.
  if (v.itens.length === 1 && !v.itens[0][6]) {
    // A mesma especificacao aparece de novo em outra copia do anexo, e ali o
    // fim da secao nao se acha e o trecho corre ate a assinatura: das copias
    // que abrem igual, vale a mais curta.
    const specs = [...textoPlano.matchAll(/Especifica[çc][ãa]o\s+T[ée]cnica:\s*(.{60,1500}?)(?=\s\d{1,2}\.\s+D[OAE]S?\s|\s\d{6,7}\s+P[ÇC]\s|$)/g)].map(m => m[1].trim());
    if (specs.length && new Set(specs.map(s => s.slice(0, 80))).size === 1)
      v.itens[0][6] = specs.reduce((a, b) => b.length < a.length ? b : a);
  }

  // Vetos finais, para qualquer edital (15/09/2026). Nenhum descritivo e melhor
  // que um errado:
  // - o sumario do edital ("1. DO OBJETO ........ 3"): Ilicinea/MG recebeu a
  //   capa e o sumario inteiros como descritivo do gerador;
  // - BTU diferente do rotulo: em Palmeiras de Goias/GO o item de 12.000 BTUs
  //   levou o texto do aparelho de 18.000. A capacidade e o que define o preco
  //   do ar-condicionado, o produto que mais aparece no radar.
  for (const it of v.itens) {
    if (!it[6]) continue;
    it[6] = cortaOrcamento(it[6]);
    // a quantidade da linha na frente: "60 Bebedouro - purificador de coluna, ..."
    // (Alegrete/RS, planilha "QTD DESCRICAO UN VALOR")
    const qtdFrente = String(Math.round(+it[2] || 0));
    if (+it[2] > 0 && it[6].startsWith(qtdFrente + ' ') && /^[A-ZÀ-Ú]/.test(it[6].slice(qtdFrente.length + 1))) it[6] = it[6].slice(qtdFrente.length + 1);
    // o cabecalho da folha do orgao no meio da celula: "... funcao freezer,
    // Municipio de Capanema - PR Secretaria Municipal de Familia e Evolucao Social
    // dimensoes aprox. ..." (Capanema/PR, 17/09/2026)
    const munRe = String(e[C.municipio] || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (munRe) it[6] = it[6].replace(new RegExp('\\s*(?:Prefeitura\\s+(?:Municipal\\s+)?(?:de\\s+)?|Munic[íi]pio\\s+de\\s+)' + munRe + '\\s*[-–/]\\s*' + e[C.uf]
      + '(?:\\s+Secretaria\\s+Municipal\\s+d[eao]s?\\s+(?:\\p{Lu}\\p{L}+|e|de|da|do|das|dos)(?:\\s+(?:\\p{Lu}\\p{L}+|e|de|da|do|das|dos)){0,5})?(?=\\s|$)', 'gu'), ' ')
      .replace(/\s{2,}/g, ' ').trim();
    // O mesmo timbre com o ESTADO por extenso, no meio ou no fim da celula, com
    // as colunas da linha coladas antes e o numero da folha depois (18/09/2026):
    //   "...ajuste de 5 em R$ 311,60 Estado do Rio Grande do Sul MUNICIPIO DE
    //   FORQUETINHA 33 5°C; com desligamento automatico." (Forquetinha/RS);
    //   "...garantia UN 10 55 98415-0409 | 55 98449-1068 @prefeituradesji Estado
    //   do Rio Grande do Sul MUNICIPIO DE SAO JOSE DO INHACORA minima de 12
    //   meses." (Sao Jose do Inhacora/RS);
    //   "...MANUAL DE INSTRUCOES 7,69% 1,0000 Un Municipio de Valparaiso Estado
    //   de Sao Paulo" (Valparaiso/SP).
    const est = UF_POR_EXTENSO[e[C.uf]];
    if (munRe && est) {
      // numero solto so depois da unidade ("UN 10"): antes dela pode ser dado
      // do produto ("CONJUNTO ... TAMANHO 6 10,00% 6,0000 Un")
      const colunas = '(?:\\s+(?:R\\$\\s*[\\d.]+,\\d{2}|\\d{1,3}(?:[.,]\\d+)?%|\\d+,\\d{4}|(?:UN|UND|Un|Und|UNID|Unid|CJT)\\.?(?:\\s+\\d{1,5})?(?=\\s)|P[áa]g(?:ina)?\\.?(?:\\s*\\d{1,3})?))*';
      const contato = '(?:\\s+(?:\\d{2}\\s+)?\\d{4,5}-\\d{4}(?:\\s*\\|)?)*(?:\\s+@\\S+)?';
      const munS = munRe.replace(/ +/g, '\\s+');
      const timbre = '(?:Estado\\s+d[eo]\\s+' + est + '\\s+MUNIC[ÍI]PIO\\s+DE\\s+' + munS + '|Munic[íi]pio\\s+de\\s+' + munS + '\\s+Estado\\s+d[eo]\\s+' + est + ')';
      it[6] = it[6].replace(new RegExp(colunas + contato + '\\s+' + timbre + '(?:\\s+\\d{1,3}(?=\\s))?(?=\\s|$)', 'giu'), ' ')
        // e o rodape "Sao Jose do Inhacora/RS | prefeito@...", com a unidade e a
        // quantidade da linha na frente, no meio da celula (22/09/2026)
        .replace(new RegExp('(?:\\s(?:UN|UND|Unid\\.?|Unidade)\\s+\\d{1,5})?\\s+' + munS + '\\s*/\\s*' + e[C.uf] + '\\s*\\|\\s*\\S+@\\S+', 'giu'), ' ')
        .replace(/\s{2,}/g, ' ').trim();
    }
    // o numero e o codigo BEC do item seguinte colados no fim: "... BALCAO. 110 -
    // 146244" (Valparaiso/SP, item 109)
    it[6] = it[6].replace(new RegExp('\\s+' + (+it[0] + 1) + '\\s*-\\s*\\d{5,7}$'), '')
      // e as colunas da planilha de precos que sobram no fim: "...COR: BRANCO
      // 91,67% 44,0000 Un" (percentual de desconto, quantidade e unidade)
      .replace(/(?:\s+(?:\d{1,3}(?:[.,]\d+)?%|\d+,\d{4}|UN|Un|UND|Und|UNID|Unid|Unidade|CJT|\d(?:\.\d{1,2}){3,}))+$/, '')
      // e a quantidade com a "Ultima Compra" do relatorio de precos: "... 5
      // Ultima Compra: 7/2021 - 375,0000" (Congonhal/MG), que na linha do item
      // 47 emendava o item 48 inteiro
      .replace(/\s+(?:\d[\d.]*\s+)?[ÚU]ltima\s+Compra:.*$/s, '')
      // A tabela "MATERIAL CODIGO DESCRICAO UN QTD N+1." de Congonhal/MG: o
      // codigo na frente, o "UN" da coluna no meio da celula ("TANQUE EM ACO UN
      // INOX") e a unidade, a quantidade e o numero do item seguinte no fim
      // ("... 1.400 W. UN 5 4."), quando nao o item seguinte inteiro ("UN 15 39.
      // FOGAO GAS, MAT...") ou o corpo do edital ("UN 50 A quantidade de cada
      // item foi estabelecida...") (22/09/2026).
      // So com o numero seguinte e ponto: "UN 02 Equipamento com funcionamento
      // eletrico..." (Cacapava do Sul/RS) e a continuacao da celula.
      .replace(/\s(?:UN|UND|Unid\.?|Unidade)\s+\d{1,5}\s+\d{1,3}\.(?=\s|$).*$/su, '')
      // as colunas soltas no fim: "... aplicaveis. UN 10 U de OS" (Senador
      // Firmino/MG), "... cor branca 2 5 un" (Inhumas/GO), "... 12 meses un"
      // (Brasilandia/MS)
      .replace(/\s+UN\s+\d{1,5}\s+\p{L}\s+de\s+OS$/u, '').replace(/(?:\s+\d{1,5}){0,3}\s+un$/i, '')
      // e as da EBSERH: "... Sem instalação. unidade 20 0 0 îì 0 0 0,5"
      .replace(/\s+unidade(?:\s+(?:[\d,.]+|[^\sA-Za-z0-9]{1,6}))+$/i, '').replace(/(?<=instala[çc][ãa]o\.?)\s+unidade$/i, '')
      // ... e no meio, quando a linha seguinte veio junto: "... Sem instalacao
      // Unidade 5 0 0 ñ 0 0 0,5 7 480929 155125 Ar-Condicionado, Split cassete
      // 4 vias, 60000 BTU/h..." (EBSERH Santa Maria/RS, item 6)
      .replace(/\s+unidade\s+\d{1,5}\s+\d+\s+\d+\s+\S{1,4}\s+\d+\s+\d+\s+[\d,]+\s.*$/is, '')
      // e o "Soma" da coluna de total (Pirajuba/MG), e "UNIDADE 1 a" (Viamao/RS)
      .replace(/\s+Soma$/, '').replace(/\s+UNIDADE\s+\d{1,5}\s+\p{L}$/u, '')
      // o cabecalho da tabela da folha seguinte fechando a celula: "... cor
      // 431265 29464 | 38 Item Descricao Catmat Codigo IPM Un" (Mercedes/PR)
      .replace(/(?:\s+[\d|]+)*\s(?:Item|Ordem)\s+Descri[çc][ãa]o(?:\s+[\p{L}.\-–]+){0,8}\s*$/u, '')
      // O cabecalho da tabela repetido no meio da celula, quando a folha vira:
      // "... divisoria fixa, 2 Ordem Descricao Unid. Quant. Valor Max. Unit.
      // Valor Max. Total porta, com dreno..." (Florestopolis/PR)
      // (com os codigos e a folha antes, "431265 29464 | 38 Item Descricao
      // Catmat Codigo IPM Und Qtd R$ Unit R$ Total", Mercedes/PR)
      .replace(/(?:(?:\s+\d{4,})*\s+\|\s+\d{1,3})?\s(?:Item|Ordem)\s+(?:Produto\s+-\s+)?Descri[çc][ãa]o[\s\p{L}.\-–$]{5,160}?(?:Total|m[áa]xima)(?=\s|$)/u, ' ')
      // e a letra que abre a frase seguinte, colada no ponto: "...ficha tecnica
      // oficial do fabricante.O" (Januaria/MG, "O licitante vencedor devera...")
      .replace(/([.;])\s?[A-ZÀ-Ú]$/, '$1');
    // O preco unitario e o total da linha no meio da celula, com o numero da
    // folha depois: "...drenagem por sistema manual ou 484,84 R$ 2.424,20 44
    // automatico" (Arvorezinha/RS, item 55). So quando o primeiro valor e o
    // preco do item no PNCP: dois valores seguidos nao sao especificacao.
    if (+it[4] > 0) {
      const brl = (+it[4]).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+,)/g, '.');
      const par = '\\s(?:R\\$\\s*)?' + brl.replace(/\./g, '\\.') + '\\s+R\\$\\s*\\d{1,3}(?:\\.\\d{3})*,\\d{2}';
      // no fim, leva junto o numero do item seguinte ou da folha ("... classe
      // A. 2.112,17 R$ 6.336,51 9. 2", Vista Alegre/RS)
      it[6] = it[6].replace(new RegExp(par + '[\\s\\d.]*$', 'u'), '')
        .replace(new RegExp(par + '(?:\\s+\\d{1,3}(?=\\s+\\p{Ll}))?(?=\\s)', 'u'), '');
    }
    // O comeco da linha seguinte que sobra no fim: "...COR BRANCA 35" (o
    // numero do item 35 em Tuneiras do Oeste/PR) e "...garantia mínima de 12
    // meses. 0045 81754" (numero e codigo em Senador Firmino/MG), 22/09/2026.
    // (so depois do ponto final: o numero solto no fim do texto costuma ser do
    // produto — "PACOTE COM 100 UNIDADES PACOTE 100", "EMAI BP 150")
    it[6] = it[6].replace(/(?<=\.)\s+\d{2,6}(?:\s+\d{2,9})+\s*$/, '');
    // A unidade que abre a celula: "UND AR-CONDICIONADO SPLIT 9.000 BTUs..."
    // (Maria Helena/PR, 23/09/2026).
    it[6] = it[6].replace(/^(?:UNID(?:ADE)?|UND|UN|PC|P[ÇC]|CX)\.?\s+(?=\p{Lu}\p{L})/u, '');
    // A coluna da quantidade enfiada no meio da celula: "BEBEDOURO INDUSTRIAL
    // 100 LITROS 2,00 UNI BEBEDOURO INDUSTRIAL DE 100 LITROS...", "FREEZER
    // HORIZONTAL DE 2 PORTAS 546 LITROS 6,00 UNI 3.913,89 23.483,34. Com
    // capacidade..." (Santa Amelia/PR, 22/09/2026).
    it[6] = it[6].replace(/\s+\d{1,4},\d{2}\s+UNI(?:D|DADE|DADES)?\.?(?:\s+[\d.]+,\d{2}){0,2}\.?\s+/gi, ' ');
    // e a coluna que sobra no fim: "...12000 BTUS QUENTE/FRIO 2 13 R$" (Boa
    // Vista do Burica/RS); "...COR: BRANCO 91,67% 44,0000 Un 3 - 57622"
    // (Valparaiso/SP: percentual do beneficio, quantidade, unidade e o codigo
    // do proximo item); e o codigo do material na frente, "05.1091
    // REFRIGERADOR 412 LITROS..." (Itanhaem/SP), 22/09/2026.
    it[6] = it[6].replace(/\s+(?:\d{1,4}\s+){1,3}R\$\s*$/, '')
      .replace(/\s+\d{1,3},\d{2}%\s+[\d.,]+\s+Un\.?(?:\s+\d+\s*-\s*\d+)?\s*$/i, '')
      .replace(/^\d{2}\.\d{4}\s+(?=\p{Lu})/u, '')
      // e a coluna da pesquisa de precos: "...Potência: 100/1550 W, 638859
      // Média" — codigo do catalogo e o criterio do preco (Cáceres/MT)
      .replace(/[\s,]+\d{5,7}\s+(?:M[ée]dia|Mediana)\b[\s\S]*$/, '');
    // A linha ANTERIOR grudada na frente, quando a tabela abre cada linha com o
    // numero do item e os codigos: "...Tipo: Vertical 1 unidade 15 5581 633899
    // Condicionador de ar, tipo Split..." (Caxias do Sul/RS, item 15, tabela
    // "Item Codigo SAMAE CATMAT Descricao Quant. Um.", 22/09/2026). Corta tudo
    // o que vem antes do numero DESTE item.
    {
      const abre = new RegExp('(?:^|[\\s.;:])(?:[\\d.,]{1,6}\\s+)?(?:unidades?|unid|und|un|pe[çc]as?|pc|m²|m2)\\.?\\s+'
        + it[0] + '\\s+\\d{3,8}\\s+\\d{3,8}\\s+(?=\\p{Lu})', 'u');
      const m = abre.exec(it[6]);
      if (m && m.index > 0) it[6] = it[6].slice(m.index + m[0].length).trim();
    }
    // O rodape do sistema de processo e os relatorios anexos colados depois da
    // especificacao (Campo Grande/MS, 21/09/2026): "... sem lustre. 120 Total:
    // 120 Item 22 1 Un.", "... baixa. Total: 00009636 - Forno ... HASH: ebe0...
    // Juntado em 06/08/2026 por ... Relatorio de Quantitativo de Orgaos",
    // "... inox. 1 Un. 5212 - Aparelhos e Utensilios Domesticos Sim -- Item",
    // "... FECHO REFORÇADO. Observação: Valor unitário, inclusos Frete CIF"
    // (Sao Gabriel/RS, 22/09/2026).
    // Corta no primeiro deles. "Total:" so depois de numero ou ponto:
    // "Capacidade Total: 400 litros" e do produto.
    const rodape = /(?:\s+\d+|\.)\s+Total:\s+\d|\s+HASH:\s*[0-9a-f]{16}|\s+Juntado\s+em\s+\d{2}\/\d{2}\/\d{4}|\s+C[óo]digo\s+do\s+documento:|\s+Relat[óo]rio\s+de\s+(?:Quantitativo|Itens\s+com\s+Aplica)|\s+(?:UN\s+\d{1,5}\s+)?A\s+quantidade\s+de\s+cada\s+item\s+foi\s+estabelecida|\s+Valor\s+Total\s+(?:Global|R\$)|\s+VALOR\s+TOTAL\s+ESTIMADO|\s+Valor\s+[Tt]otal\s+[Ee]stimado|\s+TOTAL\s+LOTE\s+\d|\s+(?:UNID\.?\s+\d+\s+)?TOTAL\s+DO\s+LOTE|\s+(?:UNI?D?\.?\s+[\d.]+\s+)?\(COTA\s+RESERVADA|\s+Total\s+R\$\s*[\d.]+,\d{2}|\s+(?:Valor\s+)?[Ee]stimado\s+da\s+contrata[çc][ãa]o:|\s+VALOR\s+ESTIMADO\s+DA\s+CONTRATA|\s+(?:Und\s+\d+\s+)?JUSTIFICATIVA\s+(?:A|O|DA|DO|E)\s|\s\d{1,2}\.\s+N[úu]mero\s+da\s+Unidade\s+Or[çc]ament|\s+VALOR\s+TOTAL\s+(?:GLOBAL|R\$)|\s\d{1,2}(?:\.\d{1,2})?\.?\s+(?:Valor\s+(?:total\s+)?estimado|Metodologia\s+aplicada|Estimativa\s+d[oa]\s+(?:valor|pre[çc]o))|\s+\d+\s*-?\s*Un\.?\s+\d{4}\s+-\s+\p{Lu}|\s+Observa[çc][ãa]o:\s+Valor\s+unit[áa]rio/u.exec(it[6]);
    if (rodape) it[6] = it[6].slice(0, rodape.index + (rodape[0][0] === '.' ? 1 : 0)).trim();
    // A clausula da minuta do contrato depois da tabela dela: "... NA COR
    // BRANCA. 1 EM II – DO PRAZO DE VIGÊNCIA DO CONTRATO 2. Este instrumento
    // ..." (Barueri/SP, 22/09/2026). Titulo em romano com travessao e "DO/DA".
    const clausula = /(?<=\.)(?:\s+\d{1,4}(?:\s+\p{Lu}{1,3})?)?\s+[IVX]{1,5}\s*[–-]\s*D[OA]S?\s+\p{Lu}{3,}/u.exec(it[6]);
    if (clausula && clausula.index > 30) it[6] = it[6].slice(0, clausula.index).trim();
    // E o texto de OUTRO item do mesmo edital emendado: a tabela de quantidades
    // por orgao repete as descricoes em sequencia, e o "Freezer - Tipo:
    // horizontal" levava junto "Freezer - Tipo: vertical ... Lavadora ...
    // Televisor" (Campo Grande/MS, 21/09/2026). Corta onde comeca a descricao do
    // PNCP de outro item (as seis primeiras palavras, de ao menos 30 letras),
    // salvo quando ela abre igual a deste (o mesmo produto em cota reservada).
    const junta = t => normIgual(t).replace(/\s+/g, ' ').trim();
    // A comparacao e so pelas LETRAS: o PNCP de Tuneiras do Oeste/PR escreve o
    // item 35 como "GELADEIRAREFRIGERADOR FROST FREE DUPLEX 400L" e o edital
    // como "GELADEIRA/REFRIGERADOR ...", e a barra fazia o corte falhar — o
    // item 34 saia com o 35 colado no fim (22/09/2026).
    const soLetras = s => {
      const n = normIgual(s); let out = ''; const idx = [];
      for (let i = 0; i < n.length; i++) if (/[a-z0-9]/.test(n[i])) { out += n[i]; idx.push(i); }
      return { out, idx };
    };
    const alvoL = soLetras(it[6]), proprioL = soLetras(it[1]).out;
    let corte = -1;
    for (const x of v.itens) {
      if (x[0] == it[0]) continue;
      const pal = junta(x[1]).split(' ').slice(0, 6);
      if (pal.length < 6) continue;
      const pre = soLetras(pal.join(' ')).out;
      // (e nao corta pelo rotulo que o rotulo DESTE item ja contem: em
      // Timburi/SP o item 11 e "AR-CONDICIONADO TIPO SPLIT HI-WALL, CAPACIDADE
      // DE 9.000" e o 12 e "AR-CONDICIONADO 12.000 BTU AR-CONDICIONADO TIPO
      // SPLIT HI-WALL, CAPACIDADE DE 12.000" — o 12 perdia o descritivo inteiro)
      if (pre.length < 26 || proprioL.includes(pre)) continue;
      const k = alvoL.out.indexOf(pre);
      if (k <= 0) continue;
      const orig = alvoL.idx[k];
      if (orig >= 20 && (corte < 0 || orig < corte)) corte = orig;
    }
    if (corte > 0) it[6] = it[6].slice(0, corte).replace(/[\s,;:–-]+$/, '').trim();
    if (it[6].length < 30) { it[6] = ''; continue; }
    // so o cabecalho da tabela: "AR CONDICIONADO PORTA TIL 3 Unidade B)
    // ESPECIFICAÇÕES MÍNIMAS Descrição" (Braganca Paulista/SP)
    // (em maiusculas: "...as especificações mínimas estabelecidas." fecha o
    // descritivo do cutter de Juiz de Fora/MG)
    if (/ESPECIFICA[ÇC][ÕO]ES\s+M[ÍI]NIMAS(?:\s+Descri[çc][ãa]o)?\s*$/.test(it[6])) { it[6] = ''; continue; }
    // O descritivo que ABRE com a descricao de outro item, bem mais parecido com
    // ela do que com a deste: o item 5 de Campo Grande/MS e "Bebedouro - Tipo:
    // industrial; Material: aco inox; Sistema de filtragem: com carvao" e
    // recebia "Bebedouro - Tipo: industrial; Material: aco inox 430; Acompanha:
    // 4 torneiras", que e o item 8 (21/09/2026). Nenhum e melhor que o errado.
    // So letras e numeros: "18.000 BTU/H.:" e "18.000 BTU/H." sao o mesmo (Quarai/RS).
    const comum = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };
    const letras = t => normIgual(t).replace(/[^a-z0-9]/g, '');
    const abre = letras(it[6]).slice(0, 250), meu = comum(abre, letras(it[1]));
    if (v.itens.some(x => x[0] != it[0] && comum(abre, letras(x[1])) >= Math.max(35, meu + 12))) { it[6] = ''; continue; }
    // as colunas da tabela de quantidades por orgao no meio da especificacao:
    // "Material: tem 20 1 Un metal; ... 3 pas; 0 0 0 0 140. Velocidade: 3"
    if (/(?:^|\s)(?:0\s+){3,}\d/.test(it[6])) { it[6] = ''; continue; }
    // e a unidade com as quantidades no fim: "... 127/220 V. 1-Un. 1.949 489"
    it[6] = it[6].replace(/\s+\d+\s*-\s*Un\.?(?:\s+[\d.,]+)*$/, '');
    // a coluna da unidade depois de dois-pontos, com o que a folha trouxe
    // junto: "ALTURA MÍNIMA 1,20 : unidade 4 ISTÊNCIA SOCIAL assistencia...",
    // "PROFUNDIDADE 39,80CM:" (Jaíba/MG); e unidade, quantidade, lote e o
    // rotulo da coluna do item: "(EM INOX) Unidade 2 LOTE 011 Item" (Três
    // Lagoas/MS), 22/09/2026
    it[6] = it[6].replace(/\s*:\s*unidade\s+\d+\b[\s\S]*$/i, '').replace(/\s*:$/, '')
      .replace(/\s+Unidade\s+[\d.,]+\s+LOTE(?:\s+\d{1,4})?\s+Item\b[\s\S]*$/i, '');
    // (e o codigo do material na frente, com o "UN" que a coluna enfia no meio)
    // (aqui ainda sem o espaco que a revisao ortografica poe: "MATERIAL27740")
    if (/^MATERIAL\s*\d{4,6}\s+\p{Lu}/u.test(it[6])) it[6] = it[6].replace(/^MATERIAL\s*\d{4,6}\s+/, '').replace(/(?<=[\p{L}\d.,])\s+UN\s+(?=\p{Lu})/u, ' ');
    // o que o SIAFISICO poe antes da especificacao: "FORNECIMENTO (SIAFISICO)
    // QUANTIDADE 01 6502113 - Especificacao Tecnica: Ventilador de Parede; ..."
    // (Secretaria da Saude de SP, pregao 11)
    it[6] = it[6].replace(/^FORNECIMENTO\s*\(SIAF[IÍ]SICO\)[^:]{0,60}?Especifica[çc][ãa]o\s+T[ée]cnica:\s*/i, '');
    // O fim da celula repetido pela virada de folha: o PDF de Pirajuba/MG
    // redesenha na folha seguinte "(LÍQUIDO) 1/4 POL CÓDIGO EAN ... INSTALADO
    // POR REDE AUTORIZADA.", e o descritivo saia com a metade final duas vezes.
    // Sai a repeticao quando TODO o resto ja esta antes, sem contar espaco
    // ("PROFUNDIDAD E", "CLASSIFICAÇÃ O" da segunda copia).
    it[6] = tiraRepeticao(it[6]);
    // Frase cortada no meio: "...Os equipamentos instalados atualmente deverão
    // ser desinstalados pela" (Palmeiras de Goiás/GO), quando o edital segue com
    // "contratada e devolvidos...". Volta ao ultimo ponto, se ele guarda a
    // maior parte do texto; o resto e a clausula de instalacao, nao o produto.
    if (it[6].length > 200 && !/[.;:!?)"”»]$/.test(it[6])) {
      const plano = secoesPlano || (secoesPlano = secoes.replace(/\s+/g, ' '));
      const fim = it[6].slice(-40), k = plano.indexOf(fim);
      const p = it[6].lastIndexOf('. ');
      // (a unidade minuscula da coluna seguinte nao e continuacao: "...Ideal
      // para uso domestico e escritorio un 200,00", Sao Valerio do Sul/RS)
      const depois = plano.slice(k + fim.length, k + fim.length + 24);
      if (k >= 0 && /^ [a-zà-ÿ]/.test(depois) && !/^ (?:un|und|unid|pc|p[çc]|cx|kit|cj|cjt|par|jg|pct)\.?\s+[\d.,]/.test(depois) && p > it[6].length * 0.6)
        it[6] = it[6].slice(0, p + 1);
    }
    // Celula cortada pela virada de folha que termina pendurada numa
    // preposicao: "...ralagao e processamento de alimentos, com" (Guia Lopes da
    // Laguna/MS), quando o resto ficou depois do cabecalho da folha seguinte.
    // Volta a ultima virgula ou ponto; perto do comeco, nao sobra descritivo.
    // So a minuscula: a maiuscula costuma ser sobra de coluna, como o "EM" de
    // "COPO COLETOR E PENEIRA EM IC BASE: 253500" (Minacu/GO).
    if (/(?<!\p{L})(?:com|em|de|da|do|das|dos|para|por|e|ou|no|na|nos|nas|ao|aos|sem|entre)$/u.test(it[6])) {
      const p = Math.max(it[6].lastIndexOf(', '), it[6].lastIndexOf('. '), it[6].lastIndexOf('; '));
      it[6] = p > it[6].length * 0.5 ? it[6].slice(0, it[6][p] === ',' ? p : p + 1) : '';
      if (!it[6]) continue;
    }
    if (/SUM[ÁA]RIO/i.test(it[6]) && /\.{20,}\s*\d/.test(it[6])) { it[6] = ''; continue; }
    // justificativa do Termo de Referencia no lugar da especificacao: "VENTILADOR
    // DE PAREDE - 60 CM 06 unidades As quantidades foram definidas..." (Guia
    // Lopes da Laguna/MS)
    if (/As\s+quantidades\s+foram\s+definidas|JUSTIFICATIVA\s+D[AO]\s|FUNDAMENTA[ÇC][ÃA]O\s+E\s+DESCRI/i.test(it[6])) { it[6] = ''; continue; }
    // a pesquisa de precos colada na especificacao: "LTDA 2.981,69 2.981,69
    // 06/08/2026 Lançado por: ...", "Metodologia Menor Valor Valor Estimado"
    // (Viçosa/MG). O que ficou antes nao da para separar com seguranca.
    if (/Lan[çc]ado\s+por:|Metodologia\s+Menor\s+Valor|Menor\s+Valor\s+Valor\s+Estimado/i.test(it[6])) { it[6] = ''; continue; }
    const btuRot = btusDe(it[1]), btuDesc = btusDe(it[6]);
    if (btuRot.size && btuDesc.size && ![...btuRot].some(b => btuDesc.has(b))) it[6] = '';
    // e o fogao de 4 bocas nao fica com o descritivo do de 6 (Viamao/RS)
    const bocaRot = bocasDe(it[1]), bocaDesc = bocasDe(String(it[6]).slice(0, 200));
    if (bocaRot.size && bocaDesc.size && ![...bocaRot].some(b => bocaDesc.has(b))) it[6] = '';
  }

  // O arquivo que nao cita nenhum produto do radar e de OUTRA licitacao: a
  // prefeitura de Marcelandia/MT publicou no pregao 31/2026 (eletrodomesticos)
  // o edital do 029/2026 (materiais pedagogicos), e o item 3 saia com uma linha
  // dele (22/09/2026). Nenhum descritivo sai de um edital assim.
  {
    const plano = normIgual(secoes);
    const radar = e[C.itens] || [];
    const cita = radar.some(r => { const w = normIgual(r[3]).split(/[^a-z0-9]+/).find(x => x.length >= 5); return w && plano.includes(w); });
    // (so sem planilha de itens: em Juiz de Fora/MG os descritivos vem do .xlsx)
    if (!v.planilha && radar.length && plano.length > 8000 && !cita) for (const it of v.itens) it[6] = '';
  }
  // O item que ficou sem nada e que o edital descreve com o MESMO texto do
  // PNCP, seguido do preco dele: "61 910.001.078 FOGAO A GÁS, 4 BOCAS, 127V,
  // FORNO AUTOLIMPANTE, IGNIÇÃO AUTOMÁTICO, COM PÉS. UN 3, 680,25" (Pongaí/SP),
  // "06 37.1407 Bebedouro/ Purificador Refrigerado ... 3 R$1.375,7033"
  // (Parapuã/SP). A escolha la em cima recusa a celula que so repete o rotulo —
  // em Guia Lopes da Laguna/MS ela tomava o lugar da especificacao inteira —,
  // mas quando nada mais sobrou, o descritivo do edital e esse mesmo. Entre o
  // texto e o preco so pode haver unidade, quantidade e codigo: se o edital
  // continua a descricao, a celula e maior que o rotulo e nao e este caso
  // (22/09/2026).
  {
    const radar = new Set((e[C.itens] || []).map(r => r[5]));
    const plano = normIgual(secoes);
    const SO_COLUNAS = /^(?:[\s\d.,;:()\/$|-]|r\$|\b(?:un|und|unid|unidade|unidades|pc|pca|peca|cx|kit|jg|par|pct)\b)*$/;
    for (const it of plano.length === secoes.length ? v.itens : []) {
      if (it[6] || !radar.has(it[0]) || String(it[1]).length < 25) continue;
      const toks = normIgual(it[1]).split(/[^a-z0-9]+/).filter(Boolean);
      if (toks.length < 4) continue;
      // (o preco com quatro casas tambem: "R$3.082,6697" para os 3.082,67 do
      // PNCP, Parapuã/SP — confere ate a primeira casa)
      const [int, dec] = (+it[4]).toFixed(2).split('.');
      const precos = [int.replace(/\B(?=(\d{3})+(?!\d))/g, '.'), int].map(p => p.replace(/\./g, '\\.') + ',' + dec[0] + '\\d');
      const re = new RegExp('(?<![a-z0-9])' + toks.join('[^a-z0-9]{1,6}') + '(?![a-z0-9])', 'g');
      for (const m of plano.matchAll(re)) {
        let fim = m.index + m[0].length;
        // o parentese e o ponto que fecham o rotulo: "CAFETEIRA ELÉTRICA -
        // GRANDE (127V)" (Três Lagoas/MS)
        const abertos = (m[0].match(/\(/g) || []).length - (m[0].match(/\)/g) || []).length;
        if (abertos > 0 && secoes[fim] === ')') fim++;
        if (/\.\s*$/.test(it[1]) && secoes[fim] === '.') fim++;
        const depois = plano.slice(fim, fim + 70);
        const k = Math.min(...precos.map(p => { const x = depois.search(new RegExp('(?<![\\d.,])' + p)); return x < 0 ? 1e9 : x; }));
        if (k === 1e9 || !SO_COLUNAS.test(depois.slice(0, k))) continue;
        it[6] = secoes.slice(m.index, fim).trim();
        break;
      }
    }
  }
  // Por ultimo, o erro de digitacao e a palavra colada que vieram do proprio
  // edital: "na cor brnca", "Atraves Dechave Seletora". Ver ortografia.mjs.
  for (const it of v.itens) if (it[6]) it[6] = revisaOrtografia(it[6]);

  // O LOTE pelo titulo da secao da tabela, quando nenhuma outra via o leu: o
  // edital de Renascenca/PR separa os itens em "LOTE 1 - ELETROELETRONICOS",
  // "LOTE 2 - ELETRODOMESTICOS"... e numera corrido ("03 483886 2 UN BEBEDOURO"
  // e o item 3, do lote 2), 22/09/2026. Cada item fica com o ultimo titulo de
  // lote antes do seu descritivo no texto. So com dois lotes ou mais, e so
  // quando nenhum item ja tem lote.
  if (!v.itens.some(it => it[7])) {
    const titulos = [...secoes.matchAll(/\bLOTE\s*0*(\d{1,3})\s*[-–:]\s*\p{Lu}/gu)].map(m => ({ i: m.index, n: +m[1] }));
    if (new Set(titulos.map(x => x.n)).size >= 2) {
      const radar = new Set((e[C.itens] || []).map(r => r[5]));
      for (const it of v.itens) {
        if (!it[6] || !radar.has(it[0])) continue;
        const k = secoes.indexOf(String(it[6]).slice(0, 40));
        if (k < 0) continue;
        const antes = titulos.filter(x => x.i < k).pop();
        if (antes) { it[7] = antes.n; it[8] = null; }
      }
    }
  }
  // E o transcrito a mao, onde nenhuma regra le a tabela (descritivos-manuais.json).
  // So vale enquanto o item do PNCP tem a quantidade e o preco conferidos.
  for (const [n, m] of Object.entries((manuais[e[C.path]] || {}).itens || {})) {
    const it = v.itens.find(x => x[0] == n);
    if (!it || +it[2] !== m.qtd || Math.abs(+it[4] - m.valor) > 0.005) {
      console.log(`  descritivo manual ignorado: ${e[C.path]} item ${n} nao confere com o PNCP`);
      continue;
    }
    if (!it[6]) itensRicos++;
    it[6] = m.texto;
  }
}

fs.writeFileSync(arquivo, JSON.stringify(base), 'utf8');
console.log(`${comTexto} edital(is) com texto de secao · ${semTexto} sem`);
console.log(`${itensRicos} de ${itensTotal} itens ganharam descritivo completo`);
console.log(`docs/descritivos.json: ${(fs.statSync(arquivo).size / 1024).toFixed(0)} KB`);
