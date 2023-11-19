import { Configuration, OpenAIApi } from "openai-edge";
import { Message, OpenAIStream, StreamingTextResponse } from "ai";
import { getContext } from "@/lib/context";
import { db } from "@/lib/db";
import { chats, messages as _messages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = "edge";

const config = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(config);

export async function POST(req: Request) {
    try {
        const { messages, chatId } = await req.json();
        const _chats = await db.select().from(chats).where(eq(chats.id, chatId));
        if (_chats.length != 1) {
            return NextResponse.json({ error: "chat not found" }, { status: 404 });
        }
        const fileKey = _chats[0].fileKey;
        const lastMessage = messages[messages.length - 1];
        const context = await getContext(lastMessage.content, fileKey);

        const prompt = {
            role: "system",
            content: `You are a question generator. Generate questions only based on what is in 
            START CONTEXT BLOCK
            ${context}
            END OF CONTEXT BLOCK
            from the provided/uploaded PDF. 
            If the ${context} does not provide the information for the user prompt, 
            the AI will respond, "I'm sorry, but that information is not in the PDF."
            `,
        };

        const response = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: [
                prompt,
                ...messages.filter((message: Message) => message.role === "user"),
            ],
            stream: true,
        });
        const stream = OpenAIStream(response, {
            onStart: async () => {
                // save user message into db
                await db.insert(_messages).values({
                    chatId,
                    content: lastMessage.content,
                    role: "user",
                });
            },
            onCompletion: async (completion) => {
                // save ai message into db
                await db.insert(_messages).values({
                    chatId,
                    content: completion,
                    role: "system",
                });
            },
        });
        return new StreamingTextResponse(stream);
    } catch (error) { }
}