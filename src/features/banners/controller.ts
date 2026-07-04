import { NextFunction, Request, Response } from 'express';

import * as bannersService from './service';
import type { BannerIdParams, CreateBannerInput, UpdateBannerInput } from './schema';

export async function createBanner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as CreateBannerInput;
    const banner = await bannersService.createBanner(req.staff!.id, input);
    res.status(201).json({ success: true, data: banner });
  } catch (err) {
    next(err);
  }
}

export async function updateBanner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params as unknown as BannerIdParams;
    const input = req.body as UpdateBannerInput;
    const banner = await bannersService.updateBanner(req.staff!.id, id, input);
    res.status(200).json({ success: true, data: banner });
  } catch (err) {
    next(err);
  }
}

export async function deleteBanner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params as unknown as BannerIdParams;
    await bannersService.deleteBanner(req.staff!.id, id);
    res.status(200).json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}
