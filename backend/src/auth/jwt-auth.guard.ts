import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

type CachedEmployee = {
  active: boolean;
  role: string;
  username: string;
} | null;

/** Valida o JWT do header Authorization, verifica se o funcionário segue ativo e anexa em request.user. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private static readonly CACHE_TTL_MS = 60_000;
  private static readonly empCache = new Map<
    string,
    { emp: CachedEmployee; expiresAt: number }
  >();

  static invalidate(employeeId?: string) {
    if (employeeId) {
      JwtAuthGuard.empCache.delete(employeeId);
    } else {
      JwtAuthGuard.empCache.clear();
    }
  }

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token ausente');
    }
    const token = header.slice('Bearer '.length);
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        username: string;
        role: string;
      }>(token);

      const now = Date.now();
      const cached = JwtAuthGuard.empCache.get(payload.sub);
      let emp: CachedEmployee;
      if (cached && now < cached.expiresAt) {
        emp = cached.emp;
      } else {
        emp = await this.prisma.employee.findUnique({
          where: { id: payload.sub },
          select: { active: true, role: true, username: true },
        });
        JwtAuthGuard.empCache.set(payload.sub, {
          emp,
          expiresAt: now + JwtAuthGuard.CACHE_TTL_MS,
        });
      }

      if (!emp || !emp.active) {
        throw new UnauthorizedException('Funcionário inativo ou não encontrado');
      }
      (req as Request & { user?: unknown }).user = {
        ...payload,
        username: emp.username,
        role: emp.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
  }
}
