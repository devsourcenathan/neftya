import { createContext, useContext } from 'react';
import type {
  AssemblyStep,
  BillOfMaterials,
  CutListRow,
  NestingResult,
  ParsedFurnitureInput,
} from '@neftya/engine';
import type { Money } from '@neftya/units';
import type { ApiClient, FileClient } from './client.js';

/**
 * Les ressources de l'API, typées depuis les contrats — jamais retapées à la main.
 *
 * DealerOS portait 94 types réécrits entre son back et son front : un statut ajouté côté
 * serveur n'y cassait aucun build, il produisait un `undefined` à l'exécution.
 */

/**
 * L'état d'avancement, **déduit par le serveur** à chaque lecture.
 *
 * `needs_review` prime : un plan parti à l'atelier avec un avertissement reste un plan à
 * relire. Il n'y a pas d'état « optimisé » — le plan de découpe est recalculé à chaque
 * appel, il l'est donc toujours, et l'annoncer comme une étape franchie ne dirait rien.
 */
export type ProjectStatus = 'draft' | 'needs_review' | 'ready';

export interface ProjectResource {
  id: string;
  name: string;
  model: ParsedFurnitureInput;
  status: ProjectStatus;
  export_count: number;
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

/**
 * Un modèle, du catalogue ou de l'organisation.
 *
 * Les deux arrivent dans une seule liste, avec la même forme : `name` est **déjà résolu**
 * à la langue du jeton par le serveur, `name_translations` porte les traductions brutes
 * pour qui veut les modifier.
 *
 * @see docs/I18N.md §6
 */
export interface TemplateResource {
  id: string;
  source: 'catalogue' | 'organization';
  name: string;
  name_translations: Record<string, string>;
  model: ParsedFurnitureInput;
}

export const listTemplates = (api: ApiClient) =>
  api<TemplateResource[]>('/v1/templates');

export const createTemplate = (
  api: ApiClient,
  body: { name: Record<string, string>; model: unknown },
) => api<TemplateResource>('/v1/templates', { method: 'POST', body });

export const deleteTemplate = (api: ApiClient, id: string) =>
  api<void>(`/v1/templates/${id}`, { method: 'DELETE' });

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

/** Un nom de fichier sans accent ni espace : il traverse des systèmes qui n'aiment ni l'un ni l'autre. */
export function fileNameOf(projectName: string, suffix: string): string {
  const ascii = projectName
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/[^A-Za-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLowerCase();

  return `${ascii || 'projet'}${suffix}`;
}

export const downloadCutList = (files: FileClient, id: string, name: string) =>
  files(`/v1/projects/${id}/cut-list.csv`, fileNameOf(name, '.csv'));

export const downloadCutPlan = (files: FileClient, id: string, name: string) =>
  files(`/v1/projects/${id}/cut-plan.pdf`, fileNameOf(name, '-decoupe.pdf'));

export const downloadPlans = (files: FileClient, id: string, name: string) =>
  files(`/v1/projects/${id}/plans.pdf`, fileNameOf(name, '-plans.pdf'));

const ApiContext = createContext<ApiClient | null>(null);
const FileContext = createContext<FileClient | null>(null);

export const ApiProvider = ApiContext.Provider;
export const FileProvider = FileContext.Provider;

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi hors de ApiProvider.');
  return api;
}

export function useFiles(): FileClient {
  const files = useContext(FileContext);
  if (!files) throw new Error('useFiles hors de FileProvider.');
  return files;
}
