module.exports = function override(config, env) {
    // Add your custom configuration here
    // For example, to exclude parse5 module from source-map-loader:
    config.module.rules.push({
        test: /\.js$/,
        use: ["source-map-loader"],
        enforce: "pre",
        exclude: /node_modules\/parse5/,
    });

    return config;
};
