import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';
import { EOL } from 'node:os';

const allowedOrigins = ['https://civiclabs.us', 'https://civic-labs.ai', 'http://localhost:51287'];

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin');
        console.log(`Received request from origin: ${origin}`);

        // Handle CORS preflight requests
        if (request.method === 'OPTIONS') {
            const responseHeaders = new Headers();
            responseHeaders.set('Access-Control-Allow-Origin', allowedOrigins.includes(origin) ? origin : '*');
            responseHeaders.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
            responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type');
            return new Response(null, { headers: responseHeaders, status: 204 });
        }

        if (request.method === 'POST' && url.pathname === '/api/contact') {
            if (!allowedOrigins.includes(origin)) {
                console.warn(`Origin not allowed: ${origin}`);
                return new Response('Origin not allowed', { status: 403 });
            }

            try {
                const { name, email, company, message } = await request.json();
                console.log(`Received data: ${JSON.stringify({ name, email, company, message })}`);

                if (!name || !email || !company || !message) {
                    console.error('Missing required fields');
                    return new Response('Missing required fields', { status: 400 });
                }

                const emailContent = `
Name: ${name}
Email: ${email}
Company: ${company}
Message: ${message}
                `;

                // Create MIME message
                try {
                    const msg = createMimeMessage();
                    msg.setSender({ name: "CivicLabs", addr: env.FROM_EMAIL });
                    msg.setRecipient(env.SEB.destination_address);
                    msg.setSubject(`New Contact Form Submission from ${name}`);
                    msg.addMessage({
                        contentType: 'text/plain',
                        data: emailContent
                    });
                    msg.setHeader("Reply-To", email);

                    const rawEmail = msg.asRaw();
                    console.log(`Constructed email content: ${rawEmail}`);

                    const emailMessage = new EmailMessage(
                        env.FROM_EMAIL,
                        env.SEB.destination_address,
                        rawEmail
                    );

                    await env.SEB.send(emailMessage);
                    console.log('Email sent successfully');
                } catch (mimeError) {
                    console.error(`MIME error: ${mimeError.message}`);
                    return new Response(`MIME error: ${mimeError.message}`, { status: 500 });
                }

                const responseHeaders = new Headers();
                responseHeaders.set('Access-Control-Allow-Origin', origin);

                return new Response('Form submission successful', { headers: responseHeaders, status: 200 });
            } catch (error) {
                console.error(`Error: ${error.message}`);
                return new Response(`Error: ${error.message}`, { status: 500 });
            }
        }

        return new Response('Not Found', { status: 404 });
    }
};
