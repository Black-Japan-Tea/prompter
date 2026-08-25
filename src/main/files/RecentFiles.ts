/** Список недавно открытых файлов для меню трея: свежие сверху, дублей нет. */
export class RecentFiles {
  private entries: string[] = [];

  constructor(private readonly maxEntries: number = 10) {}

  list(): readonly string[] {
    return this.entries;
  }

  add(filePath: string): void {
    this.entries = [filePath, ...this.entries.filter((path) => path !== filePath)]
      .slice(0, this.maxEntries);
  }

  remove(filePath: string): void {
    this.entries = this.entries.filter((path) => path !== filePath);
  }
}
