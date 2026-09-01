/* Gerador de PDF do Radar de Editais Digiplus.
 *
 * Por que escrever isto em vez de usar biblioteca: a pagina e servida pelo
 * GitHub Pages sem build e sem CDN, e window.print() sempre abre a caixa de
 * impressao — nunca salva arquivo direto. Para entregar um .pdf que baixa e
 * preciso montar os bytes aqui. jsPDF + autotable custariam ~460 KB no
 * repositorio; isto custa ~11 KB e nao depende de ninguem.
 *
 * Usa as fontes padrao Helvetica e Helvetica-Bold, que todo leitor de PDF ja
 * tem — nao embute fonte nenhuma. Elas cobrem todo o portugues via
 * WinAnsiEncoding, entao acento sai correto sem custo de tamanho.
 *
 * Roda igual no navegador e no Node (o teste em testa-pdf.mjs usa este mesmo
 * arquivo), por isso a exportacao no fim olha os dois mundos.
 */
(function (raiz) {
  "use strict";

  // ---------------------------------------------------------------- metricas
  // Larguras da AFM da Helvetica, em milesimos de em, para os codigos 32..126.
  // Letra acentuada tem a MESMA largura da letra base (o acento nao avanca o
  // cursor), entao a tabela abaixo mais o mapa BASE cobrem 0..255 sem precisar
  // de 256 numeros por fonte.
  var W_NORMAL = [
    278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
    1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
    333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,
    556,556,333,500,278,556,500,722,500,500,500,334,260,334,584
  ];
  var W_NEGRITO = [
    278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,
    975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,
    333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,
    611,611,389,556,333,611,556,778,556,556,500,389,280,389,584
  ];

  // codigo WinAnsi -> letra ASCII de mesma largura
  var BASE = {};
  (function () {
    var g = [
      ["A", [0xC0,0xC1,0xC2,0xC3,0xC4,0xC5]], ["C",[0xC7]],
      ["E", [0xC8,0xC9,0xCA,0xCB]],           ["I",[0xCC,0xCD,0xCE,0xCF]],
      ["N", [0xD1]],                          ["O",[0xD2,0xD3,0xD4,0xD5,0xD6,0xD8]],
      ["U", [0xD9,0xDA,0xDB,0xDC]],           ["Y",[0xDD]],
      ["a", [0xE0,0xE1,0xE2,0xE3,0xE4,0xE5]], ["c",[0xE7]],
      ["e", [0xE8,0xE9,0xEA,0xEB]],           ["i",[0xEC,0xED,0xEE,0xEF]],
      ["n", [0xF1]],                          ["o",[0xF2,0xF3,0xF4,0xF5,0xF6,0xF8]],
      ["u", [0xF9,0xFA,0xFB,0xFC]],           ["y",[0xFD,0xFF]],
      ["D", [0xD0]], ["P",[0xDE]], ["B",[0xDF]], ["d",[0xF0]], ["p",[0xFE]],
      ["+", [0xD7,0xF7,0xB1,0xAC]]
    ];
    for (var i = 0; i < g.length; i++)
      for (var j = 0; j < g[i][1].length; j++) BASE[g[i][1][j]] = g[i][0].charCodeAt(0);
  })();

  // os poucos sinais que nao herdam largura de letra nenhuma
  var W_EXTRA = {
    0xA0:278, 0xA1:333, 0xA2:556, 0xA3:556, 0xA5:556, 0xA7:556, 0xA9:737,
    0xAA:370, 0xAB:556, 0xAE:737, 0xB0:400, 0xB2:333, 0xB4:333, 0xB5:556,
    0xB6:537, 0xB7:278, 0xB9:333, 0xBA:365, 0xBB:556, 0xBF:611,
    0xC6:1000, 0xE6:889,
    0x80:556, 0x85:1000, 0x91:222, 0x92:222, 0x93:333, 0x94:333, 0x95:350,
    0x96:556, 0x97:1000, 0x99:1000
  };

  function larguraChar(cod, negrito) {
    var t = negrito ? W_NEGRITO : W_NORMAL;
    if (cod >= 32 && cod <= 126) return t[cod - 32];
    if (BASE[cod] !== undefined) return t[BASE[cod] - 32];
    if (W_EXTRA[cod] !== undefined) return W_EXTRA[cod];
    return negrito ? 611 : 556;   // sinal raro fora das tabelas: largura media
  }

  // ---------------------------------------------------------------- encoding
  // Unicode -> byte cp1252, para o que nao esta em Latin-1.
  var CP = {
    0x20AC:0x80, 0x201A:0x82, 0x0192:0x83, 0x201E:0x84, 0x2026:0x85,
    0x2020:0x86, 0x2021:0x87, 0x02C6:0x88, 0x2030:0x89, 0x0160:0x8A,
    0x2039:0x8B, 0x0152:0x8C, 0x017D:0x8E, 0x2018:0x91, 0x2019:0x92,
    0x201C:0x93, 0x201D:0x94, 0x2022:0x95, 0x2013:0x96, 0x2014:0x97,
    0x02DC:0x98, 0x2122:0x99, 0x0161:0x9A, 0x203A:0x9B, 0x0153:0x9C,
    0x017E:0x9E, 0x0178:0x9F
  };

  // devolve array de bytes WinAnsi; o que nao existe na tabela vira "?"
  function bytesDe(txt) {
    var out = [], s = String(txt == null ? "" : txt);
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 0x0A || c === 0x0D || c === 0x09) { out.push(32); continue; }
      if (c < 32) continue;
      if (c < 256) { out.push(c); continue; }
      if (CP[c] !== undefined) { out.push(CP[c]); continue; }
      out.push(63); // ?
    }
    return out;
  }

  function largura(txt, tam, negrito) {
    var b = bytesDe(txt), soma = 0;
    for (var i = 0; i < b.length; i++) soma += larguraChar(b[i], negrito);
    return soma * tam / 1000;
  }

  // literal de string PDF, com escape de ( ) e \
  function literal(txt) {
    var b = bytesDe(txt), s = "";
    for (var i = 0; i < b.length; i++) {
      var c = b[i];
      if (c === 40 || c === 41 || c === 92) s += "\\";
      s += String.fromCharCode(c);
    }
    return "(" + s + ")";
  }

  // ------------------------------------------------------------------ quebra
  // Quebra o texto em linhas que cabem na largura dada. Palavra maior que a
  // largura (codigo de item colado, URL) e partida no meio, senao ela vazaria
  // a coluna — varios descritivos do PNCP tem sequencias de 60+ caracteres.
  function quebra(txt, tam, negrito, larg) {
    var palavras = String(txt == null ? "" : txt).replace(/\s+/g, " ").trim().split(" ");
    var linhas = [], atual = "";
    function empurra() { if (atual !== "") { linhas.push(atual); atual = ""; } }
    for (var i = 0; i < palavras.length; i++) {
      var p = palavras[i];
      if (p === "") continue;
      var teste = atual === "" ? p : atual + " " + p;
      if (largura(teste, tam, negrito) <= larg) { atual = teste; continue; }
      empurra();
      if (largura(p, tam, negrito) <= larg) { atual = p; continue; }
      var pedaco = "";
      for (var k = 0; k < p.length; k++) {
        if (largura(pedaco + p[k], tam, negrito) > larg && pedaco !== "") {
          linhas.push(pedaco); pedaco = "";
        }
        pedaco += p[k];
      }
      atual = pedaco;
    }
    empurra();
    return linhas.length ? linhas : [""];
  }

  // ---------------------------------------------------------------- documento
  var A4 = { l: 595.28, a: 841.89 };

  function novo(cfg) {
    cfg = cfg || {};
    var margem  = cfg.margem  === undefined ? 40 : cfg.margem;
    var rodape  = cfg.rodape  || "";
    var paginas = [];          // cada pagina e um array de comandos
    var pag = null;
    var y = 0;
    var larguraUtil = A4.l - margem * 2;

    // paginas copiadas do edital oficial pelo docs/pdf-le.js. Chegam com a
    // numeracao da origem; o bytes() e que atribui numero neste documento.
    var externos = [];            // [{id, valor}] na ordem de emissao
    var paginasExternas = [];     // ids (dentro de `externos`) que sao pagina
    var externasAntes = false;

    function novaPagina() {
      pag = [];
      paginas.push(pag);
      y = A4.a - margem;
    }
    novaPagina();

    function cabe(alt) { return y - alt >= margem + 22; }
    function garante(alt) { if (!cabe(alt)) novaPagina(); }

    function cor(c) {              // c = [r,g,b] em 0..1
      pag.push(c[0] + " " + c[1] + " " + c[2] + " rg");
    }
    function corLinha(c) {
      pag.push(c[0] + " " + c[1] + " " + c[2] + " RG");
    }

    // escreve UMA linha ja quebrada, sem mexer no cursor
    function pinta(txt, x, yy, tam, negrito, c) {
      cor(c || [0, 0, 0]);
      pag.push("BT /" + (negrito ? "F2" : "F1") + " " + tam + " Tf " +
               x.toFixed(2) + " " + yy.toFixed(2) + " Td " + literal(txt) + " Tj ET");
    }

    var api = {
      // ------------------------------------------------- blocos de texto
      texto: function (txt, o) {
        o = o || {};
        var tam = o.tam || 10, neg = !!o.negrito, c = o.cor || [0, 0, 0];
        var larg = o.largura || larguraUtil;
        var x = margem + (o.recuo || 0);
        var alturaLinha = o.alturaLinha || tam * 1.32;
        var linhas = quebra(txt, tam, neg, larg);
        for (var i = 0; i < linhas.length; i++) {
          garante(alturaLinha);
          y -= alturaLinha;
          var xx = x;
          if (o.alinha === "direita") xx = margem + larg - largura(linhas[i], tam, neg);
          else if (o.alinha === "centro") xx = margem + (larg - largura(linhas[i], tam, neg)) / 2;
          pinta(linhas[i], xx, y, tam, neg, c);
        }
        if (o.depois) y -= o.depois;
        return api;
      },

      // titulo com valor alinhado a direita na mesma linha (cabecalho de edital)
      tituloComValor: function (esq, dir, o) {
        o = o || {};
        var tam = o.tam || 12;
        var alturaLinha = tam * 1.35;
        var largDir = largura(dir, tam, true);
        var linhas = quebra(esq, tam, true, larguraUtil - largDir - 12);
        garante(alturaLinha * linhas.length);
        for (var i = 0; i < linhas.length; i++) {
          y -= alturaLinha;
          pinta(linhas[i], margem, y, tam, true, o.cor || [0, 0, 0]);
          if (i === 0 && dir) pinta(dir, margem + larguraUtil - largDir, y, tam, true, o.cor || [0, 0, 0]);
        }
        return api;
      },

      // rotulo em negrito a esquerda, valor a direita quebrando alinhado sob si mesmo
      campo: function (rotulo, valor, o) {
        o = o || {};
        var tam = o.tam || 9;
        var largRot = o.larguraRotulo || 118;
        var alturaLinha = tam * 1.34;
        var linhas = quebra(valor, tam, false, larguraUtil - largRot);
        garante(alturaLinha * linhas.length);
        for (var i = 0; i < linhas.length; i++) {
          y -= alturaLinha;
          if (i === 0) pinta(rotulo, margem, y, tam, true, o.corRotulo || [0.30, 0.30, 0.30]);
          pinta(linhas[i], margem + largRot, y, tam, false, o.cor || [0, 0, 0]);
        }
        return api;
      },

      // rotulo a esquerda e valor encostado na direita, na mesma linha
      parOposto: function (esq, dir, o) {
        o = o || {};
        var tam = o.tam || 9;
        var negE = !!o.negritoEsq, negD = !!o.negritoDir;
        var alturaLinha = tam * 1.34;
        garante(alturaLinha);
        y -= alturaLinha;
        pinta(esq, margem, y, tam, negE, o.corEsq || [0.32, 0.32, 0.32]);
        if (dir) pinta(dir, margem + larguraUtil - largura(dir, tam, negD), y, tam, negD, o.corDir || [0, 0, 0]);
        return api;
      },

      // abre pagina nova se nao sobrar pelo menos `alt` — evita cabecalho de
      // item orfao no pe da pagina, com o corpo do bloco na pagina seguinte
      reserva: function (alt) { garante(alt); return api; },

      espaco: function (n) { y -= (n || 6); return api; },

      regua: function (grossura, c) {
        garante(6);
        y -= 4;
        corLinha(c || [0, 0, 0]);
        pag.push((grossura || 0.7) + " w " + margem + " " + y.toFixed(2) + " m " +
                 (margem + larguraUtil) + " " + y.toFixed(2) + " l S");
        y -= 4;
        return api;
      },

      // pacote vem do RadarPDFLe.extraiPaginas(). antes=true poe as paginas do
      // orgao na frente do resumo; o padrao e o resumo primeiro.
      anexaExternas: function (pacote, antes) {
        if (!pacote || !pacote.objetos) return api;
        externos = externos.concat(pacote.objetos);
        paginasExternas = paginasExternas.concat(pacote.paginas);
        externasAntes = !!antes;
        return api;
      },

      novaPagina: function () { novaPagina(); return api; },

      // --------------------------------------------------------- tabela
      // cols: [{titulo, larg (fracao de 1), alinha}]
      // linhas: [[celula, ...], ...]
      // Cabecalho se repete a cada quebra de pagina.
      tabela: function (cols, linhas, o) {
        o = o || {};
        var tam = o.tam || 8.5;
        var tamCab = o.tamCabecalho || 8;
        var padX = 4, padY = 3.5;
        var alturaLinha = tam * 1.25;
        var xs = [], larguras = [], acc = margem;
        for (var i = 0; i < cols.length; i++) {
          var w = cols[i].larg * larguraUtil;
          xs.push(acc); larguras.push(w); acc += w;
        }

        function cabecalho() {
          var alt = tamCab * 1.25 + padY * 2;
          garante(alt + alturaLinha + padY * 2);
          y -= alt;
          cor([0.90, 0.90, 0.90]);
          pag.push(margem + " " + y.toFixed(2) + " " + larguraUtil + " " + alt.toFixed(2) + " re f");
          corLinha([0.55, 0.55, 0.55]);
          pag.push("0.5 w " + margem + " " + y.toFixed(2) + " " + larguraUtil + " " + alt.toFixed(2) + " re S");
          for (var i = 0; i < cols.length; i++) {
            var tx = xs[i] + padX;
            if (cols[i].alinha === "direita") tx = xs[i] + larguras[i] - padX - largura(cols[i].titulo, tamCab, true);
            else if (cols[i].alinha === "centro") tx = xs[i] + (larguras[i] - largura(cols[i].titulo, tamCab, true)) / 2;
            pinta(cols[i].titulo, tx, y + padY + 1.5, tamCab, true, [0, 0, 0]);
            if (i > 0) pag.push("0.5 w " + xs[i].toFixed(2) + " " + y.toFixed(2) + " m " +
                                xs[i].toFixed(2) + " " + (y + alt).toFixed(2) + " l S");
          }
        }

        cabecalho();

        for (var r = 0; r < linhas.length; r++) {
          var celulas = [], maxLinhas = 1;
          for (var c2 = 0; c2 < cols.length; c2++) {
            var q = quebra(linhas[r][c2], tam, false, larguras[c2] - padX * 2);
            celulas.push(q);
            if (q.length > maxLinhas) maxLinhas = q.length;
          }
          var alt2 = maxLinhas * alturaLinha + padY * 2;
          if (!cabe(alt2)) { novaPagina(); cabecalho(); }
          y -= alt2;
          corLinha([0.6, 0.6, 0.6]);
          pag.push("0.5 w " + margem + " " + y.toFixed(2) + " " + larguraUtil + " " + alt2.toFixed(2) + " re S");
          for (var c3 = 0; c3 < cols.length; c3++) {
            if (c3 > 0) pag.push("0.5 w " + xs[c3].toFixed(2) + " " + y.toFixed(2) + " m " +
                                 xs[c3].toFixed(2) + " " + (y + alt2).toFixed(2) + " l S");
            for (var L = 0; L < celulas[c3].length; L++) {
              var txt = celulas[c3][L];
              var tx2 = xs[c3] + padX;
              if (cols[c3].alinha === "direita") tx2 = xs[c3] + larguras[c3] - padX - largura(txt, tam, false);
              else if (cols[c3].alinha === "centro") tx2 = xs[c3] + (larguras[c3] - largura(txt, tam, false)) / 2;
              pinta(txt, tx2, y + alt2 - padY - alturaLinha * (L + 1) + alturaLinha * 0.28, tam, false, [0, 0, 0]);
            }
          }
        }
        return api;
      },

      // ------------------------------------------------------ serializacao
      bytes: function () {
        var meus = paginas.length;
        var antes = externasAntes ? paginasExternas.length : 0;
        var totalDoc = meus + paginasExternas.length;

        // rodape com "x de N" so da para escrever agora, com N conhecido — e N
        // conta as paginas do orgao tambem, senao a numeracao mente
        for (var i = 0; i < meus; i++) {
          var marca = (rodape ? rodape + "  \u00b7  " : "") + "pagina " + (antes + i + 1) + " de " + totalDoc;
          paginas[i].push("0.42 0.42 0.42 rg");
          paginas[i].push("BT /F1 7.5 Tf " + margem + " " + (margem - 12).toFixed(2) +
                          " Td " + literal(marca) + " Tj ET");
        }

        // 1 catalogo, 2 pages, 3 F1, 4 F2, depois pagina/conteudo aos pares
        var idPag = [], idCont = [];
        for (var p = 0; p < meus; p++) { idPag.push(5 + p * 2); idCont.push(6 + p * 2); }
        var proximo = 5 + meus * 2;

        var mapa = {};
        for (var e = 0; e < externos.length; e++) mapa[externos[e].id] = proximo++;
        // -1 e o apelido da minha arvore de paginas, usado no /Parent das copiadas
        var remapeia = function (n) { return n === -1 ? 2 : (mapa[n] !== undefined ? mapa[n] : 0); };
        var idsExternas = paginasExternas.map(function (id) { return mapa[id]; });
        var kids = externasAntes ? idsExternas.concat(idPag) : idPag.concat(idsExternas);

        // corpo[n] e string, ou {cab, bruto, fim} quando o objeto tem fluxo
        var corpo = [];
        corpo[1] = "<< /Type /Catalog /Pages 2 0 R >>";
        corpo[2] = "<< /Type /Pages /Count " + kids.length + " /Kids [" +
                   kids.map(function (n) { return n + " 0 R"; }).join(" ") + "] >>";
        corpo[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
        corpo[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

        for (var q = 0; q < meus; q++) {
          corpo[idPag[q]] =
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + A4.l + " " + A4.a + "] " +
            "/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + idCont[q] + " 0 R >>";
          var fluxo = paginas[q].join("\n");
          corpo[idCont[q]] = "<< /Length " + bytesDe(fluxo).length + " >>\nstream\n" + fluxo + "\nendstream";
        }

        var LE = raiz.RadarPDFLe;
        for (var x = 0; x < externos.length; x++) {
          var num = mapa[externos[x].id];
          var v = externos[x].valor;
          if (v && v.__fluxo) {
            var d = {};
            for (var chave in v.dict.__dict) d[chave] = v.dict.__dict[chave];
            d.Length = v.bruto.length;      // o /Length da origem pode ser referencia
            corpo[num] = { cab: LE.serializa(LE.Dict(d), remapeia) + "\nstream\n",
                           bruto: v.bruto, fim: "\nendstream" };
          } else {
            // a pagina copiada tem que apontar para a MINHA arvore de paginas
            if (LE.ehDict(v) && LE.ehNome(v.__dict.Type) && v.__dict.Type.__nome === "Page") {
              var pd = {};
              for (var c2 in v.__dict) pd[c2] = v.__dict[c2];
              pd.Parent = LE.Ref(-1, 0);
              v = LE.Dict(pd);
            }
            corpo[num] = LE.serializa(v, remapeia);
          }
        }

        // Monta em pedacos em vez de concatenar string: o fluxo copiado e
        // binario, e emenda-lo com replace() faria o "$" dele virar grupo de
        // captura. Aqui cada pedaco entra byte a byte, sem interpretacao.
        var partes = [], tam = 0;
        function poe(s) { partes.push(s); tam += s.length; }
        function poeBruto(u8) { partes.push(u8); tam += u8.length; }

        poe("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n");
        var offsets = [];
        for (var n = 1; n < corpo.length; n++) {
          if (corpo[n] === undefined) { offsets[n] = 0; continue; }
          offsets[n] = tam;
          poe(n + " 0 obj\n");
          if (typeof corpo[n] === "string") poe(corpo[n]);
          else { poe(corpo[n].cab); poeBruto(corpo[n].bruto); poe(corpo[n].fim); }
          poe("\nendobj\n");
        }
        var inicioXref = tam;
        poe("xref\n0 " + corpo.length + "\n0000000000 65535 f \n");
        for (var m = 1; m < corpo.length; m++) {
          poe(("0000000000" + (offsets[m] || 0)).slice(-10) + " 00000 " +
              (corpo[m] === undefined ? "f" : "n") + " \n");
        }
        poe("trailer\n<< /Size " + corpo.length + " /Root 1 0 R >>\nstartxref\n" +
            inicioXref + "\n%%EOF\n");

        var arr = new Uint8Array(tam), pos = 0;
        for (var k = 0; k < partes.length; k++) {
          var pe = partes[k];
          if (typeof pe === "string") {
            for (var z = 0; z < pe.length; z++) arr[pos++] = pe.charCodeAt(z) & 0xFF;
          } else { arr.set(pe, pos); pos += pe.length; }
        }
        return arr;
      },

            paginas: function () { return paginas.length; }
    };

    return api;
  }

  // dispara o download de verdade: Blob + <a download>, sem servidor
  function baixa(bytes, nome) {
    var blob = new Blob([bytes], { type: "application/pdf" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = nome.replace(/[^0-9A-Za-zÀ-ÿ ._-]/g, " ").replace(/ +/g, " ").trim();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  var mod = { novo: novo, baixa: baixa, largura: largura, quebra: quebra, A4: A4 };
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  raiz.RadarPDF = mod;
})(typeof globalThis !== "undefined" ? globalThis : this);
