import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
export interface JwtPayload {
    id: number;
    username: string;
    email: string;
    timezone: string;
}
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    private readonly dataSource;
    constructor(config: ConfigService, dataSource: DataSource);
    validate(payload: JwtPayload): Promise<JwtPayload>;
}
export {};
