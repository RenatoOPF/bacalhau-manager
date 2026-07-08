import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import { AuthUser } from './current-user.decorator';

/** Exige que o usuário autenticado tenha um dos perfis em @Roles. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const user: AuthUser | undefined = context
      .switchToHttp()
      .getRequest().user;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Acesso negado para o seu perfil');
    }
    return true;
  }
}
