# Radar de Editais — Digiplus

Monitoramento diário de licitações públicas abertas no [PNCP](https://pncp.gov.br) com itens
de linha branca, climatização, cocção, lavanderia e eletroportáteis — filtradas para
**fornecimento**: fora do RS e de SC, sem exigência de instalação ou montagem; em todo lugar,
sem manutenção.

**Página:** https://kayopg.github.io/radar-editais-digiplus/ — desde 07/10/2026 com a folha de
abertura do edital no resumo e o edital convertido para PDF, como o artefato. Quem publica é o
`site.yml`, depois de cada varredura; o Pages precisa estar com a fonte "GitHub Actions".
Na entrada, só os usuários cadastrados entram, cada um com o seu usuário e a sua senha, e o
site diz "Olá, <nome>" (08/10/2026). O acesso não fica guardado: recarregou a página, fechou a
aba, o navegador ou o computador, pede de novo. A página guarda só códigos (SHA-256) do usuário
e do par usuário + senha, nunca a senha nem o usuário. Usuário e senha valem exatamente como
foram cadastrados, maiúsculas e minúsculas inclusive. Para incluir, trocar a senha ou tirar
alguém: `node usuarios-site.mjs adicionar USUARIO "senha" "Nome"`, `remover USUARIO` ou
`listar`, e commit do `docs/index.html`. É reconhecimento, não cofre: os dados continuam em
arquivos públicos. O artefato não tem a tela.

Estados atendidos: PR, RS, SP, MG, GO, DF, MS e SC (MT saiu em 06/10/2026: a
Digiplus não cota mais nada lá). Desde 05/10/2026 cada
estado tem as suas linhas de produto (`LINHAS_DA_UF`, em `veto-item.mjs`):

| UF | O que se cota |
|---|---|
| RS, SC, PR | tudo o que o radar pega |
| SP | ar-condicionado, bebedouro industrial, fogão industrial, batedeira industrial, micro-ondas e ventilador |
| DF, GO, MS, MG | ar-condicionado, bebedouro industrial, fogão industrial e batedeira industrial |

"Industrial" é a palavra no rótulo ou no começo do descritivo; a batedeira "de
uso profissional" conta, e o bebedouro conta também pelo reservatório (50 L para
cima, ou 25 L em inox — o de pressão, de garrafão e de mesa não, nem quando o "tipo:
industrial" vem só do catálogo do PNCP e o edital descreve um bebedouro de pressão
de parede, como em Dourados/MS em 06/10/2026). O edital que
fica sem item dessas linhas sai. Teste: `node testa-linhas-uf.mjs`.

## Como funciona

O GitHub Actions roda o pipeline inteiro de segunda a sexta. O agendamento é 1h23 da manhã
(horário de Brasília), com repescagem às 3h23, 5h23 e 9h23 — mas o horário marcado não é o
horário em que roda: a fila do Actions em repositório gratuito atrasa a execução entre 4h e
6h, de forma bem constante, e é por isso que o agendamento é de madrugada. Na prática a
lista fica pronta por volta das 9h. Ele grava
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
| `varredura.mjs` | 32 termos × 8 UFs × 2 páginas no PNCP, lê os itens de cada processo (todas as páginas: até 07/10/2026 só os 300 primeiros, e os ventiladores 483 a 486 de Alto Piquiri/PR nunca apareceram) e aplica os filtros. ~100 min. |
| `veto-item.mjs` | A regra comum do veto por item e da categoria, usada pela varredura e pelo `veta-pelo-descritivo.mjs`: termo de peça só veta antes do aparelho, e aparelho citado como uso ("apto para micro-ondas") não dá categoria. |
| `publicar.mjs` | Converte a saída bruta no `docs/dados.json` que a página consome. |
| `plataforma.mjs` | Em que plataforma é a disputa: o publicador aceito no PNCP (BLL, BNC, Compras.gov.br, Banrisul, Portal de Compras Públicas, Licitanet) ou, quando a prefeitura publica pelo sistema de gestão dela, a plataforma escrita no começo do edital. A varredura usa para aplicar a regra dos seis portais; o `links-portal.mjs`, para o botão Participar. |
| `links-portal.mjs` | Completa o link do edital dentro do portal da disputa (Compras.gov.br, BLL, BNC, Licitanet), usado pelo botão "Participar" de cada card. Quando o PNCP não informa, lê a plataforma escrita no começo do edital (Pregão Banrisul, Licitar Digital, portal próprio do órgão) e deixa a nota do que procurar lá. |
| `participar.mjs` | Monta o link do Compras.gov.br (UASG + modalidade + número + ano) quando o PNCP não informa; a página avisa que o link foi montado. |
| `publicadores.json` | Quem publicou cada edital já consultado no PNCP (e o link do portal), gravado pela varredura. Quando a consulta do PNCP cai, a regra dos seis portais decide pelo publicador guardado, e os editais de sistemas de fora não voltam à lista. Entradas não vistas há 90 dias saem. |
| `participar-manual.json` | Como participar dos editais sem plataforma (disputa por e-mail ou no balcão), escrito à mão; o `links-portal.mjs` aplica todo dia. |
| `delta.mjs` | Compara duas versões do `dados.json` e imprime o que entrou, o que saiu e o que fecha em 48 h. |
| `conferir.mjs` | Trava de sanidade: derruba o job antes do commit se o resultado do dia parecer degradado. |
| `descritivos.mjs` | Baixa o edital de cada processo e extrai o texto das seções que descrevem os produtos. Lê PDF, DOC/DOCX, ODT, HTML, ZIP e RAR (RAR só com 7z ou bsdtar na máquina), e guarda a planilha de itens `.xlsx` quando o órgão publica uma. `--faltantes` refaz só quem ficou sem texto. ~50 min. |
| `anexos-plataforma.mjs` | Quando os arquivos do PNCP não descrevem os itens, busca os anexos (Termo de Referência, Anexo I) na página do processo na BLL ou na BNC. |
| `itens-embutidos.mjs` | Junta a lista de itens do PNCP a cada edital do `docs/descritivos.json`. |
| `descritivo-por-item.mjs` | Recorta do texto do edital o descritivo de cada item. Quando o edital traz tabela estruturada (planilha `.xlsx` de itens, anexo "Descrição detalhada dos itens" da EBSERH) e a numeração dela bate com a do PNCP, vale a linha da tabela. Na dúvida deixa o item sem descritivo: nenhum é melhor que um errado. |
| `veta-pelo-descritivo.mjs` | Depois do recorte, tira o item que o Termo de Referência mostra ser de outro mercado (refrigerador de termolábeis, banho-maria de laboratório, lavanderia hospitalar), o item sem descritivo e o de categoria que saiu do radar, e aplica as listas de veto da varredura ao dados.json já publicado. Recalcula valor e quantidade e tira o edital que fica sem item ou abaixo do piso. |
| `cota.mjs` | A cota reservada de ME/EPP, item a item, chamada pelo `veta-pelo-descritivo.mjs`: junta o benefício do PNCP, a marca na linha do edital ("COTA RESERVADA (BENEFÍCIO TIPO III)") e o par de itens iguais em que o menor leva até 30% da quantidade (a cota principal e a reservada). Grava `it[7]` no `dados.json`, e o card e o resumo mostram "Cota reservada ME/EPP (principal: item 2)" e "Cota principal, ampla (reservada: item 3)". `testa-cota.mjs` roda os casos reais. |
| `editais-fora.json` | Editais conferidos à mão que exigem amostra ou garantia contratual quando a varredura não conseguiu ler o arquivo (zip, docx, odt, html); o `veta-pelo-descritivo.mjs` aplica todo dia. |
| `descritivos-manuais.json` | Descritivos transcritos à mão do edital para itens cuja tabela nenhuma regra lê com segurança (OCR com colunas de preço no meio da célula). Cada entrada guarda a quantidade e o preço do PNCP conferidos e deixa de valer se o órgão mudar o item; o `descritivo-por-item.mjs` aplica todo dia. |
| `ortografia.mjs` | Revisão ortográfica dos descritivos (acentos que o edital não escreveu, letras perdidas na extração do PDF), com os dicionários de `ortografia/` (pt-BR e en-US, LGPL). |
| `confere-*.mjs`, `audita-descritivos.mjs` | Auditorias do recorte: texto de um item invadindo outro, cortes, numeração, mistura. Contam no Summary do job, não derrubam. |
| `edital-pdf.mjs` | O edital que o órgão publicou em ZIP, RAR, DOC, DOCX, ODT ou RTF, convertido para PDF: abre o pacote (inclusive zip com rar dentro), escolhe o documento do edital e converte o que não é PDF. Grava `docs/editais-pdf.json`, que vai para o artefato e, desde 07/10/2026, para o site — no card o botão "Baixar edital (PDF)" entrega esse arquivo e o link ao lado continua levando ao original no PNCP. |
| `pdf-do-documento.mjs` | Converte DOC, DOCX, ODT, RTF e HTML para PDF pelo LibreOffice, se houver, ou pelo Word (COM do Windows). Na máquina do usuário é o Word; no robô do site, o LibreOffice. |
| `site.mjs` | Monta o site na pasta `_site`: a `docs/` mais uma folha de abertura por edital (`capas/<cnpj-ano-seq>.json`) e cada edital convertido (`pdfs/<cnpj-ano-seq>.pdf`, com o `pdfs/indice.json`), para a página buscar só o edital que abriu. Roda no `.github/workflows/site.yml`, que gera as folhas e os convertidos e publica direto no Pages, sem commit (07/10/2026). |
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
0b. **Tipo de órgão** — município (prefeitura, câmara, fundo, autarquia — via o campo
   `esfera_nome` do PNCP), instituições de ensino e de saúde de qualquer esfera e, desde
   05/10/2026, **tribunais** de qualquer esfera (TJ, TRF, TRT, TRE, tribunal de contas) e
   **secretarias de estado**. Agências, saneamento, Ministério Público, militares e polícia
   ficam de fora.
1. **Só material** — descarta itens de serviço (`materialOuServico !== 'M'`) e o material que é
   serviço: descrição que **abre** com instalação, higienização, reposição, substituição,
   serviço, calibração ("Instalação Split", "Reposição de gás para Split"), ou que contrata
   manutenção preventiva/corretiva, desinstalação ou mão de obra. A mesma palavra depois do
   aparelho é descrição dele ("de fácil higienização", "termostato para manutenção da
   temperatura") e não derruba nada. Um edital só entra se **nenhum** item de interesse for
   serviço. No RS e em SC a Digiplus instala: ali instalação e montagem não
   derrubam o edital, e o item de serviço que só instala sai da lista sem levar o edital junto.
   Fora dessas duas UFs, o `veta-pelo-descritivo.mjs` tira também o aparelho que o edital
   manda entregar instalado ("entregues instalados e em perfeito funcionamento") ou diz que o
   preço inclui a instalação ("Inclui instalação padrão completa", 29/09/2026). **Montado conta
   como instalação** (usuário, 29/09/2026): "entregar o fogão montado", "entregues montados no
   local", "a montagem ... correrão por conta da contratada" saem fora do RS e de SC —
   também quando a cláusula é geral, no corpo do edital: "o transporte, a descarga, a
   montagem, a instalação e os testes serão de responsabilidade da contratada" (Goioxim/PR,
   confirmado pelo usuário em 01/10/2026). "Medidas do fogão montado", "diâmetro montado" e
   "kit de montagem" descrevem o produto e ficam. A frase
   dentro do descritivo de um item vale só para aquele item, não para o edital inteiro.
   "Para instalação horizontal sobre portas", "instalação em parede ou teto" dizem **como** o
   aparelho é instalado, não que o fornecedor instala (usuário, 29/09/2026). E a instalação
   condicional — "entregues e instalados, **se necessário**", "quando aplicável" — não derruba
   o edital inteiro: saem só os aparelhos que precisam ser instalados (split, cortina de ar,
   climatizador evaporativo de parede, que pede abertura na alvenaria), e fogão, forno,
   liquidificador e o climatizador portátil ficam (São João d'Aliança/GO e Assis
   Chateaubriand/PR, 30/09/2026). Vale também no objeto: "com instalação quando necessária".
   "Incluso: instalação do equipamento" é exigência, como "inclui instalação".
   E a instalação em **item separado do mesmo lote**: quando o julgamento é por lote, quem leva
   o lote leva tudo, e o edital põe "INSTALAÇÃO DE AR 60.000 BTUS" como outro item ao lado do
   aparelho (Iporã/PR, 07/10/2026). Fora do RS e de SC, o aparelho que se instala sai.
   E no edital por lote o card mostra **o lote inteiro** — também os itens que a Digiplus
   não cota (instalação, tubulação, bomba de dreno), em cinza, e só dos lotes que têm
   produto nosso (usuário, 07/10/2026). O PNCP não diz o lote de cada item; o `lotes.mjs`
   só aceita o lote quando os itens, em blocos seguidos, somam **centavo por centavo** os
   totais por lote impressos no edital, e a divisão é única (Joinville/SC, 17 lotes). Sem
   essa confirmação, o card mostra todos os itens do edital. Valor e quantidade do edital
   continuam sendo os dos nossos itens. A tabela do resumo em PDF traz os mesmos itens
   do card, os que não cotamos em cinza e com "Não cotamos" (usuário, 08/10/2026). O nome
   desses itens é o do PNCP, sem o texto do catálogo que o Compras.gov.br põe na frente
   do código do órgão ("46950 - TUBULAÇÃO ADICIONAL…").
2. **Veto por objeto** — derruba o edital inteiro quando o objeto é de veículo, trator,
   alimento, material de limpeza e afins. Veículos casam com a busca porque têm
   ar-condicionado de fábrica. Se o objeto também compra eletrodoméstico ("Móveis,
   Eletrodomésticos, Eletrônicos e brinquedos"), quem decide é o item.
3b. **Refrigeração científica** — itens de refrigeração para vacina, imunobiológico,
   hemocomponente ou laboratório saem: é outro mercado, com registro na Anvisa. O teste vale
   só para a categoria Refrigeração, senão derrubaria aspirador de pó "aplicação: laboratório".
3. **Veto por item** — lista de falsos positivos reais, ampliada conforme aparecem novos:
   ventilador pulmonar, conector "split bolt", cooler de PC, diária de hotel "com
   ar-condicionado e frigobar", tubo de cobre, fórmula infantil. O termo de peça ou
   acessório (prateleira, refil, compressor, filtro, gabinete, embalagem) só veta quando vem
   **antes** do aparelho — "Prateleira para geladeira" sai, "Geladeira ... prateleiras de
   vidro" fica (`veto-item.mjs`). E o aparelho citado como uso de outra coisa ("apto para
   micro-ondas", "aplicação: refrigerador") não dá categoria ao item.
3c. **O que a Digiplus não cota** — diferente do veto por item, que corrige erro de captura:
   aqui o produto foi entendido certo, só não é da casa. A decisão é do usuário e cada uma
   entrou na data em que ele pediu. Fora do radar: churrasqueira, balança, moedor/moinho de
   café, enceradeira e lustradeira de piso, coifa, exaustor e depurador (também quando o
   catálogo chama o exaustor de "Ventilador Axial" e só o descritivo do edital diz o que ele
   é, 29/09/2026, e quando o edital abre com "ventilador/ exaustor", 07/10/2026), os
   acessórios e móveis do fogão e do forno ("chapa bifeteira" para pôr sobre o fogão,
   "balcão multiuso para forno e micro-ondas", 07/10/2026), aquecimento de água
   (aquecedor de água, boiler, aquecedor solar, aquecedor de passagem), **masseira**
   (05/10/2026: a amassadeira industrial lenta ou semi-rápida entra; a que se diz só
   "rápida" fica fora), gerador de qualquer tipo, **lavadora de alta pressão** (lava-jato,
   28/09/2026), e **balcão** — térmico, refrigerado e
   de conservação (24/09/2026). Nessa mesma conversa o usuário mandou **manter o buffet
   térmico**, que é o mesmo móvel com outro nome, então ali o corte é pelo nome e não pelo
   produto: o `VETO_ITEM` leva as expressões ("balcao termico", "balcao refrigerado"…) e
   não a palavra solta, senão derrubaria a geladeira cujo rótulo diz "instalar ao lado do
   balcão". Quando o grupo sai inteiro, a
   **categoria** sai da tabela `CAT` e o `veta-pelo-descritivo.mjs` tira do `dados.json` já
   publicado o item que ficou órfão ("categoria que saiu"); quando só um produto sai, o nome
   entra na `VETO_ITEM`. As duas coisas juntas quando o nome ainda pode entrar pela palavra
   de outra categoria — um gerador "com ventilador de arrefecimento" cairia em climatização.
   O aquecedor de **ambiente** continua, em "Outros" — menos o **halógeno**, que saiu em
   30/09/2026 (só na categoria dele: a "lâmpada halógena" do forno não derruba o forno).
4. **Piso de preço unitário** de R$ 150 — equipamento de verdade custa. Chaleira elétrica,
   cafeteira, sanduicheira, grill e máquina de waffle não têm piso, e acima de R$ 140 com mais de 10 unidades o item fica. Itens com valor
   **zero** são mantidos: é orçamento sigiloso, e a página mostra "sigiloso", nunca "R$ 0".
5. **Duplicatas** — o mesmo edital sai duas vezes (publicação direta e via portal
   intermediário). Agrupa por município + UF + dia de encerramento + quantidade + valor,
   depois do filtro por portal: das cópias, fica a que passou por ele (30/09/2026).
6. **Piso do edital** — descarta edital cujo valor total estimado fique entre R$ 1 e
   R$ 4.000: compra de troco não vale a viagem. Valor **zero** fica, porque é orçamento
   sigiloso e pode ser grande.
7. **Item sem descritivo sai** — sem a especificação do edital não dá para cotar, então o
   `veta-pelo-descritivo.mjs` tira o item; o edital que fica sem item nenhum sai junto
   (decisão do usuário em 23/09/2026). É o que acontece quando o órgão publica só PDF
   escaneado, publica o edital de outra licitação ou troca o arquivo depois da varredura.
8. **Exigências que impedem** (`exigencias.mjs`) — sai o edital que OBRIGA amostra,
   comprovação de sustentabilidade, carta de solidariedade ou garantia de execução do
   contrato (a caução do art. 96). Só o que é obrigatório: "poderá solicitar", "caso o termo
   de referência exija" e "caso a qualidade não possa ser aferida" ficam (02/09/2026). Desde
   05/10/2026 a regra lê a CLÁUSULA inteira em que a palavra aparece, e não só uma distância
   fixa em volta dela: dos 14 editais do RS barrados naquele dia, 13 eram engano — o quadro
   "garantia de execução ... (x) não", a garantia do produto ("o período de garantia
   contratual será contado..."), a cláusula padrão da AGU sobre a amostra condicional e o
   destino das amostras ("as amostras entregues deverão ser recolhidas"), entre eles o
   pregão de eletrodomésticos de R$ 6,2 milhões de Porto Alegre/RS. Desde 06/10/2026 a
   amostra se lê também pela SEÇÃO: quando "8 – DAS AMOSTRAS" abre com "poderá ser
   solicitada", o "prazo para entrega da amostra é de 3 dias úteis, sob pena de
   desclassificação" que vem depois é o procedimento da amostra que PODE ser pedida
   (Manhumirim/MG); e o título seguido de "não haverá a exigência de amostra" dispensa
   (Caxias do Sul/RS). A condição tem de ser a da própria amostra, na primeira frase da
   seção que fala dela, e nada na seção pode dizer "será exigida" ou "é obrigatória".
   Na revisão dos 34 editais barrados em 06/10/2026, 24 eram engano: "não exigência",
   "não há necessidade", "não ser viável a exigência", "eventual exigência", "quando
   houver", "caso se trate", a amostra de laboratório e a da pesquisa de preços, a
   garantia do produto ("prazos de garantia", "garantia técnica"), a multa por "reforço de
   garantia", o modelo de edital com "x% (xxxx por cento)" em branco e o texto do PDF com
   as palavras grudadas ou partidas ("naoseraonecessarias", "na o havera"). Os 10 que
   ficaram barrados exigem de verdade. `testa-exigencias-casos.mjs` guarda os casos.

## Ressalvas

- Sobram cerca de **4% de falsos positivos** mesmo depois dos filtros. Confira o edital
  antes de cotar.
- Os valores são **estimativas do órgão**, não referência de mercado.
- Vários editais vêm com valor zerado por **orçamento sigiloso** — não é erro.
- A lista **não é exaustiva**. A busca do PNCP indexa o texto completo do edital, então é
  ampla, mas não perfeita.
