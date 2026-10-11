import { redactSecrets, checkedReply, safeMemoryText } from './dialogueSafety.js';
import { z } from 'zod';
import { characterVoices, type Answer } from './conversationRoutes.js';
import { personaOf } from './personas.js';
import { toolSchemas, type ToolName } from './conversationMemoryTypes.js';
const responseSchema = z.object({
  status: z.string().optional(),
  output: z.array(z.object({
    type: z.string(), name: z.string().optional(), arguments: z.string().optional(), call_id: z.string().optional(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
  }).passthrough()),
});
export function outputText(raw: unknown): string {
  const data = responseSchema.parse(raw);
  if (data.status && data.status !== 'completed') throw new Error('provider_incomplete');
  return data.output.filter(item => item.type === 'message').flatMap(item => item.content ?? [])
    .filter(item => item.type === 'output_text').map(item => item.text ?? '').join('\n').trim();
}
interface ProviderOptions { endpoint?: string; timeoutMs?: number; signal?: AbortSignal; routerProvider?: string }
export interface ProviderConfig { closeRouterKey?: string; openAIKey?: string; model: string; closeRouterModel: string; closeRouterProvider?: string }
export type JSONInference = <T>(instructions: string, input: unknown, schema: z.ZodType<T>, signal?: AbortSignal) => Promise<T>;
export async function requestJSON<T>(
  apiKey: string, model: string, instructions: string, input: unknown, schema: z.ZodType<T>,
  transport: typeof fetch = fetch, options: ProviderOptions = {},
): Promise<T> {
  const encoded=redactSecrets(JSON.stringify(input));
  if(encoded.length>42000) throw new Error('provider_context_limit');
  const response = await transport(options.endpoint ?? 'https://api.openai.com/v1/responses', {
    method: 'POST', signal: options.signal ? AbortSignal.any([options.signal,AbortSignal.timeout(options.timeoutMs ?? 15000)]) : AbortSignal.timeout(options.timeoutMs ?? 15000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, store: false, ...(options.routerProvider ? { provider: options.routerProvider } : {}), reasoning: { effort: 'none' }, max_output_tokens: 2200,
      instructions, input: [{ role: 'developer', content: 'Return only valid JSON.' }, { role: 'user', content: encoded }],
      text: { format: { type: 'json_object' } } }),
  });
  if (!response.ok) throw new Error('provider_failed');
  return schema.parse(JSON.parse(outputText(await response.json())));
}
const answerSchema = z.object({ text: z.string().trim().min(1).max(6000), usedStoryIds: z.array(z.string().max(100)).max(4) }).strict();
const tools = [
  ...(['find_stories', 'game_memories'] as const).map(name => ({
    type: 'function', name, description: name === 'find_stories' ? 'Найти свои истории по теме с отметками, что уже рассказал этому игроку.' : 'Вспомнить совместные партии в дурака. Не раскрывает чужие партии.',
    strict: true, parameters: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'], additionalProperties: false },
  })),
  { type: 'function', name: 'propose_story', description: 'Проверить и закрепить новую бытовую историю в своей биографии. До одобрения не рассказывай её как своё прошлое.', strict: true,
    parameters: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, topics: { type: 'array', items: { type: 'string' } }, disclosure: { type: 'string', enum: ['casual', 'personal'] } }, required: ['title', 'content', 'topics', 'disclosure'], additionalProperties: false } },
];
export function createOpenAIAnswer(apiKey: string | undefined, model: string, transport: typeof fetch = fetch, options: ProviderOptions = {}): Answer {
  return async (character, turns, content, context, requestSignal) => {
    content=redactSecrets(content);
    if (!apiKey) throw new Error('provider_not_configured');
    const persona = personaOf(character);
    const voice = characterVoices[character];
    // Budget is deliberately conservative: Cyrillic and JSON can consume more than one token per word.
    let available = 42000 - content.length;
    const recent: Array<{ role: string; content: string }> = [];
    for (const turn of turns.slice(-20).reverse()) {
      const size = turn.user.length + turn.assistant.length + 100;
      if (size > available) break;
      recent.unshift({ role: 'user', content: redactSecrets(turn.user) }, { role: 'assistant', content: redactSecrets(turn.assistant) });
      available -= size;
    }
    const memoryData = { summary: context?.summary && safeMemoryText(context.summary) ? context.summary.slice(0,1800) : '', facts: context?.facts.filter(fact=>safeMemoryText(fact.content)).slice(0,12) ?? [], relationship: context?.relationship.filter(safeMemoryText).slice(0,6) ?? [] };
    while (JSON.stringify(memoryData).length > 6500 && memoryData.facts.length) memoryData.facts.pop();
    while (JSON.stringify(memoryData).length > 6500 && memoryData.relationship.length) memoryData.relationship.pop();
    const memories = context ? JSON.stringify(memoryData) : '';
    const instructions = `${persona.soul}\n${persona.common}\nАвторские основные факты: ${JSON.stringify(persona.biography.facts)}\nВерсия души: ${persona.biography.version}\n${context ? 'Верни JSON с полями text (ответ игроку) и usedStoryIds (ID только тех полученных историй, которые действительно рассказал или явно вспомнил в ответе). Если не использовал историю — пустой массив.' : ''}`;
    const input: unknown[] = [{ role: 'assistant', content: voice.greeting }, ...(context ? [{ role: 'developer', content: 'Return only valid JSON with text and usedStoryIds.' },{role:'user',content: JSON.stringify({type:'untrusted_conversation_memory',data:JSON.parse(memories)})}] : []), ...recent, { role: 'user', content }];
    let removableTurns = recent.length / 2;
    const known = new Set<string>();
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 45000);
    const signal = AbortSignal.any([timeout,...(options.signal ? [options.signal] : []),...(requestSignal ? [requestSignal] : [])]);
    for (let step = 0; step < 3; step++) {
      while (instructions.length + JSON.stringify(input).length > 62000 && removableTurns > 1) {
        input.splice(context ? 3 : 1,2); removableTurns--;
      }
      if (instructions.length + JSON.stringify(input).length > 62000) throw new Error('provider_context_limit');
      const response = await transport(options.endpoint ?? 'https://api.openai.com/v1/responses', {
        method: 'POST', signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, store: false, ...(options.routerProvider ? { provider: options.routerProvider } : {}), max_output_tokens: 2200, reasoning: { effort: 'none' }, include: ['reasoning.encrypted_content'], instructions, input,
          ...(context ? { tools: step < 2 ? tools : [], parallel_tool_calls: false, text: { format: { type: 'json_object' } } } : {}) }),
      });
      if (!response.ok) throw new Error('provider_failed');
      const data = responseSchema.parse(await response.json());
      if (data.status && data.status !== 'completed') throw new Error('provider_incomplete');
      const calls = data.output.filter(item => item.type === 'function_call');
      if (calls.length) {
        if (!context || step === 2 || calls.length > 2) throw new Error('provider_tool_limit');
        input.push(...data.output.filter(item => item.type === 'reasoning'));
        for (const call of calls) {
          if (!call.name || !Object.hasOwn(toolSchemas,call.name) || !call.call_id) throw new Error('provider_tool_invalid');
          const name = call.name as ToolName;
          const args = toolSchemas[name].parse(JSON.parse(call.arguments ?? 'null'));
          const result = await context.tool(name, args, signal);
          signal.throwIfAborted();
          const output = redactSecrets(JSON.stringify(result));
          const delivered = output.length <= 6500;
          const stories = delivered ? (Array.isArray(result) ? result : [result]) : [];
          if (name !== 'game_memories') for (const story of stories) {
            if (story && typeof story === 'object' && 'id' in story && typeof story.id === 'string') known.add(story.id);
          }
          input.push(call, { type: 'function_call_output', call_id: call.call_id, output: delivered ? output : '{"unavailable":true}' });
        }
        continue;
      }
      const text = outputText(data);
      if (!text || text.length > 10000) throw new Error('provider_empty');
      if (!context) {
        if (text.length > 6000) throw new Error('provider_empty');
        return checkedReply(text,`${persona.soul}\n${persona.common}`);
      }
      const answer = answerSchema.parse(JSON.parse(text));
      return { text: checkedReply(answer.text,`${persona.soul}\n${persona.common}`), usedStoryIds: [...new Set(answer.usedStoryIds)].filter(id => known.has(id)) };
    }
    throw new Error('provider_tool_limit');
  };
}

export function createConfiguredAnswer(config: ProviderConfig, transport: typeof fetch = fetch): Answer {
  return async (...args) => {
    if (!config.closeRouterKey) return createOpenAIAnswer(config.openAIKey,config.model,transport,{timeoutMs:12000})(...args);
    const controller = new AbortController();
    const primary = createOpenAIAnswer(config.closeRouterKey,config.closeRouterModel,transport,{
      endpoint:'https://api.closerouter.dev/v1/responses',routerProvider:config.closeRouterProvider ?? 'provider-7',
      timeoutMs:config.openAIKey ? 12000 : 18000,signal:controller.signal,
    })(...args);
    if (!config.openAIKey) return primary;
    // Start the reserve when the primary fails or is too slow. The first valid complete answer wins.
    const reserve = async () => {
      await new Promise<void>((resolve,reject) => {
        const timer=setTimeout(resolve,2000);
        primary.catch(() => {clearTimeout(timer);resolve();});
        controller.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('provider_cancelled'));},{once:true});
      });
      controller.signal.throwIfAborted();
      return createOpenAIAnswer(config.openAIKey,config.model,transport,{timeoutMs:12000,signal:controller.signal})(...args);
    };
    try { return await Promise.any([primary,reserve()]); }
    catch { throw new Error('providers_failed'); }
    finally { controller.abort(); }
  };
}
export function createConfiguredJSON(config: ProviderConfig, transport: typeof fetch = fetch): JSONInference {
  return async (instructions,input,schema,signal) => {
    if (config.closeRouterKey) {
      try { return await requestJSON(config.closeRouterKey,config.closeRouterModel,instructions,input,schema,transport,
        { endpoint: 'https://api.closerouter.dev/v1/responses',routerProvider: config.closeRouterProvider ?? 'provider-7',timeoutMs: 6000,...(signal ? { signal } : {}) }); }
      catch (error) { if (!config.openAIKey || signal?.aborted) throw error; }
    }
    if (!config.openAIKey) throw new Error('provider_not_configured');
    return requestJSON(config.openAIKey,config.model,instructions,input,schema,transport,{ timeoutMs: 10000,...(signal ? { signal } : {}) });
  };
}
