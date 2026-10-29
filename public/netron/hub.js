// Loaded before index.js. Netron asks for cookie consent unless a `consent` cookie
// exists; its network access is already blocked by the page's Content-Security-Policy,
// so there is nothing to consent to here.
document.cookie = 'consent=hub; path=/netron/; max-age=31536000; SameSite=Lax';
