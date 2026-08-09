import { Router } from 'express';
import { THEMES } from '../constants/themes.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ themes: THEMES });
});

export default router;
