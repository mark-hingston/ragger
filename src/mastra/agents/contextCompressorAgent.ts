import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { llmModel } from "../providers"; // Assuming llmModel is suitable

export const CONTEXT_COMPRESSOR_AGENT_NAME = "contextCompressorAgent";

export const contextCompressorAgent = new Agent({
  name: CONTEXT_COMPRESSOR_AGENT_NAME,
  model: llmModel, // Or a specific model for summarization/extraction
  instructions: `You are an expert at extracting relevant information.
Given the User Query and the following Context Snippet, extract *only* the sentences or lines from the Snippet that are directly relevant to answering the User Query.
Maintain the original wording and code formatting as much as possible.
If no part of the Snippet is relevant, output an empty string.

User Query: [User Query Here]
Context Snippet (from file [File Path Here]):
[Context Snippet Content Here]

Respond ONLY with the relevant parts of the snippet. Do not add any explanation.`,
  defaultGenerateOptions: {
    output: z.object({ compressedSnippet: z.string() }),
  },
});