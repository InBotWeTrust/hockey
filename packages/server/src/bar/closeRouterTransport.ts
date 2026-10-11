import { z } from 'zod';
interface InputItem { role?: string; content?: string; type?: string; call_id?: string; name?: string; arguments?: string; output?: string }
interface ResponseRequest { model:string; instructions:string; input:InputItem[]; provider?:unknown; max_output_tokens:number; tools?:Array<{type:string;name:string;description:string;parameters:unknown;strict:boolean}>; text?:{format:{type:string}} }
const chatResponse=z.object({choices:z.array(z.object({finish_reason:z.enum(['stop','tool_calls']),message:z.object({content:z.string().nullable().optional(),tool_calls:z.array(z.object({id:z.string().min(1),type:z.literal('function'),function:z.object({name:z.string().min(1),arguments:z.string()})})).optional()})})).length(1)});
// Adapt only this provider's public API. Keep direct OpenAI and its credentials separate.
export function closeRouterTransport(transport:typeof fetch):typeof fetch {
  return async(url,init)=>{
    if(String(url)!=='https://api.closerouter.dev/v1/responses') throw new Error('invalid_router_endpoint');
    const body=JSON.parse(String(init?.body)) as ResponseRequest;
    const messages:Array<Record<string,unknown>>=[{role:'system',content:body.instructions}];
    for(const item of body.input) {
      if(item.type==='reasoning') continue;
      if(item.type==='function_call') messages.push({role:'assistant',content:null,tool_calls:[{id:item.call_id,type:'function',function:{name:item.name,arguments:item.arguments}}]});
      else if(item.type==='function_call_output') messages.push({role:'tool',tool_call_id:item.call_id,content:item.output});
      else if(item.role==='user' || item.role==='assistant' || item.role==='developer') messages.push({role:item.role==='developer' ? 'system' : item.role,content:item.content});
      else throw new Error('invalid_router_message');
    }
    const response=await transport('https://api.closerouter.dev/v1/chat/completions',{...init,body:JSON.stringify({model:body.model,provider:body.provider,store:false,messages,max_tokens:body.max_output_tokens,reasoning_effort:'none',
      ...(body.tools ? {tools:body.tools.map(({type,...definition})=>({type,function:definition})),parallel_tool_calls:false} : {}),
      ...(body.text ? {response_format:{type:'json_object'}} : {}),
    })});
    if(!response.ok) return response;
    const data=chatResponse.parse(await response.json());const choice=data.choices[0]!;
    const calls=choice.message.tool_calls ?? [];
    if(choice.finish_reason==='tool_calls' && !calls.length) throw new Error('provider_empty');
    if(choice.finish_reason==='stop' && calls.length) throw new Error('provider_incomplete');
    return Response.json({status:'completed',output: calls.length ? calls.map(call=>({type:'function_call',name:call.function.name,arguments:call.function.arguments,call_id:call.id})) : [{type:'message',content:[{type:'output_text',text:choice.message.content ?? ''}]}]});
  };
}
