import mongoose from "mongoose";
import LLM from "./app/api/models/llm";
import config from "./config/index";

const { MONGO_URI } = process.env;

export function register() {
    mongoose
        .connect(MONGO_URI)
        .then(() => {
            console.log("Connected to MongoDB");

            console.log("Seeding data");
            seed();
        })
        .catch((err) => {
            console.error("Error connecting to MongoDB", err);
        });

    config.global.initialize();
}

async function seed() {
    // seed data
    for (const llm of config.data.llms) {
        await LLM.findOneAndUpdate({ name: llm.name }, llm, { upsert: true });
    }
}
