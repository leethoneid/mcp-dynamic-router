/**
 * MCP Dynamic Router - Production Hardened HTTP Microservice Gateway
 * Implements strict host binding (127.0.0.1), API_KEY auth guard, and payload size defense.
 */
import http from 'node:http';
import { MCPDynamicRouter } from './router.js';
import { MCPRouterConfig } from './types.js';
export interface ServerOptions {
    maxBodyBytes?: number;
    apiKey?: string;
    config?: MCPRouterConfig;
}
export declare function createGatewayServer(options?: ServerOptions, routerInstance?: MCPDynamicRouter): http.Server;
