import { Agent } from "@mastra/core/agent";
import { ragWorkflowTool } from "../tools/ragWorkflowTool";
import { rerankModel } from "../providers";
import { Memory } from "@mastra/memory";

export const workflowAgent = new Agent({
  name: "workflowAgent",
  memory: new Memory(),
  instructions: [
    "You MUST always use the 'triggerRagWorkflow' tool to process the user's query.",
    "Do not attempt to answer directly; always use the tool.",
  ].join("\n"),
  tools: {
    ragWorkflowTool,
  },
  model: rerankModel
});