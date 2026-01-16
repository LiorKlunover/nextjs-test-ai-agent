/**
 * Document Management Module
 * 
 * This module provides Convex queries and mutations for managing document chunks
 * in the RAG (Retrieval-Augmented Generation) system. Documents are split into
 * chunks, embedded using Google's text-embedding model, and stored with metadata
 * for efficient vector similarity search.
 * 
 * @module documents
 */

import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";

/**
 * Add a document chunk to the database
 * 
 * Inserts a single document chunk with its embedding vector and metadata.
 * This is typically called multiple times per document (once per chunk) by
 * the embedDocument action in ragActions.ts.
 * 
 * @param text - The text content of the document chunk
 * @param embedding - 3072-dimensional embedding vector from Google's gemini-embedding-001 model
 * @param metadata - Document metadata including:
 *   - source: Original source identifier
 *   - fileName: Name of the uploaded file
 *   - uploadedAt: ISO timestamp of when the document was uploaded
 *   - chunkIndex: Zero-based index of this chunk within the document
 *   - totalChunks: Total number of chunks for this document
 * 
 * @returns The ID of the inserted document
 * 
 * @example
 * ```typescript
 * await ctx.runMutation(api.documents.addDocument, {
 *   text: "This is a chunk of text...",
 *   embedding: [0.123, 0.456, ...], // 3072 dimensions
 *   metadata: {
 *     source: "document.txt",
 *     fileName: "document.txt",
 *     uploadedAt: "2026-01-16T10:00:00.000Z",
 *     chunkIndex: 0,
 *     totalChunks: 5
 *   }
 * });
 * ```
 */
export const addDocument = mutation({
  args: {
    text: v.string(),
    embedding: v.array(v.float64()),
    metadata: v.object({
      source: v.string(),
      fileName: v.string(),
      uploadedAt: v.string(),
      chunkIndex: v.number(),
      totalChunks: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("documents", args);
  },
});

/**
 * Retrieve all chunks for a specific file
 * 
 * Queries all document chunks that belong to a specific file by fileName.
 * Uses the by_fileName index for efficient retrieval.
 * 
 * @param fileName - The name of the file to retrieve chunks for
 * 
 * @returns Array of document chunks with their text, embeddings, and metadata
 * 
 * @example
 * ```typescript
 * const chunks = await ctx.runQuery(api.documents.getByFileName, {
 *   fileName: "document.txt"
 * });
 * console.log(`Found ${chunks.length} chunks`);
 * ```
 */
export const getByFileName = query({
  args: { fileName: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_fileName", (q) => 
        q.eq("metadata.fileName", args.fileName)
      )
      .collect();
  },
});

/**
 * Retrieve all documents or filter by fileName
 * 
 * Flexible query that can either:
 * - Return all document chunks in the database (if no fileName provided)
 * - Return chunks for a specific file (if fileName provided)
 * 
 * This is the primary query used by the RAG chat action to retrieve
 * documents for vector similarity search.
 * 
 * @param fileName - Optional file name to filter by
 * 
 * @returns Array of document chunks with their text, embeddings, and metadata
 * 
 * @example
 * ```typescript
 * // Get all documents
 * const allDocs = await ctx.runQuery(api.documents.getAllDocuments, {});
 * 
 * // Get documents for specific file
 * const fileDocs = await ctx.runQuery(api.documents.getAllDocuments, {
 *   fileName: "document.txt"
 * });
 * ```
 */
export const getAllDocuments = query({
  args: {
    fileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.fileName !== undefined) {
      return await ctx.db
        .query("documents")
        .withIndex("by_fileName", (q) => 
          q.eq("metadata.fileName", args.fileName!)
        )
        .collect();
    }
    
    return await ctx.db.query("documents").collect();
  },
});

/**
 * Delete all chunks for a specific file
 * 
 * Removes all document chunks associated with a given fileName from the database.
 * This is useful for cleaning up when a user wants to remove a document or
 * re-upload an updated version.
 * 
 * @param fileName - The name of the file whose chunks should be deleted
 * 
 * @returns Object containing the number of chunks deleted
 * 
 * @example
 * ```typescript
 * const result = await ctx.runMutation(api.documents.deleteByFileName, {
 *   fileName: "old-document.txt"
 * });
 * console.log(`Deleted ${result.deleted} chunks`);
 * ```
 */
export const deleteByFileName = mutation({
  args: { fileName: v.string() },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_fileName", (q) =>
        q.eq("metadata.fileName", args.fileName)
      )
      .collect();
    
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }
    
    return { deleted: docs.length };
  },
});

/**
 * Get a summary of all uploaded files
 * 
 * Returns a deduplicated list of all files in the database with metadata
 * about each file including the number of chunks and upload timestamp.
 * This is useful for displaying a file list in the UI.
 * 
 * @returns Array of file summaries, each containing:
 *   - fileName: Name of the file
 *   - chunks: Number of chunks for this file
 *   - uploadedAt: ISO timestamp of when the file was uploaded
 * 
 * @example
 * ```typescript
 * const files = await ctx.runQuery(api.documents.getAllFiles, {});
 * files.forEach(file => {
 *   console.log(`${file.fileName}: ${file.chunks} chunks, uploaded ${file.uploadedAt}`);
 * });
 * ```
 */
export const getAllFiles = query({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query("documents").collect();
    const fileNames = new Set(docs.map(doc => doc.metadata.fileName));
    return Array.from(fileNames).map(fileName => {
      const fileDocs = docs.filter(d => d.metadata.fileName === fileName);
      return {
        fileName,
        chunks: fileDocs.length,
        uploadedAt: fileDocs[0]?.metadata.uploadedAt,
      };
    });
  },
});

/**
 * Fetch document results by their IDs
 * 
 * Internal query used to retrieve full document information after vector search.
 * Vector search returns only document IDs and scores, so this query fetches
 * the actual document content and metadata.
 * 
 * @param ids - Array of document IDs to fetch
 * @returns Array of documents with their full content and metadata
 * 
 * @example
 * ```typescript
 * const docs = await ctx.runQuery(internal.documents.fetchResults, {
 *   ids: searchResults.map(r => r._id)
 * });
 * ```
 */
export const fetchResults = internalQuery({
  args: { ids: v.array(v.id("documents")) },
  handler: async (ctx, args) => {
    const results = [];
    for (const id of args.ids) {
      const doc = await ctx.db.get(id);
      if (doc === null) {
        continue;
      }
      results.push(doc);
    }
    return results;
  },
});
