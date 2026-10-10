import { expect, it, vi } from 'vitest';
import { createOpenAIAnswer } from './openAIAnswer.js';
it('uses server instructions, fixed greeting and bounded conversation context without provider storage', async () => {
  const transport = vi
    .fn()
    .mockResolvedValue(
      Response.json({
        status: 'completed',
        output: [
          { type: 'reasoning' },
          { type: 'message', content: [{ type: 'output_text', text: 'Привет!' }] },
        ],
      }),
    );
  const answer = createOpenAIAnswer('test-placeholder', 'gpt-5.6-terra', transport);
  await expect(answer('maria', [], 'Как дела?')).resolves.toBe('Привет!');
  const [url, init] = transport.mock.calls[0]!;
  expect(url).toBe('https://api.openai.com/v1/responses');
  const body = JSON.parse(init.body);
  expect(body.store).toBe(false);
  expect(body.instructions).toContain('Ты Мария');
  expect(body.input[0].role).toBe('assistant');
  expect(body.input.at(-1)).toEqual({ role: 'user', content: 'Как дела?' });
  expect(init.signal).toBeInstanceOf(AbortSignal);
});
it.each([
  {
    status: 'incomplete',
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'partial' }] }],
  },
  { status: 'completed', output: [] },
  { output: [{ type: 'message', content: [{ type: 'refusal' }] }] },
])('rejects incomplete or empty output', async (body) => {
  const answer = createOpenAIAnswer(
    'test-placeholder',
    'gpt-5.6-terra',
    vi.fn().mockResolvedValue(Response.json(body)),
  );
  await expect(answer('arsenich', [], 'Привет')).rejects.toThrow();
});
it('never sends a request without a configured key', async () => {
  const transport = vi.fn();
  await expect(
    createOpenAIAnswer(undefined, 'gpt-5.6-terra', transport)('maria', [], 'Привет'),
  ).rejects.toThrow('provider_not_configured');
  expect(transport).not.toHaveBeenCalled();
});
