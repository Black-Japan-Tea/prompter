// Работает и в main, и в renderer (браузерный бандл): без node:path.

const MARKDOWN_EXT = /\.(md|markdown)$/i;
/** Диск Windows ('C:\…') — единственный допустимый «двоеточийный» вид ссылки. */
const WINDOWS_ABSOLUTE = /^[a-zA-Z]:[\\/].*/;
const PROTOCOL = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/** Каталог файла: 'C:\docs\notes\a.md' → 'C:\docs\notes'. */
function parentDir(file: string): string {
  const idx = Math.max(file.lastIndexOf('\\'), file.lastIndexOf('/'));
  return idx > 0 ? file.slice(0, idx) : '';
}

/** Схлопывает повторные слэши и сегменты '.'/'..' — как path.normalize для Win. */
function normalizeWinPath(input: string): string {
  const parts = input.split(/[\\/]+/).filter((part) => part.length > 0 && part !== '.');
  let root = '';
  if (input.startsWith('\\\\') && parts.length > 0) {
    root = `\\\\${parts.shift() as string}\\`;
  } else if (parts.length > 0 && /^[a-zA-Z]:$/.test(parts[0])) {
    root = `${parts.shift() as string}\\`;
  }
  const segments: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      if (segments.length > 0 && segments[segments.length - 1] !== '..') {
        segments.pop();
      } else if (root === '') {
        segments.push('..');
      }
    } else {
      segments.push(part);
    }
  }
  return root + segments.join('\\');
}

/**
 * Превращает href markdown-ссылки в абсолютный путь к .md/.markdown-файлу
 * (открыть системным приложением). Всё прочее — null: внешние протоколы
 * и не-markdown обрабатывает обычная навигация.
 */
export function resolveMarkdownLink(href: string, currentFile: string | null): string | null {
  const trimmed = href.trim();
  if (trimmed.length === 0 || trimmed.startsWith('#')) {
    return null;
  }
  if (WINDOWS_ABSOLUTE.test(trimmed)) {
    return MARKDOWN_EXT.test(trimmed) ? normalizeWinPath(trimmed) : null;
  }
  if (PROTOCOL.test(trimmed)) {
    return null;
  }
  if (!MARKDOWN_EXT.test(trimmed)) {
    return null;
  }
  if (currentFile === null || currentFile.length === 0) {
    return null;
  }
  const unified = trimmed.replace(/\//g, '\\');
  const dir = parentDir(currentFile);
  return dir === ''
    ? normalizeWinPath(unified)
    : normalizeWinPath(`${dir}\\${unified}`);
}
