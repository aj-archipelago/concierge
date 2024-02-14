const path = require("path");

module.exports = {
    redirects: async () => {
        return [
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
    basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
};
