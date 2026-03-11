import * as vscode from "vscode";
import * as path from "path";
import { LineCountDecorationProvider } from "./lineCountDecorationProvider";
import { getPathExtension } from "./utils";

export function activate(context: vscode.ExtensionContext): void {
    const provider = new LineCountDecorationProvider();

    // Register the FileDecorationProvider
    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(provider)
    );

    // Warm up workspace to eagerly show folder decorations
    provider.warmUpWorkspace();

    // Refresh decorations when a file is saved
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
            provider.refreshUri(document.uri);
        })
    );

    // Refresh all decorations when configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("lineCounter")) {
                provider.refreshAll();
            }
        })
    );

    // Refresh decorations when files are created or deleted
    const watcher = vscode.workspace.createFileSystemWatcher("**/*");
    context.subscriptions.push(
        watcher.onDidCreate((uri) => provider.refreshUri(uri))
    );
    context.subscriptions.push(
        watcher.onDidDelete((uri) => provider.refreshUri(uri))
    );
    context.subscriptions.push(
        watcher.onDidChange((uri) => provider.refreshUri(uri))
    );
    context.subscriptions.push(watcher);

    // Register the addToIgnoreList command
    context.subscriptions.push(
        vscode.commands.registerCommand("lineCounter.addToIgnoreList", async (uri: vscode.Uri) => {
            if (!uri || uri.scheme !== "file") {
                return;
            }

            const config = vscode.workspace.getConfiguration("lineCounter");
            const excludeFolders: string[] = config.get("excludeFolders", []);

            // Get path relative to workspace root if possible
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            const pathToAdd = workspaceFolder
                ? path.relative(workspaceFolder.uri.fsPath, uri.fsPath)
                : path.basename(uri.fsPath);

            if (!excludeFolders.includes(pathToAdd)) {
                const updatedExcludes = [...excludeFolders, pathToAdd];
                await config.update("excludeFolders", updatedExcludes, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Added '${pathToAdd}' to Stanza ignore list.`);
            } else {
                vscode.window.showInformationMessage(`'${pathToAdd}' is already in the ignore list.`);
            }
        })
    );

    // Register the addExtensionToIgnoreList command
    context.subscriptions.push(
        vscode.commands.registerCommand("lineCounter.addExtensionToIgnoreList", async (uri: vscode.Uri) => {
            if (!uri || uri.scheme !== "file") {
                return;
            }

            const fileExtension = getPathExtension(uri.fsPath).toLowerCase();
            if (!fileExtension) {
                return;
            }

            const config = vscode.workspace.getConfiguration("lineCounter");
            const excludeExtensions: string[] = config.get("excludeExtensions", []);
            const alreadyIgnored = excludeExtensions.some(
                (extension) => extension.toLowerCase() === fileExtension
            );

            if (alreadyIgnored) {
                vscode.window.showInformationMessage(
                    `'${fileExtension}' is already in the extension ignore list.`
                );
                return;
            }

            const updatedExcludeExtensions = [...excludeExtensions, fileExtension];
            await config.update(
                "excludeExtensions",
                updatedExcludeExtensions,
                vscode.ConfigurationTarget.Global
            );
            vscode.window.showInformationMessage(
                `Added '${fileExtension}' to Stanza extension ignore list.`
            );
        })
    );

    // Register the warmUp command
    context.subscriptions.push(
        vscode.commands.registerCommand("lineCounter.warmUp", async () => {
            vscode.window.showInformationMessage("Stanza: Warming up workspace badges...");
            await provider.warmUpWorkspace(true);
            vscode.window.showInformationMessage("Stanza: Workspace badges warmed up successfully!");
        })
    );

    // Register the setExtensionLimit command
    context.subscriptions.push(
        vscode.commands.registerCommand("lineCounter.setExtensionLimit", async (uri: vscode.Uri) => {
            if (!uri || uri.scheme !== "file") {
                return;
            }

            const fileExtension = getPathExtension(uri.fsPath).toLowerCase();
            if (!fileExtension) {
                vscode.window.showErrorMessage("Could not determine file extension.");
                return;
            }

            const config = vscode.workspace.getConfiguration("lineCounter");
            const extensionLimits: Record<string, number> = config.get("extensionLimits", {});
            const excludeExtensions: string[] = config.get("excludeExtensions", []);
            
            // Check if this extension is currently excluded
            const isExcluded = excludeExtensions.some(ext => ext.toLowerCase() === fileExtension);
            
            if (isExcluded) {
                const answer = await vscode.window.showInformationMessage(
                    `The extension '${fileExtension}' is currently in the ignore list. Do you want to remove it from the ignore list and set a line limit for it?`,
                    "Yes",
                    "No"
                );
                
                if (answer !== "Yes") {
                    return;
                }
                
                // Remove from exclude list
                const updatedExcludeExtensions = excludeExtensions.filter(ext => ext.toLowerCase() !== fileExtension);
                await config.update("excludeExtensions", updatedExcludeExtensions, vscode.ConfigurationTarget.Global);
            }

            // Get current limit if it exists
            const currentLimit = extensionLimits[fileExtension];
            const defaultValue = currentLimit ? currentLimit.toString() : "";

            // Ask for new limit
            const newLimitStr = await vscode.window.showInputBox({
                prompt: `Set line limit for '${fileExtension}' files`,
                placeHolder: "Enter line limit (number)",
                value: defaultValue,
                validateInput: (value) => {
                    if (!value.trim()) {
                        return "Please enter a number or 0 to remove the limit.";
                    }
                    const num = Number(value.trim());
                    if (!Number.isInteger(num) || num < 0) {
                        return "Please enter a positive integer or 0 to remove the limit.";
                    }
                    return null;
                }
            });

            if (newLimitStr === undefined) {
                return; // User cancelled
            }

            const newLimit = Number(newLimitStr.trim());
            
            if (newLimit === 0) {
                // Remove the extension limit
                const updatedLimits = { ...extensionLimits };
                delete updatedLimits[fileExtension];
                await config.update("extensionLimits", updatedLimits, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Removed line limit for '${fileExtension}' files.`);
            } else {
                // Set the extension limit
                const updatedLimits = { ...extensionLimits, [fileExtension]: newLimit };
                await config.update("extensionLimits", updatedLimits, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Set line limit for '${fileExtension}' files to ${newLimit}.`);
            }

            // Refresh decorations to apply the new limit
            provider.refreshAll();
        })
    );

    // Clean up provider on deactivation
    context.subscriptions.push(provider);
}

export function deactivate(): void {
    // Nothing to clean up — disposables handle it
}
