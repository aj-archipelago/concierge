import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Next requires Turbopack and file tracing to use the same filesystem root.
const filesystemRoot = process.env.CONCIERGE_TURBOPACK_ROOT || __dirname;
const rawContentLoader = path.join(__dirname, "scripts/raw-content-loader.cjs");
const rootAlias = __dirname;
const shadcnComponentAlias = path.join(__dirname, "@", "components");
const shadcnLibAlias = path.join(__dirname, "@", "lib");

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;

const redirects = [
    {
        source: "/",
        destination: "/home",
        permanent: false,
    },
    {
        source: "/code",
        destination: "/code/jira",
        permanent: true,
    },
];

if (basePath && basePath !== "/") {
    redirects.unshift({
        source: "/",
        destination: basePath || "/",
        basePath: false,
        permanent: false,
    });
}

const anonymizeUrl = (urlString) => {
    // Create a URL object from the string
    let url = new URL(urlString);

    // Modify each parameter in the query string
    url.searchParams.forEach((value, key) => {
        // If the value is an API key, anonymize it
        if (key.toLowerCase().includes("key")) {
            url.searchParams.set(
                key,
                value.substring(0, 4) + "*".repeat(value.length - 4),
            );
        }
    });

    return url.toString();
};

const config = {
    // Browsers include brackets in IPv6 origins; Next's bound hostname does not.
    allowedDevOrigins: ["[::1]"],
    async rewrites() {
        const rewrites = [
            {
                source: "/graphql-ws",
                destination:
                    process.env.CORTEX_GRAPHQL_API_URL ||
                    "http://localhost:4000/graphql",
            },
        ];

        // If you have a blue/green deployment, you can use this to switch between the two
        if (process.env.CORTEX_GRAPHQL_API_BLUE_URL) {
            rewrites.push({
                source: "/graphql-blue-ws",
                destination: process.env.CORTEX_GRAPHQL_API_BLUE_URL,
            });
        }

        // Log the URLs to console
        rewrites.forEach((rewrite) => {
            console.log(
                `Connecting to URL: ${anonymizeUrl(rewrite.destination)}`,
            );
        });

        return rewrites;
    },
    experimental: {
        proxyClientMaxBodySize: "2gb",
        proxyTimeout: 1000 * 60 * 10, // 10 minutes (600 seconds)
    },
    serverExternalPackages: [
        "busboy",
        "mongodb",
        "mongodb-client-encryption",
        "playwright",
    ],
    redirects: async () => {
        return redirects;
    },
    sassOptions: {
        includePaths: [path.join(__dirname, "src")],
        // @import remains until partials share variables via @use/@forward.
        silenceDeprecations: ["import"],
    },
    turbopack: {
        // Worktrees can share node_modules with another checkout. In that case,
        // the local launcher supplies a root containing both real paths.
        root: filesystemRoot,
        resolveAlias: {
            "@/components": shadcnComponentAlias,
            "@/lib": shadcnLibAlias,
            "@": rootAlias,
        },
        rules: {
            "*.md": {
                loaders: [rawContentLoader],
                as: "*.js",
            },
        },
    },
    output: "standalone",
    outputFileTracingRoot: filesystemRoot,
    basePath: basePath || "",
    webpack: (config) => {
        // Exclude mongodb and mongodb-client-encryption from the bundle to avoid errors, will be required and imported at runtime
        config.externals.push(
            "mongodb-client-encryption",
            "mongodb",
            "bufferutil",
            "utf-8-validate",
        );

        // Keep aliases aligned with turbopack.resolveAlias above.
        config.resolve.alias = {
            ...config.resolve.alias,
            "@/components": shadcnComponentAlias,
            "@/lib": shadcnLibAlias,
            "@": rootAlias,
        };

        // Allow importing .md files as raw strings for local help guides.
        config.module.rules.push({ test: /\.md$/, type: "asset/source" });

        return config;
    },
};

export default config;
