import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const md5 = require('md5') as (input: string) => string;
import { LoginDto } from './dto/login.dto';

interface GsUser {
  id: number;
  username: string;
  password: string;
  email: string;
  timezone: string;
  active: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<{ token: string; expiresIn: string }> {
    const rows: GsUser[] = await this.dataSource.query(
      `SELECT id, username, password, email, timezone, active
       FROM gs_users
       WHERE username = ?
       LIMIT 1`,
      [dto.username],
    );

    if (!rows.length) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const user = rows[0];

    if (user.active !== 'true' && user.active !== '1') {
      throw new UnauthorizedException('Account is inactive');
    }

    const md5Hash = md5(dto.password);
    const passwordMatch =
      user.password === dto.password || user.password === md5Hash;

    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid username or password');
    }

    this.logger.log(`User ${user.username} (id=${user.id}) logged in`);

    const payload = {
      id: user.id,
      username: user.username,
      email: user.email,
      timezone: user.timezone,
    };

    const token = this.jwtService.sign(payload);
    return { token, expiresIn: '24h' };
  }
}
