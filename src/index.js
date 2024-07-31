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
        console.log(`DESTINATION_CA_EMAIL: ${env.DESTINATION_CA_EMAIL}`);
        console.log(`DESTINATION_HL_EMAIL: ${env.DESTINATION_HL_EMAIL}`);
        console.log(`SLACK_WEBHOOK: ${env.SLACK_WEBHOOK}`);

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
                const country = request.cf
                    ? request.cf.country || "N/A"
                    : "N/A";
                const region = request.cf ? request.cf.region || "N/A" : "N/A";
                const city = request.cf ? request.cf.city || "N/A" : "N/A";
                const timezone = request.cf
                    ? request.cf.timezone || "N/A"
                    : "N/A";

                // Create message content
                console.log("Constructing message content");
                const messageContent = `Name: ${name}\nEmail: ${email}\nCompany: ${company}\nMessage: ${message}\n
                    IP Address: ${ip}\nCountry: ${country}\nRegion: ${region}\nCity: ${city}\nTimezone: ${timezone}`;

                // Log message content for readability
                console.log(`Message Content: ${messageContent}`);

                // Create MIME message using mimetext
                console.log("Creating MIME message");
                const msg = createMimeMessage();
                try {
                    msg.setSender({ name: "CivicLabs", addr: env.FROM_EMAIL });
                    msg.setRecipients([
                        env.DESTINATION_EMAIL,
                        env.DESTINATION_CA_EMAIL,
                        env.DESTINATION_HL_EMAIL,
                    ]);
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

                // Prepare Slack webhook payload
                const slackPayload = {
                    name: name || "N/A",
                    email: email || "N/A",
                    company: company || "N/A",
                    message: message || "N/A",
                    country: country || "N/A",
                    city: city || "N/A",
                    timezone: timezone || "N/A",
                    region: region || "N/A",
                };

                console.log(
                    `Sending Slack webhook: ${JSON.stringify(slackPayload)}`
                );

                // Send Slack webhook payload
                const slackResponse = await fetch(env.SLACK_WEBHOOK, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(slackPayload),
                });

                if (!slackResponse.ok) {
                    console.error(
                        `Failed to send Slack webhook: ${slackResponse.statusText}`
                    );
                } else {
                    console.log("Slack webhook sent successfully");
                }

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
