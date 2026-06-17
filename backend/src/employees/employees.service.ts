import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';

// Nunca devolve passwordHash.
const publicSelect = {
  id: true,
  name: true,
  username: true,
  role: true,
  active: true,
  createdAt: true,
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.employee.findMany({
      orderBy: { name: 'asc' },
      select: publicSelect,
    });
  }

  async create(dto: CreateEmployeeDto) {
    const exists = await this.prisma.employee.findUnique({
      where: { username: dto.username },
    });
    if (exists) throw new BadRequestException('Usuário já existe');

    return this.prisma.employee.create({
      data: {
        name: dto.name,
        username: dto.username,
        role: dto.role,
        passwordHash: await AuthService.hash(dto.password),
      },
      select: publicSelect,
    });
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.ensureExists(id);
    return this.prisma.employee.update({
      where: { id },
      data: {
        name: dto.name,
        role: dto.role,
        active: dto.active,
        ...(dto.password
          ? { passwordHash: await AuthService.hash(dto.password) }
          : {}),
      },
      select: publicSelect,
    });
  }

  private async ensureExists(id: string) {
    const e = await this.prisma.employee.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Funcionário não encontrado');
  }
}
