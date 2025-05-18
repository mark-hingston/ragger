import { createVectorQueryTool } from "@mastra/rag";
import { Tool } from "@mastra/core";
import { env } from "../../config";
import { rerankModel, embeddingModel } from "../providers";
import { QDRANT_STORE_NAME } from "../../config";
import { z } from "zod";

const sparseVectorSchema = z.object({
  name: z.string().describe("Name of the sparse vector (e.g., 'keyword_sparse')"),
  indices: z.array(z.number()).describe("Indices of the sparse vector"),
  values: z.array(z.number()).describe("Values of the sparse vector"),
}).optional();

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

const extendedInputSchema = (baseTool.inputSchema as z.ZodObject<any, any, any>).extend({
  querySparseVector: sparseVectorSchema.describe("Sparse vector for hybrid search. Provide this for hybrid search capabilities."),
});

export const vectorQueryTool: Tool<typeof extendedInputSchema, typeof baseTool.outputSchema> = {
  ...baseTool,
  id: "vectorQueryTool",
  description:
    "Performs a semantic search on a vector store based on the query text, potentially reranking results. Can also perform hybrid search if a sparse query vector is provided.",
  inputSchema: extendedInputSchema,
};
