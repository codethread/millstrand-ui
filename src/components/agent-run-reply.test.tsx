import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AgentRunReply } from './agent-run-reply';

it('starts collapsed without mounting reply queries or their workspace readers', () => {
  // No Query/Router providers: a collapsed disclosure must not mount its data surface.
  const html = renderToStaticMarkup(<AgentRunReply id="run" />);
  expect(html).toContain('Prompt and agent reply</summary>');
  expect(html).not.toContain('open=""');
  expect(html).not.toContain('Loading reply');
});
