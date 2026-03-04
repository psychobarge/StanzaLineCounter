/**
 * Formats a line count into a short badge string (max 2 chars).
 *
 *   0–99     → as-is   ("42")
 *   100–999  → Xc      ("3c" ≈ 300)
 *   1,000–9,999 → Xk   ("1k")
 *   10,000+  → ∞       (infinity symbol)
 */
export function formatBadge(lineCount: number): string {
    if (lineCount < 100) {
        return String(lineCount);
    }
    if (lineCount < 1000) {
        return `${Math.floor(lineCount / 100)}c`;
    }
    if (lineCount < 10000) {
        return `${Math.floor(lineCount / 1000)}k`;
    }
    return "∞";
}

/**
 * Converts a string to bold Unicode mathematical characters.
 * Used to visually emphasize the badge when line count exceeds limit.
 */
export function toBoldUnicode(str: string): string {
    const boldMap: Record<string, string> = {
        "0": "𝟎",
        "1": "𝟏",
        "2": "𝟐",
        "3": "𝟑",
        "4": "𝟒",
        "5": "𝟓",
        "6": "𝟔",
        "7": "𝟕",
        "8": "𝟖",
        "9": "𝟗",
        "c": "𝐜",
        "k": "𝐤",
        "∞": "∞",
    };
    return str
        .split("")
        .map((char) => boldMap[char] || char)
        .join("");
}

/**
 * Counts the number of lines in a buffer.
 */
export function countLines(content: Uint8Array): number {
    if (content.length === 0) {
        return 0;
    }
    let count = 1; // At least one line if file is non-empty
    for (let i = 0; i < content.length; i++) {
        if (content[i] === 0x0a) {
            // newline character
            count++;
        }
    }
    // If the file ends with a newline, don't count the trailing empty "line"
    if (content[content.length - 1] === 0x0a) {
        count--;
    }
    return count;
}
