// Os usuarios da tela de entrada do site: so eles entram, cada um com o seu
// usuario e a sua senha, e o site diz "Ola, <nome>" (pedido do usuario em
// 08/10/2026).
//
// A pagina guarda, de cada usuario, so CODIGOS (SHA-256): o do usuario, para
// este comando achar quem trocar ou tirar, e o do par usuario + senha, que e o
// que a tela confere. Nem o usuario nem a senha ficam escritos no site; o nome
// do "Ola" fica. O usuario nao diferencia maiusculas; a senha diferencia.
//
// Uso (e depois o commit do docs/index.html):
//   node usuarios-site.mjs adicionar USUARIO "senha" "Nome"   (inclui ou troca a senha/nome)
//   node usuarios-site.mjs remover USUARIO
//   node usuarios-site.mjs listar
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ARQ = path.join(path.dirname(fileURLToPath(import.meta.url)), 'docs', 'index.html');
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
// os mesmos calculos da pagina (codigoDoUsuario e codigoDoAcesso no docs/index.html)
export const codigoDoUsuario = u => sha('radar-digiplus:u:' + String(u).trim().toUpperCase());
export const codigoDoAcesso = (u, senha) => sha('radar-digiplus:' + String(u).trim().toUpperCase() + ':' + senha);

const RE = /var USUARIOS = (\[[\s\S]*?\]);/;
function le() {
  const html = fs.readFileSync(ARQ, 'utf8');
  const m = RE.exec(html);
  if (!m) { console.error('nao achei o "var USUARIOS = [...]" no docs/index.html'); process.exit(1); }
  return { html, lista: JSON.parse(m[1]) };
}
function grava(html, lista) {
  const txt = '[\n' + lista.map(x => '  ' + JSON.stringify(x)).join(',\n') + '\n]';
  fs.writeFileSync(ARQ, html.replace(RE, () => 'var USUARIOS = ' + txt + ';'), 'utf8');
}

const [acao, usuario, senha, ...resto] = process.argv.slice(2);
const nome = resto.join(' ').trim();
if (acao === 'adicionar' && usuario && senha && nome) {
  const { html, lista } = le();
  const u = codigoDoUsuario(usuario);
  const novo = { u, h: codigoDoAcesso(usuario, senha), nome };
  const i = lista.findIndex(x => x.u === u);
  if (i >= 0) lista[i] = novo; else lista.push(novo);
  grava(html, lista);
  console.log(`${i >= 0 ? 'atualizado' : 'incluido'}: ${nome} · ${lista.length} usuario(s) no site`);
} else if (acao === 'remover' && usuario) {
  const { html, lista } = le();
  const u = codigoDoUsuario(usuario);
  const fica = lista.filter(x => x.u !== u);
  if (fica.length === lista.length) { console.error('esse usuario nao esta no site'); process.exit(1); }
  grava(html, fica);
  console.log(`removido · ${fica.length} usuario(s) no site`);
} else if (acao === 'listar') {
  const { lista } = le();
  console.log(lista.length + ' usuario(s): ' + lista.map(x => x.nome).join(', '));
} else {
  console.log('uso:\n  node usuarios-site.mjs adicionar USUARIO "senha" "Nome"\n  node usuarios-site.mjs remover USUARIO\n  node usuarios-site.mjs listar');
  process.exit(1);
}
