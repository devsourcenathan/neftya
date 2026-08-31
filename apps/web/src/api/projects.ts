import { createContext, useContext } from 'react';
import type { ParsedFurnitureInput } from '@neftya/engine';
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

const ApiContext = createContext<ApiClient | null>(null);

export const ApiProvider = ApiContext.Provider;

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi hors de ApiProvider.');
  return api;
}
