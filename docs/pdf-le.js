/* Leitor de PDF do Radar de Editais Digiplus.
 *
 * Faz UMA coisa: abrir o PDF oficial do órgão, publicado no PNCP, e copiar
 * páginas escolhidas dele para dentro do PDF que o docs/pdf.js gera. Assim o
 * resumo sai com a primeira folha do edital — datas, objeto, contratante —
 * num arquivo só.
 *
 * Por que dá para fazer sem biblioteca: o CORS do PNCP é `*`, então o navegador
 * baixa o arquivo; e numa amostra de 14 editais reais NENHUM estava
 * criptografado. O que aparece de verdade é xref clássico (8) e xref stream (6),
 * com object stream em 11 deles — é isso que este arquivo precisa entender.
 *
 * O que NÃO faz: não renderiza, não extrai texto, não decodifica fonte. Copia
 * os objetos como estão, com os fluxos byte a byte e o /Filter original — por
 * isso não precisa saber nada sobre compressão de imagem ou tipo de fonte.
 *
 * Roda no navegador e no Node: DecompressionStream existe nos dois (Node 18+).
 */
(function (raiz) {
  "use strict";

  var ESPACO = [0, 9, 10, 12, 13, 32];
  function ehEspaco(c) { return ESPACO.indexOf(c) >= 0; }
  function ehDelim(c) {
    return c === 0x28 || c === 0x29 || c === 0x3C || c === 0x3E || c === 0x5B ||
           c === 0x5D || c === 0x7B || c === 0x7D || c === 0x2F || c === 0x25;
  }
  function ehRegular(c) { return !ehEspaco(c) && !ehDelim(c); }

  // ------------------------------------------------------------------ inflate
  async function inflate(u8) {
    if (typeof DecompressionStream === "undefined")
      throw new Error("DecompressionStream indisponivel");
    // Alem do zlib normal, tenta: deflate cru (sem cabecalho, alguns geradores
    // usam) e o dado aparado no fim (byte de sobra antes do endstream).
    var aparado = u8;
    while (aparado.length && (aparado[aparado.length - 1] === 10 || aparado[aparado.length - 1] === 13))
      aparado = aparado.subarray(0, aparado.length - 1);
    var tentativas = [[u8, "deflate"], [u8, "deflate-raw"]];
    if (aparado.length !== u8.length) tentativas.push([aparado, "deflate"], [aparado, "deflate-raw"]);
    for (var t = 0; t < tentativas.length; t++) {
      try {
        var fluxo = new Blob([tentativas[t][0]]).stream()
                      .pipeThrough(new DecompressionStream(tentativas[t][1]));
        return new Uint8Array(await new Response(fluxo).arrayBuffer());
      } catch (e) { /* tenta o proximo */ }
    }
    throw new Error("falha ao descomprimir");
  }

  // Preditor PNG, usado pela maioria dos xref stream. Sem isto os bytes do
  // xref saem embaralhados e nenhum objeto e encontrado.
  function desfazPreditor(dados, preditor, cores, bpc, colunas) {
    if (!preditor || preditor < 2) return dados;
    if (preditor === 2) return dados;                    // TIFF, raro; nao aparece nos editais
    var bpp = Math.ceil(cores * bpc / 8);
    var linha = Math.ceil(cores * bpc * colunas / 8);
    var saida = new Uint8Array(Math.floor(dados.length / (linha + 1)) * linha);
    var anterior = new Uint8Array(linha), pos = 0, destino = 0;
    while (pos + linha < dados.length + 1 && destino < saida.length) {
      var tipo = dados[pos++];
      var atual = dados.slice(pos, pos + linha); pos += linha;
      for (var i = 0; i < linha; i++) {
        var a = i >= bpp ? atual[i - bpp] : 0, b = anterior[i], c = i >= bpp ? anterior[i - bpp] : 0;
        if (tipo === 1) atual[i] = (atual[i] + a) & 0xFF;
        else if (tipo === 2) atual[i] = (atual[i] + b) & 0xFF;
        else if (tipo === 3) atual[i] = (atual[i] + ((a + b) >> 1)) & 0xFF;
        else if (tipo === 4) {
          var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          atual[i] = (atual[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xFF;
        }
      }
      saida.set(atual, destino); destino += linha;
      anterior = atual;
    }
    return saida;
  }

  // ------------------------------------------------------------------- tipos
  // nome -> {nome}   ref -> {num, gen}   fluxo -> {dict, bruto}
  function Nome(n) { return { __nome: n }; }
  function Ref(num, gen) { return { __ref: true, num: num, gen: gen }; }
  var ehNome = v => v && v.__nome !== undefined;
  var ehRef  = v => v && v.__ref === true;
  var ehDict = v => v && v.__dict !== undefined;
  function Dict(m) { return { __dict: m }; }

  // ------------------------------------------------------------------ parser
  function Parser(b, pos) {
    this.b = b;
    this.i = pos || 0;
  }
  Parser.prototype.pulaBranco = function () {
    while (this.i < this.b.length) {
      var c = this.b[this.i];
      if (ehEspaco(c)) { this.i++; continue; }
      if (c === 0x25) { while (this.i < this.b.length && this.b[this.i] !== 10 && this.b[this.i] !== 13) this.i++; continue; }
      break;
    }
  };
  Parser.prototype.palavra = function () {
    this.pulaBranco();
    var ini = this.i;
    while (this.i < this.b.length && ehRegular(this.b[this.i])) this.i++;
    if (this.i === ini) this.i++;                  // delimitador solto
    return latin1(this.b, ini, this.i);
  };
  Parser.prototype.espia = function () { this.pulaBranco(); return this.b[this.i]; };

  Parser.prototype.valor = function () {
    this.pulaBranco();
    var c = this.b[this.i];
    if (c === undefined) return null;

    if (c === 0x3C && this.b[this.i + 1] === 0x3C) {          // <<
      this.i += 2;
      var m = {};
      for (;;) {
        this.pulaBranco();
        if (this.b[this.i] === 0x3E && this.b[this.i + 1] === 0x3E) { this.i += 2; break; }
        if (this.i >= this.b.length) break;
        if (this.b[this.i] !== 0x2F) { this.i++; continue; }   // lixo entre chaves
        var chave = this.lerNome();
        m[chave] = this.valor();
      }
      return Dict(m);
    }
    if (c === 0x5B) {                                          // [
      this.i++;
      var a = [];
      for (;;) {
        this.pulaBranco();
        if (this.b[this.i] === 0x5D) { this.i++; break; }
        if (this.i >= this.b.length) break;
        a.push(this.valor());
      }
      return a;
    }
    if (c === 0x2F) return Nome(this.lerNome());
    if (c === 0x28) return this.lerLiteral();
    if (c === 0x3C) return this.lerHex();

    var p = this.palavra();
    if (p === "true") return true;
    if (p === "false") return false;
    if (p === "null") return null;
    if (/^[+-]?[\d.]+$/.test(p)) {
      var n = parseFloat(p);
      // "12 0 R" -> referencia
      if (/^\d+$/.test(p)) {
        var salvo = this.i;
        var p2 = this.palavra();
        if (/^\d+$/.test(p2)) {
          var salvo2 = this.i;
          var p3 = this.palavra();
          if (p3 === "R") return Ref(n, parseInt(p2, 10));
          this.i = salvo2;
        }
        this.i = salvo;
      }
      return n;
    }
    return Nome(p);        // operador solto; nao deveria acontecer em objeto
  };

  Parser.prototype.lerNome = function () {
    this.i++;                                     // pula "/"
    var s = "";
    while (this.i < this.b.length && ehRegular(this.b[this.i])) {
      var c = this.b[this.i];
      if (c === 0x23 && this.i + 2 < this.b.length) {
        var h = latin1(this.b, this.i + 1, this.i + 3);
        if (/^[0-9a-fA-F]{2}$/.test(h)) { s += String.fromCharCode(parseInt(h, 16)); this.i += 3; continue; }
      }
      s += String.fromCharCode(c); this.i++;
    }
    return s;
  };
  Parser.prototype.lerLiteral = function () {
    this.i++;
    var prof = 1, bytes = [];
    while (this.i < this.b.length) {
      var c = this.b[this.i++];
      if (c === 0x5C) {                            // barra invertida
        var d = this.b[this.i++];
        var mapa = { 0x6E:10, 0x72:13, 0x74:9, 0x62:8, 0x66:12 };
        if (mapa[d] !== undefined) bytes.push(mapa[d]);
        else if (d >= 0x30 && d <= 0x37) {         // octal
          var o = String.fromCharCode(d);
          for (var k = 0; k < 2 && this.b[this.i] >= 0x30 && this.b[this.i] <= 0x37; k++) o += String.fromCharCode(this.b[this.i++]);
          bytes.push(parseInt(o, 8) & 0xFF);
        } else if (d !== 10 && d !== 13) bytes.push(d);
        continue;
      }
      if (c === 0x28) { prof++; bytes.push(c); continue; }
      if (c === 0x29) { prof--; if (prof === 0) break; bytes.push(c); continue; }
      bytes.push(c);
    }
    return { __str: Uint8Array.from(bytes) };
  };
  Parser.prototype.lerHex = function () {
    this.i++;
    var h = "";
    while (this.i < this.b.length && this.b[this.i] !== 0x3E) {
      var c = this.b[this.i++];
      if (/[0-9a-fA-F]/.test(String.fromCharCode(c))) h += String.fromCharCode(c);
    }
    this.i++;
    if (h.length % 2) h += "0";
    var bytes = new Uint8Array(h.length / 2);
    for (var k = 0; k < bytes.length; k++) bytes[k] = parseInt(h.substr(k * 2, 2), 16);
    return { __str: bytes };
  };

  function latin1(b, ini, fim) {
    var s = "";
    for (var i = ini; i < fim; i++) s += String.fromCharCode(b[i]);
    return s;
  }

  // ------------------------------------------------------------------ leitor
  async function abre(bytes) {
    var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var cache = {};          // num -> valor ja lido
    var mapa = {};           // num -> {off} ou {stm, idx}
    var trailer = {};

    // ---- localiza o startxref e percorre a cadeia (com /Prev e /XRefStm)
    var fim = latin1(b, Math.max(0, b.length - 2048), b.length);
    var m = /startxref\s+(\d+)[\s\S]*?$/.exec(fim);
    if (!m) throw new Error("startxref nao encontrado");

    var vistos = {};
    var fila = [parseInt(m[1], 10)];
    while (fila.length) {
      var off = fila.shift();
      if (off === undefined || off < 0 || off >= b.length || vistos[off]) continue;
      vistos[off] = 1;
      var p = new Parser(b, off);
      p.pulaBranco();
      if (latin1(b, p.i, p.i + 4) === "xref") {
        // ---- tabela classica
        p.i += 4;
        for (;;) {
          p.pulaBranco();
          if (latin1(b, p.i, p.i + 7) === "trailer") { p.i += 7; break; }
          var ini = p.palavra(), qtd = p.palavra();
          if (!/^\d+$/.test(ini) || !/^\d+$/.test(qtd)) break;
          ini = parseInt(ini, 10); qtd = parseInt(qtd, 10);
          for (var k = 0; k < qtd; k++) {
            p.pulaBranco();
            var e1 = p.palavra(), e2 = p.palavra(), e3 = p.palavra();
            var num = ini + k;
            if (e3 === "n" && mapa[num] === undefined) mapa[num] = { off: parseInt(e1, 10) };
          }
        }
        var tr = p.valor();
        if (ehDict(tr)) {
          for (var chave in tr.__dict) if (trailer[chave] === undefined) trailer[chave] = tr.__dict[chave];
          if (typeof tr.__dict.XRefStm === "number") fila.push(tr.__dict.XRefStm);
          if (typeof tr.__dict.Prev === "number") fila.push(tr.__dict.Prev);
        }
      } else {
        // ---- xref stream: "N G obj << ... >> stream"
        p.palavra(); p.palavra(); p.palavra();          // num gen obj
        var d = p.valor();
        if (!ehDict(d)) continue;
        var raw = leFluxoBruto(b, p, d);
        var dados = await decodifica(raw, d, null);
        var W = (d.__dict.W || []).map(Number);
        var tam = Number(d.__dict.Size || 0);
        var indice = d.__dict.Index ? d.__dict.Index.map(Number) : [0, tam];
        var larg = W.reduce(function (a, c) { return a + c; }, 0);
        var pos = 0;
        for (var s = 0; s + 1 < indice.length; s += 2) {
          for (var j = 0; j < indice[s + 1] && pos + larg <= dados.length; j++) {
            var campos = [];
            for (var w = 0; w < W.length; w++) {
              var v = 0;
              for (var q = 0; q < W[w]; q++) v = v * 256 + dados[pos++];
              campos.push(W[w] === 0 ? (w === 0 ? 1 : 0) : v);
            }
            var n2 = indice[s] + j;
            if (mapa[n2] === undefined) {
              if (campos[0] === 1) mapa[n2] = { off: campos[1] };
              else if (campos[0] === 2) mapa[n2] = { stm: campos[1], idx: campos[2] };
            }
          }
        }
        for (var chave2 in d.__dict) if (trailer[chave2] === undefined) trailer[chave2] = d.__dict[chave2];
        if (typeof d.__dict.Prev === "number") fila.push(d.__dict.Prev);
      }
    }

    // ---- lê o fluxo bruto logo depois do dicionário
    function leFluxoBruto(buf, parser, dict) {
      parser.pulaBranco();
      if (latin1(buf, parser.i, parser.i + 6) !== "stream") return null;
      parser.i += 6;
      if (buf[parser.i] === 13) parser.i++;
      if (buf[parser.i] === 10) parser.i++;
      var ini = parser.i;
      var len = dict.__dict.Length;
      if (ehRef(len)) len = null;                    // resolvido depois; usa endstream
      if (typeof len === "number" && ini + len <= buf.length) {
        var fimTeste = latin1(buf, ini + len, ini + len + 20);
        if (/^\s*endstream/.test(fimTeste)) return buf.slice(ini, ini + len);
      }
      // Sem /Length utilizavel (costuma ser referencia indireta), acha o
      // "endstream" e recua o fim de linha que o separa do fluxo. Sem esse
      // recuo o zlib recebe \r\n de sobra depois do fim do dado e recusa —
      // foi o que derrubou o edital de Sorocaba/SP, gerado pelo SAMBox.
      var alvo = latin1(buf, ini, buf.length).indexOf("endstream");
      var fim = alvo < 0 ? buf.length : ini + alvo;
      while (fim > ini && (buf[fim - 1] === 10 || buf[fim - 1] === 13)) fim--;
      return buf.slice(ini, fim);
    }

    async function decodifica(raw, dict, quem) {
      if (!raw) return new Uint8Array(0);
      var f = dict.__dict.Filter;
      var filtros = !f ? [] : (Array.isArray(f) ? f : [f]).map(function (x) { return ehNome(x) ? x.__nome : ""; });
      var parms = dict.__dict.DecodeParms || dict.__dict.DP;
      if (parms && !Array.isArray(parms)) parms = [parms];
      var dados = raw;
      for (var i = 0; i < filtros.length; i++) {
        if (filtros[i] === "FlateDecode") {
          dados = await inflate(dados);
          var pm = parms && parms[i] && ehDict(parms[i]) ? parms[i].__dict : null;
          if (pm && pm.Predictor) dados = desfazPreditor(dados, Number(pm.Predictor),
            Number(pm.Colors || 1), Number(pm.BitsPerComponent || 8), Number(pm.Columns || 1));
        } else if (filtros[i] === "ASCIIHexDecode") {
          var s2 = latin1(dados, 0, dados.length).replace(/[^0-9a-fA-F]/g, "");
          var out = new Uint8Array(Math.floor(s2.length / 2));
          for (var z = 0; z < out.length; z++) out[z] = parseInt(s2.substr(z * 2, 2), 16);
          dados = out;
        } else break;      // filtro de imagem (DCT, JPX...) fica como esta
      }
      return dados;
    }

    // ---- objetos
    var objStmCache = {};
    async function obj(num) {
      if (cache[num] !== undefined) return cache[num];
      var loc = mapa[num];
      if (!loc) return (cache[num] = null);
      var v = null;
      if (loc.off !== undefined) {
        var p = new Parser(b, loc.off);
        p.palavra(); p.palavra();
        if (p.palavra() !== "obj") { return (cache[num] = null); }
        v = p.valor();
        if (ehDict(v)) {
          var raw = leFluxoBruto(b, p, v);
          if (raw) v = { __fluxo: true, dict: v, bruto: raw };
        }
      } else {
        var lista = objStmCache[loc.stm];
        if (!lista) {
          lista = objStmCache[loc.stm] = await leObjStm(loc.stm);
        }
        v = lista && lista[num] !== undefined ? lista[num] : null;
      }
      return (cache[num] = v);
    }

    async function leObjStm(num) {
      var loc = mapa[num];
      if (!loc || loc.off === undefined) return {};
      var p = new Parser(b, loc.off);
      p.palavra(); p.palavra(); p.palavra();
      var d = p.valor();
      if (!ehDict(d)) return {};
      var raw = leFluxoBruto(b, p, d);
      var dados = await decodifica(raw, d, num);
      var n = Number(await resolve(d.__dict.N) || 0);
      var first = Number(await resolve(d.__dict.First) || 0);
      var cab = new Parser(dados, 0);
      var pares = [];
      for (var i = 0; i < n; i++) {
        var a = cab.palavra(), c = cab.palavra();
        pares.push([parseInt(a, 10), parseInt(c, 10)]);
      }
      var saida = {};
      for (var k = 0; k < pares.length; k++) {
        var pp = new Parser(dados, first + pares[k][1]);
        saida[pares[k][0]] = pp.valor();
      }
      return saida;
    }

    async function resolve(v) {
      var n = 0;
      while (ehRef(v) && n++ < 32) v = await obj(v.num);
      return v;
    }

    // ---- árvore de páginas, já com os atributos herdados
    var HERDA = ["Resources", "MediaBox", "CropBox", "Rotate"];
    var paginas = [];
    async function anda(ref, herdado, prof) {
      if (prof > 64 || paginas.length > 5000) return;
      var no = await resolve(ref);
      if (!ehDict(no)) return;
      var d = no.__dict;
      var novo = {};
      for (var h = 0; h < HERDA.length; h++)
        novo[HERDA[h]] = d[HERDA[h]] !== undefined ? d[HERDA[h]] : herdado[HERDA[h]];
      var tipo = ehNome(d.Type) ? d.Type.__nome : (d.Kids ? "Pages" : "Page");
      if (tipo === "Page") { paginas.push({ ref: ref, dict: d, herdado: novo }); return; }
      var kids = await resolve(d.Kids);
      if (!Array.isArray(kids)) return;
      for (var i = 0; i < kids.length; i++) await anda(kids[i], novo, prof + 1);
    }

    var raizCat = await resolve(trailer.Root);
    if (!ehDict(raizCat)) throw new Error("catalogo nao encontrado");
    await anda(raizCat.__dict.Pages, {}, 0);
    if (!paginas.length) throw new Error("nenhuma pagina encontrada");

    return {
      total: paginas.length,
      pagina: function (i) { return paginas[i]; },
      resolve: resolve,
      obj: obj,
      ehRef: ehRef, ehDict: ehDict, ehNome: ehNome,
      criptografado: trailer.Encrypt !== undefined
    };
  }

  // -------------------------------------------------------- serializacao
  // Converte o valor de volta para a sintaxe PDF, trocando os numeros dos
  // objetos pelo mapa de destino. String sai em hexa de proposito: evita ter
  // que escapar parentese e barra do conteudo original.
  function serializa(v, remapeia) {
    if (v === null || v === undefined) return "null";
    if (v === true) return "true";
    if (v === false) return "false";
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(+v.toFixed(6));
    if (ehRef(v)) return remapeia(v.num) + " 0 R";
    if (ehNome(v)) return "/" + v.__nome.replace(/[^\x21-\x7E]|[#()<>\[\]{}\/%]/g,
      function (c) { return "#" + c.charCodeAt(0).toString(16).padStart(2, "0"); });
    if (v && v.__str) {
      var h = "";
      for (var i = 0; i < v.__str.length; i++) h += v.__str[i].toString(16).padStart(2, "0");
      return "<" + h + ">";
    }
    if (Array.isArray(v)) return "[" + v.map(function (x) { return serializa(x, remapeia); }).join(" ") + "]";
    if (ehDict(v)) {
      var partes = [];
      // a chave passa pelo MESMO escape do nome: chave vinda da origem pode
      // ter acento ou espaco, e sairia quebrando a sintaxe do dicionario
      for (var chave in v.__dict)
        partes.push(serializa(Nome(chave), remapeia) + " " + serializa(v.__dict[chave], remapeia));
      return "<< " + partes.join(" ") + " >>";
    }
    return "null";
  }

  // ------------------------------------------------------- copia de paginas
  // Devolve um pacote com os objetos que compoem as paginas pedidas, ainda com
  // a numeracao ORIGINAL: quem monta o arquivo final (docs/pdf.js) e que
  // atribui os numeros novos, porque so ele sabe quantos objetos ja tem.
  //
  // Duas podas deliberadas no dicionario da pagina:
  //   /Parent  - apontaria para a arvore de paginas da origem e arrastaria
  //              junto TODAS as outras paginas do edital, 123 no pior caso.
  //   /Annots  - anotacoes e campos de formulario, que encadeiam em /AcroForm
  //              e nao acrescentam nada num edital estatico.
  var CHAVES_PAGINA = ["MediaBox", "CropBox", "Rotate", "Resources", "Contents", "Group"];

  async function extraiPaginas(doc, indices) {
    var copiados = {};          // numOriginal -> valor ja copiado
    var ordem = [];
    var idsPaginas = [];

    async function copiaRef(ref) {
      var n = ref.num;
      if (copiados[n] === undefined) {
        copiados[n] = null;                       // marca antes de descer: corta ciclo
        ordem.push(n);
        copiados[n] = await copiaValor(await doc.obj(n));
      }
      return Ref(n, 0);
    }
    async function copiaValor(v) {
      if (ehRef(v)) return await copiaRef(v);
      if (Array.isArray(v)) {
        var saida = [];
        for (var i = 0; i < v.length; i++) saida.push(await copiaValor(v[i]));
        return saida;
      }
      if (v && v.__fluxo) return { __fluxo: true, dict: await copiaValor(v.dict), bruto: v.bruto };
      if (ehDict(v)) {
        var m = {};
        for (var chave in v.__dict) m[chave] = await copiaValor(v.__dict[chave]);
        return Dict(m);
      }
      return v;
    }

    for (var k = 0; k < indices.length; k++) {
      var pg = doc.pagina(indices[k]);
      if (!pg) continue;
      var novo = { Type: Nome("Page") };
      for (var c = 0; c < CHAVES_PAGINA.length; c++) {
        var chave2 = CHAVES_PAGINA[c];
        var valor = pg.dict[chave2] !== undefined ? pg.dict[chave2] : pg.herdado[chave2];
        if (valor !== undefined && valor !== null) novo[chave2] = await copiaValor(valor);
      }
      if (novo.MediaBox === undefined) novo.MediaBox = [0, 0, 595.28, 841.89];
      // numero sintetico, fora da faixa da origem, para nao colidir
      var idFake = "P" + k;
      copiados[idFake] = Dict(novo);
      ordem.push(idFake);
      idsPaginas.push(idFake);
    }

    return {
      objetos: ordem.map(function (n) { return { id: n, valor: copiados[n] }; }),
      paginas: idsPaginas
    };
  }

  raiz.RadarPDFLe = { abre: abre, extraiPaginas: extraiPaginas, serializa: serializa,
                      ehRef: ehRef, ehDict: ehDict, ehNome: ehNome, Nome: Nome, Ref: Ref, Dict: Dict };
  if (typeof module !== "undefined" && module.exports) module.exports = raiz.RadarPDFLe;
})(typeof globalThis !== "undefined" ? globalThis : this);
