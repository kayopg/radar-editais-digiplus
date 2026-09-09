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
const normIgual = s => String(s ?? '').toLowerCase().replace(/[^\x00-\x7f]/g, c => ACENTOS[c] || c);

// Palavras que o PNCP poe na frente do nome e o edital nao usa: "Aparelho Ar
// Condicionado" no catalogo e "AR CONDICIONADO SPLIT" no termo de referencia.
// Enquanto a ancora comecava por "aparelho", nada casava.
const GENERICAS = /^(?:aparelho|equipamento|conjunto|kit|material|produto|item|maquina)\s+/i;

function ancoraDe(plano, curto) {
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
  for (const t of tentativas) {
    const a = normIgual(t).replace(/\s+/g, ' ').trim();
    if (a.length >= 6 && plano.includes(a)) return a;
  }
  return '';
}

// Teto por item. Existe so para o ULTIMO item da tabela, que nao tem um proximo
// para fechar a celula.
const TETO_ITEM = 2200;

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
function descritivosPorItem(secoes, itens) {
  const plano = normIgual(secoes);
  // Uma marca por POSICAO, com todos os itens que casam ali. Guardar uma marca
  // por item dava marcas repetidas na mesma posicao quando dois itens sao o
  // mesmo produto, e o trecho entre duas marcas coladas tem tamanho zero: em
  // Salto/SP a geladeira do item 5 ficava sem descritivo e a do item 6, que e
  // identica, ficava com ele.
  const porPos = new Map();
  itens.forEach((it, i) => {
    const a = ancoraDe(plano, it[1]);
    if (!a) return;
    let de = 0;
    for (;;) {
      const k = plano.indexOf(a, de);
      if (k < 0) break;
      if (!porPos.has(k)) porPos.set(k, []);
      porPos.get(k).push(i);
      de = k + a.length;
    }
  });
  const posicoes = [...porPos.keys()].sort((a, b) => a - b);

  const melhor = new Map();
  posicoes.forEach((pos, k) => {
    const proxima = k + 1 < posicoes.length ? posicoes[k + 1] : secoes.length;
    const fim = Math.min(proxima, pos + TETO_ITEM, secoes.length);
    const txt = cortaNaProximaLinha(secoes.slice(pos, fim).replace(/\s+/g, ' ').trim());
    for (const i of porPos.get(pos)) {
      const atual = melhor.get(i);
      if (!atual || txt.length > atual.length) melhor.set(i, txt);
    }
  });
  return melhor;
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
    // So vale guardar o que acrescenta de verdade ao rotulo que ja temos, e so
    // se comecar no nome do produto.
    //
    // A regra era "40 caracteres a mais que o rotulo", e so isso. Ela castigava
    // justamente o item cujo rotulo do PNCP ja e comprido: em "Fogao Industrial
    // aplicacao: alimentacao e nutricao, caracteristicas adicionais: sem forno"
    // o rotulo tem 150 caracteres, entao o edital precisava de 190 para valer —
    // e uma celula de 160 caracteres, que E o texto oficial, era recusada.
    // Eram 409 itens nessa situacao, medidos em 09/09/2026 quando o usuario
    // notou que os descritivos tinham encolhido.
    //
    // Agora vale por qualquer um dos dois caminhos: acrescenta 40 ao rotulo, ou
    // e uma especificacao substancial por si (150+) e ainda maior que o rotulo.
    const vale = completo
      && (completo.length > it[1].length + 40
          || (completo.length >= 150 && completo.length > it[1].length));
    if (vale && !comecaNoMeio(completo) && !AINDA_SUJO.test(completo)) {
      it[6] = completo;
      itensRicos++;
    } else if (it.length > 6) it.length = 6;
  });
}

fs.writeFileSync(arquivo, JSON.stringify(base), 'utf8');
console.log(`${comTexto} edital(is) com texto de secao · ${semTexto} sem`);
console.log(`${itensRicos} de ${itensTotal} itens ganharam descritivo completo`);
console.log(`docs/descritivos.json: ${(fs.statSync(arquivo).size / 1024).toFixed(0)} KB`);
