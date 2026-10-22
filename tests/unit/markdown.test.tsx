import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// O componente lê VITE_SUPABASE_URL ao ser carregado; fixamos antes do import.
const BUCKET = 'https://meuprojeto.supabase.co/storage/v1/object/public/photos/';
let Markdown: typeof import('../../src/components/Markdown').default;
beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://meuprojeto.supabase.co');
  Markdown = (await import('../../src/components/Markdown')).default;
});
const html = (md: string) => renderToStaticMarkup(<Markdown>{md}</Markdown>);

describe('Markdown (proteção contra XSS e conteúdo externo)', () => {
  it('imagem do nosso bucket é exibida', () => {
    expect(html(`![legenda](${BUCKET}posts/a.webp)`)).toContain(`src="${BUCKET}posts/a.webp"`);
  });
  it('imagem de site externo é descartada (rastreadores)', () => {
    expect(html('![x](https://evil.example/pixel.png)')).not.toContain('<img');
  });
  it('imagem com prefixo parecido, mas de outro domínio, é descartada', () => {
    expect(html('![x](https://meuprojeto.supabase.co.evil.com/storage/v1/object/public/photos/a.png)')).not.toContain(
      '<img',
    );
  });
  it('HTML bruto não vira elemento (script)', () => {
    const out = html('oi <script>alert(1)</script> tchau');
    expect(out).not.toContain('<script');
  });
  it('HTML bruto não vira elemento (img com onerror)', () => {
    const out = html('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<img');
    expect(out).not.toMatch(/<[^>]+onerror=/i);
  });
  it('link javascript: não vira href perigoso', () => {
    expect(html('[clique](javascript:alert(1))')).not.toMatch(/href="javascript:/i);
  });
  it('texto, negrito e links normais continuam funcionando', () => {
    const out = html('**oi** [site](https://exemplo.com)');
    expect(out).toContain('<strong>oi</strong>');
    expect(out).toContain('href="https://exemplo.com"');
  });
});
