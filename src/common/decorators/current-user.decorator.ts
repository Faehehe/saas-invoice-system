import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// This lets you write @CurrentUser() in any controller
// and get the logged-in user's data from the JWT
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    if (data) {
      return request.user?.[data]; // e.g., @CurrentUser('tenantId')
    }
    return request.user;
  },
);