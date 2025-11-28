# Quiz Question Generator Agent

This LangGraph agent generates 10 multiple-choice questions about any given topic.

## Setup

1. **Set OpenAI API Key**
   You need to add your OpenAI API key to your Convex environment variables:
   
   ```bash
   npx convex env set OPENAI_API_KEY your_api_key_here
   ```

## How It Works

The agent uses a LangGraph state graph with the following workflow:

1. **Generate Node**: Uses GPT-3.5-turbo to generate 10 multiple-choice questions
2. **Validate Node**: Checks if exactly 10 valid questions were generated
3. **Regenerate Node**: If validation fails, attempts to regenerate questions
4. **Complete**: Returns the final set of questions

## Usage

### From Frontend (React/Next.js)

```typescript
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

function QuizGenerator() {
  const generateQuestions = useAction(api.questionGenerator.generateQuizQuestions);
  
  const handleGenerate = async () => {
    const result = await generateQuestions({ topic: "World War II" });
    console.log(result.questions);
  };
  
  return (
    <button onClick={handleGenerate}>
      Generate Quiz
    </button>
  );
}
```

### From Convex Function

```typescript
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

export const myAction = action({
  handler: async (ctx) => {
    const result = await ctx.runAction(internal.questionGenerator.generateQuizQuestions, {
      topic: "JavaScript Programming"
    });
    return result;
  }
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

## Example Topics

- "World War II"
- "JavaScript Programming"
- "Ancient Egypt"
- "Climate Change"
- "Human Anatomy"
- "Machine Learning"
- "Renaissance Art"
- "Quantum Physics"
