import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
