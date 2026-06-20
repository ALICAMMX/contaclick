import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type Props = {
  children: string;
  className?: string;
  compact?: boolean;
};

/**
 * Renderiza contenido Markdown con un estilo editorial elegante,
 * sin depender del plugin @tailwindcss/typography.
 */
export function RichMarkdown({ children, className, compact = false }: Props) {
  const gap = compact ? "space-y-2" : "space-y-3.5";
  return (
    <div className={cn("text-[0.95rem] leading-relaxed text-foreground/90", gap, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-semibold tracking-tight text-foreground mt-2 mb-1.5 border-b border-border/60 pb-1.5">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold tracking-tight text-foreground mt-4 mb-1 flex items-center gap-2 before:h-4 before:w-1 before:rounded-full before:bg-primary">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-foreground mt-3 mb-1">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="leading-relaxed text-foreground/85">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-foreground/90">{children}</em>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="space-y-1.5 pl-1 marker:text-primary list-none [&>li]:relative [&>li]:pl-5 [&>li]:before:content-[''] [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-[0.6em] [&>li]:before:h-1.5 [&>li]:before:w-1.5 [&>li]:before:rounded-full [&>li]:before:bg-primary/70">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 space-y-1.5 marker:text-primary marker:font-semibold">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/60 bg-primary/5 pl-4 pr-3 py-2 rounded-r-md italic text-foreground/85">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-border/60" />,
          code: ({ className, children, ...props }: any) => {
            const inline = !className;
            if (inline)
              return (
                <code className="rounded bg-muted/70 px-1.5 py-0.5 text-[0.85em] font-mono text-foreground border border-border/40">
                  {children}
                </code>
              );
            return (
              <code className={cn("font-mono text-[0.85em]", className)} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="rounded-lg border border-border/60 bg-card/60 p-3 overflow-x-auto text-xs leading-relaxed">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-lg border border-border/60 my-2">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              {children}
            </thead>
          ),
          th: ({ children }) => <th className="text-left px-3 py-2 font-medium">{children}</th>,
          td: ({ children }) => (
            <td className="px-3 py-2 border-t border-border/40 align-top">{children}</td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
