import { useCallback, useMemo } from 'react';
import { useServer } from './useServer';
import { useSubsonicParams } from './useSubsonicParams';
import qs from 'qs';

export type CoverOptions = {
    size?: number;
}

export function useCoverBuilder() {
    const { server } = useServer();
    const params = useSubsonicParams();

    // Precompute the auth/query string once so generating a URL per item (e.g. mapping
    // thousands of songs into a list) doesn't run qs.stringify for every call.
    const paramsStr = useMemo(() => qs.stringify(params), [params]);

    const generateUrl = useCallback((id: string, options?: CoverOptions) => `${server.url}/rest/getCoverArt?id=${encodeURIComponent(id)}&${paramsStr}${options?.size ? `&size=${options.size}` : ''}`, [server.url, paramsStr]);

    return { generateUrl, params };
}