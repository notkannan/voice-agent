import Firecrawl from "@mendable/firecrawl-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
// import { Pinecone } from "@pinecone-database/pinecone";
import { Logger } from "@/utils/logger";
import dotenv from "dotenv";

dotenv.config();

// TODO: Uncomment when working with Pinecone
// const pc = new Pinecone({
//     apiKey: process.env.PINECONE_API_KEY!,
// });

const ai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

const logger = new Logger("InsertDataToPinecone");

async function main() {

    // Perform Scraping
    const app = new Firecrawl({
        apiKey: process.env.FIRECRAWL_API_KEY,
    });

    const scrapeResult = await app.scrape("https://www.aven.com", {
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

    console.log(response);
}

main();
