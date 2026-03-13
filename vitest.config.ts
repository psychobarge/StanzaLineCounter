import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        exclude: ["**/node_modules/**", "**/out/**", "**/.{idea,git,cache,output,temp}/**"],
        coverage: {
            thresholds: {
                lines: 60,
                functions: 60,
                branches: 50,
                statements: 60,
            },
        },
    },
});
