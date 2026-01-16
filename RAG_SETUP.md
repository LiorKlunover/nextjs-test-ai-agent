# RAG System Setup Guide

This guide will help you set up the RAG (Retrieval-Augmented Generation) system with Convex vector database, Google embeddings, and Gemini chat.

## 🚀 Features

- **Vector Database**: Convex with 768-dimensional embeddings
- **Embeddings**: Google text-embedding-004 model
- **Chat Model**: Google Gemini Pro
- **Document Processing**: Automatic chunking with LangChain
- **Beautiful UI**: Modern interface with shadcn/ui and MUI components

## 📋 Prerequisites

1. **Convex Account**: Sign up at [convex.dev](https://convex.dev)
2. **Google AI API Key**: Get from [Google AI Studio](https://makersuite.google.com/app/apikey)

## 🔧 Setup Instructions

### 1. Install Dependencies

The required packages are already installed:
- `@langchain/google-genai` - Google embeddings
- `@langchain/textsplitters` - Document chunking
- `@google/generative-ai` - Gemini chat
- `@langchain/core` - LangChain core
- `@langchain/langgraph` - Workflow orchestration

### 2. Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
# Convex (already configured)
CONVEX_URL=your_convex_url

# Google AI API Key (REQUIRED)
GOOGLE_API_KEY=your_google_api_key_here
```

**To get your Google API Key:**
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Get API Key"
3. Create a new API key or use an existing one
4. Copy the key and paste it in `.env.local`

### 3. Deploy Convex Schema

The schema has been updated with a `documents` table that includes:
- Text content
- 768-dimensional embeddings
- Metadata (fileName, source, uploadedAt, chunkIndex, totalChunks)
- Vector index for similarity search

Run:
```bash
npm run dev
```

This will automatically deploy the schema to Convex.

### 4. Verify Setup

1. Navigate to `/rag` in your application
2. Upload a `.txt` or `.md` file
3. Wait for the embedding process to complete
4. Ask questions about your document

## 📁 File Structure

```
convex/
├── schema.ts              # Database schema with vector index
├── documents.ts           # Queries and mutations for documents
└── ragActions.ts          # Actions for embedding and RAG chat

app/
└── rag/
    └── page.tsx          # RAG UI page
```

## 🎯 How It Works

### Document Upload Flow

1. **User uploads file** → Frontend reads file content
2. **Text splitting** → Document is split into 1000-character chunks with 200-character overlap
3. **Embedding** → Each chunk is embedded using Google text-embedding-004
4. **Storage** → Embeddings are stored in Convex with metadata
5. **Confirmation** → User receives success message

### Chat Flow

1. **User asks question** → Query is sent to backend
2. **Query embedding** → Question is embedded using same model
3. **Vector search** → Find top 5 most similar document chunks using cosine similarity
4. **Context building** → Relevant chunks are combined into context
5. **Gemini response** → Google Gemini Pro generates answer based on context
6. **Display** → Answer is shown to user with source references

## 🔍 API Reference

### Convex Actions

#### `embedDocument`
Embeds a document into the vector database.

```typescript
await embedDocument({
  fileName: "document.txt",
  content: "Your document content..."
});
```

#### `ragChat`
Performs RAG-based chat with document context.

```typescript
await ragChat({
  query: "What is this document about?",
  fileName: "document.txt" // Optional: filter by specific file
});
```

#### `deleteDocument`
Removes all chunks of a document from the database.

```typescript
await deleteDocument({
  fileName: "document.txt"
});
```

### Convex Queries

#### `getAllFiles`
Returns list of all uploaded files with metadata.

#### `getByFileName`
Gets all chunks for a specific file.

#### `vectorSearch`
Performs vector similarity search (used internally by ragChat).

## 🎨 UI Components

The RAG page uses:
- **shadcn/ui**: Button, Input, Card, Badge
- **MUI**: Avatar, Chip, CircularProgress, IconButton, Tooltip
- **Lucide Icons**: CloudUpload, Send, FileText, Trash2, MessageSquare, Sparkles, Bot, User, Loader2

## 🐛 Troubleshooting

### "No documents found" error
- Make sure you've uploaded and embedded documents first
- Check that the embedding process completed successfully

### Embedding fails
- Verify your `GOOGLE_API_KEY` is set correctly
- Check that the API key has access to the embedding model
- Ensure you're within Google AI's rate limits

### Vector search not working
- The vector index may take a moment to build after first deployment
- Try redeploying with `npx convex deploy`

### Chat responses are generic
- Ensure documents are properly embedded
- Try asking more specific questions
- Check that the fileName filter is correct if using it

## 📊 Performance Tips

1. **Chunk Size**: Default is 1000 characters. Adjust in `ragActions.ts` if needed
2. **Top K Results**: Default is 5 chunks. Increase for more context
3. **File Size**: Large files may take longer to embed
4. **Rate Limits**: Google AI has rate limits - consider batching for many files

## 🔐 Security Notes

- Never commit `.env.local` to version control
- Keep your Google API key secure
- Use Convex's built-in authentication for production
- Consider adding file size limits for uploads

## 📚 Additional Resources

- [Convex Documentation](https://docs.convex.dev)
- [Google AI Documentation](https://ai.google.dev/docs)
- [LangChain Documentation](https://js.langchain.com/docs)
- [shadcn/ui Components](https://ui.shadcn.com)

## 🎉 Next Steps

1. Add user authentication to track documents per user
2. Implement document deletion from UI
3. Add support for PDF and DOCX files
4. Create document management dashboard
5. Add conversation history
6. Implement streaming responses for better UX
