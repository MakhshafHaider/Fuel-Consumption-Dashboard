import { CanActivate, ExecutionContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
export declare class ImeiOwnershipGuard implements CanActivate {
    private readonly dataSource;
    private readonly logger;
    constructor(dataSource: DataSource);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
