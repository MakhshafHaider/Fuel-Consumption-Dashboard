"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
const http_exception_filter_1 = require("./common/filters/http-exception.filter");
const response_envelope_interceptor_1 = require("./common/interceptors/response-envelope.interceptor");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ['log', 'warn', 'error', 'debug'],
    });
    app.enableCors();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
    }));
    app.useGlobalFilters(new http_exception_filter_1.AllExceptionsFilter());
    app.useGlobalInterceptors(new response_envelope_interceptor_1.ResponseEnvelopeInterceptor());
    app.use((req, _res, next) => {
        const logger = new common_1.Logger('HTTP');
        logger.log(`${req.method} ${req.url}`);
        next();
    });
    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    new common_1.Logger('Bootstrap').log(`Fuel backend running on http://localhost:${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map