export function fixUrl(url: string): string {
    // Trim whitespace and remove the trailing slash if present
    url = url.trim().replace(/\/$/, '');

    // Respect an explicit protocol — never override what the user typed.
    if (/^https?:\/\//i.test(url)) return url;

    // Split off any path so we can inspect just the host[:port].
    const authority = url.split('/')[0];
    const portMatch = authority.match(/:(\d+)$/);
    const port = portMatch ? portMatch[1] : null;
    const host = portMatch ? authority.slice(0, -portMatch[0].length) : authority;

    // Addresses that are virtually always served over plain HTTP:
    //  - private LAN IPs (192.168.x.x, 10.x.x.x, ...)
    //  - .local / .lan mDNS names
    //  - Tailscale MagicDNS hosts (*.ts.net), e.g. a Navidrome on :4533
    //  - anything with an explicit non-TLS port (a custom port like :4533 is a
    //    strong signal of a self-hosted HTTP service)
    const isPrivateIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
    const isLocalTld = /\.(local|lan)$/i.test(host);
    const isTailscale = /\.ts\.net$/i.test(host);
    const hasPlainPort = port !== null && port !== '443';

    const useHttp = isPrivateIp || isLocalTld || isTailscale || hasPlainPort;

    return (useHttp ? 'http://' : 'https://') + url;
}
