import { createGraphRAGTool } from "@mastra/rag";
import { env } from "../../config";
import { embeddingModel } from "../providers";
import { QDRANT_STORE_NAME } from "../../config";

export const graphRAGTool = createGraphRAGTool({
  id: "graphRAGTool",
  description: "Access and analyse relationships between information...",
  vectorStoreName: QDRANT_STORE_NAME,
  indexName: env.QDRANT_COLLECTION_NAME,
  model: embeddingModel,
  graphOptions: {
    dimension: env.EMBEDDING_DIMENSIONS,
    threshold: 0.7,
    randomWalkSteps: 100,
    restartProb: 0.15,
  },
});
