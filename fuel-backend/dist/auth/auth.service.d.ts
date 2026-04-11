import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { LoginDto } from './dto/login.dto';
export declare class AuthService {
    private readonly dataSource;
    private readonly jwtService;
    private readonly logger;
    constructor(dataSource: DataSource, jwtService: JwtService);
    login(dto: LoginDto): Promise<{
        token: string;
        expiresIn: string;
    }>;
}
