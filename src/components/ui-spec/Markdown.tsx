import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";

/**
 * Rendered Markdown for documents, pages and chat cards: real headings, lists, tables, quotes, code and images.
 * No raw HTML is ever rendered, and images must be https.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("text-[14.5px] leading-relaxed text-neutral-700", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children: c }) => <h1 className="mb-3 mt-7 font-heading text-[26px] font-semibold tracking-tight text-neutral-900 first:mt-0">{c}</h1>,
          h2: ({ children: c }) => <h2 className="mb-2 mt-6 font-heading text-[20px] font-semibold tracking-tight text-neutral-900 first:mt-0">{c}</h2>,
          h3: ({ children: c }) => <h3 className="mb-1.5 mt-5 text-[16px] font-semibold text-neutral-900 first:mt-0">{c}</h3>,
          h4: ({ children: c }) => <h4 className="mb-1 mt-4 text-[14px] font-semibold uppercase tracking-wide text-neutral-500">{c}</h4>,
          p: ({ children: c }) => <p className="my-3 first:mt-0 last:mb-0">{c}</p>,
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" className="text-[#4379EE] underline underline-offset-2 hover:text-[#3567D6]">
              {c}
            </a>
          ),
          strong: ({ children: c }) => <strong className="font-semibold text-neutral-900">{c}</strong>,
          ul: ({ children: c }) => <ul className="my-3 ml-5 list-disc space-y-1 marker:text-neutral-400">{c}</ul>,
          ol: ({ children: c }) => <ol className="my-3 ml-5 list-decimal space-y-1 marker:text-neutral-400">{c}</ol>,
          li: ({ children: c }) => <li className="pl-0.5">{c}</li>,
          input: ({ checked }) => <input type="checkbox" checked={Boolean(checked)} readOnly className="mr-1.5 size-3.5 align-middle accent-[#4379EE]" />,
          blockquote: ({ children: c }) => <blockquote className="my-4 border-l-2 border-[#4379EE] bg-neutral-50 py-1 pl-4 pr-3 text-neutral-700">{c}</blockquote>,
          hr: () => <hr className="my-6 border-neutral-200" />,
          pre: ({ children: c }) => <pre className="my-4 overflow-x-auto rounded-lg bg-neutral-100 p-3 text-[12.5px] leading-snug text-neutral-800">{c}</pre>,
          code: ({ className: codeClass, children: c }) =>
            codeClass ? (
              <code className={codeClass}>{c}</code>
            ) : (
              <code className="rounded bg-neutral-100 px-1 py-0.5 text-[0.88em] text-neutral-800">{c}</code>
            ),
          img: ({ src, alt }) =>
            typeof src === "string" && /^https:\/\//i.test(src) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={alt ?? ""} loading="lazy" className="my-4 max-h-96 w-full rounded-xl object-cover" />
            ) : null,
          table: ({ children: c }) => (
            <div className="my-4 overflow-x-auto rounded-xl border border-neutral-200">
              <table className="w-full border-collapse text-left text-[13.5px]">{c}</table>
            </div>
          ),
          thead: ({ children: c }) => <thead className="bg-neutral-50">{c}</thead>,
          th: ({ children: c }) => <th className="border-b border-neutral-200 px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-neutral-500">{c}</th>,
          td: ({ children: c }) => <td className="border-b border-neutral-100 px-3 py-2 align-top text-neutral-800">{c}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
