# Radar de Editais — Digiplus

Monitoramento diário de licitações públicas abertas no [PNCP](https://pncp.gov.br) com itens
de linha branca, climatização, cocção, lavanderia, eletroportáteis e mesa inox — filtradas para
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
Digiplus não cota mais nada lá). Desde 20/10/2026 todos eles cotam tudo o que o radar
pega — o usuário, vendo secadora, refrigerador, multiprocessador, micro-ondas e mixer
cortados em SP e MG: "cotar tudo em todos". A instalação continua só em RS e SC
(`UF_INSTALA`): nos outros estados sai o aparelho que o edital manda entregar
instalado.

De 05/10 a 20/10/2026 cada estado teve as suas linhas de produto. A tabela continua no
`veto-item.mjs` (`LINHAS_DE_05_10`), testada, para o caso de alguma UF voltar a ter
restrição — basta pôr a UF em `LINHAS_DA_UF`, que hoje só tem MT, vazia:

| UF | O que se cotava |
|---|---|
| RS, SC, PR | tudo o que o radar pega |
| SP | ar-condicionado, bebedouro industrial, fogão industrial, batedeira industrial, micro-ondas, ventilador e, desde 15/10/2026, balança e mesa inox |
| DF, GO, MS, MG | ar-condicionado, bebedouro industrial, fogão industrial, batedeira industrial e, desde 09/10/2026, forno industrial, refrigeração (freezer, geladeira, refrigerador, frigobar), liquidificador industrial e climatizador; desde 15/10/2026, balança e mesa inox |

"Industrial" era a palavra no rótulo ou no começo do descritivo; a batedeira, o
liquidificador e o forno "de uso profissional" contavam, o liquidificador também
quando é "comercial", de "baixa rotação" ou de 4 litros para cima, o forno quando
é comercial, de convecção, turbo, de lastro, com esteiras, com cavalete ou de 90
litros para cima (o "de bancada" de 65 L não), e o bebedouro também pelo reservatório (50 L para
cima, ou 25 L em inox — o de pressão, de garrafão e de mesa não, nem quando o "tipo:
industrial" vem só do catálogo do PNCP e o edital descreve um bebedouro de pressão
de parede, como em Dourados/MS em 06/10/2026). O edital que
ficava sem item dessas linhas saía. Teste: `node testa-linhas-uf.mjs`.

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
O recorte refeito parte do `dados.json` que já passou pelo veto, com os itens do lote que não
cotamos (LT e ED); o `descritivo-por-item.mjs` os ignora na leitura, para a segunda rodada dar
o mesmo que a primeira (antes, 36 itens de editais por lote mudavam, 08/10/2026).

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
| `plataforma.mjs` | Em que plataforma é a disputa: o publicador aceito no PNCP (BLL, BNC, Compras.gov.br, Banrisul, Portal de Compras Públicas, Licitanet) ou, quando a prefeitura publica pelo sistema de gestão dela, a plataforma escrita no começo do edital. Desde 14/10/2026 vale também o link da disputa que o próprio PNCP dá (linkSistemaOrigem) num portal da casa: a "ECustomize Consultoria em Software" é a empresa do Portal de Compras Públicas. A varredura usa para aplicar a regra dos seis portais; o `links-portal.mjs`, para o botão Participar. |
| `links-portal.mjs` | Completa o link do edital dentro do portal da disputa (Compras.gov.br, BLL, BNC, Licitanet), usado pelo botão "Participar" de cada card. Quando o PNCP não informa, lê a plataforma escrita no começo do edital (Pregão Banrisul, Licitar Digital, portal próprio do órgão) e deixa a nota do que procurar lá. |
| `participar.mjs` | Monta o link do Compras.gov.br (UASG + modalidade + número + ano) quando o PNCP não informa; a página avisa que o link foi montado. |
| `publicadores.json` | Quem publicou cada edital já consultado no PNCP (e o link do portal), gravado pela varredura. Quando a consulta do PNCP cai, a regra dos seis portais decide pelo publicador guardado, e os editais de sistemas de fora não voltam à lista. Entradas não vistas há 90 dias saem. |
| `participar-manual.json` | Como participar dos editais sem plataforma (disputa por e-mail ou no balcão), escrito à mão; o `links-portal.mjs` aplica todo dia. |
| `datas-alteradas.mjs` | "Data alterada": quando a data de encerramento das propostas muda depois que o Radar viu o edital (era 09/10, passou para 21/10), o card ganha a etiqueta "Data alterada · era 09/10 às 09:00", e o resumo em PDF e a agenda dizem o mesmo. O PNCP não guarda a data antiga, então a comparação é com o `datas-vistas.json`: a última data vista de cada edital nos últimos 120 dias, gravado pelo `publicar.mjs` e commitado pelo robô com a lista do dia. `node datas-alteradas.mjs --historico` remonta o arquivo pelo histórico do git (09/10/2026). |
| `data-do-edital.mjs` | "Data alterada" também quando o órgão adiou a disputa ANTES de o Radar ver o edital (aviso de nova data, retificação, suspensão): lê nas primeiras folhas do edital original a data que vem depois de "sessão pública", "abertura das propostas", "início da disputa"..., e se ela é anterior à do PNCP marca "Data alterada · era 25/08" (o título explica que veio do edital). Cauteloso: sem data clara, não marca. Cada edital é lido uma vez (campo `ed` do `datas-vistas.json`); no robô roda depois do `links-portal.mjs`, com 15 minutos de prazo (13/10/2026). |
| `versao-do-edital.mjs` | Qual arquivo do PNCP é o edital: entre os do tipo Edital, o que não se chama de outra coisa (ETP, TR, parecer, pesquisa de preços, aviso, errata) e, quando o órgão republicou o edital inteiro, a versão mais nova (com pelo menos 70% das páginas da original — a retificação de 5 folhas é aviso, não edital). Usado pela varredura (botão do edital, exigências) e pela folha de abertura, que é refeita quando o arquivo muda (13/10/2026). A capa do resumo (`pagina-abertura.mjs`) segue a mesma ideia: a coleta de estimativas, o aviso de retificação, a errata, o esclarecimento e a impugnação só servem de reserva, e desde 20/10/2026 o Edital.odt de Caxias do Sul/RS (edital 160) ganha do "RETIFICACAO.pdf" e da folha "Coleta de Estimativa - Itens" (o usuário: "a capa certa é a do edital"). |
| `firestore.rules` | O quadrado verde da agenda (edital já impresso para participar) é de todos: no site, as marcas ficam no Firestore do projeto Firebase da Digiplus (configuração em `FIRESTORE`, no `docs/index.html`), num documento só, `radar/impressos`, lido a cada 30 s com a aba aberta, e cada marca guarda quem marcou (13/10/2026). Estas são as regras do banco: só esse documento aceita leitura e gravação. No artefato, que não alcança a internet, as marcas ficam no banco próprio dele. Sem a configuração, o site guarda a marca só no navegador, como antes. Desde 21/10/2026 ("um quadradinho vermelho, para marcar os editais que foram impressos porém descartados") a agenda tem, ao lado do verde, o quadrado vermelho do edital impresso mas descartado: é a mesma marca com o campo `descartado`, dentro do mapa — as regras não mudam —, um quadrado ou o outro, e o card da lista mostra a marca na cor dela. |
| `delta.mjs` | Compara duas versões do `dados.json` e imprime o que entrou, o que saiu e o que fecha em 48 h. |
| `conferir.mjs` | Trava de sanidade: derruba o job antes do commit se o resultado do dia parecer degradado. |
| `descritivos.mjs` | Baixa o edital de cada processo e extrai o texto das seções que descrevem os produtos. Lê PDF, DOC/DOCX, ODT, HTML, ZIP e RAR (RAR só com 7z ou bsdtar na máquina), e guarda a planilha de itens `.xlsx` quando o órgão publica uma. Na planilha com a coluna "Produto" ao lado da "Descrição" (uma aba por item, "Refrigerador com volume interno total de 410 litros" e "• Tecnologia: Frost Free • …", BRB, Brasília/DF, pregão 075/2026, 21/10/2026), o nome entra na frente da descrição, sem o "- Ampla Concorrência"; no `descritivo-por-item.mjs` o "Item 1 - Ampla Concorrência -" do nome do PNCP não conta como palavra do produto, e a tabela com nomes de uma palavra só vale quando todas as linhas começam por ela. Com PDF e Word publicados juntos, vale o Word quando ele descreve claramente mais itens do radar (Santa Bárbara do Sul/RS: o termo de referência digitado no Word e o estudo técnico escaneado em PDF, 09/10/2026). As páginas com os blocos "Item N – Nome ... Especificações Técnicas:" do termo de referência entram todas. O texto para em 250 mil caracteres por edital, salvo quando o corte esconderia a linha de preço de um item do radar: aí o teto daquele edital sobe até ela, no máximo 600 mil (Assis Chateaubriand/PR, 809 páginas, o fogão industrial de 6 bocas só especificado no fim do termo, 13/10/2026). `--faltantes` refaz só quem ficou sem texto. Com `TODAS_AS_PAGINAS=1` relê o documento inteiro, só para conferir à mão: no uso diário isso traz a tabela-resumo de preços para dentro do descritivo. ~50 min. |
| `anexos-plataforma.mjs` | Quando os arquivos do PNCP não descrevem os itens, busca os anexos (Termo de Referência, Anexo I) na página do processo na BLL ou na BNC. |
| `itens-embutidos.mjs` | Junta a lista de itens do PNCP a cada edital do `docs/descritivos.json`. |
| `descritivo-por-item.mjs` | Recorta do texto do edital o descritivo de cada item. Quando o edital traz tabela estruturada (planilha `.xlsx` de itens, anexo "Descrição detalhada dos itens" da EBSERH, ou os blocos "Item N – Nome ... Especificações Técnicas:" do termo de referência, como em Santa Maria/RS, 09/10/2026) e a numeração dela bate com a do PNCP, vale a linha da tabela. Na dúvida deixa o item sem descritivo: nenhum é melhor que um errado. A linha "FORNECIMENTO E INSTALAÇÃO DE ..." fica inteira (CEFET-MG, 08/10/2026): é dela que o veto lê a instalação. Na tabela escaneada, a palavra que a leitura da imagem estragou ("VASA ()") é trocada pela do rótulo do PNCP quando as palavras em volta são as mesmas (Caarapó/MS, 09/10/2026). Desde 13/10/2026: a célula que atravessa a **quebra de página** ganha a continuação da folha seguinte quando o descritivo para no meio da frase, logo depois vêm as colunas com o preço do próprio item e uma virada de folha (o timbre do edital ou "Página N de M", "fl. N"), e a continuação fecha em frase completa antes do item seguinte ou de uma cláusula (São José dos Campos/SP, Mormaço/RS, Sentinela do Sul/RS); o descritivo para no item seguinte quando ele aparece dentro (número, quantidade e nome dele, mesmo com o código do catálogo no meio ou lixo de leitura depois de uma frase fechada); e saem do fim o preço e o total da linha, a unidade com a quantidade ("UNIDAD E 26,00") e, do meio, o rodapé do SEI ("Edital 31045257 SEI ... / pg. 16", Joinville/SC). `audita-cortes.mjs` confere a lista do dia. Desde 14/10/2026 (revisão edital por edital): quando o texto escolhido tem a coluna "Unidade <qtd>" ou o "N de M" da folha no meio, vale a outra cópia limpa do mesmo item no edital (a tabela de distribuição da UNILA); as colunas de unidade, quantidade, preço, benefício e nome curto saem do meio e do fim da frase (Bom Jardim de Minas, Mirassol, Florianópolis 377); a linha achada pelo número e pelo PREÇO do próprio item ganha do texto que a contradiz nos números-chave — BTU, litros por dia, bocas, portas, cubas (o desumidificador de 8 L/dia de Florianópolis, o ar de teto de 18.000 BTU de Itaberaí) — e não é cortada pelo catálogo de outro item. Desde 15/10/2026: o descritivo para no cabeçalho de outro item ("ITEM 08: GELADEIRA...", Uberlândia/MG); saem do fim o cabeçalho da tabela do lote seguinte (Ivaí/PR) e a cláusula do contrato ("Parágrafo Segundo - O valor global...", Caxias do Sul/RS), e do meio o cabeçalho de folha da UFSM sem as colunas; e a letra com o acento desenhado ao lado volta a ser uma letra só ("Pote^ncia" → "Potência", Faxinal/PR). Na mesma revisão: a **tabela com a descrição depois do preço** ("14 130802 5,00 UN 246,50 1.232,50 LIQUIDIFICADOR – ...", Porto Belo/SC) é lida da linha do item até a seguinte, e entre as cópias (o edital traz a tabela velha e a nova) vale a mais parecida com o nome do item no PNCP; o descritivo que **engoliu o item seguinte** (o ar-condicionado de Jardim/MS com a autoclave) corta onde o outro começa, e o item de fora do radar que recebeu uma frase de outro produto (o compressor odontológico de Osório/RS com um pedaço do ar-condicionado) fica com o nome do PNCP; a **errata** vale também quando o recorte pegou a especificação velha da tabela e o "Onde se lê:" a repete (Pedras de Maria da Cruz/MG, item 15); saem do fim o número do item seguinte com as colunas dele ("...GARANTIA DE 1 ANO; 17") e o campo "Quantidade:" (Embrapa, Brasília/DF); o timbre leva junto o "ESTADO DO PARANÁ" da linha de baixo (Iguaraçu/PR). Desde 20/10/2026: o rodapé com o número da folha, o endereço e o mandato ("30 AV. RIO DE JANEIRO, 720 ... GESTÃO 2025 - 2028") sai do meio da frase, e o mandato sozinho também ("Administração 2025-2028") — o refrigerador de Assaí/PR dizia "dotado de 30 2025 - 2028 compartimento"; e saem do fim a quantidade da última coluna com o número e o texto do item seguinte ("...ou equivalente. 4 4 Micro- ondas 32 litros...") e a unidade com a quantidade seguidas do texto da folha seguinte ("...140x70 cm unidade 10 o gerenciador e para os participantes"), as duas no TRF3 (edital 56/2026). Com SP, MG, GO, MS e DF cotando tudo (20/10/2026), mais itens novos e mais sujeira: saem a tabela de distribuição por escola ("- 1 Educação Infantil EMÍLIA ANICETO ROSSI...", Penápolis/SP), a quantidade solta no fim ("Freezer 420 litros horizontal 2", Lucélia/SP), o código da BEC e o órgão comprador ("548087-6/463056", "6251340 DEPARTAMENTO DE ADMINISTRAÇÃO DA REGIÃO III", São Paulo/SP), as colunas de unidade, preço e cota no meio da frase ("UNIDAD E 6,00 R$ 21.300,0000 R$ 127.800,0000 Não", Hidrolândia/GO), o "Exclusivo ME/EPP" do fim, a pesquisa de preços ("R$ 643,87 0,0000% ...", Uberaba/MG), o "de 33" da folha, o "ITEM 06" e as notas de entrega ("Notas: LOCAL DE ENTREGA", Assis/SP), o cabeçalho da folha e o lixo de fonte sem mapa de caracteres do termo de referência de Uberlândia/MG, e o item seguinte escrito como o catálogo da UFG ("...12 (DOZE) MESES BALCÃO, TÉRMICO, CARRINHO BUFFET...", Goiânia/GO); e o descritivo que é só o começo do rótulo do PNCP cortado no meio (Eldorado/SP) ou um caco curto de outro item ("PRODUÇÃO 300KG /H" no processador de Goiânia 353) dá lugar ao rótulo; e sai a linha seguinte da tabela da proposta com o número ilegível ("...12 meses. fqbj T · Unid.: UNIDADE · Qtd.: 1 · marca: Valor Unitário:", Nova Londrina/PR, edital 60), o código do catálogo com o rodapé do SEI da Justiça Federal ("636747* ETP - LEI 14.133/2021 ... / pg.", Campo Grande/MS), o "CATMAT" solto (Araxá/MG) e o cabeçalho "Nome do Equipamento Qtd. Valor Unitário" (Cruzaltense/RS). O banho-maria de laboratório "Beads" (UEM, Maringá/PR) sai pelo veto do descritivo. Na revisão "verifique em todos os editais" (20/10/2026): a tabela do sistema IPM/Abase "000/019 UN 2,00 00113784 - FORNO MICROONDAS Descrição adicional: ..." (Santo Cristo, São José do Inhacorá e Tucunduva/RS), em que o nome vem antes da descrição, é lida pelo nome do rótulo ("NOME. ..."), parando na linha seguinte da tabela ou no rodapé do sistema; o item que o edital não traz e recebeu a descrição de outro fica com o rótulo. Saem a cláusula "Constituem requisitos mínimos" (Amambaí/MS), a carta "Atenciosamente, ..." (Campo Magro/PR), o rodapé com endereço, CEP e "Página" no meio da frase (Cristais/MG), "MARCA: MODELO" (Guaíba/RS), "LOTE 35" e o cabeçalho da tabela no fim (Mondaí/SC, Ribeirão Preto/SP) e as colunas "Serviço 35 35" com o item seguinte (Joinville/SC). A continuação depois da virada de folha pula o rodapé com endereço, fone e CNPJ, aceita a lista em "- " que continua em maiúscula e fecha no título da seção seguinte ("3 – DA NATUREZA DO OBJETO"): o descritivo da geladeira de Ortigueira/PR parava em "degelo automático" (o usuário: "descritivo cortado por quebra de pagina"). As colunas "UNI 05 1.925,00 9.625,00" seguidas do total de folhas e da frase em minúscula saem do meio, sem cortar o resto (Caraguatatuba/SP), e o descritivo que termina no meio da frase troca pela cópia do edital que continua o mesmo texto ("...370 mm de" → "...370 mm de profundidade.", Penápolis/SP). Na lista de 21/10/2026: a tabela "LOTE ORDEM ITEM UNIDADE QTDE VALOR UNITÁRIO VALOR TOTAL DESCRIÇÃO" com a descrição depois do preço (Ubiratã/PR; o transcrito a mão ganha dela), as colunas "UNIDADE 8 8 0 16 R$ ... R$ ..." do termo da UTFPR e o "UNIDADE 0 0" no fim (Cornélio Procópio/PR), a cláusula "11 ADEQUAÇÃO ORÇAMENTÁRIA" com o rodapé de telefone e fax (Ribeirão Corrente/SP), o cabeçalho "IO DE CANOAS Secretaria Municipal..." no meio da frase (Canoas/RS), o item seguinte inteiro depois da frase fechada, achado pelo número e pelo nome do PNCP ("...02 Computador Ultracompacto...", Cravinhos/SP) e o brasão lido como texto antes de "Estado de Minas Gerais" (Ressaquinha/MG). E ainda em Ressaquinha/MG ("muitos com o descritivo faltando por quebra de página"): a continuação depois da virada de folha passa pelo rodapé de endereço, CNPJ, fone e CEP e pelo número da folha ("1/2", mas não a voltagem "127/220 V"), e a célula da tabela que o leitor do PDF partiu com as colunas no meio ("98 CATMAT PURIFICADOR ... UNIDADE 3 R$ ... R$ ... resto do texto") é juntada até a linha "99 CATMAT" quando o recorte tinha só o começo. Desde 22/10/2026: o item seguinte inteiro colado no fim sai, pelo número dele depois das colunas da linha ("... Unidade 327808 1 4 Micro-ondas", São Paulo/SP; "... 308879 unidade 06 11 Tanquinho", Araraquara/SP; "6. 04 UNID FRIGOBAR", São José da Bela Vista/SP) ou pelo nome dele depois do ponto, com outra palavra significativa do nome logo em seguida ("... Selo INMETRO. Televisor Smart TV ...", MJSP, Brasília/DF); saem também o resto da planilha de proposta ("*CÓD INTERNO BETHA:", "und 01 VALOR TOTAL", "UND 10 Emenda Municipal ...", a quantidade por extenso e os dados bancários) e, no lugar da especificação, a justificativa da quantidade ("(Refrigerador 450L - 02 UN): Dimensionado para ...", SSP/SP) e a lista de cotas com números de cláusula (BRB) — o item fica com o nome do PNCP. Edital do Equiplano/BLL que chama cada linha de lote ("Lotes de 3 a 84 e itens de 15 a 96 Nomenclatura lote é usada pelo sistema Equiplano e plataforma BLL", Bandeirantes/PR): o card mostra "Lote 22 · item 34", como se disputa. |
| `veta-pelo-descritivo.mjs` | Depois do recorte, tira o item que o Termo de Referência mostra ser de outro mercado (refrigerador de termolábeis, banho-maria de laboratório, lavanderia hospitalar) e o de categoria que saiu do radar, e aplica as listas de veto da varredura ao dados.json já publicado. Devolve ao nome do item a letra acentuada que o PNCP perdeu ("REFRIGERA??O"), quando o descritivo do próprio item tem a palavra inteira. Recalcula valor e quantidade e tira o edital que fica sem item ou abaixo do piso. |
| `cota.mjs` | A cota reservada de ME/EPP, item a item, chamada pelo `veta-pelo-descritivo.mjs`: junta o benefício do PNCP, a marca na linha do edital ("COTA RESERVADA (BENEFÍCIO TIPO III)") e o par de itens iguais em que o menor leva até 30% da quantidade (a cota principal e a reservada). Grava `it[7]` no `dados.json`, e o card e o resumo mostram "Cota reservada ME/EPP (principal: item 2)" e "Cota principal, ampla (reservada: item 3)". `testa-cota.mjs` roda os casos reais. |
| `editais-fora.json` | Editais conferidos à mão que exigem amostra ou garantia contratual quando a varredura não conseguiu ler o arquivo (zip, docx, odt, html); o `veta-pelo-descritivo.mjs` aplica todo dia. |
| `descritivos-manuais.json` | Descritivos transcritos à mão do edital para itens cuja tabela nenhuma regra lê com segurança (OCR com colunas de preço no meio da célula), para o termo de referência que só existe em **imagem** (João Pinheiro/MG e Carlos Chagas/MG, lidos da página escaneada) para a retificação publicada em imagem (Cerro Grande do Sul/RS, item 12) e para o texto que fica fora das páginas lidas (Bento Gonçalves/RS 442, extrator de suco depois da página 100 de 228; Bodoquena/MS, item 1, 14/10/2026). Cada entrada guarda a quantidade e o preço do PNCP conferidos e deixa de valer se o órgão mudar o item; o `descritivo-por-item.mjs` aplica todo dia. |
| `ortografia.mjs` | Revisão ortográfica dos descritivos (acentos que o edital não escreveu, letras perdidas na extração do PDF, e desde 15/10/2026 a palavra partida pela quebra de linha, "MA- TERIAL" → "MATERIAL", só quando a palavra inteira é do dicionário e aparece nos editais, e a palavra com as letras espaçadas, "e n e r g i a" → "energia", pela mesma regra), com os dicionários de `ortografia/` (pt-BR e en-US, LGPL). |
| `texto-pncp.mjs` | Limpa o texto que vem do PNCP: HTML do editor, entidades, UTF-8 lido como Latin-1 e o sinal que chega como "?". A letra acentuada trocada por "?" ("BOA VEDA??O", "N?O SENDO ACEITO") volta pelo vocabulário dos editais (`palavras-acentuadas.json`), só quando uma forma domina: "P?S" fica, porque podem ser pés ou pás. No texto que perdeu todos os acentos, o "?" solto depois de "pertencente", "resistente", "destinado" é a crase (São João da Ponte/MG, 09/10/2026). `testa-interrogacao.mjs` roda os casos reais. |
| `vocabulario.mjs` | Monta o `palavras-acentuadas.json` com as palavras acentuadas do texto dos editais das últimas 12 varreduras e quantas vezes cada uma apareceu. Rodar de novo de vez em quando: `node vocabulario.mjs`. |
| `confere-*.mjs`, `audita-descritivos.mjs` | Auditorias do recorte: texto de um item invadindo outro, cortes, numeração, mistura. Contam no Summary do job, não derrubam. |
| `edital-pdf.mjs` | O edital que o órgão publicou em ZIP, RAR, DOC, DOCX, ODT ou RTF, convertido para PDF. O ZIP e o RAR (inclusive zip com rar dentro) viram, desde 14/10/2026, **um PDF só com o pacote inteiro**, na ordem pedida pelo usuário: 1. Edital; 2. Termo de Referência; 3. Declarações (na ordem do pacote); 4. Ata; 5. Contrato; 6. Estudo Técnico Preliminar — e por último o que não é nenhum deles (pesquisa de preços, DFD, mapa de riscos), para nada ficar de fora. O grupo sai do nome do arquivo; dentro dele, a ordem do nome com os números comparados como número, e o número do anexo quando os dois têm. O documento que vem em PDF e em Word entra uma vez, e o mesmo arquivo repetido (no pacote e solto no PNCP, ou cadastrado duas vezes, como em Goiânia/GO, edital 353) também, desde 20/10/2026; o original que tem a versão "RETIFICADO" ao lado sai (Palmeiras de Goiás/GO). Pacote acima do teto (`--teto`, 25 MB no robô do site) fica só com o edital, como antes. Desde 16/10/2026 ("quando aparecer o termo de referencia, o edital, etc, separados no portal, faça o mesmo esquema"), o edital cujos documentos o órgão publicou **separados no PNCP** — edital, termo de referência, estudo técnico, declarações, cada um num arquivo — também vira um PDF só, na mesma ordem, inclusive o edital publicado em PDF. O título genérico ("TR", "ETP", "918/2026.pdf") vai pelo tipo de documento que o PNCP informa; certidão e comprovante de publicação vão para o fim. Refaz quando a lista de arquivos do PNCP muda (errata, anexo novo). Desde 21/10/2026, quando os documentos estão só no portal da disputa ("Os arquivos deste edital estão na BLL, e não estão no PNCP", Cruz Alta/RS, dispensa 04/2026, com o link do PNCP para a BLL quebrado), os links conferidos a mão no portal vão em `arquivos-do-portal.json` e valem no lugar da lista do PNCP; o card diz "Os documentos estão na plataforma BLL Compras". Acima do teto, o edital em PDF fica com a cópia do arquivo principal (`originais.mjs`). Grava `docs/editais-pdf.json`, que vai para o artefato e, desde 07/10/2026, para o site — no card o botão "Baixar edital (PDF)" entrega esse arquivo. Desde 21/10/2026 ("deixe apenas a opção de baixar o edital completo") é a única opção de baixar o edital nesses casos: o link "Arquivo original" saiu, e o original segue no PNCP pelo "Abrir no PNCP". |
| `pdf-do-documento.mjs` | Converte DOC, DOCX, ODT, RTF e HTML para PDF pelo LibreOffice, se houver, ou pelo Word (COM do Windows). Na máquina do usuário é o Word; no robô do site, o LibreOffice. |
| `originais.mjs` | Copia do PNCP para a pasta `originais/` cada edital do dia que o órgão publicou em PDF (até 40 MB), para o site baixar o arquivo com o nome no padrão do usuário (14/10/2026). O link direto do PNCP não deixa trocar o nome: o arquivo vem de outro domínio e o PNCP manda o cabeçalho CORS duplicado. Roda no `site.yml`, com a pasta em cache: só baixa o edital novo e apaga o que saiu da lista. |
| `site.mjs` | Monta o site na pasta `_site`: a `docs/` mais uma folha de abertura por edital (`capas/<cnpj-ano-seq>.json`), cada edital convertido (`pdfs/<cnpj-ano-seq>.pdf`, com o `pdfs/indice.json`) e a cópia de cada edital em PDF (`originais/<cnpj-ano-seq>.pdf`), para a página buscar só o edital que abriu. Roda no `.github/workflows/site.yml`, que gera as folhas e os convertidos e publica direto no Pages, sem commit (07/10/2026). O `descritivos.json` do site vai sem o texto das seções e com o nome de cada item limpo pelo `texto-pncp.mjs`, de onde sai a lista "Demais itens do edital" do resumo. |
| `artefato.mjs` | Monta a página num arquivo só, com dados e PDF embutidos, para publicar como artefato. Desde 14/10/2026 os editais convertidos (agora o pacote inteiro) têm orçamento de 120 MB: a versão do artefato aceita 256 MB, mas cada publicação leva no máximo 64 MB, então a página e as capas vão numa chamada e os `editais-N.js` em outras, ao mesmo artefato. |
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
   do "ar-condicionado" no descritivo. Desde 14/10/2026 o card, a agenda e o resumo em PDF
   marcam **Presencial** quando a disputa é no órgão (pregão presencial, edital que se diz
   presencial, dispensa entregue no balcão), para separar dos eletrônicos.
   E, desde a mesma data, o arquivo baixado tem o nome no padrão das pastas do usuário:
   `19.10.2026 PE 87.2026 PM Toledo - PR` — a data da disputa, a modalidade (PE pregão
   eletrônico, DE dispensa eletrônica, PP pregão presencial), o número do edital com o
   ano, o órgão (PM prefeitura, CM câmara, ou a sigla: IFRS, UFSM, EBSERH...), o município
   e a UF. O resumo leva o mesmo nome com "(resumo)" no fim. No site vale para o edital
   em PDF (cópia do `originais.mjs`), o convertido e o resumo; no artefato, para o
   convertido e o resumo — o edital em PDF ali continua vindo do PNCP, com o nome de lá.
0b. **Tipo de órgão** — município (prefeitura, câmara, fundo, autarquia — via o campo
   `esfera_nome` do PNCP), instituições de ensino e de saúde de qualquer esfera e, desde
   05/10/2026, **tribunais** de qualquer esfera (TJ, TRF, TRT, TRE, tribunal de contas) e
   **secretarias de estado**. Agências, saneamento, Ministério Público, militares e polícia
   ficam de fora.
0c. **Devedores** (`devedores.mjs`) — sai o edital de órgão que deve para a Digiplus ou
   para as coligadas (VMLX, MV, MT, Medic). Quando a dívida é da prefeitura, sai todo
   edital municipal da cidade; quando é de um fundo ou secretaria, só o desse órgão. A
   lista vem do usuário: a de 14/10/2026 (recebida em 15/10) acrescentou Inajá/PR e Novo
   Oriente de Minas/MG.
1. **Só material** — descarta itens de serviço (`materialOuServico !== 'M'`) e o material que é
   serviço: descrição que **abre** com instalação, higienização, reposição, substituição,
   serviço, calibração ("Instalação Split", "Reposição de gás para Split"), ou que contrata
   manutenção preventiva/corretiva, desinstalação ou mão de obra. A mesma palavra depois do
   aparelho é descrição dele ("de fácil higienização", "termostato para manutenção da
   temperatura") e não derruba nada. Um edital só entra se **nenhum** item de interesse for
   serviço. No RS e em SC a Digiplus instala: ali instalação e montagem não
   derrubam o edital, e o item de serviço que só instala sai da lista sem levar o edital junto.
   "Serviços de limpeza/manutenção" como FINALIDADE do aparelho ("vazão adequada PARA
   serviços de limpeza", da lavadora de alta pressão) não é serviço: com isso o pregão de
   Porto Belo/SC, 27 itens da casa, sumia inteiro da lista desde 09/10/2026 (achado em 14/10).
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
   "Incluso: instalação do equipamento" é exigência, como "inclui instalação", e "deverá ser
   fornecida com todos os materiais necessários para sua instalação e instalada" também
   (as coifas de Assis Chateaubriand/PR, 14/10/2026).
   E a instalação em **item separado do mesmo lote**: quando o julgamento é por lote, quem leva
   o lote leva tudo, e o edital põe "INSTALAÇÃO DE AR 60.000 BTUS" como outro item ao lado do
   aparelho (Iporã/PR, 07/10/2026). Fora do RS e de SC, o aparelho que se instala sai. Vale
   também o "Serviço Engenharia …" do catálogo no mesmo lote (o lote único da manutenção das
   estações da Telebras, Brasília/DF, edital 42, com dois splits no meio de 176 itens de
   serviço, 21/10/2026).
   E no edital por lote o card mostra **o lote inteiro** — também os itens que a Digiplus
   não cota (instalação, tubulação, bomba de dreno), em cinza, e só dos lotes que têm
   produto nosso (usuário, 07/10/2026). O PNCP não diz o lote de cada item; o `lotes.mjs`
   só aceita o lote quando os itens, em blocos seguidos, somam **centavo por centavo** os
   totais por lote impressos no edital, e a divisão é única (Joinville/SC, 17 lotes). Sem
   os totais, vale a tabela do termo com a coluna do grupo na frente ("GRUPO ITEM CÓD.
   ..."), quando todos os itens aparecem nela, as cópias da tabela concordam, cada grupo
   tem um benefício só e nenhum número fica ambíguo entre grupo e quantidade (Caxias do
   Sul/RS, pregão 145/2026, 09/10/2026; `testa-lotes.mjs`). Desde 09/10/2026 valem também
   o rótulo do PNCP que já traz "LOTE 2 - …" (Cruzaltense/RS), a coluna "Lote" ao lado da
   unidade (Sapiranga/RS), a linha "LOTE04 81 02.01333 - NOME QTD UN" achada pelo nome e
   pela quantidade (Tupi Paulista/SP), as faixas "01 ao 03" (São Paulo/SP, pregão 33) e as
   seções "LOTE 01 - TÍTULO" com os itens renumerados 1., 2., … (Ivaí/PR) — cada um só
   responde quando todos os itens do PNCP acham o seu lote. Desde 21/10/2026 ("tem muitos
   editais que são em lote (grupo) e você não está marcando") valem ainda: o lote escrito no
   texto do próprio item ("[LOTE 02]", "Item 2 do TR – Lote 01", Embrapa); as faixas no
   cabeçalho do grupo ("GRUPO 1 – … – itens 1 a 39 e 308 a 310"); as seções "GRUPO 2 -
   TÍTULO ITEM DESCRIÇÃO 6 …" com o primeiro item de cada grupo, e os "ITENS NÃO AGRUPADOS"
   do fim fora de grupo (Pelotas/RS); a tabela "LOTE ITEM …" com o lote em toda linha (São
   Carlos/SP) ou só na primeira linha do lote, achada pelo número e pelo começo do nome,
   que o PNCP abrevia (Cocal do Sul/SC, 214 itens em 26 lotes); a linha "LOTE N 1 NOME …
   2 NOME" com o item recomeçando a cada lote (Mondaí/SC); "LOTE k NOME" com um item por
   lote (Rio Branco do Ivaí/PR); a lista "Lote 01 - R$ … Lote 02 - R$ …" conferida pelos
   totais (Santos/SP); e o "lote único" (Telebras, Santa Cruz do Sul/RS). O total geral
   que vem depois do último lote não é mais tomado pelo total dele (Mondaí/SC juntava os
   37 itens no lote 35). O edital que declara os dois critérios vale pelo que diz mais vezes: Palmas/PR
   (edital 32/2026) diz "menor preço por item" cinco vezes e traz colado um trecho de outro processo com
   "menor preço por lote" (22/10/2026). E conta como por grupo o termo que só justifica "a divisão dos
   itens em grupos" (Pelotas/RS). E o edital só é tido como por
   lote quando não declara "menor preço por item": a lei citada ("o critério … por grupo
   somente poderá ser adotado…") e a justificativa do contrário ("não se justifica a
   adjudicação por grupo") não contam (Senador Canedo/GO, Anápolis/GO, Pato Branco/PR). Com o lote confirmado, o card
   separa os itens com o título "Lote N", como o portal da disputa. Sem essa confirmação,
   o card mostra todos os itens do edital. Valor e quantidade do edital
   continuam sendo os dos nossos itens. A tabela do resumo em PDF traz os mesmos itens
   do card, os que não cotamos em cinza e com "Não cotamos" (usuário, 08/10/2026). O nome
   desses itens é o do PNCP, sem o texto do catálogo que o Compras.gov.br põe na frente
   do código do órgão ("46950 - TUBULAÇÃO ADICIONAL…"). Quando o edital só traz uma linha
   curta do item (menos de 150 caracteres) e a descrição do portal — o nome do item no PNCP,
   que é a "Descrição detalhada" do Compras.gov — tem ao menos dois "campo: valor" que a
   linha não diz, a célula leva as duas: "MÁQUINA DE LAVAR E SECAR ROUPA - Capacidade:
   11Kg, 220V. — Descrição no portal: Máquina Lavar Roupa, Tipo: Lavadora E Secadora, …
   Abertura Frontal Com Trava De Segurança …" (Sant'Ana do Livramento/RS, usuário,
   14/10/2026). O catálogo escolhido errado (o "Sistema Magnetotelúrico" no lugar do
   climatizador da Telebras) não entra: o produto do portal tem de ser o do edital.
2. **Veto por objeto** — derruba o edital inteiro quando o objeto é de veículo, trator,
   alimento, material de limpeza e afins. Veículos casam com a busca porque têm
   ar-condicionado de fábrica. Se o objeto também compra eletrodoméstico ("Móveis,
   Eletrodomésticos, Eletrônicos e brinquedos"), quem decide é o item.
   Alguns termos derrubam sempre, mesmo com eletrodoméstico no objeto (sucata, velório,
   manutenção com peças); desde 21/10/2026 também a **funilaria** ("editais de funilaria pode
   tirar": Santa Cruz do Sul/RS, edital 131, calhas e rufos com a coifa inox no mesmo lote).
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
   O catálogo do PNCP que põe a classe do aparelho antes da peça — "Ar Condicionado - Defletor"
   (Ribeirão Preto/SP, 08/10/2026, defletores de acrílico para o cassete) — é a peça, e sai.
   Em 15/10/2026: a manta magnética "ideal para ímãs de geladeira" (Pedra do Anta/MG), o
   contêiner de escritório que vem com ar-condicionado (UNIFEI, Itabira/MG) e o serviço de
   entulho "com aferição por balança" que o PNCP marcou como material (Braganey/PR).
3c. **O que a Digiplus não cota** — diferente do veto por item, que corrige erro de captura:
   aqui o produto foi entendido certo, só não é da casa. A decisão é do usuário e cada uma
   entrou na data em que ele pediu. Fora do radar: ferramenta elétrica e a gasolina — serra
   tico-tico, martelo demolidor, corte plasma, furadeira, parafusadeira, martelete, serra copo,
   esmerilhadeira, roçadeira, motosserra (15/10/2026) —, correia de transmissão (20/10/2026:
   "definitivamente nao cotamos"; a da Embrapa em Brasília/DF entrava pelo "Aplicação: ... Ar
   Condicionado"; a amassadeira "com transmissão por correia" fica), o ar-condicionado que exige Wi-Fi (usuário, 22/10/2026, que escolheu tirar: "SMART COM CONEXÃO WI-FI", UTFPR
   de Cornélio Procópio/PR; o "Wi-Fi opcional" e o "com ou sem Wi-Fi" ficam; em edital por lote fica em cinza),
   a torneira na frente do nome ("TORNEIRA PARA TANQUE E MÁQUINA DE LAVAR", Campos Novos/SC, 22/10/2026; o
   "BEBEDOURO INDUSTRIAL 4 TORNEIRAS" fica), a passadeira a vapor (22/10/2026), a bancada ou mesa com pia (23/10/2026: "bancada com pia não cotamos", Goioerê/PR; a mesa de trabalho "com cuba", sem pia, fica), o item comprado em horas
   (serviço: as "BALANÇAS mecânicas", 100 horas de manutenção, Lunardelli/PR) e o contrato de "serviços
   contínuos de manutenção" pelo objeto, o termostato de ar-condicionado, peça (Embrapa,
   Brasília/DF, edital 10, 21/10/2026: entrava pelo "Split" do fim do nome; só na frente do produto),
   o "UMIDIFICADOR" sem mais nada no edital de oxigênio medicinal, que é o frasco do fluxômetro
   (Campina da Lagoa/PR, edital 108, 21/10/2026), desumidificador de ar (15/10/2026; o
   ar-condicionado com "função desumidificar" fica, e o umidificador também), chapa de grelhar
   carnes e char broiler (15/10/2026: "nem chapa para grelhar carnes"; a sanduicheira com "chapa grill",
   o grill elétrico portátil — confirmado: "grill eletrico fica" — e o fogão com chapa bifeteira
   ficam), banco de gelo de processo, que o catálogo chama de "Resfriador De Líquido" (laticínio
   do IFC em Blumenau/SC, 15/10/2026), churrasqueira, caldeirão (confirmado em
   14/10/2026), lavadora de louças, industrial ou doméstica (14/10/2026; também a "lava-pratos" e a "de bandejas e pratos", e em qualquer categoria quando o edital a descreve, 15/10/2026), moedor/moinho de
   café, enceradeira e lustradeira de piso, exaustor e depurador (também quando o
   catálogo chama o exaustor de "Ventilador Axial" e só o descritivo do edital diz o que ele
   é, 29/09/2026, e quando o edital abre com "ventilador/ exaustor", 07/10/2026), os
   acessórios e móveis do fogão e do forno ("chapa bifeteira" para pôr sobre o fogão,
   "balcão multiuso para forno e micro-ondas", 07/10/2026), aquecimento de água
   (aquecedor de água, boiler, aquecedor solar, aquecedor de passagem), **masseira**
   (05/10/2026: a amassadeira industrial lenta ou semi-rápida entra; a que se diz só
   "rápida" fica fora), gerador de qualquer tipo, e **balcão** — térmico, refrigerado e
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
   Nem o aquecedor de animais, a campânula de aviário e pocilga (IFC Rio do Sul, Blumenau/SC,
   15/10/2026). E a lava-louças sai em qualquer categoria quando o texto do edital abre com
   ela: o CEFET-MG (edital 335, item 39) cadastrou no PNCP com o catálogo de balança a
   "LAVA-LOUÇAS INDUSTRIAL TIPO CAPÔ" de R$ 50.902,50.
   A **lavadora de alta pressão** (lava-jato) saiu em 28/09/2026 e voltou em 08/10/2026, na
   categoria "Para lavar"; ali o "veículo" da descrição ("limpeza de pisos, paredes,
   veículos") não veta. A **lavadora/secadora de piso** (a bateria, tipo Kärcher BR) fica fora mesmo quando o PNCP a chama de "lavadora alta pressão": o descritivo do item derruba (Paranavaí/PR, 14/10/2026). Ela entra também em SP, MG, GO, MS e DF, de qualquer porte (08/10/2026).
   O **cortador de legumes** entrou em 08/10/2026, em "Eletrodomésticos" (Preparo). O
   **picador de batata (cabrita)** e o **buffet elétrico** (o mesmo móvel do buffet térmico)
   entraram em 14/10/2026; a "carne de cabrita/cabrito" da merenda sai pela VETO_ITEM, e a
   "esteira para" só veta na frente ("com esteira para apoiar o prato" é do buffet). O
   **pass-through**, aquecido ou refrigerado, saiu em 14/10/2026 (também quando só o
   descritivo do edital diz o que é: Bento Gonçalves/RS, catálogo "Forno Industrial").
   Na conferência da lista de produtos do usuário (14/10/2026) voltou a **coifa** (categoria
   "Para exaustão", só RS, SC e PR; tinha saído em 23/09 junto com exaustor e depurador,
   que seguem fora), o **buffet** passou a entrar com qualquer nome ("self service",
   "aquecido", "carro térmico (buffet)") e a lavadora de roupas também como
   "lavadoura". O que o nome novo puxaria e não é da casa sai pela VETO_ITEM: o móvel de
   sala ("aparador buffet", buffet de madeira/MDF/MDP), a comida servida em buffet
   ("almoço buffet livre", coffee break, refeição, brunch, serviço de buffet), a mesa
   (toalha, concha, display), a coifa de carro (homocinética, direção, suspensão), a de
   serra circular e a cozinha infantil de brinquedo. E o item de buffet que é serviço
   sai sozinho, sem marcar o edital inteiro como de serviço.
   As **balanças** saíram em 23/09/2026 e voltaram em 14/10/2026 ("Balanças também
   cotamos"). Desde 21/10/2026 a balança de PESAR PESSOAS também entra, em todos os editais
   (o usuário, sobre a infantil, a adulta com régua antropométrica e a de obesos de Fênix/PR:
   "algumas balanças ficaram de fora deste edital"; e, perguntado, "em todos os editais"):
   saíram dos vetos a antropométrica, a pediátrica e de bebê, a de obesos, a de
   bioimpedância, a de banheiro e de vidro e a de pesar paciente. Continuam fora a de
   laboratório (analítica, de precisão), a veterinária, a de gado e a rodoviária, e o
   "balançar" da poltrona reclinável (Patrocínio do Muriaé/MG). Até 21/10 os vetos eram os
   que o usuário tinha decidido em 14/10: a balança de
   pesar gente (antropométrica, de bebê, de banheiro, "mamãe-bebê"), a de laboratório
   (analítica, de precisão "para atividades laboratoriais") e a de gado — e, desde 15/10/2026,
   também nas demais UFs ("mesa inox e balanças pode adicionar nos demais estados"), a de
   bebê escrita errado ("Antompométrica infantil ... concha", Bicas/MG),
   a veterinária (canil de Castro/PR) e a portátil de vidro de 200 kg de consórcio de saúde
   (Palmeira das Missões/RS), que é a de pesar paciente. Na mesma conversa
   entrou o extrator pelo nome do catálogo ("Aparelho Extração Suco") e saiu a lavadora de
   louças, que o catálogo chama de "Máquina Lavar Louças" e entrava pela máquina de roupa.
   A **mesa inox** entrou em 15/10/2026 ("Mesa Inox agora é um item que cotamos também"),
   categoria MI ("Mesas inox"), em todas as UFs, e só a de inox ("apenas cotamos mesas em
   INOX, demais mesas não queremos"): a descrição que COMEÇA por "mesa" e fala
   em inox logo adiante — "MESA DE TRABALHO AÇO INOX", "Mesa Manipulação / Preparação
   Alimentos material tampo: aço inoxidável", "LOTE 1 - Mesa inox 160 x 70 x 90 cm" — com
   cuba, de apoio, de manipulação. O garfo, a faca e a colher "de mesa", a autoclave e a
   balança "de mesa" e o fogão "com mesa inox" não são mesa. Saem a de hospital e de clínica
   (de Mayo, ginecológica, auxiliar hospitalar, instrumental, de exame, a auxiliar de 40 × 40 ×
   80, de necropsia, veterinária, odontológica, de autoclave) e, pelo texto do edital, a de
   tampo de MDF, madeira, granito ou fórmica, a de estrutura em aço carbono pintado (Assis
   Chateaubriand/PR) e a que o edital descreve como outro móvel (a "mesa inox" do catálogo
   que é uma banqueta no edital, Itaberaí/GO) — no nome do PNCP não, porque o catálogo pode
   estar errado (a UNILA, Foz do Iguaçu/PR: "tampo: mdf" no PNCP, "inteiro em aço inox" no
   edital). Na lista de 15/10 ficaram 20 mesas em 11 editais (RS, SC, PR, MG e GO), entre elas 210 mesas de apoio
   para buffet em Porto Alegre/RS (edital 333). Desde 20/10/2026 a **bancada** de inox também
   é mesa ("Bancada em inox, estrutura inteiramente em inox", Lucélia/SP; "Mesa Bancada Em
   Aço Inox", TRF3), com os mesmos vetos (a bancada de laboratório sai).
   Na mesma data entraram a máquina **lava e seca** ("MAQUINA LAVA E SECA 11KG", Humaitá/RS;
   "LAVADORA LAVA E SECA AUTOMATICA ... 17KG", Assis Chateaubriand/PR) e o "Processador/
   **preparador de alimentos** modelo industrial" (Wenceslau Braz/PR), e o "elíptico" (o
   aparelho de academia) passou a vetar só no nome do produto: no meio da descrição ele
   derrubava a batedeira planetária de Rancho Alegre/PR. Também em 20/10/2026 saem o
   ventilador centrífugo de processo (Três Passos/RS; o termo "só na frente" passou a
   vetar também quando É o nome do produto, mais comprido que o da categoria), a
   balança de laboratório pelo lote ou pela precisão (Ribeirão Preto/SP), e, fora de RS e
   SC, o aparelho com "INSTALADO" no próprio nome (Três Pontas/MG) e o que "deverá
   contemplar, obrigatoriamente, a instalação completa" (UFTM, Uberaba/MG); "não
   incluindo montagem, instalação" não conta (Caraguatatuba/SP), nem "Não estão incluídos
   serviços de instalação ... ou mão de obra de instalação" e "A ausência de contratação dos
   serviços de instalação" (Ubiratã/PR). Em 21/10/2026 saem a diária de hotel que cita o
   ventilador do quarto ("APARTAMENTO AREJADO VENTILADOR CAMA E TV WI FI CAFE DA MANHA",
   Morrinhos/GO), a marmita "apta para freezer e micro-ondas" (Diorama/GO), a chapa
   bifeteira que o catálogo chama de fogão (Cornélio Procópio/PR) e o purificador de osmose
   reversa de laboratório (FMRP-USP, Ribeirão Preto/SP).
   E quando a tabela do edital numera a linha diferente do PNCP, o resumo e o card mostram
   os dois: "8 (no edital: 9)" — Paranaguá/PR numera o bebedouro de 9 no termo de
   referência e de 8 na relação de itens, que é a da disputa.
4. **Piso de preço unitário** de R$ 150 — equipamento de verdade custa. Chaleira elétrica,
   cafeteira, sanduicheira, grill e máquina de waffle não têm piso. O volume também salva o
   item: acima de R$ 140 com mais de 10 unidades, ou acima de R$ 100 com mais de 25 unidades
   (08/10/2026), ele fica. A chaleira de alumínio, de fogão, é panela e sai pelo veto, não
   pelo piso — a "industrial" também, quando é de alumínio e não é elétrica. Itens com valor
   **zero** são mantidos: é orçamento sigiloso, e a página mostra "sigiloso", nunca "R$ 0".
   O item que o PNCP marca como anulado, cancelado, revogado, **deserto** ou fracassado sai
   (deserto e fracassado desde 14/10/2026: o aquecedor de Sapiranga/RS estava "Deserto" com
   os outros itens do edital em andamento). O gás de cozinha que cita o fogão como uso ("Gás
   liquefeito de Petróleo (GLP) P13 ... Indicação: Fogão", Novo Itacolomi/PR) sai pela
   VETO_ITEM, só na frente do produto: o fogão "para botijões P13" fica.
5. **Duplicatas** — o mesmo edital sai duas vezes (publicação direta e via portal
   intermediário). Agrupa por município + UF + dia de encerramento + quantidade + valor,
   depois do filtro por portal: das cópias, fica a que passou por ele (30/09/2026).
6. **Piso do edital** — descarta edital cujo valor total estimado fique entre R$ 1 e
   R$ 4.000: compra de troco não vale a viagem. Valor **zero** fica, porque é orçamento
   sigiloso e pode ser grande.
7. **Item sem descritivo fica com o nome do PNCP** — desde 13/10/2026 (decisão do
   usuário: "Sempre"), o item do radar que o edital não especifica em lugar nenhum fica com o
   rótulo do catálogo do PNCP como descritivo, e o card avisa que a descrição é do catálogo
   (o micro-ondas de Bombinhas/SC, o ar-condicionado de Santa Rita do Araguaia/GO). De
   23/09 a 13/10 ele saía. Antes de cair no rótulo vale procurar a especificação no PDF
   inteiro: termo de referência escaneado, retificação em imagem, teto do texto e quebra de
   página já esconderam especificação que existia.
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
   Em 09/10/2026, 3 dos 13 barrados eram engano: a seção "exigências de amostra" que só
   pede catálogo, ficha técnica ou documento equivalente (Camboriú/SC), a remissão "serão
   exigidas amostras nos termos do item 4.15 do anexo I" a uma seção que só pede catálogo
   (Sant'Ana do Livramento/RS) e a "amostra, e/ou laudo(s) técnico(s) e/ou informações
   técnicas", que o documento substitui (Goiânia/GO). Esses três passam a ficar.
   Desde 13/10/2026 a exigência que a FRASE restringe a itens que a Digiplus não cota não
   barra (pedido do usuário: "pode ignorar as exigências de produtos que não cotamos"): o
   selo Procel/Energy Star "das Smart TVs e Monitores (Itens 10, 11 e 14)" do CNMP
   (Brasília/DF, edital 44), que só cota o climatizador do item 15. Vale pelo NÚMERO do item
   na frase e só quando a frase não nomeia um produto cotado (o edital por lote numera
   diferente do PNCP); sem número, a exigência vale para o edital inteiro. Esses ficam na
   lista e aparecem em `docs/barrados.json`, em "ignorados", com o trecho.

## Ressalvas

- Sobram cerca de **4% de falsos positivos** mesmo depois dos filtros. Confira o edital
  antes de cotar.
- Os valores são **estimativas do órgão**, não referência de mercado.
- Vários editais vêm com valor zerado por **orçamento sigiloso** — não é erro.
- A lista **não é exaustiva**. A busca do PNCP indexa o texto completo do edital, então é
  ampla, mas não perfeita.
