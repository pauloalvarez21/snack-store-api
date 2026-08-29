import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

@Injectable()
export class TransactionTracingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('TransactionTracing');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const responseTime = Date.now() - now;
        this.logger.log(`[OK] ${method} ${url} - ${responseTime}ms`);
      }),
      catchError((err) => {
        const responseTime = Date.now() - now;
        this.logger.error(
          `[FAIL] ${method} ${url} - ${responseTime}ms - Error: ${err.message}`,
        );
        return throwError(() => err);
      }),
    );
  }
}
