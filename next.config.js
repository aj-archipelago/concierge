const path = require("path");

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;

const redirects = [
    {
        source: "/",
        destination: "/chat",
        permanent: true,
    },
    {
        source: "/code",
        destination: "/code/knuth",
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

module.exports = {
    async rewrites() {
        const rewrites = [
            {
                source: "/graphql",
                destination:
                    process.env.CORTEX_GRAPHQL_API_URL ||
                    "http://localhost:4000/graphql",
            },
            {
                source: "/media-helper",
                destination:
                    process.env.CORTEX_MEDIA_API_URL || "http://localhost:5000",
            },
        ];

        // Log the URLs to console
        rewrites.forEach((rewrite) => {
            console.log(
                `Connecting to URL: ${anonymizeUrl(rewrite.destination)}`,
            );
        });

        return rewrites;
    },
    experimental: {
        proxyTimeout: 1000 * 60 * 5, // 5 minutes
        instrumentationHook: true,
    },
    redirects: async () => {
        return redirects;
    },
    sassOptions: {
        includePaths: [path.join(__dirname, "src")],
    },
    output: "standalone",
    basePath: basePath || "",
    webpack: (config) => {
        // Exclude mongodb and mongodb-client-encryption from the bundle to avoid errors, will be required and imported at runtime
        config.externals.push("mongodb-client-encryption", "mongodb");
        return config;
    },
};
