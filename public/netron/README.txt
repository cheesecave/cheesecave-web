Netron 9.3.3 (https://github.com/lutzroeder/netron), MIT License, see LICENSE.
Only the files needed to open ONNX models are included.
index.html: the Content-Security-Policy is tightened (default-src 'none'; connect-src 'self' blob:; img-src 'self' data: blob:; no inline script) so the page cannot reach ipinfo.io or
Google Analytics (stock Netron does both), cannot load images from elsewhere, and cannot run inline event handlers from model text.
The hub feeds it a model through a blob: URL; see src/components/repo/preview/OnnxPreviewPanel.vue.
hub.js (ours) sets Netron's `consent` cookie so it does not show its cookie banner; index.html loads it first.
browser.js: _fetch() no longer appends its cache-busting `?cb=` to blob: URLs (a blob: URL with a query string is not found). One line.
browser.js: the `url` parameter (and the hash form) is only honoured when it is a blob: URL, so a crafted link cannot make the viewer load another address.
