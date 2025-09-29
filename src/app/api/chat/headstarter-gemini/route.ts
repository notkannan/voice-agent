import { NextRequest, NextResponse } from "next/server";
import { Logger } from "@/utils/logger";
import { env } from "@/config/env";
import OpenAI, { OpenAIError } from "openai";

const logger = new Logger("API:Chat:");

const gemini = new OpenAI({
    apiKey: env.GOOGLE_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

export async function POST(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json({ message: "Not Found" }, { status: 404 });
  }

  try {

    const body = await req.json();
    logger.info("Received request", { body });
    const {
      model,
      messages,
      max_tokens,
      temperature,
      stream,
      call,
      ...restParams
    } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages are required" }, { status: 400 });
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage?.content) {
      return NextResponse.json({ error: "Last message content is required" }, { status: 400 });
    }


    const prompt = await gemini.chat.completions.create({
      model: "gemini-2.0-flash-lite",
      messages: [
        {
          role: "user",
          content: `
        Create a prompt which can act as a prompt templete where I put the original prompt and it can modify it according to my intentions so that the final modified prompt is more detailed.You can expand certain terms or keywords.
        ----------
        PROMPT: ${lastMessage.content}.
        MODIFIED PROMPT: `
        }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const modifiedContent = prompt.choices[0]?.message?.content;
    if (!modifiedContent) {
      return NextResponse.json({ error: "Failed to generate modified message" }, { status: 400 });
    }
    
    const modifiedMessages = [
      ...messages.slice(0, messages.length - 1),
      { ...lastMessage, content: modifiedContent },
    ];

    if (stream) {
      const completionStream = await gemini.chat.completions.create({
        model: "gemini-2.0-flash-lite",
        messages: modifiedMessages,
        max_tokens: max_tokens || 150,
        temperature: temperature || 0.7,
        stream: true,
      } as OpenAI.ChatCompletionCreateParamsStreaming);

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try{
            for await (const chunk of completionStream) {
              const data = `data: ${JSON.stringify(chunk)}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          } catch (error) {
            logger.error("Error in stream", { error });
            controller.error(error);
          } finally {
            controller.close();
          }
        }
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      const completion = await gemini.chat.completions.create({
        model: "gemini-2.0-flash-lite",
        messages: modifiedMessages,
        max_tokens: max_tokens || 150,
        temperature: temperature || 0.7,
        stream: false,
      });

      return NextResponse.json(completion);
    }
  } catch (error) {
    logger.error("API Error", error);

    if (error instanceof OpenAIError) {
      return NextResponse.json(
        { error: error.message }, 
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Internal Server Error" }, 
      { status: 500 }
    );
  }
}