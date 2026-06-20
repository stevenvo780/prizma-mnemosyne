import { Router, Request, Response } from 'express';
import { SoftIAClient } from '../services/softia-client';
import { updateClientSchema, assignTagSchema, updateStatusSchema } from '../validation/schemas';

const router = Router();
const softIAClient = new SoftIAClient();

/**
 * POST /api/clients — DEPRECATED: This endpoint is code dead.
 * Use POST /api/customers/upsert (in index.ts) for Nous integration instead.
 * This route is kept for backwards compatibility but should not be used.
 * Protected by authenticateApiKey middleware.
 */
router.post('/', async (_req, res: Response): Promise<void> => {
  console.warn('[routes/clients] POST /api/clients called (deprecated) — use POST /api/customers/upsert instead');
  res.status(410).json({
    success: false,
    error: 'This endpoint is deprecated. Use POST /api/customers/upsert instead',
    documentation: 'See index.ts for Nous connector integration'
  });
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const client = await softIAClient.getClient(req.params.id);
    res.json({ success: true, data: client });
  } catch (error: any) {
    res.status(404).json({ success: false, error: error.message });
  }
});

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = updateClientSchema.parse(req.body);
    const client = await softIAClient.updateClient(req.params.id, validatedData);
    res.json({ success: true, data: client });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await softIAClient.deleteClient(req.params.id);
    res.json({ success: true, message: 'Client deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await softIAClient.listClients(page, limit);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/tags', async (req: Request, res: Response): Promise<void> => {
  try {
    const { tagId } = assignTagSchema.parse(req.body);
    await softIAClient.assignTag(req.params.id, tagId);
    res.json({ success: true, message: 'Tag assigned successfully' });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id/tags/:tagId', async (req: Request, res: Response): Promise<void> => {
  try {
    await softIAClient.removeTag(req.params.id, req.params.tagId);
    res.json({ success: true, message: 'Tag removed successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = updateStatusSchema.parse(req.body);
    const client = await softIAClient.updateClientStatus(req.params.id, status);
    res.json({ success: true, data: client });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;