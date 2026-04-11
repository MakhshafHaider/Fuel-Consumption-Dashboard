import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ImeiOwnershipGuard implements CanActivate {
  private readonly logger = new Logger(ImeiOwnershipGuard.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const imei: string = request.params?.imei;
    const userId: number = request.user?.id;

    if (!imei || !userId) {
      throw new ForbiddenException('Access denied');
    }

    const rows: Array<{ cnt: number }> = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt FROM gs_user_objects WHERE user_id = ? AND imei = ?`,
      [userId, imei],
    );

    const owned = rows[0]?.cnt > 0;
    if (!owned) {
      this.logger.warn(
        `User ${userId} attempted unauthorized access to IMEI ${imei}`,
      );
      throw new ForbiddenException(
        'You do not have permission to access this vehicle',
      );
    }

    return true;
  }
}
