import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function CopilotMarkdown({ content, caret = false }: { content: string; caret?: boolean }) {
  return (
    <div className="copilot-md">
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
              <img src={src} alt={alt || ""} className="copilot-md-image" />
            ) : null,
          pre: ({ children }) => <pre>{children}</pre>,
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
              <code className="copilot-md-inline-code" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
      {caret ? <span className="copilot-caret" aria-hidden /> : null}
    </div>
  );
}
