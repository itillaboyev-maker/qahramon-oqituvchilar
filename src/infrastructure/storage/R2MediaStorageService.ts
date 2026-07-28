export class R2MediaStorageService {
  constructor(
    private readonly bucket: R2Bucket,
    private readonly bucketName: string
  ) {}

  /**
   * Telegram CDN'dan rasmni yuklab oladi va R2 omboriga saqlaydi
   * recommendationId may be unknown at upload time (uploads can be performed
   * before recommendation creation). If missing, stored under a `pending` path.
   */
  async uploadFromTelegram(params: {
    botToken: string;
    fileId: string;
    recommendationId?: string | null;
    userId: string;
  }) {
    // 1. Telegram getFile API orqali fayl yo'lini olish
    const fileRes = await fetch(`https://api.telegram.org/bot${params.botToken}/getFile?file_id=${params.fileId}`);
    const fileData = await fileRes.json() as any;

    if (!fileData.ok || !fileData.result?.file_path) {
      throw new Error(`Telegram fayl yo'lini olib bo'lmadi: ${params.fileId}`);
    }

    // 2. Telegram CDN'dan fayl baytlarini yuklab olish
    const downloadUrl = `https://api.telegram.org/file/bot${params.botToken}/${fileData.result.file_path}`;
    const binaryRes = await fetch(downloadUrl);

    if (!binaryRes.ok) {
      throw new Error(`Telegram CDN'dan yuklab olishda xatolik: ${binaryRes.status}`);
    }

    const arrayBuffer = await binaryRes.arrayBuffer();

    // 3. SHA-256 Checksum hisoblash (Takroriy fayllarni aniqlash uchun)
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const checksumSha256 = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // 4. Deterministic R2 Object Key shakllantirish
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const mediaId = crypto.randomUUID();
    const mimeType = binaryRes.headers.get('content-type') || 'image/jpeg';
    const ext = mimeType.split('/')[1] || 'jpg';
    
    // Use provided recommendationId or fall back to a pending path per user
    const recSegment = params.recommendationId ? String(params.recommendationId) : `pending/${params.userId}`;
    const objectKey = `media/v1/${year}/${month}/recommendations/${recSegment}/original_${mediaId}.${ext}`;

    // 5. Cloudflare R2 ga yuklash
    const customMetadata: Record<string, string> = {
      uploadedBy: params.userId,
      checksumSha256,
    };

    if (params.recommendationId) {
      customMetadata.recommendationId = params.recommendationId;
    }

    await this.bucket.put(objectKey, arrayBuffer, {
      httpMetadata: { contentType: mimeType },
      customMetadata,
    });

    return {
      objectKey,
      bucketName: this.bucketName,
      mimeType,
      sizeBytes: arrayBuffer.byteLength,
      checksumSha256,
    };
  }
}