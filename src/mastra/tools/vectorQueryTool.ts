import { createVectorQueryTool } from "@mastra/rag";
import { env } from "../../config";
import { llmModel, embeddingModel } from "../providers";
import { QDRANT_STORE_NAME } from "../../config";

export const vectorQueryTool = createVectorQueryTool({
  id: "vectorQueryTool",
  description:
    "Performs a semantic search on a vector store based on the query text, potentially reranking results.",
  vectorStoreName: QDRANT_STORE_NAME,
  indexName: env.QDRANT_COLLECTION_NAME,
  model: embeddingModel,
  enableFilter: true,
  reranker: {
    model: llmModel,
    options: {
      topK: 5,
      weights: {
        semantic: 0.4,
        vector: 0.4,
      },
    },
  },
});
