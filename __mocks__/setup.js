const requireContext = require("./requireContext");

if (!global.require) {
    global.require = {};
}
global.require.context = requireContext;
