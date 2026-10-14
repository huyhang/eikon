import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { ownsViewer, readViewerParams, withoutViewer, withViewer } from './viewerParams';

interface ViewerLocationState {
  viewerPushed?: boolean;
}

/** Viewer open/close state for one collection, stored in the URL so Back closes it. */
export function useViewerState(contextKey: string, primary: boolean) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { imageId, context } = readViewerParams(params);
  const openId = imageId !== null && ownsViewer(context, contextKey, primary) ? imageId : null;

  const open = useCallback(
    (id: number) => setParams((p) => withViewer(p, id, contextKey), { state: { viewerPushed: true } }),
    [setParams, contextKey],
  );

  const show = useCallback(
    (id: number) =>
      setParams((p) => withViewer(p, id, contextKey), {
        replace: true,
        state: location.state as unknown,
        preventScrollReset: true,
      }),
    [setParams, contextKey, location.state],
  );

  const close = useCallback(() => {
    if ((location.state as ViewerLocationState | null)?.viewerPushed) navigate(-1);
    else setParams((p) => withoutViewer(p), { replace: true, preventScrollReset: true });
  }, [location.state, navigate, setParams]);

  return { openId, open, show, close };
}
