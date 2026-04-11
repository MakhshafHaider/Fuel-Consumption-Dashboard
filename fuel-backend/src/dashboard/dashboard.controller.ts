import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsISO8601, IsOptional, IsString } from 'class-validator';
import { DashboardService } from './dashboard.service';

class DateRangeDto {
  @IsISO8601()
  from: string;

  @IsISO8601()
  to: string;

  @IsOptional()
  @IsString()
  tz?: string;
}

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  private readonly logger = new Logger(DashboardController.name);

  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  async getSummary(
    @Request() req: { user: { id: number } },
    @Query() query: DateRangeDto,
  ) {
    if (!query.from || !query.to) {
      throw new BadRequestException("'from' and 'to' query params are required");
    }

    this.logger.log(
      `GET /dashboard/summary for user ${req.user.id} from=${query.from} to=${query.to}`,
    );

    const summary = await this.dashboardService.getSummary(
      req.user.id,
      query.from,
      query.to,
    );

    return {
      success: true,
      message: 'Dashboard summary fetched successfully',
      data: summary,
    };
  }

  @Get('fleet-ranking')
  async getFleetRanking(
    @Request() req: { user: { id: number } },
    @Query() query: DateRangeDto,
  ) {
    if (!query.from || !query.to) {
      throw new BadRequestException("'from' and 'to' query params are required");
    }

    this.logger.log(
      `GET /dashboard/fleet-ranking for user ${req.user.id} from=${query.from} to=${query.to}`,
    );

    const ranking = await this.dashboardService.getFleetRanking(
      req.user.id,
      query.from,
      query.to,
    );

    return {
      success: true,
      message: 'Fleet ranking calculated',
      data: ranking,
    };
  }
}
