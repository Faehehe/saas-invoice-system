import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.tenantId) {
      throw new ForbiddenException('No tenant context');
    }

    // SET LOCAL only lasts for the current transaction
    // This is critical for connection pooling — it doesn't leak to other requests
    await this.prisma.$executeRawUnsafe(
      `SET LOCAL app.current_tenant_id = '${user.tenantId}'`,
    );

    return true;
  }
}