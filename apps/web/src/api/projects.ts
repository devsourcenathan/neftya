import { createContext, useContext } from 'react';
import type {
  AssemblyStep,
  BillOfMaterials,
  CutListRow,
  NestingResult,
  ParsedFurnitureInput,
} from '@neftya/engine';
import type { Money } from '@neftya/units';
import type { ApiClient } from './client.js';

/**
 * Les ressources de l'API, typées depuis les contrats — jamais retapées à la main.
 *
 * DealerOS portait 94 types réécrits entre son back et son front : un statut ajouté côté
 * serveur n'y cassait aucun build, il produisait un `undefined` à l'exécution.
 */

export interface ProjectResource {
  id: string;
  name: string;
  model: ParsedFurnitureInput;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SettingsResource {
  country: string | null;
  currency: string | null;
  unit_system: 'metric' | 'imperial';
}

export const listProjects = (api: ApiClient) => api<ProjectResource[]>('/v1/projects');

export const getProject = (api: ApiClient, id: string) =>
  api<ProjectResource>(`/v1/projects/${id}`);

export const createProject = (api: ApiClient, body: { name: string; model: unknown }) =>
  api<ProjectResource>('/v1/projects', { method: 'POST', body });

export const updateProject = (
  api: ApiClient,
  id: string,
  body: { name?: string; model?: unknown },
) => api<ProjectResource>(`/v1/projects/${id}`, { method: 'PATCH', body });

export const deleteProject = (api: ApiClient, id: string) =>
  api<void>(`/v1/projects/${id}`, { method: 'DELETE' });

export const getSettings = (api: ApiClient) => api<SettingsResource>('/v1/settings');

export const saveSettings = (api: ApiClient, body: Partial<SettingsResource>) =>
  api<SettingsResource>('/v1/settings', { method: 'PUT', body });

export interface QuotationLine {
  reference: string;
  unit: string;
  quantity: number;
  /** `null` tant que le prix n'a pas été saisi. Jamais un prix inventé. */
  unitPrice: Money | null;
  total: Money | null;
}

export interface ManufacturingResource {
  project: { id: string; name: string };
  cut_list: CutListRow[];
  nesting: NestingResult;
  bill: BillOfMaterials;
  assembly: AssemblyStep[];
  /** Absent quand le rôle n'autorise pas la lecture des coûts. */
  quotation?: {
    lines: QuotationLine[];
    total: Money | null;
    currency: string;
    missing: string[];
  };
}

export interface ExportResource {
  id: string;
  kind: 'pdf' | 'csv';
  storage_object_id: string | null;
  created_at: string;
}

export const getManufacturing = (api: ApiClient, id: string) =>
  api<ManufacturingResource>(`/v1/projects/${id}/manufacturing`);

export const createExport = (api: ApiClient, id: string) =>
  api<ExportResource>(`/v1/projects/${id}/exports`, { method: 'POST', body: {} });

export const listExports = (api: ApiClient, id: string) =>
  api<ExportResource[]>(`/v1/projects/${id}/exports`);

export const savePrice = (
  api: ApiClient,
  body: { reference: string; amountMinor: number; currency: string },
) => api<{ reference: string }>('/v1/prices', { method: 'PUT', body });

const ApiContext = createContext<ApiClient | null>(null);

export const ApiProvider = ApiContext.Provider;

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi hors de ApiProvider.');
  return api;
}
