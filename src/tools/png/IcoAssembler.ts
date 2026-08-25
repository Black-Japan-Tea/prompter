/** Один образ внутри ICO: PNG-данные и логический размер. */
export interface IcoEntry {
  size: number;
  png: Buffer;
}

/**
 * Собирает Windows-ICO из PNG-образов (формат PNG-in-ICO, поддерживается
 * начиная с Vista). Размер 256 кодируется нулём по соглашению формата.
 */
export function assembleIco(entries: IcoEntry[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // зарезервировано
  header.writeUInt16LE(1, 2); // тип: иконка
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(entries.length * 16);
  const blobs: Buffer[] = [];
  let offset = 6 + entries.length * 16;

  entries.forEach((entry, index) => {
    const base = index * 16;
    directory[base] = entry.size >= 256 ? 0 : entry.size;
    directory[base + 1] = entry.size >= 256 ? 0 : entry.size;
    directory[base + 2] = 0; // палитра не используется
    directory[base + 3] = 0; // зарезервировано
    directory.writeUInt16LE(1, base + 4); // planes
    directory.writeUInt16LE(32, base + 6); // бит на пиксель
    directory.writeUInt32LE(entry.png.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    blobs.push(entry.png);
    offset += entry.png.length;
  });

  return Buffer.concat([header, directory, ...blobs]);
}
