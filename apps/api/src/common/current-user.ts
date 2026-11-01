import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UserSummary } from '@tishuashua/shared';
import type { AuthenticatedRequest } from '../session/session-auth.guard';

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): UserSummary => {
    return context.switchToHttp().getRequest<AuthenticatedRequest>().user;
  },
);
