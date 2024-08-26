import mongoose from "mongoose";
import LLM from "./app/api/models/llm";
import config from "./config/index";
import { connectToDatabase } from "./src/db.mjs";

export async function register() {
    if (!mongoose?.connect) return;
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    await connectToDatabase();

    console.log("Connected to MongoDB");
    console.log("Seeding data");
    await seed();

    config.global.initialize();
}

async function seed() {
    for (const llm of config.data.llms) {
        await LLM.findOneAndUpdate({ name: llm.name }, llm, { upsert: true });
    }
}
