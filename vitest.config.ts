import { defineConfig } from 'vitest/config';

// Юнит-тесты логики: окружение node по умолчанию,
// отдельные файлы переключаются на jsdom через docblock.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10_000,
  },
});
