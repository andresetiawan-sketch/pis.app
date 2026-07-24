export async function onRequest(context) {
  const url = new URL(context.request.url);
  const targetUrl = `https://api.pissintegrated.com/branding${url.pathname.replace('/branding', '')}${url.search}`;

  const headers = new Headers(context.request.headers);
  headers.set('Origin', 'https://api.pissintegrated.com');

  const response = await fetch(targetUrl, {
    method: context.request.method,
    headers: headers,
    body: context.request.method !== 'GET' && context.request.method !== 'HEAD' ? context.request.body : undefined,
  });

  const newResponse = new Response(response.body, response);
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return newResponse;
}
