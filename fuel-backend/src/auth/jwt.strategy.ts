import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface JwtPayload {
  id: number;
  username: string;
  email: string;
  timezone: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const rows: Array<{ id: number }> = await this.dataSource.query(
      `SELECT id FROM gs_users WHERE id = ? AND active = 'true' LIMIT 1`,
      [payload.id],
    );
    if (!rows.length) {
      throw new UnauthorizedException('User not found or inactive');
    }
    return payload;
  }
}
