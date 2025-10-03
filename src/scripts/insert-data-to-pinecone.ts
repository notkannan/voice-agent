import dotenv from "dotenv";
dotenv.config();

import Firecrawl from "@mendable/firecrawl-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Pinecone } from "@pinecone-database/pinecone";
import { Logger } from "@/utils/logger";

const ai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const logger = new Logger("InsertDataToPinecone");

async function main() {

    // Perform Scraping
    const app = new Firecrawl({
        apiKey: process.env.FIRECRAWL_API_KEY,
    });

    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! })
    const index = pc.index("voice-agent-data")

    const scrapeURL = "https://www.aven.com";

    const scrapeResult = await app.scrape(scrapeURL, {
        formats: ["markdown"],
        onlyMainContent: true,
    })

    logger.info("Data scraped successfully");
    console.log(scrapeResult);

    // Convert content to Embeddings using Google GenAI
    const model = ai.getGenerativeModel({
        model: "gemini-embedding-001",
    });
    const response = await model.embedContent(scrapeResult.markdown!);

    const pineconeResponse = await index.namespace("aven-data").upsert([
        {
        id: `${scrapeURL} + ${Date.now()}`,
        values: response.embedding.values,
        metadata: {'url': scrapeURL, 'category': 'Website', 'chunk-text': scrapeResult.markdown!},
        }
    ])

    console.log(pineconeResponse);
}

main();
