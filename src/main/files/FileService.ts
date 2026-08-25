import { dialog } from 'electron';
import { existsSync, readFileSync, statSync } from 'node:fs';

const FILE_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
];

/** Чтение md-файлов: диалог выбора и само чтение с валидацией пути. */
export class FileService {
  /** Открывает системный диалог; null — пользователь отменил выбор. */
  async pickFile(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: 'Открыть конспект',
      filters: FILE_FILTERS,
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  }

  /** Читает файл; null — файл недоступен (удалён, занят, это папка). */
  read(path: string): string | null {
    try {
      if (!existsSync(path) || !statSync(path).isFile()) {
        return null;
      }
      return readFileSync(path, 'utf8');
    } catch (error) {
      console.error(`Не удалось прочитать файл ${path}:`, error);
      return null;
    }
  }
}
