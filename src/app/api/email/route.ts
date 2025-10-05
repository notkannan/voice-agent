import { google } from "googleapis";
import { env } from "@/config/env";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Set up OAuth2 client
    const oAuth2Client = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI
    );
    oAuth2Client.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });    

    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    // List the 10 most recent emails
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      maxResults: 10,
      q: "in:inbox"
    });

    if (!listResponse.data.messages || listResponse.data.messages.length === 0) {
      return NextResponse.json({ 
        success: true, 
        data: { messages: [], count: 0 },
        message: "No emails found in inbox"
      });
    }

    // Get detailed information for each email
    const emails = await Promise.all(
      listResponse.data.messages.map(async (message) => {
        try {
          const emailDetail = await gmail.users.messages.get({
            userId: "me",
            id: message.id!,
            format: "metadata",
            metadataHeaders: ["From", "To", "Subject", "Date"]
          });

          const headers = emailDetail.data.payload?.headers || [];
          const getHeader = (name: string) => 
            headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

          return {
            id: message.id,
            from: getHeader("From"),
            to: getHeader("To"),
            subject: getHeader("Subject"),
            date: getHeader("Date"),
            snippet: emailDetail.data.snippet
          };
        } catch (error) {
          console.error(`Error fetching email ${message.id}:`, error);
          return {
            id: message.id,
            error: "Failed to fetch email details"
          };
        }
      })
    );

    return NextResponse.json({ 
      success: true, 
      data: { 
        emails,
        count: emails.length,
        totalEmails: listResponse.data.resultSizeEstimate
      }
    });
  } catch (error: Error | unknown) {
    console.error("Email list error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { to, subject, text } = body;

    // Validate required fields
    if (!to || !subject || !text) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: to, subject, and text content"
        },
        { status: 400 }
      );
    }

    // Set up OAuth2 client
    const oAuth2Client = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI
    );
    oAuth2Client.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });

    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    // Create email message
    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      text
    ].join("\n");

    // Encode the message in base64url format
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Send the email
    const sendResponse = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        messageId: sendResponse.data.id,
        threadId: sendResponse.data.threadId
      },
      message: "Email sent successfully"
    });

  } catch (error: Error | unknown) {
    console.error("Email send error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred while sending email"
      },
      { status: 500 }
    );
  }
}
