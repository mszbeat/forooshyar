import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
export function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(result.error.flatten());
  return result.data;
}
export const id = z.string().uuid();
export const text = z.string().trim().min(1).max(200);
export const optionalText = z.string().trim().max(2000);
export const integer = z.number().int().min(0).max(2147483647);
