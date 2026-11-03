import { Injectable } from '@nestjs/common';
import { demoTaskHandlers } from '@orkobi/module-demo';
import type { TaskExecution } from './service.js';

export type TaskHandler = (execution: TaskExecution) => Promise<void>;
/** Seulement les modules officiels compilés avec le Core ; aucun import arbitraire. */
@Injectable()
export class JobRegistry {
  private readonly handlers = new Map<string, TaskHandler>(
    Object.entries(demoTaskHandlers).map(([key, handler]) => [`orkobi.demo/${key}`, handler]),
  );
  has(moduleId: string, task: string) {
    return this.handlers.has(`${moduleId}/${task}`);
  }
  get(moduleId: string, task: string) {
    return this.handlers.get(`${moduleId}/${task}`);
  }
}
