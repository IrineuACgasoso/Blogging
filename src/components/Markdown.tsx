import ReactMarkdown from 'react-markdown';

const PREFIX = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/photos/`;

// Sem HTML bruto; imagens só do nosso bucket (evita rastreadores e conteúdo externo).
export default function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        img: ({ src, alt }) =>
          typeof src === 'string' && src.startsWith(PREFIX) ? (
            <span className="fig">
              <img src={src} alt={alt ?? ''} loading="lazy" />
              {alt ? <em>{alt}</em> : null}
            </span>
          ) : null,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
