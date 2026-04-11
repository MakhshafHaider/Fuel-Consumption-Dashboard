import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return {
      success: true,
      message: 'Service is healthy',
      data: { status: 'ok', timestamp: new Date().toISOString() },
    };
  }
}
