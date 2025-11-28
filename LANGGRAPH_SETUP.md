# LangGraph Quiz Generator - Setup Guide

## What Was Created

I've built a complete LangGraph agent system that generates 10 multiple-choice questions about any topic. Here's what was added to your project:

### 1. **Backend (Convex)**
- `convex/questionGenerator.ts` - The main LangGraph agent with:
  - **State Graph Architecture**: Uses LangGraph's StateGraph with nodes for generation, validation, and regeneration
  - **Three Nodes**:
    - `generateQuestions`: Uses GPT-3.5-turbo to create 10 questions
    - `validateQuestions`: Ensures all 10 questions are properly formatted
    - `regenerateQuestions`: Retries if validation fails
  - **Conditional Edges**: Smart routing based on validation results

### 2. **Frontend (Next.js)**
- `components/QuizGenerator.tsx` - Beautiful, interactive quiz interface with:
  - Topic input
  - Question display with multiple-choice options
  - Answer selection
  - Score calculation
  - Explanations for each answer
  - Modern gradient design with animations

- `app/quiz/page.tsx` - Dedicated page at `/quiz` route

### 3. **Documentation**
- `convex/README_QUIZ_AGENT.md` - Complete usage guide

## Setup Instructions

### Step 1: Set Your OpenAI API Key

You need to add your OpenAI API key to Convex environment variables:

```bash
npx convex env set OPENAI_API_KEY your_api_key_here
```

Replace `your_api_key_here` with your actual OpenAI API key from https://platform.openai.com/api-keys

### Step 2: Test the Agent

1. Navigate to http://localhost:3000/quiz in your browser
2. Enter a topic (e.g., "World War II", "JavaScript", "Ancient Egypt")
3. Click "Generate Quiz"
4. Answer the questions and submit to see your score!

## How the LangGraph Agent Works

```
START
  ↓
[Generate Questions] ← Uses GPT-3.5-turbo to create 10 questions
  ↓
[Validate Questions] ← Checks if all 10 questions are valid
  ↓
  ├─→ [Complete] → END (if 10 valid questions)
  └─→ [Regenerate] → END (if validation fails)
```

## Example Usage

### From Frontend
```typescript
const generateQuestions = useAction(api.questionGenerator.generateQuizQuestions);
const result = await generateQuestions({ topic: "World War II" });
```

### From Another Convex Function
```typescript
const result = await ctx.runAction(api.questionGenerator.generateQuizQuestions, {
  topic: "JavaScript Programming"
});
```

## Response Format

```json
{
  "success": true,
  "topic": "Your Topic",
  "questions": [
    {
      "question": "What is...?",
      "options": {
        "A": "Option A",
        "B": "Option B",
        "C": "Option C",
        "D": "Option D"
      },
      "correctAnswer": "B",
      "explanation": "Explanation of the correct answer"
    }
    // ... 9 more questions
  ],
  "totalQuestions": 10
}
```

## Features

✅ **LangGraph State Management**: Proper state graph with nodes and edges
✅ **Validation & Retry Logic**: Ensures quality output
✅ **Beautiful UI**: Modern, responsive design with animations
✅ **Interactive Quiz**: Select answers, submit, and see scores
✅ **Explanations**: Learn why each answer is correct
✅ **Flexible Topics**: Works with any subject matter

## Next Steps

1. Set your OpenAI API key (see Step 1 above)
2. Visit http://localhost:3000/quiz
3. Try different topics!

## Troubleshooting

**Error: "Make sure you've set up your OPENAI_API_KEY"**
- Run: `npx convex env set OPENAI_API_KEY your_key_here`

**Questions not generating**
- Check your OpenAI API key is valid
- Ensure you have credits in your OpenAI account
- Check the Convex logs for errors

**Want to use a different model?**
- Edit `convex/questionGenerator.ts`
- Change `modelName: "gpt-3.5-turbo"` to another model like `"gpt-4"`
