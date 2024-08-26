import mongoose from "mongoose";

const uploadedDocsSchema = new mongoose.Schema({
    docId: {
        type: String,
        required: true,
    },
    filename: {
        type: String,
        required: true,
    },
    chatId: {
        type: String,
        required: true,
    },
});

export default uploadedDocsSchema;
