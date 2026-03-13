import * as fs from "fs";

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
 * Counts the number of lines in a file using a read stream.
 * This prevents loading the entire file into memory at once.
 */
export function countLinesStream(fsPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        let count = 1; // At least one line if file is non-empty
        const stream = fs.createReadStream(fsPath);
        let lastCharWasNewline = false;
        let fileIsEmpty = true;

        stream.on("data", (chunk: Buffer | string) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            if (buffer.length > 0) {
                fileIsEmpty = false;
            }
            for (let i = 0; i < buffer.length; i++) {
                if (buffer[i] === 0x0a) {
                    count++;
                }
            }
            if (buffer.length > 0) {
                lastCharWasNewline = buffer[buffer.length - 1] === 0x0a;
            }
        });

        stream.on("end", () => {
            if (fileIsEmpty) {
                resolve(0);
                return;
            }
            // If the file ends with a newline, don't count the trailing empty "line"
            if (lastCharWasNewline) {
                count--;
            }
            resolve(count);
        });

        stream.on("error", (err) => {
            reject(err);
        });
    });
}

/**
 * Extracts the extension used by lineCounter.excludeExtensions.
 */
export function getPathExtension(fsPath: string): string {
    const lastDot = fsPath.lastIndexOf(".");
    if (lastDot === -1) {
        return "";
    }
    // Handle cases where the dot might be in a directory name (though less common in this context)
    const lastSep = Math.max(fsPath.lastIndexOf("/"), fsPath.lastIndexOf("\\"));
    if (lastSep > lastDot) {
        return "";
    }
    return fsPath.substring(lastDot);
}

/**
 * Robustly retrieves the extension limit from configuration, supporting both object and array formats.
 * Case-insensitive for extension matching.
 */
export function getExtensionLimit(
    extensionLimits: unknown,
    fileExtension: string,
    globalLimit: number
): number {
    if (!fileExtension) {
        return globalLimit;
    }

    const lowerExt = fileExtension.toLowerCase();

    // Handle Array format: [{"extension": ".ts", "limit": 400}]
    if (Array.isArray(extensionLimits)) {
        for (const entry of extensionLimits) {
            if (
                entry &&
                typeof entry === "object" &&
                typeof entry.extension === "string" &&
                entry.extension.toLowerCase() === lowerExt &&
                typeof entry.limit === "number"
            ) {
                return entry.limit;
            }
        }
    }
    // Handle Object format: {".ts": 400}
    else if (extensionLimits && typeof extensionLimits === "object") {
        for (const [ext, limit] of Object.entries(extensionLimits as Record<string, unknown>)) {
            if (ext.toLowerCase() === lowerExt && typeof limit === "number") {
                return limit;
            }
        }
    }

    return globalLimit;
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
    const normalizedPathLower = normalizedPath.toLowerCase();

    // Check if any segment matches (folder names) or if the whole path ends with an excluded path (relative files).
    // Use case-insensitive comparison so that blacklisted folders match regardless of OS/filesystem casing.
    if (
        excludeFolders.some((exclude) => {
            const normalizedExclude = exclude.replace(/\\/g, "/");
            const normalizedExcludeLower = normalizedExclude.toLowerCase();
            // If it's a simple name, check segments (case-insensitive)
            if (!normalizedExclude.includes("/")) {
                return segments.some((seg) => seg.toLowerCase() === normalizedExcludeLower);
            }
            // If it's a relative path, check if path is inside or equals that folder (case-insensitive)
            const segmentWithSlash = "/" + normalizedExcludeLower + "/";
            return normalizedPathLower.includes(segmentWithSlash) || normalizedPathLower.endsWith("/" + normalizedExcludeLower);
        })
    ) {
        return true;
    }

    // Check excluded extensions (case-insensitive)
    const ext = getPathExtension(fsPath).toLowerCase();
    if (
        ext &&
        excludeExtensions.some(
            (excludeExtension) => excludeExtension.toLowerCase() === ext
        )
    ) {
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
        badge: baseBadge,
        tooltip,
        useLimitColor: isExceeded,
    };
}
