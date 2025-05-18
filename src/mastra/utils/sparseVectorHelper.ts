// Helper for vocabulary loading and query processing logic for sparse vectors.
// Replicates the token processing pipeline from the 'embedder' project's VocabularyBuilder.
import fs from 'fs/promises';
import path from 'path';
import natural from 'natural'; // Import natural for stemming
const PorterStemmer = natural.PorterStemmer; // Use PorterStemmer
import { processTokenText } from './tokenProcessor';

// This is the vocabulary structure from the embedder project
interface Vocabulary {
  [term: string]: number;
}

// Replicate the default set of stop words from embedder/src/vocabularyBuilder.ts
const DEFAULT_STOP_WORDS: Set<string> = new Set([
  // Common English stop words (reduced set)
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "if", "in", "into", "is", "it", "its", "no", "not", "of", "on", "or", "such", "that", "the", "their", "then", "there", "these", "they", "this", "to", "was", "will", "with", "about", "after", "all", "also", "am", "any", "because", "been", "before", "being", "can", "could", "did", "do", "does", "doing", "from", "further", "had", "has", "have", "he", "her", "here", "him", "his", "how", "however", "i", "just", "let", "me", "my", "myself", "nor", "our", "ours", "ourselves", "out", "over", "own", "same", "she", "should", "so", "some", "than", "thats", "them", "themselves", "those", "though", "through", "thus", "too", "us", "very", "we", "were", "what", "when", "where", "which", "while", "who", "whom", "why", "would", "you", "your", "yours", "yourself", "yourselves", "yet",
  "test", "month",

  // Minimal programming-related terms likely to be noise
  "obj", "cpu", "commo", "utilitie",
  "trin", "pguk", "eac", "pgsa", // Project-specific noise?

  // Test-Specific Terms and Common Low-Signal Words (many should be filtered by length or are actual stop words)
  "tobeinthedocument", "tohavebeencalled", "tobevisible", "tobehidden", "userevent", "expect", "div", "span", "id",
  "includeassets", "buildtransitive", "runtime", "screen", "page", "locator", "purchasepage", "valid_card_details", "styledth", "styledtd",
]);


// Helper function to split camelCase and snake_case words (from embedder/src/vocabularyBuilder.ts)
function splitCompoundIdentifier(token: string): string[] {
  if (token.includes('-') || token.includes('_')) { // Handle snake_case and kebab-case
    return token.split(/[-_]/).filter(t => t.length > 0);
  }
  // Split camelCase: Credit to https://stackoverflow.com/a/76279304/1089576
  const words = token.match(/([A-Z_]?([a-z0-9]+)|[A-Z_]+)/g);
  return words ? words.map(w => w.replace(/^_/, '')) : [token];
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
 * This function mirrors the token processing pipeline of the 'embedder' project's VocabularyBuilder
 * to ensure consistency for hybrid search.
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

  const tokensToProcessInitially: string[] = [];
  // Simple split by whitespace and normalize newlines for initial tokens from query string
  const rawTokens = query
    .replace(/[\r\n]+/g, " ") // Normalize newlines to space
    .split(/\s+/) // Split by whitespace
    .filter(t => t.trim().length > 0);

  tokensToProcessInitially.push(...rawTokens);

  const processedTokensFinal: string[] = [];
  const stemmer = PorterStemmer; // Use the imported stemmer

  for (const originalToken of tokensToProcessInitially) {
    let tokensForCompoundSplitting: string[];
    // Apply compound splitting to tokens that look like identifiers and are reasonably long
    if (/^[a-zA-Z0-9]+([-_][a-zA-Z0-9]+)*$|^[a-z]+([A-Z][a-zA-Z0-9]*)+[a-zA-Z0-9]*$/.test(originalToken) && originalToken.length > 4) {
      tokensForCompoundSplitting = splitCompoundIdentifier(originalToken);
    } else {
      tokensForCompoundSplitting = [originalToken];
    }

    for (let tokenPartFromCompound of tokensForCompoundSplitting) {
      const dotParts = tokenPartFromCompound.split('.'); // Split by dot
      for (const dotPart of dotParts) {
        if (dotPart.length === 0) continue;

        let cleanedSubToken = dotPart.toLowerCase();

        // Decode unicode escape sequences like \\uXXXX
        try {
          cleanedSubToken = cleanedSubToken.replace(
            /\\\\u([0-9a-fA-F]{4})/g,
            (match, grp) => String.fromCharCode(parseInt(grp, 16))
          );
        } catch (e) { /* ignore encoding errors */ }

        // Normalize newlines within the token (again, just in case) and trim
        cleanedSubToken = cleanedSubToken.replace(/[\r\n]+/g, " ").trim();

        // General cleaning of leading/trailing non-alphanumeric (but keep @#$_ internally for things like CSS vars or specific identifiers)
        cleanedSubToken = cleanedSubToken.replace(/^[^a-z0-9@#$_]+|[^a-z0-9@#$_]+$/g, "");
        // Remove any leading underscores that might remain or be part of the original token
        cleanedSubToken = cleanedSubToken.replace(/^_+/, "");

        // --- SPECIALIZED FILTERS (Applied after basic cleaning, before general stop word/length checks) ---

        // Filter for attribute-like tokens, e.g. name="value", name=\"value\"
        // or fragments like name="value (if trailing quote was stripped by previous cleaning)
        if (cleanedSubToken.includes('="') || cleanedSubToken.includes('=\\"')) {
          continue;
        }

        // Filter for <tag> style tokens (simple complete ones like <summary> or <br/>)
        if (/^<[a-zA-Z0-9_:\-\.\/]+>$/.test(cleanedSubToken)) {
            continue;
        }

        // Filter for tokens containing markup characters (<, >) mixed with other content or partial tags
        if (/[<>]/.test(cleanedSubToken)) {
            const knownOperatorsWithMarkup = /^(?:=>|<=|>=|->)$/; // Add others if necessary
            if (DEFAULT_STOP_WORDS.has(cleanedSubToken) || knownOperatorsWithMarkup.test(cleanedSubToken)) {
                // It's a stop word (like "=>") or a known operator. Let it pass.
            } else {
                // It contains < or > and is not a recognized operator/stopword. Likely fragment.
                continue;
            }
        }

        // Filter tokens with internal brackets/braces/parentheses if they don't fully enclose the token
        if (/[()\[\]{}]/.test(cleanedSubToken) && !cleanedSubToken.startsWith("(") && !cleanedSubToken.endsWith(")")) {
          continue;
        }
        // Filter relative paths like ../../file.txt or ./src
        if (/^(?:\.\.\/|\.\/)+[\w\-\/\.]+$/.test(cleanedSubToken)) {
            continue;
        }
        // Filter numbers ending with punctuation like "123," or "456;"
        if (/^[0-9]+[;,]$/.test(cleanedSubToken)) {
            continue;
        }

        // Filter for specific JSON-like fragments
        if (
          cleanedSubToken.includes('":"') &&
          cleanedSubToken.includes('","') &&
          (cleanedSubToken.includes(":0") || cleanedSubToken.includes(":1"))
        ) {
          if (
            cleanedSubToken.length > 30 ||
            cleanedSubToken.includes("term_plural") ||
            cleanedSubToken.includes("fuzzy") ||
            cleanedSubToken.includes('context":""')
          ) {
            continue;
          }
        }

        // --- PRIMARY FILTERING (Stop words, pure numbers, very short tokens on *cleaned* token) ---
        if (
          DEFAULT_STOP_WORDS.has(cleanedSubToken) ||
          /^\d+(\.\d+)?$/.test(cleanedSubToken) || // Is purely numeric
          cleanedSubToken.length <= 1 // Filter single characters
        ) {
          continue;
        }

        let stemmedToken = cleanedSubToken;
        // Only stem if the token is reasonably long
        if (stemmer && stemmedToken.length > 2) {
          try {
            stemmedToken = stemmer.stem(stemmedToken);
          } catch (e) {
            console.warn(`Stemming failed for token '${cleanedSubToken}' (original) -> '${stemmedToken}': ${e}`);
          }
        }

        // --- FINAL FILTERING (Stop words on *stemmed* token, length) ---
        if (
          DEFAULT_STOP_WORDS.has(stemmedToken) ||
          stemmedToken.length <= 2 // Filter 1 and 2 letter words
        ) {
          continue;
        }
        processedTokensFinal.push(stemmedToken);
      } // Closes for (const dotPart of dotParts)
    } // end loop over tokenPartFromCompound
  } // end loop over originalToken


  const termFrequencies: { [term: string]: number } = {};
  for (const token of processedTokensFinal) {
    termFrequencies[token] = (termFrequencies[token] || 0) + 1;
  }

  const indices: number[] = [];
  const values: number[] = [];

  for (const term in termFrequencies) {
    if (vocabulary[term] !== undefined) {
      indices.push(vocabulary[term]);
      values.push(termFrequencies[term]); // Use term frequency as value
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