import { NextRequest, NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/config/env";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

const pinecone = new Pinecone({
  apiKey: env.PINECONE_API_KEY,
});

const ai = new GoogleGenerativeAI(env.GOOGLE_API_KEY);
const embeddingModel = ai.getGenerativeModel({ model: "gemini-embedding-001" });

const namespace = pinecone.index("voice-agent-data").namespace("aven-data");

export async function POST(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json({ message: "Not Found" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { model, messages, max_tokens, temperature, stream } = body;

    const lastMessage = messages?.[messages.length - 1];

    const prompt = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `
        Create a prompt which can act as a prompt templete where I put the original prompt and it can modify it according to my intentions so that the final modified prompt is more detailed.You can expand certain terms or keywords.
        ----------
        PROMPT: ${lastMessage.content}.
        MODIFIED PROMPT: `,
        },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const modifiedMessage = [
      ...messages.slice(0, messages.length - 1),
      { ...lastMessage, content: prompt.choices[0].message.content },
    ];

    const query = modifiedMessage[modifiedMessage.length - 1].content;

    const embedding = await embeddingModel.embedContent(query);

    console.log("Embedding:", { embedding });

    const response = await namespace.query({
      vector: embedding.embedding.values,
      topK: 1, // TODO: Change once you get more namespaces
      includeValues: true,
      includeMetadata: true,
    });

    console.log("Pinecone response:", response);

    const pineconeData = response.matches?.[0]?.metadata?.["chunk-text"];

    console.log("Context fetched from Pinecone:", { pineconeData });

    const systemMessage = {
      role: "system",
      content: `You are a helpful assistant that can answer questions based on the context provided.
      Context: ${pineconeData}
      Question: ${query}
      Answer: `,
    };

    const enhancedMessage = [systemMessage, ...modifiedMessage];

    if (stream) {
      const completionStream = await openai.chat.completions.create({
        model: model || "gpt-3.5-turbo",
        messages: enhancedMessage,
        max_tokens: max_tokens || 150,
        temperature: temperature || 0.7,
        stream: true,
      });

      // Create a readable stream for the response
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of completionStream) {
              const text = `data: ${JSON.stringify(chunk)}\n\n`;
              controller.enqueue(new TextEncoder().encode(text));
            }
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return new Response(readableStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } else {
      const completion = await openai.chat.completions.create({
        model: model || "gpt-3.5-turbo",
        messages: enhancedMessage,
        max_tokens: max_tokens || 150,
        temperature: temperature || 0.7,
        stream: false,
      });
      return NextResponse.json(completion);
    }
  } catch (e) {
    console.log(e);
    return NextResponse.json({ error: e });
  }
}
