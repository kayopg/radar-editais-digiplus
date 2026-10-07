// Prova que a limpeza do texto do PNCP recupera o sinal perdido que chega como
// "?" — e deixa em paz o "?" que e pergunta de verdade.
//
// Todos os casos sao reais, colhidos entre 24 e 28/09/2026. A ordem das regras
// em texto-pncp.mjs importa: em 28/09 uma regra nova ("?" entre letra e
// pontuacao) passou a rodar antes da das aspas e comeu a aspa de fechamento de
// "igual a ?zero?," (Votuporanga/SP). Este teste pega esse tipo de erro.
//
// Uso: node testa-interrogacao.mjs   (sai com codigo 1 se algum caso falhar)
import { limpaTextoPncp } from './texto-pncp.mjs';

const CASOS = [
  // [texto do PNCP, como deve ficar — null quando deve ficar igual]
  ['igual a ?zero?, ou próximo de ?zero?, e', 'igual a “zero”, ou próximo de “zero”, e'],   // Votuporanga/SP
  ['Gás do produto: R600? Tipo de degelo: Manual', 'Gás do produto: R600a Tipo de degelo: Manual'], // Pontão/RS
  ['gás refrigerante R134? e compressor', 'gás refrigerante R134a e compressor'],
  ['NA FORMA ?FRONTAL ELEVADA? (PADRÃO)', 'NA FORMA “FRONTAL ELEVADA” (PADRÃO)'],             // Boa Vista do Buricá/RS
  ['1KG. DESCRIC?A?O DETALHADA: CARACTERI?STICAS FI?SICAS', '1KG. DESCRICAO DETALHADA: CARACTERISTICAS FISICAS'], // Goiânia/GO
  ['(AxLxP).? ? ? ? Quatro pés em tubo', '(AxLxP). Quatro pés em tubo'],                       // Quaraí/RS
  ['ponteiras de borracha, sendo?  ?  quatro para cada', 'ponteiras de borracha, sendo quatro para cada'],
  ['MESA SECRETÁRIA COM DUAS GAVETAS? :MESA: Tampo', 'MESA SECRETÁRIA COM DUAS GAVETAS:MESA: Tampo'],
  ['1.600 PSI;â?¢ Potencia minima: 1.600 W', '1.600 PSI;• Potencia minima: 1.600 W'],       // General Carneiro/PR
  ['VENTILADOR DE PAREDE ? 60 CM', 'VENTILADOR DE PAREDE – 60 CM'],                            // Guia Lopes da Laguna/MS
  ['4 TOMADAS 10A ? NBR 14136', '4 TOMADAS 10A – NBR 14136'],                                  // Crissiumal/RS
  ['Tela: IPS Full HD de 23.8?, ajuste de altura', 'Tela: IPS Full HD de 23.8", ajuste de altura'], // Chapadão do Sul/MS
  ['Tamanho do setor: 512/512e; Forma: 3,5?; as unidades', 'Tamanho do setor: 512/512e; Forma: 3,5"; as unidades'],
  ['TELA LCD 2.5? COM DISPLAY', 'TELA LCD 2.5" COM DISPLAY'],
  ['Smart TV 50?, QLED 4 K, ANDROID', 'Smart TV 50", QLED 4 K, ANDROID'],                       // Inhumas/GO, 06/10
  ['EFICIÊNCIA ENERGÉTICA CLASSE ?A? (PROCEL), INCLUSO', 'EFICIÊNCIA ENERGÉTICA CLASSE “A” (PROCEL), INCLUSO'], // Miranda/MS
  ['Kit com no mínimo 5 discos: ? 01 Disco Ralador Fino (2mm) - cenoura; ? 01 Disco Fatiador', 'Kit com no mínimo 5 discos: • 01 Disco Ralador Fino (2mm) - cenoura; • 01 Disco Fatiador'], // Inhumas/GO                                  // Crissiumal/RS: "tela" diz que e polegada
  ['raladas bem finas. ? 01 Disco Fatiador (1mm) - para repolho. ? 01 Disco Desfiador', 'raladas bem finas. • 01 Disco Fatiador (1mm) - para repolho. • 01 Disco Desfiador'], // Inhumas/GO, ja colapsado
  ['raladas bem finas.\r\n?\t01 Disco Fatiador (1mm) - para repolho e saladas delicadas.\r\n?\t01 Disco Desfiador', 'raladas bem finas. • 01 Disco Fatiador (1mm) - para repolho e saladas delicadas. • 01 Disco Desfiador'], // Inhumas/GO, texto cru
  ['?Conjunto Quadrado em POLIPROPILENO. Modelo: 02 a 06 Anos', 'Conjunto Quadrado em POLIPROPILENO. Modelo: 02 a 06 Anos'], // Faxinal/PR, 07/10
  ['COR AZUL ? TAMPO PLÁSTICO ? 02 a 06 Anos ? INFANTIL ?Conjunto Quadrado em POLIPROPILENO', 'COR AZUL – TAMPO PLÁSTICO – 02 a 06 Anos – INFANTIL – Conjunto Quadrado em POLIPROPILENO'], // Faxinal/PR, item 33
  ['Jato de tinta Heat-Free MicroPiezo®?. Resolução', 'Jato de tinta Heat-Free MicroPiezo®. Resolução'],
  ['Windows Server®? 2003 (SP2) ou mais', 'Windows Server® 2003 (SP2) ou mais'],
  ['28 segundos por página em cores (200 dpi)???. Conectividade:', '28 segundos por página em cores (200 dpi). Conectividade:'],
  // o que tem de ficar como esta
  ['OPTANTE PELO SIMPLES? SIM ( ) NÃO( )', null],                // pergunta de verdade
  ['jogo educativo "qual é a pergunta ?, material', null],       // nome do brinquedo (Cáceres/MT)
  ['ACIONAMENTO PARA ALT?ROTAÇÃO (AR), COM', null],             // falta letra, nao acento (Poconé/MT)
  ['TEMPERATURA DE 2.5? A 8?', null],                           // grau ou polegada: sem palavra de tela, fica
];

let erros = 0;
for (const [ent, esp] of CASOS) {
  const saiu = limpaTextoPncp(ent);
  const alvo = esp === null ? ent.replace(/\s+/g, ' ').trim() : esp;
  if (saiu === alvo) { console.log(`ok    ${ent.slice(0, 60)}`); continue; }
  erros++;
  console.log(`ERRO  ${ent.slice(0, 60)}\n        saiu    : ${saiu}\n        esperado: ${alvo}`);
}
console.log(`\n${CASOS.length - erros} de ${CASOS.length} corretos`);
process.exit(erros ? 1 : 0);
