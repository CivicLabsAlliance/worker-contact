import { EmailMessage } from 'cloudflare:email';

const allowedOrigins = ['https://civiclabs.us', 'https://civic-labs.ai'];

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin');

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
                return new Response('Origin not allowed', { status: 403 });
            }

            try {
                const { name, email, company, message } = await request.json();

                if (!name || !email || !company || !message) {
                    return new Response('Missing required fields', { status: 400 });
                }

                const emailContent = `
                  Name: ${name}
                  Email: ${email}
                  Company: ${company}
                  Message: ${message}
                `;

                const rawEmail = `
From: ${email}
To: ${env.SEB.destination_address || '${DESTINATION_EMAIL}'}
Subject: New Contact Form Submission from ${name}

${emailContent}
                `;

                const emailMessage = new EmailMessage(
                    email,
                    env.SEB.destination_address || '${DESTINATION_EMAIL}',
                    rawEmail
                );

                await env.SEB.send(emailMessage);

                const responseHeaders = new Headers();
                responseHeaders.set('Access-Control-Allow-Origin', origin);

                return new Response('Form submission successful', { headers: responseHeaders, status: 200 });
            } catch (error) {
                return new Response(`Error: ${error.message}`, { status: 500 });
            }
        }

        return new Response('Not Found', { status: 404 });
    }
};
