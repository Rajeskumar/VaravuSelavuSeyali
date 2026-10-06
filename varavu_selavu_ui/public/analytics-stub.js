// Queue stub for Google Analytics: records calls made before (or without) the real gtag.js.
// Kept as a file rather than inline so the Content-Security-Policy can refuse inline scripts.
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }
