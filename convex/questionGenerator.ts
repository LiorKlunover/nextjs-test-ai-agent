"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { StateGraph, END, START } from "@langchain/langgraph";
import { HumanMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";

// --- Model Configuration ---
const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash", // Using flash for speed/cost, or pro for quality
    temperature: 0.7,
    maxOutputTokens: 8192,
});

// --- Types & Schemas ---

interface QuizQuestion {
    question: string;
    options: {
        A: string;
        B: string;
        C: string;
        D: string;
    };
    correctAnswer: "A" | "B" | "C" | "D";
    explanation: string;
    subtopic?: string;
}

// 1. Define State
// Using Annotation.Root for cleaner state definition in newer LangGraph versions,
// or falling back to object style if needed. We'll use the object style compatible with the installed version.

interface AgentState {
    messages: BaseMessage[];
    topic: string;
    subtopics: string[];
    questions: QuizQuestion[];
    next: string;
}

const stateChannels = {
    messages: {
        value: (x?: BaseMessage[], y?: BaseMessage[]) => (x ?? []).concat(y ?? []),
        default: () => [],
    },
    topic: {
        value: (x?: string, y?: string) => y ?? x ?? "",
        default: () => "",
    },
    subtopics: {
        value: (x?: string[], y?: string[]) => y ?? x ?? [],
        default: () => [],
    },
    questions: {
        value: (x?: QuizQuestion[], y?: QuizQuestion[]) => (x ?? []).concat(y ?? []),
        default: () => [],
    },
    next: {
        value: (x?: string, y?: string) => y ?? x ?? END,
        default: () => END,
    }
};

// --- Nodes ---

// Supervisor Node
// Decides who acts next: TopicGenerator, QuestionGenerator, or FINISH
const supervisorSchema = z.object({
    next: z.enum(["TopicGenerator", "QuestionGenerator", "FINISH"]),
});

const supervisorPrompt = `You are a supervisor managing a test generator agent.
Your team members are:
1. "TopicGenerator": Generates related subtopics for a given main topic.
2. "QuestionGenerator": Generates questions for the list of subtopics.

Logic:
- If you have a topic but no subtopics, call "TopicGenerator".
- If you have subtopics but no questions (or not enough), call "QuestionGenerator".
- If you have generated questions for all subtopics, respond with "FINISH".

Current State:
- Topic provided? Yes.
- Subtopics available? check history.
- Questions generated? check history.
`;

async function supervisorNode(state: AgentState) {


    // We can manually inspect state to decide, or let the LLM decide.
    // Making it robust by checking state explicitly in the system prompt context or logic.
    /*
        Simplification:
        If subtopics is empty -> TopicGenerator
        If subtopics exists AND questions is empty -> QuestionGenerator
        Else -> FINISH
    */

    // Let's rely on the LLM to follow instructions, but we can augment the prompt with the current status.
    const hasSubtopics = state.subtopics.length > 0;
    const hasQuestions = state.questions.length > 0;

    console.log(`Supervisor: subtopics=${state.subtopics.length}, questions=${state.questions.length}`);

    // Deterministic override to prevent loops
    if (hasQuestions) {
        console.log("Supervisor: Questions exist, finishing.");
        return { next: "FINISH" };
    }

    const context = `
    Status Update:
    - Has Subtopics: ${hasSubtopics}
    - Has Questions: ${hasQuestions}
    `;

    const structuredModel = model.withStructuredOutput(supervisorSchema);

    try {
        const response = await structuredModel.invoke([
            new SystemMessage(supervisorPrompt + context),
            ...state.messages
        ]);
        console.log("Supervisor decision:", response.next);
        return {
            next: response.next,
        };
    } catch (e) {
        console.error("Supervisor failed to generate decision:", e);
        return { next: "FINISH" }; // Safe fallback
    }
}

// Topic Generator Node
async function topicGeneratorNode(state: AgentState) {
    const prompt = `Generate 3 to 5 related subtopics for the main topic: "${state.topic}".
    Return ONLY a JSON array of strings. Example: ["Subtopic 1", "Subtopic 2", "Subtopic 3"]`;

    const response = await model.invoke([new HumanMessage(prompt)]);

    let subtopics: string[] = [];
    try {
        const text = response.content as string;
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            subtopics = JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.error("Failed to parse subtopics", e);
        // Fallback or error handling
        subtopics = [`${state.topic} Basics`, `${state.topic} Advanced`, `${state.topic} History`];
        console.error("TopicGenerator fallback used due to error:", e); // Ensure error is logged explicitly
    }

    return {
        subtopics,
        messages: [new HumanMessage(`TopicGenerator: Generated subtopics: ${subtopics.join(", ")}`)]
    };
}

// Question Generator Node
async function questionGeneratorNode(state: AgentState) {
    const subtopics = state.subtopics;
    const allQuestions: QuizQuestion[] = [];

    // Process each subtopic
    // We can run these in parallel
    const promises = subtopics.map(async (subtopic) => {
        const prompt = `Generate exactly 10 multiple-choice questions about the subtopic: "${subtopic}" (Main topic: ${state.topic}).
        Return a JSON array of objects with fields: question, options (A,B,C,D), correctAnswer, explanation.`;

        const response = await model.invoke([new HumanMessage(prompt)]);

        try {
            const text = response.content as string;
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const qs = JSON.parse(jsonMatch[0]) as QuizQuestion[];
                return qs.map(q => ({ ...q, subtopic }));
            } else {
                console.warn(`QuestionGenerator: No JSON found in response for subtopic '${subtopic}'`);
            }
        } catch (e) {
            console.error(`Failed to generate questions for subtopic '${subtopic}':`, e);
            // Optionally add an error message to the state to inform the user
        }
        return [];
    });

    const results = await Promise.all(promises);
    results.forEach(qs => allQuestions.push(...qs));

    console.log(`QuestionGenerator: Generated ${allQuestions.length} questions total.`);

    return {
        questions: allQuestions,
        messages: [new HumanMessage(`QuestionGenerator: Generated ${allQuestions.length} questions across ${subtopics.length} subtopics.`)]
    };
}


// --- Graph Construction ---

function createTestGeneratorGraph() {
    const workflow = new StateGraph<AgentState>({
        channels: stateChannels
    })
        .addNode("supervisor", supervisorNode)
        .addNode("TopicGenerator", topicGeneratorNode)
        .addNode("QuestionGenerator", questionGeneratorNode)

        .addEdge(START, "supervisor")

        // Workers always go back to supervisor
        .addEdge("TopicGenerator", "supervisor")
        .addEdge("QuestionGenerator", "supervisor")

        // Conditional edges from supervisor
        .addConditionalEdges("supervisor", (x) => x.next, {
            "TopicGenerator": "TopicGenerator",
            "QuestionGenerator": "QuestionGenerator",
            "FINISH": END
        });

    return workflow.compile();
}

// --- Convex Action ---

export const generateQuizQuestions = action({
    args: {
        topic: v.string(),
    },
    handler: async (ctx, args) => {
        const { topic } = args;

        const app = createTestGeneratorGraph();

        const initialState: AgentState = {
            messages: [new HumanMessage(`Create a test about: ${topic}`)],
            topic: topic,
            subtopics: [],
            questions: [],
            next: END
        };

        let result: AgentState;
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            result = await app.invoke(initialState as any) as unknown as AgentState;
        } catch (e) {
            console.error("Graph execution failed:", e);
            throw new Error(`Agent execution failed: ${e instanceof Error ? e.message : String(e)}`);
        }

        return {
            topic,
            subtopics: result.subtopics || [],
            questions: result.questions || [],
            total: (result.questions || []).length,

            debug_messages: (result.messages || []).map((m: BaseMessage) => m.content)
        };
    }
});
