"use client";

import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import MultiChoiceQuestion from "./MultiChoiceQuestion"; // Import the new component

interface Question {
    question: string;
    options: {
        A: string;
        B: string;
        C: string;
        D: string;
    };
    correctAnswer: string;
    explanation: string;
}

export default function QuizGenerator() {
    const [topic, setTopic] = useState("");
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
    const [showResults, setShowResults] = useState(false);

    const generateQuiz = useAction(api.questionGenerator.generateQuizQuestions);

    const handleGenerate = async () => {
        if (!topic.trim()) {
            setError("Please enter a topic");
            return;
        }

        setLoading(true);
        setError("");
        setQuestions([]);
        setSelectedAnswers({});
        setShowResults(false);

        try {
            const result = await generateQuiz({ topic: topic.trim() });
            if (result.success && result.questions) {
                setQuestions(result.questions);
            } else {
                setError("Failed to generate questions. Please try again.");
            }
        } catch (err) {
            setError("An error occurred while generating the quiz. Please try again.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleAnswerSelect = (questionIndex: number, answer: string) => {
        setSelectedAnswers((prev) => ({
            ...prev,
            [questionIndex]: answer,
        }));
    };

    const handleSubmit = () => {
        setShowResults(true);
    };

    const calculateScore = () => {
        let correct = 0;
        questions.forEach((q, index) => {
            if (selectedAnswers[index] === q.correctAnswer) {
                correct++;
            }
        });
        return correct;
    };

return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 p-8">
        <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
                <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600 mb-2">
                    AI Quiz Generator
                </h1>
                <p className="text-black mb-6">
                    Enter any topic and get 10 multiple-choice questions powered by LangGraph
                </p>

                <div className="flex gap-4">
                    <input
                        type="text"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="Enter a topic (e.g., World War II, JavaScript, Ancient Egypt)"
                        className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none transition-colors"
                        onKeyPress={(e) => e.key === "Enter" && handleGenerate()}
                    />
                    <button
                        onClick={handleGenerate}
                        disabled={loading}
                        className="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105"
                    >
                        {loading ? "Generating..." : "Generate Quiz"}
                    </button>
                </div>

                {error && (
                    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                        {error}
                    </div>
                )}
            </div>

            {loading && (
                <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-200 border-t-purple-600 mb-4"></div>
                    <p className="text-black">Generating your quiz questions...</p>
                </div>
            )}

            {questions.length > 0 && !loading && (
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl shadow-xl p-6">
                        <h2 className="text-2xl font-bold text-black mb-2">
                            Quiz: {topic}
                        </h2>
                        <p className="text-black">
                            {questions.length} questions • {showResults ? `Score: ${calculateScore()}/10` : "Select your answers"}
                        </p>
                    </div>

                    {questions.map((q, index) => (
                        <MultiChoiceQuestion
                            key={index}
                            question={q}
                            index={index}
                            selectedAnswer={selectedAnswers[index]}
                            showResults={showResults}
                            onAnswerSelect={handleAnswerSelect}
                        />
                    ))}

                    {!showResults && (
                        <div className="bg-white rounded-2xl shadow-xl p-6 text-center">
                            <button
                                onClick={handleSubmit}
                                disabled={Object.keys(selectedAnswers).length !== questions.length}
                                className="px-8 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold rounded-lg hover:from-green-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105"
                            >
                                Submit Quiz
                            </button>
                            <p className="text-sm text-black mt-2">
                                {Object.keys(selectedAnswers).length}/{questions.length} questions answered
                            </p>
                        </div>
                    )}

                    {showResults && (
                        <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl shadow-xl p-8 text-center text-white">
                            <h2 className="text-3xl font-bold mb-2">Quiz Complete!</h2>
                            <p className="text-5xl font-bold my-4">
                                {calculateScore()}/10
                            </p>
                            <p className="text-xl mb-6">
                                {calculateScore() === 10
                                    ? "Perfect score! 🎉"
                                    : calculateScore() >= 7
                                        ? "Great job! 👏"
                                        : calculateScore() >= 5
                                            ? "Good effort! 👍"
                                            : "Keep practicing! 💪"}
                            </p>
                            <button
                                onClick={() => {
                                    setQuestions([]);
                                    setSelectedAnswers({});
                                    setShowResults(false);
                                    setTopic("");
                                }}
                                className="px-8 py-3 bg-white text-purple-600 font-semibold rounded-lg hover:bg-gray-100 transition-all transform hover:scale-105"
                            >
                                Generate New Quiz
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    </div>
);
}
