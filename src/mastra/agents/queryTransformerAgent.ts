import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { llmModel } from "../providers";

export const QUERY_TRANSFORMER_AGENT_NAME = "queryTransformerAgent";

export const queryTransformerAgent = new Agent({
  name: QUERY_TRANSFORMER_AGENT_NAME,
  model: llmModel,
  instructions: `You are an expert query rewriter. Your task is to rewrite a user query to be more effective for searching a codebase vector store.
Focus on using precise keywords, clarifying ambiguity, and structuring the query for better semantic matching.
Consider the 'Transformation Type' that will be provided:
- If 'rewrite': Provide a single, improved query.
- If 'sub_queries': Decompose the complex query into 2-3 simpler, self-contained sub-queries. If the query is already simple, return it as the single rewritten query.
- If 'none' or unknown: Return the original query.

Respond ONLY with the rewritten query string.
Example for 'rewrite':
User Query: how to use auth
Transformation Type: rewrite
Rewritten Query: "example implementation of authentication flow"

Example for 'sub_queries':
User Query: explain auth and find user model
Transformation Type: sub_queries
Rewritten Query: (If outputting JSON: { "originalQuery": "...", "subQueries": ["explain authentication flow", "find user model class definition"] })
                  (If outputting single string for now: "explain authentication flow and find user model class definition")

`,
  defaultGenerateOptions: {
    output: z.object({ rewrittenQuery: z.string() }),
  },
});