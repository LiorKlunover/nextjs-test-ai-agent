/**
 * RAG Actions Module
 * 
 * This module provides Convex actions for the RAG (Retrieval-Augmented Generation) system.
 * It handles document embedding, vector similarity search, and AI-powered chat responses
 * using Google's Generative AI models.
 * 
 * Key Features:
 * - Document chunking and embedding using Google's embedding model
 * - Vector similarity search using Convex's built-in vector search
 * - Context-aware chat responses using Gemini 2.5 Flash
 * - Document deletion and management
 * 
 * Environment Variables Required:
 * - GOOGLE_API_KEY: API key for Google Generative AI services
 * 
 * @module ragActions
 */

import { v } from "convex/values";
import { action } from "./_generated/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { api, internal } from "./_generated/api";
import { buildRagChatPrompt } from "./prompts";

/**
 * Generate embeddings for text using Google's embedding model
 * 
 * Uses the gemini-embedding-001 model to convert text into a 768-dimensional
 * vector representation. This is used for both document chunks and user queries
 * to enable semantic similarity search.
 * 
 * @param text - The text to embed
 * @returns Promise resolving to a 768-dimensional embedding vector
 * 
 * @throws Error if the Google API key is invalid or the API request fails
 * 
 * @example
 * ```typescript
 * const embedding = await generateEmbedding("What are the gym hours?");
 * console.log(embedding.length); // 768
 * ```
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  
  const result = await model.embedContent(text);
  return result.embedding.values;
}

/**
 * Split text into overlapping chunks for embedding
 * 
 * Implements a simple text splitting algorithm that:
 * 1. Breaks text into chunks of approximately `chunkSize` characters
 * 2. Attempts to break at sentence boundaries (periods or newlines) for better context
 * 3. Maintains overlap between chunks to preserve context across boundaries
 * 
 * This implementation is designed to work in the Convex runtime environment
 * without dependencies on Node.js-specific APIs.
 * 
 * @param text - The text to split into chunks
 * @param chunkSize - Target size for each chunk in characters (default: 1000)
 * @param chunkOverlap - Number of characters to overlap between chunks (default: 200)
 * @returns Array of text chunks
 * 
 * @example
 * ```typescript
 * const chunks = splitText(documentContent, 1000, 200);
 * console.log(`Split into ${chunks.length} chunks`);
 * ```
 */
function splitText(text: string, chunkSize: number = 1000, chunkOverlap: number = 200): string[] {
  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + chunkSize, text.length);
    let chunk = text.substring(startIndex, endIndex);

    // Try to break at sentence boundaries if not at the end
    if (endIndex < text.length) {
      const lastPeriod = chunk.lastIndexOf('. ');
      const lastNewline = chunk.lastIndexOf('\n');
      const breakPoint = Math.max(lastPeriod, lastNewline);
      
      if (breakPoint > chunkSize / 2) {
        chunk = chunk.substring(0, breakPoint + 1);
        startIndex += breakPoint + 1;
      } else {
        startIndex += chunkSize - chunkOverlap;
      }
    } else {
      startIndex = text.length;
    }

    if (chunk.trim().length > 0) {
      chunks.push(chunk.trim());
    }
  }

  return chunks;
}

/**
 * Embed a document and store it in the vector database
 * 
 * This action performs the complete document ingestion workflow:
 * 1. Splits the document into overlapping chunks (1000 chars with 200 char overlap)
 * 2. Generates embeddings for each chunk using Google's embedding model
 * 3. Stores each chunk with its embedding and metadata in the database
 * 
 * The process is logged to the console for monitoring and debugging.
 * 
 * @param fileName - Name of the file being embedded
 * @param content - Full text content of the document
 * 
 * @returns Promise resolving to:
 *   - success: true if embedding succeeded, false otherwise
 *   - chunksCreated: Number of chunks created (on success)
 *   - fileName: Name of the embedded file (on success)
 *   - error: Error message (on failure)
 * 
 * @example
 * ```typescript
 * const result = await ctx.runAction(api.ragActions.embedDocument, {
 *   fileName: "company-policy.txt",
 *   content: "Our company policy states..."
 * });
 * 
 * if (result.success) {
 *   console.log(`Created ${result.chunksCreated} chunks for ${result.fileName}`);
 * } else {
 *   console.error(`Embedding failed: ${result.error}`);
 * }
 * ```
 */
export const embedDocument = action({
  args: {
    fileName: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    chunksCreated?: number;
    fileName?: string;
    error?: string;
  }> => {
    try {
      console.log(`📄 Processing document: ${args.fileName}`);
      
      const chunks: string[] = splitText(args.content, 1000, 200);
      console.log(`✂️  Split into ${chunks.length} chunks`);
      
      const totalChunks: number = chunks.length;
      const uploadedAt: string = new Date().toISOString();
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk: string = chunks[i];
        
        console.log(`🔢 Embedding chunk ${i + 1}/${totalChunks}...`);
        const embeddingResult: number[] = await generateEmbedding(chunk);
        
        await ctx.runMutation(api.documents.addDocument, {
          text: chunk,
          embedding: embeddingResult,
          metadata: {
            source: args.fileName,
            fileName: args.fileName,
            uploadedAt,
            chunkIndex: i,
            totalChunks,
          },
        });
      }
      
      console.log(`✅ Successfully embedded ${totalChunks} chunks`);
      
      return {
        success: true,
        chunksCreated: totalChunks,
        fileName: args.fileName,
      };
    } catch (error) {
      console.error("Error embedding document:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Perform RAG-based chat with document context
 * 
 * This action implements the complete RAG (Retrieval-Augmented Generation) workflow:
 * 1. Embeds the user's query using the same embedding model as documents
 * 2. Uses Convex's vector search to find the most similar document chunks
 * 3. Optionally filters by fileName if specified
 * 4. Retrieves the top 5 most similar chunks as context
 * 5. Generates an AI response using Gemini 2.5 Flash with the context
 * 
 * The response is grounded in the actual document content, reducing hallucinations
 * and providing accurate, context-aware answers.
 * 
 * @param query - The user's question or prompt
 * @param fileName - Optional file name to limit search to specific document
 * 
 * @returns Promise resolving to:
 *   - success: true if chat succeeded, false otherwise
 *   - answer: AI-generated response based on document context
 *   - sources: Array of source chunks used, each containing:
 *     - fileName: Name of the source file
 *     - chunkIndex: Index of the chunk within the file
 *     - text: Preview of the chunk text (first 200 chars)
 *     - score: Similarity score (-1 to 1) indicating relevance
 *   - error: Error message (on failure)
 * 
 * @example
 * ```typescript
 * const result = await ctx.runAction(api.ragActions.ragChat, {
 *   query: "What are the gym opening hours?",
 *   fileName: "gym-policy.txt" // Optional: search only this file
 * });
 * 
 * if (result.success) {
 *   console.log("Answer:", result.answer);
 *   console.log("Based on", result.sources.length, "source chunks");
 *   result.sources.forEach(src => {
 *     console.log(`- ${src.fileName} (similarity: ${src.score.toFixed(2)})`);
 *   });
 * }
 * ```
 */
export const ragChat = action({
  args: {
    query: v.string(),
    fileName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    answer: string;
    sources: Array<{
      fileName: string;
      chunkIndex: number;
      text: string;
      score: number;
    }>;
    error?: string;
  }> => {
    try {
      console.log(`🔍 Processing query: "${args.query}"`);
      
      // 1. Generate embedding for the query
      const queryEmbedding: number[] = await generateEmbedding(args.query);
      console.log("✅ Query embedded");
      
      // 2. Use Convex vector search to find similar documents
      const searchResults = await ctx.vectorSearch("documents", "by_embedding", {
        vector: queryEmbedding,
        limit: 5,
        ...(args.fileName && {
          filter: (q) => q.eq("metadata.fileName", args.fileName!),
        }),
      });
      
      if (searchResults.length === 0) {
        return {
          success: true,
          answer: "No documents found. Please upload some documents first.",
          sources: [],
        };
      }
      
      console.log(`📚 Found ${searchResults.length} relevant chunks`);
      
      // 3. Fetch the full document content for the results
      const topDocs = await ctx.runQuery(internal.documents.fetchResults, {
        ids: searchResults.map((result) => result._id),
      });
      
      // 4. Build context from the retrieved documents
      const context: string = topDocs
        .map((doc, i) => `[${i + 1}] ${doc.text}`)
        .join("\n\n");
      
      // 5. Generate AI response using Gemini
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      
      const prompt: string = buildRagChatPrompt(context, args.query);
      
      console.log("💭 Generating answer with Gemini...");
      const result = await model.generateContent(prompt);
      const answer: string = result.response.text();
      
      console.log("✅ Answer generated");
      
      return {
        success: true,
        answer,
        sources: topDocs.map((doc, i) => ({
          fileName: doc.metadata.fileName,
          chunkIndex: doc.metadata.chunkIndex,
          text: doc.text.substring(0, 200) + "...",
          score: searchResults[i]._score,
        })),
      };
    } catch (error) {
      console.error("Error in RAG chat:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        answer: "Sorry, I encountered an error processing your question.",
        sources: [],
      };
    }
  },
});

/**
 * Delete all chunks of a document from the database
 * 
 * Removes all embedded chunks associated with a specific file name.
 * This is useful for:
 * - Removing outdated documents
 * - Cleaning up before re-uploading an updated version
 * - Managing storage and keeping the database clean
 * 
 * @param fileName - Name of the file to delete
 * 
 * @returns Promise resolving to:
 *   - success: true if deletion succeeded, false otherwise
 *   - deleted: Number of chunks deleted (on success)
 *   - error: Error message (on failure)
 * 
 * @example
 * ```typescript
 * const result = await ctx.runAction(api.ragActions.deleteDocument, {
 *   fileName: "old-policy.txt"
 * });
 * 
 * if (result.success) {
 *   console.log(`Deleted ${result.deleted} chunks`);
 * } else {
 *   console.error(`Deletion failed: ${result.error}`);
 * }
 * ```
 */
export const deleteDocument = action({
  args: {
    fileName: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    deleted?: number;
    error?: string;
  }> => {
    try {
      const result = await ctx.runMutation(api.documents.deleteByFileName, {
        fileName: args.fileName,
      });
      
      return {
        success: true,
        deleted: result.deleted,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
