// Helper for vocabulary loading and query processing logic for sparse vectors.
import fs from 'fs/promises';
import path from 'path';
import { processTextToFinalTokens } from "./tokenProcessor";
import { BlobClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { env } from '../../config';

interface Vocabulary {
  [term: string]: number;
}

// Helper function to convert a readable stream to a buffer, then to a string
async function streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        readableStream.on('data', (data) => {
            chunks.push(data instanceof Buffer ? data : Buffer.from(data));
        });
        readableStream.on('end', () => {
            resolve(Buffer.concat(chunks).toString('utf-8'));
        });
        readableStream.on('error', reject);
    });
}

/**
 * Loads the vocabulary from a JSON file (local or Azure Blob URL).
 * @param filePathOrUrl Path to the vocabulary.json file or a URL to the blob.
 * @returns The loaded vocabulary or undefined if an error occurs.
 */
export async function loadVocabulary(filePathOrUrl: string): Promise<Vocabulary | undefined> {
  try {
    if (filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://')) {
      console.log(`[SparseHelper] Attempting to load vocabulary from URL: ${filePathOrUrl}`);
      let blobClient: BlobClient;

      if (env.AZURE_STORAGE_ACCOUNT_NAME && env.AZURE_STORAGE_ACCOUNT_KEY) {
        const accountName = env.AZURE_STORAGE_ACCOUNT_NAME;
        const accountKey = env.AZURE_STORAGE_ACCOUNT_KEY;
        const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

        // Parse the URL to get container and blob name
        const url = new URL(filePathOrUrl);
        const parts = url.pathname.split('/').filter(p => p.length > 0);
        if (parts.length < 2) {
          throw new Error('Invalid Azure Blob Storage URL format for shared key authentication. Expected format: https://<account>.blob.core.windows.net/<container>/<blob>');
        }
        const containerName = parts[0];
        const blobName = parts.slice(1).join('/');

        blobClient = new BlobClient(
          `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}`,
          sharedKeyCredential
        );
        console.log(`[SparseHelper] Using shared key authentication for blob: ${blobName} in container: ${containerName}`);
      } else {
        // Assumes the URL is publicly accessible or includes a SAS token
        blobClient = new BlobClient(filePathOrUrl);
        console.log(`[SparseHelper] Using URL-based authentication (public or SAS token) for: ${filePathOrUrl}`);
      }

      const downloadBlockBlobResponse = await blobClient.download(0);

      if (!downloadBlockBlobResponse.readableStreamBody) {
        throw new Error('Blob download stream is undefined.');
      }

      const data = await streamToString(downloadBlockBlobResponse.readableStreamBody);
      const vocabulary = JSON.parse(data) as Vocabulary;
      console.log(`[SparseHelper] Successfully loaded vocabulary from URL with ${Object.keys(vocabulary).length} terms.`);
      return vocabulary;
    } else {
      const fullPath = path.resolve(filePathOrUrl);
      console.log(`[SparseHelper] Attempting to load vocabulary from local file: ${fullPath}`);
      const data = await fs.readFile(fullPath, 'utf-8');
      const vocabulary = JSON.parse(data) as Vocabulary;
      console.log(`[SparseHelper] Successfully loaded vocabulary from local file with ${Object.keys(vocabulary).length} terms.`);
      return vocabulary;
    }
  } catch (error) {
    console.error(`[SparseHelper] Error loading vocabulary from ${filePathOrUrl}:`, error);
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