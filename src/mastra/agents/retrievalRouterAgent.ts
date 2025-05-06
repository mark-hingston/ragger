export const RETRIEVAL_ROUTER_AGENT_NAME = "retrievalRouterAgent";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { llmModel } from "../providers";

export const retrievalDecisionSchema = z.object({
  strategy: z.enum(["basic", "metadata", "graph", "documentation", "example"])
    .describe(`The chosen retrieval strategy:
- 'basic': Default semantic search.
- 'metadata': Filtered search based on explicit file types, paths, function/class names mentioned in the query.
- 'graph': Use when the query asks about relationships, connections, or impacts between different code parts.
- 'documentation': Use when the query explicitly asks for explanations, 'how-to' guides, or conceptual information.
- 'example': Use when the query explicitly asks for code examples or usage patterns.`),
  filter: z
    .record(z.any())
    .nullable()
    .describe(
      `REQUIRED field. Valid Mastra/Qdrant filter syntax (e.g., { "source": { "$regex": "User.cs" } }). Use 'null' if no filter is applicable (e.g., for 'basic' or 'graph' strategies). Supported operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $and, $or, $not, $regex.`
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
    data.strategy === "graph" || data.strategy === "basic"
      ? data.filter === null
      : true,
  {
    message: "Filter must be null for graph/basic strategies",
    path: ["filter"], // Specify the path of the error
  }
);

export const retrievalRouterAgent = new Agent({
  name: RETRIEVAL_ROUTER_AGENT_NAME,
  model: llmModel,
  instructions: `You are an expert system analyzing user queries about a codebase to determine the BEST retrieval strategy for finding relevant information in a Qdrant vector store. Prioritise strategies that use specific information from the query.

1.  **metadata**: Filtered search. Use **ONLY** if the query explicitly mentions specific file types (e.g., ".cs", ".ts"), file names/paths (e.g., "src/components/Button.tsx"), function names, class names, or other specific code identifiers that can be reliably used in a filter. Construct a filter targeting the \`source\` field primarily. Use \`tags\` only if the query explicitly mentions tags or categories.
2.  **graph**: Relationship-based search. Use **ONLY** if the query explicitly asks about connections, dependencies, impacts, call graphs, or how different parts of the code relate to each other (e.g., "What uses function X?", "How does module Y interact with Z?", "Show the call chain for...").
3.  **example**: Code example search. Use **ONLY** if the query explicitly asks for a code snippet, usage example, or pattern (e.g., "Show me an example of using X", "What's the pattern for Y?"). Construct a filter using relevant \`tags\` like "Example" and tags related to the subject if possible.
4.  **documentation**: Documentation search. Use **ONLY** if the query explicitly asks for conceptual explanations, 'how-to' guides, setup instructions, or architectural overviews (e.g., "How do I configure X?", "Explain the purpose of Y", "Describe the auth flow"). Construct a filter using relevant \`tags\` like "Documentation" and tags related to the subject.
5.  **basic**: General semantic search. **Use this as the DEFAULT strategy** if the query asks a general question about the codebase (e.g., "What is X?", "Where is Y handled?", "List the Zs") and does NOT meet the strict criteria for \`metadata\`, \`graph\`, \`example\`, or \`documentation\`. **Always use \`filter: null\` for the \`basic\` strategy.**

**Filter Construction Rules:**
- If you choose \`metadata\`, \`example\`, or \`documentation\`, you MUST construct a valid filter object using **Mastra's MongoDB-style query syntax** (e.g., $eq, $ne, $regex, $in, $nin, $and, $or).
- Target \`source\` for file paths/names/types mentioned in the query. Use \`$regex\` for partial matches, escaping special characters (e.g., \`\\\.cs$\`). Use \`$eq\` for exact paths.
- Target \`tags\` for explicit categories mentioned or implied by \`example\`/\`documentation\` strategies.
- **IMPORTANT:** If the chosen strategy is \`basic\` or \`graph\`, the \`filter\` MUST be \`null\`. **DO NOT** generate a filter object for these strategies.

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

Analyse the user query provided and respond ONLY with a JSON object matching the specified schema. **Ensure the REQUIRED 'filter' field is correctly populated (either with a filter object or null) based *strictly* on the chosen strategy and rules above.** **Remember: \`filter\` must be \`null\` for 'basic' and 'graph' strategies.** Provide reasoning for your choice.`,
  defaultGenerateOptions: {
    output: retrievalDecisionSchema,
  },
});
