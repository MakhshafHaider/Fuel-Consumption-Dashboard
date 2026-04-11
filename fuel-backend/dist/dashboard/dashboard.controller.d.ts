import { DashboardService } from './dashboard.service';
declare class DateRangeDto {
    from: string;
    to: string;
    tz?: string;
}
export declare class DashboardController {
    private readonly dashboardService;
    private readonly logger;
    constructor(dashboardService: DashboardService);
    getSummary(req: {
        user: {
            id: number;
        };
    }, query: DateRangeDto): Promise<{
        success: boolean;
        message: string;
        data: import("./dashboard.service").DashboardSummary;
    }>;
    getFleetRanking(req: {
        user: {
            id: number;
        };
    }, query: DateRangeDto): Promise<{
        success: boolean;
        message: string;
        data: import("./dashboard.service").FleetRanking;
    }>;
}
export {};
