import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => {
    const cache = new Map<string, { type: number; size: number; mtime: number }>();
    const fileContents = new Map<string, Uint8Array>();
    const firedEvents: Array<unknown> = [];

    const fileType = {
        File: 1,
        Directory: 2,
    };

    const defaults = {
        showFolderBadges: true,
        excludeFolders: ["node_modules", ".git", "vendor", "dist", "out", "target", "bin", ".venv", "venv", "env", ".env"],
        excludeExtensions: [] as string[],
        extensionLimits: {},
        limit: 300,
        limitColor: "editorInfo.foreground",
        maxFileSizeMB: 10,
        useSmileys: false,
        autoRefreshWorkspace: true,
    };

    const config = { ...defaults } as Record<string, unknown>;
    let workspaceRoot = "/workspace";
    let findFilesResult: Array<{ scheme: string; fsPath: string }> = [];

    class ThemeColor {
        id: string;
        constructor(id: string) {
            this.id = id;
        }
    }

    class FileDecoration {
        badge: string;
        tooltip?: string;
        color?: unknown;
        constructor(badge: string, tooltip?: string, color?: unknown) {
            this.badge = badge;
            this.tooltip = tooltip;
            this.color = color;
        }
    }

    class EventEmitter<T> {
        event = vi.fn();
        fire = vi.fn((value: T) => {
            firedEvents.push(value);
        });
        dispose = vi.fn();
    }

    return {
        FileType: fileType,
        ThemeColor,
        FileDecoration,
        EventEmitter,
        firedEvents,
        cache,
        fileContents,
        reset() {
            this.cache.clear();
            this.fileContents.clear();
            this.firedEvents.length = 0;
            Object.assign(config, defaults);
            findFilesResult = [];
            workspaceRoot = "/workspace";
        },
        setConfig(key: string, value: unknown) {
            config[key] = value;
        },
        getConfig(key: string, fallback: unknown) {
            if (key in config) {
                return config[key];
            }
            return fallback;
        },
        setWorkspaceRoot(root: string) {
            workspaceRoot = root;
        },
        getWorkspaceFolder(uri: { fsPath: string }) {
            if (uri.fsPath.startsWith(workspaceRoot)) {
                return { uri: { fsPath: workspaceRoot } };
            }
            return undefined;
        },
        setFindFilesResult(uris: Array<{ scheme: string; fsPath: string }>) {
            findFilesResult = uris;
        },
        getFindFilesResult() {
            return findFilesResult;
        },
        setStat(fsPath: string, stat: { type: number; size: number; mtime: number }) {
            this.cache.set(fsPath, stat);
        },
        setFileContent(fsPath: string, content: string) {
            this.fileContents.set(fsPath, new TextEncoder().encode(content));
        },
    };
});

const utilsMock = vi.hoisted(() => {
    return {
        countLines: vi.fn(() => 10),
        countLinesStream: vi.fn(async () => 10),
        shouldExcludePath: vi.fn(() => false),
        isTooLarge: vi.fn(() => false),
        getDecorationSpec: vi.fn((lineCount: number, limit: number, useSmileys: boolean) => ({
            badge: useSmileys ? "😎" : String(lineCount),
            tooltip: `${lineCount} lines`,
            useLimitColor: lineCount > limit,
        })),
        getPathExtension: vi.fn((fsPath: string) => (fsPath.endsWith(".ts") ? ".ts" : "")),
        getExtensionLimit: vi.fn((_limits: unknown, _ext: string, globalLimit: number) => globalLimit),
    };
});

vi.mock("./utils", () => utilsMock);

vi.mock("vscode", () => {
    return {
        FileType: mockState.FileType,
        ThemeColor: mockState.ThemeColor,
        FileDecoration: mockState.FileDecoration,
        EventEmitter: mockState.EventEmitter,
        Uri: {
            file: (fsPath: string) => ({ scheme: "file", fsPath }),
        },
        workspace: {
            fs: {
                stat: vi.fn(async (uri: { fsPath: string }) => {
                    const stat = mockState.cache.get(uri.fsPath);
                    if (!stat) {
                        throw new Error("Not found");
                    }
                    return stat;
                }),
                readFile: vi.fn(async (uri: { fsPath: string }) => {
                    const content = mockState.fileContents.get(uri.fsPath);
                    if (!content) {
                        throw new Error("Not found");
                    }
                    return content;
                }),
            },
            getConfiguration: vi.fn(() => ({
                get: (key: string, fallback: unknown) => mockState.getConfig(key, fallback),
            })),
            getWorkspaceFolder: vi.fn((uri: { fsPath: string }) => mockState.getWorkspaceFolder(uri)),
            findFiles: vi.fn(async () => mockState.getFindFilesResult()),
        },
    };
});

import { LineCountDecorationProvider } from "./lineCountDecorationProvider";

function makeUri(fsPath: string, scheme: string = "file"): { scheme: string; fsPath: string } {
    return { scheme, fsPath };
}

describe("LineCountDecorationProvider", () => {
    beforeEach(() => {
        mockState.reset();
        utilsMock.countLines.mockReset().mockReturnValue(10);
        utilsMock.countLinesStream.mockReset().mockResolvedValue(10);
        utilsMock.shouldExcludePath.mockReset().mockReturnValue(false);
        utilsMock.isTooLarge.mockReset().mockReturnValue(false);
        utilsMock.getDecorationSpec.mockReset().mockImplementation((lineCount: number, limit: number, useSmileys: boolean) => ({
            badge: useSmileys ? "😎" : String(lineCount),
            tooltip: `${lineCount} lines`,
            useLimitColor: lineCount > limit,
        }));
        utilsMock.getPathExtension.mockReset().mockImplementation((fsPath: string) => (fsPath.endsWith(".ts") ? ".ts" : ""));
        utilsMock.getExtensionLimit.mockReset().mockImplementation((_limits: unknown, _ext: string, globalLimit: number) => globalLimit);
    });

    it("returns file decoration for a regular file using stream counting", async () => {
        const provider = new LineCountDecorationProvider();
        mockState.setStat("/workspace/src/file.ts", { type: mockState.FileType.File, size: 128, mtime: 1 });
        utilsMock.countLinesStream.mockResolvedValue(42);

        const decoration = await provider.provideFileDecoration(makeUri("/workspace/src/file.ts"));

        expect(decoration).toBeDefined();
        expect(utilsMock.countLinesStream).toHaveBeenCalledWith("/workspace/src/file.ts");
        expect(utilsMock.getDecorationSpec).toHaveBeenCalledWith(42, 300, false);
    });

    it("returns folder warning decoration when exceeded file is inside", async () => {
        const provider = new LineCountDecorationProvider() as unknown as {
            exceededFiles: Set<string>;
            provideFileDecoration: (uri: { scheme: string; fsPath: string }) => Promise<unknown>;
        };
        provider.exceededFiles.add("/workspace/src/deep/file.ts");
        mockState.setStat("/workspace/src", { type: mockState.FileType.Directory, size: 0, mtime: 1 });
        mockState.setConfig("limitColor", "errorForeground");

        const decoration = await provider.provideFileDecoration(makeUri("/workspace/src"));

        expect(decoration).toMatchObject({
            badge: "⚠",
            tooltip: "Contains files exceeding line limit",
        });
    });

    it("returns undefined for excluded or oversized files", async () => {
        const provider = new LineCountDecorationProvider() as unknown as {
            exceededFiles: Set<string>;
            provideFileDecoration: (uri: { scheme: string; fsPath: string }) => Promise<unknown>;
        };
        provider.exceededFiles.add("/workspace/src/ignored.ts");
        mockState.setStat("/workspace/src/ignored.ts", { type: mockState.FileType.File, size: 2048, mtime: 1 });
        utilsMock.shouldExcludePath.mockReturnValueOnce(true);

        const excluded = await provider.provideFileDecoration(makeUri("/workspace/src/ignored.ts"));
        expect(excluded).toBeUndefined();

        utilsMock.shouldExcludePath.mockReturnValue(false);
        utilsMock.isTooLarge.mockReturnValue(true);
        const oversized = await provider.provideFileDecoration(makeUri("/workspace/src/ignored.ts"));
        expect(oversized).toBeUndefined();
        expect(provider.exceededFiles.has("/workspace/src/ignored.ts")).toBe(false);
    });

    it("uses cache when mtime is unchanged", async () => {
        const provider = new LineCountDecorationProvider() as unknown as {
            cache: Map<string, { lineCount: number; mtimeMs: number }>;
            provideFileDecoration: (uri: { scheme: string; fsPath: string }) => Promise<unknown>;
        };
        provider.cache.set("/workspace/src/file.ts", { lineCount: 77, mtimeMs: 123 });
        mockState.setStat("/workspace/src/file.ts", { type: mockState.FileType.File, size: 100, mtime: 123 });

        const decoration = await provider.provideFileDecoration(makeUri("/workspace/src/file.ts"));

        expect(decoration).toBeDefined();
        expect(utilsMock.countLinesStream).not.toHaveBeenCalled();
        expect(utilsMock.getDecorationSpec).toHaveBeenCalledWith(77, 300, false);
    });

    it("uses workspace readFile + countLines for non-file schemes", async () => {
        const provider = new LineCountDecorationProvider();
        mockState.setStat("/workspace/src/virtual.ts", { type: mockState.FileType.File, size: 10, mtime: 2 });
        mockState.setFileContent("/workspace/src/virtual.ts", "a\nb\n");
        utilsMock.countLines.mockReturnValue(2);

        const decoration = await provider.provideFileDecoration(makeUri("/workspace/src/virtual.ts", "vscode-remote"));

        expect(decoration).toBeDefined();
        expect(utilsMock.countLinesStream).not.toHaveBeenCalled();
        expect(utilsMock.countLines).toHaveBeenCalled();
    });

    it("refreshUri invalidates cache and emits event", () => {
        const provider = new LineCountDecorationProvider() as unknown as {
            cache: Map<string, { lineCount: number; mtimeMs: number }>;
            refreshUri: (uri: { scheme: string; fsPath: string }) => void;
        };
        const uri = makeUri("/workspace/src/file.ts");
        provider.cache.set(uri.fsPath, { lineCount: 1, mtimeMs: 1 });

        provider.refreshUri(uri);

        expect(provider.cache.has(uri.fsPath)).toBe(false);
        expect(mockState.firedEvents).toContainEqual(uri);
    });

    it("refreshAll clears state, emits undefined, and triggers warmup", () => {
        const provider = new LineCountDecorationProvider() as unknown as {
            cache: Map<string, { lineCount: number; mtimeMs: number }>;
            exceededFiles: Set<string>;
            refreshAll: () => void;
            warmUpWorkspace: (trigger: "startup" | "config-change" | "manual") => Promise<void>;
        };
        provider.cache.set("/workspace/src/file.ts", { lineCount: 1, mtimeMs: 1 });
        provider.exceededFiles.add("/workspace/src/file.ts");
        const warmUpSpy = vi.spyOn(provider, "warmUpWorkspace").mockResolvedValue();

        provider.refreshAll();

        expect(provider.cache.size).toBe(0);
        expect(provider.exceededFiles.size).toBe(0);
        expect(mockState.firedEvents).toContain(undefined);
        expect(warmUpSpy).toHaveBeenCalledWith("config-change");
    });

    it("warmUpWorkspace respects config-change autoRefresh and showFolderBadges", async () => {
        const provider = new LineCountDecorationProvider();
        mockState.setConfig("autoRefreshWorkspace", false);
        mockState.setFindFilesResult([makeUri("/workspace/src/file.ts")]);

        await provider.warmUpWorkspace("config-change");
        expect(utilsMock.countLinesStream).not.toHaveBeenCalled();

        mockState.setConfig("autoRefreshWorkspace", true);
        mockState.setConfig("showFolderBadges", false);
        await provider.warmUpWorkspace("manual");
        expect(utilsMock.countLinesStream).not.toHaveBeenCalled();
    });

    it("warmUpWorkspace seeds cache and exceeded set for exceeded files", async () => {
        const provider = new LineCountDecorationProvider() as unknown as {
            cache: Map<string, { lineCount: number; mtimeMs: number }>;
            exceededFiles: Set<string>;
            warmUpWorkspace: (trigger: "startup" | "config-change" | "manual") => Promise<void>;
        };
        const uri = makeUri("/workspace/src/deep/file.ts");
        mockState.setFindFilesResult([uri]);
        mockState.setStat(uri.fsPath, { type: mockState.FileType.File, size: 100, mtime: 10 });
        utilsMock.countLinesStream.mockResolvedValue(999);
        utilsMock.getExtensionLimit.mockReturnValue(100);

        await provider.warmUpWorkspace("manual");

        expect(provider.cache.get(uri.fsPath)).toEqual({ lineCount: 999, mtimeMs: 10 });
        expect(provider.exceededFiles.has(uri.fsPath)).toBe(true);
        expect(mockState.firedEvents.length).toBeGreaterThan(0);
    });

    it("evicts the oldest cache entry when cache reaches max size", async () => {
        const provider = new LineCountDecorationProvider() as unknown as {
            cache: Map<string, { lineCount: number; mtimeMs: number }>;
            provideFileDecoration: (uri: { scheme: string; fsPath: string }) => Promise<unknown>;
        };

        for (let i = 0; i < 1000; i++) {
            provider.cache.set(`/workspace/src/file-${i}.ts`, { lineCount: i, mtimeMs: i });
        }

        mockState.setStat("/workspace/src/new-file.ts", { type: mockState.FileType.File, size: 1, mtime: 2001 });
        utilsMock.countLinesStream.mockResolvedValue(2);

        await provider.provideFileDecoration(makeUri("/workspace/src/new-file.ts"));

        expect(provider.cache.size).toBe(1000);
        expect(provider.cache.has("/workspace/src/file-0.ts")).toBe(false);
        expect(provider.cache.has("/workspace/src/new-file.ts")).toBe(true);
    });
});
