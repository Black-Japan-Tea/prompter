// Плагин markdown-it-task-lists не поставляет собственные типы.
declare module 'markdown-it-task-lists' {
  import type { PluginSimple } from 'markdown-it';
  const plugin: PluginSimple;
  export default plugin;
}
