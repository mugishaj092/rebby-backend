import { NextFunction, Request, Response } from 'express';

import * as variantsService from './service';
import type {
  AddVariantInput,
  ProductIdParams,
  UpdateVariantInput,
  VariantIdParams,
} from './schema';

export async function addVariant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params as unknown as ProductIdParams;
    const input = req.body as AddVariantInput;
    const variant = await variantsService.addVariant(req.staff!.id, id, input);
    res.status(201).json({ success: true, data: variant });
  } catch (err) {
    next(err);
  }
}

export async function updateVariant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as VariantIdParams;
    const input = req.body as UpdateVariantInput;
    const variant = await variantsService.updateVariant(req.staff!.id, id, input);
    res.status(200).json({ success: true, data: variant });
  } catch (err) {
    next(err);
  }
}

export async function removeVariant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as VariantIdParams;
    await variantsService.removeVariant(req.staff!.id, id);
    res.status(200).json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}
