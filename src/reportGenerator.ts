import * as vscode from "vscode";
import {
    countLines,
    countLinesStream,
    shouldExcludePath,
    isTooLarge,
    getPathExtension,
    getExtensionLimit,
} from "./utils";

interface ReportFileStat {
    fsPath: string;
    lineCount: number;
    limit: number;
}

export async function generateReport(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No workspace folder is open to generate a report.");
        return;
    }

    const config = vscode.workspace.getConfiguration("lineCounter");
    const extensionLimits: unknown = config.get("extensionLimits", {});
    const globalLimit: number = config.get("limit", 300);
    const maxFileSizeMB: number = config.get("maxFileSizeMB", 10);
    const excludeExtensions: string[] = config.get("excludeExtensions", []);
    const excludeFolders: string[] = config.get("excludeFolders", [
        "node_modules",
        ".git",
        "vendor",
        "dist",
        "out",
        "target",
        "bin",
        ".venv",
        "venv",
        "env",
        ".env",
    ]);

    const okFiles: ReportFileStat[] = [];
    const almostKoFiles: ReportFileStat[] = [];
    const koFiles: ReportFileStat[] = [];

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: "Stanza: Generating Line Count Report...",
            cancellable: true,
        },
        async (progress, token) => {
            try {
                const excludePattern = "**/{node_modules,.git,out,dist,build,vendor}/**";
                const files = await vscode.workspace.findFiles("**/*", excludePattern);

                const chunkSize = 50;
                for (let i = 0; i < files.length; i += chunkSize) {
                    if (token.isCancellationRequested) {
                        return;
                    }

                    const chunk = files.slice(i, i + chunkSize);

                    await Promise.all(
                        chunk.map(async (uri) => {
                            if (shouldExcludePath(uri.fsPath, excludeFolders, excludeExtensions)) {
                                return;
                            }

                            try {
                                const stat = await vscode.workspace.fs.stat(uri);
                                if (isTooLarge(stat.size, maxFileSizeMB)) {
                                    return;
                                }

                                let lineCount: number;
                                if (uri.scheme === "file") {
                                    lineCount = await countLinesStream(uri.fsPath);
                                } else {
                                    const content = await vscode.workspace.fs.readFile(uri);
                                    lineCount = countLines(content);
                                }

                                const fileExtension = getPathExtension(uri.fsPath);
                                const fileLimit = getExtensionLimit(extensionLimits, fileExtension, globalLimit);

                                const relativePath = vscode.workspace.asRelativePath(uri, false);
                                const fileStat: ReportFileStat = {
                                    fsPath: relativePath,
                                    lineCount,
                                    limit: fileLimit,
                                };

                                if (lineCount > fileLimit) {
                                    koFiles.push(fileStat);
                                } else if (lineCount >= fileLimit * 0.9) {
                                    almostKoFiles.push(fileStat);
                                } else {
                                    okFiles.push(fileStat);
                                }
                            } catch {
                                // Ignore read errors
                            }
                        }),
                    );
                }
            } catch (error) {
                console.error("StanzaLineCounter: Error during report generation", error);
                vscode.window.showErrorMessage("Failed to generate Stanza report.");
            }
        },
    );

    // Sort files by line count descending
    koFiles.sort((a, b) => b.lineCount - a.lineCount);
    almostKoFiles.sort((a, b) => b.lineCount - a.lineCount);

    // Format Date: YYYY_MM_DD_HH_mm_ss
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const dateStr = `${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}_${pad(now.getHours())}_${pad(now.getMinutes())}_${pad(now.getSeconds())}`;
    const displayDateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    // Generate Markdown Content
    let markdown = `# Stanza Line Count Report\n`;
    markdown += `_Generated on: ${displayDateStr}_\n\n`;

    markdown += `## Summary\n`;
    markdown += `- **✅ OK Files**: ${okFiles.length} (Under 90% of limit)\n`;
    markdown += `- **⚠️ Almost KO Files**: ${almostKoFiles.length} (Between 90% and 100% of limit)\n`;
    markdown += `- **❌ KO Files**: ${koFiles.length} (Exceeding limit)\n\n`;
    markdown += `---\n\n`;

    markdown += `## ❌ KO Files (Exceeded Limit)\n`;
    if (koFiles.length > 0) {
        markdown += `| File | Lines | Limit | \n`;
        markdown += `|---|---|---|\n`;
        for (const file of koFiles) {
            markdown += `| \`${file.fsPath}\` | **${file.lineCount}** | ${file.limit} |\n`;
        }
    } else {
        markdown += `_No files exceeding the limit! 🎉_\n`;
    }
    markdown += `\n---\n\n`;

    markdown += `## ⚠️ Almost KO Files (Near Limit - >= 90%)\n`;
    if (almostKoFiles.length > 0) {
        markdown += `| File | Lines | Limit |\n`;
        markdown += `|---|---|---|\n`;
        for (const file of almostKoFiles) {
            markdown += `| \`${file.fsPath}\` | **${file.lineCount}** | ${file.limit} |\n`;
        }
    } else {
        markdown += `_No files near the limit. 👍_\n`;
    }

    // Write to root of workspace
    const rootPath = workspaceFolders[0].uri;
    const reportUri = vscode.Uri.joinPath(rootPath, `stanza_report_${dateStr}.md`);

    try {
        await vscode.workspace.fs.writeFile(reportUri, Buffer.from(markdown, "utf8"));

        // Open the generated report
        const document = await vscode.workspace.openTextDocument(reportUri);
        await vscode.window.showTextDocument(document);
    } catch (error) {
        console.error("Failed to write report file:", error);
        vscode.window.showErrorMessage("Failed to save the Stanza report.");
    }
}
