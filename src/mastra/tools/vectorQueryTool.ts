import { createVectorQueryTool } from "@mastra/rag";
import { env } from "../../config";
import { rerankModel, embeddingModel } from "../providers";
import { QDRANT_STORE_NAME } from "../../config";
import { z } from "zod"; // Import Zod

// Define the sparse vector schema
const sparseVectorSchema = z.object({
  name: z.string().describe("Name of the sparse vector (e.g., 'keyword_sparse')"),
  indices: z.array(z.number()).describe("Indices of the sparse vector"),
  values: z.array(z.number()).describe("Values of the sparse vector"),
}).optional();


export const vectorQueryTool = createVectorQueryTool({
  id: "vectorQueryTool",
  description:
    "Performs a semantic search on a vector store based on the query text, potentially reranking results. Can also perform hybrid search if a sparse query vector is provided.",
  vectorStoreName: QDRANT_STORE_NAME,
  indexName: env.QDRANT_COLLECTION_NAME,
  model: embeddingModel,
  enableFilter: true,
  // Add sparseQueryVector to the input schema of the tool
  reranker: {
    model: rerankModel,
    options: {
      topK: env.RERANKER_TOP_K
    },
  },
});
