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
/**
 * Checks if a file path should be excluded based on folder names or extensions.
 */
export function shouldExcludePath(
    fsPath: string,
    excludeFolders: string[],
    excludeExtensions: string[]
): boolean {
    const normalizedPath = fsPath.replace(/\\/g, "/");
    const segments = normalizedPath.split("/");

    // Check if any segment matches (folder names) or if the whole path ends with an excluded path (relative files)
    if (
        excludeFolders.some((exclude) => {
            const normalizedExclude = exclude.replace(/\\/g, "/");
            // If it's a simple name, check segments
            if (!normalizedExclude.includes("/")) {
                return segments.includes(normalizedExclude);
            }
            // If it's a relative path, check if normalizedPath ends with it
            return normalizedPath.endsWith(normalizedExclude);
        })
    ) {
        return true;
    }

    // Check excluded extensions
    const ext = fsPath.includes(".")
        ? fsPath.substring(fsPath.lastIndexOf("."))
        : "";
    if (ext && excludeExtensions.includes(ext)) {
        return true;
    }

    return false;
}

/**
 * Checks if a file size exceeds the maximum allowed size in MB.
 */
export function isTooLarge(sizeInBytes: number, maxFileSizeMB: number): boolean {
    return sizeInBytes > maxFileSizeMB * 1024 * 1024;
}

export interface DecorationSpec {
    badge: string;
    tooltip: string;
    useLimitColor: boolean;
}

/**
 * Determines the decoration specification based on line count and limit.
 */
export function getDecorationSpec(
    lineCount: number,
    limit: number,
    useSmileys: boolean = false
): DecorationSpec {
    const isExceeded = lineCount > limit;
    const isNearLimit = lineCount >= limit * 0.9;

    if (useSmileys) {
        let badge = "😎"; // Well below limit
        if (isExceeded) {
            badge = "😡"; // Exceeded
        } else if (isNearLimit) {
            badge = "😬"; // Near limit (90%+)
        }
        return {
            badge,
            tooltip: `${lineCount} lines`,
            useLimitColor: isExceeded,
        };
    }

    const baseBadge = formatBadge(lineCount);
    const tooltip = `${lineCount} lines`;

    return {
        badge: isExceeded ? toBoldUnicode(baseBadge) : baseBadge,
        tooltip,
        useLimitColor: isExceeded,
    };
}
