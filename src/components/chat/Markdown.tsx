import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({ content }: { content: string }) {
  return (
    <div className="chat-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
          img: ({ src, alt }) =>
            typeof src === "string" && src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={alt || ""} className="chat-md__image" />
            ) : null,
          code: ({ className: codeClass, children, ...props }) => {
            const isBlock = Boolean(codeClass);
            if (isBlock) {
              return (
                <code className={codeClass} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="chat-md__inline" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
