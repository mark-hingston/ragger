import { createVectorQueryTool } from "@mastra/rag";
import { Tool } from "@mastra/core";
import { env } from "../../config";
import { rerankModel, embeddingModel } from "../providers";
import { QDRANT_STORE_NAME } from "../../config";
import { z } from "zod";

// Define the sparse vector schema
const sparseVectorSchema = z.object({
  name: z.string().describe("Name of the sparse vector (e.g., 'keyword_sparse')"),
  indices: z.array(z.number()).describe("Indices of the sparse vector"),
  values: z.array(z.number()).describe("Values of the sparse vector"),
}).optional();

// Create the base tool using the original configuration
const baseTool = createVectorQueryTool({
  // id and description will be set on the wrapped tool,
  // inputSchema will be extended from this base tool.
  vectorStoreName: QDRANT_STORE_NAME,
  indexName: env.QDRANT_COLLECTION_NAME,
  model: embeddingModel,
  enableFilter: true,
  reranker: {
    model: rerankModel,
    options: {
      topK: env.RERANKER_TOP_K
    },
  },
});

// Extend the input schema from the base tool to include sparseVector
// We assume baseTool.inputSchema is a Zod object schema.
// If baseTool.inputSchema is undefined or not a Zod object, this will error.
// A more robust solution might involve checking baseTool.inputSchema structure.
const extendedInputSchema = (baseTool.inputSchema as z.ZodObject<any, any, any>).extend({
  querySparseVector: sparseVectorSchema.describe("Sparse vector for hybrid search. Provide this for hybrid search capabilities."),
});

// Create and export the wrapped tool with the extended schema
export const vectorQueryTool: Tool<typeof extendedInputSchema, typeof baseTool.outputSchema> = {
  ...baseTool, // Spread properties from baseTool (like 'run', 'outputSchema')
  id: "vectorQueryTool", // Explicitly set the final ID
  description:
    "Performs a semantic search on a vector store based on the query text, potentially reranking results. Can also perform hybrid search if a sparse query vector is provided.", // Explicitly set the final description
  inputSchema: extendedInputSchema, // Override with the extended input schema
};
