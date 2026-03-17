import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => {
    let excludeExtensions: string[] = [];
    let excludeFolders: string[] = [];
    let extensionLimits: unknown = {};
    let workspaceRoot: string | undefined = "/workspace";

    const update = vi.fn(async (key: string, value: unknown) => {
        if (key === "excludeExtensions") {
            excludeExtensions = value as string[];
        }
        if (key === "excludeFolders") {
            excludeFolders = value as string[];
        }
        if (key === "extensionLimits") {
            extensionLimits = value;
        }
    });

    const showInformationMessage = vi.fn(async () => "Yes");
    const showErrorMessage = vi.fn();
    const showInputBox = vi.fn(async () => "100");

    return {
        update,
        showInformationMessage,
        showErrorMessage,
        showInputBox,
        reset() {
            excludeExtensions = [];
            excludeFolders = [];
            extensionLimits = {};
            workspaceRoot = "/workspace";
            update.mockClear();
            showInformationMessage.mockClear();
            showErrorMessage.mockClear();
            showInputBox.mockClear();
        },
        setExcludeExtensions(next: string[]) {
            excludeExtensions = [...next];
        },
        setExcludeFolders(next: string[]) {
            excludeFolders = [...next];
        },
        setExtensionLimits(next: unknown) {
            extensionLimits = next;
        },
        setWorkspaceRoot(next: string | undefined) {
            workspaceRoot = next;
        },
        getExcludeExtensions() {
            return [...excludeExtensions];
        },
        getExcludeFolders() {
            return [...excludeFolders];
        },
        getExtensionLimits() {
            return typeof extensionLimits === "object" && extensionLimits !== null
                ? JSON.parse(JSON.stringify(extensionLimits))
                : extensionLimits;
        },
        getWorkspaceRoot() {
            return workspaceRoot;
        },
        commandHandlers: new Map<string, (...args: unknown[]) => Promise<void> | void>(),
    };
});

vi.mock("vscode", () => {
    return {
        ConfigurationTarget: {
            Global: "Global",
        },
        commands: {
            registerCommand: vi.fn((command: string, callback: (...args: unknown[]) => Promise<void> | void) => {
                mockState.commandHandlers.set(command, callback);
                return { dispose: vi.fn() };
            }),
        },
        window: {
            showInformationMessage: mockState.showInformationMessage,
            showErrorMessage: mockState.showErrorMessage,
            showInputBox: mockState.showInputBox,
        },
        workspace: {
            getConfiguration: vi.fn(() => ({
                get: (key: string, fallback: unknown) => {
                    if (key === "excludeExtensions") {
                        return mockState.getExcludeExtensions();
                    }
                    if (key === "excludeFolders") {
                        return mockState.getExcludeFolders();
                    }
                    if (key === "extensionLimits") {
                        return mockState.getExtensionLimits();
                    }
                    return fallback;
                },
                update: mockState.update,
            })),
            getWorkspaceFolder: vi.fn((uri: { fsPath: string }) => {
                const root = mockState.getWorkspaceRoot();
                if (root && uri.fsPath.startsWith(root)) {
                    return { uri: { fsPath: root } };
                }
                return undefined;
            }),
        },
        Uri: {
            file: (path: string) => ({ scheme: "file", fsPath: path }),
        },
    };
});

vi.mock("./reportGenerator", () => {
    return { generateReport: vi.fn(async () => undefined) };
});

import { registerCommands } from "./commands";
import type * as vscode from "vscode";
import { generateReport } from "./reportGenerator";

describe("commands", () => {
    const mockContext = { subscriptions: [] as { dispose(): void }[] };
    const mockProvider = {
        refreshAll: vi.fn(),
        warmUpWorkspace: vi.fn(async () => undefined),
    };
    const mockUpdateIgnoreMenuContexts = vi.fn(async () => undefined);

    beforeEach(() => {
        mockState.reset();
        mockState.commandHandlers.clear();
        mockContext.subscriptions = [];
        mockProvider.refreshAll.mockClear();
        mockProvider.warmUpWorkspace.mockClear();
        mockUpdateIgnoreMenuContexts.mockClear();
        vi.mocked(generateReport).mockClear();

        // Register commands to populate mockState.commandHandlers
        registerCommands(
            mockContext as unknown as vscode.ExtensionContext,
            mockProvider as never,
            mockUpdateIgnoreMenuContexts,
        );
    });

    describe("lineCounter.addToIgnoreList", () => {
        it("adds file to ignore list using relative path", async () => {
            const command = mockState.commandHandlers.get("lineCounter.addToIgnoreList");
            const uri = { scheme: "file", fsPath: "/workspace/src/newFile.ts" };

            await command?.(uri);

            expect(mockState.update).toHaveBeenCalledWith("excludeFolders", ["src/newFile.ts"], "Global");
            expect(mockUpdateIgnoreMenuContexts).toHaveBeenCalled();
            expect(mockState.showInformationMessage).toHaveBeenCalledWith(
                "Added 'src/newFile.ts' to Stanza ignore list.",
            );
        });

        it("warns if file is already in ignore list", async () => {
            mockState.setExcludeFolders(["src/existing.ts"]);
            const command = mockState.commandHandlers.get("lineCounter.addToIgnoreList");
            const uri = { scheme: "file", fsPath: "/workspace/src/existing.ts" };

            await command?.(uri);

            expect(mockState.update).not.toHaveBeenCalled();
            expect(mockState.showInformationMessage).toHaveBeenCalledWith(
                "'src/existing.ts' is already in the ignore list.",
            );
        });
    });

    describe("lineCounter.addExtensionToIgnoreList", () => {
        it("adds extension to ignore list", async () => {
            const command = mockState.commandHandlers.get("lineCounter.addExtensionToIgnoreList");
            const uri = { scheme: "file", fsPath: "/workspace/src/newFile.customext" };

            await command?.(uri);

            expect(mockState.update).toHaveBeenCalledWith("excludeExtensions", [".customext"], "Global");
            expect(mockUpdateIgnoreMenuContexts).toHaveBeenCalled();
            expect(mockState.showInformationMessage).toHaveBeenCalledWith(
                "Added '.customext' to Stanza extension ignore list.",
            );
        });

        it("warns if extension is already in ignore list", async () => {
            mockState.setExcludeExtensions([".ts"]);
            const command = mockState.commandHandlers.get("lineCounter.addExtensionToIgnoreList");
            const uri = { scheme: "file", fsPath: "/workspace/src/existing.ts" };

            await command?.(uri);

            expect(mockState.update).not.toHaveBeenCalled();
            expect(mockState.showInformationMessage).toHaveBeenCalledWith(
                "'.ts' is already in the extension ignore list.",
            );
        });
    });

    describe("lineCounter.warmUp", () => {
        it("calls warmUpWorkspace on provider", async () => {
            const command = mockState.commandHandlers.get("lineCounter.warmUp");

            await command?.();

            expect(mockProvider.warmUpWorkspace).toHaveBeenCalledWith("manual");
            expect(mockState.showInformationMessage).toHaveBeenCalledWith("Stanza: Workspace badges warmed up!");
        });
    });

    describe("lineCounter.generateReport", () => {
        it("calls generateReport", async () => {
            const command = mockState.commandHandlers.get("lineCounter.generateReport");

            await command?.();

            expect(generateReport).toHaveBeenCalled();
        });
    });

    describe("lineCounter.setExtensionLimit", () => {
        it("sets a new extension limit when no limits exist", async () => {
            const command = mockState.commandHandlers.get("lineCounter.setExtensionLimit");
            const uri = { scheme: "file", fsPath: "/workspace/src/file.ts" };

            await command?.(uri);

            expect(mockState.showInputBox).toHaveBeenCalled();
            expect(mockState.update).toHaveBeenCalledWith("extensionLimits", { ".ts": 100 }, "Global");
            expect(mockProvider.refreshAll).toHaveBeenCalled();
        });

        it("removes limit if user inputs 0", async () => {
            mockState.setExtensionLimits({ ".ts": 100 });
            mockState.showInputBox.mockImplementationOnce(async () => "0");

            const command = mockState.commandHandlers.get("lineCounter.setExtensionLimit");
            const uri = { scheme: "file", fsPath: "/workspace/src/file.ts" };

            await command?.(uri);

            expect(mockState.update).toHaveBeenCalledWith("extensionLimits", {}, "Global");
            expect(mockProvider.refreshAll).toHaveBeenCalled();
        });

        it("prompts to unignore if extension is ignored and limits is set", async () => {
            mockState.setExcludeExtensions([".ts"]);
            mockState.showInputBox.mockImplementationOnce(async () => "100");

            const command = mockState.commandHandlers.get("lineCounter.setExtensionLimit");
            const uri = { scheme: "file", fsPath: "/workspace/src/file.ts" };

            await command?.(uri);

            expect(mockState.showInformationMessage).toHaveBeenCalledWith(
                "The extension '.ts' is currently in the ignore list. Do you want to remove it from the ignore list and set a line limit for it?",
                "Yes",
                "No",
            );
            expect(mockState.update).toHaveBeenCalledWith("excludeExtensions", [], "Global");
            expect(mockUpdateIgnoreMenuContexts).toHaveBeenCalled();
            expect(mockState.update).toHaveBeenCalledWith("extensionLimits", { ".ts": 100 }, "Global");
        });
    });
});
