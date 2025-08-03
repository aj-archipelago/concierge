import mongoose from "mongoose";

// App types enum
export const APP_TYPES = {
    NATIVE: "native",
    APPLET: "applet",
};

// App status enum
export const APP_STATUS = {
    ACTIVE: "active",
    INACTIVE: "inactive",
};

// Define the App schema for marketplace
export const appSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        slug: {
            type: String,
            required: false,
            lowercase: true,
            unique: true,
            trim: true,
        },
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false,
        },
        type: {
            type: String,
            enum: Object.values(APP_TYPES),
            required: true,
        },
        status: {
            type: String,
            enum: Object.values(APP_STATUS),
            default: APP_STATUS.ACTIVE,
        },
        workspaceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Workspace",
            required: function () {
                return this.type === "applet";
            },
        },
        icon: {
            type: String,
            required: false,
        },
    },
    {
        timestamps: true,
    },
);

if (mongoose.models) {
    // add indexes
    appSchema.index({ author: 1 });
    appSchema.index({ type: 1 });
    appSchema.index({ workspaceId: 1 });
    appSchema.index({ status: 1 });
    appSchema.index({ name: 1 });
}

// Create the App model from the schema
const App = mongoose.models?.App || mongoose.model("App", appSchema);

export default App;
