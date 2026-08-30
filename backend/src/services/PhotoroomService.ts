import axios from 'axios';
import FormData from 'form-data';

export class PhotoroomService {
  public static async removeBackground(
    imageBuffer: Buffer,
    apiKey?: string,
    backgroundColor: string = 'F8FAFC'
  ): Promise<Buffer> {
    const key = apiKey || process.env.PHOTOROOM_API_KEY;
    if (!key) {
      // If no API key configured, pass through original buffer
      return imageBuffer;
    }

    const form = new FormData();
    form.append('image_file', imageBuffer, { filename: 'upload.png' });
    form.append('format', 'png');
    form.append('shadow.mode', 'ai.soft');
    form.append('background.color', backgroundColor.replace('#', ''));

    const response = await axios.post('https://image-api.photoroom.com/v2/edit', form, {
      headers: {
        'x-api-key': key,
        ...form.getHeaders(),
      },
      responseType: 'arraybuffer',
    });

    return Buffer.from(response.data);
  }
}
