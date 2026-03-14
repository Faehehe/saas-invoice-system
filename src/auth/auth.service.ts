import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // ============================================================
  // REGISTER — Creates a new tenant + owner user in ONE transaction
  // ============================================================
  async register(dto: RegisterDto) {
    // Check if tenant slug already taken
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
    });
    if (existingTenant) {
      throw new ConflictException('Tenant slug already exists');
    }

    // Hash password — NEVER store plain text passwords
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Transaction: create tenant + user together
    // If user creation fails, tenant creation rolls back too
    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName,
          slug: dto.tenantSlug,
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: 'OWNER', // First user is always the owner
        },
      });

      return { tenant, user };
    });

    // Generate tokens for immediate login after registration
    return this.generateTokenPair(result.user);
  }

  // ============================================================
  // LOGIN — Verify credentials, return tokens
  // ============================================================
  async login(dto: LoginDto) {
    // Find the tenant first
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
    });
    if (!tenant) {
      // Don't reveal whether tenant or email was wrong
      throw new UnauthorizedException('Invalid credentials');
    }

    // Find user within that tenant
    const user = await this.prisma.user.findUnique({
      where: {
        tenantId_email: {
          tenantId: tenant.id,
          email: dto.email,
        },
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Compare password with stored hash
    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokenPair(user);
  }

  // ============================================================
  // REFRESH — Rotate refresh token, detect theft
  // ============================================================
  async refreshTokens(refreshToken: string) {
    // Hash the incoming token to find it in DB
    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // THEFT DETECTION: If token was already used (revoked), someone stole it
    // Revoke the ENTIRE family — all tokens from this login session
    if (storedToken.isRevoked) {
      await this.prisma.refreshToken.updateMany({
        where: { family: storedToken.family },
        data: { isRevoked: true },
      });
      throw new UnauthorizedException(
        'Token reuse detected. All sessions revoked for security.',
      );
    }

    // Check expiration
    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Revoke old token
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    // Generate new pair with SAME family (links to original login)
    return this.generateTokenPair(storedToken.user, storedToken.family);
  }

  // ============================================================
  // LOGOUT — Revoke entire token family
  // ============================================================
  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
    });

    if (storedToken) {
      await this.prisma.refreshToken.updateMany({
        where: { family: storedToken.family },
        data: { isRevoked: true },
      });
    }

    return { message: 'Logged out successfully' };
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private async generateTokenPair(user: any, family?: string) {
    // What goes inside the JWT — this is readable by anyone!
    // Never put sensitive data here
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };

    // Short-lived access token (15 min)
    const accessToken = this.jwtService.sign(payload);

    // Long-lived refresh token (random string, NOT a JWT)
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const refreshTokenHash = this.hashToken(refreshToken);

    // Store refresh token hash in DB (never store the raw token)
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        family: family || crypto.randomUUID(), // new family if first login
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  // Hash token before storing — same idea as password hashing
  // If DB is breached, attacker can't use the hashed tokens
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}