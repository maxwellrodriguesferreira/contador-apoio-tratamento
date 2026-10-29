import { APP_CONFIG } from '../../config';

let isCloudConnected = false;
let hasCheckedConnection = false;

function getFullUrl(endpoint: string): string {
  const base = APP_CONFIG.apiBaseUrl || '/api';
  if (base.startsWith('http://') || base.startsWith('https://')) {
    return `${base}${endpoint}`;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${base}${endpoint}`;
  }
  return `http://localhost:4000${base}${endpoint}`;
}

export async function checkCloudflareConnection(): Promise<boolean> {
  try {
    const res = await fetch(getFullUrl('/health'), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      isCloudConnected = Boolean(data?.database?.isConnected);
      hasCheckedConnection = true;
      if (isCloudConnected) {
        console.info(`✓ Conectado ao Cloudflare D1 (${data.database.mode || 'Edge'})`);
      }
      return isCloudConnected;
    }
  } catch {
    isCloudConnected = false;
    hasCheckedConnection = true;
  }
  return false;
}

export function isCloudConfigured(): boolean {
  if (!hasCheckedConnection) {
    checkCloudflareConnection();
  }
  return isCloudConnected;
}

export async function apiRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown
): Promise<T> {
  const url = getFullUrl(endpoint);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const storedSession = localStorage.getItem(APP_CONFIG.storageKeys.authSession);
    if (storedSession) {
      try {
        const user = JSON.parse(storedSession);
        if (user?.token) {
          headers['Authorization'] = `Bearer ${user.token}`;
        }
        if (user?.email) {
          headers['x-user-email'] = user.email;
        }
      } catch {
        // Ignora erro de parsing
      }
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errMsg = `Erro HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      errMsg = errJson.error || errJson.message || errMsg;
    } catch {
      // Falha ao ler JSON de erro
    }
    throw new Error(errMsg);
  }

  return response.json() as Promise<T>;
}

// Inicia verificação de conexão imediatamente
checkCloudflareConnection();
