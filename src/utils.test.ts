import { describe, it, expect } from "vitest";
import {
    formatBadge,
    toBoldUnicode,
    countLines,
    shouldExcludePath,
    isTooLarge,
    getDecorationSpec,
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

    describe("toBoldUnicode", () => {
        it("should convert digits to bold mathematical characters", () => {
            expect(toBoldUnicode("0123456789")).toBe("𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗");
        });

        it("should convert special characters 'c', 'k', and '∞'", () => {
            expect(toBoldUnicode("ck∞")).toBe("𝐜𝐤∞");
        });

        it("should leave other characters unchanged", () => {
            expect(toBoldUnicode("abxz!")).toBe("abxz!");
        });

        it("should handle combinations", () => {
            expect(toBoldUnicode("42c")).toBe("𝟒𝟐𝐜");
            expect(toBoldUnicode("1k")).toBe("𝟏𝐤");
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

    describe("shouldExcludePath", () => {
        const excludeFolders = ["node_modules", ".git"];
        const excludeExtensions = [".log", ".png"];

        it("should return true if a folder segment matches", () => {
            expect(
                shouldExcludePath(
                    "/project/node_modules/packet/index.js",
                    excludeFolders,
                    excludeExtensions
                )
            ).toBe(true);
            expect(
                shouldExcludePath(
                    "C:\\project\\.git\\config",
                    excludeFolders,
                    excludeExtensions
                )
            ).toBe(true);
        });

        it("should return true if the extension matches", () => {
            expect(
                shouldExcludePath(
                    "/project/logs/error.log",
                    excludeFolders,
                    excludeExtensions
                )
            ).toBe(true);
            expect(
                shouldExcludePath(
                    "/project/images/logo.png",
                    excludeFolders,
                    excludeExtensions
                )
            ).toBe(true);
        });

        it("should return false if neither folder nor extension matches", () => {
            expect(
                shouldExcludePath(
                    "/project/src/index.ts",
                    excludeFolders,
                    excludeExtensions
                )
            ).toBe(false);
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

        it("should return bold badge and limit color when count exceeds limit", () => {
            const spec = getDecorationSpec(350, 300);
            expect(spec.badge).toBe("𝟑𝐜");
            expect(spec.tooltip).toBe("350 lines");
            expect(spec.useLimitColor).toBe(true);
        });

        it("should handle exact limit as not exceeded", () => {
            const spec = getDecorationSpec(300, 300);
            expect(spec.badge).toBe("3c");
            expect(spec.useLimitColor).toBe(false);
        });
    });
});
