import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const buildOptions = {
    entryPoints: ["src/extension.ts"],
    bundle: true,
    outfile: "out/extension.js",
    external: ["vscode"],
    format: "cjs",
    platform: "node",
    target: "node20",
    sourcemap: !production,
    minify: production,
};

if (watch) {
    const context = await esbuild.context(buildOptions);
    await context.watch();
    // Keep process alive in watch mode.
    await new Promise(() => undefined);
} else {
    await esbuild.build(buildOptions);
}
