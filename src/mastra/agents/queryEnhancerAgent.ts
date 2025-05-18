export const QUERY_ENHANCER_AGENT_NAME = "queryEnhancerAgent";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { llmModel } from "../providers";

export const queryEnhancerAgent = new Agent({
  name: QUERY_ENHANCER_AGENT_NAME,
  model: llmModel,
  instructions: `You are an expert assistant analyzing user queries about a codebase.
First, classify the query type based on the user's intent:
1. Conceptual - Seeking explanations, 'how-to' guides, or understanding of concepts.
2. Code Location - Trying to find specific implementations, functions, classes, or files.
3. Example Request - Asking for usage examples, code snippets, or patterns.
4. Impact Analysis - Inquiring about the consequences of changes, dependencies, or relationships.

After classifying the query, generate a hypothetical document or code snippet that perfectly answers the query.
Focus on capturing the core concepts and likely structure of a relevant answer based on the classified type.
The generated text will be used for semantic search, so it should be representative of the information the user is seeking.
Generate only the hypothetical document/answer text, without any preamble or explanation.`,
  defaultGenerateOptions: {
    output: z.object({ hypotheticalDocument: z.string() }),
  },
});
