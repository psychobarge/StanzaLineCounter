import * as path from "path";
import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { LineCountDecorationProvider } from "./lineCountDecorationProvider";

export function activate(context: vscode.ExtensionContext): void {
    const provider = new LineCountDecorationProvider();
    const contextKeyExcludeExtensions = "lineCounter.excludeExtensionsContext";
    const contextKeyExcludeFolderNames = "lineCounter.excludeFolderNamesContext";
    const contextKeyExcludeFolderPaths = "lineCounter.excludeFolderPathsContext";

    async function updateIgnoreMenuContexts(): Promise<void> {
        const config = vscode.workspace.getConfiguration("lineCounter");
        const excludeExtensions: string[] = config.get("excludeExtensions", []);
        const excludeFolders: string[] = config.get("excludeFolders", []);

        const extensionContextMap: Record<string, true> = {};
        for (const extension of excludeExtensions) {
            extensionContextMap[extension] = true;
            extensionContextMap[extension.toLowerCase()] = true;
        }

        const folderNameContextMap: Record<string, true> = {};
        const folderPathContextMap: Record<string, true> = {};
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

        for (const exclude of excludeFolders) {
            folderNameContextMap[exclude] = true;
            folderNameContextMap[exclude.toLowerCase()] = true;

            const hasDirectorySeparator = exclude.includes("/") || exclude.includes("\\");
            if (hasDirectorySeparator || path.isAbsolute(exclude)) {
                if (path.isAbsolute(exclude)) {
                    folderPathContextMap[path.normalize(exclude)] = true;
                } else {
                    for (const workspaceFolder of workspaceFolders) {
                        const absoluteExcludePath = path.resolve(workspaceFolder.uri.fsPath, exclude);
                        folderPathContextMap[path.normalize(absoluteExcludePath)] = true;
                    }
                }
            }
        }

        await vscode.commands.executeCommand("setContext", contextKeyExcludeExtensions, extensionContextMap);
        await vscode.commands.executeCommand("setContext", contextKeyExcludeFolderNames, folderNameContextMap);
        await vscode.commands.executeCommand("setContext", contextKeyExcludeFolderPaths, folderPathContextMap);
    }

    // Register the FileDecorationProvider
    context.subscriptions.push(vscode.window.registerFileDecorationProvider(provider));

    // Warm up workspace to eagerly show folder decorations
    provider.warmUpWorkspace("startup");
    void updateIgnoreMenuContexts();

    // Refresh decorations when a file is saved
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
            provider.refreshUri(document.uri);
        }),
    );

    // Refresh all decorations when configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("lineCounter")) {
                provider.refreshAll();
                void updateIgnoreMenuContexts();
            }
        }),
    );

    // Refresh decorations when files are created or deleted
    const watcher = vscode.workspace.createFileSystemWatcher("**/*");
    context.subscriptions.push(watcher.onDidCreate((uri) => provider.refreshUri(uri)));
    context.subscriptions.push(watcher.onDidDelete((uri) => provider.refreshUri(uri)));
    context.subscriptions.push(watcher.onDidChange((uri) => provider.refreshUri(uri)));
    context.subscriptions.push(watcher);

    registerCommands(context, provider, updateIgnoreMenuContexts);

    // Clean up provider on deactivation
    context.subscriptions.push(provider);
}

export function deactivate(): void {
    // Nothing to clean up — disposables handle it
}
