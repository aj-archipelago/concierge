import StyleGuide from "../models/style-guide.js";
import { migrateFilesToContext } from "./file-migration-utils";

const STYLE_GUIDE_CONTEXT_ID = "style-guide-check";

/**
 * Migrate style guide files to the "style-guide-check" context
 * Finds all style guide files and ensures they exist in the correct context in Cortex
 * Uses the shared file migration utility
 */
export async function migrateStyleGuideFiles() {
    return migrateFilesToContext({
        getFiles: async () => {
            // Find all active style guides and get their files
            const styleGuides = await StyleGuide.find({ isActive: true })
                .populate("file")
                .select("file");

            // Extract file documents, filtering out nulls
            return styleGuides
                .map((sg) => sg.file)
                .filter((file) => file != null);
        },
        targetContextId: STYLE_GUIDE_CONTEXT_ID,
        migrationName: "style guide",
    });
}
