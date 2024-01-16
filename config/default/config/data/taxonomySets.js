const taxonomySetsContext = require.context(
    "./taxonomy-sets",
    false,
    /\.json$/,
);

let dedupedFileNames = [];

const taxonomySets = taxonomySetsContext
    .keys()
    .map((filename) => {
        const filenameOnly = filename.split("/").pop();

        // This is needed because the require.context keys
        // will include the same file with two paths:
        // ./filename.json and <absolute-path>/filename.json
        if (dedupedFileNames.includes(filenameOnly)) {
            return;
        }

        const setName = filename.slice(2, -5); // Remove './' and '.json' from the file name
        const content = taxonomySetsContext(filename);

        dedupedFileNames.push(filenameOnly);
        return { setName, ...content };
    })
    .filter(Boolean);

export const getTaxonomySets = async function () {
    return taxonomySets;
};

export const getTopics = async function (language) {
    return taxonomySets?.find((set) => set.setName === "news")?.topics;
};

export const getTags = async function () {
    return taxonomySets?.find((set) => set.setName === "news")?.tags;
};
