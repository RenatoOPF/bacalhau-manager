import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  static hash(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /** Valida credenciais e devolve o token + dados do funcionário. */
  async login(username: string, password: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { username },
    });
    if (!employee || !employee.active) {
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }
    const ok = await bcrypt.compare(password, employee.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }

    const token = await this.jwt.signAsync({
      sub: employee.id,
      username: employee.username,
      role: employee.role,
    });

    return {
      token,
      employee: {
        id: employee.id,
        name: employee.name,
        username: employee.username,
        role: employee.role,
      },
    };
  }

  /** Dados do funcionário autenticado. */
  async me(id: string) {
    const e = await this.prisma.employee.findUnique({ where: { id } });
    if (!e) throw new UnauthorizedException();
    return { id: e.id, name: e.name, username: e.username, role: e.role };
  }
}
