import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";

const allowedOrigins = [
    "https://civiclabs.us",
    "https://civic-labs.ai",
    "http://localhost:51287",
];

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const origin = request.headers.get("Origin");
        console.log(`Received request from origin: ${origin}`);

        // Log environment variables for debugging
        console.log(`FROM_EMAIL: ${env.FROM_EMAIL}`);
        console.log(`DESTINATION_EMAIL: ${env.DESTINATION_EMAIL}`);

        // Handle CORS preflight requests
        if (request.method === "OPTIONS") {
            console.log("Handling CORS preflight request");
            const responseHeaders = new Headers();
            responseHeaders.set(
                "Access-Control-Allow-Origin",
                allowedOrigins.includes(origin) ? origin : "*"
            );
            responseHeaders.set(
                "Access-Control-Allow-Methods",
                "POST, OPTIONS"
            );
            responseHeaders.set("Access-Control-Allow-Headers", "Content-Type");
            console.log(
                "CORS preflight response headers set:",
                responseHeaders
            );
            return new Response(null, {
                headers: responseHeaders,
                status: 204,
            });
        }

        if (request.method === "POST" && url.pathname === "/api/contact") {
            console.log("Handling POST request to /api/contact");
            if (!allowedOrigins.includes(origin)) {
                console.warn(`Origin not allowed: ${origin}`);
                return new Response("Origin not allowed", { status: 403 });
            }

            try {
                console.log("Parsing request body as JSON");
                const { name, email, company, message } = await request.json();
                console.log(
                    `Received data: ${JSON.stringify({
                        name,
                        email,
                        company,
                        message,
                    })}`
                );

                if (!name || !email || !company || !message) {
                    console.error("Missing required fields");
                    return new Response("Missing required fields", {
                        status: 400,
                    });
                }

                // Capture additional Cloudflare geographical information
                const ip = request.headers.get("cf-connecting-ip");
                const country = request.cf ? request.cf.country : "Unknown";
                const region = request.cf ? request.cf.region : "Unknown";
                const city = request.cf ? request.cf.city : "Unknown";
                const timezone = request.cf ? request.cf.timezone : "Unknown";

                // Create message content
                console.log("Constructing message content");
                const messageContent = `Name: ${name}\nEmail: ${email}\nCompany: ${company}\nMessage: ${message}\nIP Address: ${ip}\nCountry: ${country}\nRegion: ${region}\nCity: ${city}\nTimezone: ${timezone}`;

                // Log message content for readability
                console.log(`Message Content: ${messageContent}`);

                // Create MIME message using mimetext
                console.log("Creating MIME message");
                const msg = createMimeMessage();
                try {
                    msg.setSender({ name: "CivicLabs", addr: env.FROM_EMAIL });
                    msg.setRecipient(env.DESTINATION_EMAIL);
                    msg.setSubject(`Contact Form Submission from ${name}`);
                    msg.addMessage({
                        contentType: "text/plain",
                        data: messageContent,
                    });
                } catch (mimeError) {
                    console.error(`MIME error: ${mimeError.message}`);
                    return new Response(`MIME error: ${mimeError.message}`, {
                        status: 500,
                    });
                }

                const rawEmail = msg.asRaw();
                console.log("Constructed raw email:", rawEmail);

                const emailMessage = new EmailMessage(
                    env.FROM_EMAIL,
                    env.DESTINATION_EMAIL,
                    rawEmail
                );
                console.log("Email message object created");

                console.log("Attempting to send email");
                await env.SEB.send(emailMessage);
                console.log("Email sent successfully");

                const responseHeaders = new Headers();
                responseHeaders.set("Access-Control-Allow-Origin", origin);
                console.log("Setting response headers:", responseHeaders);

                console.log("Returning successful form submission response");
                return new Response("Form submission successful", {
                    headers: responseHeaders,
                    status: 200,
                });
            } catch (error) {
                console.error(`Error occurred: ${error.message}`);
                console.error("Error stack trace:", error.stack);
                return new Response(`Error: ${error.message}`, { status: 500 });
            }
        }

        console.log("Request not handled, returning 404");
        return new Response("Not Found", { status: 404 });
    },
};
