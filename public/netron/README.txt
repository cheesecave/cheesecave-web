Netron 9.3.3 (https://github.com/lutzroeder/netron), MIT License, see LICENSE.
Only the files needed to open ONNX models are included.
Local change: index.html Content-Security-Policy gains `connect-src 'self' blob:`, so the
page cannot reach ipinfo.io or Google Analytics (stock Netron does both).
The hub feeds it a model through a blob: URL; see src/components/repo/preview/OnnxPreviewPanel.vue.
hub.js (ours) sets Netron's `consent` cookie so it does not show its cookie banner; index.html loads it first.
browser.js: _fetch() no longer appends its cache-busting `?cb=` to blob: URLs (a blob: URL with a query string is not found). One line.
