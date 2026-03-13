import { afterAll, describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    formatBadge,
    countLines,
    countLinesStream,
    getPathExtension,
    shouldExcludePath,
    isTooLarge,
    getDecorationSpec,
    getExtensionLimit,
} from "./utils";

describe("utils", () => {
    describe("formatBadge", () => {
        it("should return the number string for counts under 100", () => {
            expect(formatBadge(0)).toBe("0");
            expect(formatBadge(42)).toBe("42");
            expect(formatBadge(99)).toBe("99");
        });

        it("should return Xc format for counts between 100 and 999", () => {
            expect(formatBadge(100)).toBe("1c");
            expect(formatBadge(345)).toBe("3c");
            expect(formatBadge(999)).toBe("9c");
        });

        it("should return Xk format for counts between 1000 and 9999", () => {
            expect(formatBadge(1000)).toBe("1k");
            expect(formatBadge(5678)).toBe("5k");
            expect(formatBadge(9999)).toBe("9k");
        });

        it("should return infinity symbol for counts 10000 and above", () => {
            expect(formatBadge(10000)).toBe("∞");
            expect(formatBadge(123456)).toBe("∞");
        });
    });

    describe("countLines", () => {
        it("should return 0 for empty content", () => {
            const content = new Uint8Array(0);
            expect(countLines(content)).toBe(0);
        });

        it("should return 1 for content without newlines", () => {
            const content = new TextEncoder().encode("hello world");
            expect(countLines(content)).toBe(1);
        });

        it("should count newlines correctly", () => {
            const content = new TextEncoder().encode("line 1\nline 2\nline 3");
            expect(countLines(content)).toBe(3);
        });

        it("should not count trailing newline as a new line", () => {
            const content = new TextEncoder().encode("line 1\nline 2\n");
            expect(countLines(content)).toBe(2);
        });

        it("should handle empty lines in the middle", () => {
            const content = new TextEncoder().encode("line 1\n\nline 3");
            expect(countLines(content)).toBe(3);
        });
        it("should handle CRLF newlines correctly", () => {
            const content = new TextEncoder().encode("line 1\r\nline 2\r\nline 3");
            expect(countLines(content)).toBe(3);
        });
    });

    describe("countLinesStream", () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-line-counter-tests-"));

        afterAll(() => {
            fs.rmSync(tempDir, { recursive: true, force: true });
        });

        function createTempFile(name: string, content: string): string {
            const filePath = path.join(tempDir, name);
            fs.writeFileSync(filePath, content, "utf8");
            return filePath;
        }

        it("should return 0 for an empty file", async () => {
            const filePath = createTempFile("empty.txt", "");
            await expect(countLinesStream(filePath)).resolves.toBe(0);
        });

        it("should return 1 for content without newlines", async () => {
            const filePath = createTempFile("single-line.txt", "hello world");
            await expect(countLinesStream(filePath)).resolves.toBe(1);
        });

        it("should count newline-separated lines correctly", async () => {
            const content = "line 1\nline 2\nline 3";
            const filePath = createTempFile("multi-line.txt", content);
            await expect(countLinesStream(filePath)).resolves.toBe(3);
        });

        it("should not count trailing newline as an extra line", async () => {
            const content = "line 1\nline 2\n";
            const filePath = createTempFile("trailing-newline.txt", content);
            await expect(countLinesStream(filePath)).resolves.toBe(2);
        });

        it("should handle CRLF newlines and empty lines in between", async () => {
            const content = "line 1\r\n\r\nline 3";
            const filePath = createTempFile("crlf-empty-line.txt", content);
            await expect(countLinesStream(filePath)).resolves.toBe(3);
        });

        it("should match countLines for equivalent content", async () => {
            const content = "alpha\nbeta\ngamma\n";
            const filePath = createTempFile("coherence.txt", content);

            const fromStream = await countLinesStream(filePath);
            const fromBuffer = countLines(new TextEncoder().encode(content));

            expect(fromStream).toBe(fromBuffer);
        });

        it("should reject for a non-existent file", async () => {
            const missingPath = path.join(tempDir, "does-not-exist.txt");
            await expect(countLinesStream(missingPath)).rejects.toBeInstanceOf(Error);
        });
    });

    describe("getPathExtension", () => {
        it("should return the extension for files with extension", () => {
            expect(getPathExtension("/project/src/index.ts")).toBe(".ts");
            expect(getPathExtension("/project/assets/logo.png")).toBe(".png");
        });

        it("should return empty string for files without extension", () => {
            expect(getPathExtension("/project/README")).toBe("");
        });

        it("should handle dotfiles like .gitignore", () => {
            expect(getPathExtension("/project/.gitignore")).toBe(".gitignore");
        });
    });

    describe("shouldExcludePath", () => {
        const excludeFolders = ["node_modules", ".git"];
        const excludeExtensions = [".log", ".png"];

        it("should return true if a folder segment matches", () => {
            expect(shouldExcludePath("/project/node_modules/packet/index.js", excludeFolders, excludeExtensions)).toBe(
                true,
            );
            expect(shouldExcludePath("C:\\project\\.git\\config", excludeFolders, excludeExtensions)).toBe(true);
        });

        it("should return true if the extension matches", () => {
            expect(shouldExcludePath("/project/logs/error.log", excludeFolders, excludeExtensions)).toBe(true);
            expect(shouldExcludePath("/project/images/logo.png", excludeFolders, excludeExtensions)).toBe(true);
        });

        it("should match extensions case-insensitively", () => {
            expect(shouldExcludePath("/project/images/PHOTO.PNG", excludeFolders, excludeExtensions)).toBe(true);
            expect(shouldExcludePath("/project/images/photo.png", excludeFolders, [".PNG"])).toBe(true);
        });

        it("should return false if neither folder nor extension matches", () => {
            expect(shouldExcludePath("/project/src/index.ts", excludeFolders, excludeExtensions)).toBe(false);
        });

        it("should return true if a specific file name matches", () => {
            expect(shouldExcludePath("/project/src/secret.txt", ["secret.txt"], [])).toBe(true);
        });

        it("should return true if a relative path matches", () => {
            expect(shouldExcludePath("/project/src/generated/api.ts", ["src/generated/api.ts"], [])).toBe(true);
        });

        it("should work with no extensions or folders to exclude", () => {
            expect(shouldExcludePath("/project/src/index.ts", [], [])).toBe(false);
        });
    });

    describe("isTooLarge", () => {
        it("should return true if size exceeds limit", () => {
            expect(isTooLarge(11 * 1024 * 1024, 10)).toBe(true);
        });

        it("should return false if size is within limit", () => {
            expect(isTooLarge(5 * 1024 * 1024, 10)).toBe(false);
            expect(isTooLarge(10 * 1024 * 1024, 10)).toBe(false);
        });
    });

    describe("getDecorationSpec", () => {
        it("should return non-bold badge and no limit color when count is under limit", () => {
            const spec = getDecorationSpec(150, 300);
            expect(spec.badge).toBe("1c");
            expect(spec.tooltip).toBe("150 lines");
            expect(spec.useLimitColor).toBe(false);
        });

        it("should return non-bold badge and limit color when count exceeds limit", () => {
            const spec = getDecorationSpec(350, 300);
            expect(spec.badge).toBe("3c");
            expect(spec.tooltip).toBe("350 lines");
            expect(spec.useLimitColor).toBe(true);
        });

        it("should handle exact limit as not exceeded", () => {
            const spec = getDecorationSpec(300, 300);
            expect(spec.badge).toBe("3c");
            expect(spec.useLimitColor).toBe(false);
        });

        describe("with useSmileys = true", () => {
            it("should return 😎 when well below limit (< 90%)", () => {
                const spec = getDecorationSpec(260, 300, true);
                expect(spec.badge).toBe("😎");
                expect(spec.useLimitColor).toBe(false);
            });

            it("should return 😬 when near limit (>= 90% and <= 100%)", () => {
                const spec1 = getDecorationSpec(270, 300, true); // exactly 90%
                expect(spec1.badge).toBe("😬");
                expect(spec1.useLimitColor).toBe(false);

                const spec2 = getDecorationSpec(300, 300, true); // exactly 100%
                expect(spec2.badge).toBe("😬");
                expect(spec2.useLimitColor).toBe(false);
            });

            it("should return 😡 when limit is exceeded (> 100%)", () => {
                const spec = getDecorationSpec(301, 300, true);
                expect(spec.badge).toBe("😡");
                expect(spec.useLimitColor).toBe(true);
            });
        });
    });

    describe("getExtensionLimit", () => {
        it("should return extension-specific limit from object format", () => {
            const extensionLimits = { ".ts": 400, ".js": 300 };
            const globalLimit = 250;

            expect(getExtensionLimit(extensionLimits, ".ts", globalLimit)).toBe(400);
            expect(getExtensionLimit(extensionLimits, ".js", globalLimit)).toBe(300);
        });

        it("should return extension-specific limit from array format", () => {
            const extensionLimits = [
                { extension: ".ts", limit: 400 },
                { extension: ".js", limit: 300 },
            ];
            const globalLimit = 250;

            expect(getExtensionLimit(extensionLimits, ".ts", globalLimit)).toBe(400);
            expect(getExtensionLimit(extensionLimits, ".js", globalLimit)).toBe(300);
        });

        it("should return global limit when extension-specific limit doesn't exist (object)", () => {
            const extensionLimits = { ".ts": 400 };
            const globalLimit = 250;

            expect(getExtensionLimit(extensionLimits, ".py", globalLimit)).toBe(250);
        });

        it("should return global limit when extension-specific limit doesn't exist (array)", () => {
            const extensionLimits = [{ extension: ".ts", limit: 400 }];
            const globalLimit = 250;

            expect(getExtensionLimit(extensionLimits, ".py", globalLimit)).toBe(250);
        });

        it("should return global limit when extension is empty", () => {
            const extensionLimits = { ".ts": 400 };
            const globalLimit = 250;

            expect(getExtensionLimit(extensionLimits, "", globalLimit)).toBe(250);
        });

        it("should be case-insensitive for extension matching (object)", () => {
            const extensionLimits = { ".ts": 400, ".JS": 350 };
            const globalLimit = 250;

            expect(getExtensionLimit(extensionLimits, ".ts", globalLimit)).toBe(400);
            expect(getExtensionLimit(extensionLimits, ".TS", globalLimit)).toBe(400);
            expect(getExtensionLimit(extensionLimits, ".js", globalLimit)).toBe(350);
            expect(getExtensionLimit(extensionLimits, ".Js", globalLimit)).toBe(350);
        });

        it("should be case-insensitive for extension matching (array)", () => {
            const extensionLimits = [
                { extension: ".ts", limit: 400 },
                { extension: ".JS", limit: 350 },
            ];
            const globalLimit = 250;

            expect(getExtensionLimit(extensionLimits, ".ts", globalLimit)).toBe(400);
            expect(getExtensionLimit(extensionLimits, ".TS", globalLimit)).toBe(400);
            expect(getExtensionLimit(extensionLimits, ".js", globalLimit)).toBe(350);
            expect(getExtensionLimit(extensionLimits, ".Js", globalLimit)).toBe(350);
        });

        it("should handle empty extension limits", () => {
            expect(getExtensionLimit({}, ".ts", 300)).toBe(300);
            expect(getExtensionLimit([], ".ts", 300)).toBe(300);
            expect(getExtensionLimit(null, ".ts", 300)).toBe(300);
            expect(getExtensionLimit(undefined, ".ts", 300)).toBe(300);
        });
    });
});
