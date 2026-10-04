<script setup>
import MarkdownViewer from "@/components/common/MarkdownViewer.vue";

const content = `# Self-host CheeseCave

CheeseCave consists of three independent repositories:

- [cheesecave-backend](https://github.com/cheesecave/cheesecave-backend): API, workers and storage integrations.
- [cheesecave-web](https://github.com/cheesecave/cheesecave-web): this public website, served at the root URL.
- [cheesecave-admin](https://github.com/cheesecave/cheesecave-admin): the Admin portal, served at /admin/.

Follow each repository's README for development and container builds. Run the backend with its PostgreSQL, LakeFS and S3-compatible services, then point the frontend container's BACKEND_URL at the API and ADMIN_URL at the optional Admin service. Preserve same-origin /api/ and /resolve/ routing so login sessions and downloads work together.

For development, use Node.js 20.19+ and pnpm 10.18.1. In this repository run pnpm install, pnpm dev, pnpm test and pnpm build. VITE_BACKEND_URL defaults to http://localhost:48888 and VITE_ADMIN_URL defaults to http://localhost:5174.

Configure object-storage CORS to allow your website origin and expose Content-Range for browser metadata previews. Keep secrets in local environment files. The reference documentation includes upstream historical examples; use the standalone repository READMEs for current commands.

Derived from [KohakuHub](https://github.com/KohakuBlueleaf/KohakuHub) and the [DeepGHS fork](https://github.com/deepghs/KohakuHub); original license notices are retained.`;
</script>

<template>
  <div class="container-main py-8"><MarkdownViewer :content="content" /></div>
</template>
