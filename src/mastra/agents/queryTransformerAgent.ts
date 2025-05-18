import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { llmModel } from "../providers"; // Assuming llmModel is suitable for this

export const QUERY_TRANSFORMER_AGENT_NAME = "queryTransformerAgent";

export const queryTransformerAgent = new Agent({
  name: QUERY_TRANSFORMER_AGENT_NAME,
  model: llmModel, // Or a specific model for query transformation
  instructions: `You are an expert query rewriter. Your task is to rewrite the given user query to be more effective for searching a codebase vector store.
Focus on using precise keywords, clarifying ambiguity, and structuring the query for better semantic matching.
Consider the 'Transformation Type' provided:
- If 'rewrite': Provide a single, improved query.
- If 'sub_queries': Decompose the complex query into 2-3 simpler, self-contained sub-queries. If the query is already simple, return it as the single rewritten query.
- If 'none' or unknown: Return the original query.

User Query: [User Query Here]
Transformation Type: [Transformation Type Here, e.g., 'rewrite', 'sub_queries']

Respond ONLY with the rewritten query string (or a JSON structure if handling sub-queries, though for now, a single string is expected by the workflow).
Example for 'rewrite':
User Query: how to use auth
Transformation Type: rewrite
Rewritten Query: "example implementation of authentication flow"

Example for 'sub_queries' (conceptual, current workflow expects single string):
User Query: explain auth and find user model
Transformation Type: sub_queries
Rewritten Query: (If outputting JSON: { "originalQuery": "...", "subQueries": ["explain authentication flow", "find user model class definition"] })
                 (If outputting single string for now: "explain authentication flow and find user model class definition")

For now, always output a single string for 'rewrittenQuery'.`,
  defaultGenerateOptions: {
    // The workflow currently expects a single string.
    // If sub-queries were fully implemented, this schema would change.
    output: z.object({ rewrittenQuery: z.string() }),
  },
});