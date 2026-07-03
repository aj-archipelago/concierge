import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const isDev = process.env.NODE_ENV !== "production";

loadEnvConfig(process.cwd(), isDev);
