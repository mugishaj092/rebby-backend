import { NextFunction, Request, Response } from 'express';

import * as homeService from './service';

export async function getHomeSections(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sections = await homeService.getHomeSections();
    res.status(200).json({ success: true, data: sections });
  } catch (err) {
    next(err);
  }
}
