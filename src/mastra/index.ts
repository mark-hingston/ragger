import { createLogger } from "@mastra/core/logger";
import { Mastra } from "@mastra/core";
import { QdrantVector } from "./qdrantVector";
import { env, QDRANT_STORE_NAME } from "../config";
import {
  ragAgent,
  evaluationAgent,
  retrievalRouterAgent,
  queryEnhancerAgent,
  retrievalAgent,
  workflowAgent
} from "./agents";
import { ragWorkflow } from "./workflows/ragWorkflow";

const qdrantStore = new QdrantVector({
  host: env.QDRANT_HOST!,
  port: env.QDRANT_PORT,
  apiKey: env.QDRANT_API_KEY,
  https: env.QDRANT_USE_HTTPS,
});

export const mastra = new Mastra({
  agents: {
    ragAgent,
    evaluationAgent,
    retrievalRouterAgent,
    queryEnhancerAgent,
    retrievalAgent,
    workflowAgent
  },
  vnext_workflows: {
    ragWorkflow,
  },
  vectors: { [QDRANT_STORE_NAME]: qdrantStore },
  logger: createLogger({ name: "Mastra", level: "debug" })
});
