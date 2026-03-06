import tseslint from 'typescript-eslint';
import js from '@eslint/js';

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            parserOptions: {
                project: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            "@typescript-eslint/no-unused-vars": "warn",
            "no-unused-vars": "off",
            "semi": ["warn", "always"],
            "curly": "warn",
            "eqeqeq": "warn",
        },
    },
    {
        ignores: [
            "out/**",
            "dist/**",
            "**/*.d.ts",
            "node_modules/**"
        ]
    }
);
