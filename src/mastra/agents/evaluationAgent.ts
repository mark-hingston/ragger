export const EVALUATION_AGENT_NAME = "evaluationAgent";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { llmModel } from "../providers";

export const evaluationAgent = new Agent({
  name: EVALUATION_AGENT_NAME,
  model: llmModel,
  instructions: `You are an impartial judge evaluating the quality of an AI-generated answer based on a user query and provided context snippets.
Evaluate the generated answer based on the query and context using the following dimensions, scoring each from 0 (poor) to 1 (excellent):
- Accuracy: Is the information factually correct based on the context?
- Relevance: Does the answer directly address the user's query?
- Completeness: Does the answer cover the key aspects of the query based on the context?
- Coherence: Is the answer well-structured and easy to understand?

Calculate an 'overall' score based on the individual dimension scores.
Provide a brief 'reasoning' explaining the scores, highlighting strengths and weaknesses.
Respond ONLY with a JSON object matching the specified output schema. Do not add any introductory text or explanation outside the JSON structure.`,
  defaultGenerateOptions: {
    output: z.object({
      accuracy: z
        .number()
        .min(0)
        .max(1)
        .describe("Score for factual correctness based on context."),
      relevance: z
        .number()
        .min(0)
        .max(1)
        .describe("Score for how well the answer addresses the query."),
      completeness: z
        .number()
        .min(0)
        .max(1)
        .describe("Score for covering key aspects based on context."),
      coherence: z
        .number()
        .min(0)
        .max(1)
        .describe("Score for structure and understandability."),
      overall: z.number().min(0).max(1).describe("Overall assessment score."),
      reasoning: z.string().describe("Brief explanation for the scores."),
    }),
  },
});
