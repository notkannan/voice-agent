import dotenv from "dotenv";
dotenv.config();

import Firecrawl from "@mendable/firecrawl-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Pinecone } from "@pinecone-database/pinecone";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Logger } from "@/utils/logger";

const ai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const logger = new Logger("InsertDataToPinecone");

async function main() {
  // Perform Scraping
  const app = new Firecrawl({
    apiKey: process.env.FIRECRAWL_API_KEY,
  });

  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const index = pc.index("voice-agent-data");

  const scrapeURL = "https://www.aven.com";

  const scrapeResult = await app.scrape(scrapeURL, {
    formats: ["markdown"],
    onlyMainContent: true,
    excludeTags: ["nav", "header", "footer", "script", "style"],
    waitFor: 1000, // Wait for dynamic content
  });

  logger.info("Data scraped successfully");

  const flashModel = ai.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const cleaningPrompt = `You are a content cleaning assistant. Your task is to clean scraped website content and extract only meaningful, substantive information.
  Return only the cleaned markdown content. Do not add explanations, comments, or meta-text. Preserve the markdown formatting structure.
  
  Content to clean:
  ${scrapeResult.markdown!}`;

  const cleanedContent = await flashModel.generateContent({
    contents: [{ role: "user", parts: [{ text: cleaningPrompt }] }],
  });

  console.log(cleanedContent.response.text());

  // Chunk the markdown content
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 550,
    chunkOverlap: 200,
    separators: ["\n\n", "\n", " ", ""], // Respects markdown structure
  });

  const chunks = await textSplitter.createDocuments([cleanedContent.response.text()]);
  logger.info(`Created ${chunks.length} chunks`);

  // Get embeddings model
  const model = ai.getGenerativeModel({
    model: "gemini-embedding-001",
  });

  // const flashModel = ai.getGenerativeModel({
  //   model: "gemini-2.5-flash",
  // });

  // Process each chunk and upsert to Pinecone
  const vectors = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Generate embedding for this chunk
    const response = await model.embedContent(chunk.pageContent);
    
    vectors.push({
      id: `${scrapeURL}-chunk-${i}-${Date.now()}`,
      values: response.embedding.values,
      metadata: {
        url: scrapeURL,
        category: "Website",
        "chunk-text": chunk.pageContent,
        "chunk-index": i,
        "total-chunks": chunks.length,
      },
    });
  }

  // Batch upsert all vectors
  const pineconeResponse = await index.namespace("aven-data").upsert(vectors);

  logger.info(`Successfully upserted ${vectors.length} vectors to Pinecone`);
  console.log(pineconeResponse);
}


main();