import { getIcsForToken } from '@/lib/domain/calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  const ics = await getIcsForToken(token)
  if (!ics) return new Response('Not found', { status: 404 })
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="moments.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  })
}
