function requireContext(
    base = ".",
    scanSubDirectories = false,
    regularExpression = /\.js$/,
) {
    function Module(file) {
        // Special handling for taxonomy sets
        if (file.includes("taxonomy-sets")) {
            return [];
        }
        return {};
    }

    Module.keys = () => [];
    Module.resolve = (file) => file;
    Module.id = base;

    return Module;
}

module.exports = requireContext;
