# Radar de Editais — Digiplus

Monitoramento diário de licitações públicas abertas no [PNCP](https://pncp.gov.br) com itens
de linha branca, climatização, cocção, lavanderia e eletroportáteis — filtradas para
**fornecimento**: fora do RS e de SC, sem exigência de instalação ou montagem; em todo lugar,
sem manutenção.

**Página:** https://kayopg.github.io/radar-editais-digiplus/

Estados atendidos: PR, RS, SP, MG, GO, MT, MS, SC.

## Como funciona

O GitHub Actions roda o pipeline inteiro de segunda a sexta, a partir das 6h23 (horário de
Brasília), com repescagem às 8h23 e 10h23 se a fila do Actions atrasar. Ele grava
`docs/dados.json` e `docs/descritivos.json` e commita. A página busca esses JSON toda vez
que alguém abre — não é preciso republicar nada, e o link nunca muda.

Antes de commitar, o `conferir.mjs` checa se o resultado faz sentido: lista vazia,
encolhimento maior que 40% em relação ao dia anterior, ou mais de 10% das buscas falhando
derrubam o job. Nesse caso o `dados.json` de ontem continua no ar e o GitHub avisa por
e-mail — dado velho e inteiro é melhor que dado novo pela metade.

O job leva mais de duas horas. Se alguém empurrar código para o `main` nesse meio tempo, o
passo de publicar pula para o `main` atual e refaz o recorte com o código novo antes do push.

```
varredura.mjs → publicar.mjs → docs/dados.json
descritivos.mjs → itens-embutidos.mjs → descritivo-por-item.mjs → docs/descritivos.json → veta-pelo-descritivo.mjs
                                                     ↓
                                              docs/index.html
```

| Arquivo | O que faz |
|---|---|
| `varredura.mjs` | 32 termos × 8 UFs × 2 páginas no PNCP, lê os itens de cada processo e aplica os filtros. ~100 min. |
| `publicar.mjs` | Converte a saída bruta no `docs/dados.json` que a página consome. |
| `plataforma.mjs` | Em que plataforma é a disputa: o publicador aceito no PNCP (BLL, BNC, Compras.gov.br, Banrisul, Portal de Compras Públicas, Licitanet) ou, quando a prefeitura publica pelo sistema de gestão dela, a plataforma escrita no começo do edital. A varredura usa para aplicar a regra dos seis portais; o `links-portal.mjs`, para o botão Participar. |
| `links-portal.mjs` | Completa o link do edital dentro do portal da disputa (Compras.gov.br, BLL, BNC, Licitanet), usado pelo botão "Participar" de cada card. Quando o PNCP não informa, lê a plataforma escrita no começo do edital (Pregão Banrisul, Licitar Digital, portal próprio do órgão) e deixa a nota do que procurar lá. |
| `participar.mjs` | Monta o link do Compras.gov.br (UASG + modalidade + número + ano) quando o PNCP não informa; a página avisa que o link foi montado. |
| `participar-manual.json` | Como participar dos editais sem plataforma (disputa por e-mail ou no balcão), escrito à mão; o `links-portal.mjs` aplica todo dia. |
| `delta.mjs` | Compara duas versões do `dados.json` e imprime o que entrou, o que saiu e o que fecha em 48 h. |
| `conferir.mjs` | Trava de sanidade: derruba o job antes do commit se o resultado do dia parecer degradado. |
| `descritivos.mjs` | Baixa o edital de cada processo e extrai o texto das seções que descrevem os produtos. Lê PDF, DOC/DOCX, ODT, HTML, ZIP e RAR (RAR só com 7z ou bsdtar na máquina), e guarda a planilha de itens `.xlsx` quando o órgão publica uma. `--faltantes` refaz só quem ficou sem texto. ~50 min. |
| `anexos-plataforma.mjs` | Quando os arquivos do PNCP não descrevem os itens, busca os anexos (Termo de Referência, Anexo I) na página do processo na BLL ou na BNC. |
| `itens-embutidos.mjs` | Junta a lista de itens do PNCP a cada edital do `docs/descritivos.json`. |
| `descritivo-por-item.mjs` | Recorta do texto do edital o descritivo de cada item. Quando o edital traz tabela estruturada (planilha `.xlsx` de itens, anexo "Descrição detalhada dos itens" da EBSERH) e a numeração dela bate com a do PNCP, vale a linha da tabela. Na dúvida deixa o item sem descritivo: nenhum é melhor que um errado. |
| `veta-pelo-descritivo.mjs` | Depois do recorte, tira o item que o Termo de Referência mostra ser de outro mercado (balança antropométrica, refrigerador de termolábeis, banho-maria de laboratório) e aplica as listas de veto da varredura ao dados.json já publicado. Recalcula valor e quantidade e tira o edital que fica sem item ou abaixo do piso. |
| `editais-fora.json` | Editais conferidos à mão que exigem amostra ou garantia contratual quando a varredura não conseguiu ler o arquivo (zip, docx, odt, html); o `veta-pelo-descritivo.mjs` aplica todo dia. |
| `ortografia.mjs` | Revisão ortográfica dos descritivos (acentos que o edital não escreveu, letras perdidas na extração do PDF), com os dicionários de `ortografia/` (pt-BR e en-US, LGPL). |
| `confere-*.mjs`, `audita-descritivos.mjs` | Auditorias do recorte: texto de um item invadindo outro, cortes, numeração, mistura. Contam no Summary do job, não derrubam. |
| `artefato.mjs` | Monta a página num arquivo só, com dados e PDF embutidos, para publicar como artefato. |
| `docs/index.html` | A página, com a identidade da Loja DigiPlus. Sem build; as fontes vêm do Google Fonts, com fonte do sistema de reserva. |
| `docs/pdf.js` | Gerador de PDF próprio, sem biblioteca. "Baixar resumo + edital" baixa um arquivo por edital, com a tabela de itens e o edital oficial anexado. |
| `docs/pdf-le.js` | Leitor de PDF: abre o edital oficial do órgão e copia páginas dele para dentro do PDF gerado. Entende xref clássico e xref stream, object stream e FlateDecode. |
| `testa-pdf.mjs` | Gera os dois PDFs pelo Node com dados reais, para conferir layout e paginação sem abrir o navegador. |
| `testa-descritivo.mjs` | Prova que o PDF não altera o descritivo de nenhum produto. |
| `testa-anexo.mjs` | Baixa editais oficiais reais e confere que a página copiada sai idêntica à original. |

Rodar na mão:

```bash
node varredura.mjs && node publicar.mjs && node descritivos.mjs && node descritivos.mjs --faltantes && node itens-embutidos.mjs && node descritivo-por-item.mjs && node veta-pelo-descritivo.mjs
```

Para conferir antes de publicar, sirva a pasta `docs/` (`python -m http.server 8765 --directory docs`)
— abrir o `index.html` direto pelo `file://` não funciona, porque o `fetch` do JSON é bloqueado.

## Os filtros

Sem eles cerca de 60% da lista é lixo. Aplicados nesta ordem, dentro do `varredura.mjs`:

0. **Modalidade** — só Pregão Eletrônico e Dispensa em todas as UFs, mais Pregão
   Presencial em RS e SC. Leilão, credenciamento e concorrência ficam de fora. É o que
   elimina na origem os leilões de veículo sucateado, que casavam com a busca por causa
   do "ar-condicionado" no descritivo.
0b. **Tipo de órgão** — só município (prefeitura, câmara, fundo, autarquia — via o campo
   `esfera_nome` do PNCP), mais instituições de ensino e de saúde de qualquer esfera.
   Tribunais, agências, saneamento, militares e polícia ficam de fora.
1. **Só material** — descarta itens de serviço (`materialOuServico !== 'M'`) e descrições com
   instalação, montagem, manutenção, mão de obra. Um edital só entra se **nenhum** item de
   interesse for serviço. No RS e em SC a Digiplus instala: ali instalação e montagem não
   derrubam o edital, e o item de serviço que só instala sai da lista sem levar o edital junto.
   Fora dessas duas UFs, o `veta-pelo-descritivo.mjs` tira também o aparelho que o edital
   manda entregar instalado ("entregues instalados e em perfeito funcionamento").
2. **Veto por objeto** — derruba o edital inteiro quando o objeto é de veículo, trator,
   alimento, material de limpeza e afins. Veículos casam com a busca porque têm
   ar-condicionado de fábrica.
3b. **Refrigeração científica** — itens de refrigeração para vacina, imunobiológico,
   hemocomponente ou laboratório saem: é outro mercado, com registro na Anvisa. O teste vale
   só para a categoria Refrigeração, senão derrubaria aspirador de pó "aplicação: laboratório".
3. **Veto por item** — lista de falsos positivos reais, ampliada conforme aparecem novos:
   ventilador pulmonar, conector "split bolt", cooler de PC, diária de hotel "com
   ar-condicionado e frigobar", tubo de cobre, fórmula infantil.
4. **Piso de preço unitário** por categoria — equipamento de verdade custa. Itens com valor
   **zero** são mantidos: é orçamento sigiloso, e a página mostra "sigiloso", nunca "R$ 0".
5. **Duplicatas** — o mesmo edital sai duas vezes (publicação direta e via portal
   intermediário). Agrupa por município + UF + dia de encerramento + quantidade + valor.
6. **Piso do edital** — descarta edital cujo valor total estimado fique entre R$ 1 e
   R$ 4.000: compra de troco não vale a viagem. Valor **zero** fica, porque é orçamento
   sigiloso e pode ser grande.

## Ressalvas

- Sobram cerca de **4% de falsos positivos** mesmo depois dos filtros. Confira o edital
  antes de cotar.
- Os valores são **estimativas do órgão**, não referência de mercado.
- Vários editais vêm com valor zerado por **orçamento sigiloso** — não é erro.
- A lista **não é exaustiva**. A busca do PNCP indexa o texto completo do edital, então é
  ampla, mas não perfeita.
