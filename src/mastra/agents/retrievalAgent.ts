import { Agent } from "@mastra/core/agent";
import { llmModel } from "../providers";
import { vectorQueryTool, graphRAGTool } from "../tools";
import { Memory } from "@mastra/memory";

const retrievalTools = {
  vectorQueryTool,
  graphRAGTool,
};

export const RETRIEVAL_AGENT_NAME = "retrievalAgent";

export const retrievalAgent = new Agent({
  name: RETRIEVAL_AGENT_NAME,
  model: llmModel,
  memory: new Memory(),
  instructions: `You are a tool execution agent. Your task is to execute the tool call requested by the system.
Your final output MUST be the raw result from the tool execution. Do NOT add any explanatory text, introductions, or summaries.`,
  tools: retrievalTools,
});