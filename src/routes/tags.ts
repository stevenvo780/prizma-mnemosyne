import { Router, Request, Response } from 'express';
import { SoftIAClient } from '../services/softia-client';
import { tagSchema } from '../validation/schemas';

const router = Router();
const softIAClient = new SoftIAClient();

router.get('/', async (req: Request, res: Response) => {
  try {
    const tags = await softIAClient.listTags();
    res.json({ success: true, data: tags });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, color, description } = tagSchema.parse(req.body);
    const tag = await softIAClient.createTag(name, color, description);
    res.status(201).json({ success: true, data: tag });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;