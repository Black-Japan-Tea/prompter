import type { PrompterApi } from '../shared/contracts';

declare global {
  interface Window {
    prompter: PrompterApi;
  }
}

export {};
