// Helper for vocabulary loading and query processing logic for sparse vectors.
import fs from 'fs/promises';
import path from 'path';
import { processTextToFinalTokens } from "./tokenProcessor"

interface Vocabulary {
  [term: string]: number;
}


/**
 * Loads the vocabulary from a JSON file.
 * @param filePath Path to the vocabulary.json file.
 * @returns The loaded vocabulary or undefined if an error occurs.
 */
export async function loadVocabulary(filePath: string): Promise<Vocabulary | undefined> {
  try {
    const fullPath = path.resolve(filePath);
    console.log(`[SparseHelper] Attempting to load vocabulary from: ${fullPath}`);
    const data = await fs.readFile(fullPath, 'utf-8');
    const vocabulary = JSON.parse(data) as Vocabulary;
    console.log(`[SparseHelper] Successfully loaded vocabulary with ${Object.keys(vocabulary).length} terms.`);
    return vocabulary;
  } catch (error) {
    console.error(`[SparseHelper] Error loading vocabulary from ${filePath}:`, error);
    return undefined;
  }
}

/**
 * Processes a query string to generate a sparse vector representation.
 * @param query The user query string.
 * @param vocabulary The loaded vocabulary.
 * @param sparseVectorName The name for the sparse vector (e.g., 'keyword_sparse').
 * @returns A sparse vector object or undefined if no terms are found.
 */
export function processQueryForSparseVector(
  query: string,
  vocabulary: Vocabulary,
  sparseVectorName: string
): { name: string; indices: number[]; values: number[] } | undefined {
  if (!query || !vocabulary) {
    return undefined;
  }

  const processedTokensFinal: string[] = processTextToFinalTokens(query);

  const termFrequencies: { [term: string]: number } = {};
  for (const token of processedTokensFinal) {
    termFrequencies[token] = (termFrequencies[token] || 0) + 1;
  }

  const indices: number[] = [];
  const values: number[] = [];

  for (const term in termFrequencies) {
    if (vocabulary[term] !== undefined) {
      indices.push(vocabulary[term]);
      values.push(termFrequencies[term]);
    }
  }

  if (indices.length === 0) {
    console.log(`[SparseHelper] No query terms found in vocabulary for query: "${query}"`);
    return undefined;
  }

  return {
    name: sparseVectorName,
    indices,
    values,
  };
}