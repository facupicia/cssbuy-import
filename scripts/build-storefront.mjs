import { build } from "esbuild";
await build({ entryPoints: ["storefront/main.ts"], outfile: "public/plug-storefront.min.js", bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true, sourcemap: false });
