import * as vscode from "vscode";
import * as path from "path";
import { formatBadge, toBoldUnicode, countLines } from "./utils";

interface CacheEntry {
    lineCount: number;
    mtimeMs: number;
}

export class LineCountDecorationProvider
    implements vscode.FileDecorationProvider {
    private readonly _onDidChangeFileDecorations =
        new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    /** Cache: fsPath → { lineCount, mtimeMs } */
    private readonly cache = new Map<string, CacheEntry>();

    // ─── Public API ─────────────────────────────────────────────

    async provideFileDecoration(
        uri: vscode.Uri,
        _token: vscode.CancellationToken
    ): Promise<vscode.FileDecoration | undefined> {
        // Only handle file:// scheme
        if (uri.scheme !== "file") {
            return undefined;
        }

        // Skip directories (quick heuristic: no extension → likely a directory)
        // The actual stat check below will also catch directories.
        const ext = path.extname(uri.fsPath);

        // Read user settings
        const config = vscode.workspace.getConfiguration("lineCounter");
        const excludeExtensions: string[] = config.get("excludeExtensions", [
            ".log",
            ".min.js",
            ".map",
            // Images
            ".png",
            ".jpg",
            ".jpeg",
            ".gif",
            ".webp",
            ".svg",
            ".ico",
            ".bmp",
            ".tiff",
            ".tif",
            ".avif",
            ".heic",
            // Fonts
            ".woff",
            ".woff2",
            ".ttf",
            ".otf",
            ".eot",
            // Media / Archives / Binaries
            ".pdf",
            ".zip",
            ".gz",
            ".tar",
            ".rar",
            ".7z",
            ".mp3",
            ".mp4",
            ".webm",
            ".wav",
            ".ogg",
            ".bin",
        ]);
        const limit: number = config.get("limit", 300);

        // Check excluded extensions
        if (ext && excludeExtensions.includes(ext)) {
            return undefined;
        }

        // Stat the file to determine if it's a file and get mtime
        let stat: vscode.FileStat;
        try {
            stat = await vscode.workspace.fs.stat(uri);
        } catch {
            return undefined;
        }

        // Skip directories and other non-file entries
        if (stat.type !== vscode.FileType.File) {
            return undefined;
        }

        // Check cache
        const cached = this.cache.get(uri.fsPath);
        if (cached && cached.mtimeMs === stat.mtime) {
            return this.buildDecoration(cached.lineCount, limit);
        }

        // Read file and count lines
        let lineCount: number;
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            lineCount = countLines(content);
        } catch {
            return undefined;
        }

        // Update cache
        this.cache.set(uri.fsPath, { lineCount, mtimeMs: stat.mtime });

        return this.buildDecoration(lineCount, limit);
    }

    /** Refresh decoration for a specific URI (e.g. after file save). */
    refreshUri(uri: vscode.Uri): void {
        // Invalidate cache for this file so provideFileDecoration re-reads it
        this.cache.delete(uri.fsPath);
        this._onDidChangeFileDecorations.fire(uri);
    }

    /** Refresh all decorations (e.g. after config change). */
    refreshAll(): void {
        this.cache.clear();
        this._onDidChangeFileDecorations.fire(undefined);
    }

    dispose(): void {
        this._onDidChangeFileDecorations.dispose();
    }

    // ─── Internals ──────────────────────────────────────────────

    private buildDecoration(
        lineCount: number,
        limit: number
    ): vscode.FileDecoration {
        const baseBadge = formatBadge(lineCount);
        const tooltip = `${lineCount} lines`;

        if (lineCount > limit) {
            // Blue color for the entire row + bold badge
            const boldBadge = toBoldUnicode(baseBadge);
            const color = new vscode.ThemeColor("editorInfo.foreground");
            return new vscode.FileDecoration(boldBadge, tooltip, color);
        }

        return new vscode.FileDecoration(baseBadge, tooltip, undefined);
    }
}

