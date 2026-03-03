import axios from 'axios';
import https from 'https';

const DEFAULT_USER_AGENT = 'seoscan/1.0 (+https://github.com/seoscan/seoscan)';
const DEFAULT_TIMEOUT = 10000;
const DEFAULT_RETRIES = 2;

// Allow scanning sites with self-signed or locally-untrusted certs
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Creates a configured axios instance with redirect tracking.
 *
 * @param {object} options
 * @returns {{ client: import('axios').AxiosInstance, getRedirectChain: () => string[] }}
 */
function createClient(options = {}) {
  const redirectChain = [];

  const client = axios.create({
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
    maxRedirects: 10,
    httpsAgent,
    headers: {
      'User-Agent': options.userAgent ?? DEFAULT_USER_AGENT,
      'Accept-Encoding': 'gzip, deflate, br',
      ...(options.headers ?? {}),
    },
    decompress: true,
    validateStatus: () => true, // never throw on HTTP status
  });

  // Capture original content-encoding before axios strips it on decompress
  client.interceptors.response.use(
    (response) => {
      // Try multiple paths to find original content-encoding
      const rawRes = response.request?.res;
      const sock = response.request?.socket || response.request?.connection;
      const origCE = rawRes?.headers?.['content-encoding']
        || response.request?._header?.['content-encoding']
        || (rawRes?.rawHeaders ? rawRes.rawHeaders[rawRes.rawHeaders.findIndex(h => /^content-encoding$/i.test(h)) + 1] : null);
      if (origCE) {
        response.headers['x-original-content-encoding'] = origCE;
      }
      // axios follows redirects internally; capture each hop via the request chain
      const req = response.request;
      if (req && req.res && req.res.responseUrl) {
        const finalUrl = req.res.responseUrl;
        // Push intermediate URLs from the redirect path
        if (redirectChain.length === 0) {
          // We'll fill this from the history below if available
        }
      }
      return response;
    },
    (error) => Promise.reject(error),
  );

  return { client, redirectChain };
}

/**
 * Sleeps for the given number of milliseconds.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extracts the final URL from an axios response.
 *
 * @param {import('axios').AxiosResponse} response
 * @returns {string}
 */
function extractFinalUrl(response) {
  // axios attaches the underlying http/https request object to response.request
  const req = response.request;
  if (req && req.res && req.res.responseUrl) {
    return req.res.responseUrl;
  }
  if (req && req.responseURL) {
    return req.responseURL;
  }
  return response.config?.url ?? '';
}

/**
 * Builds the redirect chain by inspecting axios internals.
 * axios-followredirects stores the chain on response.request._redirectable or similar.
 *
 * @param {import('axios').AxiosResponse} response
 * @param {string} originalUrl
 * @returns {string[]}
 */
function buildRedirectChain(response, originalUrl) {
  const chain = [originalUrl];

  // axios (via follow-redirects under the hood) exposes the redirect chain
  // through response.request._redirectable?._redirectCount and
  // response.request._redirectable?._options?.href or similar paths.
  // We walk the internal request object to collect intermediate URLs.
  try {
    const req = response.request;
    if (req && typeof req._redirectable === 'object' && req._redirectable !== null) {
      const redirectable = req._redirectable;
      if (Array.isArray(redirectable._redirects)) {
        for (const redirect of redirectable._redirects) {
          const url = redirect.url ?? redirect.href ?? null;
          if (url && url !== chain[chain.length - 1]) {
            chain.push(url);
          }
        }
      }
    }

    const finalUrl = extractFinalUrl(response);
    if (finalUrl && finalUrl !== chain[chain.length - 1]) {
      chain.push(finalUrl);
    }
  } catch {
    // Swallow — redirect chain is best-effort
  }

  return chain;
}

/**
 * Attempts an HTTP GET with retry logic.
 * Retries only on network errors (ECONNRESET, ETIMEDOUT, etc.), not on HTTP error statuses.
 *
 * @param {string} url
 * @param {object} options
 * @param {import('axios').AxiosInstance} client
 * @param {number} retries
 * @returns {Promise<import('axios').AxiosResponse>}
 */
async function attemptRequest(url, options, client, retries) {
  const axiosOptions = {
    method: options.method ?? 'GET',
    url,
    ...(options.data !== undefined ? { data: options.data } : {}),
    ...(options.responseType ? { responseType: options.responseType } : {}),
  };

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await client.request(axiosOptions);
      return response;
    } catch (err) {
      // Only retry on network-level errors, not on axios errors wrapping HTTP statuses.
      // Since validateStatus returns true for all statuses, any thrown error here is
      // a network / timeout error.
      lastError = err;
      if (attempt < retries) {
        await sleep(300 * (attempt + 1));
      }
    }
  }
  throw lastError;
}

/**
 * Fetches a URL and returns structured response data including timing and redirect chain.
 *
 * @param {string} url
 * @param {object} [options={}]
 * @param {number} [options.timeout]
 * @param {string} [options.userAgent]
 * @param {object} [options.headers]
 * @param {string} [options.method]
 * @param {number} [options.retries]
 * @param {string} [options.responseType]
 * @returns {Promise<{
 *   data: any,
 *   status: number,
 *   headers: object,
 *   timing: { ttfb: number, total: number },
 *   url: string,
 *   redirectChain: string[]
 * }>}
 */
export async function fetch(url, options = {}) {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const { client } = createClient(options);

  const startTime = Date.now();
  let ttfb = 0;

  // Intercept to measure TTFB: capture time when first bytes of response arrive.
  // We use a request interceptor to stamp the start, and response interceptor to stamp TTFB.
  client.interceptors.request.use((config) => {
    config._seoscanStart = Date.now();
    return config;
  });

  client.interceptors.response.use((response) => {
    const reqStart = response.config._seoscanStart ?? startTime;
    ttfb = Date.now() - reqStart;
    return response;
  });

  const response = await attemptRequest(url, options, client, retries);

  const totalTime = Date.now() - startTime;

  const finalUrl = extractFinalUrl(response);
  const redirectChain = buildRedirectChain(response, url);

  return {
    data: response.data,
    status: response.status,
    headers: response.headers,
    timing: {
      ttfb,
      total: totalTime,
    },
    url: finalUrl || url,
    redirectChain,
  };
}

/**
 * Returns the raw axios response for the given URL.
 * Applies default User-Agent and timeout but no retry logic.
 *
 * @param {string} url
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export async function fetchRaw(url) {
  const response = await axios.get(url, {
    timeout: DEFAULT_TIMEOUT,
    maxRedirects: 10,
    httpsAgent,
    validateStatus: () => true,
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
    },
  });
  return response;
}

export default fetch;

// Aliases for check modules
export const fetchPage = fetch;
export async function fetchHead(url) {
  try {
    const response = await axios.head(url, {
      timeout: DEFAULT_TIMEOUT,
      maxRedirects: 5,
      httpsAgent,
      validateStatus: () => true,
      headers: { 'User-Agent': DEFAULT_USER_AGENT },
    });
    return { status: response.status, headers: response.headers, url };
  } catch {
    // Fall back to GET if HEAD not allowed
    return fetch(url);
  }
}
