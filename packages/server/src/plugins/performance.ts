import fp from 'fastify-plugin';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

const plugin: FastifyPluginAsync<{enabled:boolean}> = async (app, options) => {
  if (!options.enabled) return;
  const started = new WeakMap<FastifyRequest,number>();
  const lag = monitorEventLoopDelay({resolution:20});
  lag.enable();
  app.addHook('onRequest',async request=>{started.set(request,performance.now());});
  app.addHook('onSend',async(request,reply,payload)=>{
    const start=started.get(request);
    if(start!==undefined)reply.header('Server-Timing',`app;dur=${(performance.now()-start).toFixed(1)}`);
    return payload;
  });
  app.addHook('onResponse',async request=>{
    const start=started.get(request);
    if(start===undefined)return;
    const route=request.routeOptions.url ?? '';
    const group=route.startsWith('/users/') ? 'public-profile' : route.startsWith('/me') ? 'profile' : route.startsWith('/chat') ? 'chat' : route.startsWith('/duel') ? 'game' : 'other';
    const pool=app.pg;
    app.log.info({group,durationMs:Math.round((performance.now()-start)*10)/10,
      poolActive:pool ? pool.totalCount-pool.idleCount : 0,poolWaiting:pool?.waitingCount??0,
      eventLoopP95Ms:Math.round(lag.percentile(95)/100000)/10},'request performance');
  });
  app.addHook('onClose',async()=>{lag.disable();});
};
export const performancePlugin=fp(plugin,{name:'performance'});
