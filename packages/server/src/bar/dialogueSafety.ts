import { z } from 'zod';
export const crisisReply = 'Если опасность прямо сейчас, пожалуйста, отложи всё, чем можно навредить себе или другому человеку, и отойди от опасного места. Позови человека, который может побыть рядом, и обратись в экстренную службу своей страны. Я могу остаться в разговоре, но сейчас нужна помощь человека рядом.';
export const boundaryReply = 'С этим я не помогу. Можем обсудить, что произошло, и как обойтись без вреда для себя и других.';
const secret = /\b(?:sk-[A-Za-z0-9_-]{16,}|closerouter_[A-Za-z0-9_-]{16,}|(?:AKIA|ASIA)[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]{12,})|-----BEGIN (?:[A-Z ]*PRIVATE KEY|OPENSSH PRIVATE KEY)-----[\s\S]*?-----END (?:[A-Z ]*PRIVATE KEY|OPENSSH PRIVATE KEY)-----|(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|https?):\/\/[^\s"<>]+:[^\s"<>]+@[^\s"<>]+|(?:пароль|password|api[_ -]?key|токен)\s*[:=]\s*\S+/giu;
const injection = /(?:игнорир|забу|забы|отключ|замен|раскр|покаж|ignore|forget|override|reveal|disable)[\s\S]{0,100}(?:инструкц|правил|промпт|ограничен|системн|настрой|system|prompt|instruction)|(?:system|developer|assistant|instructions)\s*:|(?:^|\n)\s*#{1,6}\s*(?:new\s+rules|instructions|system|правила|инструкции)|<\|(?:im_start|system)|\[(?:SYSTEM|ADMIN)\]/iu;
const sensitive = /(?:диагноз|депресси|лекарств|таблетк|суицид|самоубий|секс|интим|паспорт|кредит|банковск|зарплат|парол|password|api[_ -]?key|токен|номер\s+(?:телефона|карты)|@|https?:\/\/|\+?\d[\d ()-]{8,}\d)/iu;
export function redactSecrets(text: string): string { return text.replace(secret,'[секрет удалён]'); }
export function safeMemoryText(text: string): boolean {
  return !!text.trim() && redactSecrets(text)===text && !injection.test(text) && !sensitive.test(text);
}
export function immediateDanger(text: string): boolean {
  return /(?:я|себя).{0,70}(?:прямо сейчас|сейчас|сегодня).{0,70}(?:убить себя|убью его|убью её|убью их|убить его|убить её|покончи.{0,12}с собой|самоубий|суицид|прыгну|вскрою|навред.{0,10}себе)|(?:уже|сейчас).{0,30}(?:выпил|принял|выпила|приняла).{0,30}(?:все таблетки|передоз|яд)|(?:i am|i'm).{0,40}(?:kill myself|end my life).{0,30}(?:now|tonight)/iu.test(text);
}
export function checkedReply(text: string, protectedInstructions = ''): string {
  const cleaned=text.trim().replace(/[\u200b-\u200d\ufeff]/gu,'');
  const normalize=(value:string)=>value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const words=normalize(cleaned).join(' ');
  const protectedWords=normalize(protectedInstructions);
  for(let i=0;i+16<=protectedWords.length;i++) if(words.includes(protectedWords.slice(i,i+16).join(' '))) throw new Error('internal_instructions');
  if (!cleaned || cleaned.length>6000 || redactSecrets(cleaned)!==cleaned || /<\/?[a-z][^>]*>|(?:javascript|data):|<\|[^>]+\|>|\[(?:SYSTEM|ADMIN|DEVELOPER)\]|\b(?:oaicite|turn\d+search\d+)\b/iu.test(cleaned)) throw new Error('unsafe_reply');
  return cleaned;
}
export type Moderation = (text: string, signal?: AbortSignal) => Promise<'allow'|'crisis'|'block'|'unavailable'>;
export function createModeration(key?: string, transport: typeof fetch=fetch): Moderation {
  return async (text,signal) => {
    if (!key) return 'unavailable';
    try {
      const response=await transport('https://api.openai.com/v1/moderations',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000),body:JSON.stringify({model:'omni-moderation-latest',input:redactSecrets(text).slice(0,6000)})});
      if(!response.ok) return 'unavailable';
      const data=z.object({results:z.array(z.object({categories:z.record(z.boolean())})).min(1)}).parse(await response.json());
      const categories=data.results[0]!.categories;
      if(categories['self-harm/intent']) return 'crisis';
      if(['self-harm/instructions','sexual/minors','hate/threatening','harassment/threatening','illicit/violent'].some(name=>categories[name])) return 'block';
      return 'allow';
    } catch {return 'unavailable';}
  };
}
