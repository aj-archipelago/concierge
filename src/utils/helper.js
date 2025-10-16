export const isValidObjectId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

export const getChatIdString = (id) =>
    typeof id === "string" ? id : String(id ?? "");
