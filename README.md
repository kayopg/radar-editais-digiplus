# Radar de Editais — Digiplus

Monitoramento diário de licitações públicas abertas no [PNCP](https://pncp.gov.br) com itens
de linha branca, climatização, cocção, lavanderia e eletroportáteis — filtradas para
**fornecimento puro**, sem exigência de instalação, montagem ou manutenção.

**Página:** https://kayopg.github.io/radar-editais-digiplus/

Estados atendidos: PR, RS, SP, MG, GO, MT, MS, SC.

## Como funciona

O GitHub Actions roda a varredura de segunda a sexta às 6h23 (horário de Brasília), grava
`docs/dados.json` e commita. A página busca esse JSON toda vez que alguém abre — não é
preciso republicar nada, e o link nunca muda.

Antes de commitar, o `conferir.mjs` checa se o resultado faz sentido: lista vazia,
encolhimento maior que 40% em relação ao dia anterior, ou mais de 10% das buscas falhando
derrubam o job. Nesse caso o `dados.json` de ontem continua no ar e o GitHub avisa por
e-mail — dado velho e inteiro é melhor que dado novo pela metade.

```
varredura.mjs  →  dados/ultima.json  →  publicar.mjs  →  docs/dados.json  →  docs/index.html
```

| Arquivo | O que faz |
|---|---|
| `varredura.mjs` | 32 termos × 8 UFs × 2 páginas no PNCP, lê os itens de cada processo e aplica os filtros. ~12 min. |
| `publicar.mjs` | Converte a saída bruta no `docs/dados.json` que a página consome. |
| `delta.mjs` | Compara duas versões do `dados.json` e imprime o que entrou, o que saiu e o que fecha em 48 h. |
| `conferir.mjs` | Trava de sanidade: derruba o job antes do commit se o resultado do dia parecer degradado. |
| `docs/index.html` | A página. Sem dependência externa, sem build. |
| `docs/pdf.js` | Gerador de PDF próprio, ~12 KB, sem biblioteca. "Baixar edital resumido" baixa um arquivo por edital; "Baixar lista em PDF" baixa a lista inteira que o filtro está mostrando, com índice na frente. |
| `testa-pdf.mjs` | Gera os dois PDFs pelo Node com dados reais, para conferir layout e paginação sem abrir o navegador. |

Rodar na mão:

```bash
node varredura.mjs && node publicar.mjs
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
   interesse for serviço.
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
