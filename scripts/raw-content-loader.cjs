module.exports = function rawContentLoader(source) {
    return `export default ${JSON.stringify(source.toString())};`;
};
