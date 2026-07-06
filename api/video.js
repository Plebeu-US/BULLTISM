export default function handler(_request, response) {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');

  response.end(
    JSON.stringify({
      webmUrl: process.env.BULLTISM_VIDEO_WEBM_URL || '',
      mp4Url: process.env.BULLTISM_VIDEO_MP4_URL || '',
      source: 'manual-env',
      updatedAt: new Date().toISOString(),
    }),
  );
}
