import type {
  CreatePackRequest,
  DeletePackResult,
  PackList,
  PackView,
  UpdatePackRequest,
} from '@tishuashua/shared';
import { apiRequest } from './http';

export function fetchPacks(token: string): Promise<PackList> {
  return apiRequest<PackList>('/packs', { method: 'GET', token });
}

export function fetchPack(token: string, packId: string): Promise<PackView> {
  return apiRequest<PackView>(`/packs/${packId}`, { method: 'GET', token });
}

export function createPack(token: string, input: CreatePackRequest): Promise<PackView> {
  return apiRequest<PackView>('/packs', { method: 'POST', token, data: input });
}

export function updatePack(
  token: string,
  packId: string,
  input: UpdatePackRequest,
): Promise<PackView> {
  return apiRequest<PackView>(`/packs/${packId}`, { method: 'PUT', token, data: input });
}

export function activatePack(token: string, packId: string): Promise<PackView> {
  return apiRequest<PackView>(`/packs/${packId}/activate`, { method: 'POST', token });
}

export function deletePack(token: string, packId: string): Promise<DeletePackResult> {
  return apiRequest<DeletePackResult>(`/packs/${packId}`, { method: 'DELETE', token });
}
