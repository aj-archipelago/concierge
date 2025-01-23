const mockConfig = {
  data: {
    llms: [
      {
        name: "GPT-3.5 Turbo",
        cortexModelName: "azure-turbo-chat",
        cortexPathwayName: "run_gpt35turbo",
        identifier: "gpt35turbo",
        isDefault: true
      },
      {
        name: "GPT-4",
        cortexModelName: "azure-gpt4",
        cortexPathwayName: "run_gpt4",
        identifier: "gpt4",
        isDefault: false
      }
    ]
  },
  global: {
    initialize: () => {}
  }
};

export default mockConfig; 