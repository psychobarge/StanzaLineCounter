import { describe, it, expect } from "vitest";
import { formatBadge, toBoldUnicode, countLines } from "./utils";

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
    });
});
