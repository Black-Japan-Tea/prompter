import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { IPC, PrompterApi } from '../shared/contracts';

function subscribe<T>(
  channel: string,
  handler: (payload: T) => void,
): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: PrompterApi = {
  onFileOpened: (handler) => subscribe(IPC.fileOpened, handler),
  onFileChanged: (handler) => subscribe(IPC.fileChanged, handler),
  onFileRemoved: (handler) => {
    const listener = (): void => handler();
    ipcRenderer.on(IPC.fileRemoved, listener);
    return () => ipcRenderer.removeListener(IPC.fileRemoved, listener);
  },
  onStateChanged: (handler) => subscribe(IPC.stateChanged, handler),
  openFile: (path) => ipcRenderer.send(IPC.openFileRequest, path),
  setFontSize: (size) => ipcRenderer.send(IPC.fontSizeRequest, size),
  hideWindow: () => ipcRenderer.send(IPC.hideWindowRequest),
  quit: () => ipcRenderer.send(IPC.quitRequest),
  filePathFor: (file) => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld('prompter', api);
