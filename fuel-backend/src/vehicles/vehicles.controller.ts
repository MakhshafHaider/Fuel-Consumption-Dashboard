import {
  Controller,
  Get,
  Logger,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
@UseGuards(AuthGuard('jwt'))
export class VehiclesController {
  private readonly logger = new Logger(VehiclesController.name);

  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  async getVehicles(
    @Request() req: { user: { id: number } },
    @Query('hasFuelSensor') hasFuelSensor?: string,
  ) {
    this.logger.log(
      `GET /vehicles for user ${req.user.id}, hasFuelSensor=${hasFuelSensor}`,
    );
    const vehicles = await this.vehiclesService.getVehiclesForUser(
      req.user.id,
      hasFuelSensor === 'true',
    );
    return {
      success: true,
      message: 'Vehicles fetched successfully',
      data: { count: vehicles.length, vehicles },
    };
  }
}
