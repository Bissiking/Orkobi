import { parentPort, workerData } from 'node:worker_threads';
import { newAsyncContext } from 'quickjs-emscripten';
import type { QuickJSHandle } from 'quickjs-emscripten';

const port = parentPort!;
const input = workerData as {
  code: string;
  handler: string | null;
  handlers: string[];
  context: unknown;
  input: unknown;
  timeoutMs: number;
};
let sequence = 0;
const pending = new Map<number, (value: string) => void>();
port.on('message', (message: { id: number; result: string }) => {
  pending.get(message.id)?.(message.result);
  pending.delete(message.id);
});
const vm = await newAsyncContext();
vm.runtime.setMemoryLimit(16 * 1024 * 1024);
vm.runtime.setMaxStackSize(256 * 1024);
const deadline = Date.now() + input.timeoutMs;
vm.runtime.setInterruptHandler(() => Date.now() > deadline);
vm.runtime.setModuleLoader(() => {
  throw new Error('Imports unavailable.');
});
let exports: QuickJSHandle | undefined;
try {
  const rpc = vm.newAsyncifiedFunction('__rpc', async (op, args) => {
    const operation = vm.getString(op),
      json = vm.getString(args);
    if (operation.length > 60 || json.length > 16384)
      return vm.newString(
        JSON.stringify({
          ok: false,
          error: { code: 'invalid_argument', message: 'Opération refusée.' },
        }),
      );
    const id = ++sequence;
    const result = await new Promise<string>((resolve) => {
      pending.set(id, resolve);
      port.postMessage({ id, operation, json });
    });
    return vm.newString(result);
  });
  vm.setProp(vm.global, '__rpc', rpc);
  rpc.dispose();
  const context = vm.newString(JSON.stringify(input.context)),
    payload = vm.newString(JSON.stringify(input.input));
  vm.setProp(vm.global, '__context', context);
  vm.setProp(vm.global, '__input', payload);
  context.dispose();
  payload.dispose();
  vm.unwrapResult(
    vm.evalCode(`
   globalThis.__sdk = Object.freeze({
     context:Object.freeze(JSON.parse(__context)),
     execution:Object.freeze(JSON.parse(__context).execution??{id:null,idempotencyKey:null}),
     data:Object.freeze({
       list:(entity)=>JSON.parse(__rpc('data.list',JSON.stringify({entity}))),
       create:(entity,values)=>JSON.parse(__rpc('data.create',JSON.stringify({entity,values}))),
       update:(entity,id,values)=>JSON.parse(__rpc('data.update',JSON.stringify({entity,id,values}))),
       remove:(entity,id)=>JSON.parse(__rpc('data.remove',JSON.stringify({entity,id})))
     }),
     jobs:Object.freeze(Object.fromEntries(['schedule','list','cancel','retry'].map(op=>[op,(value)=>JSON.parse(__rpc('jobs.'+op,JSON.stringify({value})))]))),
     identity:Object.freeze(Object.fromEntries(['currentUser','currentOrganization'].map(op=>[op,()=>JSON.parse(__rpc('identity.'+op,'{}'))]))),
     permissions:Object.freeze({can:(permission)=>JSON.parse(__rpc('permissions.can',JSON.stringify({permission})))})
   });
 `),
  ).dispose();
  const evaluated = await vm.evalCodeAsync(input.code, 'plugin.mjs', { type: 'module' });
  exports = vm.unwrapResult(evaluated);
  for (const name of input.handlers) {
    const fn = vm.getProp(exports, name);
    const valid = vm.typeof(fn) === 'function';
    fn.dispose();
    if (!valid) throw new Error('Missing handler.');
  }
  if (input.handler) {
    const fn = vm.getProp(exports, input.handler);
    vm.setProp(vm.global, '__handler', fn);
    fn.dispose();
    const result = vm.unwrapResult(
      await vm.evalCodeAsync(
        '(()=>{const result=__handler(__sdk,JSON.parse(__input));if(result&&typeof result.then==="function")throw Error("Synchronous handler required");return JSON.stringify(result)??"null";})()',
      ),
    );
    const json = vm.getString(result);
    result.dispose();
    if (json.length > 65536) throw new Error('Result too large.');
    port.postMessage({ done: true, json });
  } else port.postMessage({ done: true, json: 'null' });
} catch {
  port.postMessage({ failed: true });
} finally {
  exports?.dispose();
  vm.dispose();
  port.close();
}
