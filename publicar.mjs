// Gera docs/dados.json — o arquivo que a página busca — a partir da saída da
// varredura. É este arquivo, e só ele, que o GitHub Actions commita todo dia.
// Uso: node publicar.mjs [dados/ultima.json]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath e nao o pathname cru: o import.meta.url vem percent-encoded,
// entao uma pasta de usuario com acento no nome virava Usu%C3%A1rio e o
// require nao achava nada. So aparece fora do Actions, onde o caminho e ASCII.
const DIR = path.dirname(fileURLToPath(import.meta.url));
const entrada = process.argv[2] || path.join(DIR, 'dados', 'ultima.json');

const { st, editais } = JSON.parse(fs.readFileSync(entrada, 'utf8'));

// Ordem fixa dos estados atendidos, para o cabeçalho e os chips de filtro
// saírem sempre iguais. Mexeu aqui, mexeu no filtro da página junto — é de
// propósito: era esse o antigo pé na jaca de a lista viver só no HTML.
const UFS = ['PR', 'RS', 'SP', 'MG', 'GO', 'MT', 'MS', 'SC'];

// Colunas 0-8 sao as antigas; 9 em diante vieram com o resumo em PDF (31/08/2026).
// Acrescente sempre no fim: a pagina le por indice.
const linhas = editais.map(e => [e.mun, e.uf, e.org, e.ed, e.fecha, e.qtd, e.val, e.path, e.it,
  e.obj || '', e.uni || '', e.mod || '', e.pub || '', e.arq || 0, e.arqExt || '',
  // 15 em diante entraram em 01/09/2026, com o resumo mais completo
  e.abre || '', e.esfera || '', e.sit || '', e.portal || '',
  // 19: vazio = edital lido e sem exigencia impeditiva. Texto = NAO foi
  // possivel avaliar (PDF digitalizado, sem arquivo, erro), e por isso ele
  // continua na lista — cabe conferencia humana.
  Array.isArray(e.exige) ? '' : (e.exige || '')]);

const saida = {
  meta: {
    // ver a nota do hojeISO no varredura.mjs: a data e a de Sao Paulo, nao UTC
    varredura: new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }),
    gerado: new Date().toISOString(),
    ufs: UFS,
    // Derivado, nao fixo: ficou 32 no arquivo depois que a lista virou 38 termos
    // em 01/09/2026, e a pagina passou a anunciar menos busca do que faz.
    // consultas = termos x UFs x 2 paginas, entao o caminho de volta e este.
    termos: st.consultas ? Math.round(st.consultas / (UFS.length * 2)) : 0,
    candidatos: st.unicos ?? 0,
    editais: linhas.length,
    porUf: st.porUf ?? {},
    // usados pelo conferir.mjs para detectar varredura degradada
    consultas: st.consultas ?? 0,
    errBusca: st.errBusca ?? 0,
    errItens: st.errItens ?? 0,
  },
  // documenta o formato para quem abrir o JSON direto
  colunas: ['municipio', 'uf', 'orgao', 'edital', 'encerramento', 'quantidade',
            'valorEstimado', 'path', 'itens', 'objeto', 'unidade', 'modalidade',
            'publicacao', 'arquivoSeq', 'arquivoExtensao',
            'aberturaPropostas', 'esfera', 'situacao', 'portal', 'naoAvaliado'],
  colunasItem: ['categoria', 'quantidade', 'valorUnitario', 'descricao',
                'unidadeMedida', 'numeroItem', 'beneficio'],
  editais: linhas,
};

const destino = path.join(DIR, 'docs', 'dados.json');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, JSON.stringify(saida), 'utf8');

const kb = (fs.statSync(destino).size / 1024).toFixed(0);
console.log(`docs/dados.json: ${linhas.length} editais, ${kb} KB`);
