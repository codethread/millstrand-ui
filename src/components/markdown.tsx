import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Page-independent Markdown presentation shared by issues, agents, graph and reviews. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
