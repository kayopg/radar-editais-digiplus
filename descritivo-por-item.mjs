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
// para na primeira que rende. Encurtar demais e perigoso — "Fogao" sozinho
// casaria com a linha de outro fogao — por isso o piso e de tres palavras e o
// resultado ainda precisa ser bem maior que o rotulo para valer.
function melhorDescritivo(secoes, curto) {
  const tentativas = [curto];
  const antesDoCampo = curto.split(/\s+[A-Za-zÀ-ÿ]+:\s/)[0];
  if (antesDoCampo && antesDoCampo.length >= 6 && antesDoCampo !== curto) tentativas.push(antesDoCampo);
  const palavras = curto.split(/\s+/);
  for (const n of [6, 4, 3]) {
    if (palavras.length > n) {
      const t = palavras.slice(0, n).join(' ');
      if (t.length >= 6) tentativas.push(t);
    }
  }
  for (const t of tentativas) {
    const r = extraiDescritivo([secoes], [], t);
    if (r && r.length > curto.length + 40) return r;
  }
  return '';
}

let comTexto = 0, semTexto = 0, itensTotal = 0, itensRicos = 0;

for (const e of dados.editais) {
  const v = base.editais[e[C.path]];
  if (!v || !v.itens) continue;

  const secoes = (v.secoes || []).map(s => s.texto).join('  ');
  if (!secoes) { semTexto++; continue; }
  comTexto++;

  for (const it of v.itens) {
    itensTotal++;
    // it = [numero, descricao, quantidade, unidade, valor, beneficio]
    const completo = melhorDescritivo(secoes, it[1]);
    if (completo) { it[6] = completo; itensRicos++; }
  }
}

fs.writeFileSync(arquivo, JSON.stringify(base), 'utf8');
console.log(`${comTexto} edital(is) com texto de secao · ${semTexto} sem`);
console.log(`${itensRicos} de ${itensTotal} itens ganharam descritivo completo`);
console.log(`docs/descritivos.json: ${(fs.statSync(arquivo).size / 1024).toFixed(0)} KB`);
