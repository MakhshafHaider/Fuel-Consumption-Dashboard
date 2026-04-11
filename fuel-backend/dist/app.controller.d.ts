export declare class AppController {
    health(): {
        success: boolean;
        message: string;
        data: {
            status: string;
            timestamp: string;
        };
    };
}
