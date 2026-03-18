import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url, redirect }) => {
  const callbackUrl = url.searchParams.get('callbackUrl');
  const safeRedirect =
    callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')
      ? callbackUrl
      : '/';

  return redirect(`/sign-out?redirect_url=${encodeURIComponent(safeRedirect)}`);
};

export const POST = GET;
