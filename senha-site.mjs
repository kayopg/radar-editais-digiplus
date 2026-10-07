// Troca a senha da equipe da tela de entrada do site.
//
// A pagina guarda so o CODIGO da senha (SHA-256 de "radar-digiplus:" + senha),
// nunca a senha. Quem ja tinha entrado com a senha antiga volta a ver a tela.
//
// Uso: node senha-site.mjs "nova senha"     (e depois o commit do docs/index.html)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const senha = process.argv[2];
if (!senha) { console.error('uso: node senha-site.mjs "nova senha"'); process.exit(1); }
const arq = path.join(path.dirname(fileURLToPath(import.meta.url)), 'docs', 'index.html');
const codigo = crypto.createHash('sha256').update('radar-digiplus:' + senha, 'utf8').digest('hex');
const html = fs.readFileSync(arq, 'utf8');
const re = /var SENHA_CODIGO = "[^"]*";/;
if (!re.test(html)) { console.error('nao achei o SENHA_CODIGO no docs/index.html'); process.exit(1); }
fs.writeFileSync(arq, html.replace(re, `var SENHA_CODIGO = "${codigo}";`), 'utf8');
console.log('senha trocada no docs/index.html (codigo ' + codigo.slice(0, 8) + '...)');
