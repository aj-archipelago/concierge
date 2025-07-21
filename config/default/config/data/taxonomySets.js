let dedupedFileNames = [];
let taxonomySets = [];

const initializeTaxonomySets = async () => {
    if (typeof window === "undefined") {
        try {
            // Define the taxonomy sets we want to load
            const taxonomyFiles = ["news.json"]; // Add other taxonomy files as needed

            taxonomySets = await Promise.all(
                taxonomyFiles.map(async (filename) => {
                    // Simple string manipulation instead of path.basename
                    const filenameOnly = filename.split("/").pop();

                    if (dedupedFileNames.includes(filenameOnly)) {
                        return null;
                    }

                    // Remove .json extension
                    const setName = filenameOnly.replace(".json", "");
                    // Use dynamic import with the public directory
                    const content = await import(
                        `/config/default/config/data/taxonomy-sets/${filename}`
                    );

                    dedupedFileNames.push(filenameOnly);
                    return { setName, ...content.default };
                }),
            ).then((sets) => sets.filter(Boolean));
        } catch (error) {
            console.error("Error loading taxonomy sets:", error);
            taxonomySets = [];
        }
    }
};

// Initialize the taxonomy sets
initializeTaxonomySets().catch((error) => {
    console.error("Failed to initialize taxonomy sets:", error);
});

export const getTaxonomySets = async function () {
    return taxonomySets;
};

export const getTopics = async function (language) {
    return taxonomySets?.find((set) => set.setName === "news")?.topics;
};

export const getTags = async function () {
    return taxonomySets?.find((set) => set.setName === "news")?.tags;
};
