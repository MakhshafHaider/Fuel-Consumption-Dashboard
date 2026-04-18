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
import { ReportsService } from './reports.service';
import { ReportRangeDto } from './dto/report-range.dto';

@Controller('reports')
@UseGuards(AuthGuard('jwt'))
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);

  constructor(private readonly reportsService: ReportsService) {}

  private requireRange(query: ReportRangeDto) {
    if (!query.from || !query.to) {
      throw new BadRequestException("'from' and 'to' query params are required");
    }
  }

  /**
   * GET /reports/consumption?from=&to=
   * Fleet-level fuel consumption: consumed, refueled, cost per vehicle + totals.
   */
  @Get('consumption')
  async getConsumption(
    @Request() req: { user: { id: number } },
    @Query() query: ReportRangeDto,
  ) {
    this.requireRange(query);
    this.logger.log(
      `GET /reports/consumption user=${req.user.id} from=${query.from} to=${query.to}`,
    );
    const data = await this.reportsService.getConsumptionReport(
      req.user.id, query.from, query.to,
    );
    return {
      success: true,
      message: 'Consumption report generated',
      report: 'consumption',
      data,
    };
  }

  /**
   * GET /reports/refuels?from=&to=
   * All refueling events across entire fleet sorted by time.
   * Use for voucher verification / fraud detection.
   */
  @Get('refuels')
  async getRefuels(
    @Request() req: { user: { id: number } },
    @Query() query: ReportRangeDto,
  ) {
    this.requireRange(query);
    this.logger.log(
      `GET /reports/refuels user=${req.user.id} from=${query.from} to=${query.to}`,
    );
    const data = await this.reportsService.getRefuelsReport(
      req.user.id, query.from, query.to,
    );
    return {
      success: true,
      message: 'Refuels report generated',
      report: 'refuels',
      data,
    };
  }

  /**
   * GET /reports/idle-waste?from=&to=
   * Per-vehicle idle fuel waste (engine ON, speed < 2 km/h).
   */
  @Get('idle-waste')
  async getIdleWaste(
    @Request() req: { user: { id: number } },
    @Query() query: ReportRangeDto,
  ) {
    this.requireRange(query);
    this.logger.log(
      `GET /reports/idle-waste user=${req.user.id} from=${query.from} to=${query.to}`,
    );
    const data = await this.reportsService.getIdleWasteReport(
      req.user.id, query.from, query.to,
    );
    return {
      success: true,
      message: 'Idle waste report generated',
      report: 'idle-waste',
      data,
    };
  }

  /**
   * GET /reports/high-speed?from=&to=
   * Per-vehicle fuel waste while driving above 100 km/h.
   */
  @Get('high-speed')
  async getHighSpeed(
    @Request() req: { user: { id: number } },
    @Query() query: ReportRangeDto,
  ) {
    this.requireRange(query);
    this.logger.log(
      `GET /reports/high-speed user=${req.user.id} from=${query.from} to=${query.to}`,
    );
    const data = await this.reportsService.getHighSpeedReport(
      req.user.id, query.from, query.to,
    );
    return {
      success: true,
      message: 'High speed waste report generated',
      report: 'high-speed',
      data,
    };
  }

  /**
   * GET /reports/daily-trend?from=&to=
   * Per-vehicle daily consumption trend + fleet-level daily aggregation.
   */
  @Get('daily-trend')
  async getDailyTrend(
    @Request() req: { user: { id: number } },
    @Query() query: ReportRangeDto,
  ) {
    this.requireRange(query);
    this.logger.log(
      `GET /reports/daily-trend user=${req.user.id} from=${query.from} to=${query.to}`,
    );
    const data = await this.reportsService.getDailyTrendReport(
      req.user.id, query.from, query.to,
    );
    return {
      success: true,
      message: 'Daily trend report generated',
      report: 'daily-trend',
      data,
    };
  }

  /**
   * GET /reports/thrift?from=&to=
   * Per-vehicle thrift score (0-100), idle %, overspeed %, efficiency.
   * Sorted best → worst.
   */
  @Get('thrift')
  async getThrift(
    @Request() req: { user: { id: number } },
    @Query() query: ReportRangeDto,
  ) {
    this.requireRange(query);
    this.logger.log(
      `GET /reports/thrift user=${req.user.id} from=${query.from} to=${query.to}`,
    );
    const data = await this.reportsService.getThriftReport(
      req.user.id, query.from, query.to,
    );
    return {
      success: true,
      message: 'Thrift report generated',
      report: 'thrift',
      data,
    };
  }

  /**
   * GET /reports/engine-hours?from=&to=
   * Engine running hours per vehicle derived from ignition (acc) field.
   */
  @Get('engine-hours')
  async getEngineHours(
    @Request() req: { user: { id: number } },
    @Query() query: ReportRangeDto,
  ) {
    this.requireRange(query);
    this.logger.log(
      `GET /reports/engine-hours user=${req.user.id} from=${query.from} to=${query.to}`,
    );
    const data = await this.reportsService.getEngineHoursReport(
      req.user.id, query.from, query.to,
    );
    return {
      success: true,
      message: 'Engine hours report generated',
      report: 'engine-hours',
      data,
    };
  }

  /**
   * GET /reports/vehicle-status
   * Current status snapshot: online/offline, last seen, current fuel, GPS.
   * No date range needed — shows NOW.
   */
  @Get('vehicle-status')
  async getVehicleStatus(@Request() req: { user: { id: number } }) {
    this.logger.log(`GET /reports/vehicle-status user=${req.user.id}`);
    const data = await this.reportsService.getVehicleStatusReport(req.user.id);
    return {
      success: true,
      message: 'Vehicle status report generated',
      report: 'vehicle-status',
      data,
    };
  }

  /**
   * GET /reports/theft?from=&to=
   * Fleet-wide theft detection: analyzes fuel drops for suspicious patterns.
   * Returns per-vehicle theft risk scores, alerts, and classified drops.
   */
  @Get('theft')
  async getTheftDetection(
    @Request() req: { user: { id: number } },
    @Query() query: ReportRangeDto,
  ) {
    this.requireRange(query);
    this.logger.log(
      `GET /reports/theft user=${req.user.id} from=${query.from} to=${query.to}`,
    );
    const data = await this.reportsService.getTheftDetectionReport(
      req.user.id, query.from, query.to,
    );
    return {
      success: true,
      message: 'Theft detection report generated',
      report: 'theft',
      data,
    };
  }

  /**
   * GET /reports/trips?from=&to=
   * Per-vehicle trip analysis: detects trips from ignition on/off transitions.
   * Returns individual trips with distance, fuel consumed, duration, and efficiency.
   */
  @Get('trips')
  async getTrips(
    @Request() req: { user: { id: number } },
    @Query() query: ReportRangeDto,
  ) {
    this.requireRange(query);
    this.logger.log(
      `GET /reports/trips user=${req.user.id} from=${query.from} to=${query.to}`,
    );
    const data = await this.reportsService.getTripsReport(
      req.user.id, query.from, query.to,
    );
    return {
      success: true,
      message: 'Trips report generated',
      report: 'trips',
      data,
    };
  }
}
