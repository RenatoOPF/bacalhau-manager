import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

/** Valida o JWT do header Authorization, verifica se o funcionário segue ativo e anexa em request.user. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
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
      const emp = await this.prisma.employee.findUnique({
        where: { id: payload.sub },
        select: { active: true, role: true, username: true },
      });
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
