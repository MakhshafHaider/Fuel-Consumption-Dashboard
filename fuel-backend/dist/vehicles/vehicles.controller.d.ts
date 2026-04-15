import { VehiclesService } from './vehicles.service';
export declare class VehiclesController {
    private readonly vehiclesService;
    private readonly logger;
    constructor(vehiclesService: VehiclesService);
    getVehicles(req: {
        user: {
            id: number;
        };
    }, hasFuelSensor?: string): Promise<{
        success: boolean;
        message: string;
        data: {
            count: number;
            vehicles: import("./vehicles.service").VehicleRow[];
        };
    }>;
}
