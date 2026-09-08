// Acha no edital o QUADRO RESUMO — a pagina de abertura que traz, em campos,
// contratante, objeto, valor estimado, data da sessao, criterio de julgamento e
// modo de disputa — e guarda campo a campo em docs/descritivos.json.
//
// O usuario mandou a pagina do pregao 411/2026 da UFPel em 08/09/2026 e disse
// que essa pagina e das mais importantes: e onde se ve, de uma olhada, se vale
// entrar na disputa. Nem todo edital tem, e os que tem nao usam os mesmos
// rotulos, entao o que se procura e a REGIAO do texto onde esses campos se
// concentram.
//
// Nao baixa nada: trabalha sobre o texto que o descritivos.mjs ja extraiu.
//
// Uso: node quadro-resumo.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const arquivo = path.join(DIR, 'docs', 'descritivos.json');
const base = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const dados = JSON.parse(fs.readFileSync(path.join(DIR, 'docs', 'dados.json'), 'utf8'));
const C = dados.colunas.reduce((o, n, i) => (o[n] = i, o), {});

// Rotulo -> como procurar. A ordem e a de leitura da pagina, e o rotulo
// guardado e o nosso, nao o do edital: cada orgao escreve de um jeito
// ("VALOR TOTAL ESTIMADO DA CONTRATAÇÃO", "VALOR ESTIMADO"), e no resumo
// interessa o campo, nao a redacao dele.
const CAMPOS = [
  ['Contratante', /CONTRATANTE(?:\s*\(UASG\))?/i],
  ['Processo', /PROCESSO\s*N[ºo°]?/i],
  ['Objeto', /\bOBJETO\b/i],
  ['Valor estimado', /VALOR\s+(?:TOTAL\s+)?ESTIMADO(?:\s+DA\s+CONTRATA[ÇC][ÃA]O)?/i],
  ['Sessão pública', /DATA\s+DA\s+SESS[ÃA]O\s+P[ÚU]BLICA|SESS[ÃA]O\s+P[ÚU]BLICA/i],
  ['Critério de julgamento', /CRIT[ÉE]RIO\s+DE\s+JULGAMENTO/i],
  ['Modo de disputa', /MODO\s+DE\s+DISPUTA/i],
  // Sem sufixo livre: com "[^:]{0,40}" o casamento arrastava o texto em
  // minuscula que vem depois ("TRATAMENTO FAVORECIDO PARA ME / EPP /
  // EQUIPARADAS Sim.") e reprovava no teste de caixa alta, entao o rotulo nao
  // virava marca e o campo anterior seguia por cima dele.
  ['Tratamento ME/EPP', /TRATAMENTO\s+FAVORECIDO/i],
  ['Preferência ME/EPP', /(?:EXCLUSIVIDADE|EXCLUSIVO|PREFER[ÊE]NCIA)\s+(?:PARA\s+)?ME\s*\/?\s*EPP/i],
  ['Margem de preferência', /MARGEM\s+DE\s+PREFER[ÊE]NCIA/i]
];

// Distancia maxima entre dois campos do mesmo quadro. O quadro cabe numa
// pagina; passando disso sao campos soltos pelo edital, que e outra coisa.
const JANELA = 1200;
const MIN_CAMPOS = 4;
const MAX_VALOR = 220;

// Rodape que cai no meio do quadro quando ele atravessa a quebra de pagina.
const LIXO = [
  /\s*www\.[^\s]+/gi,
  /\s*CEP[:\s]*\d{5}-?\d{3}/gi,
  /\s*CNPJ[:\s]*[\d./\-]*/gi,
  /\s*(?:Rua|Avenida|Av\.|Praça)\s+[^,]{3,45},\s*n?º?\s*\d+[^,]{0,30},?/gi,
  /\s*Estado do [A-ZÀ-Ú][a-zà-ÿ]+/g,
  /\s*PREFEITURA MUNICIPAL DE [A-ZÀ-Ú\s]{3,30}/g
];
// O ultimo campo do quadro nao tem um proximo rotulo conhecido pela frente, e
// corria solto: o "Modo de disputa" de Rio Bom/PR terminava em "...SIM 21 3)
// 3468-1123 E-mail: licita@riobom.pr.gov.br ANEXO I TERMO D". Corta no
// primeiro rotulo seguinte, conhecido ou nao — o que identifica um rotulo e
// vir seguido de dois pontos.
const PROXIMO_ROTULO = [
  /\s[A-ZÀ-Ú][A-ZÀ-Ú()/\s]{3,40}:/,
  /\s[A-ZÀ-Ú][A-Za-zÀ-ÿ()/\s.-]{2,28}:\s/,
  /\s(?:ANEXO\s+[IVX0-9]|P[áa]gina\s+\d|C[âa]mara Nacional)/
];
const limpaValor = v => {
  let t = String(v).replace(/\\n/g, ' ');
  for (const re of LIXO) t = t.replace(re, ' ');
  t = t.replace(/\s{2,}/g, ' ').trim();
  // Sobra do proprio rotulo no comeco do valor: o padrao casa "PREFERENCIA
  // ME/EPP" e o texto segue "/EQUIPARADAS SIM", entao o valor comecava com a
  // barra. Tira as continuacoes do rotulo ate sobrar o valor de verdade.
  let antes;
  do {
    antes = t;
    t = t.replace(/^[\s:/\-–—]+/, '')
         .replace(/^(?:PARA\s+ALGUM\s+ITEM|PARA|EQUIPARADAS?|EPP|ME|SIMPRIORIDADE)\b[\s:/\-]*/i, '');
  } while (t !== antes);
  let fim = t.length;
  for (const re of PROXIMO_ROTULO) {
    const m = re.exec(t);
    if (m && m.index > 3 && m.index < fim) fim = m.index;
  }
  return t.slice(0, fim).trim().replace(/[\s.,;:-]+$/, '');
};

function achaQuadro(texto) {
  // 1. onde cada campo aparece — SO em caixa alta.
  //
  // No quadro os campos sao titulos, e titulo vem em maiuscula. Aceitando
  // caixa mista, o que casava eram mencoes soltas no corpo do edital: em
  // Severinia/SP o "Criterio de julgamento" saiu de uma frase corrida e o
  // valor da "Sessao publica" virou "e todas as fases serao conduzidas pelo
  // Pregoeiro e Equipe de Apoio...", que nao e horario nenhum.
  const marcas = [];
  CAMPOS.forEach(([rotulo, re], i) => {
    const g = new RegExp(re.source, 'gi');
    let m;
    while ((m = g.exec(texto)) !== null) {
      if (m[0] === m[0].toUpperCase()) {
        marcas.push({ pos: m.index, fim: m.index + m[0].length, rotulo, i });
      }
      if (g.lastIndex === m.index) g.lastIndex++;
    }
  });
  if (marcas.length < MIN_CAMPOS) return null;
  marcas.sort((a, b) => a.pos - b.pos);

  // 2. o melhor aglomerado: a janela que reune mais campos DISTINTOS
  let melhor = null;
  for (let a = 0; a < marcas.length; a++) {
    const dentro = [];
    const vistos = new Set();
    for (let b = a; b < marcas.length && marcas[b].pos - marcas[a].pos <= JANELA; b++) {
      if (vistos.has(marcas[b].rotulo)) continue;
      vistos.add(marcas[b].rotulo);
      dentro.push(marcas[b]);
    }
    if (!melhor || dentro.length > melhor.length) melhor = dentro;
  }
  if (!melhor || melhor.length < MIN_CAMPOS) return null;

  // 3. o valor vai do fim do rotulo ate o proximo rotulo CONHECIDO, mesmo que
  // esse proximo nao tenha entrado no quadro (repetido, ou fora da janela).
  // Limitando so pelos escolhidos, o "Modo de disputa" de Ponta Grossa/PR
  // seguia por "Aberto. TRATAMENTO FAVORECIDO PARA ME / EPP / EQUIPARADAS
  // Sim. MARGEM DE PREFERENCIA PARA..." — tres campos numa linha so.
  const proximaMarca = (de) => {
    for (const x of marcas) if (x.pos > de) return x.pos;
    return texto.length;
  };
  const campos = [];
  melhor.forEach((m, k) => {
    const ate = Math.min(
      k + 1 < melhor.length ? melhor[k + 1].pos : texto.length,
      proximaMarca(m.fim),
      m.fim + MAX_VALOR);
    let valor = limpaValor(texto.slice(m.fim, Math.min(ate, m.fim + MAX_VALOR))
      .replace(/^[\s:.\-–—]+/, '').replace(/\s+/g, ' ').trim());
    // Valor embaralhado pela fonte do PDF nao entra: em Sao Paulo/SP o modo de
    // disputa terminava em "b 8 $ 6 *   G H  bSa".
    // Tratamento, preferencia e margem sao resposta de sim ou nao. Cortar na
    // propria resposta evita a cauda que vinha atras dela — em Rio Bom/PR o
    // valor era "SIM 21 3) 3468-1123", com o telefone do orgao colado.
    if (/ME\/EPP|prefer[êe]ncia/i.test(m.rotulo)) {
      const r = /^(sim|n[ãa]o)\b([^.]{0,40})/i.exec(valor);
      valor = r ? (r[1] + (r[2] || '')).replace(/\s+[A-ZÀ-Ú]{3,}.*$/, '').trim() : valor;
    }
    const sujo = /[a-z][ÁÉÍÓÚÂÊÎÔÛÀÈÌÒÙÃÕÇÆØ]/.test(valor) || /(?:\s\S){6,}/.test(valor);
    if (valor.length > 2 && !sujo) campos.push([m.rotulo, valor]);
  });
  return campos.length >= MIN_CAMPOS ? campos : null;
}

let com = 0, sem = 0;
for (const e of dados.editais) {
  const v = base.editais[e[C.path]];
  if (!v) continue;
  const texto = (v.secoes || []).map(s => s.texto).join('  ');
  const q = texto ? achaQuadro(texto) : null;
  if (q) { v.quadro = q; com++; }
  else { delete v.quadro; sem++; }
}

fs.writeFileSync(arquivo, JSON.stringify(base), 'utf8');
console.log(`${com} edital(is) com quadro resumo · ${sem} sem`);
console.log(`docs/descritivos.json: ${(fs.statSync(arquivo).size / 1024).toFixed(0)} KB`);
