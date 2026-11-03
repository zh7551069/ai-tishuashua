import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AdminSummary } from '@tishuashua/shared';
import type { AdminRequest } from './admin-session.guard';

export const CurrentAdmin = createParamDecorator(
  (_: unknown, context: ExecutionContext): AdminSummary => {
    return context.switchToHttp().getRequest<AdminRequest>().admin;
  },
);
