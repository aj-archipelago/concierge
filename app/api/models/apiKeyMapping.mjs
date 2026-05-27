import mongoose from "mongoose";

const apiKeyMappingSchema = new mongoose.Schema(
    {
        apiKeyHash: {
            type: String,
            required: true,
            unique: true,
        },
        label: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
    },
);

const ApiKeyMapping =
    mongoose.models.ApiKeyMapping ||
    mongoose.model("ApiKeyMapping", apiKeyMappingSchema);

export default ApiKeyMapping;
