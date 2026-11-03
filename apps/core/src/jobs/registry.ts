import { PluginManager } from '../plugins/manager.js';
import type { PlatformTransaction } from '@orkobi/database';
import { Inject, Injectable } from '@nestjs/common';
import { demoTaskHandlers } from '@orkobi/module-demo';
import type { TaskExecution } from './service.js';

export type TaskHandler = (execution: TaskExecution) => Promise<void>;
/** Seulement les modules officiels compilés avec le Core ; aucun import arbitraire. */
@Injectable()
export class JobRegistry {
  constructor(@Inject(PluginManager) private readonly plugins: PluginManager) {}
  private readonly handlers = new Map<string, TaskHandler>(
    Object.entries(demoTaskHandlers).map(([key, handler]) => [`orkobi.demo/${key}`, handler]),
  );
  async has(moduleId: string, task: string, repo: PlatformTransaction) {
    return (
      this.handlers.has(`${moduleId}/${task}`) ||
      (await this.plugins.taskAvailable(repo, moduleId, task))
    );
  }
  get(moduleId: string, task: string) {
    return (
      this.handlers.get(`${moduleId}/${task}`) ??
      (async (execution) => {
        await this.plugins.invoke(
          execution.context,
          moduleId,
          task,
          {},
          execution.signal,
          execution.id,
          execution.idempotencyKey,
        );
      })
    );
  }
}
