export const RETRIEVAL_ROUTER_AGENT_NAME = "retrievalRouterAgent";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { llmModel } from "../providers";

export const retrievalDecisionSchema = z.object({
  strategy: z.enum(["basic", "metadata", "graph", "documentation", "example", "hierarchical"]) // R2.1: Added 'hierarchical'
    .describe(`The chosen retrieval strategy:
- 'basic': Default semantic search.
- 'metadata': Filtered search based on explicit file types, paths, function/class names, or 'documentType' (e.g., 'file_summary', 'chunk_detail') mentioned in the query.
- 'graph': Use when the query asks about relationships, connections, or impacts between different code parts.
- 'documentation': Use when the query explicitly asks for explanations, 'how-to' guides, or conceptual information.
- 'example': Use when the query explicitly asks for code examples or usage patterns.
- 'hierarchical': Use for broad queries about a module or file's overall purpose, or when a multi-step search (summaries then chunks) seems beneficial.`),
  filter: z
    .record(z.any())
    .nullable()
    .describe(
      `REQUIRED field. Valid Mastra/Qdrant filter syntax (e.g., { "source": { "$regex": "User.cs" } }). Use 'null' if no filter is applicable (e.g., for 'basic', 'graph', or initial 'hierarchical' summary search). Supported operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $and, $or, $not, $regex.`
    ),
  reasoning: z
    .string()
    .optional()
    .describe(
      "Brief explanation for the chosen strategy and filter."
    ),
    confidence: z
      .number()
      .optional()
      .describe("Optional confidence score for the decision (0.0 to 1.0)."),
}).refine(
  (data) =>
    data.strategy === "graph" || data.strategy === "basic" || data.strategy === "hierarchical" // R2.1: Hierarchical might start with null filter for summaries
      ? data.filter === null // This refine might need adjustment if hierarchical needs an initial filter for summaries
      : true,
  {
    // R2.1: Adjusted message for hierarchical
    message: "Filter must be null for graph/basic strategies. For hierarchical, filter is for the initial summary search and can be null.",
    path: ["filter"],
  }
);

export const retrievalRouterAgent = new Agent({
  name: RETRIEVAL_ROUTER_AGENT_NAME,
  model: llmModel,
  instructions: `You are an expert system analyzing user queries about a codebase to determine the BEST retrieval strategy for finding relevant information in a Qdrant vector store. Prioritise strategies that use specific information from the query.

1.  **hierarchical**: Two-step search. Use for broad queries about a module's or file's overall purpose, or when a general understanding is needed before diving into details (e.g., "What is the general architecture of the auth module?", "Tell me about PaymentProcessor.cs"). The initial filter (for summaries) should generally be \`null\` or target \`documentType: 'file_summary'\` if the query implies it.
2.  **metadata**: Filtered search. Use **ONLY** if the query explicitly mentions specific file types (e.g., ".cs", ".ts"), file names/paths (e.g., "src/components/Button.tsx"), function names, class names, or other specific code identifiers that can be reliably used in a filter. Also use if the query implies filtering by \`documentType\` (e.g., "search only in file summaries"). Construct a filter targeting the \`source\` or \`documentType\` field primarily. Use \`tags\` only if the query explicitly mentions tags or categories.
3.  **graph**: Relationship-based search. Use **ONLY** if the query explicitly asks about connections, dependencies, impacts, call graphs, or how different parts of the code relate to each other (e.g., "What uses function X?", "How does module Y interact with Z?", "Show the call chain for...").
4.  **example**: Code example search. Use **ONLY** if the query explicitly asks for a code snippet, usage example, or pattern (e.g., "Show me an example of using X", "What's the pattern for Y?"). Construct a filter using relevant \`tags\` like "Example" and tags related to the subject if possible.
5.  **documentation**: Documentation search. Use **ONLY** if the query explicitly asks for conceptual explanations, 'how-to' guides, setup instructions, or architectural overviews (e.g., "How do I configure X?", "Explain the purpose of Y", "Describe the auth flow"). Construct a filter using relevant \`tags\` like "Documentation" and tags related to the subject.
6.  **basic**: General semantic search. **Use this as the DEFAULT strategy** if the query asks a general question about the codebase (e.g., "What is X?", "Where is Y handled?", "List the Zs") and does NOT meet the strict criteria for other strategies. **Always use \`filter: null\` for the \`basic\` strategy.**

**Filter Construction Rules:**
- If you choose \`metadata\`, \`example\`, or \`documentation\`, you MUST construct a valid filter object using **Mastra's MongoDB-style query syntax** (e.g., $eq, $ne, $regex, $in, $nin, $and, $or).
- Target \`source\` for file paths/names/types. Use \`$regex\` for partial matches, escaping special characters (e.g., \`\\\.cs$\`). Use \`$eq\` for exact paths.
- Target \`documentType\` for 'file_summary' or 'chunk_detail' if specified.
- Target \`tags\` for explicit categories mentioned or implied by \`example\`/\`documentation\` strategies.
- Target \`summary\` (using \`$regex\`) if the query asks to find files/chunks based on keywords in their summaries.
- **IMPORTANT:** If the chosen strategy is \`basic\`, \`graph\`, or \`hierarchical\` (for its initial summary search phase), the \`filter\` MUST be \`null\`. **DO NOT** generate a filter object for these strategies unless \`hierarchical\` specifically needs to filter summaries.

**Examples:**

*   **User Query:** "Find the definition of the "User" class in "models/User.cs"
    *   **Output:** \`{ "strategy": "metadata", "filter": { "source": { "$regex": "models/User\\\\.cs$" } }, "reasoning": "Query specifies a file path and class name.", "confidence": 0.95 }\`
*   **User Query:** "Show me React components related to authentication"
    *   **Output:** \`{ "strategy": "metadata", "filter": { "$and": [ { "tags": { "$in": ["React Component"] } }, { "tags": { "$in": ["Authentication"] } } ] }, "reasoning": "Query asks for specific tagged elements.", "confidence": 0.8 }\`
*   **User Query:** "How do I set up logging?"
    *   **Output:** \`{ "strategy": "documentation", "filter": { "tags": { "$in": ["Documentation", "Logging"] } }, "reasoning": "Query asks 'how-to', indicating documentation.", "confidence": 0.9 }\`
*   **User Query:** "Give me an example of using the Button component"
    *   **Output:** \`{ "strategy": "example", "filter": { "tags": { "$in": ["Example", "Button"] } }, "reasoning": "Query asks for an 'example'.", "confidence": 0.9 }\`
*   **User Query:** "What does the \`processPayment\` function do?"
    *   **Output:** \`{ "strategy": "basic", "filter": null, "reasoning": "General question about a function's purpose, no specific file path or relationship query.", "confidence": 0.7 }\`
*   **User Query:** "What brands are supported by the Web API?"
    *   **Output:** \`{ "strategy": "basic", "filter": null, "reasoning": "General question asking to list items ('brands'), does not specify file/path, relationships, examples, or explicit documentation request.", "confidence": 0.75 }\`
*   **User Query:** "What calls the \`calculateTotal\` method?"
    *   **Output:** \`{ "strategy": "graph", "filter": null, "reasoning": "Query asks about callers ('What calls...'), indicating a relationship query suitable for graph.", "confidence": 0.9 }\`
*   **User Query:** "Tell me about the main services in this application."
    *   **Output:** \`{ "strategy": "hierarchical", "filter": null, "reasoning": "Broad query about main services, suitable for hierarchical search starting with summaries.", "confidence": 0.85 }\`
*   **User Query:** "Find file summaries that mention 'payment processing'."
    *   **Output:** \`{ "strategy": "metadata", "filter": { "must": [{ "key": "documentType", "match": { "value": "file_summary" }}, {"key": "summary", "match": {"text": "payment processing" }}]}, "reasoning": "Query asks for file summaries filtered by keywords in the summary text.", "confidence": 0.9 }\`


Analyse the user query provided and respond ONLY with a JSON object matching the specified schema. **Ensure the REQUIRED 'filter' field is correctly populated (either with a filter object or null) based *strictly* on the chosen strategy and rules above.** **Remember: \`filter\` must be \`null\` for 'basic', 'graph', and typically the initial phase of 'hierarchical' strategies.** Provide reasoning for your choice.`,
  defaultGenerateOptions: {
    output: retrievalDecisionSchema,
  },
});
