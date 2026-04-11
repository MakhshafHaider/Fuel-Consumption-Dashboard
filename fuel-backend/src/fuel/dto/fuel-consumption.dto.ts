import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class FuelConsumptionDto {
  @IsISO8601()
  from: string;

  @IsISO8601()
  to: string;

  @IsOptional()
  @IsString()
  tz?: string;
}
