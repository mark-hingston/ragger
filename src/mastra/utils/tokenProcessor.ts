import { PorterStemmer } from 'natural';

/**
 * Default stop words set used during token processing.
 */
const DEFAULT_STOP_WORDS = [
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'in', 'on', 'with', 'to', 'from'
];

/**
 * Splits compound identifiers and dot-separated tokens.
 * This function splits camelCase, underscores, and dot-delimited words.
 */
function splitCompoundIdentifier(token: string): string[] {
  // Split based on underscores and dots.
  const parts = token.split(/[_\.]/);
  // Further split camelCase within each part.
  return parts.flatMap(part => part.split(/(?=[A-Z])/));
}

/**
 * Processes raw text into a list of normalized, filtered, split, and stemmed tokens.
 *
 * @param text The raw input text.
 * @returns An array of final tokens.
 */
export function processTokenText(text: string): string[] {
  // Normalize text.
  const lower = text.toLowerCase();
  // Basic cleaning: remove non-alphanumeric characters except dots.
  const cleaned = lower.replace(/[^a-z0-9.\s]+/g, ' ');
  // Split text into raw tokens by whitespace.
  const rawTokens = cleaned.split(/\s+/).filter(t => t.length > 0);
  // Remove default stop words.
  const tokensWithoutStop = rawTokens.filter(token => !DEFAULT_STOP_WORDS.includes(token));
  
  // Further process tokens: split compound identifiers and filter by length.
  const finalTokens: string[] = [];
  tokensWithoutStop.forEach(token => {
    const splits = splitCompoundIdentifier(token);
    splits.forEach(tok => {
      if (tok.length > 2) { // length filtering; adjust as needed.
        finalTokens.push(PorterStemmer.stem(tok));
      }
    });
  });
  return finalTokens;
}