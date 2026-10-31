import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://luochang212.github.io',
  base: '/dsh-god-view',
  output: 'static',
  integrations: [
    sitemap({
      customPages: [
        'https://luochang212.github.io/dsh-god-view/decisions/folio.zh.html',
        'https://luochang212.github.io/dsh-god-view/decisions/folio.en.html',
        'https://luochang212.github.io/dsh-god-view/decisions/signal.zh.html',
        'https://luochang212.github.io/dsh-god-view/decisions/signal.en.html',
      ],
    }),
  ],
  build: { format: 'directory' },
});
