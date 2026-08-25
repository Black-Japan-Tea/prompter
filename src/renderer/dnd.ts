/** Drag&drop .md-файлов прямо в окно суфлёра. */
export function initDragAndDrop(
  doc: Document,
  onFile: (path: string) => void,
): void {
  const clearHighlight = (): void => doc.body.classList.remove('drag-over');

  doc.addEventListener('dragover', (event) => {
    event.preventDefault();
    doc.body.classList.add('drag-over');
  });
  doc.addEventListener('dragleave', clearHighlight);
  doc.addEventListener('drop', (event) => {
    event.preventDefault();
    clearHighlight();
    const file = event.dataTransfer?.files[0];
    if (file === undefined) {
      return;
    }
    const path = window.prompter.filePathFor(file);
    if (path !== '') {
      onFile(path);
    }
  });
}
