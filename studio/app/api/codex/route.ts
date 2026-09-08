export async function GET() {
  return Response.json({
    available: false,
    message:
      'Codex subscription runs on your computer. Open this project at localhost:3001 to use it; this hosted app uses the OpenAI API.',
  });
}
