// Mock taxonomy sets data
const mockTaxonomySets = [
    {
        setName: "news",
        topics: [],
        tags: [],
    },
];

export const getTaxonomySets = async function () {
    return mockTaxonomySets;
};

export const getTopics = async function (language) {
    return mockTaxonomySets.find((set) => set.setName === "news")?.topics;
};

export const getTags = async function () {
    return mockTaxonomySets.find((set) => set.setName === "news")?.tags;
};
