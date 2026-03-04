import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        exclude: ['**/node_modules/**', '**/out/**', '**/.{idea,git,cache,output,temp}/**'],
    },
});
