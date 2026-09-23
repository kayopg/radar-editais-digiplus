// Converte para PDF o documento que nao veio em PDF: .doc, .docx, .odt, .rtf e
// .html publicados como edital.
//
// Quem pagina um documento de texto e o editor, entao nao ha "pagina" para ler
// nem folha de abertura para recortar enquanto ele nao virar PDF. Aqui ele e
// paginado de verdade: LibreOffice quando existe, senao o Word pelo COM do
// Windows (a maquina de quem monta o artefato tem o Word; o robo do GitHub nao
// tem nenhum dos dois, e ali o edital segue no formato original).
//
// Saida: Uint8Array com o PDF, ou null quando nao ha conversor ou a conversao
// falha.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// O Word abre todos estes pelo mesmo caminho; a extensao so diz a ele qual
// filtro usar.
export const CONVERSIVEIS = new Set(['doc', 'docx', 'odt', 'rtf', 'html', 'htm', 'txt']);

const SOFFICE = ['soffice', 'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
                 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'];

export function pdfDeDocumento(bytes, ext) {
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  if (!CONVERSIVEIS.has(e)) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc2pdf-'));
  const ent = path.join(dir, 'documento.' + e), sai = path.join(dir, 'documento.pdf');
  fs.writeFileSync(ent, Buffer.from(bytes));
  try {
    for (const soffice of SOFFICE) {
      spawnSync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', dir, ent], { stdio: 'ignore', timeout: 180000 });
      if (fs.existsSync(sai)) return new Uint8Array(fs.readFileSync(sai));
    }
    if (process.platform === 'win32') {
      // Documents.Open(arquivo, ConfirmConversions=false, ReadOnly=true);
      // 17 = wdExportFormatPDF. O documento protegido por senha trava o Word
      // esperando a senha: PasswordDocument='' faz ele desistir e cair no catch.
      const ps = `$w = New-Object -ComObject Word.Application; $w.Visible = $false; $w.DisplayAlerts = 0; `
        + `try { $d = $w.Documents.Open('${ent}', $false, $true, $false, '') ; $d.ExportAsFixedFormat('${sai}', 17); $d.Close($false) } finally { $w.Quit() }`;
      spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', timeout: 300000 });
      if (fs.existsSync(sai)) return new Uint8Array(fs.readFileSync(sai));
    }
    return null;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
