import { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
export interface ResponseEnvelope<T> {
    success: boolean;
    message: string;
    data: T;
}
export declare class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, ResponseEnvelope<T>> {
    intercept(context: ExecutionContext, next: CallHandler): Observable<ResponseEnvelope<T>>;
}
