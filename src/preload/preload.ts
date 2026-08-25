import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import {
  IPC,
  PrompterApi,
  AppCommand,
  NotifyPayload,
  FilePayload,
  ContentPayload,
  BroadcastState,
} from '../shared/contracts';

function subscribe<T>(
  channel: string,
  handler: (payload: T) => void,
): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: PrompterApi = {
  onFileOpened: (handler: (payload: FilePayload) => void) =>
    subscribe(IPC.fileOpened, handler),
  onFileChanged: (handler: (payload: ContentPayload) => void) =>
    subscribe(IPC.fileChanged, handler),
  onFileRemoved: (handler: () => void) => {
    const listener = (): void => handler();
    ipcRenderer.on(IPC.fileRemoved, listener);
    return () => ipcRenderer.removeListener(IPC.fileRemoved, listener);
  },
  onStateChanged: (handler: (state: BroadcastState) => void) =>
    subscribe(IPC.stateChanged, handler),
  onNotify: (handler: (payload: NotifyPayload) => void) =>
    subscribe<NotifyPayload>(IPC.notify, handler),
  openFile: (path: string) => ipcRenderer.send(IPC.openFileRequest, path),
  setFontSize: (size: number) => ipcRenderer.send(IPC.fontSizeRequest, size),
  runCommand: (command: AppCommand) => ipcRenderer.send(IPC.command, command),
  hideWindow: () => ipcRenderer.send(IPC.hideWindowRequest),
  quit: () => ipcRenderer.send(IPC.quitRequest),
  requestState: () => ipcRenderer.send(IPC.requestState),
  filePathFor: (file: File) => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld('prompter', api);
