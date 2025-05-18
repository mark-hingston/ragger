export const RAG_AGENT_NAME = "ragAgent";
import { Agent } from "@mastra/core/agent";
import { llmModel } from "../providers";

export const ragAgent = new Agent({
  name: RAG_AGENT_NAME,
  model: llmModel,
  instructions: `You are an expert assistant explaining a codebase.
Use the provided context snippets to answer the user's query accurately.
Synthesize the information clearly and concisely.
If the context does not contain the answer, state that the information is not available in the provided snippets.
Context snippets will be provided in the format:
File: [file_path]
\`\`\`
[code_snippet]
\`\`\`
---
`
});