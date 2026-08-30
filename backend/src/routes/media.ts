import { Router } from 'express';
import { MediaDimensionAdapter } from '../services/MediaDimensionAdapter';

export const mediaRouter = Router();

// Image → multi-ratio renditions (4:5, 1:1, 9:16, 16:9)
mediaRouter.post('/adapt-dimensions', async (req, res) => {
  try {
    const { imageBase64, backgroundColorHex = '#F8FAFC' } = req.body as {
      imageBase64: string;
      backgroundColorHex?: string;
    };
    const buffer = Buffer.from(
      imageBase64.replace(/^data:image\/\w+;base64,/, ''),
      'base64'
    );
    const renditions = await MediaDimensionAdapter.adaptImage(buffer, backgroundColorHex);
    res.json({ success: true, renditions });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// Note: Photoroom background-removal endpoint is intentionally not registered here.
// Marketing OS accepts externally processed images directly. PhotoroomService.ts
// is retained in services/ for reference only.
