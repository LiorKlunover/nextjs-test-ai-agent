# Project Context: Next.js + Convex AI Agent

## Overview
This project is a **Full-stack AI Application** built with **Next.js 15** and **Convex**. It features two primary AI-powered capabilities: a **LangGraph Quiz Generator** and a **RAG (Retrieval-Augmented Generation) System**. The application uses **Convex Auth** for authentication and tailors user experiences based on AI interactions.

## Tech Stack
*   **Frontend:** Next.js 15 (App Router), React 19, Tailwind CSS, Shadcn UI, MUI, Framer Motion.
*   **Backend:** Convex (Serverless Database, Backend Functions, Vector Search).
*   **Authentication:** Convex Auth.
*   **AI & ML:**
    *   **Orchestration:** LangChain, LangGraph.
    *   **LLMs:** OpenAI (`gpt-3.5-turbo`), Google Gemini (`gemini-2.5-flash`).
    *   **Embeddings:** Google Generative AI (`gemini-embedding-001`).

## Key Features & Architecture

### 1. LangGraph Quiz Generator
*   **Purpose:** Generates multiple-choice quizzes on any given topic.
*   **Location:** `convex/questionGenerator.ts` (Backend), `components/QuizGenerator.tsx` (Frontend).
*   **Flow:**
    *   **Generate:** Uses OpenAI `gpt-3.5-turbo` to create 10 questions.
    *   **Validate:** Checks JSON formatting and structure.
    *   **Regenerate:** Retries generation if validation fails.
*   **Route:** `/quiz`

### 2. RAG System (Chat with Documents)
*   **Purpose:** Allows users to upload documents and chat with them using semantic search.
*   **Location:** `convex/ragActions.ts` (Backend), `app/rag/page.tsx` (Frontend).
*   **Components:**
    *   **Embeddings:** Uses Google's `gemini-embedding-001` model.
    *   **Vector DB:** Convex `documents` table with a vector index (`by_embedding`).
    *   **Chat:** Uses `gemini-2.5-flash` to answer based on retrieved context.
*   **Schema Note:** The schema is configured for **3072-dimensional embeddings** (`convex/schema.ts`), matching the configuration in `convex/documents.ts`.

## Development & Commands

### Setup
Ensure environment variables are set in Convex:
```bash
npx convex env set OPENAI_API_KEY sk-...
npx convex env set GOOGLE_API_KEY AIza...
```

### Running the App
Run both frontend and backend in parallel:
```bash
npm run dev
```

### Key Directories
*   `convex/`: Backend functions, schema, and AI logic.
    *   `schema.ts`: Database definition.
    *   `auth.ts`: Authentication configuration.
    *   `ragActions.ts`: RAG workflow.
    *   `questionGenerator.ts`: Quiz generation workflow.
*   `app/`: Next.js App Router pages.
    *   `quiz/`: Quiz interface.
    *   `rag/`: Document chat interface.
*   `components/`: Reusable UI components.

## Database Schema (Convex)
*   `users`: Authentication data.
*   `documents`: Stores uploaded file content and vectors.
    *   `text`: Original chunk text.
    *   `embedding`: Vector (Float64 array).
    *   `metadata`: `fileName`, `source`, `chunkIndex`, etc.
*   `numbers`: Simple counter table.

## conventions
*   **Styling:** Tailwind CSS with utility classes.
*   **Components:** Shadcn UI and MUI components mixed.
*   **Type Safety:** strict TypeScript usage across frontend and backend.
*   **Convex Pattern:** Uses `action` for third-party API calls (OpenAI/Google) and `mutation`/`query` for internal DB operations.
