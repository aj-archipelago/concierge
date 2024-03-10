import mongoose from "mongoose";

// Define the Workspace schema
const workspaceSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        prompts: {
            type: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Prompt",
                },
            ],
        },
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        slug: {
            type: String,
            required: true,
            unique: true,
        },
    },
    {
        timestamps: true,
    },
);

// Create the Workspace model from the schema
const Workspace =
    mongoose.models.Workspace || mongoose.model("Workspace", workspaceSchema);

// cascade workspace membership deletion
workspaceSchema.pre("remove", async function (next) {
    await mongoose.models.WorkspaceMembership.deleteMany({
        workspace: this._id,
    });
    // and delete prompts too
    await mongoose.models.Prompt.deleteMany({ _id: { $in: this.prompts } });
    next();
});

// auto-generate slug
workspaceSchema.pre("save", async function (next) {
    if (!this.slug) {
        this.slug = this.name.toLowerCase().replace(/ /g, "-");
    }
    next();
});

export default Workspace;
