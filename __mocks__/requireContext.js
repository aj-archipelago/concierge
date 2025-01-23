const fs = require('fs');
const path = require('path');

function requireContext(base = '.', scanSubDirectories = false, regularExpression = /\.js$/) {
  const files = {};
  const baseDirectory = path.resolve(__dirname, '..', base);

  function readDirectory(directory) {
    fs.readdirSync(directory).forEach((file) => {
      const fullPath = path.resolve(directory, file);
      const relativePath = './' + path.relative(baseDirectory, fullPath);

      if (fs.statSync(fullPath).isDirectory()) {
        if (scanSubDirectories) {
          readDirectory(fullPath);
        }
        return;
      }

      if (regularExpression.test(file)) {
        files[relativePath] = true;
      }
    });
  }

  readDirectory(baseDirectory);

  function Module(file) {
    return require(path.resolve(baseDirectory, file));
  }

  Module.keys = () => Object.keys(files);
  Module.resolve = (file) => path.resolve(baseDirectory, file);
  Module.id = base;

  return Module;
}

module.exports = requireContext; 