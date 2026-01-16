"use client";

import { useState, useRef, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
    CloudUpload, 
    Send, 
    FileText, 
    Trash2, 
    MessageSquare, 
    Sparkles,
    Bot,
    User,
    Loader2
} from "lucide-react";
import { Avatar, Chip, CircularProgress, IconButton, Tooltip } from "@mui/material";

interface Message {
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
}

interface UploadedFile {
    name: string;
    size: number;
    type: string;
    content: string;
}

export default function RAGPage() {
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isEmbedding, setIsEmbedding] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const embedDocument = useAction(api.ragActions.embedDocument);
    const ragChat = useAction(api.ragActions.ragChat);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleFileUpload = async (uploadedFiles: FileList | null) => {
        if (!uploadedFiles) return;

        setIsEmbedding(true);
        
        for (let i = 0; i < uploadedFiles.length; i++) {
            const file = uploadedFiles[i];
            
            if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
                try {
                    const content = await file.text();
                    
                    const newFile: UploadedFile = {
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        content: content
                    };
                    
                    setFiles(prev => [...prev, newFile]);
                    
                    const result = await embedDocument({
                        fileName: file.name,
                        content: content,
                    });
                    
                    if (result.success) {
                        const systemMessage: Message = {
                            role: "assistant",
                            content: `✅ Successfully embedded "${file.name}" (${result.chunksCreated} chunks created). You can now ask questions about this document!`,
                            timestamp: new Date()
                        };
                        setMessages(prev => [...prev, systemMessage]);
                    } else {
                        const errorMessage: Message = {
                            role: "assistant",
                            content: `❌ Failed to embed "${file.name}": ${result.error}`,
                            timestamp: new Date()
                        };
                        setMessages(prev => [...prev, errorMessage]);
                    }
                } catch (error) {
                    console.error("Error processing file:", error);
                }
            }
        }
        
        setIsEmbedding(false);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        handleFileUpload(e.dataTransfer.files);
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSendMessage = async () => {
        if (!input.trim()) return;

        const userMessage: Message = {
            role: "user",
            content: input,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        const query = input;
        setInput("");
        setIsLoading(true);

        try {
            const result = await ragChat({
                query: query,
                fileName: files.length > 0 ? files[0].name : undefined,
            });

            const assistantMessage: Message = {
                role: "assistant",
                content: result.answer || "I'm sorry, I couldn't process that request.",
                timestamp: new Date()
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            console.error("Error sending message:", error);
            const errorMessage: Message = {
                role: "assistant",
                content: "Sorry, there was an error processing your request.",
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50 p-4 md:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <Card className="border-none shadow-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white">
                    <CardHeader>
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                <Sparkles className="w-8 h-8" />
                            </div>
                            <div>
                                <CardTitle className="text-3xl md:text-4xl text-white">
                                    RAG Chat Assistant
                                </CardTitle>
                                <CardDescription className="text-purple-100 mt-1">
                                    Upload documents and chat with AI about their content
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* File Upload Section */}
                    <div className="lg:col-span-1 space-y-4">
                        <Card className="shadow-lg">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-purple-600" />
                                        <CardTitle>Documents</CardTitle>
                                    </div>
                                    {files.length > 0 && (
                                        <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                                            {files.length} files
                                        </Badge>
                                    )}
                                </div>
                                <CardDescription>
                                    Upload your documents to get started
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onClick={() => !isEmbedding && fileInputRef.current?.click()}
                                    className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
                                        isEmbedding
                                            ? "border-blue-500 bg-blue-50 cursor-wait"
                                            : isDragging
                                            ? "border-purple-500 bg-purple-50 scale-105 cursor-pointer"
                                            : "border-gray-300 hover:border-purple-400 hover:bg-gray-50 cursor-pointer"
                                    }`}
                                >
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center">
                                            {isEmbedding ? (
                                                <CircularProgress size={32} />
                                            ) : (
                                                <CloudUpload className="w-8 h-8 text-purple-600" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-900 mb-1">
                                                {isEmbedding ? "Embedding documents..." : "Drop files here"}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                {isEmbedding ? "Please wait" : "or click to browse"}
                                            </p>
                                        </div>
                                        {!isEmbedding && (
                                            <div className="flex gap-2">
                                                <Chip label=".txt" size="small" variant="outlined" />
                                                <Chip label=".md" size="small" variant="outlined" />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    accept=".txt,.md,text/*"
                                    onChange={(e) => handleFileUpload(e.target.files)}
                                    className="hidden"
                                />

                                {files.length > 0 && (
                                    <div className="space-y-2">
                                        {files.map((file, index) => (
                                            <div
                                                key={index}
                                                className="group flex items-center gap-3 p-3 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200 hover:border-purple-300 transition-all"
                                            >
                                                <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm">
                                                    <FileText className="w-5 h-5 text-purple-600" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-gray-900 truncate">
                                                        {file.name}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {formatFileSize(file.size)}
                                                    </p>
                                                </div>
                                                <Tooltip title="Remove file">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => removeFile(index)}
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-500" />
                                                    </IconButton>
                                                </Tooltip>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Chat Section */}
                    <div className="lg:col-span-2">
                        <Card className="shadow-lg flex flex-col h-[calc(100vh-16rem)] md:h-[700px]">
                            <CardHeader className="border-b">
                                <div className="flex items-center gap-2">
                                    <MessageSquare className="w-5 h-5 text-blue-600" />
                                    <CardTitle>Chat</CardTitle>
                                </div>
                                <CardDescription>
                                    Ask questions about your documents
                                </CardDescription>
                            </CardHeader>
                            
                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                {messages.length === 0 && (
                                    <div className="flex flex-col items-center justify-center h-full text-center">
                                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center mb-6">
                                            <MessageSquare className="w-10 h-10 text-purple-600" />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 mb-2">
                                            Start a conversation
                                        </h3>
                                        <p className="text-gray-500 max-w-sm">
                                            Upload documents and ask questions about them. I'll help you understand and analyze the content.
                                        </p>
                                    </div>
                                )}

                                {messages.map((message, index) => (
                                    <div
                                        key={index}
                                        className={`flex gap-3 ${
                                            message.role === "user" ? "justify-end" : "justify-start"
                                        }`}
                                    >
                                        {message.role === "assistant" && (
                                            <Avatar
                                                sx={{
                                                    bgcolor: "linear-gradient(135deg, #9333ea 0%, #3b82f6 100%)",
                                                    width: 36,
                                                    height: 36
                                                }}
                                            >
                                                <Bot className="w-5 h-5" />
                                            </Avatar>
                                        )}
                                        <div
                                            className={`max-w-[75%] rounded-2xl px-4 py-3 shadow-sm ${
                                                message.role === "user"
                                                    ? "bg-gradient-to-br from-purple-600 to-blue-600 text-white"
                                                    : "bg-white border border-gray-200 text-gray-900"
                                            }`}
                                        >
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                                {message.content}
                                            </p>
                                            <p
                                                className={`text-xs mt-2 ${
                                                    message.role === "user"
                                                        ? "text-purple-200"
                                                        : "text-gray-400"
                                                }`}
                                            >
                                                {message.timestamp.toLocaleTimeString([], { 
                                                    hour: '2-digit', 
                                                    minute: '2-digit' 
                                                })}
                                            </p>
                                        </div>
                                        {message.role === "user" && (
                                            <Avatar
                                                sx={{
                                                    bgcolor: "#1f2937",
                                                    width: 36,
                                                    height: 36
                                                }}
                                            >
                                                <User className="w-5 h-5" />
                                            </Avatar>
                                        )}
                                    </div>
                                ))}

                                {isLoading && (
                                    <div className="flex gap-3 justify-start">
                                        <Avatar
                                            sx={{
                                                bgcolor: "linear-gradient(135deg, #9333ea 0%, #3b82f6 100%)",
                                                width: 36,
                                                height: 36
                                            }}
                                        >
                                            <Bot className="w-5 h-5" />
                                        </Avatar>
                                        <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
                                            <div className="flex items-center gap-2">
                                                <CircularProgress size={16} />
                                                <span className="text-sm text-gray-600">Thinking...</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <div className="p-6 border-t bg-gray-50/50">
                                <div className="flex gap-3">
                                    <Input
                                        type="text"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyPress={(e) => e.key === "Enter" && !isLoading && handleSendMessage()}
                                        placeholder="Type your message..."
                                        disabled={isLoading}
                                        className="flex-1 h-11"
                                    />
                                    <Button
                                        onClick={handleSendMessage}
                                        disabled={isLoading || !input.trim()}
                                        className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 h-11 px-6"
                                    >
                                        {isLoading ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <>
                                                <Send className="w-5 h-5 mr-2" />
                                                Send
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
