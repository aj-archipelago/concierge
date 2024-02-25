const path = require("path");

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;

module.exports = {
    async rewrites() {
        return [
            {
                source: "/graphql",
                destination:
                    // This is a build-time environment variable, not a runtime variable
                    // Anything in next.config.js is compiled at build-time
                    process.env.CORTEX_GRAPHQL_API_URL ||
                    "http://localhost:4000/graphql",
            },
            {
                source: "/media-helper",
                destination:
                    // This is a build-time environment variable, not a runtime variable
                    // Anything in next.config.js is compiled at build-time
                    process.env.CORTEX_MEDIA_API_URL || "http://localhost:5000",
            },
        ];
    },
    experimental: {
        proxyTimeout: 1000 * 60 * 5, // 5 minutes
    },
    redirects: async () => {
        return [
            {
                source: '/',
                destination: basePath || "/",
                basePath: false,
                permanent: false
            },
            {
                source: "/",
                destination: "/write",
                permanent: true,
            },
        ];
    },
    sassOptions: {
        includePaths: [path.join(__dirname, "src")],
    },
    output: "standalone",
    basePath: basePath || "",
};
